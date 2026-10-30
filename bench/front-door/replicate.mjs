#!/usr/bin/env node
/**
 * E20-R runner: passes over eleven fixed lists, from one published address.
 * Protocol: docs/research/prereg/E20r-front-door-replication.md, Amendment 2.
 *
 *   node bench/front-door/replicate.mjs --self-test
 *       Loopback only: visits tests/fixtures/mock-server.js.
 *   node bench/front-door/replicate.mjs (--pass 2 | --pilot <n>) --registered E20R --lists <dir> --exclude <file> --homepage-only <file> --removals <file> [--prior-optouts <file>] [--out <dir>]
 *       The registered run. Refused unless the prereg says Registered, Amendment
 *       2 is adopted, the checkout is a clean git tree, and every list and the
 *       exclusion list match the hashes recorded there. Pass 1 ran on 30 October
 *       2026 and is refused. --pilot takes at most 50 sites across the cohorts.
 *       Rate, order and sub-measures are fixed; no flag changes them.
 *       --removals is the one list that may change after registration: a
 *       domain per line, from owners who asked to be removed. It is required,
 *       may be empty, and can only take sites out, so its hash is recorded
 *       in the manifest, not checked. --prior-optouts works the same way, for
 *       sites that opted out in an earlier pass.
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
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, statSync } from "node:fs";
import { Resolver, lookup as dnsLookup } from "node:dns/promises";
import { networkInterfaces, platform, release } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  visit, readList, readExclusions, exclusionFor, aggregate, sha256, redact, LIMITS, USER_AGENT, MIN_GROUP, STUB_DNS,
} from "./run.mjs";
import { evidenceOf } from "./classify.mjs";
import { dnsChecks, mailDomain } from "../../api/_lib/dns.mjs";
import { isPublicIp } from "../../api/_lib/guard.mjs";
import { registrableDomain } from "../../src/utils/url.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_R = join(ROOT, "docs", "research", "prereg", "E20r-front-door-replication.md");

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
// Amendment 2: more time per site, so a slow answer is not a lost site. The request rate does not change.
export const V2_LIMITS = Object.freeze({ siteBudgetMs: 15_000, siteHardCapMs: 30_000 });
export const DOMAIN_PARSER = "src/utils/url.js: common two-level suffixes, no Public Suffix List";
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

/** What one DNS query came back with. Only a resolver failure means "we don't know". */
export function dnsOutcome(e) {
  if (e?.code === "ENOTFOUND" || e?.code === "NXDOMAIN") return "nxdomain";
  if (e?.code === "ENODATA") return "nodata";
  return `resolver-failure:${e?.code || "unknown"}`;
}
const OUTCOME_RANK = (o) => (o === "answer" ? 3 : o?.startsWith("resolver-failure") ? 2 : o === "nodata" ? 1 : 0);

/**
 * DNS for one name, independent of any HTTP answer: the same SPF, DMARC and CAA
 * checks the grader uses, the DMARC record with report addresses redacted, its
 * tags, and the MX and NS labels. `outcomes` says per query what came back. A
 * value is null when the resolver failed: that is unknown, never a failed check.
 */
export async function readDomain(host, dns = {}) {
  const r = dns.resolveTxt ? null : defaultResolver();
  const answers = {};
  const outcomes = {};
  // CAA walks up from the host: the strongest outcome over the names decides.
  const note = (key, o) => { if (OUTCOME_RANK(o) >= OUTCOME_RANK(outcomes[key])) outcomes[key] = o; };
  const watched = (key, fn) => async (name) => {
    const k = typeof key === "function" ? key(name) : key;
    try {
      const a = await fn(name);
      note(k, a.length ? "answer" : "nodata");
      return a;
    } catch (e) {
      note(k, dnsOutcome(e));
      throw e;
    }
  };
  const txt = watched((n) => (n.startsWith("_dmarc.") ? "dmarc" : "txt"), async (name) => { const a = await (dns.resolveTxt ? dns.resolveTxt(name) : r.resolveTxt(name)); answers[name] = a; return a; });
  const caa = watched("caa", (name) => (dns.resolveCaa ? dns.resolveCaa(name) : r.resolveCaa(name)));
  const domain = mailDomain(host);
  const checks = await dnsChecks(host, { dns: { resolveTxt: txt, resolveCaa: caa }, dnsTimeout: DNS_TIMEOUT_MS * 3 }).catch(() => []);
  const of = (id) => { const c = checks.find((x) => x.id === id); return !c || c.weight === 0 ? null : c.passed; };
  const records = (answers[`_dmarc.${domain}`] || []).map((t) => (Array.isArray(t) ? t.join("") : String(t))).filter((t) => /^v=DMARC1\s*(;|$)/i.test(t.trim()));
  const tags = records.length === 1 ? dmarcTags(records[0]) : { p: null, sp: null, pct: null };
  const spf = of("spf"), dmarc = of("dmarc");
  const both = spf === null || dmarc === null ? null : spf && dmarc;
  const providers = await dnsProviders(domain, { mx: watched("mx", dns.mx ?? ((d) => defaultResolver().resolveMx(d))), ns: watched("ns", dns.ns ?? ((d) => defaultResolver().resolveNs(d))) });
  for (const key of ["txt", "dmarc", "caa", "mx", "ns"]) outcomes[key] ??= "resolver-failure:timeout";
  return {
    domain, ...providers, outcomes,
    // false only on NXDOMAIN, null when the resolver failed.
    exists: outcomes.ns === "nxdomain" ? false : outcomes.ns.startsWith("resolver-failure") ? null : true,
    spf, dmarc, caa: of("caa"), "spf+dmarc": both,
    // The registered measure reads p alone. This one also needs full coverage: no pct under 100, no sp=none.
    "spf+dmarc-full": both === null ? null : both && (tags.pct === null || tags.pct === "100") && tags.sp !== "none",
    dmarcTags: tags,
    dmarcRecord: redact(records.join(" | ")).slice(0, 400),
  };
}

/** The listed domain always, and the final domain when a redirect ended on another organization. */
export async function siteDns(host, finalHost, dns = {}) {
  const listed = await readDomain(host.replace(/^www\./, ""), dns);
  const moved = finalHost && registrableDomain(finalHost) !== registrableDomain(host);
  return { listed, ...(moved ? { final: await readDomain(finalHost, dns) } : {}) };
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
 * The pilot: `n` sites, taken in turn from each cohort's own seeded order, so
 * every list is present. Sites the run would not visit are left out first.
 */
export function pilotSample(rows, n, { seed = PASS_SEED.pilot, exclude = new Map() } = {}) {
  const usable = rows.filter((r) => !exclusionFor(r.host, exclude));
  const queues = Object.keys(R_COHORTS).map((c) => shuffled(usable.filter((r) => r.cohorts[c]), seed));
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

/** Throws unless this pass may leave loopback. */
export function authorizeR({ loopback, registered, pass, listHashes = {}, excludeHash, homepageOnlyHash, preregText, tree = {}, removals }) {
  if (loopback) return { mode: "loopback" };
  if (registered !== "E20R") throw new Error("Refused: this run would reach other hosts. It needs --registered E20R, after the maintainer registered the protocol (AGENTS.md rule 6).");
  if (pass === 1) throw new Error("Refused: pass 1 ran on 30 October 2026.");
  if (!PASS_SEED[pass]) throw new Error("Refused: use --pass 2 or --pilot <n>.");
  if (!/^\|\s*Status\s*\|\s*\*\*Registered\./m.test(preregText)) throw new Error("Refused: the E20-R prereg's status is not Registered.");
  if (!/^\|\s*Amendment 2\s*\|\s*\*\*Adopted\./m.test(preregText)) throw new Error("Refused: Amendment 2 is not adopted in the prereg.");
  if (!tree.commit) throw new Error("Refused: not a git checkout, so the deployed code would be unknown.");
  if (tree.dirty) throw new Error("Refused: the git tree is dirty. A registered run needs a clean checkout.");
  if (removals === undefined) throw new Error("Refused: a registered run needs --removals <file>. It may be empty.");
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

/** Domains to skip: one per line, # comments, subdomains included. */
export function readRemovals(text, category = "removed") {
  const out = new Map();
  for (const raw of String(text).split(/\r?\n/)) {
    const d = raw.split("#")[0].trim().toLowerCase();
    if (d) out.set(d, category);
  }
  return out;
}

/** The commit and whether the tree is clean, or nulls outside a git checkout. */
export function gitState(cwd = ROOT, run = execFileSync) {
  try {
    const git = (...args) => run("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain").length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

/** How many public IPv4 addresses this machine holds. The published address must be the only one. */
export function sourceAddressCount(interfaces = networkInterfaces()) {
  return Object.values(interfaces).flat().filter((a) => a.family === "IPv4" && !a.internal && isPublicIp(a.address)).length;
}

const fileHash = (path) => (existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null);

/** What ran, where: written at the start of a run and again at the end. */
export function runManifest(extra = {}) {
  return {
    study: "E20-R", git: gitState(),
    lockfileSha256: fileHash(join(ROOT, "package-lock.json")),
    classifierSha256: fileHash(join(ROOT, "bench", "front-door", "classify.mjs")),
    node: process.version, os: `${platform()} ${release()}`,
    sourceIpv4Count: sourceAddressCount(),
    domainParser: DOMAIN_PARSER,
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
    cohorts[cohort] = { ...aggregate(rows, { cohort }), labels, mailProviders: floor(mx), dnsProviders: floor(ns) };
  }
  return { experiment: "E20-R", ...meta, cohorts };
}

/** One pass. `rows` come from mergeCohorts. Appends each record to raw.jsonl. */
export async function runPass(rows, { pass, out, loopbackPort, exclude = new Map(), homepageOnlyHosts = new Set(), appPage = true, delayMs = LIMITS.delayMs, concurrency = LIMITS.concurrency, dns = {}, meta = {}, manifest = {}, onRecord } = {}) {
  if (!loopbackPort) { concurrency = LIMITS.concurrency; delayMs = LIMITS.delayMs; }
  const order = shuffled(rows, PASS_SEED[pass]);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, ".gitignore"), "*\n");
  const raw = join(out, "raw.jsonl");
  if (existsSync(raw) && statSync(raw).size) throw new Error(`Refused: ${raw} already holds a run.`);
  writeFileSync(raw, "");
  const started = runManifest({ kind: pass === "pilot" ? "pilot" : "pass", pass, seed: PASS_SEED[pass], limits: V2_LIMITS, loopback: Boolean(loopbackPort), sites: order.length, startedAt: new Date().toISOString(), ...manifest });
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
        // § 3: a health site, or one on a homepage-only list, never gets the app page, whatever other list it is on.
        const homepageOnly = homepageOnlyHosts.has(row.host.replace(/^www\./, "")) || Object.keys(row.cohorts).some((c) => R_COHORTS[c]?.homepageOnly);
        record = { ...row, ...(await visit(row, { loopbackPort, appPage: appPage && !homepageOnly, exclude, lookup, evidence: evidenceOf, strict: true, budgetMs: V2_LIMITS.siteBudgetMs, hardCapMs: V2_LIMITS.siteHardCapMs })) };
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
  const agg = aggregateR(records, { pass, ...meta, concurrency, delayMs, appPage, userAgent: USER_AGENT, order: "seeded shuffle", seed: PASS_SEED[pass] });
  writeFileSync(join(out, "aggregate.json"), JSON.stringify(agg, null, 2) + "\n");
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ ...started, git: gitState(), finishedAt: new Date().toISOString(), records: records.length }, null, 2) + "\n");
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
    const { records, aggregate: agg } = await runPass(rows, { pass: 2, out: dir, loopbackPort: mock.port, delayMs: 0, appPage: false, dns: { mx: stub, ns: stub }, meta: { selfTest: true } });
    const problems = [];
    if (mock.requests.filter((r) => r.url === "/").length !== 2) problems.push("a host on two lists must be visited once");
    if (records.some((r) => r.status !== "ok")) problems.push("expected every site to be graded");
    if (!records.every((r) => r.evidence?.class?.label && r.evidence?.classRegistered?.label)) problems.push("a record has no label");
    if (!records.every((r) => r.dns?.listed && r.robots?.length)) problems.push("a record has no DNS or robots outcome");
    if (!JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).finishedAt) problems.push("the manifest has no end");
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
  if (!dir) { console.error("Usage: node bench/front-door/replicate.mjs --self-test | (--pass 2 | --pilot <n>) --registered E20R --lists <dir> --exclude <file> --homepage-only <file> --removals <file> [--prior-optouts <file>] [--out <dir>]"); return 2; }
  if (pilot !== null && !(Number.isInteger(pilot) && pilot >= 1 && pilot <= PILOT_MAX)) { console.error(`--pilot takes 1 to ${PILOT_MAX} sites.`); return 2; }
  const excludeBytes = flag(args, "--exclude") ? readFileSync(flag(args, "--exclude")) : null;
  const homepageBytes = flag(args, "--homepage-only") ? readFileSync(flag(args, "--homepage-only")) : null;
  const bytes = Object.fromEntries(Object.entries(R_COHORTS).map(([c, { file }]) => [c, existsSync(join(dir, file)) ? readFileSync(join(dir, file)) : null]));
  const removalsBytes = flag(args, "--removals") ? readFileSync(flag(args, "--removals")) : null;
  const priorBytes = flag(args, "--prior-optouts") ? readFileSync(flag(args, "--prior-optouts")) : null;
  try {
    authorizeR({
      registered: flag(args, "--registered"), pass,
      listHashes: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, b ? sha256(b) : null])),
      excludeHash: excludeBytes ? sha256(excludeBytes) : undefined,
      homepageOnlyHash: homepageBytes ? sha256(homepageBytes) : undefined,
      preregText: existsSync(PREREG_R) ? readFileSync(PREREG_R, "utf8") : "",
      tree: gitState(), removals: removalsBytes ?? undefined,
    });
  } catch (e) {
    console.error(e.message);
    return 3;
  }
  const lists = Object.fromEntries(Object.entries(R_COHORTS).map(([c, { format }]) => [c, readList(bytes[c].toString("utf8"), format)]));
  const removals = readRemovals(removalsBytes.toString("utf8"));
  const prior = priorBytes ? readRemovals(priorBytes.toString("utf8"), "opted-out-earlier") : new Map();
  const exclude = new Map([...readExclusions(excludeBytes.toString("utf8")), ...prior, ...removals]);
  const rows = pilot === null ? mergeCohorts(lists) : pilotSample(mergeCohorts(lists), pilot, { exclude });
  const out = resolve(flag(args, "--out") || join(ROOT, "bench", "front-door", "results", `e20r-${pilot === null ? `pass${pass}` : "pilot"}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  const { aggregate: agg } = await runPass(rows, {
    pass, out, exclude,
    manifest: {
      listSha256: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, sha256(b)])), exclusionSha256: sha256(excludeBytes), homepageOnlySha256: sha256(homepageBytes),
      removals: { used: true, count: removals.size, sha256: sha256(removalsBytes) },
      priorOptOuts: priorBytes ? { used: true, count: prior.size, sha256: sha256(priorBytes) } : { used: false },
    },
    homepageOnlyHosts: new Set(homepageBytes.toString("utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean)),
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
