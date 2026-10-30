#!/usr/bin/env node
/**
 * E20-R pilot report: what a run's raw.jsonl holds, as counts only. No site is
 * named, so the output can be read and pasted anywhere.
 *
 *   node bench/front-door/pilot-report.mjs <raw.jsonl>
 *
 * Exits 1 when a scrub missed something, so a privacy miss stops the full run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scrubMisses } from "./classify.mjs";

const tally = (items) => {
  const t = {};
  for (const k of items) t[k] = (t[k] || 0) + 1;
  return Object.fromEntries(Object.entries(t).sort(([, a], [, b]) => b - a));
};

// The stored text fields of one record. Header names and hashes hold no quote.
function storedText(r) {
  const e = r.evidence;
  return [
    e?.excerpt, e?.pageExcerpt?.title, e?.pageExcerpt?.text,
    ...Object.values(e?.values ?? {}),
    ...(e?.others ?? []).flatMap((o) => [o.excerpt, ...Object.values(o.values ?? {})]),
    ...(r.checks ?? []).map((c) => c.evidence),
    ...(r.app?.checks ?? []).map((c) => c.evidence),
  ].filter(Boolean);
}

/** Counts for one run. `records` come from raw.jsonl. */
export function pilotReport(records) {
  const ok = records.filter((r) => r.status === "ok");
  const dns = records.filter((r) => r.dns?.listed);
  const answered = (id) => dns.filter((r) => r.dns.listed[id] !== null).length;
  const misses = { ipv4: 0, ipv6: 0, email: 0, query: 0 };
  for (const text of records.flatMap(storedText)) for (const [k, v] of Object.entries(scrubMisses(text))) misses[k] += v;
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
      read: dns.length, ungraded: dns.filter((r) => r.status !== "ok").length, finalDomainToo: dns.filter((r) => r.dns.final).length,
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
    scrubMisses: misses,
  };
}

function main(args) {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("Usage: pilot-report.mjs <raw.jsonl>"); return 2; }
  const records = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const report = pilotReport(records);
  console.log(JSON.stringify(report, null, 2));
  return Object.values(report.scrubMisses).some(Boolean) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
