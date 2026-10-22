#!/usr/bin/env node
/**
 * Drafts the labels in strings.json from rows.mjs. Kept for transparency;
 * strings.json is the set, and the test (tests/runtime-strings.test.js) reads
 * only that.
 *
 *   node bench/runtime-strings/label.mjs           rewrite strings.json
 *   node bench/runtime-strings/label.mjs --check   exit 1 if strings.json is stale
 *
 * Each row in rows.mjs says, by hand and from its source, which product the
 * string belongs to, what kind of evidence it is (an exact upstream build, a
 * distribution build, a release line, the product without a version, or not
 * the product at all) and the upstream version. The verdicts follow from that
 * and from the advisories' published facts (fixed versions, `introduced`, end
 * of life dates), read from the bundled pack's JSON. This file never imports
 * the engine (lib/advisories), so the labels are not the engine's output; the
 * engine is only run for rows marked with a known deviation, to record what
 * it says instead.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROWS, CATEGORIES, DEVIATIONS } from "./rows.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pack = (f) => JSON.parse(readFileSync(here(`../../lib/rules/advisories/${f}`), "utf-8")).rules;
const ADVISORIES = pack("advisories.json");
const EOL = pack("eol.json");

// Release lines as each vendor names them.
function parse(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?([a-z]{0,2})$/.exec(v);
  if (!m) throw new Error(`label.mjs: not an upstream version: ${v}`);
  return { major: +m[1], minor: m[2] === undefined ? null : +m[2], patch: m[3] === undefined ? null : +m[3], letters: m[4] };
}
function cmp(a, b) {
  const x = parse(a), y = parse(b);
  for (const k of ["major", "minor", "patch"]) if ((x[k] ?? 0) !== (y[k] ?? 0)) return (x[k] ?? 0) < (y[k] ?? 0) ? -1 : 1;
  if (x.letters === y.letters) return 0;
  if (x.letters.length !== y.letters.length) return x.letters.length < y.letters.length ? -1 : 1;
  return x.letters < y.letters ? -1 : 1;
}
function lineOf(product, v) {
  const p = parse(v);
  if (product === "nodejs") return String(p.major);
  if (product === "openssl" && p.major < 3) return p.patch === null ? null : `${p.major}.${p.minor}.${p.patch}`;
  return p.minor === null ? null : `${p.major}.${p.minor}`;
}
function eolOf(product, line) {
  for (const r of EOL.filter((x) => x.product === product)) {
    const b = r.branches.find((x) => x.branch === line);
    if (b && b.eol <= r.date) return true;
  }
  return false;
}

/**
 * The verdict a correct engine gives for one advisory.
 * `pre`: the string is a pre-release of `version` (8.4.27-dev, 8.5.0RC1), so it
 * is below `version` and has none of the fixes released in it.
 */
function verdict(adv, row) {
  const { kind, version, pre } = row;
  if (kind === "none") return "none";
  if (kind === "present") return "check-on-server";
  const line = lineOf(row.product, version);
  const fix = adv.fixed.find((f) => f.branch === line);
  const lines = adv.fixed.map((f) => f.branch).sort(cmp);
  // Newer than every line the advisory lists: not in its scope.
  if (!fix && cmp(line, lines.at(-1)) > 0) return "none";
  // Older than the line the flaw was introduced on: it cannot have it.
  const oldest = adv.fixed.find((f) => f.branch === lines[0]);
  if (!fix && oldest.introduced && cmp(line, lines[0]) < 0) return "none";
  if (kind === "branch") return !fix && eolOf(row.product, line) ? "end-of-life-no-fix" : "check-on-server";
  if (fix) {
    if (fix.introduced && cmp(version, fix.introduced) < 0) return "none";
    if (pre && cmp(version, fix.version) > 0) {
      // A pre-release of the version after the fix may predate the fix (PHP's
      // branch says 8.4.28-dev from 8.4.27's RC on); two patches on, it is in.
      // A pre-release of the fixed version itself is below it: affected.
      const f = parse(fix.version);
      return cmp(version, `${f.major}.${f.minor}.${f.patch + 2}`) >= 0 ? "has-fix" : "check-on-server";
    }
    if (!pre && cmp(version, fix.version) >= 0) return "has-fix";
    return kind === "distro" ? "check-on-server" : "affected";
  }
  if (kind === "distro") return "check-on-server";
  return eolOf(row.product, line) ? "end-of-life-no-fix" : "check-on-server";
}

function label(row) {
  const verdicts = {};
  for (const adv of ADVISORIES.filter((a) => a.product === row.product)) {
    const v = verdict(adv, row);
    if (v !== "none") verdicts[adv.id] = v;
  }
  let eol = "none";
  if (row.kind !== "none" && row.kind !== "present" && eolOf(row.product, lineOf(row.product, row.version))) {
    eol = row.kind === "distro" ? "end-of-life-distro" : "end-of-life";
  }
  return { verdicts, eol };
}

// What the engine says today, only for rows with a known deviation.
async function engineFor(row) {
  const { evidenceFromResponse, evidenceFromRepo } = await import("../../lib/advisories/evidence.js");
  const { verdictFor, matchRuntimeAdvisories } = await import("../../lib/advisories/index.js");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  let ev;
  if (row.input.headers) ev = evidenceFromResponse({ headers: row.input.headers, cookieNames: row.input.cookies || [] });
  else {
    const dir = mkdtempSync(join(tmpdir(), "penthera-label-"));
    writeFileSync(join(dir, row.input.image ? "Dockerfile" : row.input.file), row.input.image ? `FROM ${row.input.image}\n` : row.input.content);
    ev = evidenceFromRepo(dir);
    rmSync(dir, { recursive: true, force: true });
  }
  ev = ev.filter((e) => e.product === row.product);
  if (!ev.length) return { kind: "none", verdicts: {}, eol: "none" };
  const findings = matchRuntimeAdvisories(ev);
  const eolF = findings.some((f) => f.rule === `${row.product}-eol`);
  const WORD = { affected: "affected", unsupported: "end-of-life-no-fix", check: "check-on-server", patched: "has-fix", none: "none" };
  const verdicts = {};
  for (const adv of ADVISORIES.filter((a) => a.product === row.product)) {
    const v = WORD[verdictFor(adv, ev[0], eolF ? {} : null).verdict];
    if (v !== "none") verdicts[adv.id] = v;
  }
  return { kind: ev[0].kind, verdicts, eol: !eolF ? "none" : ev[0].kind === "distro" ? "end-of-life-distro" : "end-of-life" };
}

const entries = [];
for (const row of ROWS) {
  const { verdicts, eol } = label(row);
  const e = { id: row.id, category: row.category, product: row.product, input: row.input, kind: row.kind };
  if (row.version) e.version = row.version + (row.pre ? " (pre-release)" : "");
  Object.assign(e, { verdicts, eol, source: row.source, note: row.note });
  if (row.deviation) {
    const now = await engineFor(row);
    const engine = {};
    for (const k of ["kind", "verdicts", "eol"]) if (JSON.stringify(now[k]) !== JSON.stringify(e[k])) engine[k] = now[k];
    if (!Object.keys(engine).length) throw new Error(`${row.id}: marked ${row.deviation} but the engine agrees with the label`);
    e.deviation = { id: row.deviation, engine };
  }
  entries.push(e);
}

const out = {
  name: "runtime-strings",
  description: "Real-world version strings for Penthera's runtime-advisory check, labelled by hand from primary sources. See docs/research/runtime-strings.md.",
  license: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Individual strings are factual version identifiers quoted from the cited sources.",
  labels_relative_to: { pack: "advisories", advisories: [...new Set(ADVISORIES.map((a) => a.date))].sort(), eol_date: [...new Set(EOL.map((r) => r.date))].sort() },
  verdict_words: {
    affected: "exact upstream version below the fix",
    "end-of-life-no-fix": "the version is on an end-of-life line the advisory gives no fix for",
    "check-on-server": "the product is in use but the string cannot say (hidden, partial, floating, distribution build)",
    "has-fix": "at or above the fixed version (as advertised)",
    none: "not in the advisory's scope, or no evidence (omitted from `verdicts`)",
  },
  categories: CATEGORIES,
  deviations: DEVIATIONS,
  entries,
};
const json = `${JSON.stringify(out, null, 2)}\n`;
const target = here("./strings.json");
if (process.argv.includes("--check")) {
  let cur = "";
  try { cur = readFileSync(target, "utf-8"); } catch { /* missing */ }
  if (cur !== json) { console.error("strings.json is stale: run node bench/runtime-strings/label.mjs"); process.exit(1); }
} else {
  writeFileSync(target, json);
  console.log(`wrote ${entries.length} entries`);
}
