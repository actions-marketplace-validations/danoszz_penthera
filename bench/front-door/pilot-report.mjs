#!/usr/bin/env node
/**
 * E20-R pilot report: what a run's raw.jsonl holds, as counts only. No site is
 * named, so the output can be read and pasted anywhere.
 *
 *   node bench/front-door/pilot-report.mjs <raw.jsonl> --exclude <exclusion list> [--seal]
 *
 * --seal writes pilot-result.json next to the raw file, which pass 2 requires. Seal
 * before pruning: the report reads the excerpts that pruning deletes.
 *
 * Exits 1 when a stop rule of Amendment 2 fires, so a miss holds the full run.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scrubMisses } from "./classify.mjs";
import { exclusionFor, readExclusions } from "./run.mjs";

const tally = (items) => {
  const t = {};
  for (const k of items) t[k] = (t[k] || 0) + 1;
  return Object.fromEntries(Object.entries(t).sort(([, a], [, b]) => b - a));
};

// The stored text fields of one record. Header names and hashes hold no quote.
function storedText(r) {
  const e = r.evidence;
  return [
    e?.excerpt, e?.pageExcerpt?.title, e?.pageExcerpt?.text, e?.pageExcerpt?.noscript,
    ...Object.values(e?.values ?? {}), ...(e?.cookieNames ?? []),
    ...(e?.others ?? []).flatMap((o) => [o.excerpt, ...Object.values(o.values ?? {}), ...(o.cookieNames ?? [])]),
    ...[r.dns?.listed, r.dns?.final].filter(Boolean).flatMap((d) => [d.dmarcRecord, ...Object.values(d.dmarcTags ?? {}), ...(d.caaTree?.issuers ?? [])]),
    ...(e?.headerNames ?? []), ...(e?.others ?? []).flatMap((o) => o.headerNames ?? []),
    ...(r.checks ?? []).map((c) => c.evidence),
    ...(r.app?.checks ?? []).map((c) => c.evidence),
  ].filter(Boolean);
}

// SPF records list mail servers by address on purpose, so addresses don't count here.
const spfText = (r) => [r.dns?.listed?.spfRecord, r.dns?.final?.spfRecord].filter(Boolean);

/** Counts for one run. `records` come from raw.jsonl; `exclude` is the exclusion list, to check every hop. */
export function pilotReport(records, { exclude = new Map() } = {}) {
  const ok = records.filter((r) => r.status === "ok");
  const dns = records.filter((r) => r.dns?.listed);
  const answered = (id) => dns.filter((r) => r.dns.listed[id] !== null).length;
  const misses = { ipv4: 0, ipv6: 0, email: 0, query: 0, fragment: 0, jwt: 0, longHex: 0, longNumber: 0 };
  for (const text of records.flatMap(storedText)) for (const [k, v] of Object.entries(scrubMisses(text))) misses[k] += v;
  for (const text of records.flatMap(spfText)) for (const [k, v] of Object.entries(scrubMisses(text))) if (k !== "ipv4" && k !== "ipv6") misses[k] += v;
  const sum = (k) => records.reduce((n, r) => n + (r.counters?.[k] ?? 0), 0);
  const twoxx = ok.filter((r) => r.httpStatus >= 200 && r.httpStatus < 300);
  return {
    sites: records.length,
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

/** Amendment 2's stop rules, as counts. Any entry stops the run until it is explained. */
export function stopRules(report) {
  const stop = [];
  if (Object.values(report.scrubMisses).some(Boolean)) stop.push("a privacy scrub missed something");
  if ((report.outcomes["error:internal"] ?? 0) > 0) stop.push("an internal error");
  if (report.evidence.twoxx && report.evidence.twoxxWithExcerpt < report.evidence.twoxx * 0.9) stop.push("under 90% of 2xx responses have an excerpt");
  const eligible = report.sites - Object.entries(report.outcomes).filter(([k]) => /^(opted_out|excluded:(robots_disallow_all|robots_disallow_path|not_a_homepage|exclusion_list))$/.test(k)).reduce((n, [, v]) => n + v, 0);
  if (report.dns.read < eligible) stop.push("a site with no DNS read");
  if (report.counters.maxRequestsPerSite > MAX_REQUESTS_PER_SITE) stop.push(`a site took more than ${MAX_REQUESTS_PER_SITE} requests`);
  if (report.excludedHops) stop.push("a request reached an excluded host");
  return stop;
}

const hash = (b) => createHash("sha256").update(b).digest("hex");

/**
 * The machine-checked result pass 2 reads: pilot-result.json, next to the run, bound to
 * its manifest and raw file. A run that changed under it, or whose raw file isn't
 * the one the manifest hashed, can't pass.
 */
export function sealPilot(dir, { exclude = new Map() } = {}) {
  const manifestBytes = readFileSync(join(dir, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const rawBytes = readFileSync(join(dir, "raw.jsonl"));
  const report = pilotReport(rawBytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), { exclude });
  const stop = stopRules(report);
  if (hash(rawBytes) !== manifest.rawSha256) stop.push("the raw file is not the one the manifest hashed");
  if (!manifest.finishedAt) stop.push("the run did not finish");
  if (!manifest.immutableAtFinish?.ok) stop.push("something changed while it ran");
  const result = { passed: stop.length === 0, stop, manifestSha256: hash(manifestBytes), rawSha256: manifest.rawSha256 ?? null, reportSha256: hash(JSON.stringify(report)), sealedAt: new Date().toISOString() };
  writeFileSync(join(dir, "pilot-result.json"), JSON.stringify(result, null, 2) + "\n");
  return { ...result, report };
}

function main(args) {
  const i = args.indexOf("--exclude");
  const file = args.find((a, k) => !a.startsWith("--") && k !== i + 1);
  if (!file || i < 0) { console.error("Usage: pilot-report.mjs <raw.jsonl> --exclude <exclusion list> [--seal]"); return 2; }
  const exclude = readExclusions(readFileSync(args[i + 1], "utf8"));
  if (args.includes("--seal")) {
    if (!existsSync(join(dirname(file), "manifest.json"))) { console.error("--seal needs the run's manifest.json next to the raw file."); return 2; }
    const { report, ...result } = sealPilot(dirname(file), { exclude });
    console.log(JSON.stringify({ ...report, ...result }, null, 2));
    return result.passed ? 0 : 1;
  }
  const records = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const report = pilotReport(records, { exclude });
  const stop = stopRules(report);
  console.log(JSON.stringify({ ...report, stop }, null, 2));
  return stop.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
