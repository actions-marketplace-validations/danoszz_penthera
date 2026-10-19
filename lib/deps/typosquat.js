/**
 * Typosquat and slopsquat checks for npm and PyPI package names (`penthera deps`).
 *
 * Compares each dependency name against a vendored list of popular package
 * names (lib/deps/popular-packages.json, refreshed at release time by
 * scripts/refresh-popular-packages.mjs; never fetched at runtime). A name that
 * is one or two edits away from a popular package, but is not itself popular,
 * is worth a second look: that is how `crossenv` (for cross-env) and
 * `electorn` (for electron) shipped malware on npm, and `python3-dateutil`
 * and `jeIlyfish` on PyPI. PyPI names are compared after PEP 503
 * normalisation, so `python_dateutil` (the same project as python-dateutil)
 * is not a hit, while `pythondateutil` is.
 *
 * Slopsquatting is the same attack aimed at AI assistants: registering names
 * a model is likely to hallucinate. Offline, the useful signal is the same
 * near-miss check, plus (with --online) a very young publish date.
 */
import { readFileSync } from "node:fs";

const _popular = {};
// PyPI's list is lib/deps/popular-pypi.json (scripts/refresh-popular-pypi.mjs).
const LISTS = { npm: "./popular-packages.json", pypi: "./popular-pypi.json" };

/** The vendored popular-name list for an ecosystem: { source, names: string[] }. */
export function loadPopular(ecosystem = "npm") {
  if (!_popular[ecosystem]) {
    const data = JSON.parse(readFileSync(new URL(LISTS[ecosystem], import.meta.url), "utf-8"));
    _popular[ecosystem] = { ...data, ecosystem, set: new Set(data.names), rank: new Map(data.names.map((n, i) => [n, i + 1])) };
  }
  return _popular[ecosystem];
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
// PyPI: "python-requests", "requests-py", "py-requests" imitate "requests".
const PY_AFFIX = /^(?:python3?|py)-|-(?:python3?|py)$/;

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
    } else if (popular.ecosystem !== "pypi" && name.replace(JS_SUFFIX, "") === target) {
      distance = 1;
      kind = "popular name plus a js/node suffix";
    } else if (popular.ecosystem === "pypi" && target.length >= 4 && name.replace(PY_AFFIX, "") === target) {
      distance = 1;
      kind = "popular name plus a python/py affix";
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
 * @param {string[]} names PyPI names must already be PEP 503 normalised
 * @param {"npm"|"pypi"} ecosystem
 */
export function findTyposquats(names, ecosystem = "npm") {
  const popular = loadPopular(ecosystem);
  const out = [];
  for (const name of [...new Set(names)].sort()) {
    const hit = checkName(name, popular);
    if (hit) out.push({ name, ...hit });
  }
  return out;
}
