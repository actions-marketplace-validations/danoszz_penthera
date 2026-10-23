/**
 * The passive report's page, DNS and security.txt checks (api/_lib/tier1.mjs,
 * page.mjs, dns.mjs). A local 127.0.0.1 server plays both the site and a
 * third-party CDN; a stub resolver sends both names there, and stub DNS
 * answers the TXT and CAA lookups. Nothing leaves the machine. The fixture
 * records every request, so the test also proves the report fetched only
 * what the page references, plus /.well-known/security.txt.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { passiveReport } from "../api/_lib/tier1.mjs";
import { parsePage, mixedContentCheck, redact, optedOut } from "../api/_lib/page.mjs";
import { dnsChecks, mailDomain } from "../api/_lib/dns.mjs";
import { grade } from "../api/_lib/grade.mjs";

// Matches the OpenAI project-key rule; built at runtime so no key-shaped
// literal sits in this file.
const KEY = ["sk", "proj", "Q7rT2mVx9LpW4nZk8HcY3bJd6FsA1gEo5uRi"].join("-");
const NOW = Date.parse("2026-10-23T12:00:00Z");

let server, port;
const requests = [];

const page = (p) => `<!doctype html><html><head>
<meta name="generator" content="WordPress 6.4.2">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/css/site.css">
<script src="/js/app.js"></script>
<script src="/js/jquery-1.12.4.min.js"></script>
<script src="http://cdn.thirdparty.example.net:${p}/lib/widget.js"></script>
<!-- <script src="/js/commented-out.js"></script> -->
</head><body>
<img src="http://img.example.org/banner.png">
<a href="/admin">Admin</a>
<form action="http://site.example.org/login"><input name="q"></form>
</body></html>`;

const security = (expires) => `Contact: mailto:security@example.org\nExpires: ${expires}\n`;
let securityTxt = security("2027-06-01T00:00:00.000Z");

beforeAll(async () => {
  server = createServer((req, res) => {
    const host = String(req.headers.host).split(":")[0];
    requests.push(`${host}${req.url}`);
    const send = (type, body) => { res.writeHead(200, { "Content-Type": type }); res.end(body); };
    if (host === "site.example.org") {
      if (req.url === "/") return send("text/html; charset=utf-8", page(port));
      if (req.url === "/js/app.js") return send("text/javascript", `const client = new OpenAI({ apiKey: "${KEY}" });\n//# sourceMappingURL=app.js.map\n`);
      if (req.url === "/js/jquery-1.12.4.min.js") return send("text/javascript", "/*! jQuery v1.12.4 | (c) jQuery Foundation | jquery.org/license */\n!function(){}();");
      if (req.url === "/css/site.css") return send("text/css", "body{margin:0}");
      if (req.url === "/.well-known/security.txt") return send("text/plain", securityTxt);
    }
    if (host === "optout.example.org" && req.url === "/robots.txt") return send("text/plain", "User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nUser-agent: Penthera-QuickCheck\nDisallow: /\n");
    if (host === "star.example.org") {
      if (req.url === "/robots.txt") return send("text/plain", "User-agent: *\nDisallow: /\n");
      if (req.url === "/") return send("text/html", "<!doctype html><p>hello</p>");
    }
    if (host === "cdn.thirdparty.example.net" && req.url === "/lib/widget.js") return send("text/javascript", "window.widget=1;");
    if (host === "many.example.org") {
      if (req.url === "/") return send("text/html", Array.from({ length: 30 }, (_, i) => `<script src="/s${i}.js"></script>`).join(""));
      return send("text/javascript", "1;");
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
afterAll(() => new Promise((r) => server.close(r)));

const nodata = () => Promise.reject(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
const dns = {
  resolveTxt: async (name) => {
    if (name === "example.org") return [["v=spf1 include:_spf.example.net ~all"], ["google-site-verification=abc"]];
    if (name === "_dmarc.example.org") return [["v=DMARC1; p=none; rua=mailto:d@example.org"]];
    return nodata();
  },
  resolveCaa: () => nodata(),
};
const opts = (more = {}) => ({
  lookup: async () => [{ address: "127.0.0.1", family: 4 }], allowPrivate: true, anyPort: true,
  timeout: 2000, dns, now: NOW, typed: `http://site.example.org:${port}/`, ...more,
});

describe("passive report: what the page loads", () => {
  let report, byId;
  beforeAll(async () => {
    requests.length = 0;
    report = await passiveReport(new URL(`http://site.example.org:${port}/`), opts());
    byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
  });

  it("fetches only the page, the files it references and security.txt", () => {
    expect([...requests].sort()).toEqual([
      "cdn.thirdparty.example.net/lib/widget.js",
      "site.example.org/",
      "site.example.org/.well-known/security.txt",
      "site.example.org/css/site.css",
      "site.example.org/js/app.js",
      "site.example.org/js/jquery-1.12.4.min.js",
      "site.example.org/robots.txt",
    ]);
    expect(requests.some((r) => /\.map$|admin|favicon|commented/.test(r))).toBe(false);
  });

  it("keeps the report shape the page renders", () => {
    expect(report.tier).toBe("passive");
    expect(typeof report.score).toBe("number");
    expect(report.scope).toMatch(/Only what a browser loads/);
    for (const c of report.checks) {
      expect(Object.keys(c).sort(), c.id).toEqual(["category", "evidence", "fix", "id", "passed", "severity", "title", "verify", "weight"]);
      if (!c.passed) {
        expect(c.fix.length, c.id).toBeGreaterThan(20);
        expect(c.verify, c.id).toMatch(/^(curl|dig|openssl)/);
      }
    }
    const cats = report.categories.map((c) => c.id);
    for (const id of ["page", "secrets", "email", "contact"]) expect(cats).toContain(id);
  });

  it("finds the key in a same-site script with the CLI's rule, and never echoes it", () => {
    const s = byId.secrets;
    expect(s.passed).toBe(false);
    expect(s.severity).toBe("critical");
    expect(s.category).toBe("secrets");
    expect(s.evidence).toMatch(/OpenAI API key/);
    expect(s.evidence).toContain("/js/app.js");
    expect(JSON.stringify(report)).not.toContain(KEY);
    expect(JSON.stringify(report)).not.toContain(KEY.slice(8, 30));
    expect(redact(`"${KEY}"`)).toMatch(/^sk-pro… \(44 chars\)$/);
  });

  it("caps the score at 40 when a critical check fails", () => {
    expect(report.score).toBeLessThanOrEqual(40);
    expect(report.verdict).toBe("Unsafe defaults");
  });

  it("names jQuery 1.12.4 and its CVEs from the vendored Retire.js data", () => {
    const l = byId.libraries;
    expect(l.passed).toBe(false);
    expect(l.title).toMatch(/jquery 1\.12\.4/);
    expect(l.evidence).toMatch(/CVE-2020-11022/);
    expect(l.evidence).toMatch(/fixed in 3\.5\.0/);
  });

  it("reports the generator version as a note, not a vulnerability", () => {
    const g = byId.generator;
    expect(g.weight).toBe(0);
    expect(g.severity).toBe("info");
    expect(g.title).toMatch(/WordPress 6\.4\.2/);
    expect(g.evidence).toMatch(/no advisory data/);
  });

  it("flags the third-party script without integrity, but not same-site files", () => {
    expect(byId.sri.passed).toBe(false);
    expect(byId.sri.evidence).toContain("cdn.thirdparty.example.net");
    expect(byId.sri.evidence).not.toContain("/js/app.js");
  });

  it("reports the source map reference without fetching it", () => {
    expect(byId["source-maps"].passed).toBe(false);
    expect(byId["source-maps"].evidence).toMatch(/app\.js → app\.js\.map/);
  });

  it("reads SPF, DMARC and CAA from DNS for the registrable domain", () => {
    expect(byId.spf.passed).toBe(true);
    expect(byId.dmarc.passed).toBe(false);
    expect(byId.dmarc.title).toMatch(/policy is none/);
    expect(byId.caa.passed).toBe(false);
  });

  it("finds a current security.txt", () => {
    expect(byId["security-txt"].passed).toBe(true);
    expect(byId["security-txt"].evidence).toMatch(/Contact: mailto:security@example.org/);
  });

  it("does not judge mixed content on an http page", () => {
    expect(byId["mixed-content"]).toBeUndefined();
  });
});

describe("passive report: opt-out and score caps", () => {
  it("stops before the page when robots.txt names Penthera-QuickCheck with Disallow: /", async () => {
    requests.length = 0;
    let err;
    try { await passiveReport(new URL(`http://optout.example.org:${port}/`), opts({ typed: `http://optout.example.org:${port}/` })); } catch (e) { err = e; }
    expect(err?.code).toBe("opted_out");
    expect(err?.status).toBe(403);
    expect(requests).toEqual(["optout.example.org/robots.txt"]);
  });

  it("ignores the * group: that one is for crawlers", async () => {
    const r = await passiveReport(new URL(`http://star.example.org:${port}/`), opts({ typed: `http://star.example.org:${port}/` }));
    expect(r.tier).toBe("passive");
  });

  it("reads robots.txt groups as RFC 9309 does", () => {
    expect(optedOut("User-agent: penthera-quickcheck/1\nDisallow: /")).toBe(true);
    expect(optedOut("User-agent: *\nDisallow: /")).toBe(false);
    expect(optedOut("User-agent: Penthera-QuickCheck\nDisallow: /private")).toBe(false);
    expect(optedOut("User-agent: Penthera-QuickCheck\nAllow: /x\nUser-agent: other\nDisallow: /")).toBe(false);
    expect(optedOut("")).toBe(false);
  });

  it("caps the score at 69 when a high check fails, and the verdict follows", () => {
    const good = {
      url: "https://example.org/", status: 200, hops: [{ url: "https://example.org/", status: 200 }],
      tls: { protocol: "TLSv1.3", validTo: "Dec 31 23:59:59 2030 GMT", issuer: "Let's Encrypt" },
      headers: {
        "strict-transport-security": "max-age=63072000; includeSubDomains",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "permissions-policy": "camera=()",
      },
    };
    const leak = (severity) => ({ id: "secrets", category: "secrets", weight: 14, passed: false, severity, title: "t", evidence: "", fix: "f", verify: "curl" });
    const high = grade(good, { now: NOW, extra: [leak("high")] });
    expect(high.score).toBe(69);
    expect(high.verdict).toBe("Important gaps remain");
    expect(grade(good, { now: NOW, extra: [leak("critical")] }).score).toBe(40);
    expect(grade(good, { now: NOW, extra: [leak("medium")] }).score).toBeGreaterThan(80);
  });
});

describe("passive report: limits and edge cases", () => {
  it("flags an expired security.txt", async () => {
    securityTxt = security("2026-01-01T00:00:00.000Z");
    try {
      const r = await passiveReport(new URL(`http://site.example.org:${port}/`), opts());
      const c = r.checks.find((x) => x.id === "security-txt");
      expect(c.passed).toBe(false);
      expect(c.title).toMatch(/expired on 2026-01-01/);
    } finally {
      securityTxt = security("2027-06-01T00:00:00.000Z");
    }
  });

  it("reads at most 8 same-site files and stays inside 20 requests", async () => {
    requests.length = 0;
    const r = await passiveReport(new URL(`http://many.example.org:${port}/`), opts({ typed: `http://many.example.org:${port}/` }));
    const scripts = requests.filter((x) => /\/s\d+\.js$/.test(x));
    expect(scripts.length).toBe(8);
    expect(requests.length).toBeLessThanOrEqual(20);
    expect(r.checks.find((c) => c.id === "secrets").evidence).toMatch(/22 of 30 referenced files were not read/);
  });

  it("finds http:// files and an http:// form on an https page, unless the CSP upgrades them", () => {
    const parsed = parsePage(page(80), "https://site.example.org/");
    const [c] = mixedContentCheck(parsed, "https://site.example.org/", {});
    expect(c.passed).toBe(false);
    expect(c.severity).toBe("medium");
    expect(c.evidence).toContain("form action http://site.example.org/login");
    expect(c.evidence).toContain("<img> http://img.example.org/banner.png");
    expect(c.evidence).toContain("<script> http://cdn.thirdparty.example.net/lib/widget.js");
    const [up] = mixedContentCheck(parsed, "https://site.example.org/", { "content-security-policy": "upgrade-insecure-requests" });
    expect(up.passed).toBe(true);
  });

  it("treats a DNS timeout as unknown, with no weight", async () => {
    const slow = { resolveTxt: () => Promise.reject(Object.assign(new Error("t"), { code: "ETIMEOUT" })), resolveCaa: () => new Promise(() => {}) };
    const checks = await dnsChecks("www.example.org", { dns: slow, dnsTimeout: 50 });
    expect(checks.map((c) => c.id).sort()).toEqual(["caa", "dmarc", "spf"]);
    for (const c of checks) {
      expect(c.weight, c.id).toBe(0);
      expect(c.title, c.id).toMatch(/Could not check/);
    }
  });

  it("strips www and stops at common two-level suffixes", () => {
    expect(mailDomain("www.example.org")).toBe("example.org");
    expect(mailDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(mailDomain("example.co.uk")).toBe("example.co.uk");
  });

  it("walks CAA up from the host to the registrable domain only", async () => {
    const asked = [];
    const stub = {
      resolveTxt: () => nodata(),
      resolveCaa: async (n) => { asked.push(n); if (n === "example.co.uk") return [{ critical: 0, issue: "letsencrypt.org" }]; return nodata(); },
    };
    const caa = (await dnsChecks("a.b.example.co.uk", { dns: stub })).find((c) => c.id === "caa");
    expect(asked.sort()).toEqual(["a.b.example.co.uk", "b.example.co.uk", "example.co.uk"]);
    expect(caa.passed).toBe(true);
    expect(caa.evidence).toMatch(/letsencrypt\.org/);
  });

  it("lets a well-configured site still reach 100", async () => {
    const good = {
      resolveTxt: async (n) => (n === "example.org" ? [["v=spf1 -all"]] : [["v=DMARC1; p=reject"]]),
      resolveCaa: async () => [{ critical: 0, issue: "letsencrypt.org" }],
    };
    const extra = await dnsChecks("www.example.org", { dns: good });
    const r = grade({
      url: "https://www.example.org/", status: 200, hops: [{ url: "https://www.example.org/", status: 200 }],
      tls: { protocol: "TLSv1.3", validTo: "Dec 31 23:59:59 2030 GMT", issuer: "Let's Encrypt" },
      headers: {
        "strict-transport-security": "max-age=63072000; includeSubDomains",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "permissions-policy": "camera=()",
      },
    }, { now: NOW, extra });
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.score).toBe(100);
  });
});

describe("live check: server software against the runtime advisories", () => {
  it("flags a PHP version the response names, as may-be-affected and at most high", async () => {
    const { runtimeCheck } = await import("../api/_lib/tier1.mjs");
    const [c] = runtimeCheck({ "x-powered-by": "PHP/8.3.12", "set-cookie": ["PHPSESSID=1; path=/"] }, "https://example.org/");
    expect(c.id).toBe("runtime");
    expect(c.passed).toBe(false);
    expect(c.severity).toBe("high");
    expect(c.title).toMatch(/may be affected/);
    expect(c.evidence).toMatch(/PHP\/8\.3\.12/);
    expect(c.evidence).toMatch(/backported/);
    expect(c.fix).toMatch(/Upgrade PHP/);
  });

  it("says nothing when the response names no version", async () => {
    const { runtimeCheck } = await import("../api/_lib/tier1.mjs");
    expect(runtimeCheck({ server: "Vercel" }, "https://example.org/")).toEqual([]);
  });
});
