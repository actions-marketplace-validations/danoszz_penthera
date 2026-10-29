#!/usr/bin/env node
/**
 * Figures for the public-benchmark results (E11, E11b, E14), drawn as plain
 * SVG from files committed in this repository. No dependencies, no network,
 * deterministic: the same inputs give byte-identical SVGs.
 *
 *   node bench/public/figures.mjs            write bench/public/figures/*.svg
 *   node bench/public/figures.mjs --check    exit 1 if a committed SVG is stale
 *
 * Inputs:
 *   bench/public/published.json   E11b sealed test half (secrets, npm, PyPI)
 *   bench/public/RESULTS.md       E11 summary table and the E14 step-2 CredData
 *                                 table, read as written (counts, not rounded rates)
 *
 * Captions (n, source file, date) and alt text live next to each figure in
 * RESULTS.md; each SVG also carries <title> and <desc>.
 *
 * Figure style (the methods paper's style; reuse it for every Penthera figure):
 * - A white plate: an explicit white background rect, black text, so the
 *   figure reads the same on a dark page. No junk, shadows or gradients.
 * - A thin plot frame at 25% black (#bfbfbf); a very light grid at 8% black
 *   (#ebebeb); ticks at round values; small sans labels; axis titles in
 *   plain words with units.
 * - Direct labels next to the marks instead of a legend wherever possible.
 * - Uncertainty always shown: 95% intervals as thin whiskers.
 * - Reference lines (iso-F1, thresholds, chance) dashed, thin, 30% black
 *   (#b3b3b3), labelled at the edge in 45% grey (#8c8c8c).
 * - Penthera is always #0000ED. Other tools are 70% black (#4d4d4d) with
 *   dark-grey labels. At most three hues per figure: #0000ED primary,
 *   #ED7A00 for the one contrasting series ("before", fail), #7A7AFF for a
 *   secondary Penthera series; greys #4d4d4d / #8c8c8c / #bfbfbf for the rest.
 *   Never color alone: pair it with a label, marker shape or dash.
 * - Sized for a column, about 640 x 400, readable at 390 px wide.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "figures");
const published = JSON.parse(readFileSync(join(HERE, "published.json"), "utf-8"));
const results = readFileSync(join(HERE, "RESULTS.md"), "utf-8");

const C = {
  plate: "#ffffff",
  ink: "#000000",
  label: "#333333",
  frame: "#bfbfbf",
  grid: "#ebebeb",
  ref: "#b3b3b3",
  refLabel: "#8c8c8c",
  penthera: "#0000ED",
  before: "#ED7A00",
  after: "#7A7AFF",
  other: "#4d4d4d",
  muted: "#8c8c8c",
  band: "#ebebfd",
};
const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const W = 640;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f = (n) => Number(n.toFixed(2));
const text = (x, y, s, { size = 12, fill = C.label, anchor = "start", weight = "normal", rotate } = {}) =>
  `<text ${rotate ? `transform="translate(${f(x)} ${f(y)}) rotate(${rotate})"` : `x="${f(x)}" y="${f(y)}"`} font-size="${size}" fill="${fill}" text-anchor="${anchor}"${weight !== "normal" ? ` font-weight="${weight}"` : ""} ${FONT}>${esc(s)}</text>`;

/** Wilson 95% interval, as bench/known-vuln/score.mjs computes it. */
function wilson(k, n, z = 1.959964) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** A unit-square plot: light grid at 0.2, thin frame, tick labels, axis titles. */
function frame({ x0, y0, w, h, xLabel, yLabel, title }) {
  const X = (v) => f(x0 + v * w);
  const Y = (v) => f(y0 + h - v * h);
  const L = [];
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    L.push(`<line x1="${X(t)}" y1="${Y(0)}" x2="${X(t)}" y2="${Y(1)}" stroke="${C.grid}" stroke-width="1"/>`);
    L.push(`<line x1="${X(0)}" y1="${Y(t)}" x2="${X(1)}" y2="${Y(t)}" stroke="${C.grid}" stroke-width="1"/>`);
  }
  L.push(`<rect x="${X(0)}" y="${Y(1)}" width="${f(w)}" height="${f(h)}" fill="none" stroke="${C.frame}" stroke-width="1"/>`);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    L.push(text(X(t), Y(0) + 15, t.toFixed(1), { size: 11, anchor: "middle" }));
    L.push(text(X(0) - 5, Y(t) + 4, t.toFixed(1), { size: 11, anchor: "end" }));
  }
  L.push(text(x0 + w / 2, Y(0) + 33, xLabel, { fill: C.ink, anchor: "middle" }));
  L.push(text(x0 - 34, y0 + h / 2, yLabel, { fill: C.ink, anchor: "middle", rotate: -90 }));
  if (title) L.push(text(x0, y0 - 8, title, { fill: C.ink, weight: "bold" }));
  return { X, Y, L };
}

/** A mark with thin 95% whiskers in x and y. Shapes: dot, ring, square. */
function mark(X, Y, { x, y, xci, yci, color, shape = "dot", r = 4.5 }) {
  const L = [];
  if (xci) L.push(`<line x1="${X(xci[0])}" y1="${Y(y)}" x2="${X(xci[1])}" y2="${Y(y)}" stroke="${color}" stroke-width="1"/>`);
  if (yci) L.push(`<line x1="${X(x)}" y1="${Y(yci[0])}" x2="${X(x)}" y2="${Y(yci[1])}" stroke="${color}" stroke-width="1"/>`);
  if (shape === "square") L.push(`<rect x="${f(X(x) - r)}" y="${f(Y(y) - r)}" width="${f(2 * r)}" height="${f(2 * r)}" fill="${color}" stroke="${C.plate}" stroke-width="1.5"/>`);
  else if (shape === "ring") L.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" fill="${C.plate}" stroke="${color}" stroke-width="1.5"/>`);
  else L.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" fill="${color}" stroke="${C.plate}" stroke-width="1.5"/>`);
  return L;
}

function svg(width, height, title, desc, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">`,
    `<title id="t">${esc(title)}</title>`,
    `<desc id="d">${esc(desc)}</desc>`,
    `<rect width="${width}" height="${height}" fill="${C.plate}"/>`,
    ...body,
    "</svg>",
    "",
  ].join("\n");
}

/** F1 = c, drawn as precision as a function of recall: p = c r / (2r - c). */
function f1Curve(X, Y, c) {
  const pts = [];
  for (let r = c / 2 + 0.005; r <= 1.0001; r += 0.01) {
    const p = (c * r) / (2 * r - c);
    if (p <= 1) pts.push(`${X(r)},${Y(p)}`);
  }
  return `<polyline points="${pts.join(" ")}" fill="none" stroke="${C.ref}" stroke-width="1" stroke-dasharray="4 3"/>`;
}

const style = (row) =>
  row.kind === "penthera" ? { color: C.penthera, shape: "dot", r: 5.5, labelFill: C.penthera, weight: "bold" }
    : row.kind === "penthera-before" ? { color: C.before, shape: "square", r: 4.5, labelFill: C.before, weight: "normal" }
      : row.excluded || row.caveat ? { color: C.muted, shape: "ring", r: 4.5, labelFill: C.muted, weight: "normal" }
        : { color: C.other, shape: "dot", r: 4, labelFill: C.label, weight: "normal" };

// Figure: secret scanners on the CredData test half, precision against recall.
function secretsFigure() {
  const b = published.benchmarks.secrets;
  const { X, Y, L } = frame({ x0: 52, y0: 14, w: 500, h: 330, xLabel: "In-scope recall (share of true credential rows found)", yLabel: "Strict precision (share of hits that are true)" });
  const body = [...L];
  for (const c of [0.2, 0.4, 0.6, 0.8]) {
    body.push(f1Curve(X, Y, c));
    body.push(text(X(1) + 5, Y(c / (2 - c)) + 4, `F1 ${c}`, { size: 11, fill: C.refLabel }));
  }
  // Offsets chosen by eye so that no two labels overlap.
  const place = {
    "Penthera 2.0.0": { dx: -8, dy: -9, anchor: "end" },
    "Penthera 1.9.0": { dx: 8, dy: 4, text: "Penthera 1.9.0 (before)" },
    deepsecrets: { dx: 8, dy: 14 },
    noseyparker: { dx: -8, dy: 15, anchor: "end" },
    gitleaks: { dx: 8, dy: 13 },
    kingfisher: { dx: 8, dy: 4 },
    secretlint: { dx: -8, dy: 4, anchor: "end" },
    ripsecrets: { dx: 8, dy: 4 },
    "detect-secrets": { dx: 8, dy: 4 },
    whispers: { dx: 8, dy: 4 },
    trufflehog: { dx: 8, dy: 13 },
    credsweeper: { dx: -8, dy: 15, anchor: "end", text: "credsweeper (trained on CredData)" },
  };
  const rows = [...b.rows].sort((a, c) => (a.kind === "penthera") - (c.kind === "penthera"));
  for (const r of rows) {
    const s = style(r);
    const x = r.recall[0] / r.recall[1];
    const y = r.precision[0] / r.precision[1];
    body.push(...mark(X, Y, { x, y, xci: r.recallCI, yci: r.precisionCI, ...s }));
    const name = r.kind.startsWith("penthera") ? `Penthera ${r.version}` : r.tool;
    const p = place[name] || {};
    body.push(text(X(x) + (p.dx ?? 8), Y(y) + (p.dy ?? 4), p.text || name, { size: 11.5, fill: s.labelFill, anchor: p.anchor || "start", weight: s.weight }));
  }
  const desc = `Scatter plot of strict precision against in-scope recall, with 95% whiskers and dashed equal-F1 curves, for ${b.rows.length} secret-scanner runs on the CredData test half (n = ${b.n} true rows). ` +
    b.rows.map((r) => `${r.kind.startsWith("penthera") ? "Penthera " + r.version : r.tool}: precision ${(r.precision[0] / r.precision[1]).toFixed(2)}, recall ${(r.recall[0] / r.recall[1]).toFixed(2)}`).join("; ") + ".";
  return svg(W, 400, "Secret scanners on CredData: precision against recall", desc, body);
}

// Figure: malware detectors, share caught against share of benign packages flagged.
function malwareFigure() {
  const panels = [
    ["npm", "npm (packages with a payload)", 50],
    ["pypi", "PyPI", 370],
  ];
  const body = [];
  const descs = [];
  const place = {
    npm: { "Penthera 2.0.0": { dx: 8, dy: -10 }, "Penthera 1.9.0": { dx: 8, dy: 20 }, malcontent: { dx: 9, dy: -2 }, GuardDog: { dx: 9, dy: 8 }, ossgadget: { dx: -8, dy: 15, anchor: "end" }, "osv-scanner": { dx: 8, dy: -4 }, clamav: { dx: 8, dy: -6 }, yara: { dx: 8, dy: 10 } },
    pypi: { "Penthera 2.0.0": { dx: -4, dy: -24 }, "Penthera 1.9.0": { dx: 8, dy: 26 }, malcontent: { dx: 8, dy: 4 }, GuardDog: { dx: 9, dy: 12 }, ossgadget: { dx: -8, dy: -8, anchor: "end" }, "osv-scanner": { dx: 8, dy: 12 }, clamav: { dx: 8, dy: -6 }, yara: { dx: 8, dy: 4 }, aura: { dx: -8, dy: -8, anchor: "end" }, bandit4mal: { dx: -8, dy: 18, anchor: "end" } },
  };
  for (const [key, name, x0] of panels) {
    const b = published.benchmarks[key];
    const { X, Y, L } = frame({ x0, y0: 30, w: 250, h: 300, xLabel: "Benign packages flagged", yLabel: "Malicious packages caught", title: name });
    body.push(...L);
    body.push(`<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="${C.ref}" stroke-width="1" stroke-dasharray="4 3"/>`);
    body.push(text(X(0.42), Y(0.3), "chance", { size: 11, fill: C.refLabel }));
    const rows = [...b.rows].sort((a, c) => (a.kind === "penthera") - (c.kind === "penthera"));
    for (const r of rows) {
      const s = style(r);
      const x = r.benign[0] / r.benign[1];
      const y = r.detect[0] / r.detect[1];
      body.push(...mark(X, Y, { x, y, xci: r.benignCI, yci: r.detectCI, ...s }));
      const nm = r.kind.startsWith("penthera") ? `Penthera ${r.version}` : r.tool;
      const p = place[key][nm] || {};
      body.push(text(X(x) + (p.dx ?? 8), Y(y) + (p.dy ?? 4), nm, { size: 11, fill: s.labelFill, anchor: p.anchor || "start", weight: s.weight }));
    }
    descs.push(`${name}: ` + b.rows.map((r) => `${r.kind.startsWith("penthera") ? "Penthera " + r.version : r.tool} caught ${(r.detect[0] / r.detect[1]).toFixed(2)} of ${r.detect[1]}, flagged ${(r.benign[0] / r.benign[1]).toFixed(2)} of ${r.benign[1]} benign`).join("; "));
  }
  return svg(W, 400, "Malicious-package detectors on the DataDog test half", "Two scatter plots of the share of malicious packages caught against the share of benign packages flagged, with 95% whiskers and a dashed chance line. " + descs.join(". ") + ".", body);
}

/** Read one Markdown table row's cells. */
const cells = (line) => line.split("|").slice(1, -1).map((s) => s.trim());

/** The E14 step-2 CredData table, as written in RESULTS.md. */
export function e14Arms(md) {
  const start = md.indexOf("## E14 step 2");
  const end = md.indexOf("Paired differences", start);
  if (start < 0 || end < 0) throw new Error("E14 step 2 table not found in RESULTS.md");
  const arms = [];
  for (const line of md.slice(start, end).split("\n")) {
    if (!line.startsWith("| ")) continue;
    const c = cells(line);
    const p = /\((\d[\d,]*)\/(\d[\d,]*)\)/.exec(c[2] || "");
    const r = /\((\d[\d,]*)\/(\d[\d,]*)\)/.exec(c[3] || "");
    if (!p || !r) continue;
    const n = (s) => Number(s.replace(/,/g, ""));
    arms.push({ arm: c[0].replace(/\*\*/g, ""), precision: [n(p[1]), n(p[2])], recall: [n(r[1]), n(r[2])] });
  }
  if (arms.length !== 7) throw new Error(`expected 7 E14 arms, found ${arms.length}`);
  return arms;
}

// Figure: E14 arms on CredData, with H2's non-inferiority margin.
function e14Figure() {
  const arms = e14Arms(results);
  const P = arms.find((a) => a.arm.startsWith("P: "));
  const pP = P.precision[0] / P.precision[1];
  const { X, Y, L } = frame({ x0: 52, y0: 14, w: 540, h: 330, xLabel: "In-scope recall (share of true credential rows found)", yLabel: "Strict precision (share of hits that are true)" });
  const body = [`<rect x="${X(0)}" y="${Y(pP)}" width="${f(X(1) - X(0))}" height="${f(Y(pP - 0.02) - Y(pP))}" fill="${C.band}"/>`, ...L];
  body.push(`<line x1="${X(0)}" y1="${Y(pP - 0.02)}" x2="${X(1)}" y2="${Y(pP - 0.02)}" stroke="${C.ref}" stroke-width="1" stroke-dasharray="4 3"/>`);
  body.push(text(X(0) + 5, Y(pP) - 5, "H2 margin: 0.02 below Penthera alone", { size: 11, fill: C.refLabel }));
  const look = {
    "P: Penthera alone": { color: C.penthera, shape: "dot", r: 5.5, fill: C.penthera, weight: "bold", dx: 8, dy: -9, text: "P: Penthera alone (A overlaps)" },
    "A: agreement": { skip: true },
    "U: union": { color: C.after, shape: "dot", r: 5.5, fill: C.penthera, weight: "bold", dx: 8, dy: 15 },
    "gitleaks alone": { dx: 8, dy: 4 },
    "trufflehog alone": { dx: 8, dy: 4 },
    "P + gitleaks": { dx: 10, dy: 4 },
    "P + trufflehog": { dx: -8, dy: 15, anchor: "end" },
  };
  const order = [...arms].sort((a, b) => (a.arm.startsWith("P: ")) - (b.arm.startsWith("P: ")));
  for (const a of order) {
    const lk = look[a.arm] || {};
    if (lk.skip) continue;
    const x = a.recall[0] / a.recall[1];
    const y = a.precision[0] / a.precision[1];
    body.push(...mark(X, Y, { x, y, xci: wilson(...a.recall), yci: wilson(...a.precision), color: lk.color || C.other, shape: lk.shape || "dot", r: lk.r || 4 }));
    body.push(text(X(x) + lk.dx, Y(y) + lk.dy, lk.text || a.arm, { size: 11.5, fill: lk.fill || C.label, anchor: lk.anchor || "start", weight: lk.weight || "normal" }));
  }
  const desc = "Scatter plot of strict precision against in-scope recall, with 95% whiskers, for the E14 arms on the CredData test half (n = 2,220 true rows). " +
    arms.map((a) => `${a.arm}: precision ${(a.precision[0] / a.precision[1]).toFixed(2)}, recall ${(a.recall[0] / a.recall[1]).toFixed(2)}`).join("; ") +
    ". A shaded band marks precision within 0.02 of Penthera alone; the union falls below it.";
  return svg(W, 400, "E14 arms on CredData: precision against recall", desc, body);
}

/** The E11 summary table: each estimate with its interval. */
export function e11Estimates(md) {
  const start = md.indexOf("## Summary");
  const end = md.indexOf("The short version", start);
  if (start < 0 || end < 0) throw new Error("E11 summary not found in RESULTS.md");
  const out = [];
  for (const line of md.slice(start, end).split("\n")) {
    const c = cells(line);
    if (!/^H\d$/.test(c[0] || "")) continue;
    const re = /(?:(npm|PyPI) )?(\d\.\d\d) \[(\d\.\d\d), (\d\.\d\d)\]/g;
    let m;
    while ((m = re.exec(c[2]))) out.push({ h: c[0], what: c[1], eco: m[1] || "", est: +m[2], lo: +m[3], hi: +m[4] });
  }
  if (out.length !== 7) throw new Error(`expected 7 E11 estimates, found ${out.length}`);
  return out;
}

// Registered thresholds, E11 protocol § 1 (copied, not read: the protocol is prose).
const E11_THRESHOLDS = { H1: [">", 0.7], H2: [">", 0.5], H3: [">", 0.5], H4: [">", 0.7], H5: ["<", 0.1] };

// Figure: E11's registered hypotheses, each estimate against its threshold.
function e11Figure() {
  const est = e11Estimates(results);
  const x0 = 230, w = 380, y0 = 22, rowH = 44;
  const X = (v) => f(x0 + v * w);
  const h = est.length * rowH;
  const body = [];
  for (let i = 1; i < 5; i++) body.push(`<line x1="${X(i / 5)}" y1="${y0}" x2="${X(i / 5)}" y2="${y0 + h}" stroke="${C.grid}" stroke-width="1"/>`);
  body.push(`<rect x="${X(0)}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${C.frame}" stroke-width="1"/>`);
  for (let i = 0; i <= 5; i++) body.push(text(X(i / 5), y0 + h + 15, (i / 5).toFixed(1), { size: 11, anchor: "middle" }));
  body.push(text(x0 + w / 2, y0 + h + 33, "Estimate (share), with 95% interval", { fill: C.ink, anchor: "middle" }));
  est.forEach((e, i) => {
    const y = y0 + i * rowH + rowH / 2 + 6;
    const [dir, thr] = E11_THRESHOLDS[e.h];
    const pass = dir === ">" ? e.lo > thr : e.hi < thr;
    const name = `${e.h} ${e.what.replace(/ above .*| below .*/, "")}${e.eco ? `, ${e.eco}` : ""}`;
    body.push(text(16, y + 4, name, { fill: C.ink }));
    body.push(`<line x1="${X(thr)}" y1="${y - 16}" x2="${X(thr)}" y2="${y + 12}" stroke="${C.ref}" stroke-width="1" stroke-dasharray="3 2"/>`);
    body.push(text(X(thr) + (dir === ">" ? 4 : -4), y - 8, `${dir} ${thr}`, { size: 11, fill: C.refLabel, anchor: dir === ">" ? "start" : "end" }));
    const color = pass ? C.penthera : C.before;
    body.push(`<line x1="${X(e.lo)}" y1="${y}" x2="${X(e.hi)}" y2="${y}" stroke="${color}" stroke-width="1.5"/>`);
    body.push(pass
      ? `<circle cx="${X(e.est)}" cy="${y}" r="5" fill="${color}" stroke="${C.plate}" stroke-width="1.5"/>`
      : `<rect x="${f(X(e.est) - 4.5)}" y="${f(y - 4.5)}" width="9" height="9" fill="${color}" stroke="${C.plate}" stroke-width="1.5"/>`);
    const right = X(e.hi) + 8 < X(1) - 40;
    body.push(text(right ? X(e.hi) + 8 : X(e.lo) - 8, y + 4, pass ? "passes" : "fails", { size: 11, fill: color, anchor: right ? "start" : "end" }));
  });
  const desc = "Dot plot of the seven E11 estimates for Penthera 1.9.0, each with its 95% interval, against the threshold registered in E11 § 1 (dashed). " +
    est.map((e) => `${e.h}${e.eco ? " " + e.eco : ""}: ${e.est} [${e.lo}, ${e.hi}], threshold ${E11_THRESHOLDS[e.h][0]} ${E11_THRESHOLDS[e.h][1]}`).join("; ") + ". Only H4 PyPI and H5 npm clear their threshold, so no hypothesis holds for both ecosystems.";
  return svg(W, y0 + h + 44, "E11 estimates against their registered thresholds", desc, body);
}

const FIGURES = {
  "e11-hypotheses.svg": e11Figure,
  "e11b-secrets-precision-recall.svg": secretsFigure,
  "e11b-malware-caught-vs-false-alarms.svg": malwareFigure,
  "e14-creddata-arms.svg": e14Figure,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  mkdirSync(OUT, { recursive: true });
  let stale = 0;
  for (const [name, make] of Object.entries(FIGURES)) {
    const file = join(OUT, name);
    const out = make();
    if (check) {
      let cur = "";
      try { cur = readFileSync(file, "utf-8"); } catch { /* missing counts as stale */ }
      if (cur !== out) { console.error(`stale: ${name}`); stale++; }
    } else {
      writeFileSync(file, out);
      console.log(`wrote bench/public/figures/${name}`);
    }
  }
  if (stale) process.exit(1);
}
