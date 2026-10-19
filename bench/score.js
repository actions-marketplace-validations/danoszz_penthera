/**
 * Score scanner findings against hand-labelled ground truth.
 *
 * Pure functions, no I/O, so the scoring rules are unit-tested on their own
 * (tests/bench-score.test.js). See "scoring" in bench/ground-truth.json.
 */

/** Path of a finding: URL pathname for black-box, repo-relative file for white-box. */
export function findingPath(f) {
  const loc = f.file || f.url || "";
  try {
    return new URL(loc).pathname;
  } catch {
    return String(loc).replace(/^\.?\//, "");
  }
}

function pathMatches(entry, path) {
  if (entry.file) return path === entry.file;
  if (!entry.path) return true;
  // "/api/users/" matches "/api/users/1"; "/docs" matches "/docs" only.
  return entry.path.endsWith("/") ? path.startsWith(entry.path) : path === entry.path;
}

export function matches(entry, f) {
  const titleOk = entry.title ? new RegExp(entry.title, "i").test(f.title || "") : true;
  return titleOk && pathMatches(entry, findingPath(f));
}

/**
 * @param {object[]} findings - scanner findings (already provenance-stamped)
 * @param {object} truth - one target from ground-truth.json
 * @returns {{ tp, fp, fn, duplicates, info, precision, recall, f1, byConfidence, falsePositives, falseNegatives, truePositives }}
 */
export function scoreTarget(findings, truth) {
  const vulns = truth.vulnerabilities || [];
  const decoys = truth.notVulnerable || [];
  const hit = new Map(); // vuln id -> first matching finding
  const truePositives = [];
  const falsePositives = [];
  let duplicates = 0;
  let info = 0;
  const byConfidence = {};
  const bump = (conf, key) => {
    const c = (byConfidence[conf || "unlabelled"] ||= { tp: 0, fp: 0 });
    c[key]++;
  };

  for (const f of findings || []) {
    if (f.severity === "info") { info++; continue; }
    const v = vulns.find((e) => matches(e, f));
    if (v) {
      if (hit.has(v.id)) { duplicates++; continue; }
      hit.set(v.id, f);
      truePositives.push({ id: v.id, title: f.title, confidence: f.confidence });
      bump(f.confidence, "tp");
    } else {
      const decoy = decoys.find((d) => matches(d, f));
      falsePositives.push({
        title: f.title,
        path: findingPath(f),
        confidence: f.confidence,
        decoy: decoy?.id || null,
        reason: decoy?.reason || null,
      });
      bump(f.confidence, "fp");
    }
  }

  const falseNegatives = vulns
    .filter((v) => !hit.has(v.id))
    .map((v) => ({ id: v.id, title: v.title, path: v.file || v.path || null, note: v.note || null }));

  const tp = truePositives.length;
  const fp = falsePositives.length;
  const fn = falseNegatives.length;
  return {
    tp, fp, fn, duplicates, info,
    ...ratios(tp, fp, fn),
    byConfidence, truePositives, falsePositives, falseNegatives,
  };
}

/** Precision, recall and F1. A ratio with an empty denominator is null, not 1. */
export function ratios(tp, fp, fn) {
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision != null && recall != null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
  return { precision, recall, f1 };
}

/** Sum per-target scores into a total. */
export function totalScore(scores) {
  const t = { tp: 0, fp: 0, fn: 0, duplicates: 0, info: 0, byConfidence: {} };
  for (const s of scores) {
    for (const k of ["tp", "fp", "fn", "duplicates", "info"]) t[k] += s[k];
    for (const [conf, c] of Object.entries(s.byConfidence)) {
      const d = (t.byConfidence[conf] ||= { tp: 0, fp: 0 });
      d.tp += c.tp;
      d.fp += c.fp;
    }
  }
  return { ...t, ...ratios(t.tp, t.fp, t.fn) };
}
