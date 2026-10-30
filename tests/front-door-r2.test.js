/**
 * E20-R2 regressions, one per review finding. `http.request` and `https.request`
 * are replaced in this file, so https, redirects and failures run with no socket.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { classify, classifyRegistered, cookieNames, cspEvidence, evidenceOf, pageExcerpt, scrub, scrubMisses, signatureMatches, traitsOf, SOFT_MAX_CHARS } from "../bench/front-door/classify.mjs";
import { exclusionFor, readExclusions, readList, robotsVerdict, visit } from "../bench/front-door/run.mjs";
import { caaTree, dmarcReading, mergeCohorts, normalizeHost, readDomain, readHostList, readRemovals, runPass, unmatchedHosts, V2_LIMITS } from "../bench/front-door/replicate.mjs";
import { orgDomain, publicSuffix, PSL_VERSION, pslSha256 } from "../bench/front-door/psl.mjs";
import { clusterDiff, coverageBounds, decide, standardizedDiff } from "../bench/front-door/analyze-r.mjs";
import { pilotReport, stopRules } from "../bench/front-door/pilot-report.mjs";
import { drawSample, pruneExcerpt, stratumOf } from "../bench/front-door/validation-sample.mjs";

const realHttp = http.request, realHttps = https.request;
let web = {};
let log = [];

const fake = (url, opts, cb) => {
  const req = new EventEmitter();
  req.destroy = (e) => { if (e) req.emit("error", e); };
  req.end = () => {
    const u = new URL(url);
    log.push(u.href);
    const r = web[u.href] ?? web[u.origin + u.pathname] ?? { status: 404, body: "" };
    setImmediate(() => {
      if (r.err) return req.emit("error", Object.assign(new Error(r.err), { code: r.err }));
      const res = Readable.from([Buffer.from(r.body ?? "")]);
      res.statusCode = r.status;
      res.headers = r.headers || {};
      res.socket = { getPeerCertificate: () => ({}), getProtocol: () => "TLSv1.3" };
      cb(res);
    });
  };
  return req;
};
beforeAll(() => { http.request = fake; https.request = fake; });
afterAll(() => { http.request = realHttp; https.request = realHttps; });
beforeEach(() => { log = []; });

const ROBOTS = { status: 200, body: "User-agent: *\nAllow: /\n", headers: { "content-type": "text/plain" } };
const HOME = { status: 200, body: "<html><title>t</title>hello</html>", headers: { "content-type": "text/html" } };
const look = async (h) => { if (/dead/.test(h)) throw new Error("ENOTFOUND"); return [{ address: "93.184.216.34", family: 4 }]; };
const exclude = readExclusions("gov government\nbad.org adult\n");
const go = (w, host = "a.org", opts = {}) => { web = w; return visit({ host, cohorts: {} }, { strict: true, exclude, lookup: look, budgetMs: 15_000, hardCapMs: 30_000, ...opts }); };

describe("redirects and origins", () => {
  it("B1: stops a robots.txt redirect into an excluded host before it reaches it", async () => {
    const r = await go({ "https://a.org/robots.txt": { status: 301, headers: { location: "https://ministry.gov/robots.txt" } }, "https://ministry.gov/robots.txt": ROBOTS, "https://a.org/": HOME });
    expect(r).toMatchObject({ status: "excluded", reason: "exclusion_redirect" });
    expect(log.some((u) => u.includes("ministry"))).toBe(false);
  });
  it("B2: a trailing dot does not get past the exclusion list", async () => {
    expect(exclusionFor("ministry.gov.", exclude)).toBe("government");
    expect(exclusionFor("www.bad.org..", exclude)).toBe("adult");
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 302, headers: { location: "https://ministry.gov./" } } });
    expect(r).toMatchObject({ status: "excluded", reason: "exclusion_redirect" });
    expect(log.some((u) => u.includes("ministry"))).toBe(false);
  });
  it("B9: no www retry after the listed origin answered and a redirect's target is dead", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 301, headers: { location: "https://dead.net/" } }, "https://www.a.org/robots.txt": ROBOTS, "https://www.a.org/": HOME });
    expect(r.status).toBe("error");
    expect(log.some((u) => u.includes("www.a.org"))).toBe(false);
  });
  it("B9: the www retry still runs when the listed name does not resolve", async () => {
    const r = await go({ "https://www.dead.org/robots.txt": ROBOTS }, "dead.org");
    expect(r.error).toBe("not_found");
    web = { "https://www.a.org/robots.txt": ROBOTS, "https://www.a.org/": HOME };
    const lookup = async (h) => { if (h === "a.org") throw new Error("ENOTFOUND"); return [{ address: "93.184.216.34", family: 4 }]; };
    const ok = await visit({ host: "a.org", cohorts: {} }, { strict: true, exclude, lookup });
    expect(ok.status).toBe("ok");
  });
  it("B9: no http retry after a reset, which may be a refusal", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { err: "ECONNRESET" }, "http://a.org/robots.txt": ROBOTS, "http://a.org/": HOME });
    expect(r).toMatchObject({ status: "error", error: "unreachable" });
    expect(log.some((u) => u.startsWith("http://"))).toBe(false);
    const before = await go({ "https://a.org/robots.txt": { err: "ECONNRESET" }, "http://a.org/robots.txt": ROBOTS, "http://a.org/": HOME });
    expect(before.status).toBe("error");
  });
  it("B9: no http retry after a site answered and its redirect target refused the connection", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 301, headers: { location: "https://b.net/" } }, "https://b.net/robots.txt": { err: "ECONNREFUSED" }, "http://a.org/robots.txt": ROBOTS, "http://a.org/": HOME });
    expect(r.status).toBe("error");
    expect(log.some((u) => u.startsWith("http://"))).toBe(false);
  });
  it("B9: http still runs when nothing answers on https, and the record says why", async () => {
    const r = await go({ "https://a.org/robots.txt": { err: "ECONNREFUSED" }, "http://a.org/robots.txt": ROBOTS, "http://a.org/": HOME });
    expect(r.status).toBe("ok");
    expect(r.httpsFailed).toMatchObject({ error: "unreachable" });
  });
  it("B10: a redirect back to an origin whose robots.txt failed stops", async () => {
    const r = await go({ "https://a.org/robots.txt": { err: "ECONNREFUSED" }, "http://a.org/robots.txt": ROBOTS, "http://a.org/": { status: 301, headers: { location: "https://a.org/" } }, "https://a.org/": HOME });
    expect(r).toMatchObject({ status: "excluded", reason: "robots_unavailable" });
    expect(log).not.toContain("https://a.org/");
  });
  it("S6: stops a redirect to a literal IPv6 address", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 302, headers: { location: "https://[2606:4700:4700::1111]/" } } });
    expect(r).toMatchObject({ status: "excluded", reason: "ipv6_literal" });
    expect(log.some((u) => u.includes("2606"))).toBe(false);
  });
  it("S12: a bad certificate stays the outcome when there is no port 80", async () => {
    const cert = { err: "CERT_HAS_EXPIRED" };
    const r = await go({ "https://a.org/robots.txt": cert, "http://a.org/robots.txt": { err: "ECONNREFUSED" } });
    expect(r).toMatchObject({ status: "error", error: "tls_invalid", tlsReason: "CERT_HAS_EXPIRED" });
  });
  it("S12: a bad certificate with a working http keeps its reason on the record", async () => {
    const r = await go({ "https://a.org/robots.txt": { err: "CERT_HAS_EXPIRED" }, "http://a.org/robots.txt": ROBOTS, "http://a.org/": HOME });
    expect(r.status).toBe("ok");
    expect(r.httpsFailed).toEqual({ error: "tls_invalid", tlsReason: "CERT_HAS_EXPIRED" });
  });
  it("stops at a hop into an origin that opted out by path rules", async () => {
    const r = await go({ "https://a.org/robots.txt": { status: 200, body: "User-agent: Penthera-Research\nDisallow: /private\n" }, "https://a.org/": { status: 302, headers: { location: "/private/x" } } });
    expect(r).toMatchObject({ status: "excluded", reason: "robots_disallow_path" });
  });
  it("reads a 2xx robots.txt that is not a 200 as rules", async () => {
    const r = await go({ "https://a.org/robots.txt": { status: 203, body: "User-agent: Penthera-Research\nDisallow: /\n" }, "https://a.org/": HOME });
    expect(r.status).toBe("opted_out");
    expect(log).not.toContain("https://a.org/");
  });
  it("counts requests, redirects and bytes per site", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 301, headers: { location: "/home" } }, "https://a.org/home": HOME });
    expect(r.counters.requests).toBe(4);
    expect(r.counters.redirects).toBe(1);
    expect(r.counters.bytes).toBe(ROBOTS.body.length + HOME.body.length);
  });
});

describe("robots.txt reading", () => {
  it("B8: a compressed robots.txt can't be read, so the visit stops", async () => {
    const r = await go({ "https://a.org/robots.txt": { status: 200, headers: { "content-encoding": "gzip" }, body: gzipSync("User-agent: Penthera-Research\nDisallow: /\n") }, "https://a.org/": HOME });
    expect(r).toMatchObject({ status: "excluded", reason: "robots_unavailable" });
    expect(r.robots[0]).toMatchObject({ encoded: true, access: "disallow" });
    expect(log).not.toContain("https://a.org/");
  });
  it("B8: an opt-out past 64 KB is found", async () => {
    const r = await go({ "https://a.org/robots.txt": { status: 200, body: `${"# pad\n".repeat(12_000)}User-agent: Penthera-Research\nDisallow: /\n` }, "https://a.org/": HOME });
    expect(r.status).toBe("opted_out");
  });
  it("B8: a file past the cap counts as unreadable", async () => {
    const r = await go({ "https://a.org/robots.txt": { status: 200, body: "# pad\n".repeat(100_000) }, "https://a.org/": HOME });
    expect(r).toMatchObject({ status: "excluded", reason: "robots_unavailable" });
    expect(r.robots[0].truncated).toBe(true);
  });
  it("B11: rules match on path plus search, for a redirect the site chose", async () => {
    expect(robotsVerdict("User-agent: *\nDisallow: /*?\n", "/?sid=1")).toBe("disallowed");
    const r = await go({ "https://a.org/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /*?\n" }, "https://a.org/": { status: 302, headers: { location: "/?sid=SECRET" } } });
    expect(r).toMatchObject({ status: "excluded", reason: "robots_disallow_path" });
    expect(log.some((u) => u.includes("sid="))).toBe(false);
  });
  it("B11: the study page words it as the code behaves", () => {
    const page = readFileSync(join(import.meta.dirname, "..", "site", "pages", "research-e20.md"), "utf8");
    expect(page).toContain("adds no query string of its own, and follows a site's redirect as given");
    expect(page).not.toMatch(/never IP addresses|never committed or shared|passive/);
    expect(page).toContain("178.104.243.225");
  });
});

describe("what reaches the disk", () => {
  it("B4: check evidence loses query strings, tokens and long numbers, end to end", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 200, headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'; report-uri https://o1.ingest.sentry.io/api/1/security/?sentry_key=abc123secret&x=4915123456789", "set-cookie": ["sessionvalueabc123; Path=/; HttpOnly", "sid=VALUE; Path=/"] }, body: "<html></html>" } });
    const text = JSON.stringify(r.checks);
    expect(text).not.toMatch(/abc123secret|4915123456789|sessionvalue/);
  });
  it("S2: every form in the review's list comes out, and the detector agrees", () => {
    for (const dirty of ["Your IP: 2.31.141.178.", "(2.31.141.178)", "ip=2.31.141.178&x=1", "IP:2a01:4f8:c17:1234::1", "client:2a01:4f8:c17:1234::1 blocked", "addr=2a01:4f8:c17:1234::1", "Your IP: 2a01:4f8:c17:1234::1.", "[2a01:4f8::1]:443", "::ffff:2.31.141.178", "2A01:04F8:0C17:1234:0000:0000:0000:0001", "2a01%3A4f8%3A%3A1", "x_2a01:4f8::1",
      "john@example.com", "josé@example.com", "müller@example.de", "john&#64;example.com", "john%40example.com", "john [at] example.com", "john\\u0040example.com", '<a data-cfemail="1b7174737535">',
      "mailto:john.doe@sub.example.co.uk?subject=Hi", 'href="?token=abc123"', "/é/x?token=abc123", "https://x.nl/reset?t=abc&u=john@x.nl", "https://x.nl/#access_token=eyJhbGciOi.abc.def", "https://x.nl/reset/8f14e45fceea167a5a36dedd4bea2543", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc", "call +31 6 12 34 56 78 now"]) {
      const clean = scrub(dirty);
      expect(Object.values(scrubMisses(clean)).every((v) => v === 0), `${dirty} -> ${clean}`).toBe(true);
      expect(clean, dirty).not.toMatch(/2\.31\.141|2a01|john|josé|müller|abc123|SECRET|8f14|eyJ|12 34 56|1b7174/i);
    }
    expect(scrub("2024-10-30 12:30:45")).toBe("2024-10-30 12:30:45");
  });
  it("S2: the detector catches each kind on its own, sharing no pattern with the scrub", () => {
    expect(scrubMisses("you are 203.0.113.7").ipv4).toBe(1);
    expect(scrubMisses("addr=2a01:4f8::1").ipv6).toBe(1);
    expect(scrubMisses("mail jan@example.nl").email).toBe(1);
    expect(scrubMisses("jan%40example.nl").email).toBe(1);
    expect(scrubMisses("/a?token=x").query).toBe(1);
    expect(scrubMisses("/#access_token=x").fragment).toBe(1);
    expect(scrubMisses("eyJhbGci.eyJzdWIi.sig").jwt).toBe(1);
    expect(scrubMisses("8f14e45fceea167a5a36dedd4bea2543").longHex).toBe(1);
    expect(scrubMisses("493012345678").longNumber).toBe(1);
    expect(Object.values(scrubMisses("<redacted>@example.com <ip> ?<query>")).every((v) => v === 0)).toBe(true);
  });
  it("S2: a secret at the cut is scrubbed, because scrubbing comes first", () => {
    const e = evidenceOf({ status: 500, headers: {}, body: `${"x ".repeat(2043)} john.doe@example.com rest` });
    expect(e.excerpt).not.toContain("john");
  });
  it("item 8: scrubs a realistic error page and interstitial, with tokens and identifiers", () => {
    const block = `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body><div id="cf-error-details">Sorry, you have been blocked. Your IP: 178.104.243.225 Ray ID: 8f14e45fceea1672
      <form><input type="hidden" name="csrf_token" value="Xk29slQ0vbT7dd"><input name="session" value="s%3Aabc123def456"></form>
      <script>window._cf_chl_opt={cRay:'8f14e45fceea1672',cH:'eVHGQ3ZX9f2mLq8Tn0pRs7Wb1Yc4Ud6K',cUPMDTk:"/?__cf_chl_tk=aZ09-_x"};</script>
      <a href="/cdn-cgi/l/email-protection#1b7174737535">mail</a> user 123e4567-e89b-12d3-a456-426614174000 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln</div></body></html>`;
    const e = evidenceOf({ status: 403, headers: {}, body: block });
    expect(e.excerpt).toContain("Sorry, you have been blocked");
    expect(e.excerpt).not.toMatch(/178\.104|8f14e45f|Xk29|abc123def|eVHGQ3|aZ09|1b7174|123e4567|eyJ/);
    expect(Object.values(scrubMisses(e.excerpt)).every((v) => v === 0)).toBe(true);
  });
  it("item 8: tells a page, a JS challenge, a soft block and an interstitial apart", () => {
    const js = pageExcerpt('<html><title>Just a moment...</title><noscript>Enable JavaScript and cookies to continue</noscript><script src="/x.js"></script></html>');
    expect(js).toMatchObject({ title: "Just a moment...", noscript: "Enable JavaScript and cookies to continue", scripts: 1, hard: ["cloudflare"] });
    const soft = pageExcerpt("<html><body><h1>Unusual traffic</h1><p>We could not verify you.</p><form action=/x></form></body></html>");
    expect(soft).toMatchObject({ forms: 1, links: 0 });
    expect(soft.text).toContain("Unusual traffic");
    const wall = pageExcerpt('<html><head><meta http-equiv="refresh" content="1;url=/x"></head><body>Checking your browser</body></html>');
    expect(wall.metaRefresh).toBe(true);
    const page = pageExcerpt(`<html><body>${"<p>content words</p>".repeat(500)}<a href=/a>x</a></body></html>`);
    expect(page.text.length).toBe(4096);
    expect(page.links).toBe(1);
  });
  it("S4: keeps a cookie name only when = comes before the first ;", () => {
    expect(cookieNames({ "set-cookie": ["tokenVALUE123; Path=/", "a=1", "b; c=2"] })).toEqual(["a"]);
  });
  it("S5: drops an unclosed script and an unclosed comment", () => {
    expect(pageExcerpt("<html><body>hi<script>var secret='k3y'; fetch('/x')").text).toBe("hi");
    expect(pageExcerpt("<body>hi<!-- secret").text).toBe("hi");
  });
  it("S3: long hostile input stays quick", () => {
    const start = performance.now();
    for (const body of ["a1-_".repeat(400_000), "<".repeat(1_000_000), "<!--".repeat(300_000), "<script ".repeat(200_000), "1 ".repeat(800_000), `${"a".repeat(1_000_000)}@`]) {
      pageExcerpt(body);
      scrub(body);
      traitsOf(body);
      classify({ status: 403, body });
    }
    traitsOf("<a ".repeat(400_000));
    expect(performance.now() - start).toBeLessThan(3000);
  });
  it("stops the run on a miss, and scans the DMARC record and cookie names", () => {
    const rec = { status: "ok", httpStatus: 200, checks: [], counters: { requests: 3, bytes: 1, redirects: 0 }, evidence: { class: { label: "candidate-page", rule: "status" }, classRegistered: { label: "page" }, cookieNames: ["8f14e45fceea167a5a36dedd4bea2543"], others: [], pageExcerpt: { title: "t", text: "x" }, values: {} }, dns: { listed: { dmarcRecord: "v=DMARC1; rua=mailto:jan@example.nl" } } };
    const r = pilotReport([rec]);
    expect(r.scrubMisses).toMatchObject({ longHex: 1, email: 1 });
    expect(stopRules(r)).toContain("a privacy scrub missed something");
    expect(stopRules(pilotReport([{ ...rec, evidence: { ...rec.evidence, cookieNames: [] }, dns: { listed: { dmarcRecord: "" } } }]))).toEqual([]);
  });
});

describe("the classifier", () => {
  it("S1: a long 2xx page may quote any block or error line", () => {
    const pad = "z ".repeat(SOFT_MAX_CHARS);
    for (const text of ["Request blocked by the court", "Sorry, you have been blocked", "<H1>Access Denied</H1>", "The request could not be satisfied"]) {
      expect(classify({ status: 200, body: pad + text }).label, text).toBe("candidate-page");
    }
    expect(classify({ status: 200, body: "Sorry, you have been blocked" }).label).toBe("block");
    expect(classify({ status: 403, body: `Sorry, you have been blocked${pad}` }).label).toBe("block");
  });
  it("stores every signature as a boolean, so a label can be replayed", () => {
    const s = signatureMatches("<title>Just a moment...</title> Request blocked");
    expect(s.hardChallenge.cloudflare).toBe(true);
    expect(s.registeredChallenge.cloudflare).toBe(true);
    expect(s.block.cloudfront).toBe(true);
    expect(s.block.akamai).toBe(false);
    expect(s.registeredBlock.cloudfront).toBe(false);
    expect(signatureMatches("error code: 1010").cloudflareCode).toBe("1010");
    expect(evidenceOf({ status: 403, headers: {}, body: "x" }).signatures.softChallenge).toBeDefined();
  });
  it("keeps the registered labels by their old names", () => {
    expect(classifyRegistered({ status: 200, body: "hi" }).label).toBe("page");
    expect(classifyRegistered({ status: 404, body: "" }).label).toBe("origin-error");
  });
  it("reads the whole CSP, past the grader's 160 characters", () => {
    const long = `upgrade-insecure-requests; report-uri /r${"x".repeat(300)}; script-src 'self' 'nonce-abc'`;
    expect(cspEvidence({ "Content-Security-Policy": long })).toMatchObject({ present: true, controlsScripts: true, openScripts: false });
    expect(cspEvidence({ "content-security-policy": "frame-ancestors 'self'" })).toMatchObject({ controlsScripts: false, directives: ["frame-ancestors"] });
    expect(cspEvidence({ "content-security-policy": "default-src * 'unsafe-inline'" })).toMatchObject({ controlsScripts: true, openScripts: true });
    expect(cspEvidence({ "content-security-policy": "script-src 'unsafe-inline' 'sha256-abc'" }).openScripts).toBe(false);
    expect(cspEvidence({})).toMatchObject({ present: false, controlsScripts: false });
    expect(JSON.stringify(cspEvidence({ "content-security-policy": "default-src https://secret.example.com" }))).not.toContain("secret");
  });
});

describe("hosts and lists", () => {
  it("item 1: reads the pinned list, private suffixes and wildcards included", () => {
    expect(PSL_VERSION.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(pslSha256()).toMatch(/^[0-9a-f]{64}$/);
    expect(orgDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(orgDomain("user.github.io")).toBe("user.github.io");
    expect(orgDomain("a.b.user.github.io")).toBe("user.github.io");
    expect(orgDomain("foo.vercel.app")).toBe("foo.vercel.app");
    expect(orgDomain("github.io")).toBe("github.io");
    expect(publicSuffix("a.b.kobe.jp")).toBe("b.kobe.jp");
    expect(orgDomain("www.city.kobe.jp")).toBe("city.kobe.jp");
    expect(orgDomain("x.y.ck")).toBe("x.y.ck");
    expect(orgDomain("www.ck")).toBe("www.ck");
    expect(orgDomain("example.com.")).toBe("example.com");
    expect(orgDomain("127.0.0.1")).toBe("127.0.0.1");
    expect(orgDomain("[2606:4700::1]")).toBe("2606:4700::1");
    expect(orgDomain("EXAMPLE.unknowntld")).toBe("example.unknowntld");
  });
  it("B3: reads a homepage-only line as a URL, and reports an entry that matches no row", () => {
    const entries = readHostList("clinic.example.nl\nhttps://www.hospital.example.nl/?utm_source=yc\n");
    expect([...entries]).toEqual(["clinic.example.nl", "hospital.example.nl"]);
    const rows = mergeCohorts({ T1k: [{ host: "www.clinic.example.nl", rank: 1, group: "x" }] });
    expect(unmatchedHosts(entries, rows)).toEqual(["hospital.example.nl"]);
  });
  it("B7: takes a URL, a trailing dot and www, and covers the apex", () => {
    for (const line of ["https://example.com/", "example.com.", "www.example.com", "EXAMPLE.com"]) {
      const m = readRemovals(line);
      expect(exclusionFor("example.com", m), line).toBe("removed");
      expect(exclusionFor("www.example.com", m), line).toBe("removed");
    }
  });
  it("B7: throws on a line it can't read, so it never silently does nothing", () => {
    expect(() => readRemovals("example.com removed")).toThrow(/one host per line/);
    expect(() => readRemovals("not a host")).toThrow();
    expect(() => normalizeHost("localhost")).toThrow(/not a host name/);
    expect(readRemovals("# only a comment\n\n").size).toBe(0);
  });
  it("stores listed and final organization apart, and classes the redirect", async () => {
    web = { "http://a.selftest.example.com:9/robots.txt": ROBOTS };
    const lists = readList("1,example.com\n", "tranco");
    expect(lists[0].host).toBe("example.com");
    const out = mkdtempSync(join(tmpdir(), "e20r2-"));
    const stub = () => Promise.reject(Object.assign(new Error("x"), { code: "ENODATA" }));
    web = { "http://www.co.uk:9/robots.txt": ROBOTS, "http://www.co.uk:9/": { status: 301, headers: { location: "http://other.example.net:9/" } }, "http://other.example.net:9/robots.txt": ROBOTS, "http://other.example.net:9/": HOME };
    const { records } = await runPass(mergeCohorts({ T1k: [{ host: "www.co.uk", rank: 1, group: "uk" }] }), { pass: 2, out, loopbackPort: 9, delayMs: 0, dns: { mx: stub, ns: stub, resolveTxt: stub, resolveCaa: stub } });
    expect(records[0]).toMatchObject({ listedHost: "www.co.uk", finalHost: "other.example.net", finalOrg: "example.net", redirectClass: "other-org" });
    expect(records[0].dns.final.domain).toBe("example.net");
  });
});

describe("mail and CAA readings", () => {
  const read = (t) => dmarcReading([t]);
  it("item 3: separates declared from enforcing, and pct=0 never enforces", () => {
    expect(read("v=DMARC1; p=reject")).toMatchObject({ valid: true, declared: true, enforcing: true, reject: true, partial: false });
    expect(read("v=DMARC1; p=quarantine")).toMatchObject({ declared: true, enforcing: true, reject: false });
    expect(read("v=DMARC1; p=reject; pct=0")).toMatchObject({ declared: true, enforcing: false, reject: false });
    expect(read("v=DMARC1; p=quarantine; pct=50")).toMatchObject({ enforcing: true, partial: true, pct: 50 });
    expect(read("v=DMARC1; p=none")).toMatchObject({ valid: true, declared: false, enforcing: false });
    expect(read("v=DMARC1; p=bogus")).toMatchObject({ valid: false, declared: false });
    expect(read("v=DMARC1; p=reject; sp=none")).toMatchObject({ enforcing: true, spNone: true });
    expect(dmarcReading(["v=DMARC1; p=reject", "v=DMARC1; p=none"])).toMatchObject({ valid: false, enforcing: false, records: 2 });
  });
  it("item 3: a subdomain inherits from the organization, under sp when it is set", async () => {
    expect(dmarcReading(["v=DMARC1; p=reject; sp=none"], { inherited: true })).toMatchObject({ policy: "none", enforcing: false, declared: true });
    const none = Object.assign(new Error("x"), { code: "ENODATA" });
    const txt = async (n) => { if (n === "_dmarc.example.com") return [["v=DMARC1; p=reject"]]; if (n === "example.com") return [["v=spf1 -all"]]; throw none; };
    const d = await readDomain("shop.example.com", { resolveTxt: txt, resolveCaa: () => Promise.reject(none), mx: () => Promise.reject(none), ns: async () => ["a.ns.cloudflare.com."] });
    expect(d.dmarcReading).toMatchObject({ inherited: true, enforcing: true });
    const own = async (n) => { if (n === "_dmarc.shop.example.com") return [["v=DMARC1; p=none"]]; return txt(n); };
    expect((await readDomain("shop.example.com", { resolveTxt: own, resolveCaa: () => Promise.reject(none), mx: () => Promise.reject(none), ns: async () => ["a.ns.cloudflare.com."] })).dmarcReading).toMatchObject({ inherited: false, enforcing: false });
  });
  it("item 4: climbs CAA to the parent tree, TLD included, and stops at a failure", async () => {
    const asked = [];
    const nodata = Object.assign(new Error("x"), { code: "ENODATA" });
    const res = async (n) => { asked.push(n); if (n === "example.co.uk") return [{ issue: "letsencrypt.org" }]; throw nodata; };
    expect(await caaTree("a.b.example.co.uk", res)).toMatchObject({ found: true, at: "example.co.uk", inherited: true, issuers: ["letsencrypt.org"] });
    expect(asked).toEqual(["a.b.example.co.uk", "b.example.co.uk", "example.co.uk"]);
    asked.length = 0;
    expect(await caaTree("a.example.com", async (n) => { asked.push(n); throw nodata; })).toEqual({ found: false });
    expect(asked).toEqual(["a.example.com", "example.com", "com"]);
    expect(await caaTree("a.example.com", async () => { throw Object.assign(new Error("x"), { code: "ESERVFAIL" }); })).toMatchObject({ found: null, outcome: "resolver-failure:ESERVFAIL" });
  });
});

describe("the analysis", () => {
  const mk = (host, p, extra = {}) => ({ host, status: "ok", cohorts: { T1k: {} }, checks: p === null ? [] : [{ id: "csp", weight: 14, passed: p }], ...extra });
  it("S10: skips a draw with nothing judged, and an empty side is inconclusive", () => {
    const a = Array.from({ length: 30 }, (_, i) => mk(`a${i}.example.com`, i % 2 === 0));
    const r = clusterDiff(a, [mk("b0.example.net", true), mk("b1.example.org", null), mk("b2.example.io", null)], "csp", { resamples: 500 });
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.ci.every(Number.isFinite)).toBe(true);
    expect(decide(clusterDiff([], [mk("a.example.com", true)], "csp", { resamples: 50 }).ci, 1)).toBe("inconclusive");
    expect(decide([NaN, 1], 1)).toBe("inconclusive");
  });
  it("bounds a whole list, with ungraded sites either way", () => {
    const a = [mk("a.example.com", true), mk("b.example.com", null)], b = [mk("c.example.com", false), mk("d.example.com", null)];
    expect(coverageBounds(a, b, "csp")).toEqual({ low: -1, high: 0, coverageA: 0.5, coverageB: 0.5 });
  });
  it("standardizes to the pooled edge mix on strata above the floor, and names what it dropped", () => {
    const rows = (prefix, pa, edge, n) => Array.from({ length: n }, (_, i) => mk(`${prefix}${i}.${edge}${prefix}.example.com`.replace(/\./g, "-") + ".com", i < pa, { platform: { edge } }));
    const a = [...rows("a", 10, "cloudflare", 20), ...rows("c", 5, "akamai", 5)], b = [...rows("b", 20, "cloudflare", 20), ...rows("d", 5, "akamai", 5)];
    const r = standardizedDiff(a, b, "csp", { resamples: 200 });
    expect(r.supported).toEqual(["cloudflare"]);
    expect(r.dropped).toEqual(["akamai"]);
    expect(r.diff).toBeCloseTo(0.5);
  });
});

describe("the validation draw", () => {
  const rec = (i, label, rule = "status") => ({ host: `s${i}.example.com`, status: "ok", evidence: { class: { label, rule }, pageExcerpt: { title: "t", text: "hello", noscript: "n", scripts: 1 } } });
  it("draws fixed strata with weights", () => {
    const records = Array.from({ length: 400 }, (_, i) => rec(i, "candidate-page"));
    records.push(rec(1000, "block", "unrecognized-403"), rec(1001, "block", "body"));
    const a = drawSample(records);
    expect(a.filter((s) => s.stratum === "candidate-page")).toHaveLength(150);
    expect(a[0].weight).toBeCloseTo(400 / 150);
    expect(drawSample([...records].reverse())).toEqual(a);
    expect(stratumOf(records.at(-1))).toBe("block-signature");
  });
  it("deletes the text of an unsampled page and keeps its shape", () => {
    const r = rec(1, "candidate-page");
    expect(pruneExcerpt(r, new Set())).toMatchObject({ evidence: { pageExcerpt: { scripts: 1 } } });
    expect(pruneExcerpt(r, new Set()).evidence.pageExcerpt.text).toBeUndefined();
    expect(pruneExcerpt(r, new Set([r.host])).evidence.pageExcerpt.text).toBe("hello");
  });
});

describe("limits", () => {
  it("gives pass 2 its registered time per site", () => {
    expect(V2_LIMITS).toEqual({ siteBudgetMs: 15_000, siteHardCapMs: 30_000 });
  });
  it("keeps the vendored list out of the npm package", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
    expect(pkg.files.some((f) => f.startsWith("bench"))).toBe(false);
  });
});
