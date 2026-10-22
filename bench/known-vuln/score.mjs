/**
 * E10 scoring: Penthera findings against a known-vulnerable app's answer key.
 *
 * Pure functions, no I/O (unit-tested in tests/bench-known-vuln.test.js).
 * The protocol is docs/research/prereg/E10-known-vulnerable-apps.md:
 *
 *   - Every non-info finding is a precision unit. It is correct when it
 *     matches an applicable in-scope answer-key entry (same E10 class, same
 *     location), or when a labeller marks it correct in labels.json.
 *   - Recall is over root causes (entry `group`s) that are in scope and
 *     applicable to the run: a needsAuth entry counts only in authenticated
 *     runs, a needsPayloads entry only in runs that send payloads.
 */
import { createHash } from "node:crypto";

export const CLASSES = ["secrets", "code-sink", "exposure", "misconfig", "auth", "vulnerable-component", "injection"];

const BY_CATEGORY = {
  secrets: "secrets",
  exposure: "exposure", "info-leak": "exposure", disclosure: "exposure",
  headers: "misconfig", cookie: "misconfig", cors: "misconfig", "cors-misconfiguration": "misconfig",
  tls: "misconfig", transport: "misconfig", config: "misconfig", "method-confusion": "misconfig",
  "content-type-confusion": "misconfig",
  auth: "auth", "auth-bypass": "auth", "rate-limiting": "auth", timing: "auth",
  "js-vulnerability": "vulnerable-component", cve: "vulnerable-component", "runtime-advisory": "vulnerable-component",
  sqli: "injection", xss: "injection", ssti: "injection", cmdi: "injection", ssrf: "injection",
  injection: "injection", "open-redirect": "injection", fuzzing: "injection",
};

// Repo risky-pattern findings are titled "<pattern> in <route>".
const BY_PATTERN = {
  eval: "code-sink", innerHTML: "code-sink", "command-injection": "code-sink",
  "error-leak": "exposure", "cors-wildcard": "misconfig",
};

const REPO_SOURCES = new Set(["repo-scan", "static-analysis", "trust-boundary", "framework-scan", "secret-scan", "secrets"]);

/** E10 class of a finding, or "other" when Penthera's category has no E10 class. */
export function classOf(f) {
  if (f.category === "code-pattern") {
    const pattern = String(f.title || "").split(" in ")[0];
    return BY_PATTERN[pattern] || "other";
  }
  return BY_CATEGORY[f.category] || "other";
}

/** Where a finding points: { surface: "url"|"repo", path, file }. */
export function locationOf(f, srcDir = "") {
  let file = f.file || null;
  // Repo findings (secrets, runtime pins) put the repo-relative file in `url`.
  const rel = f.url && !/^[a-z]+:\/\//i.test(f.url) && !String(f.url).startsWith("/") ? String(f.url) : null;
  if (!file && rel) file = rel;
  if (!file) {
    const m = /Detected in (\S+)/.exec(f.description || "");
    if (m) file = m[1];
  }
  if (file) {
    file = String(file);
    if (srcDir && file.startsWith(srcDir)) file = file.slice(srcDir.length);
    file = file.replace(/^\.?\/+/, "");
  }
  let path = null;
  if (f.url && !rel) {
    try { path = new URL(f.url).pathname; } catch { path = String(f.url).startsWith("/") ? String(f.url).split("?")[0] : null; }
  }
  const surface = file || REPO_SOURCES.has(f.source) ? "repo" : "url";
  return { surface, path, file };
}

/** Does an answer-key location match a finding's location? */
export function locMatches(loc, where) {
  if (loc.file) return where.file === loc.file;
  if (!loc.path || where.surface !== "url") return false;
  if (loc.path === "*") return true;
  const p = where.path;
  if (p == null) return false;
  if (loc.path.endsWith("/")) return p === loc.path.slice(0, -1) || p.startsWith(loc.path);
  return p === loc.path;
}

/**
 * Does an answer-key entry match a finding? Same E10 class, a location of the
 * entry's own surface (paths for url entries, files for repo entries; both
 * for out-of-scope entries, which have no surface), and, when the entry lists
 * `keywords`, one of them in the finding's title or description. Keywords are
 * tool-neutral words ("x-powered-by", "mongo") that tell apart entries
 * sharing a location, such as a wildcard header entry or two components
 * pinned in one file.
 */
export function entryMatches(entry, f, where, cls = classOf(f)) {
  if (entry.class !== cls) return false;
  const locs = (entry.locations || []).filter((l) => !entry.surface || (entry.surface === "url" ? l.path : l.file));
  if (!locs.some((l) => locMatches(l, where))) return false;
  if (!entry.keywords?.length) return true;
  const text = `${f.title || ""} ${f.description || ""}`.toLowerCase();
  return entry.keywords.some((k) => text.includes(k.toLowerCase()));
}

/** Is an in-scope entry part of the recall denominator for this run? */
export function applicable(entry, run) {
  if (!entry.inScope) return false;
  if (entry.surface === "repo") return true;
  if (entry.needsPayloads && !run.payloads) return false;
  if (entry.needsAuth && !run.auth) return false;
  return true;
}

/** Stable short id for a finding, used as the key in labels.json. */
export function fingerprint(f, where) {
  const key = [classOf(f), where.surface, f.title || "", where.file || "", where.path || ""].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/** Wilson score interval for k successes out of n (95% by default). */
export function wilson(k, n, z = 1.959964) {
  if (!n) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

/**
 * Score one run of one app.
 * @param {object[]} findings - Penthera findings (merged url + repo)
 * @param {object} truth - truth.json
 * @param {object} run - { payloads: bool, auth: bool }
 * @param {object} [labels] - labels.json `labels` map: fingerprint -> { verdict, reason }
 * @param {string} [srcDir] - absolute source path prefix to strip from file paths
 */
export function scoreRun(findings, truth, run, labels = {}, srcDir = "") {
  const entries = truth.vulnerabilities || [];
  const inScope = entries.filter((e) => applicable(e, run));
  const units = [];
  const seen = new Set();
  let info = 0;

  for (const f of findings || []) {
    if (f.severity === "info") { info++; continue; }
    const where = locationOf(f, srcDir);
    const cls = classOf(f);
    const fp = fingerprint(f, where);
    if (seen.has(fp)) continue; // identical title at an identical location
    seen.add(fp);
    const hit = inScope.find((e) => entryMatches(e, f, where, cls));
    const near = hit ? null : entries.find((e) => e.locations?.some((l) => locMatches(l, where)) && (e.class === cls || !e.inScope));
    const label = labels[fp] || null;
    let verdict;
    if (hit) verdict = "correct";
    else if (label) verdict = label.verdict === "correct" ? "correct" : label.verdict === "incorrect" ? "incorrect" : "cannot-tell";
    else verdict = "unlabelled";
    units.push({
      fingerprint: fp, title: f.title, severity: f.severity, confidence: f.confidence || null,
      category: f.category, class: cls, ...where,
      match: hit ? { id: hit.id, group: hit.group } : null,
      near: near ? { id: near.id, inScope: near.inScope } : null,
      verdict, reason: hit ? `answer key: ${hit.id}` : label?.reason || null,
      // Level 2 (secondary): should the owner change something? Answer-key matches are.
      actionable: verdict === "correct" ? (hit ? true : label?.actionable ?? null) : false,
    });
  }

  const groups = new Map(); // group -> { entries, hitBy }
  for (const e of inScope) {
    const g = groups.get(e.group) || { group: e.group, class: e.class, surface: e.surface, entries: [], hitBy: null };
    g.entries.push(e.id);
    groups.set(e.group, g);
  }
  for (const u of units) if (u.match && !groups.get(u.match.group).hitBy) groups.get(u.match.group).hitBy = u.fingerprint;

  return { units, info, groups: [...groups.values()], ...summarise(units, [...groups.values()]) };
}

/** Precision / recall counts and intervals, overall and per class. */
export function summarise(units, groups) {
  const tally = (us, gs) => {
    const matched = us.filter((u) => u.match).length;
    const correct = us.filter((u) => u.verdict === "correct").length;
    const incorrect = us.filter((u) => u.verdict === "incorrect" || u.verdict === "cannot-tell").length;
    const unlabelled = us.filter((u) => u.verdict === "unlabelled").length;
    const labelled = correct + incorrect;
    const hit = gs.filter((g) => g.hitBy).length;
    const actionable = us.filter((u) => u.actionable === true).length;
    return {
      findings: us.length, matched, correct, incorrect, unlabelled, actionable,
      actionablePrecision: wilson(actionable, labelled), // level 2, same denominator
      precision: wilson(correct, labelled),          // primary: over labelled units (cannot-tell counts as incorrect)
      strictPrecision: wilson(matched, us.length),   // lower bound: only answer-key matches count as correct
      groups: gs.length, groupsHit: hit,
      recall: wilson(hit, gs.length),
    };
  };
  const byClass = {};
  for (const c of [...CLASSES, "other"]) {
    const us = units.filter((u) => u.class === c);
    const gs = groups.filter((g) => g.class === c);
    if (us.length || gs.length) byClass[c] = tally(us, gs);
  }
  return { total: tally(units, groups), byClass };
}

/** Sum several scored runs (same run kind, different apps). */
export function pool(scores) {
  const units = scores.flatMap((s) => s.units);
  const groups = scores.flatMap((s, i) => s.groups.map((g) => ({ ...g, group: `${i}:${g.group}` })));
  return summarise(units, groups);
}
