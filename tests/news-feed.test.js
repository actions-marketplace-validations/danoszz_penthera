/**
 * The site's news feed (scripts/marketing/news-feed.mjs). Every source is a
 * fixture in the source's own format, trimmed; nothing touches the network.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SOURCES, MILESTONES, feedItems, fit, merge, productOf, collect, runNewsFeed, MAX_TEXT } from "../scripts/marketing/news-feed.mjs";
import { readNews } from "../site/build.mjs";

const TODAY = "2026-10-21";
const SINCE = "2026-10-14";
const ctx = { since: SINCE, today: TODAY, popular: new Set(["@ctrl/tinycolor", "chalk"]) };
const source = (id) => SOURCES.find((s) => s.id === id);

const NCSC = `<?xml version='1.0' encoding='UTF-8'?><rss version="2.0"><channel><title>NCSC Security Advisories</title>
<item><title>NCSC-2026-0443 [1.00] [H/H] Kwetsbaarheden verholpen in PHP</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0443</link><pubDate>Wed, 21 Oct 2026 09:10:00 +0000</pubDate></item>
<item><title>NCSC-2026-0437 [1.00] [H/H] Kwetsbaarheid verholpen in BeyondTrust Remote Support</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0437</link><pubDate>Fri, 16 Oct 2026 12:00:00 +0000</pubDate></item>
<item><title>NCSC-2026-0445 [1.00] [M/H] Kwetsbaarheden verholpen in Oracle Analytics</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0445</link><pubDate>Wed, 21 Oct 2026 14:44:10 +0000</pubDate></item>
<item><title>NCSC-2026-0401 [1.01] [H/H] Kwetsbaarheden verholpen in Fortinet FortiOS</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0401</link><pubDate>Mon, 19 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>NCSC-2026-0300 [1.00] [H/H] Kwetsbaarheden verholpen in Ivanti EPMM</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0300</link><pubDate>Mon, 07 Sep 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`;

const KEV = JSON.stringify({
  title: "CISA Catalog of Known Exploited Vulnerabilities",
  vulnerabilities: [
    { cveID: "CVE-2026-96652", vendorProject: "Plex", product: "Media Server", vulnerabilityName: "Plex Media Server Server-Side Request Forgery (SSRF) Vulnerability", dateAdded: "2026-10-20" },
    { cveID: "CVE-2026-11111", vendorProject: "PHP", product: "PHP", vulnerabilityName: "PHP Out-of-Memory Remote Code Execution Vulnerability", dateAdded: "2026-10-19" },
    { cveID: "CVE-2026-22222", vendorProject: "GitLab", product: "GitLab", vulnerabilityName: "GitLab Community and Enterprise Editions Improper Access Control Vulnerability", dateAdded: "2026-09-01" },
  ],
});

const euvd = (items) => JSON.stringify({ items, total: items.length });
const EUVD_EXPLOITED = euvd([
  {
    id: "EUVD-2026-100814", aliases: "CVE-2026-106931\n", exploitedSince: "Oct 20, 2026, 12:00:00 AM",
    enisaIdVendor: [{ vendor: { name: "EG Secure Solutions Inc." } }],
    enisaIdProduct: [{ product: { name: "SiteGuard Server Edition for Nginx", vendor: { name: "EG Secure Solutions Inc." } } }],
  },
  {
    id: "EUVD-2026-100900", aliases: "CVE-2026-33333\n", exploitedSince: "Oct 18, 2026, 12:00:00 AM",
    enisaIdVendor: [{ vendor: { name: "OpenSSL" } }],
    enisaIdProduct: [{ product: { name: "OpenSSL", vendor: { name: "OpenSSL" } } }],
  },
]);
const EUVD_CRITICAL = euvd([
  ...["CVE-2026-109618", "CVE-2026-109619"].map((cve, i) => ({
    id: `EUVD-2026-10726${i}`, aliases: `${cve}\n`, datePublished: "Oct 21, 2026, 1:48:34 PM", baseScore: 9.2,
    enisaIdVendor: [{ vendor: { name: "PHP Group" } }],
    enisaIdProduct: ["8.2.* <8.2.35", "8.5.* <8.5.12", "8.4.* <8.4.27", "8.3.* <8.3.36"].map((product_version) => ({ product: { name: "PHP", vendor: { name: "PHP Group" } }, product_version })),
  })),
  {
    id: "EUVD-2026-107300", aliases: "CVE-2026-44444\n", datePublished: "Oct 20, 2026, 9:00:00 AM", baseScore: 9.8,
    enisaIdVendor: [{ vendor: { name: "PHPOffice" } }],
    enisaIdProduct: [{ product: { name: "PhpSpreadsheet", vendor: { name: "PHPOffice" } } }],
  },
]);

const PHP = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>PHP.net news &amp; announcements</title>
<entry><title>Security advisory: Critical remote code execution vulnerabilities, update now</title><id>https://www.php.net/archive/2026.php#2026-10-21-5</id><published>2026-10-21T00:35:26+00:00</published><link href="https://www.php.net/index.php#2026-10-21-5" rel="alternate" type="text/html"/></entry>
<entry><title>PHP 8.5.12 Released!</title><id>https://www.php.net/archive/2026.php#2026-10-21-1</id><published>2026-10-21T00:00:00+00:00</published><link href="https://www.php.net/index.php#2026-10-21-1" rel="alternate" type="text/html"/></entry>
</feed>`;

const NGINX = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>nginx news</title>
<item><title>nginx-1.31.8
mainline version has been released.
</title><guid>http://nginx.org/#2026-10-21</guid><link>http://nginx.org/#2026-10-21</link><pubDate>Wed, 21 Oct 2026 00:00:00 +0300</pubDate></item>
<item><title>nginx-1.30.6
stable and
nginx-1.31.7
mainline versions have been released,
with fixes for
buffer overflow
vulnerability when using alias with rewrite (CVE-2026-15176) and
request body injection
vulnerability in HTTP/3 (CVE-2026-95101).
</title><guid>http://nginx.org/#2026-10-14</guid><link>http://nginx.org/#2026-10-14</link><pubDate>Wed, 14 Oct 2026 00:00:00 +0300</pubDate></item>
</channel></rss>`;

const NODE = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Node.js Blog: Vulnerability Reports</title>
<item><title><![CDATA[Wednesday, October 21, 2026 Security Releases]]></title><link>https://nodejs.org/en/blog/vulnerability/october-2026-security-releases</link><pubDate>Wed, 21 Oct 2026 22:00:00 GMT</pubDate></item>
<item><title><![CDATA[Developing a minimally HashDoS resistant integer hash for V8]]></title><link>https://nodejs.org/en/blog/vulnerability/march-2026-hashdos</link><pubDate>Tue, 20 Oct 2026 20:50:00 GMT</pubDate></item>
<item><title><![CDATA[Wednesday, July 29, 2026 Security Releases]]></title><link>https://nodejs.org/en/blog/vulnerability/july-2026-security-releases</link><pubDate>Wed, 29 Jul 2026 00:00:00 GMT</pubDate></item>
</channel></rss>`;

const cve5 = ({ id, title, sev, datePublic, affected = [], references = [], timeline }) => JSON.stringify({
  cveMetadata: { cveId: id, state: "PUBLISHED" },
  containers: { cna: { title, datePublic, metrics: [{ other: { content: { text: sev } } }], affected, references, timeline } },
});
const OPENSSL_INDEX = `<html><body><a href="cve-2026-90001.json">cve-2026-90001.json</a> <a href="cve-2026-90002.json">cve-2026-90002.json</a> <a href="cve-2025-1.json">cve-2025-1.json</a></body></html>`;
const OPENSSL = {
  "cve-2026-90001.json": cve5({
    id: "CVE-2026-90001", title: "Heap overflow in the QUIC handshake", sev: "High", datePublic: "2026-10-15T14:00:00+02:00",
    affected: [{ product: "OpenSSL", versions: [{ lessThan: "3.6.6" }, { lessThan: "3.5.10" }] }],
    references: [{ url: "https://openssl-library.org/news/secadv/20261015.txt" }],
  }),
  "cve-2026-90002.json": cve5({ id: "CVE-2026-90002", title: "QUIC: Unbounded backlog", sev: "Low", datePublic: "2026-10-15T14:00:00+02:00" }),
};
const HTTPD_INDEX = `<table>
<tr><td valign="top"><img src="/icons/unknown.gif" alt="[   ]"></td><td><a href="CVE-2026-42356.json">CVE-2026-42356.json</a></td><td align="right">2026-10-15 11:47  </td><td align="right">2.2K</td></tr>
<tr><td valign="top"><img src="/icons/unknown.gif" alt="[   ]"></td><td><a href="CVE-2026-50000.json">CVE-2026-50000.json</a></td><td align="right">2026-10-16 09:00  </td><td align="right">2.2K</td></tr>
<tr><td valign="top"><img src="/icons/unknown.gif" alt="[   ]"></td><td><a href="CVE-2026-10000.json">CVE-2026-10000.json</a></td><td align="right">2026-03-01 09:00  </td><td align="right">2.2K</td></tr>
</table>`;
const HTTPD = {
  "CVE-2026-42356.json": cve5({ id: "CVE-2026-42356", title: "limited RCE for some internal redirects", sev: "low", timeline: [{ time: "2026-10-01T12:00:00.000Z", value: "2.4.69 released" }] }),
  "CVE-2026-50000.json": cve5({ id: "CVE-2026-50000", title: "mod_proxy request smuggling", sev: "important", timeline: [{ time: "2026-10-15T12:00:00.000Z", value: "2.4.70 released" }] }),
};

const GH_MALWARE = JSON.stringify([
  { ghsa_id: "GHSA-aaaa-bbbb-cccc", html_url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", published_at: "2026-10-20T10:00:00Z", vulnerabilities: [{ package: { ecosystem: "npm", name: "chalk" } }] },
  { ghsa_id: "GHSA-h643-5mcg-c726", html_url: "https://github.com/advisories/GHSA-h643-5mcg-c726", published_at: "2026-10-21T15:41:59Z", vulnerabilities: [{ package: { ecosystem: "npm", name: "peptide-modify" } }] },
  { ghsa_id: "GHSA-dddd-eeee-ffff", html_url: "https://github.com/advisories/GHSA-dddd-eeee-ffff", published_at: "2026-10-19T10:00:00Z", withdrawn_at: "2026-10-20T10:00:00Z", vulnerabilities: [{ package: { ecosystem: "npm", name: "@ctrl/tinycolor" } }] },
]);

/** A fake fetcher that serves the fixtures by URL. */
function fakeGet({ fail = [] } = {}) {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    const u = new URL(url);
    if (fail.some((f) => url.includes(f))) throw new Error("503 Service Unavailable");
    if (u.host === "advisories.ncsc.nl") return NCSC;
    if (u.host === "www.cisa.gov") return KEV;
    if (u.host === "euvdservices.enisa.europa.eu") return u.searchParams.get("exploited") ? EUVD_EXPLOITED : EUVD_CRITICAL;
    if (u.host === "www.php.net") return PHP;
    if (u.host === "nginx.org") return NGINX;
    if (u.host === "nodejs.org") return NODE;
    if (u.host === "openssl-library.org") return u.pathname.endsWith("/secjson/") ? OPENSSL_INDEX : OPENSSL[u.pathname.split("/").pop()];
    if (u.host === "httpd.apache.org") return u.pathname.endsWith("/json/") ? HTTPD_INDEX : HTTPD[u.pathname.split("/").pop()];
    if (u.host === "api.github.com") return GH_MALWARE;
    throw new Error(`unexpected ${url}`);
  };
  return { get, urls };
}

const parse = async (id, body) => source(id).parse(body, ctx, fakeGet().get);

describe("news feed: sources", () => {
  it("reads RSS items and Atom entries", () => {
    expect(feedItems(NODE)[0]).toMatchObject({ title: "Wednesday, October 21, 2026 Security Releases", date: "2026-10-21" });
    expect(feedItems(PHP)[0]).toMatchObject({ link: "https://www.php.net/index.php#2026-10-21-5", date: "2026-10-21" });
  });

  it("feed text comes out as plain text, even when markup is escaped or nested", () => {
    const [it] = feedItems("<rss><item><title>a &lt;script&gt;alert(1)&lt;/script&gt; b <scr<b>ipt>c &amp;lt;x</title></item></rss>");
    expect(it.title).not.toMatch(/[<>]/);
    expect(it.title).toBe("a script alert(1) /script b c &lt;x");
  });

  it("NCSC-NL: only first versions rated high likelihood and high impact, inside the window", async () => {
    const c = await parse("ncsc", NCSC);
    expect(c.map((x) => x.source)).toEqual([
      "https://advisories.ncsc.nl/advisory?id=NCSC-2026-0443",
      "https://advisories.ncsc.nl/advisory?id=NCSC-2026-0437",
    ]);
    expect(c[0].text).toBe("NCSC-NL: vulnerabilities fixed in PHP, rated high likelihood and high impact (NCSC-2026-0443)");
    expect(c[1].text).toContain("a vulnerability fixed in BeyondTrust Remote Support");
  });

  it("CISA KEV: products Penthera's readers run, added inside the window", async () => {
    const c = await parse("cisa-kev", KEV);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ date: "2026-10-19", cve: "CVE-2026-11111", product: "PHP", source: "https://nvd.nist.gov/vuln/detail/CVE-2026-11111" });
    expect(c[0].text).toBe("CISA: PHP Out-of-Memory Remote Code Execution (CVE-2026-11111) is exploited in the wild");
  });

  it("EUVD exploited: matches vendor and product, not a product named after a runtime", async () => {
    const c = await parse("euvd-kev", EUVD_EXPLOITED);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ date: "2026-10-18", text: "ENISA: an OpenSSL vulnerability (CVE-2026-33333) is exploited in the wild", source: "https://euvd.enisa.europa.eu/vulnerability/EUVD-2026-100900" });
  });

  it("EUVD critical: one line per runtime and day, with the fixed versions the record states", async () => {
    const c = await parse("euvd", EUVD_CRITICAL);
    expect(c).toHaveLength(1);
    expect(c[0].text).toBe("PHP: 2 vulnerabilities rated CVSS 9.2, fixed in 8.2.35, 8.3.36, 8.4.27 and 8.5.12");
  });

  it("PHP: security advisories, not every release", async () => {
    const c = await parse("php", PHP);
    expect(c).toEqual([{ date: "2026-10-21", text: "PHP security advisory: Critical remote code execution vulnerabilities, update now", source: "https://www.php.net/archive/2026.php#2026-10-21-5", product: "PHP" }]);
  });

  it("nginx: releases that fix vulnerabilities, dated by nginx's own day", async () => {
    const c = await parse("nginx", NGINX);
    expect(c).toEqual([{ date: "2026-10-14", text: "nginx 1.30.6 and 1.31.7 fix 2 vulnerabilities (CVE-2026-15176, CVE-2026-95101)", source: "https://nginx.org/en/security_advisories.html", product: "nginx" }]);
  });

  it("Node.js: security release posts inside the window", async () => {
    const c = await parse("node", NODE);
    expect(c.map((x) => x.source)).toEqual(["https://nodejs.org/en/blog/vulnerability/october-2026-security-releases"]);
  });

  it("OpenSSL and httpd: per-CVE JSON, high severities only", async () => {
    const o = await parse("openssl", OPENSSL_INDEX);
    expect(o).toEqual([expect.objectContaining({ date: "2026-10-15", cve: "CVE-2026-90001", source: "https://openssl-library.org/news/secadv/20261015.txt" })]);
    expect(o[0].text).toBe("OpenSSL fixes a high severity flaw (CVE-2026-90001): Heap overflow in the QUIC handshake");
    const h = await parse("httpd", HTTPD_INDEX);
    expect(h).toEqual([expect.objectContaining({ date: "2026-10-15", text: "Apache httpd 2.4.70 fixes an important flaw (CVE-2026-50000): mod_proxy request smuggling" })]);
  });

  it("npm: malware advisories for popular packages only, never withdrawn ones", async () => {
    const c = await parse("npm", GH_MALWARE);
    expect(c).toEqual([{ date: "2026-10-20", text: "npm: malicious versions of chalk published (GHSA-aaaa-bbbb-cccc)", source: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", product: "npm" }]);
  });

  it("CRA milestones appear on their day, from the regulation", async () => {
    const c = await source("cra").parse("", { ...ctx, since: "2026-09-10", today: "2026-09-12" });
    expect(c).toEqual([expect.objectContaining({ date: "2026-09-11", source: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng" })]);
    for (const m of MILESTONES) expect(m.text.length).toBeLessThanOrEqual(MAX_TEXT);
  });

  it("matches products on the source's vendor and product fields", () => {
    expect(productOf([["PHP Group", "PHP"]])).toBe("PHP");
    expect(productOf([["PHPOffice", "PhpSpreadsheet"]])).toBeNull();
    expect(productOf([["F5", "NGINX Open Source"]])).toBe("nginx");
    expect(productOf([["F5", "BIG-IP"]])).toBeNull();
    expect(productOf([["Apache Software Foundation", "Apache HTTP Server"]])).toBe("Apache httpd");
    expect(productOf([["Apache Software Foundation", "Apache Tomcat"]])).toBeNull();
    expect(productOf([["Python Software Foundation", "CPython"]])).toBe("Python");
    expect(productOf([["Kludex", "python-multipart"]])).toBeNull();
  });

  it("fit: the first line within 120 characters, without dashes", () => {
    expect(fit("x".repeat(121), "short — line")).toBe("short, line");
    expect(fit("x".repeat(121))).toBeNull();
  });
});

describe("news feed: merge", () => {
  const items = [
    { date: "2026-10-21", text: "PHP fixes two remote code execution flaws rated CVSS 9.2", source: "https://www.php.net/ChangeLog-8.php" },
    { date: "2026-09-11", text: "EU: CRA Article 14 applies", source: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng" },
    { date: "2025-08-26", text: "s1ngularity: compromised Nx releases", source: "https://github.com/advisories/GHSA-cxm3-wv7p-598c" },
    { date: "2027-12-11", text: "Ahead: the CRA applies in full", source: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng" },
  ];
  const c = (date, text, extra = {}) => ({ date, text, source: `https://example.org/${encodeURIComponent(text)}`, ...extra });

  it("newest first, items still ahead last, at most cap, old ones dropped", () => {
    const r = merge(items, [c("2026-10-20", "one"), c("2026-10-19", "two")], { today: TODAY, cap: 4, maxAgeDays: 365 });
    expect(r.items.map((n) => n.date)).toEqual(["2026-10-21", "2026-10-20", "2026-10-19", "2027-12-11"]);
    expect(r.added.map((n) => n.text)).toEqual(["one", "two"]);
    expect(r.dropped.map((n) => n.date)).toEqual(["2026-09-11", "2025-08-26"]);
    expect(Object.keys(r.added[0])).toEqual(["date", "text", "source"]);
  });

  it("drops items past the age limit", () => {
    const r = merge(items, [], { today: TODAY, maxAgeDays: 180 });
    expect(r.dropped.map((n) => n.date)).toEqual(["2025-08-26"]);
  });

  it("does not repeat news already on the page or turned down", () => {
    const r = merge(items, [
      c("2026-10-21", "PHP security advisory: update now", { product: "PHP" }), // same product, same day
      { date: "2026-09-11", text: "EU: CRA", source: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng" }, // same source
      c("2026-10-19", "CISA: X (CVE-2026-1) is exploited", { cve: "CVE-2026-1" }),
      c("2026-10-18", "ENISA: X (CVE-2026-1) is exploited", { cve: "CVE-2026-1" }), // same CVE as the line above
      c("2026-10-17", "turned down"),
    ], { today: TODAY, skip: ["https://example.org/turned%20down"] });
    expect(r.added.map((n) => n.text)).toEqual(["CISA: X (CVE-2026-1) is exploited"]);
  });

  it("adds at most maxNew per run and never leaves the list empty", () => {
    const many = Array.from({ length: 8 }, (_, i) => c(`2026-10-${String(20 - i).padStart(2, "0")}`, `n${i}`));
    expect(merge(items, many, { today: TODAY, maxNew: 3 }).added).toHaveLength(3);
    const old = [{ date: "2020-01-01", text: "old", source: "https://example.org/old" }];
    expect(merge(old, [], { today: TODAY }).items).toEqual(old);
  });
});

describe("news feed: run", () => {
  const file = () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-news-"));
    const f = join(dir, "news.json");
    writeFileSync(f, readFileSync(join(import.meta.dirname, "..", "site", "news.json")));
    return f;
  };

  it("writes lines the site build accepts, every one with an https source", async () => {
    const f = file();
    const before = readFileSync(f, "utf8");
    const r = await runNewsFeed({ file: f, get: fakeGet().get, today: TODAY, popular: ctx.popular, log: () => {} });
    expect(r.changed).toBe(true);
    expect(r.added.length).toBeGreaterThan(0);
    const items = readNews(f);
    expect(items.length).toBeLessThanOrEqual(10);
    for (const n of r.added) {
      expect(n.text.length).toBeLessThanOrEqual(MAX_TEXT);
      expect(n.text).not.toMatch(/[—–]/);
      expect(n.source).toMatch(/^https:\/\//);
    }
    // The ahead item still closes the list; the note is kept.
    expect(items.at(-1).date > TODAY).toBe(true);
    expect(JSON.parse(readFileSync(f, "utf8")).note).toBe(JSON.parse(before).note);
    expect(r.summary).toContain("check each line against its source");
  });

  it("dry run reads and reports but writes nothing", async () => {
    const f = file();
    const before = readFileSync(f, "utf8");
    const r = await runNewsFeed({ file: f, get: fakeGet().get, today: TODAY, popular: ctx.popular, dryRun: true, log: () => {} });
    expect(r.added.length).toBeGreaterThan(0);
    expect(readFileSync(f, "utf8")).toBe(before);
  });

  it("a failing source is skipped and named; the others still run", async () => {
    const lines = [];
    const { get, urls } = fakeGet({ fail: ["nginx.org"] });
    const c = await collect({ get, since: SINCE, today: TODAY, popular: ctx.popular, log: (s) => lines.push(s) });
    expect(lines).toContain("nginx: skipped (503 Service Unavailable)");
    expect(c.some((x) => x.origin === "node")).toBe(true);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});
