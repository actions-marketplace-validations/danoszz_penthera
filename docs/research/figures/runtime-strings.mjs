#!/usr/bin/env node
/**
 * Figure for docs/research/runtime-strings.md: per category, how many of the
 * labelled strings the engine gets fully right, right in the report only
 * (the evidence kind differs), or wrong.
 *
 * Figure style (Penthera's paper style, reused by blog/figures/make.mjs):
 * - White plate (an explicit white rect, also in dark mode), black text, small sans.
 * - Thin plot frame at 25% black, very light grid at 8% black, ticks at round
 *   values, axis titles in plain words with units. No shadows or gradients.
 * - Direct labels next to the marks instead of a legend where possible.
 * - Uncertainty as thin 95% whiskers wherever the data has an interval.
 * - Reference lines dashed, thin, 30% black, labelled at the edge in 45% grey.
 * - At most 3 hues: Penthera #0000ED; #ED7A00 for the one contrasting series
 *   (misses, before); #7A7AFF for a secondary Penthera series; greys
 *   #4d4d4d / #8c8c8c / #bfbfbf for the rest. Colour is never the only cue.
 * - About 640 x 400, readable at 390 px wide; caption and alt text in the page.
 *
 * Reads only bench/runtime-strings/strings.json. An entry without a
 * `deviation` matches its label. An entry with one matches the report when
 * the engine's verdicts and end of life (deviation.engine, defaulting to the
 * label) equal the label's. That is the rule tests/runtime-strings.test.js
 * uses for its "label" and "report" columns, so the totals must equal the
 * table's total row in runtime-strings.md; the script fails if they do not.
 *
 *   node docs/research/figures/runtime-strings.mjs           write the SVG
 *   node docs/research/figures/runtime-strings.mjs --check   exit 1 if it is stale
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
const SET = JSON.parse(readFileSync(new URL("bench/runtime-strings/strings.json", ROOT), "utf8"));
const OUT = new URL("docs/research/figures/runtime-strings-categories.svg", ROOT);

const sorted = (o) => JSON.stringify(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));
const rows = new Map();
for (const e of SET.entries) {
  const r = rows.get(e.category) || { category: e.category, total: 0, label: 0, report: 0, ids: new Set() };
  r.total++;
  if (!e.deviation) {
    r.label++;
    r.report++;
  } else {
    r.ids.add(e.deviation.id);
    const eng = e.deviation.engine || {};
    if (sorted(eng.verdicts ?? e.verdicts) === sorted(e.verdicts) && (eng.eol ?? e.eol) === e.eol) r.report++;
  }
  rows.set(e.category, r);
}
const data = [...rows.values()].sort((a, b) => a.category.localeCompare(b.category));
const total = data.reduce((n, r) => n + r.total, 0);
const label = data.reduce((n, r) => n + r.label, 0);
const report = data.reduce((n, r) => n + r.report, 0);
const pct = (n) => `${((100 * n) / total).toFixed(1)}%`;

// The published table (runtime-strings.md, 1.8.1 columns) must say the same.
const doc = readFileSync(new URL("docs/research/runtime-strings.md", ROOT), "utf8");
const want = `| **total** | **253** | **84.6%** | **88.5%** | **${total}** | **${pct(label)}** | **${pct(report)}** |`;
if (!doc.includes(want)) {
  console.error(`runtime-strings figure: the data give ${total} entries, label ${pct(label)}, report ${pct(report)}, which is not the total row in runtime-strings.md`);
  process.exit(1);
}

const C = { blue: "#0000ED", light: "#7A7AFF", orange: "#ED7A00", ink: "#000000", ink2: "#4d4d4d", ink3: "#737373", frame: "#bfbfbf", grid: "#ebebeb", bg: "#ffffff" };
const W = 640, left = 150, right = 196, top = 66, barH = 20, gap = 11;
const H = top + data.length * (barH + gap) + 50;
const pw = W - left - right;
const max = 60;
const x = (n) => (n / max) * pw;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const yEnd = top + data.length * (barH + gap) - gap + 6;

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<title id="t">Runtime strings: engine against label, per category</title>`);
out.push(`<desc id="d">Stacked bars of ${total} labelled version strings in ${data.length} categories. ${label} match their label exactly, ${report - label} match what the report shows but not the evidence kind, and ${total - report} are misses. ${data.filter((r) => r.total > r.label).map((r) => `${r.category}: ${r.label} of ${r.total} exact, ${r.total - r.report} misses`).join("; ")}. Every other category matches in full.</desc>`);
out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
out.push(`<text x="12" y="22" font-size="16" font-weight="bold" fill="${C.ink}">${total} labelled version strings, per category</text>`);
// Key, as text next to swatches of different shape fill (solid, light, orange with a cross)
const key = [["exact match", C.blue], ["report right, kind wrong", C.light], ["miss", C.orange]];
let kx = 12;
for (const [t, col] of key) {
  out.push(`<rect x="${kx}" y="34" width="12" height="12" fill="${col}"/><text x="${kx + 16}" y="45" font-size="13" fill="${C.ink2}">${t}</text>`);
  kx += 16 + t.length * 6.8 + 18;
}
for (let t = 0; t <= max; t += 10) {
  const gx = left + x(t);
  out.push(`<line x1="${gx}" y1="${top - 6}" x2="${gx}" y2="${yEnd}" stroke="${C.grid}"/>`);
  out.push(`<text x="${gx}" y="${yEnd + 17}" font-size="13" fill="${C.ink2}" text-anchor="middle">${t}</text>`);
}
out.push(`<rect x="${left}" y="${top - 6}" width="${pw}" height="${yEnd - top + 6}" fill="none" stroke="${C.frame}"/>`);
out.push(`<text x="${left + pw / 2}" y="${yEnd + 36}" font-size="14" fill="${C.ink2}" text-anchor="middle">Strings in the category (count)</text>`);
data.forEach((r, i) => {
  const y = top + i * (barH + gap);
  out.push(`<text x="${left - 8}" y="${y + barH - 5}" font-size="14" fill="${C.ink}" text-anchor="end">${esc(r.category)}</text>`);
  const segs = [[r.label, C.blue], [r.report - r.label, C.light], [r.total - r.report, C.orange]];
  let sx = left;
  for (const [n, col] of segs) {
    if (!n) continue;
    const w = x(n);
    out.push(`<rect x="${sx.toFixed(1)}" y="${y}" width="${Math.max(w - 1, 1).toFixed(1)}" height="${barH}" fill="${col}"/>`);
    sx += w;
  }
  const miss = r.total - r.report, kind = r.report - r.label;
  const parts = [`${r.label}/${r.total}`];
  if (kind) parts.push(`${kind} kind only`);
  if (miss) parts.push(`${miss} miss${miss > 1 ? "es" : ""}`);
  const ids = r.ids.size ? ` (${[...r.ids].sort().join(", ")})` : "";
  out.push(`<text x="${left + x(r.total) + 6}" y="${y + barH - 5}" font-size="12" fill="${miss ? C.ink : C.ink3}">${esc(parts.join(", ") + ids)}</text>`);
});
out.push(`</svg>`);
const svg = `${out.join("\n")}\n`;

if (process.argv.includes("--check")) {
  let now = "";
  try { now = readFileSync(OUT, "utf8"); } catch {}
  if (now !== svg) { console.error("runtime-strings-categories.svg is stale: run node docs/research/figures/runtime-strings.mjs"); process.exit(1); }
} else {
  writeFileSync(OUT, svg);
  console.log(`wrote docs/research/figures/runtime-strings-categories.svg: ${total} entries, label ${pct(label)}, report ${pct(report)}`);
}
