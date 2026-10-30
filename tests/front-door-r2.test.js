/**
 * E20-R2 regressions, one per review finding. `http.request` and `https.request`
 * are replaced in this file, so https, redirects and failures run with no socket.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { classify, classifyRegistered, cookieNames, cspEvidence, evidenceOf, pageExcerpt, scrub, scrubMisses, signatureMatches, traitsOf, SOFT_MAX_CHARS } from "../bench/front-door/classify.mjs";
import { authorize, exclusionFor, globMatch, percentForm, platformOf, readExclusions, robotsBinary, robotsVerdict, visit } from "../bench/front-door/run.mjs";
import { optedOut } from "../api/_lib/page.mjs";
import { caaTree, codeFiles, codeHash, dmarcReading, mergeCohorts, normalizeHost, readDomain, readHostList, readRemovals, runPass, unmatchedHosts, V2_LIMITS, visitInWorker } from "../bench/front-door/replicate.mjs";
import { orgDomain, publicSuffix, PSL_VERSION, pslSha256, siteKey, siteOrg } from "../bench/front-door/psl.mjs";
import { claims, clusterDiff, combine, coverageBounds, decide, diffClaim, dnsCoverage, e20Index, fisherExact, intervalOutcomes, isEligible, standardizedDiff, traitsByCohort } from "../bench/front-door/analyze-r.mjs";
import { pilotReport, stopRules } from "../bench/front-door/pilot-report.mjs";
import { blindSheet, drawSample, parseLabels, pruneExcerpt, rewriteRun, scoreLabels, stratumOf, weightedMetrics } from "../bench/front-door/validation-sample.mjs";
import { runAcceptance } from "../bench/front-door/acceptance.mjs";
import { passiveReport } from "../api/_lib/tier1.mjs";
import { scoreOf } from "../api/_lib/grade.mjs";

const realHttp = http.request, realHttps = https.request;
const realServer = (route) => http.createServer((req, res) => {
  const r = route(req.headers.host.split(":")[0], req.url) ?? { status: 404 };
  res.writeHead(r.status, { "content-type": "text/html", ...r.headers });
  res.end(r.body ?? "");
});
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
  it("B4: does not repeat a failed robots.txt request, and keeps the certificate outcome", async () => {
    const cert = { err: "CERT_HAS_EXPIRED" };
    const r = await go({ "https://a.org/robots.txt": cert, "http://a.org/robots.txt": { status: 301, headers: { location: "https://a.org/robots.txt" } }, "https://a.org/": cert, "http://a.org/": HOME });
    expect(r).toMatchObject({ status: "error", error: "tls_invalid", tlsReason: "CERT_HAS_EXPIRED" });
    expect(log.filter((u) => u === "https://a.org/robots.txt")).toHaveLength(1);
    const back = await go({ "https://a.org/robots.txt": cert, "http://a.org/robots.txt": ROBOTS, "http://a.org/": { status: 301, headers: { location: "https://a.org/" } } });
    expect(back).toMatchObject({ error: "tls_invalid", tlsReason: "CERT_HAS_EXPIRED" });
  });
  it("16: another organization's opt-out at a redirect is its own reason, not the listed site's", async () => {
    const other = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 301, headers: { location: "https://parent.com/" } }, "https://parent.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" } });
    expect(other).toMatchObject({ status: "excluded", reason: "redirect_opted_out" });
    const same = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 301, headers: { location: "https://www.a.org/" } }, "https://www.a.org/robots.txt": { status: 200, body: "User-agent: Penthera-Research\nDisallow: /\n" } });
    expect(same.status).toBe("opted_out");
  });
  it("note: the budget spans the www attempt", async () => {
    web = { "https://www.a.org/robots.txt": ROBOTS, "https://www.a.org/": HOME };
    const lookup = async (h) => { if (h === "a.org") throw new Error("ENOTFOUND"); return [{ address: "93.184.216.34", family: 4 }]; };
    expect((await visit({ host: "a.org", cohorts: {} }, { strict: true, exclude, lookup, budgetMs: 200 })).status).not.toBe("ok");
  });
  it("item 3: the study's visit reads no DNS, and the live check still does", async () => {
    let asked = 0;
    const dns = { resolveTxt: async () => { asked++; return []; }, resolveCaa: async () => { asked++; return []; } };
    web = { "https://a.org/robots.txt": ROBOTS, "https://a.org/": HOME };
    const target = new URL("https://a.org/");
    await passiveReport(target, { lookup: look, dns, skipDns: true });
    expect(asked).toBe(0);
    await passiveReport(target, { lookup: look, dns });
    expect(asked).toBeGreaterThan(0);
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": HOME });
    expect(r.checks.some((c) => ["spf", "dmarc", "caa"].includes(c.id))).toBe(false);
  });
  it("item 3: the pass adds the DNS checks back, so the score means what it did", async () => {
    const server = realServer((_h, url) => (url === "/robots.txt" ? ROBOTS : HOME));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const stub = () => Promise.reject(Object.assign(new Error("x"), { code: "ENODATA" }));
      const { records } = await runPass(mergeCohorts({ T1k: [{ host: "a.selftest.example.com", rank: 1, group: "x" }] }), { pass: 2, out: mkdtempSync(join(tmpdir(), "e20r2-")), loopbackPort: server.address().port, delayMs: 0, dns: { mx: stub, ns: stub, resolveTxt: stub, resolveCaa: stub } });
      const ids = records[0].checks.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining(["spf", "dmarc", "caa", "csp"]));
      expect(records[0].score).toBe(scoreOf(records[0].checks));
      expect(records[0].dns.listed.registeredChecks).toBeUndefined();
    } finally { await new Promise((r) => server.close(r)); }
  });
  it("records each host it requested", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": HOME });
    expect(r.hops).toEqual(["a.org", "a.org", "a.org"]);
  });
  it("counts requests, redirects and bytes per site", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 301, headers: { location: "/home" } }, "https://a.org/home": HOME });
    expect(r.counters.requests).toBe(4);
    expect(r.counters.redirects).toBe(1);
    expect(r.counters.bytes).toBe(ROBOTS.body.length + HOME.body.length);
  });
});

describe("robots.txt reading", () => {
  it("B1: a line of stars costs nothing, and globs still match", async () => {
    const started = performance.now();
    expect(robotsVerdict(`User-agent: *\nDisallow: /${"*".repeat(40)}Z\n`, `/${"a".repeat(1500)}`)).toBe("allowed");
    expect(robotsVerdict(`User-agent: *\nDisallow: /${"*a".repeat(5000)}Z\n`, `/${"a".repeat(100_000)}`)).toBe("allowed");
    expect(performance.now() - started).toBeLessThan(200);
    expect(globMatch("/a*c", "/abc")).toBe(true);
    expect(globMatch("/a*c", "/abd")).toBe(false);
    expect(globMatch("/a*c$", "/abcd")).toBe(false);
    expect(globMatch("/a*c$", "/abc")).toBe(true);
    expect(globMatch("/$", "/")).toBe(true);
    expect(globMatch("/$", "/x")).toBe(false);
    expect(globMatch("/*.php$", "/x.php")).toBe(true);
    expect(globMatch("/a*b*c", "/aXbYc/z")).toBe(true);
    expect(globMatch("/ab*ba$", "/aba")).toBe(false);
    expect(globMatch("/x", "/xy")).toBe(true);
    const r = await go({ "https://a.org/robots.txt": { status: 200, body: `User-agent: *\nDisallow: /${"*".repeat(40)}Z\n` }, "https://a.org/": HOME });
    expect(r.status).toBe("ok");
  });
  it("B3: a bare CR ends a line, and the opt-out holds, in the live check's reader too", async () => {
    expect(optedOut("User-agent: Penthera-QuickCheck\rDisallow: /\r")).toBe(true);
    expect(optedOut("\uFEFFUser-agent: Penthera-QuickCheck\nDisallow: /\n")).toBe(true);
    expect(robotsVerdict("User-agent: *\rDisallow: /x\r", "/x")).toBe("disallowed");
    expect((await go({ "https://a.org/robots.txt": { status: 200, body: "User-agent: *\rDisallow: /\r" }, "https://a.org/": HOME })).reason).toBe("robots_disallow_all");
    expect((await go({ "https://a.org/robots.txt": { status: 200, body: "User-agent: Penthera-Research\rDisallow: /\r" }, "https://a.org/": HOME })).status).toBe("opted_out");
  });
  it("B3: UTF-16 or NUL bytes can't be read as rules, so the visit stops", async () => {
    expect(robotsBinary("User\0agent")).toBe(true);
    expect(robotsBinary("\uFFFD\uFFFDU")).toBe(true);
    expect(robotsBinary("User-agent: *")).toBe(false);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("User-agent: Penthera-Research\nDisallow: /\n", "utf16le")]);
    const r = await go({ "https://a.org/robots.txt": { status: 200, body: utf16 }, "https://a.org/": HOME });
    expect(r).toMatchObject({ status: "excluded", reason: "robots_unavailable" });
    expect(r.robots[0].binary).toBe(true);
    expect(log).not.toContain("https://a.org/");
  });
  it("item 11: the longest rule is measured in percent-encoded form", () => {
    expect(robotsVerdict("User-agent: *\nDisallow: /caf%C3\nAllow: /café\n", "/caf%C3%A9")).toBe("allowed");
  });
  it("17: compares rules in percent-encoded form", async () => {
    expect(percentForm("/café")).toBe("/caf%C3%A9");
    expect(percentForm("/caf%c3%a9")).toBe("/caf%C3%A9");
    expect(robotsVerdict("User-agent: *\nDisallow: /café\n", "/caf%C3%A9")).toBe("disallowed");
    expect(robotsVerdict("User-agent: *\nDisallow: /caf%c3%a9\n", "/caf%C3%A9")).toBe("disallowed");
  });
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
    expect(page).toContain("Per site, in this order");
    expect(page).toContain("178.104.243.225");
  });
});

describe("what reaches the disk", () => {
  it("B4: check evidence loses query strings, tokens and long numbers, end to end", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 200, headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'; report-uri https://o1.ingest.sentry.io/api/1/security/?sentry_key=abc123secret&x=4915123456789", "set-cookie": ["sessionvalueabc123; Path=/; HttpOnly", "sid=VALUE; Path=/"] }, body: "<html></html>" } });
    const text = JSON.stringify(r.checks);
    expect(text).not.toMatch(/abc123secret|4915123456789|sessionvalue/);
  });
  it("B9: every written form of an address comes out, and the detector catches each raw", () => {
    const forms = ["&#106;&#111;&#104;&#110;&#64;&#101;&#120;&#46;&#110;&#108;", "&#x6a;&#x6f;&#x68;&#x6e;&#x40;&#x65;&#x78;&#x2e;&#x6e;&#x6c;", "john&#46;doe&#64;x&#46;nl", "john [at] example [dot] com", "john (at) example (dot) com", "john AT example DOT com", "john {at} example.com", "john\\x40example.com", "john＠example.com", "john@example", "john.doe@exam", "redacted.bob@x.nl", "redacted@x.nl", "jos\uFFFD@x.nl", "john&#64example.com", "john&commat;x&period;nl", "john%2540x.nl", "j\u200bohn@x.nl", "john(at)example.com", "info @ example.com", "info at example.com"];
    for (const dirty of forms) {
      const clean = scrub(dirty);
      expect(clean, dirty).not.toMatch(/john|bob|info|jos/i);
      expect(clean, dirty).toContain("<email>");
      expect(Object.values(scrubMisses(clean)).every((v) => v === 0), `${dirty} -> ${clean}`).toBe(true);
    }
    for (const raw of ["&#106;&#111;&#104;&#110;&#64;&#101;", "john [at] example.com", "john(at)example.com", "john\\x40example.com", "john&commat;x", "john＠x.nl", "john@exam", "redacted.bob@x.nl"]) expect(scrubMisses(raw).email, raw).toBeGreaterThan(0);
  });
  it("B9: address forms in host names come out", () => {
    for (const dirty of ["static.225.243.104.178.clients.your-server.de", "ip-2-31-141-178.eu-central-1.compute.amazonaws.com", "2%2E31%2E141%2E178", "0x021F8DB2", "decade:2a01:4f8:c17:1234::1", "fe80::1%25en0", "2a01:4f8:c17:1234:0:0:0:1%eth0", "[::ffff:2.31.141.178]:8080", "x-forwarded-for: 2.31.141.178, 10.0.0.1"]) {
      expect(scrub(dirty), dirty).toContain("<ip>");
      expect(scrub(dirty), dirty).not.toMatch(/2\.31|2-31|243\.104|2a01|fe80::1|021F/i);
    }
  });
  it("B9: evidence the grader cut keeps no partial address", async () => {
    const r = await go({ "https://a.org/robots.txt": ROBOTS, "https://a.org/": { status: 200, headers: { "content-type": "text/html", "content-security-policy": `default-src 'self'; report-uri https://x.example.com/a; ${"x".repeat(100)} mailto:jan.de.vries@persoonlijk-domein.nl` }, body: "<html></html>" } });
    expect(JSON.stringify(r.checks)).not.toMatch(/jan\.de|persoonlijk/);
  });
  it("B8: U+0130 does not shift the parser into form fields or scripts", () => {
    const tr = `<html><head><title>Ana Sayfa</title></head><body>${"<p>İLETİŞİM İLE İLGİLİ</p>".repeat(8)}<form><input type="hidden" name="_csrf" value="SECRETVALUE9"><input name="email" value="jan@x.nl"></form><script>var user={name:"Jan de Vries",phone:"secret"};</script><p>Hoşgeldiniz</p></body></html>`;
    const pe = pageExcerpt(tr);
    expect(pe.text).toContain("Hoşgeldiniz");
    expect(pe.text).not.toMatch(/SECRETVALUE|jan@|Jan de Vries|secret/);
    expect(scrub(`${"İ".repeat(50)}<input value="SECRET">x`)).not.toContain("SECRET");
  });
  it("privacy 1: drops the partial token at the input cap", () => {
    const body = `${"word ".repeat(13_107)}x jan.devries@example.nl and more`;
    expect(scrub(body)).not.toMatch(/jan|devries|example\.nl/);
    expect(scrub("a".repeat(70_000))).toBe("");
  });
  it("privacy 2: keeps real cookie names, and drops token-shaped or address-shaped ones", () => {
    const c = (v) => cookieNames({ "set-cookie": [v] });
    expect(c("session=1; Path=/")).toEqual(["session"]);
    expect(c("__cf_bm=1")).toEqual(["__cf_bm"]);
    for (const bad of ["sess_8f14e45fceea167a5a36dedd4bea2543=1", "2.31.141.178=1", "john.doe@x.nl=1; Path=/", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc=1", "=valueonly; Path=/", "dGVzdHRva2VuMTIzNDU2Nzg=; path=/"]) expect(c(bad), bad).toEqual([]);
    expect(pilotReport([{ status: "ok", evidence: { class: {}, classRegistered: {}, others: [], cookieNames: c("sess_8f14e45fceea167a5a36dedd4bea2543=1"), pageExcerpt: {}, values: {} } }]).scrubMisses.longHex).toBe(0);
  });
  it("privacy 3, 4: scrubs the DMARC record and tags, CAA issuers and header names", async () => {
    const d = await readDomain("x.nl", { resolveTxt: async (n) => (n.startsWith("_dmarc") ? [["v=DMARC1;p=joe@x.nl;sp=reject;rua=mailto:josé@x.nl,mailto:jan@x"]] : [["v=spf1 ip4:1.2.3.4 -all"]]), resolveCaa: async () => [{ critical: 0, issue: "letsencrypt.org;accounturi=https://acme.example/acct/123456789012" }], mx: async () => [], ns: async () => ["a.ns.cloudflare.com"] });
    expect(JSON.stringify(d.dmarcTags)).not.toContain("joe");
    expect(d.dmarcRecord).not.toMatch(/josé|jan@/);
    expect(d.caaTree.issuers).toEqual(["letsencrypt.org"]);
    expect(d.spfRecord).toContain("ip4:1.2.3.4");
    expect(evidenceOf({ status: 200, headers: { "x-ip-2.31.141.178": "1", "x-ok": "1" }, body: "" }).headerNames).toEqual(["x-ok"]);
  });
  it("privacy 5: long fields, textarea and select leave no value", () => {
    for (const dirty of [`<input type="hidden" name="__VIEWSTATE" value="${"Ab/9+x".repeat(600)}">`, '<input value="a>joe@x.nl secret123">', "<textarea name=msg>Jan de Vries, BSN</textarea>", "<select name=a><option selected>Jan</option></select>", '<input name=q value="x']) {
      expect(scrub(dirty), dirty).not.toMatch(/Ab\/9|joe|Jan|secret|value="x/);
    }
    expect(pageExcerpt("<p>hi</p><textarea>Jan</textarea><select><option>Piet</option></select>").text).toBe("hi");
  });
  it("privacy 7: scrubs a bare fragment and other token forms", () => {
    expect(scrub("https://x.nl/#john.doe")).not.toContain("john");
    expect(scrub("https://x.nl/p;jsessionid=ABCDEF1234567890ABCD")).not.toContain("ABCDEF");
    expect(scrub("Authorization: Token abcdefgh12345678")).not.toContain("abcdefgh");
    expect(scrub("/track/ab12cd34ef56gh78ij90")).not.toContain("ab12");
    expect(scrub("sess=abc")).toBe("sess=<token>");
    expect(scrub("color:#fff; https://x.nl/page")).toContain("#fff");
  });
  it("note: reads valid HTML with no closing head", () => {
    expect(pageExcerpt("<html><head><meta charset=utf8><title>Hi</title><body><p>Real page text</p></body>")).toMatchObject({ title: "Hi", text: "Real page text" });
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
  const rec = { status: "ok", httpStatus: 200, checks: [], counters: { requests: 3, bytes: 1, redirects: 0 }, hops: ["a.org"], evidence: { class: { label: "candidate-page", rule: "status" }, classRegistered: { label: "page" }, cookieNames: [], headerNames: [], others: [], pageExcerpt: { title: "t", text: "x" }, values: {} }, dns: { listed: { dmarcRecord: "" } } };
  it("stops the run on a miss, and scans what DNS stored, header names and cookie names", () => {
    expect(stopRules(pilotReport([rec]))).toEqual([]);
    const miss = (o) => pilotReport([{ ...rec, ...o }]).scrubMisses;
    expect(miss({ dns: { listed: { dmarcRecord: "v=DMARC1; rua=mailto:jan@example.nl" } } }).email).toBe(1);
    expect(miss({ dns: { listed: { dmarcRecord: "", dmarcTags: { p: "joe@x.nl" } } } }).email).toBe(1);
    expect(miss({ dns: { listed: { dmarcRecord: "", caaTree: { issuers: ["jan@x.nl"] } } } }).email).toBe(1);
    expect(miss({ dns: { listed: { dmarcRecord: "", spfRecord: "v=spf1 ip4:1.2.3.4 redirect=jan@x.nl -all" } } })).toMatchObject({ email: 1, ipv4: 0 });
    expect(miss({ evidence: { ...rec.evidence, headerNames: ["x-2.31.141.178"], cookieNames: ["8f14e45fceea167a5a36dedd4bea2543"] } }).longHex).toBe(1);
    expect(stopRules(pilotReport([{ ...rec, dns: { listed: { dmarcRecord: "jan@x.nl" } } }]))).toContain("a privacy scrub missed something");
  });
  it("8: a single site over the limit stops the run, not the average", () => {
    const many = Array.from({ length: 49 }, () => rec);
    expect(stopRules(pilotReport([...many, { ...rec, counters: { requests: 40, bytes: 1, redirects: 0 } }]))).toEqual(["a site took more than 20 requests"]);
  });
  it("9: any hop to an excluded host stops the run", () => {
    const r = pilotReport([{ ...rec, hops: ["a.org", "ministry.gov"] }], { exclude });
    expect(r.excludedHops).toBe(1);
    expect(stopRules(r)).toContain("a request reached an excluded host");
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
  it("item 6: the platform reading knows Akamai as the classifier does", () => {
    for (const h of [{ server: "AkamaiGHost" }, { "x-akamai-transformed": "9" }, { "akamai-grn": "0.1" }]) expect(platformOf(h, "").edge).toBe("akamai");
    expect(classify({ status: 403, headers: { "akamai-grn": "0.1" }, body: "" }).vendor).toBe("akamai");
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

describe("a visit in its own thread", () => {
  it("item 12: keeps bytes from a response cut off by the hard cap", async () => {
    const server = realServer((_h, url) => (url === "/robots.txt" ? ROBOTS : null));
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url === "/robots.txt") { res.writeHead(200); res.end("User-agent: *\nAllow: /\n"); return; }
      res.writeHead(200, { "content-type": "text/html" });
      const drip = setInterval(() => res.write("x".repeat(2000)), 20);
      res.on("close", () => clearInterval(drip));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const r = await visitInWorker({ host: "a.selftest.example.com", cohorts: {} }, { loopbackPort: server.address().port, budgetMs: 3000, hardCapMs: 500 });
      expect(r.counters.bytes).toBeGreaterThan(2000);
    } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
  });
  it("item 12: counts redirect and encoded bodies, and keeps neither", async () => {
    const server = realServer((_h, url) => {
      if (url === "/robots.txt") return ROBOTS;
      if (url === "/") return { status: 301, headers: { location: "/b" }, body: "r".repeat(100) };
      return { status: 200, headers: { "content-encoding": "gzip" }, body: "z".repeat(200) };
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const r = await visitInWorker({ host: "a.selftest.example.com", cohorts: {} }, { loopbackPort: server.address().port });
      expect(r.counters.bytes).toBeGreaterThanOrEqual(ROBOTS.body.length + 300);
      expect(JSON.stringify(r.evidence)).not.toContain("zzzz");
    } finally { await new Promise((r) => server.close(r)); }
  });
  it("B2: ends a visit whose thread is stuck, at the hard cap, and keeps the rest of the run going", async () => {
    const started = Date.now();
    let ticks = 0;
    const tick = setInterval(() => { ticks++; }, 50);
    const r = await visitInWorker({ host: "a.selftest.example.com", cohorts: {} }, { hardCapMs: 100, workerFile: join(import.meta.dirname, "fixtures", "hang-worker.mjs") });
    clearInterval(tick);
    expect(r).toMatchObject({ status: "error", error: "timeout", reason: "hard_cap" });
    expect(Date.now() - started).toBeLessThan(6000);
    expect(ticks).toBeGreaterThan(5);
  });
  it("B2: a hostile page's real regex is ended the same way", async () => {
    const server = realServer((_h, url) => (url === "/robots.txt" ? ROBOTS : { status: 200, headers: { "content-type": "text/html" }, body: "<meta ".repeat(40_000) }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const started = Date.now();
      const r = await visitInWorker({ host: "a.selftest.example.com", cohorts: {} }, { loopbackPort: server.address().port, budgetMs: 800, hardCapMs: 800 });
      expect(Date.now() - started).toBeLessThan(6000);
      expect(r.host).toBe("a.selftest.example.com");
      expect(r.counters.requests).toBeGreaterThan(0);
    } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
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
  it("item 8: the list decides which www is a real label, before anything is stripped", () => {
    expect(siteKey("www.example.com")).toBe("example.com");
    expect(siteKey("www.example.co.uk")).toBe("example.co.uk");
    expect(siteKey("www.github.io")).toBe("www.github.io");
    expect(siteKey("www.co.uk")).toBe("www.co.uk");
    expect(siteOrg("www.github.io")).toBe("github.io");
    expect(siteOrg("github.io")).toBe("github.io");
    const rows = mergeCohorts({ T1k: [{ host: "www.example.com", rank: 1, group: "x" }, { host: "www.co.uk", rank: 2, group: "x" }], "YC-new": [{ host: "example.com", rank: 1, group: "y" }, { host: "co.uk", rank: 2, group: "y" }] });
    expect(rows.map((r) => r.host).sort()).toEqual(["co.uk", "www.co.uk", "www.example.com"]);
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
    const server = realServer((host, url) => {
      if (url === "/robots.txt") return ROBOTS;
      return host === "www.co.uk" ? { status: 301, headers: { location: `http://other.example.net:${server.address().port}/` } } : HOME;
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const out = mkdtempSync(join(tmpdir(), "e20r2-"));
      const stub = () => Promise.reject(Object.assign(new Error("x"), { code: "ENODATA" }));
      const { records } = await runPass(mergeCohorts({ T1k: [{ host: "www.co.uk", rank: 1, group: "uk" }] }), { pass: 2, out, loopbackPort: server.address().port, delayMs: 0, dns: { mx: stub, ns: stub, resolveTxt: stub, resolveCaa: stub } });
      expect(records[0]).toMatchObject({ listedHost: "www.co.uk", finalHost: "other.example.net", finalOrg: "example.net", redirectClass: "other-org" });
      expect(records[0].dns.final.domain).toBe("example.net");
      expect(records[0].hops).toEqual(["www.co.uk", "www.co.uk", "other.example.net", "other.example.net", "other.example.net"]);
    } finally { await new Promise((r) => server.close(r)); }
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
  it("item 4: keeps every query, by exact name, with what came back", async () => {
    const none = Object.assign(new Error("x"), { code: "ENODATA" }), gone = Object.assign(new Error("x"), { code: "ENOTFOUND" });
    const d = await readDomain("a.b.example.com", { resolveTxt: async (n) => { if (n === "example.com") return [["v=spf1 -all"]]; throw none; }, resolveCaa: async (n) => { if (n === "com") return [{ issue: "x" }]; throw gone; }, mx: () => Promise.reject(none), ns: async () => ["a.ns.cloudflare.com."] });
    const of = (type, name) => d.queries.find((q) => q.type === type && q.name === name);
    expect(of("TXT", "example.com")).toMatchObject({ outcome: "answer", answers: 1 });
    expect(of("TXT", "_dmarc.a.b.example.com").outcome).toBe("nodata");
    expect(of("TXT", "_dmarc.example.com").outcome).toBe("nodata");
    for (const n of ["a.b.example.com", "b.example.com", "example.com"]) expect(of("CAA", n).outcome).toBe("nxdomain");
    expect(of("CAA", "com").outcome).toBe("answer");
    expect(of("MX", "example.com").outcome).toBe("nodata");
    expect(of("NS", "example.com").outcome).toBe("answer");
    expect(new Set(d.queries.map((q) => `${q.type} ${q.name}`)).size).toBe(d.queries.length);
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
  const site = (host, cohort, passes, extra = {}) => ({ host, finalHost: host, status: "ok", cohorts: { [cohort]: { rank: 1, group: "x" } }, score: 50, checks: [{ id: "csp", weight: 14, passed: passes }], evidence: { class: { label: "candidate-page", rule: "status" }, classRegistered: { label: "page" }, traits: { login: true, payments: false, shop: false, securityPage: false } }, ...extra });
  it("item 7: each E20 file keeps its own record, and apex and www find each other", () => {
    const t = [site("www.a.example.com", "T1k", true, { httpStatus: 403 })], y = [site("a.example.com", "YC-new", true, { httpStatus: 200 })];
    const e20 = { T1k: e20Index(t), "YC-new": e20Index(y) };
    const p = [site("a.example.com", "T1k", true), site("www.a.example.com", "YC-new", true)];
    const out = claims(p, null, e20, { resamples: 20 });
    expect(out.find((c) => c.id === "C12")).toMatchObject({ n: 1, diff: -1 });
    expect(out.find((c) => c.id === "C13")).toMatchObject({ n: 1, diff: 0 });
  });
  it("item 10: gives Newcombe, the exact test, and direction apart from equivalence", () => {
    const a = Array.from({ length: 30 }, (_, i) => site(`a${i}.example${i}.com`, "T1k", i < 15)), b = Array.from({ length: 30 }, (_, i) => site(`b${i}.other${i}.com`, "YC-new", i < 30));
    const c = diffClaim("C1", "x", a, b, "csp", -1, { resamples: 200 });
    expect(c.S.newcombe.ci95).toHaveLength(2);
    expect(c.S.exactP).toBeLessThan(0.01);
    expect(c.S).toMatchObject({ direction: "above zero", equivalence: "not shown" });
    expect(intervalOutcomes([-0.05, 0.05])).toEqual({ direction: "includes zero", equivalence: "within the margin" });
    expect(intervalOutcomes([0.02, 0.05])).toEqual({ direction: "above zero", equivalence: "within the margin" });
    expect(intervalOutcomes([NaN, 1]).direction).toBe("unknown");
    expect(fisherExact(1, 9, 11, 3)).toBeCloseTo(0.0028, 3);
  });
  it("item 10: an organization on both sides is one draw, which keeps the covariance", () => {
    const both = (i, p) => [site(`s${i}.example${i}.com`, "T1k", p), site(`s${i}.example${i}.com`, "YC-new", p)];
    const rows = Array.from({ length: 40 }, (_, i) => both(i, i % 2 === 0));
    const r = clusterDiff(rows.map((x) => x[0]), rows.map((x) => x[1]), "csp", { resamples: 500, level: 0.95 });
    expect(r.ci).toEqual([0, 0]);
    const disjoint = clusterDiff(rows.map((x) => x[0]), rows.map((x, i) => ({ ...x[1], host: `o${i}.elsewhere${i}.org`, finalHost: `o${i}.elsewhere${i}.org` })), "csp", { resamples: 500, level: 0.95 });
    expect(disjoint.ci[1]).toBeGreaterThan(0.1);
  });
  it("item 10: the floor counts organizations, not rows", () => {
    const many = Array.from({ length: 30 }, (_, i) => site(`s${i}.one.example.com`, "T1k", i % 2 === 0));
    const orgs = Array.from({ length: 30 }, (_, i) => site(`o${i}.example${i}.com`, "YC-new", i % 2 === 0));
    expect(diffClaim("C1", "x", many, orgs, "csp", -1, { resamples: 50 }).S.decision).toBe("not estimable");
    expect(standardizedDiff(many, orgs, "csp", { resamples: 50 }).supported).toEqual([]);
  });
  it("item 10: reports traits per cohort", () => {
    const rows = [...Array.from({ length: 20 }, (_, i) => site(`a${i}.example.com`, "T1k", true)), ...Array.from({ length: 5 }, (_, i) => site(`b${i}.example.com`, "YC-new", true))];
    const t = traitsByCohort(rows);
    expect(t.T1k.login.sites).toBe(20);
    expect(t["YC-new"].login).toMatchObject({ sites: 5, suppressed: true });
  });
  it("item 10: bounds and standardization don't need DNS data, and cover C3 and C4", () => {
    const dir = mkdtempSync(join(tmpdir(), "e20r2-"));
    const rows = [...Array.from({ length: 25 }, (_, i) => site(`a${i}.example${i}.com`, "T1k", i < 5, { platform: { edge: "cloudflare" } })), ...Array.from({ length: 25 }, (_, i) => site(`b${i}.other${i}.com`, "YC-new", i < 20, { platform: { edge: "cloudflare" } }))];
    const lines = (r) => r.map((x) => JSON.stringify(x)).join("\n") + "\n";
    writeFileSync(join(dir, "p.jsonl"), lines(rows));
    writeFileSync(join(dir, "t.jsonl"), lines(rows.slice(0, 25)));
    writeFileSync(join(dir, "y.jsonl"), lines(rows.slice(25)));
    execFileSync(process.execPath, [join(import.meta.dirname, "..", "bench", "front-door", "analyze-r.mjs"), "--pass1", join(dir, "p.jsonl"), "--e20", join(dir, "t.jsonl"), join(dir, "y.jsonl"), "--out", join(dir, "o.json")]);
    const o = JSON.parse(readFileSync(join(dir, "o.json"), "utf8"));
    expect(o.bounds.C1.low).toBeDefined();
    expect(o.bounds).toHaveProperty("C3");
    expect(o.standardized).toHaveProperty("C3");
    expect(o.standardized).toHaveProperty("C4");
    expect(o.traitsByCohort.T1k).toBeDefined();
    expect(o.dnsBeside).toBeUndefined();
  }, 60_000);
  it("19: S and R must agree; anything else unequal is inconclusive or view-dependent", () => {
    expect(combine("no meaningful difference", "inconclusive")).toBe("inconclusive");
    expect(combine("inconclusive", "no meaningful difference")).toBe("inconclusive");
    expect(combine("supported", "no meaningful difference")).toBe("view-dependent");
    expect(combine("no meaningful difference", "no meaningful difference")).toBe("no meaningful difference");
  });
  it("20: our own stops stay in the denominator; an owner's choice leaves", () => {
    for (const reason of ["robots_unavailable", "exclusion_redirect", "ipv6_literal", "redirect_opted_out"]) expect(isEligible({ status: "excluded", reason }), reason).toBe(true);
    expect(isEligible({ status: "error", error: "timeout" })).toBe(true);
    for (const reason of ["exclusion_list", "robots_disallow_all", "robots_disallow_path", "not_a_homepage"]) expect(isEligible({ status: "excluded", reason }), reason).toBe(false);
    expect(isEligible({ status: "opted_out" })).toBe(false);
  });
  it("22: counts domains DNS couldn't answer for", () => {
    const row = (exists) => ({ cohorts: { T1k: {} }, dns: { listed: { exists } } });
    expect(dnsCoverage([row(true), row(false), row(null), row(null)]).T1k).toEqual({ read: 4, exists: 1, nxdomain: 1, unknown: 2 });
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
    expect(a[0].stratumSize).toBe(400);
    expect(drawSample([...records].reverse())).toEqual(a);
    expect(stratumOf(records.at(-1))).toBe("block-signature");
  });
  it("23: gives the labeler a blind sheet", () => {
    const records = [rec(1, "candidate-page"), rec(2, "block", "body"), rec(3, "challenge")].map((r) => ({ ...r, evidence: { ...r.evidence, status: 200, headerNames: [], values: {} } }));
    const { sheet, key } = blindSheet(drawSample(records), records);
    expect(sheet).toHaveLength(3);
    expect(JSON.stringify(sheet)).not.toMatch(/example\.com|block|stratum|candidate/);
    expect(key[0]).toHaveProperty("stratumSize");
  });
  const row = (stratum, ruleLabel, human, stratumSize) => ({ stratum, stratumSize, ruleLabel, human });
  it("item 5: weights over answered rows, and unsure invents no class", () => {
    const rows = [row("candidate-page", "page", "page", 20), row("candidate-page", "page", "challenge", 20), row("challenge", "challenge", "challenge", 2), row("challenge", "challenge", "unsure", 2)];
    const m = weightedMetrics(rows, { resamples: 200 });
    expect(m).toMatchObject({ rows: 4, unsure: 1 });
    expect(m.metrics.page.precision).toBeCloseTo(0.5);
    // The challenge stratum keeps its full size of 2 on its one answered row.
    expect(m.metrics.challenge.recall).toBeCloseTo(2 / 12);
    expect(m.kappaUnsureAsDisagreement).toBeLessThan(m.kappa);
    const all = [row("candidate-page", "page", "page", 2), row("candidate-page", "page", "unsure", 2), row("challenge", "challenge", "challenge", 1)];
    // po 2/3, pe (1/3)(2/3)+(1/3)(1/3) = 1/3: a third class would change this.
    expect(weightedMetrics(all, { resamples: 10 }).kappaUnsureAsDisagreement).toBeCloseTo(0.5);
  });
  it("item 5: reads human and model labels, and reports where they differ", () => {
    const key = [1, 2].map((id) => ({ id, stratum: "challenge", stratumSize: 2, ruleLabel: "challenge" }));
    const r = scoreLabels(key, "id,label\n1,challenge\n2,page\n", "id,label\n1,challenge\n2,block\n", { resamples: 10 });
    expect(r.humanVsAgent).toMatchObject({ disagreements: 1, pairs: { "human page, agent block": 1 } });
  });
  it("item 5: refuses a missing, duplicate, unknown or invalid label", () => {
    expect(() => parseLabels("id,label\n1,page\n", [1, 2])).toThrow(/no label/);
    expect(() => parseLabels("id,label\n1,page\n1,page\n", [1])).toThrow(/duplicate/);
    expect(() => parseLabels("id,label\n9,page\n", [1])).toThrow(/unknown id/);
    expect(() => parseLabels("id,label\n1,maybe\n", [1])).toThrow(/invalid label/);
    expect(() => parseLabels("x,y\n1,page\n", [1])).toThrow(/id,label/);
  });
  it("privacy 6: pruning with no sample removes all page text, for a pilot", () => {
    expect(pruneExcerpt(rec(1, "candidate-page")).evidence.pageExcerpt.title).toBeUndefined();
  });
  it("deletes the text of an unsampled page and keeps its shape", () => {
    const r = rec(1, "candidate-page");
    expect(pruneExcerpt(r, new Set())).toMatchObject({ evidence: { pageExcerpt: { scripts: 1 } } });
    expect(pruneExcerpt(r, new Set()).evidence.pageExcerpt.text).toBeUndefined();
    expect(pruneExcerpt(r, new Set([r.host])).evidence.pageExcerpt.text).toBe("hello");
  });
});

describe("what ties a run to its code", () => {
  it("item 9: the code hash reaches every file the study imports", () => {
    const files = codeFiles().map((f) => f.split("/penthera/").pop());
    const has = (end) => files.some((f) => f.endsWith(end));
    for (const f of ["bench/front-door/visit-worker.mjs", "bench/front-door/psl.mjs", "api/_lib/grade.mjs", "lib/blackbox/headers.js", "lib/advisories/index.js", "src/utils/url.js"]) expect(has(f), f).toBe(true);
    expect(codeHash()).toMatch(/^[0-9a-f]{64}$/);
  });
  it("item 9: a run marks what changed under it", async () => {
    const out = mkdtempSync(join(tmpdir(), "e20r2-"));
    await runPass([], { pass: 2, out, loopbackPort: 9, delayMs: 0, manifest: { listSha256: { T1k: "a" } }, recheck: () => ({ listSha256: { T1k: "b" } }) });
    expect(JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")).immutableAtFinish).toEqual({ ok: false, changed: ["listSha256"] });
  });
  it("item 2: pruning leaves the run's manifest alone, and links the old and new raw hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "e20r2-"));
    const text = `${JSON.stringify({ host: "a.example.com", evidence: { pageExcerpt: { text: "x" } } })}\n`;
    writeFileSync(join(dir, "raw.jsonl"), text);
    const sum = createHash("sha256").update(text).digest("hex");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ rawSha256: sum }));
    const proof = rewriteRun(dir, [{ host: "a.example.com" }], "pilot");
    expect(proof.rawSha256Before).toBe(sum);
    expect(proof.rawSha256After).not.toBe(sum);
    expect(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).rawSha256).toBe(sum);
    expect(JSON.parse(readFileSync(join(dir, "prune-manifest.json"), "utf8"))).toMatchObject(proof);
    expect(() => rewriteRun(dir, [], "pilot")).toThrow(/not the one the manifest hashed/);
  });
});

describe("acceptance", () => {
  it("every stop condition refuses pass 2, for its own reason, and a clean pilot is allowed", async () => {
    const rows = await runAcceptance();
    expect(rows.filter((r) => !r.pass)).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(27);
  }, 60_000);
});

describe("limits", () => {
  it("gives pass 2 its registered time per site", () => {
    expect(V2_LIMITS).toEqual({ siteBudgetMs: 15_000, siteHardCapMs: 30_000 });
  });
  it("B6: the legacy runner refuses to leave loopback", () => {
    expect(() => authorize({ registered: "E20", cohort: "tranco" })).toThrow(/E20 is closed/);
  });
  it("keeps the vendored list out of the npm package", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
    expect(pkg.files.some((f) => f.startsWith("bench"))).toBe(false);
  });
});
