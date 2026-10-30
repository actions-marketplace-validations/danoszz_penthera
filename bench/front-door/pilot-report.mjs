#!/usr/bin/env node
/**
 * E20-R pilot report: what a run's raw.jsonl holds, as counts only. No site is
 * named, so the output can be read and pasted anywhere.
 *
 *   node bench/front-door/pilot-report.mjs <raw.jsonl> --exclude <exclusion list> --skip <host list>... [--seal]
 *
 * Pass the removal, prior opt-out and earlier pilot lists as --skip, so every hop meets all
 * four. Sealing checks each against the run's manifest. This round's own list is not one.
 * --seal writes pilot-result.json next to the raw file, which pass 2 requires. Seal
 * before pruning: the report reads the excerpts that pruning deletes.
 *
 * Exits 1 when a stop rule of Amendment 2 fires, so a miss holds the full run.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordMisses, resolverFailed, MAX_RESOLVER_FAILURES } from "./record-checks.mjs";
import { readRemovals } from "./replicate.mjs";
import { exclusionFor, readExclusions } from "./run.mjs";

const tally = (items) => {
  const t = {};
  for (const k of items) t[k] = (t[k] || 0) + 1;
  return Object.fromEntries(Object.entries(t).sort(([, a], [, b]) => b - a));
};

/**
 * Counts for one run. `records` come from raw.jsonl; `exclude` is every skip list, to
 * check every hop. `pruned` says the text is gone, so its absence is no failure.
 */
export function pilotReport(records, { exclude = new Map(), pruned = false } = {}) {
  const ok = records.filter((r) => r.status === "ok");
  const dns = records.filter((r) => r.dns?.listed);
  const answered = (id) => dns.filter((r) => r.dns.listed[id] !== null).length;
  const misses = { ipv4: 0, ipv6: 0, email: 0, query: 0, fragment: 0, jwt: 0, longHex: 0, longNumber: 0 };
  for (const r of records) for (const [k, v] of Object.entries(recordMisses(r))) misses[k] += v;
  const sum = (k) => records.reduce((n, r) => n + (r.counters?.[k] ?? 0), 0);
  const twoxx = ok.filter((r) => r.httpStatus >= 200 && r.httpStatus < 300);
  return {
    sites: records.length, pruned,
    resolverFailures: records.filter(resolverFailed).length,
    outcomes: tally(records.map((r) => (r.status === "error" ? `error:${r.error}` : r.reason ? `${r.status}:${r.reason}` : r.status))),
    labels: tally(ok.map((r) => r.evidence?.class?.label ?? "none")),
    labelsRegistered: tally(ok.map((r) => r.evidence?.classRegistered?.label ?? "none")),
    rules: tally(ok.map((r) => r.evidence?.class?.rule ?? "none")),
    labelChanges: tally(ok.filter((r) => r.evidence?.class?.label !== r.evidence?.classRegistered?.label).map((r) => `${r.evidence?.classRegistered?.label} to ${r.evidence?.class?.label}`)),
    evidence: {
      graded: ok.length,
      withEvidence: ok.filter((r) => r.evidence).length,
      twoxx: twoxx.length,
      twoxxWithExcerpt: twoxx.filter((r) => r.evidence?.pageExcerpt?.text || r.evidence?.pageExcerpt?.title).length,
      outside2xxWithExcerpt: ok.filter((r) => r.evidence?.excerpt).length,
      withBodyHashes: ok.filter((r) => r.evidence?.bodySha256 && (r.evidence?.others ?? []).every((o) => o.bodySha256)).length,
    },
    dns: {
      read: dns.length, ungraded: dns.filter((r) => r.status !== "ok").length, finalDomainToo: dns.filter((r) => r.dns.finalOtherOrg).length,
      domainExists: dns.filter((r) => r.dns.listed.exists).length,
      answered: { spf: answered("spf"), dmarc: answered("dmarc"), caa: answered("caa") },
      withDmarcRecord: dns.filter((r) => r.dns.listed.dmarcRecord).length,
      outcomes: Object.fromEntries(["txt", "dmarc", "caa", "mx", "ns"].map((k) => [k, tally(dns.map((r) => r.dns.listed.outcomes?.[k] ?? "none"))])),
    },
    tls: {
      invalid: records.filter((r) => r.error === "tls_invalid").length,
      reasons: tally(records.map((r) => r.tlsReason ?? r.httpsFailed?.tlsReason).filter(Boolean)),
      fellBackToHttp: records.filter((r) => r.httpsFailed).length,
    },
    robots: {
      outcomes: tally(records.flatMap((r) => r.robots ?? []).map((o) => (o.error ? `error:${o.error}` : `${Math.floor(o.status / 100)}xx`))),
      originsPerSite: tally(records.filter((r) => r.robots).map((r) => r.robots.length)),
    },
    hosts: tally(ok.map((r) => r.redirectClass ?? "none")),
    counters: { requests: sum("requests"), bytes: sum("bytes"), redirects: sum("redirects"), maxRequestsPerSite: Math.max(0, ...records.map((r) => r.counters?.requests ?? 0)) },
    excludedHops: records.flatMap((r) => r.hops ?? []).filter((h) => exclusionFor(h, exclude)).length,
    csp: { present: ok.filter((r) => r.evidence?.csp?.present).length, controlsScripts: ok.filter((r) => r.evidence?.csp?.controlsScripts).length },
    scrubMisses: misses,
  };
}

// A visit's own budget allows 20 requests; more means the limit failed.
const MAX_REQUESTS_PER_SITE = 20;
// A run that barely reached anything tells nothing about its instrument. Pass 1 graded 84% of what it could.
export const MIN_GRADED_SHARE = 0.5;
// A pilot too small to see these rates can't pass them.
export const MIN_ELIGIBLE = 30;
export const MIN_GRADED = 20;
export { MAX_RESOLVER_FAILURES };

/** Amendment 2's stop rules, as counts. Any entry stops the run until it is explained. */
export function stopRules(report, { floors = true } = {}) {
  const stop = [];
  if (Object.values(report.scrubMisses).some(Boolean)) stop.push("a privacy scrub missed something");
  if ((report.outcomes["error:internal"] ?? 0) > 0) stop.push("an internal error");
  if (!report.pruned && report.evidence.twoxx && report.evidence.twoxxWithExcerpt < report.evidence.twoxx * 0.9) stop.push("under 90% of 2xx responses have an excerpt");
  const eligible = report.sites - Object.entries(report.outcomes).filter(([k]) => /^(opted_out|excluded:(robots_disallow_all|robots_disallow_path|not_a_homepage|exclusion_list))$/.test(k)).reduce((n, [, v]) => n + v, 0);
  if (report.dns.read < eligible) stop.push("a site with no DNS read");
  if (report.counters.maxRequestsPerSite > MAX_REQUESTS_PER_SITE) stop.push(`a site took more than ${MAX_REQUESTS_PER_SITE} requests`);
  if (report.excludedHops) stop.push("a request reached an excluded host");
  if (eligible && report.evidence.graded / eligible < MIN_GRADED_SHARE) stop.push("under half of the eligible sites were graded");
  if (eligible && report.resolverFailures / eligible > MAX_RESOLVER_FAILURES) stop.push("over 20% of sites hit a resolver failure");
  if (eligible && report.evidence.twoxx === 0) stop.push("no site answered with a 2xx");
  if (report.dns.read && report.dns.answered.spf / report.dns.read < 1 - MAX_RESOLVER_FAILURES) stop.push("over 20% of SPF reads got no answer");
  if (report.dns.read && report.dns.answered.dmarc / report.dns.read < 1 - MAX_RESOLVER_FAILURES) stop.push("over 20% of DMARC reads got no answer");
  if (floors && eligible === 0) stop.push("no eligible site");
  else if (floors && eligible < MIN_ELIGIBLE) stop.push(`under ${MIN_ELIGIBLE} eligible sites`);
  if (floors && eligible && report.evidence.graded < MIN_GRADED) stop.push(`under ${MIN_GRADED} graded sites`);
  return stop;
}

const hash = (b) => createHash("sha256").update(b).digest("hex");

/**
 * The machine-checked result pass 2 reads: pilot-result.json, next to the run, bound to
 * its manifest and raw file. A run that changed under it, or whose raw file isn't
 * the one the manifest hashed, can't pass.
 */
export function sealPilot(dir, { exclude = new Map(), exclusionBytes, skipBytes = [] } = {}) {
  const manifestBytes = readFileSync(join(dir, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const rawBytes = readFileSync(join(dir, "raw.jsonl"));
  const report = pilotReport(rawBytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), { exclude });
  const stop = stopRules(report);
  if (existsSync(join(dir, "prune-manifest.json"))) stop.push("sealed after pruning: seal first, while the excerpts exist");
  else if (hash(rawBytes) !== manifest.rawSha256) stop.push("the raw file is not the one the manifest hashed");
  if (!manifest.finishedAt) stop.push("the run did not finish");
  if (!manifest.immutableAtFinish?.ok) stop.push("something changed while it ran");
  // The hop check is only as good as its lists, so they must be this run's own.
  const lists = { exclusionSha256: manifest.exclusionSha256 ?? null, removals: manifest.removals?.sha256 ?? null, priorOptOuts: manifest.priorOptOuts?.sha256 ?? null, pilotDropped: manifest.pilotDropped?.sha256 ?? null };
  const given = skipBytes.map(hash);
  if (!exclusionBytes || hash(exclusionBytes) !== lists.exclusionSha256) stop.push("--exclude is not the list this run used");
  for (const name of ["removals", "priorOptOuts", "pilotDropped"]) if (lists[name] && !given.includes(lists[name])) stop.push(`--skip is missing the run's ${name} list`);
  if (given.some((h) => ![lists.removals, lists.priorOptOuts, lists.pilotDropped].includes(h))) stop.push("a --skip file is not one of this run's lists");
  const result = { passed: stop.length === 0, stop, manifestSha256: hash(manifestBytes), rawSha256: manifest.rawSha256 ?? null, reportSha256: hash(JSON.stringify(report)), lists, sealedAt: new Date().toISOString() };
  writeFileSync(join(dir, "pilot-result.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  return { ...result, report };
}

export function main(args, { log = console.log, fail = console.error } = {}) {
  const i = args.indexOf("--exclude");
  const file = args.find((a, k) => !a.startsWith("--") && !["--exclude", "--skip"].includes(args[k - 1]));
  if (!file || i < 0) { fail("Usage: pilot-report.mjs <raw.jsonl> --exclude <exclusion list> --skip <host list>... [--seal]"); return 2; }
  const skips = args.flatMap((a, k) => (a === "--skip" ? [args[k + 1]] : []));
  if (args.includes("--seal") && !skips.length) { fail("--seal needs --skip for the removal, prior opt-out and earlier pilot lists."); return 2; }
  const exclusionBytes = readFileSync(args[i + 1]);
  const skipBytes = skips.map((f) => readFileSync(f));
  const exclude = new Map([...readExclusions(exclusionBytes.toString("utf8")), ...skipBytes.flatMap((b) => [...readRemovals(b.toString("utf8"), "skip")])]);
  if (args.includes("--seal")) {
    if (!existsSync(join(dirname(file), "manifest.json"))) { fail("--seal needs the run's manifest.json next to the raw file."); return 2; }
    const { report, ...result } = sealPilot(dirname(file), { exclude, exclusionBytes, skipBytes });
    log(JSON.stringify({ ...report, ...result }, null, 2));
    return result.passed ? 0 : 1;
  }
  const records = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const report = pilotReport(records, { exclude, pruned: existsSync(join(dirname(file), "prune-manifest.json")) });
  const stop = stopRules(report);
  log(JSON.stringify({ ...report, stop }, null, 2));
  return stop.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
