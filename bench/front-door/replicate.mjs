#!/usr/bin/env node
/**
 * E20-R runner: two passes over six fixed lists, from one published address.
 * Protocol: docs/research/prereg/E20R-front-door-replication.md.
 *
 *   node bench/front-door/replicate.mjs --self-test
 *       Loopback only: visits tests/fixtures/mock-server.js.
 *   node bench/front-door/replicate.mjs --pass 1|2 --registered E20R --lists <dir> --exclude <file> [--out <dir>]
 *       The registered pass. Refused unless the prereg says Registered and
 *       every list and the exclusion list match the hashes recorded there.
 *       Rate, order and sub-measures are fixed; no flag changes them.
 *
 * Reuses the E20 visit (run.mjs): the requests and the grader are unchanged.
 * New per site: stored evidence and a response label (classify.mjs), and the
 * MX and NS provider of the domain (a label only). A host on two lists is
 * visited once per pass and counted in both. IPv4 only, so that one published
 * address accounts for every request. raw.jsonl is private; aggregate.json
 * names no site.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { lookup as dnsLookup, resolveMx, resolveNs } from "node:dns/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  visit, readList, readExclusions, exclusionFor, aggregate, sha256, LIMITS, USER_AGENT, MIN_GROUP,
} from "./run.mjs";
import { evidenceOf } from "./classify.mjs";
import { registrableDomain } from "../../src/utils/url.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_R = join(ROOT, "docs", "research", "prereg", "E20R-front-door-replication.md");

// § 3: cohort, list file, list format, and the label its hash has in the prereg.
export const R_COHORTS = Object.freeze({
  T1k: { file: "tranco-ZJ8PG-top1000.csv", format: "tranco" },
  "YC-new": { file: "yc-fall2026-summer2026-2026-10-29.csv", format: "yc" },
  "YC-25": { file: "yc-2025.csv", format: "yc" },
  "YC-old": { file: "yc-old.csv", format: "yc" },
  T100k: { file: "tranco-ZJ8PG-10k-100k-sample.csv", format: "tranco" },
  EU: { file: "eu-indexes.csv", format: "yc" },
});
export const PASS_SEED = Object.freeze({ 1: 2020, 2: 2021 });
export const R_EXCLUSION_LABEL = "E20-R exclusion list";

export const MX_RULES = Object.freeze([
  ["google", /(^|\.)(google|googlemail)\.com$/i], ["microsoft", /\.outlook\.com$/i], ["proofpoint", /pphosted\.com$/i],
  ["mimecast", /mimecast\.com$/i], ["amazon", /amazonaws\.com$|amazonses\.com$/i], ["zoho", /zoho\./i], ["proton", /protonmail\.ch$/i],
]);
export const NS_RULES = Object.freeze([
  ["cloudflare", /\.ns\.cloudflare\.com$/i], ["route53", /awsdns/i], ["google", /googledomains\.com$|\.google$|google\.com$/i],
  ["vercel", /vercel-dns\.com$/i], ["godaddy", /domaincontrol\.com$/i], ["namecheap", /registrar-servers\.com$/i], ["akamai", /akam\.net$/i],
]);
const providerOf = (host, rules) => rules.find(([, re]) => re.test(host))?.[0] ?? "other";

/** One provider label for a domain's MX and NS records. Only the label is kept. */
export async function dnsProviders(domain, { mx = resolveMx, ns = resolveNs } = {}) {
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

/** One row per host; `cohorts` lists every list it is on, each with its rank and group. */
export function mergeCohorts(lists) {
  const byHost = new Map();
  for (const [cohort, rows] of Object.entries(lists)) {
    for (const { host, rank, group } of rows) {
      if (!byHost.has(host)) byHost.set(host, { host, cohorts: {} });
      byHost.get(host).cohorts[cohort] = { rank, group };
    }
  }
  return [...byHost.values()];
}

/** The hash the prereg records for a cohort list, or null. */
export function recordedHashR(preregText, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\|\\s*${esc} SHA-256\\s*\\|\\s*\`([0-9a-f]{64})\``).exec(preregText);
  return m ? m[1] : null;
}

/** Throws unless this pass may leave loopback. */
export function authorizeR({ loopback, registered, pass, listHashes = {}, excludeHash, preregText }) {
  if (loopback) return { mode: "loopback" };
  if (registered !== "E20R") throw new Error("Refused: this run would reach other hosts. It needs --registered E20R, after the maintainer registered the protocol (AGENTS.md rule 6).");
  if (!PASS_SEED[pass]) throw new Error("Refused: --pass must be 1 or 2.");
  if (!/^\|\s*Status\s*\|\s*\*\*Registered\./m.test(preregText)) throw new Error("Refused: the E20-R prereg's status is not Registered.");
  for (const cohort of Object.keys(R_COHORTS)) {
    const recorded = recordedHashR(preregText, `${cohort} list`);
    if (!recorded) throw new Error(`Refused: the prereg records no ${cohort} list SHA-256.`);
    if (recorded !== listHashes[cohort]) throw new Error(`Refused: the ${cohort} list does not match the prereg.`);
  }
  const ex = recordedHashR(preregText, R_EXCLUSION_LABEL);
  if (!ex) throw new Error(`Refused: the prereg records no ${R_EXCLUSION_LABEL} SHA-256.`);
  if (ex !== excludeHash) throw new Error("Refused: the exclusion list does not match the prereg.");
  return { mode: "registered" };
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
export async function runPass(rows, { pass, out, loopbackPort, exclude = new Map(), appPage = true, delayMs = LIMITS.delayMs, concurrency = LIMITS.concurrency, dns = {}, meta = {}, onRecord } = {}) {
  if (!loopbackPort) { concurrency = LIMITS.concurrency; delayMs = LIMITS.delayMs; }
  const order = shuffled(rows, PASS_SEED[pass]);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, ".gitignore"), "*\n");
  const raw = join(out, "raw.jsonl");
  writeFileSync(raw, "");
  const lookup = loopbackPort ? undefined : ipv4Lookup;
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
        record = { ...row, ...(await visit(row, { loopbackPort, appPage, exclude, lookup, evidence: evidenceOf })) };
        if (record.status === "ok") record.dnsProviders = await dnsProviders(registrableDomain(record.finalHost), dns);
      }
      records[k] = record;
      appendFileSync(raw, JSON.stringify({ pass, order: k, ...record }) + "\n");
      onRecord?.(record, k);
      if (next < order.length && delayMs) await sleep(delayMs);
    }
  }));
  const agg = aggregateR(records, { pass, ...meta, concurrency, delayMs, appPage, userAgent: USER_AGENT, order: "seeded shuffle", seed: PASS_SEED[pass] });
  writeFileSync(join(out, "aggregate.json"), JSON.stringify(agg, null, 2) + "\n");
  return { records, aggregate: agg };
}

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
    const { records, aggregate: agg } = await runPass(rows, { pass: 1, out: dir, loopbackPort: mock.port, delayMs: 0, appPage: false, dns: { mx: stub, ns: stub }, meta: { selfTest: true } });
    const problems = [];
    if (mock.requests.filter((r) => r.url === "/").length !== 2) problems.push("a host on two lists must be visited once");
    if (records.some((r) => r.status !== "ok")) problems.push("expected every site to be graded");
    if (!records.every((r) => r.evidence?.class?.label)) problems.push("a record has no label");
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
  const dir = flag(args, "--lists"), pass = Number(flag(args, "--pass"));
  if (!dir) { console.error("Usage: node bench/front-door/replicate.mjs --self-test | --pass 1|2 --registered E20R --lists <dir> --exclude <file> [--out <dir>]"); return 2; }
  const excludeBytes = flag(args, "--exclude") ? readFileSync(flag(args, "--exclude")) : null;
  const bytes = Object.fromEntries(Object.entries(R_COHORTS).map(([c, { file }]) => [c, existsSync(join(dir, file)) ? readFileSync(join(dir, file)) : null]));
  try {
    authorizeR({
      registered: flag(args, "--registered"), pass,
      listHashes: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, b ? sha256(b) : null])),
      excludeHash: excludeBytes ? sha256(excludeBytes) : undefined,
      preregText: existsSync(PREREG_R) ? readFileSync(PREREG_R, "utf8") : "",
    });
  } catch (e) {
    console.error(e.message);
    return 3;
  }
  const lists = Object.fromEntries(Object.entries(R_COHORTS).map(([c, { format }]) => [c, readList(bytes[c].toString("utf8"), format)]));
  const rows = mergeCohorts(lists);
  const out = resolve(flag(args, "--out") || join(ROOT, "bench", "front-door", "results", `e20r-pass${pass}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  const { aggregate: agg } = await runPass(rows, {
    pass, out, exclude: readExclusions(excludeBytes.toString("utf8")),
    meta: { listSha256: Object.fromEntries(Object.entries(bytes).map(([c, b]) => [c, sha256(b)])), exclusionSha256: sha256(excludeBytes), startedFrom: process.version },
    onRecord: (r, k) => process.stderr.write(`\r${k + 1}/${rows.length} ${r.status.padEnd(9)}`),
  });
  process.stderr.write("\n");
  console.log(`E20-R pass ${pass}: ${Object.entries(agg.cohorts).map(([c, a]) => `${c} ${a.sites.visited}/${a.sites.listed}`).join(", ")}. Raw (private): ${join(out, "raw.jsonl")}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
