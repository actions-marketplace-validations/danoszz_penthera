/**
 * Typosquat and slopsquat checks for npm package names (`penthera deps`).
 *
 * Compares each dependency name against a vendored list of popular package
 * names (lib/deps/popular-packages.json, refreshed at release time by
 * scripts/refresh-popular-packages.mjs; never fetched at runtime). A name that
 * is one or two edits away from a popular package, but is not itself popular,
 * is worth a second look: that is how `crossenv` (for cross-env) and
 * `electorn` (for electron) shipped malware.
 *
 * Slopsquatting is the same attack aimed at AI assistants: registering names
 * a model is likely to hallucinate. Offline, the useful signal is the same
 * near-miss check, plus (with --online) a very young publish date.
 */
import { readFileSync } from "node:fs";
import { rulesOf, rulesGeneration } from "../rules/index.js";

let _popular = null;

/** The vendored popular-name list: { source, names: string[] }. */
export function loadPopular() {
  if (!_popular) {
    const data = JSON.parse(readFileSync(new URL("./popular-packages.json", import.meta.url), "utf-8"));
    _popular = { ...data, set: new Set(data.names), rank: new Map(data.names.map((n, i) => [n, i + 1])) };
  }
  return _popular;
}

let _merged = null;
let _mergedGen = -1;
/**
 * The popular list plus `typosquat-target` names from rule packs, ranked after
 * the vendored list in pack order. Without pack names this is loadPopular().
 */
export function loadTargets() {
  const base = loadPopular();
  if (_mergedGen === rulesGeneration()) return _merged;
  const extra = rulesOf("typosquat-target").flatMap((r) => r.names).filter((n) => !base.set.has(n));
  if (extra.length === 0) {
    _merged = base;
  } else {
    const names = [...base.names, ...new Set(extra)];
    _merged = { ...base, names, set: new Set(names), rank: new Map(names.map((n, i) => [n, i + 1])) };
  }
  _mergedGen = rulesGeneration();
  return _merged;
}

/** Damerau-Levenshtein (optimal string alignment) distance, capped at max+1. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let k = 1; k <= n; k++) {
      const cost = a[i - 1] === b[k - 1] ? 0 : 1;
      let v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
      if (prev2 && i > 1 && k > 1 && a[i - 1] === b[k - 2] && a[i - 2] === b[k - 1]) v = Math.min(v, prev2[k - 2] + 1);
      cur[k] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

const JS_SUFFIX = /(?:[.-]?js|-node)$/;

/** Separator- and scope-insensitive form: "@types/lodash.merge" -> "typeslodashmerge". */
const squash = (s) => s.replace(/^@/, "").replace(/[-_./]/g, "");

/**
 * Find the popular package a name is likely imitating, or null.
 * @returns {null | { target, distance, kind, rank }}
 */
export function checkName(name, popular = loadPopular()) {
  if (!name || popular.set.has(name)) return null;
  const bare = name.replace(/^@[^/]+\//, "");
  const isScoped = bare !== name;
  // Short names collide with each other constantly; a 1-edit window over
  // three-letter names would flag half the registry.
  const max = bare.length >= 12 ? 2 : bare.length >= 5 ? 1 : 0;
  const scope = isScoped ? name.slice(0, name.indexOf("/")) : null;

  let best = null;
  for (const target of popular.names) {
    if (target === name) return null;
    // Nobody can publish into a scope they don't own, so siblings in one scope
    // (@img/sharp-linux-arm vs -arm64) are the same publisher, not a squat.
    if (scope && target.startsWith(`${scope}/`)) continue;
    let distance;
    let kind;
    const tSquash = squash(target);
    if (squash(name) === tSquash) {
      distance = 1;
      kind = "separator or scope swap";
    } else if (name.replace(JS_SUFFIX, "") === target) {
      distance = 1;
      kind = "popular name plus a js/node suffix";
    } else if (max > 0 && !isScoped === !target.startsWith("@")) {
      distance = editDistance(name, target, max);
      if (distance > max) continue;
      kind = distance === 1 ? "one edit away" : "two edits away";
    } else {
      continue;
    }
    const rank = popular.rank.get(target);
    if (!best || distance < best.distance || (distance === best.distance && rank < best.rank)) {
      best = { target, distance, kind, rank };
    }
  }
  return best;
}

/**
 * Check a list of package names. Returns hits sorted by name.
 * @param {string[]} names
 */
export function findTyposquats(names) {
  const popular = loadTargets();
  const out = [];
  for (const name of [...new Set(names)].sort()) {
    const hit = checkName(name, popular);
    if (hit) out.push({ name, ...hit });
  }
  return out;
}
