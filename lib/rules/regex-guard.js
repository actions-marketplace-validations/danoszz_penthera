/**
 * Static ReDoS guard for regexes that come from data: rule packs, community
 * Nuclei templates. Rule packs scan hostile input (dependency source, agent
 * configs, response bodies), so a pack must not be able to hang the scanner
 * by shipping a pattern that backtracks catastrophically.
 *
 * V8's regex engine backtracks, and its linear-time engine (the `l` flag)
 * refuses ordinary bounded repeats like `{64}`, so the guard is structural:
 * it parses the pattern and refuses the shapes that blow up.
 *
 *   1. Length cap (MAX_LENGTH).
 *   2. No backreferences and no lookaround. Detection rules do not need them,
 *      and both defeat simple reasoning about cost.
 *   3. Star height 1: a quantified group may not contain a quantifier
 *      (`(a+)+`, `(\w*\s?)*`). The exponential case.
 *   4. A group under an unbounded quantifier may not contain alternation
 *      (`(a|aa)+`, `(a|a)*`). The other exponential case.
 *   5. Bounded repeats are capped at MAX_REPEAT.
 *   6. An unbounded quantifier that is followed by something mandatory may
 *      not be reachable from every start position (`\s*x`, `[a-z]+@`): each
 *      start would rescan the rest of the input. Something mandatory before
 *      it that cannot occur inside its run (`x\s*:`) breaks the chain.
 *   7. Two quantifiers that can match the same characters, with nothing
 *      mandatory between them that the first cannot also match (`.*b.*`,
 *      `\s*\s*`), multiply their cost. A chain with an unbounded member is
 *      refused; a bounded chain must stay under CHAIN_BUDGET.
 *
 * The guard is conservative: it refuses some safe patterns. That is the right
 * trade for data that arrives from outside the codebase. tests/rule-packs.test.js
 * fuzzes it: every pattern it accepts must run in bounded time on adversarial
 * input.
 */

export const MAX_LENGTH = 512;
export const MAX_REPEAT = 256;
export const CHAIN_BUDGET = 1024;
export const ALLOWED_FLAGS = /^[imsu]*$/;

// The narrower check for community templates (lib/templates.js, added in
// v1.1.1 as a regex): refuse a quantifier applied to a group that contains a
// quantifier, at any depth, or a quantifier stacked on another (`a+*`). It
// keeps user templates working that the strict checkRegex below would refuse.
// A linear scan rather than a regex, because a regex inspecting a pattern
// string is itself open to backtracking on input like "((((((".
const QUANT_START = (src, i) => src[i] === "*" || src[i] === "+" || (src[i] === "{" && /^\{\d+(,\d*)?\}/.test(src.slice(i, i + 24)));

export function hasNestedQuantifier(pattern) {
  const src = String(pattern);
  const groups = []; // per open group: does it contain a quantifier?
  let prevQuant = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; prevQuant = false; continue; }
    if (c === "[") {
      for (i++; i < src.length && src[i] !== "]"; i++) if (src[i] === "\\") i++;
      prevQuant = false;
      continue;
    }
    if (c === "(") { groups.push(false); prevQuant = false; continue; }
    if (c === ")") {
      const inner = groups.pop() || false;
      if (inner && QUANT_START(src, i + 1)) return true;
      if (inner && groups.length) groups[groups.length - 1] = true;
      prevQuant = false;
      continue;
    }
    if (QUANT_START(src, i) || c === "?") {
      const isQ = c !== "?" || (i > 0 && src[i - 1] !== "(" && !prevQuant);
      if (c !== "?" && prevQuant) return true; // a+* / a{2}+
      if (isQ && c !== "?" && groups.length) groups[groups.length - 1] = true;
      if (c === "{") i = src.indexOf("}", i);
      prevQuant = c !== "?" ? true : prevQuant;
      continue;
    }
    prevQuant = false;
  }
  return false;
}

class GuardError extends Error {}
const refuse = (msg) => { throw new GuardError(msg); };

// ── Parser ────────────────────────────────────────────────────────────────
// A small parser for the subset of JS regex syntax a detection rule needs.
// Nodes: { type: "alt", branches: Item[][] }, items are { atom, min, max, src }
// where atom is { type: "char"|"class"|"any"|"anchor"|"group", src, alt? }.

function parse(src, unicode) {
  let i = 0;
  const peek = () => src[i];

  function parseAlt(depth) {
    if (depth > 8) refuse("groups nested deeper than 8");
    const branches = [[]];
    while (i < src.length) {
      const c = peek();
      if (c === ")") break;
      if (c === "|") { i++; branches.push([]); continue; }
      const start = i;
      const atom = parseAtom(depth);
      const q = parseQuantifier(atom);
      branches[branches.length - 1].push({ atom, ...q, src: src.slice(start, i) });
    }
    return { type: "alt", branches };
  }

  function parseAtom(depth) {
    const c = src[i];
    if (c === "(") {
      i++;
      if (src.startsWith("?:", i)) i += 2;
      else if (src.startsWith("?=", i) || src.startsWith("?!", i) || src.startsWith("?<=", i) || src.startsWith("?<!", i)) refuse("lookaround is not allowed");
      else if (src.startsWith("?<", i)) {
        const end = src.indexOf(">", i);
        if (end < 0) refuse("unterminated group name");
        i = end + 1;
      } else if (c === "(" && src[i] === "?") refuse("unsupported group syntax");
      const alt = parseAlt(depth + 1);
      if (src[i] !== ")") refuse("unterminated group");
      i++;
      return { type: "group", alt };
    }
    if (c === "[") return parseClass();
    if (c === "\\") return parseEscape();
    if (c === ".") { i++; return { type: "any", src: "." }; }
    if (c === "^" || c === "$") { i++; return { type: "anchor", src: c }; }
    if (c === "*" || c === "+" || c === "?" || c === "{" && /^\{\d/.test(src.slice(i))) refuse("quantifier with nothing to repeat");
    if (c === "]" || c === "}") { if (unicode) refuse(`lone ${c}`); }
    i++;
    return { type: "char", src: c };
  }

  function parseEscape() {
    const start = i;
    i++;
    const c = src[i];
    if (c === undefined) refuse("trailing backslash");
    if (/[1-9]/.test(c)) refuse("backreferences are not allowed");
    if (c === "k" && src[i + 1] === "<") refuse("backreferences are not allowed");
    if (c === "b" || c === "B") { i++; return { type: "anchor", src: src.slice(start, i) }; }
    if (c === "x") i += 3;
    else if (c === "u" && src[i + 1] === "{") i = src.indexOf("}", i) + 1 || refuse("bad \\u{} escape");
    else if (c === "u") i += 5;
    else if ((c === "p" || c === "P") && src[i + 1] === "{") i = src.indexOf("}", i) + 1 || refuse("bad \\p{} escape");
    else if (c === "c") i += 2;
    else i++;
    const s = src.slice(start, i);
    return { type: /^\\[dDwWsSpP]/.test(s) ? "class" : "char", src: s };
  }

  function parseClass() {
    const start = i;
    i++;
    if (src[i] === "^") i++;
    if (src[i] === "]") i++;
    while (i < src.length && src[i] !== "]") {
      if (src[i] === "\\") {
        if (/[1-9]/.test(src[i + 1] || "")) refuse("backreferences are not allowed");
        i += 2;
      } else if (src[i] === "[" && unicode) refuse("nested classes are not allowed");
      else i++;
    }
    if (src[i] !== "]") refuse("unterminated character class");
    i++;
    return { type: "class", src: src.slice(start, i) };
  }

  function parseQuantifier(atom) {
    let min = 1;
    let max = 1;
    const c = src[i];
    if (c === "*") { min = 0; max = Infinity; i++; }
    else if (c === "+") { min = 1; max = Infinity; i++; }
    else if (c === "?") { min = 0; max = 1; i++; }
    else if (c === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
      if (!m) return { min, max };
      min = Number(m[1]);
      max = m[2] ? (m[3] === "" ? Infinity : Number(m[3])) : min;
      if (max < min) refuse("quantifier range out of order");
      if (min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT)) refuse(`repeat count above ${MAX_REPEAT}`);
      i += m[0].length;
    } else return { min, max };
    if (atom.type === "anchor") refuse("quantified anchor");
    if (src[i] === "?") i++; // lazy: same cost bound as greedy
    if (src[i] === "*" || src[i] === "+" || src[i] === "?" || (src[i] === "{" && /^\{\d+(,\d*)?\}/.test(src.slice(i)))) refuse("stacked quantifiers");
    return { min, max };
  }

  const ast = parseAlt(0);
  if (i < src.length) refuse("unbalanced parenthesis");
  return ast;
}

// ── Character sets ────────────────────────────────────────────────────────
// Approximated by membership over a sample alphabet: all of ASCII plus
// representatives of the Unicode classes rules tend to touch. Two atoms
// "overlap" if some sample character matches both.

const SAMPLE = (() => {
  const out = [];
  for (let c = 0; c < 128; c++) out.push(String.fromCharCode(c));
  out.push(" ", "é", "ß", "İ", " ", "​", "中", "а", "﻿", "\u{1F600}");
  return out;
})();

const setCache = new Map();
function charSet(src, flags) {
  const key = `${flags}\u0000${src}`;
  let set = setCache.get(key);
  if (set) return set;
  const re = new RegExp(`^(?:${src})$`, flags.replace(/[gy]/g, ""));
  set = new Uint8Array(SAMPLE.length);
  for (let k = 0; k < SAMPLE.length; k++) set[k] = re.test(SAMPLE[k]) ? 1 : 0;
  if (setCache.size > 5000) setCache.clear();
  setCache.set(key, set);
  return set;
}
const overlaps = (a, b) => a.some((v, k) => v && b[k]);
const subset = (a, b) => a.every((v, k) => !v || b[k]);
const union = (sets) => sets.reduce((acc, s) => acc.map((v, k) => v | s[k]), new Uint8Array(SAMPLE.length));

/** Characters an item can consume (any one position), or null for anchors. */
function itemSet(item, flags) {
  const a = item.atom;
  if (a.type === "anchor") return null;
  if (a.type !== "group") return charSet(a.src, flags);
  const sets = [];
  for (const br of a.alt.branches) for (const it of br) { const s = itemSet(it, flags); if (s) sets.push(s); }
  return union(sets);
}

function hasQuantifier(alt) {
  return alt.branches.some((br) => br.some((it) => it.max > 1 || (it.atom.type === "group" && hasQuantifier(it.atom.alt))));
}

/** Largest max among quantifiers inside a group (Infinity if any unbounded). */
function innerMax(alt) {
  let m = 1;
  for (const br of alt.branches) for (const it of br) {
    m = Math.max(m, it.max);
    if (it.atom.type === "group") m = Math.max(m, innerMax(it.atom.alt));
  }
  return m;
}

// ── Rules ─────────────────────────────────────────────────────────────────

function checkStructure(alt) {
  for (const br of alt.branches) for (const it of br) {
    if (it.atom.type !== "group") continue;
    const g = it.atom.alt;
    if (it.max > 1 && hasQuantifier(g)) refuse(`nested quantifier in \`${it.src}\``);
    if (it.max === Infinity && g.branches.length > 1) refuse(`alternation under an unbounded quantifier in \`${it.src}\``);
    checkStructure(g);
  }
}

const MAX_PATHS = 256;

/**
 * Expand a branch into the linear sequences of leaf items it can match.
 * A group that is not repeated (`(?:a|b)`, `(?:sudo\s+)?`) is inlined once
 * per alternative, plus a "skipped" path when it is optional, so quantifiers
 * on either side of it are compared along each real path. A repeated group
 * becomes one leaf (rule 3 guarantees it holds no quantifier). Past MAX_PATHS
 * the remaining groups collapse to one conservative leaf each.
 */
function expand(branch, flags) {
  let seqs = [[]];
  for (const it of branch) {
    const a = it.atom;
    if (a.type === "anchor") continue;
    if (a.type === "group" && it.max <= 1) {
      const alts = a.alt.branches.flatMap((b) => expand(b, flags));
      if (it.min === 0) alts.push([]);
      if (seqs.length * alts.length <= MAX_PATHS) {
        seqs = seqs.flatMap((s) => alts.map((x) => s.concat(x)));
        continue;
      }
      const leaf = { set: itemSet(it, flags), min: it.min, max: innerMax(a.alt), src: it.src };
      seqs = seqs.map((s) => s.concat([leaf]));
      continue;
    }
    const leaf = { set: itemSet(it, flags), min: it.min, max: it.max, src: it.src };
    seqs = seqs.map((s) => s.concat([leaf]));
  }
  return seqs;
}

/**
 * Rule 6. An unanchored search tries every start position. An unbounded
 * quantifier followed by something mandatory rescans its run from each start
 * that can reach it, which is quadratic when everything mandatory before it
 * can also sit inside that run (`\s*x`, `[^a]{1,40}\S[ab]* ` on "bbbb").
 * A greedy quantifier with nothing mandatory after it succeeds at once.
 */
function checkRescan(seq, anchored) {
  if (anchored) return;
  for (let q = 0; q < seq.length; q++) {
    const it = seq[q];
    if (it.max !== Infinity) continue;
    if (!seq.slice(q + 1).some((x) => x.min > 0)) continue;
    if (seq.slice(0, q).every((x) => x.min === 0 || overlaps(x.set, it.set))) {
      refuse(q === 0 || seq.slice(0, q).every((x) => x.min === 0)
        ? `pattern starts with an unbounded quantifier (\`${it.src}\`)`
        : `unbounded quantifier \`${it.src}\` can be rescanned from every start position`);
    }
  }
}

function checkChains(alt, flags) {
  for (const br of alt.branches) for (const seq of expand(br, flags)) {
    checkRescan(seq, br[0]?.atom.type === "anchor" && br[0].atom.src === "^" && !flags.includes("m"));
    for (let a = 0; a < seq.length; a++) {
      const head = seq[a];
      if (head.max <= 1) continue;
      let cost = head.max;
      const mids = []; // mandatory atoms between head and the current item
      for (let b = a + 1; b < seq.length; b++) {
        const it = seq[b];
        // The costs multiply when the head can stop inside the item's run:
        // they share characters, and every mandatory atom in between can sit
        // in that run too (`.*b.*` on "bbbb"). `[^\n]*\|\s*` stays linear,
        // because `|` cannot occur inside a run of spaces.
        if (it.max > 1 && overlaps(head.set, it.set) && mids.every((m) => overlaps(m, it.set))) {
          cost = cost * it.max;
          if (cost === Infinity) refuse(`overlapping quantifiers \`${head.src}\` … \`${it.src}\` (polynomial backtracking)`);
          if (cost > CHAIN_BUDGET) refuse(`overlapping quantifiers \`${head.src}\` … \`${it.src}\` exceed the backtracking budget`);
        }
        // A mandatory atom the head cannot match ends the head's reach.
        if (it.min > 0) {
          if (!subset(it.set, head.set)) break;
          mids.push(it.set);
        }
      }
    }
  }
}

/**
 * Check a regex from data. Returns { ok: true } or { ok: false, reason }.
 * Never throws.
 * @param {string} source pattern source (no slashes)
 * @param {string} [flags] only i, m, s, u are accepted
 */
export function checkRegex(source, flags = "") {
  try {
    if (typeof source !== "string" || source.length === 0) refuse("pattern must be a non-empty string");
    if (typeof flags !== "string" || !ALLOWED_FLAGS.test(flags)) refuse(`flags must be a subset of "imsu" (got "${flags}")`);
    if (source.length > MAX_LENGTH) refuse(`pattern longer than ${MAX_LENGTH} characters`);
    try { new RegExp(source, flags); } catch (e) { refuse(`invalid regex: ${e.message}`); }
    const ast = parse(source, flags.includes("u"));
    checkStructure(ast);
    checkChains(ast, flags);
    return { ok: true };
  } catch (e) {
    if (e instanceof GuardError) return { ok: false, reason: e.message };
    return { ok: false, reason: `guard error: ${e.message}` };
  }
}

/** Compile a regex from data, or throw with the guard's reason. */
export function compileSafe(source, flags = "") {
  const r = checkRegex(source, flags);
  if (!r.ok) throw new Error(`unsafe regex /${String(source).slice(0, 80)}/: ${r.reason}`);
  return new RegExp(source, flags);
}
