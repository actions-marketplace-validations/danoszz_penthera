#!/usr/bin/env node
/**
 * Scatter charts of the public-benchmark results, in the site's style, for
 * social posts: secrets (precision vs recall, with F1 curves) and malware
 * (caught vs false alarms on normal packages). Numbers come only from
 * published.json; headless Chrome renders the HTML. Run `node site/build.mjs` first.
 *
 *   node scripts/media/benchmark-scatter.mjs --published bench/public/published.json --out <dir>
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { published: { type: "string" }, out: { type: "string" }, chrome: { type: "string" } } });
const ROOT = resolve(import.meta.dirname, "..", "..");
const DIST = join(ROOT, "site", "dist");
const CHROME = args.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pub = JSON.parse(readFileSync(resolve(args.published), "utf-8"));
const out = resolve(args.out);
mkdirSync(out, { recursive: true });

const ACCENT = "#7a7aff", INK = "255,255,255";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const short = (t) => String(t).replace(/\s*\(.*$/, "").replace(/ \d[\w.-]*$/, "");

/** One SVG scatter. pts: {x, y, label, us, shape}. */
function scatter({ w, h, title, sub, xLabel, yLabel, pts, curves = [], diagonal = false, xMax = 1 }) {
  const m = { l: 64, r: 24, t: 70, b: 56 };
  const X = (v) => m.l + (v / xMax) * (w - m.l - m.r);
  const Y = (v) => h - m.b - v * (h - m.t - m.b);
  const g = [];
  for (let i = 0; i <= 4; i++) {
    const v = i / 4;
    g.push(`<line x1="${X(0)}" x2="${X(xMax)}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${m.l - 10}" y="${Y(v) + 4}" class="tick" text-anchor="end">${v.toFixed(2)}</text>`);
    const xv = (i / 4) * xMax;
    g.push(`<line y1="${Y(0)}" y2="${Y(1)}" x1="${X(xv)}" x2="${X(xv)}" class="grid"/><text x="${X(xv)}" y="${h - m.b + 22}" class="tick" text-anchor="middle">${xv.toFixed(2)}</text>`);
  }
  for (const c of curves) g.push(`<path d="${c.d(X, Y)}" class="curve"/><text x="${c.lx(X)}" y="${c.ly(Y)}" class="curve-l">${esc(c.label)}</text>`);
  if (diagonal) g.push(`<line x1="${X(0)}" y1="${Y(0)}" x2="${X(Math.min(1, xMax))}" y2="${Y(Math.min(1, xMax))}" class="curve"/><text x="${X(Math.min(1, xMax) * 0.62)}" y="${Y(Math.min(1, xMax) * 0.62) - 8}" class="curve-l">no better than chance</text>`);
  // Dots on (almost) the same spot share one label; labels that would collide
  // move down a line at a time.
  const groups = [];
  for (const p of [...pts].sort((a, b) => b.us - a.us)) {
    const cx = X(p.x), cy = Y(p.y);
    const gr = groups.find((g) => !g.us && !p.us && Math.abs(g.cx - cx) < 6 && Math.abs(g.cy - cy) < 6);
    if (gr) gr.labels.push(p.label);
    else groups.push({ ...p, cx, cy, labels: [p.label] });
  }
  const placed = [];
  const dots = groups.sort((a, b) => b.us - a.us).map((p) => {
    const { cx, cy } = p;
    const label = p.labels.join(" / ");
    const lw = label.length * (p.us ? 9.5 : 8);
    const right = cx + 12 + lw < w - m.r;
    let ly = cy + 4;
    const box = () => ({ x0: right ? cx + 10 : cx - 10 - lw, x1: right ? cx + 10 + lw : cx - 10, y0: ly - 13, y1: ly + 3 });
    const hits = () => placed.some((b) => { const c = box(); return c.x0 < b.x1 && c.x1 > b.x0 && c.y0 < b.y1 && c.y1 > b.y0; });
    // Nearest free line: just above the dot, then below, then further out.
    for (const dy of [0, -16, 16, -32, 32, -48, 48, 64]) { ly = cy + 4 + dy; if (!hits()) break; }
    placed.push(box());
    const mark = p.shape === "square" ? `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" class="${p.us ? "us" : "dot"}"/>` : `<circle cx="${cx}" cy="${cy}" r="${p.us ? 9 : 6}" class="${p.us ? "us" : "dot"}"/>`;
    return `${mark}<text x="${cx + (right ? 12 : -12)}" y="${ly}" class="${p.us ? "lab-us" : "lab"}" text-anchor="${right ? "start" : "end"}">${esc(label)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="${m.l}" y="28" class="t">${esc(title)}</text><text x="${m.l}" y="50" class="s">${esc(sub)}</text>
    ${g.join("")}
    <text x="${(m.l + w - m.r) / 2}" y="${h - 10}" class="ax" text-anchor="middle">${esc(xLabel)}</text>
    <text transform="translate(16 ${(m.t + h - m.b) / 2}) rotate(-90)" class="ax" text-anchor="middle">${esc(yLabel)}</text>
    ${dots.join("")}</svg>`;
}

// F1 = 2PR/(P+R): for a fixed F1 and recall r, precision p = F1*r / (2r - F1).
const f1Curve = (f) => ({
  label: `F1 ${f.toFixed(1)}`,
  d: (X, Y) => { const ps = []; for (let r = f / 2 + 0.005; r <= 1.0001; r += 0.005) { const p = (f * r) / (2 * r - f); if (p <= 1) ps.push(`${X(r)},${Y(p)}`); } return `M${ps.join(" L")}`; },
  lx: (X) => X(0.97), ly: (Y) => Y((f * 0.97) / (2 * 0.97 - f)) - 6,
});

const S = pub.benchmarks.secrets;
const secretPts = S.rows.filter((r) => r.p != null && r.r != null && (r.kind !== "tool" || !r.excluded)).map((r) => ({
  x: r.r, y: r.p, us: r.kind === "penthera", label: r.kind === "penthera" ? "Penthera 2.0" : r.kind === "penthera-before" ? "Penthera 1.9" : short(r.tool),
}));
const malPts = [];
for (const [k, eco] of [["npm", "npm"], ["pypi", "PyPI"]]) {
  for (const r of pub.benchmarks[k].rows) {
    if (r.r == null || r.fa == null || r.kind === "penthera-before" || /osv/i.test(r.tool)) continue;
    malPts.push({ x: r.fa, y: r.r, us: r.kind === "penthera", shape: k === "npm" ? "circle" : "square", label: `${r.kind === "penthera" ? "Penthera" : short(r.tool)} · ${eco}` });
  }
}

const secretsSvg = (w, h) => scatter({ w, h, title: "Leaked secrets · Samsung CredData", sub: "Up and right is better. Curves: equal F1.", xLabel: "Recall: share of real secrets found", yLabel: "Precision: share of warnings that are real", pts: secretPts, curves: [0.2, 0.4, 0.6, 0.8].map(f1Curve) });
const malwareSvg = (w, h) => scatter({ w, h, title: "Malicious packages · DataDog dataset", sub: "Up and left is better. ● npm  ■ PyPI", xLabel: "False alarms: share of normal packages flagged", yLabel: "Caught: share of malicious packages flagged", pts: malPts, diagonal: true });

const tmp = mkdtempSync(join(tmpdir(), "penthera-scatter-"));
cpSync(join(DIST, "fonts"), join(tmp, "fonts"), { recursive: true });
cpSync(join(DIST, "logo.svg"), join(tmp, "logo.svg"));
cpSync(join(ROOT, "site", "media", "field.png"), join(tmp, "field.png"));

function page(w, h, panels, cols) {
  const pw = cols === 2 ? (w - 64 * 2 - 32) / 2 : w - 64 * 2;
  const ph = cols === 2 ? h - 300 : (h - 330 - 32) / panels.length;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Departure Mono"; src: url("fonts/DepartureMono-Regular.woff2") format("woff2"); }
  html { background: #000; } body { position: relative; z-index: 0; margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; color: #fff; font-family: "Helvetica Neue", Helvetica, sans-serif; padding: 48px 64px; box-sizing: border-box; display: grid; grid-template-rows: auto 1fr auto; gap: 20px; }
  body::before { content: ""; position: fixed; inset: 0; z-index: -2; background: url("field.png") 0 0 / 180px auto repeat; opacity: 0.16; }
  body::after { content: ""; position: fixed; inset: 0; z-index: -1; background: repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px), radial-gradient(70% 60% at 85% 0%, rgba(0,0,237,0.35), transparent 70%); }
  .head img { height: 38px; filter: invert(1); display: block; } .k { margin: 12px 0 0; font: 18px "Departure Mono", monospace; color: rgba(${INK},0.72); } h1 { margin: 6px 0 0; font-size: 46px; font-weight: 500; letter-spacing: -0.035em; }
  .panels { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 32px; align-content: start; }
  .panel { border: 1px solid rgba(${INK},0.5); background: linear-gradient(160deg, rgba(${INK},0.10), rgba(${INK},0.03)); }
  svg text { font-family: "Departure Mono", monospace; fill: rgba(${INK},0.75); }
  .t { font: 500 20px "Helvetica Neue", Helvetica, sans-serif; fill: #fff; } .s { font-size: 14px; } .tick { font-size: 12px; fill: rgba(${INK},0.55); } .ax { font-size: 13px; }
  .grid { stroke: rgba(${INK},0.12); } .curve { stroke: rgba(${INK},0.35); stroke-dasharray: 4 5; fill: none; } .curve-l { font-size: 12px; fill: rgba(${INK},0.5); text-anchor: end; }
  .dot { fill: rgba(${INK},0.8); } .us { fill: ${ACCENT}; stroke: #fff; stroke-width: 2; }
  .lab { font-size: 13px; fill: rgba(${INK},0.8); } .lab-us { font-size: 15px; fill: #fff; font-weight: 700; }
  .f { display: flex; justify-content: space-between; font: 16px "Departure Mono", monospace; color: rgba(${INK},0.72); }
  </style></head><body>
  <div class="head"><img src="logo.svg" alt="Penthera"><p class="k">Public benchmarks · sealed test half</p><h1>Where Penthera sits among the free tools</h1></div>
  <div class="panels">${panels.map((f) => `<div class="panel">${f(pw, ph)}</div>`).join("")}</div>
  <p class="f"><span>Each dot is a free tool on the same data. Penthera in blue.</span><span>penthera.org/#public-benchmarks</span></p>
  </body></html>`;
}

function shot(name, html, w, h) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, html);
  const png = join(out, `${name}.png`);
  rmSync(png, { force: true });
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--window-size=${w},${h}`, `--screenshot=${png}`, `file://${file}`], { encoding: "utf-8", timeout: 60_000 });
  if (!existsSync(png)) throw new Error(`chrome: ${r.stderr.slice(-300)}`);
  console.log(png);
}

shot("scatter-wide", page(1600, 900, [secretsSvg, malwareSvg], 2), 1600, 900);
shot("scatter-secrets-square", page(1080, 1080, [secretsSvg], 1), 1080, 1080);
shot("scatter-malware-square", page(1080, 1080, [malwareSvg], 1), 1080, 1080);
rmSync(tmp, { recursive: true, force: true });
