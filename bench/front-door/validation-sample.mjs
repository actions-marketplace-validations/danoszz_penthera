#!/usr/bin/env node
/**
 * E20-R2 validation draw (Amendment 2): a stratified sample of pass 2, its
 * inclusion weights, and the deletion of every 2xx excerpt outside the sample.
 *
 *   node bench/front-door/validation-sample.mjs <raw.jsonl>
 *
 * Writes validation-sample.json next to the raw file, then rewrites raw.jsonl
 * without the unsampled excerpts. That step can't be undone, and that is its
 * purpose. Both hashes are printed, so the manifest's raw hash stays explained.
 */
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PASS_SEED, shuffled } from "./replicate.mjs";

// Rows per stratum, frozen in the amendment.
export const STRATA = Object.freeze({
  "candidate-page": 150, challenge: 50, "block-signature": 50, "block-unrecognized-403": 30, "unrecognized-error-response": 20,
});

export function stratumOf(r) {
  const c = r.evidence?.class;
  if (!c) return null;
  if (c.label === "block") return c.rule === "unrecognized-403" ? "block-unrecognized-403" : "block-signature";
  return c.label in STRATA ? c.label : null;
}

/** Fixed sample per stratum. `weight` is stratum size over rows drawn, for the weighted metrics. */
export function drawSample(records, { seed = PASS_SEED[2] } = {}) {
  const graded = records.filter((r) => r.status === "ok");
  return Object.entries(STRATA).flatMap(([stratum, size]) => {
    const all = graded.filter((r) => stratumOf(r) === stratum);
    const rows = shuffled(all, seed).slice(0, size);
    return rows.map((r) => ({ host: r.host, stratum, stratumSize: all.length, weight: all.length / rows.length }));
  });
}

/** The record without its 2xx text, unless it was sampled. Counts and hashes stay. */
export function pruneExcerpt(record, sampled) {
  const e = record.evidence?.pageExcerpt;
  if (!e || sampled.has(record.host)) return record;
  const { title: _title, text: _text, noscript: _noscript, ...shape } = e;
  return { ...record, evidence: { ...record.evidence, pageExcerpt: shape } };
}

function main(args) {
  const file = args[0];
  if (!file) { console.error("Usage: validation-sample.mjs <raw.jsonl>"); return 2; }
  const before = readFileSync(file);
  const records = before.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const sample = drawSample(records);
  const sampled = new Set(sample.map((s) => s.host));
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const after = records.map((r) => JSON.stringify(pruneExcerpt(r, sampled))).join("\n") + "\n";
  writeFileSync(join(dirname(file), "validation-sample.json"), JSON.stringify(sample, null, 2) + "\n");
  writeFileSync(`${file}.tmp`, after);
  renameSync(`${file}.tmp`, file);
  console.log(JSON.stringify({ sampled: sample.length, rawSha256Before: hash(before), rawSha256After: hash(after) }));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
