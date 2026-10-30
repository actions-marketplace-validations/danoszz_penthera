#!/usr/bin/env node
/**
 * E20-R runner: passes over eleven fixed lists, from one published address.
 * Protocol: docs/research/prereg/E20r-front-door-replication.md, Amendment 2.
 *
 *   node bench/front-door/replicate.mjs --self-test
 *       Loopback only: visits tests/fixtures/mock-server.js.
 *   node bench/front-door/replicate.mjs (--pass 2 | --pilot <n>) --registered E20R --lists <dir> --exclude <file> --homepage-only <file> --removals <file> --prior-optouts <file> --pilot-dropped <file>
 *       The registered run. Refused unless the prereg says Registered, Amendment
 *       2 is adopted, no placeholder is left, the checkout is a clean commit on
 *       origin/main, this machine's one public IPv4 is the registered address, the
 *       classifier and suffix list match their frozen hashes, and every list
 *       matches its hash. Pass 1 ran on 30 October 2026 and is refused. --pilot
 *       takes at most 50 sites from the claim lists and writes pilot-sites.txt.
 *       Pass 2 needs that list as --pilot-dropped, and has one fixed output
 *       folder, so a second start can't revisit sites. Rate, order and sub-measures
 *       are fixed; no flag changes them. --removals and --prior-optouts are required
 *       and may be empty. They can only take sites out, so their hashes are
 *       recorded in the manifest, not checked.
 *
 * Reuses the E20 visit (run.mjs) under the strict robots rules: robots.txt at
 * every origin, RFC 9309 for an unreadable file, and the exclusion list on every
 * hop. The grader is unchanged. New per site: stored evidence and response
 * labels (classify.mjs), and DNS read on the listed domain whether or not HTTP
 * worked. Never a way around a bot defense: one honest User-Agent, one address,
 * no browser or TLS imitation, no challenge solving, no retry after a block
 * (Amendment 2). A host on two lists is visited once per pass and counted in both.
 * IPv4 only, so that one published address accounts for every request.
 * raw.jsonl is private; aggregate.json names no site; manifest.json records
 * the code and environment at the start and at the end.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, statSync } from "node:fs";
import { Resolver, lookup as dnsLookup } from "node:dns/promises";
import { networkInterfaces, platform, release } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  visit, readList, readExclusions, exclusionFor, hostOf, aggregate, sha256, redact, LIMITS, USER_AGENT, OPT_OUT_TOKENS, MIN_GROUP, STUB_DNS, ROBOTS_REDIRECTS, ROBOTS_MAX_BYTES,
} from "./run.mjs";
import { evidenceOf, EXCERPT_BYTES, INPUT_CAP_CHARS, PAGE_TEXT_CHARS, SOFT_MAX_CHARS } from "./classify.mjs";
import { pslSha256, PSL_VERSION, siteOrg } from "./psl.mjs";
import { dnsChecks } from "../../api/_lib/dns.mjs";
import { isPublicIp } from "../../api/_lib/guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_R = join(ROOT, "docs", "research", "prereg", "E20r-front-door-replication.md");
export const STUDY_PAGE = join(ROOT, "site", "pages", "research-e20.md");
export const CLASSIFIER = join(ROOT, "bench", "front-door", "classify.mjs");
export const PASS2_OUT = join(ROOT, "bench", "front-door", "results", "e20r-pass2");

// § 3: cohort, list file, list format, and the label its hash has in the prereg.
export const R_COHORTS = Object.freeze({
  T1k: { file: "tranco-ZJ8PG-top1000.csv", format: "tranco" },
  "YC-new": { file: "yc-fall2026-summer2026-2026-10-29.csv", format: "yc" },
  "YC-25": { file: "yc-2025.csv", format: "yc" },
  "YC-old": { file: "yc-old.csv", format: "yc" },
  "YC-scale": { file: "yc-scale.csv", format: "yc" },
  T10k: { file: "tranco-ZJ8PG-1k-10k-sample.csv", format: "tranco" },
  T100k: { file: "tranco-ZJ8PG-10k-100k-sample.csv", format: "tranco" },
  Europe: { file: "europe-indexes.csv", format: "yc" },
  ShowHN: { file: "showhn-sample.csv", format: "yc" },
  SP500: { file: "sp500.csv", format: "yc" },
  "NL-Cbw": { file: "nl-cbw.csv", format: "yc", homepageOnly: true },
});
// Pass 1 ran with 2020. Pass 2 keeps the seed § 5 registered for it. The pilot draws its sample and its order from its own.
export const PASS_SEED = Object.freeze({ 1: 2020, 2: 2021, pilot: 2026 });
export const PILOT_MAX = 50;
// Amendment 2: more time per site, so a slow answer is not a lost site. Per-request timeouts stay 6 s and 4 s, and the request rate does not change.
export const V2_LIMITS = Object.freeze({ siteBudgetMs: 15_000, siteHardCapMs: 30_000 });
// Amendment 2: the cohorts claims C1 to C11 use. Pilot sites come from these and leave pass 2.
export const CLAIM_COHORTS = Object.freeze(["T1k", "YC-new", "YC-25", "YC-old", "T100k"]);
export const R_EXCLUSION_LABEL = "E20-R exclusion list";
export const R_HOMEPAGE_LABEL = "E20-R homepage-only list";

export const MX_RULES = Object.freeze([
  ["google", /(^|\.)(google|googlemail)\.com$/i], ["microsoft", /\.outlook\.com$/i], ["proofpoint", /pphosted\.com$/i],
  ["mimecast", /mimecast\.com$/i], ["amazon", /amazonaws\.com$|amazonses\.com$/i], ["zoho", /zoho\./i], ["proton", /protonmail\.ch$/i],
]);
export const NS_RULES = Object.freeze([
  ["cloudflare", /\.ns\.cloudflare\.com$/i], ["route53", /awsdns/i], ["google", /googledomains\.com$|\.google$|google\.com$/i],
  ["vercel", /vercel-dns\.com$/i], ["godaddy", /domaincontrol\.com$/i], ["namecheap", /registrar-servers\.com$/i], ["akamai", /akam\.net$/i],
]);
const providerOf = (host, rules) => rules.find(([, re]) => re.test(host))?.[0] ?? "other";

const defaultResolver = () => new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
export const DNS_TIMEOUT_MS = 5000;

/** One provider label for a domain's MX and NS records. Only the label is kept. */
export async function dnsProviders(domain, { mx = (d) => defaultResolver().resolveMx(d), ns = (d) => defaultResolver().resolveNs(d) } = {}) {
  const read = async (fn, pick, rules) => {
    try {
      const answers = (await fn(domain)).map(pick).filter(Boolean);
      if (!answers.length) return "none";
      const labels = [...new Set(answers.map((h) => providerOf(String(h).replace(/\.$/, ""), rules)))].sort();
      return labels.join("+");
    } catch (e) {
      return e?.code === "ENODATA" || e?.code === "ENOTFOUND" ? "none" : "unknown";
    }
  };
  return { mx: await read(mx, (r) => r.exchange, MX_RULES), ns: await read(ns, (r) => r, NS_RULES) };
}

/** p, sp and pct of a DMARC record, lower case, or null when absent. */
export function dmarcTags(record) {
  const tag = (name) => new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;\\s]+)`, "i").exec(String(record))?.[1]?.toLowerCase() ?? null;
  return { p: tag("p"), sp: tag("sp"), pct: tag("pct") };
}

const POLICIES = new Set(["none", "quarantine", "reject"]);

/**
 * One name's DMARC reading, by RFC 7489 (Amendment 2 says why). A record counts
 * only when it is the one v=DMARC1 record and has a known `p`. `inherited` means
 * it came from the organization domain, where `sp` then applies. `declared` reads
 * `p` alone. `enforcing` is the applicable policy with `pct` above 0. `pct` and
 * `sp` stay apart: `partial` and `spNone` report them, and neither fails a domain.
 */
export function dmarcReading(records, { inherited = false } = {}) {
  const found = records.filter((t) => /^v=DMARC1\s*(;|$)/i.test(t.trim()));
  const tags = found.length === 1 ? dmarcTags(found[0]) : { p: null, sp: null, pct: null };
  const valid = found.length === 1 && POLICIES.has(tags.p);
  const policy = valid ? (inherited && POLICIES.has(tags.sp) ? tags.sp : tags.p) : null;
  const n = /^\d{1,3}$/.test(tags.pct ?? "") ? Number(tags.pct) : 100;
  const pct = n > 100 ? 100 : n;
  const strong = policy === "quarantine" || policy === "reject";
  return {
    valid, records: found.length, inherited, policy, pct,
    declared: valid && (tags.p === "quarantine" || tags.p === "reject"),
    enforcing: strong && pct > 0,
    reject: policy === "reject" && pct > 0,
    partial: strong && pct > 0 && pct < 100,
    spNone: tags.sp === "none",
  };
}

/** What one DNS query came back with. Only a resolver failure means "we don't know". */
export function dnsOutcome(e) {
  if (e?.code === "ENOTFOUND" || e?.code === "NXDOMAIN") return "nxdomain";
  if (e?.code === "ENODATA") return "nodata";
  return `resolver-failure:${e?.code || "unknown"}`;
}
const OUTCOME_RANK = (o) => (o === "answer" ? 3 : o?.startsWith("resolver-failure") ? 2 : o === "nodata" ? 1 : 0);
const failedRead = (o) => o?.startsWith("resolver-failure");

/**
 * RFC 8659 § 3: the first name with CAA records decides, from the host up its
 * parents, TLD included, root excluded. `found` is null when the resolver failed
 * before an answer, so unknown is never "no CAA".
 */
export async function caaTree(host, resolveCaa) {
  const labels = String(host).toLowerCase().replace(/\.+$/, "").split(".");
  for (let i = 0; i < Math.min(labels.length, 16); i++) {
    const name = labels.slice(i).join(".");
    try {
      const found = await resolveCaa(name);
      if (found.length) return { found: true, at: name, inherited: i > 0, issuers: found.map((r) => r.issue ?? r.issuewild).filter((v) => v !== undefined).slice(0, 8) };
    } catch (e) {
      const outcome = dnsOutcome(e);
      if (failedRead(outcome)) return { found: null, at: name, outcome };
    }
  }
  return { found: false };
}

const both = (a, b) => (a === null || b === null ? null : a && b);

/**
 * DNS for one name, independent of any HTTP answer. Beside the registered reading
 * (the grader's checks, on its own parser's domain): the SPF record as published,
 * DMARC by `dmarcReading` on the host, then on the organization domain, CAA by
 * `caaTree`, and the MX and NS labels. `outcomes` says per query what came back.
 * A value is null when the resolver failed: that is unknown, never a failed check.
 */
export async function readDomain(host, dns = {}) {
  const r = dns.resolveTxt ? null : defaultResolver();
  const mailHost = String(host).toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
  const domain = siteOrg(mailHost);
  const outcomes = {};
  // CAA walks up from the host: the strongest outcome over the names decides.
  const note = (key, o) => { if (OUTCOME_RANK(o) >= OUTCOME_RANK(outcomes[key])) outcomes[key] = o; };
  const watched = (keyOf, fn) => {
    const asked = new Map();
    return (name) => {
    if (!asked.has(name)) {
      asked.set(name, (async () => {
        const key = keyOf(name);
        try {
          const a = await fn(name);
          note(key, a.length ? "answer" : "nodata");
          return a;
        } catch (e) {
          note(key, dnsOutcome(e));
          throw e;
        }
      })());
    }
    return asked.get(name);
    };
  };
  const txt = watched((n) => (n === domain ? "txt" : n === `_dmarc.${domain}` ? "dmarc" : "other"), (n) => (dns.resolveTxt ? dns.resolveTxt(n) : r.resolveTxt(n)));
  const caa = watched(() => "caa", (n) => (dns.resolveCaa ? dns.resolveCaa(n) : r.resolveCaa(n)));
  const read = async (name) => {
    try {
      return { records: (await txt(name)).map((t) => (Array.isArray(t) ? t.join("") : String(t))) };
    } catch (e) {
      return { records: [], failed: failedRead(dnsOutcome(e)) };
    }
  };
  const checks = await dnsChecks(mailHost, { dns: { resolveTxt: txt, resolveCaa: caa }, dnsTimeout: DNS_TIMEOUT_MS * 3 }).catch(() => []);
  const of = (id) => { const c = checks.find((x) => x.id === id); return !c || c.weight === 0 ? null : c.passed; };
  const spfRead = await read(domain);
  const spfRecords = spfRead.records.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  const own = mailHost === domain ? null : await read(`_dmarc.${mailHost}`);
  const ownRecord = own && dmarcReading(own.records).records > 0;
  const orgRead = ownRecord ? null : await read(`_dmarc.${domain}`);
  const dmarcFailed = Boolean(own?.failed || orgRead?.failed);
  const dmarcRecords = ownRecord ? own.records : orgRead.records;
  const reading = dmarcReading(dmarcRecords, { inherited: Boolean(own) && !ownRecord });
  const nullable = (v) => (dmarcFailed ? null : v);
  const spfPresent = spfRead.failed ? null : spfRecords.length === 1;
  const spf = of("spf"), dmarc = of("dmarc");
  const providers = await dnsProviders(domain, { mx: watched(() => "mx", dns.mx ?? ((d) => defaultResolver().resolveMx(d))), ns: watched(() => "ns", dns.ns ?? ((d) => defaultResolver().resolveNs(d))) });
  for (const key of ["txt", "dmarc", "caa", "mx", "ns"]) outcomes[key] ??= "resolver-failure:timeout";
  return {
    domain, ...providers, outcomes,
    // false only on NXDOMAIN, null when the resolver failed.
    exists: outcomes.ns === "nxdomain" ? false : failedRead(outcomes.ns) ? null : true,
    // The registered reading.
    spf, dmarc, caa: of("caa"), "spf+dmarc": both(spf, dmarc),
    // Amendment 2. A record that exists: includes, redirects and lookup limits are not validated.
    spfRecordPresent: spfPresent,
    spfRecord: spfRecords.join(" | ").slice(0, 2048),
    dmarcReading: { ...reading, declared: nullable(reading.declared), enforcing: nullable(reading.enforcing), reject: nullable(reading.reject) },
    "spf-record+dmarc-declared": both(spfPresent, nullable(reading.declared)),
    "spf-record+dmarc-enforcing": both(spfPresent, nullable(reading.enforcing)),
    "spf-record+dmarc-reject": both(spfPresent, nullable(reading.reject)),
    dmarcTags: dmarcRecords.filter((t) => /^v=DMARC1/i.test(t.trim())).length === 1 ? dmarcTags(dmarcRecords.find((t) => /^v=DMARC1/i.test(t.trim()))) : { p: null, sp: null, pct: null },
    dmarcRecord: redact(dmarcRecords.filter((t) => /^v=DMARC1/i.test(t.trim())).join(" | ")).slice(0, 400),
    caaTree: await caaTree(String(host).replace(/\.+$/, ""), caa),
  };
}

/**
 * The listed name always. When a redirect ended on another organization, its
 * name too. When it ended on another host of the same one, that host's CAA.
 */
export async function siteDns(host, finalHost, dns = {}) {
  const listed = await readDomain(host, dns);
  if (!finalHost || isIP(finalHost.replace(/^\[|\]$/g, "")) || finalHost === host) return { listed };
  if (siteOrg(finalHost) !== siteOrg(host)) return { listed, final: await readDomain(finalHost, dns) };
  const r = dns.resolveCaa ? null : defaultResolver();
  return { listed, finalCaa: await caaTree(finalHost, dns.resolveCaa ?? ((n) => r.resolveCaa(n))) };
}

/** mulberry32, so an order can be rebuilt from its seed. */
export function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** § 5: Fisher–Yates over the rows, sorted by host first so the file order cannot matter. */
export function shuffled(rows, seed) {
  const a = [...rows].sort((x, y) => (x.host < y.host ? -1 : x.host > y.host ? 1 : 0));
  const r = seeded(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One row per site; `cohorts` lists every list it is on, each with its rank and
 * group. example.com and www.example.com are one site: one visit per site.
 */
export function mergeCohorts(lists) {
  const bySite = new Map();
  for (const [cohort, rows] of Object.entries(lists)) {
    for (const { host, rank, group } of rows) {
      const site = host.replace(/^www\./, "");
      if (!bySite.has(site)) bySite.set(site, { host, cohorts: {} });
      bySite.get(site).cohorts[cohort] = { rank, group };
    }
  }
  return [...bySite.values()];
}

/**
 * The pilot: `n` sites, taken in turn from each claim list's own seeded order.
 * Sites the run would not visit are left out first, and that includes earlier
 * pilot sites, so a rerun after a rule change draws other sites.
 */
export function pilotSample(rows, n, { seed = PASS_SEED.pilot, exclude = new Map() } = {}) {
  const usable = rows.filter((r) => !exclusionFor(r.host, exclude));
  const queues = CLAIM_COHORTS.map((c) => shuffled(usable.filter((r) => r.cohorts[c]), seed));
  const picked = new Map();
  for (let i = 0; picked.size < n && queues.some((q) => i < q.length); i++) {
    for (const q of queues) {
      if (i < q.length && picked.size < n) picked.set(q[i].host, q[i]);
    }
  }
  return [...picked.values()];
}

/** The hash the prereg records for a cohort list, or null. */
export function recordedHashR(preregText, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\|\\s*${esc} SHA-256\\s*\\|\\s*\`([0-9a-f]{64})\``).exec(preregText);
  return m ? m[1] : null;
}

const PLACEHOLDER = /<[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+[^>]*>/;
export const sourceAddressOf = (preregText) => /^\|\s*Source address\s*\|\s*`([\d.]+)`/m.exec(preregText)?.[1] ?? null;

/** Throws unless this pass may leave loopback. */
export function authorizeR({ loopback, registered, pass, listHashes = {}, excludeHash, homepageOnlyHash, preregText, pageText = "", tree = {}, sourceIps = [], removals, priorOptOuts, pilotDropped, classifierHash, pslHash }) {
  if (loopback) return { mode: "loopback" };
  if (registered !== "E20R") throw new Error("Refused: this run would reach other hosts. It needs --registered E20R, after the maintainer registered the protocol (AGENTS.md rule 6).");
  if (pass === 1) throw new Error("Refused: pass 1 ran on 30 October 2026.");
  if (!PASS_SEED[pass]) throw new Error("Refused: use --pass 2 or --pilot <n>.");
  if (!/^\|\s*Status\s*\|\s*\*\*Registered\./m.test(preregText)) throw new Error("Refused: the E20-R prereg's status is not Registered.");
  if (!/^\|\s*Amendment 2\s*\|\s*\*\*Adopted\./m.test(preregText)) throw new Error("Refused: Amendment 2 is not adopted in the prereg.");
  for (const [name, text] of [["prereg", preregText], ["study page", pageText]]) {
    const left = PLACEHOLDER.exec(text);
    if (left) throw new Error(`Refused: the ${name} still holds the placeholder ${left[0]}.`);
  }
  if (!pageText) throw new Error("Refused: the study page could not be read.");
  if (!tree.commit) throw new Error("Refused: not a git checkout, so the deployed code would be unknown.");
  if (tree.dirty) throw new Error("Refused: the git tree is dirty. A registered run needs a clean checkout.");
  if (!tree.onMain) throw new Error("Refused: this commit is not on origin/main. Fetch, and run a merged commit.");
  const address = sourceAddressOf(preregText);
  if (sourceIps.length !== 1 || sourceIps[0] !== address) throw new Error(`Refused: this machine needs exactly one public IPv4, the registered ${address}. It has ${sourceIps.length}.`);
  if (removals === undefined) throw new Error("Refused: a registered run needs --removals <file>. It may be empty.");
  if (priorOptOuts === undefined) throw new Error("Refused: a registered run needs --prior-optouts <file>.");
  if (pass === 2 && !pilotDropped?.length) throw new Error("Refused: pass 2 needs --pilot-dropped <file>, the sites the pilot used.");
  const frozen = recordedHashR(preregText, "Frozen classifier");
  if (!frozen || frozen !== classifierHash) throw new Error("Refused: classify.mjs does not match the frozen classifier hash.");
  const psl = recordedHashR(preregText, "Public Suffix List");
  if (!psl || psl !== pslHash) throw new Error("Refused: the Public Suffix List does not match its frozen hash.");
  for (const cohort of Object.keys(R_COHORTS)) {
    const recorded = recordedHashR(preregText, `${cohort} list`);
    if (!recorded) throw new Error(`Refused: the prereg records no ${cohort} list SHA-256.`);
    if (recorded !== listHashes[cohort]) throw new Error(`Refused: the ${cohort} list does not match the prereg.`);
  }
  const ex = recordedHashR(preregText, R_EXCLUSION_LABEL);
  if (!ex) throw new Error(`Refused: the prereg records no ${R_EXCLUSION_LABEL} SHA-256.`);
  if (ex !== excludeHash) throw new Error("Refused: the exclusion list does not match the prereg.");
  const ho = recordedHashR(preregText, R_HOMEPAGE_LABEL);
  if (!ho) throw new Error(`Refused: the prereg records no ${R_HOMEPAGE_LABEL} SHA-256.`);
  if (ho !== homepageOnlyHash) throw new Error("Refused: the homepage-only list does not match the prereg.");
  return { mode: "registered" };
}

/** A host from a list cell, as a URL or a name: lower case, no trailing dot, no www. Throws on anything else. */
export function normalizeHost(cell) {
  const host = hostOf(cell).replace(/\.+$/, "").replace(/^www\./, "");
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) throw new Error(`not a host name: "${String(cell).trim()}"`);
  return host;
}

const listLines = (text) => String(text).split(/\r?\n/).map((l) => l.split("#")[0].trim()).filter(Boolean);

/** Domains to skip: one per line, # comments, subdomains included. A line that names no host throws. */
export function readRemovals(text, category = "removed") {
  const out = new Map();
  for (const line of listLines(text)) {
    if (/\s/.test(line)) throw new Error(`expected one host per line, got "${line}"`);
    out.set(normalizeHost(line), category);
  }
  return out;
}

/** The homepage-only list, normalized as a removal list is. */
export const readHostList = (text) => new Set(listLines(text).map(normalizeHost));

/** Entries that match no row: a stale or mistyped entry would silently protect nothing. */
export function unmatchedHosts(entries, rows) {
  const listed = new Set(rows.map((r) => r.host.replace(/^www\./, "")));
  return [...entries].filter((h) => !listed.has(h));
}

/** The commit, whether the tree is clean, and whether the commit is on origin/main. */
export function gitState(cwd = ROOT, run = execFileSync) {
  const git = (...args) => run("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const state = { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain").length > 0, onMain: false };
    try {
      git("merge-base", "--is-ancestor", "HEAD", "origin/main");
      state.onMain = true;
    } catch { /* not an ancestor, or no origin/main */ }
    return state;
  } catch {
    return { commit: null, dirty: null, onMain: false };
  }
}

/** This machine's public IPv4 addresses. The published address must be the only one. */
export function sourceAddresses(interfaces = networkInterfaces()) {
  return Object.values(interfaces).flat().filter((a) => a.family === "IPv4" && !a.internal && isPublicIp(a.address)).map((a) => a.address);
}
export const sourceAddressCount = (interfaces) => sourceAddresses(interfaces).length;

const fileHash = (path) => (existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null);
const STUDY_CODE = Object.freeze(["bench/front-door/run.mjs", "bench/front-door/replicate.mjs", "bench/front-door/classify.mjs", "bench/front-door/psl.mjs", "bench/front-door/analyze-r.mjs", "api/_lib/tier1.mjs", "api/_lib/page.mjs", "api/_lib/guard.mjs", "api/_lib/dns.mjs", "api/_lib/grade.mjs"]);
let runtimeHash = null;

/** The protocol's Amendment 2 section alone, so a later edit elsewhere can be told apart. */
export const amendmentText = (preregText) => { const i = preregText.indexOf("## Amendment 2"); return i < 0 ? "" : preregText.slice(i); };

export const runConfig = () => ({
  limits: V2_LIMITS, concurrency: LIMITS.concurrency, delayMs: LIMITS.delayMs, userAgent: USER_AGENT, optOutTokens: OPT_OUT_TOKENS,
  strictRobots: true, appPage: false, robotsRedirects: ROBOTS_REDIRECTS, robotsMaxBytes: ROBOTS_MAX_BYTES, requestTimeoutsMs: { page: 6000, robots: 4000, securityTxt: 4000 },
  dnsTimeoutMs: DNS_TIMEOUT_MS, excerptBytes: EXCERPT_BYTES, pageTextChars: PAGE_TEXT_CHARS, softMaxChars: SOFT_MAX_CHARS, inputCapChars: INPUT_CAP_CHARS, seeds: PASS_SEED, pilotMax: PILOT_MAX,
});

/** What ran, where: written at the start of a run and again at the end. */
export function runManifest(extra = {}) {
  const prereg = existsSync(PREREG_R) ? readFileSync(PREREG_R, "utf8") : "";
  runtimeHash ??= fileHash(process.execPath);
  return {
    study: "E20-R2", git: gitState(),
    lockfileSha256: fileHash(join(ROOT, "package-lock.json")),
    classifierSha256: fileHash(CLASSIFIER),
    protocolSha256: sha256(prereg), amendmentSha256: sha256(amendmentText(prereg)), studyPageSha256: fileHash(STUDY_PAGE),
    codeSha256: sha256(STUDY_CODE.map((f) => `${f} ${fileHash(join(ROOT, f))}`).join("\n")),
    node: process.version, runtimeSha256: runtimeHash, os: `${platform()} ${release()}`,
    sourceIpv4Count: sourceAddressCount(),
    psl: { ...PSL_VERSION, sha256: pslSha256() },
    config: runConfig(),
    ...extra,
  };
}

/** § 5: IPv4 only, so one published address accounts for every request. */
export const ipv4Lookup = (host, opts = {}) => dnsLookup(host, { ...opts, family: 4 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The per-cohort aggregates. No host in the output, and no group under MIN_GROUP. */
export function aggregateR(records, meta = {}) {
  const cohorts = {};
  for (const cohort of new Set(records.flatMap((r) => Object.keys(r.cohorts)))) {
    const rows = records.filter((r) => r.cohorts[cohort]).map((r) => ({ ...r, rank: r.cohorts[cohort].rank, group: r.cohorts[cohort].group }));
    const ok = rows.filter((r) => r.status === "ok");
    const labels = {}, mx = {}, ns = {};
    for (const r of ok) {
      const l = r.evidence?.class?.label ?? "unknown";
      labels[l] = (labels[l] || 0) + 1;
      if (r.dnsProviders) { mx[r.dnsProviders.mx] = (mx[r.dnsProviders.mx] || 0) + 1; ns[r.dnsProviders.ns] = (ns[r.dnsProviders.ns] || 0) + 1; }
    }
    const floor = (o) => { const out = { other: 0 }; for (const [k, v] of Object.entries(o)) { if (v >= MIN_GROUP) out[k] = v; else out.other += v; } return out; };
    const hosts = {
      graded: ok.length,
      finalHostDiffers: ok.filter((r) => r.redirectClass && r.redirectClass !== "none").length,
      finalOrgDiffers: ok.filter((r) => r.redirectClass === "other-org").length,
    };
    cohorts[cohort] = { ...aggregate(rows, { cohort }, { orgOf: siteOrg }), labels, hosts, mailProviders: floor(mx), dnsProviders: floor(ns) };
  }
  return { experiment: "E20-R", ...meta, cohorts };
}

/** One pass. `rows` come from mergeCohorts. Appends each record to raw.jsonl. */
export async function runPass(rows, { pass, out, loopbackPort, exclude = new Map(), delayMs = LIMITS.delayMs, concurrency = LIMITS.concurrency, dns = {}, meta = {}, manifest = {}, onRecord } = {}) {
  if (!loopbackPort) { concurrency = LIMITS.concurrency; delayMs = LIMITS.delayMs; }
  const order = shuffled(rows, PASS_SEED[pass]);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, ".gitignore"), "*\n");
  const raw = join(out, "raw.jsonl");
  if ((existsSync(raw) && statSync(raw).size) || existsSync(join(out, "manifest.json"))) throw new Error(`Refused: ${out} already holds a run.`);
  writeFileSync(raw, "");
  const started = runManifest({ kind: pass === "pilot" ? "pilot" : "pass", pass, seed: PASS_SEED[pass], loopback: Boolean(loopbackPort), sites: order.length, startedAt: new Date().toISOString(), ...manifest });
  if (pass === "pilot") writeFileSync(join(out, "pilot-sites.txt"), order.map((r) => r.host.replace(/^www\./, "")).join("\n") + "\n");
  writeFileSync(join(out, "manifest.json"), JSON.stringify(started, null, 2) + "\n");
  const lookup = loopbackPort ? undefined : ipv4Lookup;
  // Loopback runs never touch a real resolver.
  const stub = () => Promise.reject(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
  const dnsAnswers = loopbackPort ? { ...STUB_DNS, mx: stub, ns: stub, ...dns } : dns;
  const records = new Array(order.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, order.length) }, async () => {
    while (next < order.length) {
      const k = next++;
      const row = order[k];
      const category = exclusionFor(row.host, exclude);
      let record;
      if (category) record = { ...row, at: new Date().toISOString(), status: "excluded", reason: "exclusion_list", category };
      else {
        // Amendment 2: no app page, for any site. `appPage` is not passed, and `strict` refuses it anyway.
        record = { ...row, ...(await visit(row, { loopbackPort, exclude, lookup, evidence: evidenceOf, strict: true, budgetMs: V2_LIMITS.siteBudgetMs, hardCapMs: V2_LIMITS.siteHardCapMs })) };
        record.listedHost = row.host;
        record.listedOrg = siteOrg(row.host);
        if (record.finalHost) {
          record.finalOrg = siteOrg(record.finalHost);
          record.redirectClass = record.finalHost === row.host ? "none" : record.finalOrg === record.listedOrg ? "same-org" : "other-org";
        }
        if (readsDns(record)) {
          record.dns = await siteDns(row.host, record.finalHost, dnsAnswers);
          if (record.status === "ok") {
            const { mx, ns } = record.dns.final ?? record.dns.listed;
            record.dnsProviders = { mx, ns };
          }
        }
      }
      records[k] = record;
      appendFileSync(raw, JSON.stringify({ pass, order: k, ...record }) + "\n");
      onRecord?.(record, k);
      if (next < order.length && delayMs) await sleep(delayMs);
    }
  }));
  const agg = aggregateR(records, { pass, ...meta, concurrency, delayMs, appPage: false, userAgent: USER_AGENT, order: "seeded shuffle", seed: PASS_SEED[pass] });
  writeFileSync(join(out, "aggregate.json"), JSON.stringify(agg, null, 2) + "\n");
  const sum = (k) => records.reduce((n, r) => n + (r.counters?.[k] ?? 0), 0);
  writeFileSync(join(out, "manifest.json"), JSON.stringify({
    ...started, git: gitState(), finishedAt: new Date().toISOString(), records: records.length,
    totals: { requests: sum("requests"), bytes: sum("bytes"), redirects: sum("redirects") },
    classifierUnchanged: fileHash(CLASSIFIER) === started.classifierSha256,
    rawSha256: fileHash(raw), aggregateSha256: fileHash(join(out, "aggregate.json")),
  }, null, 2) + "\n");
  return { records, aggregate: agg };
}

// DNS goes to public resolvers, not to the site, but a site that said stop stays out.
const NO_DNS = new Set(["robots_disallow_all", "not_a_homepage", "exclusion_list"]);
const readsDns = (r) => r.status !== "opted_out" && !NO_DNS.has(r.reason);

/** Loopback self-test: three names on two lists, all pinned to the mock server. */
export async function selfTestR({ out } = {}) {
  const { startMockServer } = await import(pathToFileURL(join(ROOT, "tests", "fixtures", "mock-server.js")).href);
  const mock = await startMockServer(0);
  try {
    const rows = mergeCohorts({
      T1k: [{ host: "site-1.e20r-selftest.example.com", rank: 1, group: "com" }, { host: "both.e20r-selftest.example.com", rank: 2, group: "com" }],
      "YC-new": [{ host: "both.e20r-selftest.example.com", rank: 1, group: "Fall 2026" }],
    });
    const stub = () => Promise.reject(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
    const dir = out || join(ROOT, "bench", "front-door", "results", `e20r-selftest-${Date.now()}`);
    const { records, aggregate: agg } = await runPass(rows, { pass: 2, out: dir, loopbackPort: mock.port, delayMs: 0, dns: { mx: stub, ns: stub }, meta: { selfTest: true } });
    const problems = [];
    if (mock.requests.filter((r) => r.url === "/").length !== 2) problems.push("a host on two lists must be visited once");
    if (records.some((r) => r.status !== "ok")) problems.push("expected every site to be graded");
    if (!records.every((r) => r.evidence?.class?.label && r.evidence?.classRegistered?.label)) problems.push("a record has no label");
    if (!records.every((r) => r.dns?.listed && r.robots?.length && r.counters?.requests && r.listedOrg && r.finalOrg)) problems.push("a record has no DNS, robots, counter or organization field");
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    if (!manifest.finishedAt || !manifest.rawSha256) problems.push("the manifest has no end");
    if (JSON.stringify(agg).includes("e20r-selftest")) problems.push("aggregate names a site");
    return { ok: problems.length === 0, problems, out: dir, aggregate: agg };
  } finally {
    await mock.close();
  }
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

async function main(args) {
  if (args.includes("--self-test")) {
    const r = await selfTestR({ out: flag(args, "--out") });
    console.log(r.ok ? `E20-R self-test passed, all to 127.0.0.1 (${r.out})` : `E20-R self-test FAILED:\n  ${r.problems.join("\n  ")}`);
    return r.ok ? 0 : 1;
  }
  const dir = flag(args, "--lists");
  const pilot = args.includes("--pilot") ? Number(flag(args, "--pilot")) : null;
  const pass = pilot === null ? Number(flag(args, "--pass")) : "pilot";
  if (!dir) { console.error("Usage: node bench/front-door/replicate.mjs --self-test | (--pass 2 | --pilot <n>) --registered E20R --lists <dir> --exclude <file> --homepage-only <file> --removals <file> --prior-optouts <file> --pilot-dropped <file>"); return 2; }
  if (pilot === null && flag(args, "--out")) { console.error(`Pass 2 has one output folder: ${PASS2_OUT}.`); return 2; }
  if (pilot !== null && !(Number.isInteger(pilot) && pilot >= 1 && pilot <= PILOT_MAX)) { console.error(`--pilot takes 1 to ${PILOT_MAX} sites.`); return 2; }
  const excludeBytes = flag(args, "--exclude") ? readFileSync(flag(args, "--exclude")) : null;
  const homepageBytes = flag(args, "--homepage-only") ? readFileSync(flag(args, "--homepage-only")) : null;
  const bytes = Object.fromEntries(Object.entries(R_COHORTS).map(([c, { file }]) => [c, existsSync(join(dir, file)) ? readFileSync(join(dir, file)) : null]));
  const removalsBytes = flag(args, "--removals") ? readFileSync(flag(args, "--removals")) : null;
  const priorBytes = flag(args, "--prior-optouts") ? readFileSync(flag(args, "--prior-optouts")) : null;
  const pilotBytes = flag(args, "--pilot-dropped") ? readFileSync(flag(args, "--pilot-dropped")) : null;
  let lists, exclude, rows, removals, prior, pilotDropped;
  try {
    authorizeR({
      registered: flag(args, "--registered"), pass,
      listHashes: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, b ? sha256(b) : null])),
      excludeHash: excludeBytes ? sha256(excludeBytes) : undefined,
      homepageOnlyHash: homepageBytes ? sha256(homepageBytes) : undefined,
      preregText: existsSync(PREREG_R) ? readFileSync(PREREG_R, "utf8") : "",
      pageText: existsSync(STUDY_PAGE) ? readFileSync(STUDY_PAGE, "utf8") : "",
      tree: gitState(), sourceIps: sourceAddresses(),
      removals: removalsBytes ?? undefined, priorOptOuts: priorBytes ?? undefined, pilotDropped: pilotBytes ?? undefined,
      classifierHash: fileHash(CLASSIFIER), pslHash: pslSha256(),
    });
    lists = Object.fromEntries(Object.entries(R_COHORTS).map(([c, { format }]) => [c, readList(bytes[c].toString("utf8"), format)]));
    removals = readRemovals(removalsBytes.toString("utf8"));
    prior = readRemovals(priorBytes.toString("utf8"), "opted-out-earlier");
    pilotDropped = pilotBytes ? readRemovals(pilotBytes.toString("utf8"), "pilot") : new Map();
    exclude = new Map([...readExclusions(excludeBytes.toString("utf8")), ...pilotDropped, ...prior, ...removals]);
    const all = mergeCohorts(lists);
    const missing = unmatchedHosts(readHostList(homepageBytes.toString("utf8")), all);
    if (missing.length) throw new Error(`Refused: ${missing.length} homepage-only entries match no listed site.`);
    rows = pilot === null ? all : pilotSample(all, pilot, { exclude });
  } catch (e) {
    console.error(e.message);
    return 3;
  }
  const out = pilot === null ? PASS2_OUT : resolve(flag(args, "--out") || join(ROOT, "bench", "front-door", "results", `e20r-pilot-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  const { aggregate: agg } = await runPass(rows, {
    pass, out, exclude,
    manifest: {
      listSha256: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, sha256(b)])), exclusionSha256: sha256(excludeBytes), homepageOnlySha256: sha256(homepageBytes),
      removals: { used: true, count: removals.size, sha256: sha256(removalsBytes) },
      priorOptOuts: { used: true, count: prior.size, sha256: sha256(priorBytes) },
      pilotDropped: { used: Boolean(pilotBytes), count: pilotDropped.size, sha256: pilotBytes ? sha256(pilotBytes) : null },
    },
    meta: { listSha256: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, sha256(b)])), exclusionSha256: sha256(excludeBytes), startedFrom: process.version },
    onRecord: (r, k) => process.stderr.write(`\r${k + 1}/${rows.length} ${r.status.padEnd(9)}`),
  });
  process.stderr.write("\n");
  console.log(`E20-R ${pilot === null ? `pass ${pass}` : "pilot"}: ${Object.entries(agg.cohorts).map(([c, a]) => `${c} ${a.sites.visited}/${a.sites.listed}`).join(", ")}. Raw (private): ${join(out, "raw.jsonl")}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
