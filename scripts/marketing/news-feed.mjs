#!/usr/bin/env node
/**
 * News feed: propose new items for the site's ticker (site/news.json) from
 * official, machine-readable sources. It writes the file; the news-feed
 * workflow turns the change into one pull request a person reviews. Nothing
 * is published from here.
 *
 *   node scripts/marketing/news-feed.mjs [--dry-run] [--since-days 7] [--cap 10] [--max-age-days 365] [--max-new 5] [--summary file.md]
 *
 * Sources, in order of preference when two report the same thing:
 *   cra       CRA milestones from Regulation (EU) 2024/2847, Article 71 (a fixed list)
 *   ncsc      NCSC-NL advisories rated high likelihood and high impact (RSS)
 *   euvd-kev  ENISA EUVD: exploited vulnerabilities in the products below (JSON API)
 *   cisa-kev  CISA Known Exploited Vulnerabilities, same products (JSON)
 *   php       php.net security advisories (Atom)
 *   nginx     nginx releases that fix vulnerabilities (RSS)
 *   node      Node.js security release posts (RSS)
 *   openssl   OpenSSL advisories rated High or Critical (CVE JSON 5)
 *   httpd     Apache httpd advisories rated important or critical (CVE JSON 5)
 *   euvd      ENISA EUVD: CVSS 9 or more in the runtimes above (JSON API)
 *   npm       GitHub malware advisories for popular npm packages (REST API)
 *
 * Python has no feed of its own here: the PSF advisory database carries no
 * severity, so CPython shows up through EUVD and the exploited lists instead.
 *
 * Every line is built from fields the source states (a title, a version, a
 * CVE, a rating); nothing is summarized or guessed. A line that cannot be
 * built within 120 characters is skipped. `get` is injected so tests run
 * offline (tests/news-feed.test.js).
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL, fileURLToPath } from "node:url";

export const MAX_TEXT = 120;
const UA = "penthera-news-feed (+https://github.com/danoszz/penthera)";
const CRA = "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng";

/** Regulation (EU) 2024/2847, Article 71(2). */
export const MILESTONES = [
  { date: "2026-06-11", text: "EU: Cyber Resilience Act rules for notifying conformity assessment bodies apply", source: CRA },
  { date: "2026-09-11", text: "EU: Cyber Resilience Act Article 14 applies: report actively exploited vulnerabilities within 24 hours", source: CRA },
  { date: "2027-12-11", text: "EU: the Cyber Resilience Act applies in full to products with digital elements sold in the EU", source: CRA },
];

/**
 * What Penthera's readers run: the runtimes in lib/rules/advisories plus the
 * developer tooling an exploited-list entry would matter for. `name` is what
 * the ticker calls it; `test(vendor, product)` runs on the source's own vendor
 * and product fields, so "SiteGuard for Nginx" from another vendor is not nginx.
 */
export const PRODUCTS = [
  { name: "PHP", runtime: true, test: (v, p) => /^php( group)?$/i.test(v) && (!p || /^php$/i.test(p)) },
  { name: "nginx", runtime: true, test: (v, p) => /^(f5|nginx)\b/i.test(v) && /^nginx\b(?!-)/i.test(p) },
  { name: "Apache httpd", runtime: true, test: (v, p) => /^apache\b/i.test(v) && /^(apache )?(http server|httpd)$/i.test(p) },
  { name: "Node.js", runtime: true, test: (v, p) => /^(node\.?js|openjs)\b/i.test(v) && (!p || /^node\.?js$/i.test(p)) },
  { name: "Python", runtime: true, test: (v, p) => /^python software foundation$/i.test(v) && /^c?python$/i.test(p) },
  { name: "OpenSSL", runtime: true, test: (v, p) => /^openssl\b/i.test(v) && (!p || /^openssl$/i.test(p)) },
  { name: "npm", test: (v, p) => /^npm\b/i.test(v) || /^npm( cli)?$/i.test(p) },
  { name: "GitHub", test: (v) => /^github\b/i.test(v) },
  { name: "GitLab", test: (v) => /^gitlab\b/i.test(v) },
  { name: "Jenkins", test: (v) => /^jenkins\b/i.test(v) },
];

/** The ticker name for the first vendor/product pair that is one of PRODUCTS. */
export function productOf(pairs, { runtimeOnly = false } = {}) {
  for (const [v, p] of pairs) {
    const hit = PRODUCTS.find((x) => (!runtimeOnly || x.runtime) && x.test(String(v || "").trim(), String(p || "").trim()));
    if (hit) return hit.name;
  }
  return null;
}

/** The first candidate line that fits, cleaned to the site's voice. */
export function fit(...lines) {
  for (const l of lines) {
    if (!l) continue;
    const s = String(l).replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
    if (s && s.length <= MAX_TEXT) return s;
  }
  return null;
}

const day = (d) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};
const an = (w) => (/^([aeio]|nginx|npm)/i.test(w) ? "an" : "a");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const unique = (xs) => [...new Set(xs)];
/** Feed text as plain text: CDATA unwrapped, tags stripped until none are left (so a tag split by another cannot survive), stray brackets dropped, entities decoded. Escaped brackets become a space, so decoding cannot bring a tag back. */
function decode(s) {
  let text = String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let prev = null; prev !== text;) {
    prev = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return text.replace(/[<>]/g, "")
    .replace(/&lt;|&gt;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);

/** RSS <item>s or Atom <entry>s as { title, link, date, body }. */
export function feedItems(xml) {
  const out = [];
  for (const [, item] of String(xml).matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/g)) {
    const link = tag(item, "link") || item.match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] || item.match(/<link\b[^>]*href="([^"]+)"/)?.[1] || "";
    out.push({ title: tag(item, "title"), link, date: day(tag(item, "pubDate") || tag(item, "published") || tag(item, "updated")), guid: tag(item, "guid") || tag(item, "id"), body: item });
  }
  return out;
}

const https = (u) => String(u || "").replace(/^http:\/\//, "https://");
const cvss = (n) => String(n).replace(/\.0$/, "");

// "Oct 20, 2026, 12:00:00 AM" (EUVD) as a calendar day, without a time zone shift.
const euvdDay = (s) => {
  const m = String(s || "").match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const mon = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1]) / 3 + 1;
  return mon ? `${m[3]}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};
// Vendor/product pairs; a vendor without a product counts only where PRODUCTS allows it.
const euvdPairs = (v) => [
  ...(v.enisaIdProduct || []).map((x) => [x.product?.vendor?.name, x.product?.name]),
  ...(v.enisaIdVendor || []).map((x) => [x.vendor?.name, ""]),
];
const cveOf = (s) => String(s || "").match(/CVE-\d{4}-\d{4,}/)?.[0] || null;

/**
 * Each source: { id, url(ctx), parse(body, ctx, get) -> candidates }.
 * ctx: { since: "YYYY-MM-DD", today, popular: Set }. A candidate is
 * { date, text, source, product?, cve? }.
 */
export const SOURCES = [
  {
    id: "cra",
    parse: (_, { since, today }) => MILESTONES.filter((m) => m.date >= since && m.date <= today).map((m) => ({ ...m, product: "Cyber Resilience Act" })),
  },
  {
    id: "ncsc",
    url: () => "https://advisories.ncsc.nl/rss/advisories",
    parse(xml, { since }) {
      const out = [];
      for (const it of feedItems(xml)) {
        // "NCSC-2026-0443 [1.00] [H/H] Kwetsbaarheden verholpen in PHP": likelihood/impact.
        const m = it.title.match(/^(NCSC-\d{4}-\d{4}) \[1\.00\] \[H\/H\] (Kwetsbaarhe(?:id|den)) verholpen in (.+)$/);
        if (!m || !it.date || it.date < since) continue;
        const product = m[3].trim();
        const what = m[2] === "Kwetsbaarheid" ? "a vulnerability" : "vulnerabilities";
        const text = fit(
          `NCSC-NL: ${what} fixed in ${product}, rated high likelihood and high impact (${m[1]})`,
          `NCSC-NL: ${what} fixed in ${product}, rated high likelihood and high impact`,
        );
        if (text) out.push({ date: it.date, text, source: `https://advisories.ncsc.nl/advisory?id=${m[1]}`, product });
      }
      return out;
    },
  },
  {
    id: "euvd-kev",
    url: ({ since, today }) => `https://euvdservices.enisa.europa.eu/api/search?exploited=true&fromUpdatedDate=${since}&toUpdatedDate=${today}&size=100`,
    parse(body, { since }) {
      const out = [];
      for (const v of JSON.parse(body).items || []) {
        const date = euvdDay(v.exploitedSince);
        const product = productOf(euvdPairs(v));
        if (!date || date < since || !product) continue;
        const cve = cveOf(v.aliases);
        const ref = cve || v.id;
        const text = fit(`ENISA: ${an(product)} ${product} vulnerability (${ref}) is exploited in the wild`);
        if (text) out.push({ date, text, source: `https://euvd.enisa.europa.eu/vulnerability/${v.id}`, product, cve });
      }
      return out;
    },
  },
  {
    id: "cisa-kev",
    url: () => "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    parse(body, { since }) {
      const out = [];
      for (const v of JSON.parse(body).vulnerabilities || []) {
        const product = productOf([[v.vendorProject, v.product]]);
        if (!product || !v.dateAdded || v.dateAdded < since) continue;
        const name = String(v.vulnerabilityName || "").replace(/\s+Vulnerability$/i, "");
        const text = fit(
          `CISA: ${name} (${v.cveID}) is exploited in the wild`,
          `CISA: ${an(product)} ${product} vulnerability (${v.cveID}) is exploited in the wild`,
        );
        if (text) out.push({ date: v.dateAdded, text, source: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, product, cve: v.cveID });
      }
      return out;
    },
  },
  {
    id: "php",
    url: () => "https://www.php.net/feed.atom",
    parse(xml, { since }) {
      return feedItems(xml)
        .filter((it) => /^Security advisory\b/i.test(it.title) && it.date && it.date >= since)
        .map((it) => ({ date: it.date, text: fit(`PHP ${it.title.replace(/^Security advisory/i, "security advisory")}`), source: https(it.guid || it.link), product: "PHP" }))
        .filter((c) => c.text);
    },
  },
  {
    id: "nginx",
    url: () => "https://nginx.org/index.rss",
    parse(xml, { since }) {
      const out = [];
      for (const it of feedItems(xml)) {
        if (!/vulnerabilit/i.test(it.title)) continue;
        const date = it.guid.match(/#(\d{4}-\d{2}-\d{2})/)?.[1] || it.date;
        if (!date || date < since) continue;
        const versions = unique([...it.title.matchAll(/nginx-(\d+\.\d+\.\d+)/g)].map((m) => m[1]));
        const cves = unique(it.title.match(/CVE-\d{4}-\d{4,}/g) || []);
        if (!versions.length || !cves.length) continue;
        const head = `nginx ${list(versions)} fix ${plural(cves.length, "vulnerability", "vulnerabilities")}`;
        out.push({ date, text: fit(`${head} (${cves.join(", ")})`, head), source: "https://nginx.org/en/security_advisories.html", product: "nginx" });
      }
      return out;
    },
  },
  {
    id: "node",
    url: () => "https://nodejs.org/en/feed/vulnerability.xml",
    parse(xml, { since }) {
      return feedItems(xml)
        .filter((it) => /security releases/i.test(it.title) && it.date && it.date >= since)
        .map((it) => ({ date: it.date, text: "Node.js announces security releases: check which release lines are affected", source: https(it.link), product: "Node.js" }));
    },
  },
  {
    id: "openssl",
    url: () => "https://openssl-library.org/news/secjson/",
    async parse(html, { since, today }, get) {
      const years = unique([since.slice(0, 4), today.slice(0, 4)]);
      const files = unique([...html.matchAll(/href="(cve-(\d{4})-\d+\.json)"/g)].filter((m) => years.includes(m[2])).map((m) => m[1])).slice(0, 40);
      const out = [];
      for (const f of files) {
        const d = JSON.parse(await get(`https://openssl-library.org/news/secjson/${f}`));
        const c = d.containers?.cna || {};
        const sev = c.metrics?.map((m) => m.other?.content?.text).find(Boolean) || "";
        const date = day(c.datePublic || d.cveMetadata?.datePublished);
        if (!/^(high|critical)$/i.test(sev) || !date || date < since) continue;
        const cve = d.cveMetadata?.cveId;
        const fixed = unique((c.affected || []).flatMap((a) => (a.versions || []).map((v) => v.lessThan)).filter(Boolean));
        const head = `OpenSSL fixes a ${sev.toLowerCase()} severity flaw (${cve})`;
        const text = fit(`${head}: ${c.title}`, fixed.length ? `${head}: update to ${list(fixed)}` : null, head);
        const source = (c.references || []).map((r) => r.url).find((u) => /\/secadv\//.test(u)) || "https://openssl-library.org/news/vulnerabilities/";
        out.push({ date, text, source: https(source), product: "OpenSSL", cve });
      }
      return out;
    },
  },
  {
    id: "httpd",
    url: () => "https://httpd.apache.org/security/json/",
    async parse(html, { since }, get) {
      // The index lists each CVE file with its last-modified time; read only recent ones.
      const files = [...html.matchAll(/href="(CVE-\d{4}-\d+\.json)">[^<]*<\/a><\/td><td align="right">(\d{4}-\d{2}-\d{2})/g)]
        .filter((m) => m[2] >= since).map((m) => m[1]);
      const out = [];
      for (const f of unique(files).slice(0, 40)) {
        const d = JSON.parse(await get(`https://httpd.apache.org/security/json/${f}`));
        const c = d.containers?.cna || {};
        const sev = c.metrics?.map((m) => m.other?.content?.text).find(Boolean) || "";
        if (!/^(important|critical)$/i.test(sev)) continue;
        const released = (c.timeline || []).find((t) => /^\d+\.\d+\.\d+ released$/.test(t.value || ""));
        const date = day(released?.time || c.datePublic || d.cveMetadata?.datePublished);
        if (!date || date < since) continue;
        const cve = d.cveMetadata?.cveId;
        const version = released?.value.split(" ")[0];
        const head = version ? `Apache httpd ${version} fixes an ${sev.toLowerCase()} flaw (${cve})` : `Apache httpd: an ${sev.toLowerCase()} flaw (${cve})`;
        const text = fit(`${head}: ${c.title}`, head);
        out.push({ date, text, source: "https://httpd.apache.org/security/vulnerabilities_24.html", product: "Apache httpd", cve });
      }
      return out;
    },
  },
  {
    id: "euvd",
    url: ({ since, today }) => `https://euvdservices.enisa.europa.eu/api/search?fromScore=9&toScore=10&fromDate=${since}&toDate=${today}&size=100`,
    parse(body, { since }) {
      // One line per runtime and day: "PHP: 2 vulnerabilities rated CVSS 9.2, fixed in ...".
      const groups = new Map();
      for (const v of JSON.parse(body).items || []) {
        const product = productOf(euvdPairs(v), { runtimeOnly: true });
        const date = euvdDay(v.datePublished);
        if (!product || !date || date < since) continue;
        const key = `${product}|${date}`;
        if (!groups.has(key)) groups.set(key, { product, date, ids: [], cves: [], scores: [], fixed: [] });
        const g = groups.get(key);
        g.ids.push(v.id);
        g.cves.push(cveOf(v.aliases) || v.id);
        g.scores.push(Number(v.baseScore) || 0);
        for (const p of v.enisaIdProduct || []) {
          const fix = String(p.product_version || "").match(/<\s*([\d.]+)\s*$/)?.[1];
          if (fix) g.fixed.push(fix);
        }
      }
      return [...groups.values()].map((g) => {
        const top = cvss(Math.max(...g.scores));
        const range = new Set(g.scores).size > 1 ? "up to " : "";
        const what = plural(g.cves.length, "vulnerability", "vulnerabilities");
        const fixed = unique(g.fixed).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
        const head = `${g.product}: ${what} rated CVSS ${range}${top}`;
        const text = fit(
          fixed.length ? `${head}, fixed in ${list(fixed)}` : null,
          `${head} (${g.cves.join(", ")})`,
          head,
        );
        return { date: g.date, text, source: `https://euvd.enisa.europa.eu/vulnerability/${g.ids[0]}`, product: g.product, cve: g.cves[0] };
      });
    },
  },
  {
    id: "npm",
    url: ({ since }) => `https://api.github.com/advisories?type=malware&ecosystem=npm&published=%3E%3D${since}&per_page=100`,
    parse(body, { since, popular }) {
      const out = [];
      for (const a of JSON.parse(body)) {
        if (a.withdrawn_at) continue;
        const names = unique((a.vulnerabilities || []).filter((v) => v.package?.ecosystem === "npm").map((v) => v.package.name)).filter((n) => popular.has(n));
        const date = day(a.published_at);
        if (!names.length || !date || date < since) continue;
        const text = fit(
          `npm: malicious versions of ${list(names)} published (${a.ghsa_id})`,
          `npm: malicious versions of ${names[0]} and ${plural(names.length - 1, "other package", "other packages")} published (${a.ghsa_id})`,
        );
        if (text) out.push({ date, text, source: a.html_url, product: "npm" });
      }
      return out;
    },
  },
];

/** Default fetcher: text body, or throws with the status. GITHUB_TOKEN is sent to api.github.com only. */
export function httpGet({ token = process.env.GITHUB_TOKEN, timeoutMs = 30_000 } = {}) {
  return async (url) => {
    const headers = { "user-agent": UA, accept: "application/json, application/xml, text/xml, */*" };
    if (token && new URL(url).host === "api.github.com") headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  };
}

/** Run every source; a failing source is reported and skipped, never fatal. */
export async function collect({ get, since, today, popular = new Set(), sources = SOURCES, log = () => {} }) {
  const ctx = { since, today, popular };
  const out = [];
  for (const s of sources) {
    try {
      const body = s.url ? await get(s.url(ctx)) : "";
      const found = (await s.parse(body, ctx, get)).filter((c) => c.text && c.date <= today);
      log(`${s.id}: ${plural(found.length, "candidate", "candidates")}`);
      out.push(...found.map((c) => ({ ...c, origin: s.id })));
    } catch (e) {
      log(`${s.id}: skipped (${e.message})`);
    }
  }
  return out;
}

const ageDays = (date, today) => (Date.parse(today) - Date.parse(date)) / 86_400_000;
const sameNews = (a, b) => a.source === b.source
  || (a.cve && b.cve && a.cve === b.cve)
  || (a.date === b.date && a.product && (b.product === a.product || new RegExp(`\\b${a.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(b.text)));

/**
 * Merge candidates into the current items: newest first, dated items still
 * ahead kept at the end (soonest first), at most `cap` items, past items older
 * than `maxAgeDays` dropped. A candidate is new when no current item has its
 * source or CVE, nor its product on the same day; sources earlier in SOURCES
 * win ties. `skip` lists sources the maintainer turned down.
 */
export function merge(items, candidates, { today, cap = 10, maxAgeDays = 365, maxNew = 5, skip = [] }) {
  const ahead = items.filter((n) => n.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const past = items.filter((n) => n.date <= today);
  const kept = past.filter((n) => ageDays(n.date, today) <= maxAgeDays);
  const skipped = new Set(skip);
  const fresh = [];
  for (const c of candidates) {
    if (skipped.has(c.source) || ageDays(c.date, today) > maxAgeDays) continue;
    if ([...past, ...fresh].some((n) => sameNews(c, n) || sameNews(n, c))) continue;
    fresh.push(c);
  }
  fresh.sort((a, b) => b.date.localeCompare(a.date));
  const added = fresh.slice(0, maxNew).map(({ date, text, source }) => ({ date, text, source }));
  // Stable: on the same day, items already on the page stay first.
  let dated = [...kept, ...added].sort((a, b) => b.date.localeCompare(a.date)).slice(0, Math.max(1, cap - ahead.length));
  if (!dated.length && !ahead.length && past.length) dated = [past[0]];
  const next = [...dated, ...ahead];
  const dropped = items.filter((n) => !next.includes(n));
  return { items: next, added: added.filter((n) => next.includes(n)), dropped };
}

export function summary({ added, dropped, log }) {
  const L = ["## News feed", ""];
  if (!added.length && !dropped.length) L.push("No change to `site/news.json`.");
  if (added.length) L.push("Added (check each line against its source before merging):", "", ...added.map((n) => `- ${n.date} · ${n.text} · ${n.source}`), "");
  if (dropped.length) L.push("Dropped (over the age limit or the cap):", "", ...dropped.map((n) => `- ${n.date} · ${n.text}`), "");
  if (log?.length) L.push("<details><summary>Sources</summary>", "", "```text", ...log.map((s) => s.replace(/```/g, "'''")), "```", "</details>", "");
  L.push("To turn an item down for good, add its source URL to `skip` in `site/news.json`.");
  return L.join("\n");
}

export async function runNewsFeed({ file, get, today = new Date().toISOString().slice(0, 10), sinceDays = 7, cap = 10, maxAgeDays = 365, maxNew = 5, popular, dryRun = false, log = console.log }) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const since = new Date(Date.parse(today) - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const lines = [];
  const note = (s) => { lines.push(s); log(s); };
  const candidates = await collect({ get, since, today, popular, log: note });
  const result = merge(doc.items, candidates, { today, cap, maxAgeDays, maxNew, skip: doc.skip || [] });
  note(`${candidates.length} candidates since ${since}, ${result.added.length} added, ${result.dropped.length} dropped.`);
  const changed = result.added.length > 0 || result.dropped.length > 0;
  if (changed && !dryRun) writeFileSync(file, JSON.stringify({ ...doc, items: result.items }, null, 2) + "\n");
  return { ...result, changed, summary: summary({ ...result, log: lines }) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { values } = parseArgs({
    options: {
      file: { type: "string", default: fileURLToPath(new URL("../../site/news.json", import.meta.url)) },
      "since-days": { type: "string", default: "7" },
      cap: { type: "string", default: "10" },
      "max-age-days": { type: "string", default: "365" },
      "max-new": { type: "string", default: "5" },
      today: { type: "string" },
      summary: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  let popular = new Set();
  try { popular = (await import("../../lib/deps/typosquat.js")).loadPopular("npm").set; } catch { /* list missing: no npm items */ }
  try {
    const r = await runNewsFeed({
      file: values.file, get: httpGet(), today: values.today, sinceDays: Number(values["since-days"]), cap: Number(values.cap),
      maxAgeDays: Number(values["max-age-days"]), maxNew: Number(values["max-new"]), popular, dryRun: values["dry-run"],
    });
    console.log(`\n${r.summary}`);
    if (values.summary) writeFileSync(values.summary, r.summary + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, r.summary + "\n");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
