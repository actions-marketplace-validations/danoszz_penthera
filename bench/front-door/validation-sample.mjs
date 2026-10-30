#!/usr/bin/env node
/**
 * E20-R2 validation (Amendment 2): a stratified sample of pass 2, its inclusion
 * weights, a blind sheet for the labeler, the deletion of page text outside the
 * sample, and the weighted metrics once labels come back.
 *
 *   node bench/front-door/validation-sample.mjs draw <raw.jsonl>
 *       Writes validation-sheet.json (blind) and validation-key.json next to the
 *       raw file, then rewrites raw.jsonl without unsampled page text. That can't
 *       be undone, which is its purpose. Both hashes are printed.
 *   node bench/front-door/validation-sample.mjs prune <raw.jsonl>
 *       Deletes all page text, for a pilot, whose sites are never sampled.
 *   node bench/front-door/validation-sample.mjs score <validation-key.json> <labels.csv>
 *       labels.csv: id,label. Prints weighted precision and recall, kappa and the
 *       unsure count. Rows are sites' evidence: the sheet stays private.
 */
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PASS_SEED, seeded, shuffled } from "./replicate.mjs";

// Rows per stratum, frozen in the amendment.
export const STRATA = Object.freeze({
  "candidate-page": 150, challenge: 50, "block-signature": 50, "block-unrecognized-403": 30, "unrecognized-error-response": 20,
});
export const LABELS = Object.freeze(["page", "challenge", "block", "error"]);
const RULE_LABEL = Object.freeze({ "candidate-page": "page", challenge: "challenge", block: "block", "unrecognized-error-response": "error" });
export const BOOTSTRAP = Object.freeze({ resamples: 20_000, seed: PASS_SEED[2] });

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
    return rows.map((r) => ({ host: r.host, stratum, stratumSize: all.length, weight: all.length / rows.length, ruleLabel: RULE_LABEL[r.evidence.class.label] }));
  });
}

/**
 * What the labeler sees, in a seeded order, with an id. No host, label, rule or
 * stratum field. Page text can still name the site: it can't be blinded from that.
 */
export function blindSheet(sample, records, { seed = PASS_SEED[2] } = {}) {
  const byHost = new Map(records.map((r) => [r.host, r]));
  const order = shuffled(sample, seed);
  const sheet = order.map((s, i) => {
    const e = byHost.get(s.host).evidence;
    return { id: i + 1, status: e.status, headerNames: e.headerNames, values: e.values, cookieNames: e.cookieNames, excerpt: e.excerpt ?? "", pageExcerpt: e.pageExcerpt ?? null };
  });
  return { sheet, key: order.map((s, i) => ({ id: i + 1, stratum: s.stratum, weight: s.weight, ruleLabel: s.ruleLabel })) };
}

/** The record without its 2xx text, unless it was sampled. Counts and flags stay. */
export function pruneExcerpt(record, sampled = new Set()) {
  const e = record.evidence?.pageExcerpt;
  if (!e || sampled.has(record.host)) return record;
  const { title: _title, text: _text, noscript: _noscript, ...shape } = e;
  return { ...record, evidence: { ...record.evidence, pageExcerpt: shape } };
}

function point(rows) {
  const out = {};
  for (const label of LABELS) {
    let tp = 0, called = 0, actual = 0;
    for (const r of rows) {
      if (r.ruleLabel === label) called += r.weight;
      if (r.human === label) actual += r.weight;
      if (r.ruleLabel === label && r.human === label) tp += r.weight;
    }
    out[label] = { precision: called ? tp / called : NaN, recall: actual ? tp / actual : NaN };
  }
  return out;
}

/** Unweighted Cohen's kappa over rows the labeler could answer. */
function kappaOf(rows) {
  const n = rows.length;
  if (!n) return NaN;
  const po = rows.filter((r) => r.human === r.ruleLabel).length / n;
  const pe = LABELS.reduce((s, l) => s + (rows.filter((r) => r.human === l).length / n) * (rows.filter((r) => r.ruleLabel === l).length / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/**
 * Amendment 2: `unsure` rows are left out and counted, and a sensitivity counts
 * them as disagreement. Intervals resample within each stratum.
 */
export function weightedMetrics(rows, { resamples = BOOTSTRAP.resamples, seed = BOOTSTRAP.seed } = {}) {
  const answered = rows.filter((r) => r.human !== "unsure");
  const strata = Object.keys(STRATA).map((s) => answered.filter((r) => r.stratum === s)).filter((g) => g.length);
  const next = seeded(seed);
  const draws = Object.fromEntries(LABELS.map((l) => [l, { precision: [], recall: [] }]));
  for (let i = 0; i < resamples; i++) {
    const m = point(strata.flatMap((g) => g.map(() => g[Math.floor(next() * g.length)])));
    for (const l of LABELS) for (const k of ["precision", "recall"]) if (Number.isFinite(m[l][k])) draws[l][k].push(m[l][k]);
  }
  const ci = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? [s[Math.floor(s.length * 0.025)], s[Math.floor(s.length * 0.975)]] : [NaN, NaN]; };
  const est = point(answered);
  return {
    rows: rows.length, unsure: rows.length - answered.length,
    kappa: kappaOf(answered),
    kappaUnsureAsDisagreement: kappaOf(rows.map((r) => (r.human === "unsure" ? { ...r, human: LABELS.find((l) => l !== r.ruleLabel) } : r))),
    metrics: Object.fromEntries(LABELS.map((l) => [l, { ...est[l], precisionCi: ci(draws[l].precision), recallCi: ci(draws[l].recall) }])),
  };
}

const hash = (b) => createHash("sha256").update(b).digest("hex");
const readRaw = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

function rewrite(file, records) {
  const before = hash(readFileSync(file));
  const after = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(`${file}.tmp`, after);
  renameSync(`${file}.tmp`, file);
  return { rawSha256Before: before, rawSha256After: hash(after) };
}

function main([mode, file, labels]) {
  if (mode === "draw" && file) {
    const records = readRaw(file);
    const sample = drawSample(records);
    const { sheet, key } = blindSheet(sample, records);
    writeFileSync(join(dirname(file), "validation-sheet.json"), JSON.stringify(sheet, null, 2) + "\n");
    writeFileSync(join(dirname(file), "validation-key.json"), JSON.stringify(key, null, 2) + "\n");
    const sampled = new Set(sample.map((s) => s.host));
    console.log(JSON.stringify({ sampled: sample.length, ...rewrite(file, records.map((r) => pruneExcerpt(r, sampled))) }));
    return 0;
  }
  if (mode === "prune" && file) {
    console.log(JSON.stringify(rewrite(file, readRaw(file).map((r) => pruneExcerpt(r)))));
    return 0;
  }
  if (mode === "score" && file && labels) {
    const human = new Map(readFileSync(labels, "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).map(([id, label]) => [Number(id), label.trim()]));
    const rows = JSON.parse(readFileSync(file, "utf8")).filter((k) => human.has(k.id)).map((k) => ({ ...k, human: human.get(k.id) }));
    console.log(JSON.stringify(weightedMetrics(rows), null, 2));
    return 0;
  }
  console.error("Usage: validation-sample.mjs draw <raw.jsonl> | prune <raw.jsonl> | score <validation-key.json> <labels.csv>");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
