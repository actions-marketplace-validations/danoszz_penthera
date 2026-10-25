#!/usr/bin/env node
/**
 * Light-theme launch images: one branded hero, figures in the style of a
 * research paper (error bars are the Wilson intervals from published.json),
 * and screenshots of the real CLI, the local dashboard and penthera.org.
 * Numbers come only from published.json. Run `node site/build.mjs` first.
 *
 *   node scripts/media/launch-figures.mjs --published bench/public/published.json --out <dir>
 *
 * Writes <out>/main/*.png, <out>/figures/*.png and <out>/product/*.png, all at 2x.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { published: { type: "string" }, out: { type: "string" }, chrome: { type: "string" } } });
const ROOT = resolve(import.meta.dirname, "..", "..");
const DIST = join(ROOT, "site", "dist");
const CHROME = args.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pub = JSON.parse(readFileSync(resolve(args.published), "utf-8"));
const B = pub.benchmarks;
const out = resolve(args.out);
for (const d of ["main", "figures", "product"]) mkdirSync(join(out, d), { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), "penthera-figs-"));
cpSync(join(DIST, "fonts"), join(tmp, "fonts"), { recursive: true });
cpSync(join(DIST, "logo.svg"), join(tmp, "logo.svg"));
cpSync(join(ROOT, "site", "media", "field.png"), join(tmp, "field.png"));

// Inline: Chrome loads mask images in CORS mode, which file:// fails.
const FIELD = `data:image/png;base64,${readFileSync(join(ROOT, "site", "media", "field.png")).toString("base64")}`;
const BLUE = "#0000ed", INK = "#0a0a0a", GREY = "#6b6b6b", PAPER = "#fdfdfa";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f2 = (v) => v.toFixed(2).replace("-0.00", "0.00");
const pct = (v) => `${Math.round(v * 100)}%`;
const NAMES = { gitleaks: "Gitleaks", "detect-secrets": "detect-secrets", trufflehog: "TruffleHog", noseyparker: "Nosey Parker", kingfisher: "Kingfisher", ripsecrets: "ripsecrets", credsweeper: "CredSweeper", whispers: "Whispers", deepsecrets: "deepsecrets", secretlint: "secretlint", clamav: "ClamAV", yara: "YARA", ossgadget: "OSSGadget", malcontent: "malcontent", "osv-scanner": "OSV-Scanner", bandit4mal: "Bandit4Mal", aura: "Aura", njsscan: "njsscan", codeql: "CodeQL", semgrep: "Semgrep", "semgrep, every file": "Semgrep, every file", "eslint-plugin-security": "eslint-plugin-security", bearer: "Bearer", graudit: "graudit", odgen: "ODGen" };
const name = (r) => (r.kind.startsWith("penthera") ? `Penthera ${r.version}` : NAMES[r.tool] || r.tool);
const scoreKey = { secrets: "F1", npm: "Youden's J", pypi: "Youden's J", library: "recall" };
const others = (b) => b.rows.filter((r) => r.rank && !r.kind.startsWith("penthera"));
const us = (b) => b.rows.find((r) => r.kind === "penthera");
const before = (b) => b.rows.find((r) => r.kind === "penthera-before");

// ── headless Chrome over the DevTools protocol (Node's own WebSocket) ──
const freePort = () => new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function openBrowser() {
  const port = await freePort();
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${join(tmp, "chrome")}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await wait(100);
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
  let id = 0;
  const pending = new Map(), waiters = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); }
    else if (m.method) for (const w of waiters.splice(0)) if (w.method === m.method) w.ok(); else waiters.push(w);
  });
  const send = (method, params = {}) => new Promise((ok, no) => { pending.set(++id, { ok, no }); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method) => new Promise((ok) => waiters.push({ method, ok }));
  await send("Page.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  return {
    async shot(url, file, { w, h, js, pre, clip, pad = 0, settle = 500 }) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: false });
      for (const step of pre ? ["pre", "real"] : ["real"]) {
        const loaded = once("Page.loadEventFired");
        // The setup step loads the bare origin: a sign-in link works once.
        await send("Page.navigate", { url: step === "pre" ? `${new URL(url).origin}/` : url });
        await loaded;
        if (step === "pre") await send("Runtime.evaluate", { expression: pre });
      }
      await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
      if (js) await send("Runtime.evaluate", { expression: js, awaitPromise: true });
      await wait(settle);
      let c = clip;
      if (typeof clip === "string") {
        const r = await send("Runtime.evaluate", { expression: `(() => { const b = document.querySelector(${JSON.stringify(clip)}).getBoundingClientRect(); return JSON.stringify({ x: b.x + scrollX - ${pad}, y: b.y + scrollY - ${pad}, width: b.width + ${2 * pad}, height: b.height + ${2 * pad} }); })()`, returnByValue: true });
        c = JSON.parse(r.result.value);
      }
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!c, ...(c ? { clip: { ...c, scale: 1 } } : {}) });
      writeFileSync(file, Buffer.from(r.data, "base64"));
      console.log(file);
    },
    close() { ws.close(); const exited = new Promise((ok) => proc.once("exit", ok)); proc.kill(); return exited; },
  };
}

// ── shared page shell ──
const FONTS = `@font-face { font-family: "Departure Mono"; src: url("fonts/DepartureMono-Regular.woff2") format("woff2"); }`;
const SANS = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
const SERIF = `Charter, "Iowan Old Style", Georgia, serif`;
const MONO = `"Departure Mono", ui-monospace, Menlo, monospace`;
function htmlPage(name, w, h, body, css) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${FONTS}
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: ${PAPER}; color: ${INK}; font-family: ${SANS}; -webkit-font-smoothing: antialiased; }
  * { box-sizing: border-box; } ${css}</style></head><body>${body}</body></html>`);
  return `file://${file}`;
}

// ── 1. The hero: heavy on the brand, light theme ──
function hero(w, h) {
  const s = Math.min(w / 1600, h / 900);
  const square = w / h < 1.4;
  const px = (v) => `${Math.round(v * s)}px`;
  const tiles = [
    ["1st", "of 6", "Malicious npm packages", `${pct(us(B.npm).r)} caught, ${us(B.npm).benign[0]} false alarms in ${us(B.npm).benign[1]}`],
    ["1st", "of 8", "Malicious PyPI packages", `${pct(us(B.pypi).r)} caught, ${pct(us(B.pypi).fa)} false alarms`],
    ["1st", "of 8, tied", "Injection bugs in JS libraries", `${us(B.library).command[0]} of ${us(B.library).command[1]} command injections found`],
    ["2nd", "of 10", "Leaked secrets", `${pct(us(B.secrets).p)} of warnings real, ${pct(us(B.secrets).r)} found`],
  ];
  const css = `
  body { position: relative; z-index: 0; padding: ${px(square ? 72 : 64)} ${px(72)}; display: grid; grid-template-rows: auto 1fr auto auto; gap: ${px(28)}; }
  .fade { position: absolute; inset: ${square ? "0 0 38% 0" : "0 0 0 30%"}; z-index: -1; -webkit-mask-image: ${square ? "linear-gradient(180deg, transparent 12%, #000 30%, #000 60%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, #000 55%)"}; }
  .field { position: absolute; inset: 0; background: ${BLUE}; -webkit-mask: url("${FIELD}") center / cover no-repeat; image-rendering: pixelated; opacity: 0.9; }
  .glow { position: absolute; inset: 0; z-index: -2; background: radial-gradient(60% 70% at 100% 0%, rgba(0,0,237,0.10), transparent 70%); }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { height: ${px(64)}; width: auto; display: block; }
  .ver { font-family: ${MONO}; font-size: ${px(20)}; color: #fff; background: ${BLUE}; padding: ${px(8)} ${px(14)}; letter-spacing: 0.02em; }
  .head { align-self: end; }
  .k { margin: 0 0 ${px(14)}; font-family: ${MONO}; font-size: ${px(20)}; color: ${BLUE}; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { margin: 0; font-size: ${px(square ? 104 : 112)}; line-height: 0.92; letter-spacing: -0.045em; font-weight: 500; max-width: ${square ? "100%" : "62%"}; }
  h1 em { font-style: normal; color: ${BLUE}; }
  .tiles { display: grid; grid-template-columns: repeat(${square ? 2 : 4}, 1fr); gap: ${px(14)}; }
  .tile { padding: ${px(18)} ${px(20)} ${px(20)}; border: 1px solid ${INK}; background: linear-gradient(160deg, #ffffff 0%, #f1f1ec 100%); box-shadow: 0 1px 0 #fff inset, 0 ${px(10)} ${px(30)} rgba(0,0,40,0.08); display: grid; gap: ${px(6)}; }
  .rank { display: flex; align-items: baseline; gap: ${px(10)}; }
  .rank b { font-size: ${px(72)}; line-height: 0.9; letter-spacing: -0.05em; font-weight: 500; color: ${BLUE}; }
  .rank span, .metric { font-family: ${MONO}; font-size: ${px(15)}; color: ${GREY}; }
  .what { font-size: ${px(21)}; font-weight: 500; letter-spacing: -0.01em; }
  .foot { display: flex; justify-content: space-between; font-family: ${MONO}; font-size: ${px(17)}; color: ${INK}; }
  .foot span:last-child { color: ${BLUE}; }`;
  const body = `<div class="glow"></div><div class="fade"><div class="field"></div></div>
  <div class="top"><img class="logo" src="logo.svg" alt="Penthera"><span class="ver">v2.0.0 · MIT</span></div>
  <div class="head"><p class="k">Public benchmarks · 25 free tools · sealed test half</p>
  <h1>Ranked against the <em>free tools.</em></h1></div>
  <div class="tiles">${tiles.map(([r, of, what, m]) => `<div class="tile"><div class="rank"><b>${r}</b><span>${of}</span></div><div class="what">${what}</div><div class="metric">${m}</div></div>`).join("")}</div>
  <div class="foot"><span>Offline · rules decide every finding · scored once</span><span>penthera.org</span></div>`;
  return htmlPage(`hero-${w}x${h}`, w, h, body, css);
}

// ── 2. Figures, in the style of a paper ──
const FIG_CSS = `
  body { padding: 40px 56px 32px; display: grid; grid-template-rows: auto 1fr auto auto; gap: 14px; background: #ffffff; }
  .run { display: flex; justify-content: space-between; font-family: ${SERIF}; font-size: 15px; color: ${GREY}; font-style: italic; border-bottom: 0.75px solid ${INK}; padding-bottom: 8px; }
  .plot { display: flex; justify-content: center; align-items: center; min-height: 0; }
  .cap { margin: 0; font-family: ${SERIF}; font-size: 19px; line-height: 1.4; color: ${INK}; max-width: 1380px; }
  .cap b { font-weight: 700; }
  .foot { display: flex; justify-content: space-between; align-items: center; font-family: ${MONO}; font-size: 14px; color: ${GREY}; border-top: 0.75px solid #d0d0d0; padding-top: 10px; }
  .foot img { height: 20px; width: auto; }
  svg text { font-family: ${SANS}; }
  .tick { font-size: 14px; fill: ${INK}; } .axl { font-size: 16px; fill: ${INK}; } .ptitle { font-size: 17px; fill: ${INK}; font-weight: 500; }
  .lab { font-size: 14px; fill: #333; } .lab-us { font-size: 15px; fill: ${BLUE}; font-weight: 600; }
  .note { font-size: 13px; fill: ${GREY}; font-style: italic; font-family: ${SERIF}; }`;
function figure(file, num, plotSvg, caption) {
  const body = `<div class="run"><span>Penthera 2.0 — E11b, public benchmarks against free tools</span><span>Sealed test half, scored once · ${pub.date}</span></div>
  <div class="plot">${plotSvg}</div>
  <p class="cap"><b>${num}.</b> ${caption}</p>
  <div class="foot"><img src="logo.svg" alt="Penthera"><span>Data, method and reproduction: penthera.org/#public-benchmarks</span></div>`;
  return htmlPage(file, 1600, 900, body, FIG_CSS);
}

/** Matplotlib-like axes: a closed box, inward ticks, a faint dotted grid. */
function axes({ x, y, w, h, xd = [0, 1], yd = [0, 1], ticks = 5, xLabel, yLabel, title, fmt = f2 }) {
  const X = (v) => x + ((v - xd[0]) / (xd[1] - xd[0])) * w;
  const Y = (v) => y + h - ((v - yd[0]) / (yd[1] - yd[0])) * h;
  const g = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="1"/>`];
  for (let i = 0; i <= ticks; i++) {
    const xv = xd[0] + ((xd[1] - xd[0]) * i) / ticks, yv = yd[0] + ((yd[1] - yd[0]) * i) / ticks;
    if (i && i < ticks) g.push(`<line x1="${X(xv)}" x2="${X(xv)}" y1="${y}" y2="${y + h}" stroke="#d9d9d9" stroke-dasharray="2 3"/><line x1="${x}" x2="${x + w}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="#d9d9d9" stroke-dasharray="2 3"/>`);
    g.push(`<line x1="${X(xv)}" x2="${X(xv)}" y1="${y + h}" y2="${y + h - 6}" stroke="${INK}"/><text x="${X(xv)}" y="${y + h + 22}" class="tick" text-anchor="middle">${fmt(xv)}</text>`);
    g.push(`<line x1="${x}" x2="${x + 6}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="${INK}"/><text x="${x - 10}" y="${Y(yv) + 5}" class="tick" text-anchor="end">${fmt(yv)}</text>`);
  }
  if (xLabel) g.push(`<text x="${x + w / 2}" y="${y + h + 50}" class="axl" text-anchor="middle">${esc(xLabel)}</text>`);
  if (yLabel) g.push(`<text transform="translate(${x - 58} ${y + h / 2}) rotate(-90)" class="axl" text-anchor="middle">${esc(yLabel)}</text>`);
  if (title) g.push(`<text x="${x}" y="${y - 14}" class="ptitle">${esc(title)}</text>`);
  return { X, Y, svg: g.join("") };
}

/**
 * Points with Wilson error bars and labels. Labels sit right of (or left of)
 * their point; ones that would overlap are pushed apart vertically and keep a
 * leader line back to the point.
 */
function points(ax, pts, { right = Infinity } = {}) {
  const g = [];
  for (const p of pts) {
    const c = p.us ? BLUE : p.ghost ? BLUE : "#444";
    const sw = p.us ? 2 : 1.2;
    if (p.xci) g.push(`<path d="M${ax.X(p.xci[0])},${ax.Y(p.y)}H${ax.X(p.xci[1])}M${ax.X(p.xci[0])},${ax.Y(p.y) - 4}v8M${ax.X(p.xci[1])},${ax.Y(p.y) - 4}v8" stroke="${c}" stroke-width="${sw}" fill="none" opacity="${p.ghost ? 0.6 : 0.9}"/>`);
    if (p.yci) g.push(`<path d="M${ax.X(p.x)},${ax.Y(p.yci[0])}V${ax.Y(p.yci[1])}M${ax.X(p.x) - 4},${ax.Y(p.yci[0])}h8M${ax.X(p.x) - 4},${ax.Y(p.yci[1])}h8" stroke="${c}" stroke-width="${sw}" fill="none" opacity="${p.ghost ? 0.6 : 0.9}"/>`);
  }
  for (const p of pts) {
    const cx = ax.X(p.x), cy = ax.Y(p.y);
    if (p.square) g.push(`<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" fill="#fff" stroke="#444" stroke-width="1.5"/>`);
    else if (p.ghost) g.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="#fff" stroke="${BLUE}" stroke-width="2"/>`);
    else if (p.hollow) g.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="#444" stroke-width="1.5"/>`);
    else g.push(`<circle cx="${cx}" cy="${cy}" r="${p.us ? 9 : 6}" fill="${p.us ? BLUE : "#444"}" stroke="#fff" stroke-width="1.5"/>`);
  }
  // Labels: two columns (left, right of their point), each spread apart.
  for (const p of pts) p.ax = ax;
  const labs = pts.map((p) => {
    const cx = ax.X(p.x), cy = ax.Y(p.y), lw = p.label.length * (p.us ? 8.6 : 7.6);
    const side = p.side || (cx + 16 + lw > right ? "l" : "r");
    return { p, cx, cy, side, ly: cy + 5 + (p.dy || 0) };
  });
  for (const side of ["l", "r"]) {
    const col = labs.filter((l) => l.side === side).sort((a, b) => a.ly - b.ly);
    for (let pass = 0; pass < 30; pass++) for (let i = 1; i < col.length; i++) {
      const a = col[i - 1], b = col[i];
      const overlapX = Math.abs(a.cx - b.cx) < (a.p.label.length + b.p.label.length) * 4.2 + 24;
      if (overlapX && b.ly - a.ly < 18) { const d = (18 - (b.ly - a.ly)) / 2; a.ly -= d; b.ly += d; }
    }
  }
  for (const l of labs) {
    const bar = l.p.xci ? (l.side === "r" ? l.p.ax.X(l.p.xci[1]) - l.cx : l.cx - l.p.ax.X(l.p.xci[0])) : 0;
    const tx = l.cx + (l.side === "r" ? 1 : -1) * (Math.max(14, bar + 6) + (l.p.dx || 0));
    const moved = Math.abs(l.ly - (l.cy + 5)) > 6 || l.p.dx;
    if (moved && Math.abs(l.ly - (l.cy + 5)) > 6) g.push(`<line x1="${l.cx + (l.side === "r" ? 7 : -7)}" y1="${l.cy}" x2="${tx + (l.side === "r" ? -3 : 3)}" y2="${l.ly - 5}" stroke="#999" stroke-width="0.75"/>`);
    g.push(`<text x="${tx}" y="${l.ly}" class="${l.p.us ? "lab-us" : "lab"}" text-anchor="${l.side === "r" ? "start" : "end"}">${esc(l.p.label)}</text>`);
  }
  return g.join("");
}

function figSecrets() {
  const b = B.secrets;
  const ax = axes({ x: 170, y: 30, w: 860, h: 560, xLabel: "Recall (share of real secrets found)", yLabel: "Precision (share of warnings that are real)" });
  const iso = [0.2, 0.4, 0.6, 0.8].map((f) => {
    const ps = [];
    for (let r = f / 2 + 0.002; r <= 1.0001; r += 0.004) { const p = (f * r) / (2 * r - f); if (p <= 1) ps.push(`${ax.X(r).toFixed(1)},${ax.Y(p).toFixed(1)}`); }
    return `<path d="M${ps.join("L")}" fill="none" stroke="#9a9a9a" stroke-width="1" stroke-dasharray="5 4"/><text x="${ax.X(0.985)}" y="${ax.Y((f * 0.985) / (2 * 0.985 - f)) - 6}" class="note" text-anchor="end">F1 = ${f.toFixed(1)}</text>`;
  }).join("");
  const pts = b.rows.map((r) => ({
    x: r.r, y: r.p, xci: r.recallCI, yci: r.precisionCI, us: r.kind === "penthera", ghost: r.kind === "penthera-before",
    hollow: !!r.excluded && !r.kind.startsWith("penthera"), label: name(r) + (r.tool === "credsweeper" ? " †" : ""),
    side: r.tool === "credsweeper" || r.tool === "secretlint" ? "l" : undefined,
  }));
  const u = us(b), o = before(b);
  const arrow = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="${BLUE}"/></marker></defs>
    <path d="M${ax.X(o.r) + 10},${ax.Y(o.p) - 8} Q${ax.X(0.3)},${ax.Y(0.86)} ${ax.X(u.r) - 14},${ax.Y(u.p) + 2}" fill="none" stroke="${BLUE}" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ah)" opacity="0.7"/>`;
  const legend = `<g transform="translate(1080 60)">
    <circle cx="8" cy="0" r="8" fill="${BLUE}"/><text x="26" y="5" class="lab">Penthera 2.0 (rank ${u.rank} of ${b.of})</text>
    <circle cx="8" cy="30" r="7" fill="#fff" stroke="${BLUE}" stroke-width="2"/><text x="26" y="35" class="lab">Penthera 1.9, one release earlier</text>
    <circle cx="8" cy="60" r="6" fill="#444"/><text x="26" y="65" class="lab">Free tool, ranked</text>
    <circle cx="8" cy="90" r="6" fill="#fff" stroke="#444" stroke-width="1.5"/><text x="26" y="95" class="lab">Shown, not ranked</text>
    <path d="M0,120h16" stroke="#444"/><path d="M0,116v8M16,116v8" stroke="#444"/><text x="26" y="125" class="lab">95% Wilson interval</text>
    <path d="M0,150h16" stroke="#9a9a9a" stroke-dasharray="5 4"/><text x="26" y="155" class="lab">Equal F1 (the ranking score)</text>
    <text x="0" y="200" class="note">n = ${b.n.toLocaleString("en")} labelled secrets in the</text><text x="0" y="218" class="note">sealed half of Samsung CredData.</text>
    <text x="0" y="250" class="note">† CredSweeper is made by the CredData</text><text x="0" y="268" class="note">authors and trained on this dataset.</text></g>`;
  const svg = `<svg width="1480" height="660" viewBox="0 0 1480 660" xmlns="http://www.w3.org/2000/svg">${ax.svg}${iso}${arrow}${points(ax, pts, { right: 1030 })}${legend}</svg>`;
  return figure("fig-secrets", "Figure 1", svg, `Precision against recall for secret detection on Samsung CredData. Each point is one free tool run with its default settings on the same files and scored the same way. Penthera 2.0 has F1 = ${f2(u.f1)} (precision ${f2(u.p)}, recall ${f2(u.r)}), second to deepsecrets (F1 = ${f2(b.rows.find((r) => r.tool === "deepsecrets").f1)}); 1.9 scored F1 = ${f2(o.f1)}.`);
}

const benignN = (b) => { const ns = b.rows.map((r) => r.benign[1]); const lo = Math.min(...ns), hi = Math.max(...ns); return lo === hi ? `${hi}` : `${lo}–${hi}`; };
function malwarePanel(b, x, title) {
  const ax = axes({ x, y: 50, w: 560, h: 500, xLabel: "False alarms (share of normal packages flagged)", yLabel: "Caught (share of malicious packages)", title });
  const chance = `<line x1="${ax.X(0)}" y1="${ax.Y(0)}" x2="${ax.X(1)}" y2="${ax.Y(1)}" stroke="#9a9a9a" stroke-dasharray="5 4"/><text transform="translate(${ax.X(0.7)} ${ax.Y(0.7) - 8}) rotate(-41.8)" class="note" text-anchor="middle">no better than chance</text>`;
  const pts = b.rows.map((r) => ({
    x: r.fa, y: r.r, xci: r.benignCI, yci: r.detectCI, us: r.kind === "penthera", ghost: r.kind === "penthera-before",
    square: r.kind === "lookup", hollow: !!r.excluded && r.kind === "tool",
    label: name(r) + (r.tool === "GuardDog" ? " ‡" : r.kind === "lookup" ? " (lookup)" : ""), side: r.fa > 0.6 ? "l" : "r",
  }));
  return ax.svg + chance + points(ax, pts, { right: x + 560 });
}
function figMalware() {
  const n = us(B.npm), p = us(B.pypi);
  const svg = `<svg width="1480" height="640" viewBox="0 0 1480 640" xmlns="http://www.w3.org/2000/svg">
    ${malwarePanel(B.npm, 130, `(a) npm: ${n.detect[1]} malicious, ${benignN(B.npm)} normal packages`)}
    ${malwarePanel(B.pypi, 880, `(b) PyPI: ${p.detect[1]} malicious, ${benignN(B.pypi)} normal packages`)}</svg>`;
  return figure("fig-malware", "Figure 2", svg, `Malicious-package detection on Datadog's dataset, plotted like ROC space: up and to the left is better. Error bars are 95% Wilson intervals. Ranked by Youden's J (caught minus false alarms): Penthera 2.0 is first on npm (J = ${f2(n.j)}, no false alarms in ${n.benign[1]}) and on PyPI (J = ${f2(p.j)}). OSV-Scanner looks packages up in a list of reported ones, so it is shown but not ranked. ‡ GuardDog helped build this dataset.`);
}

function figLibrary() {
  const b = B.library;
  const rows = [...b.rows].sort((a, c) => c.score - a.score);
  const top = 70, rh = 44, x0 = 780, w = 600;
  const X = (v) => x0 + v * w;
  const g = [`<text x="40" y="40" class="ptitle">Tool</text><text x="430" y="40" class="ptitle" text-anchor="end">Command inj.</text><text x="590" y="40" class="ptitle" text-anchor="end">Code inj.</text><text x="740" y="40" class="ptitle" text-anchor="end">Found [95% CI]</text>`,
    `<line x1="40" x2="${x0 + w}" y1="52" y2="52" stroke="${INK}" stroke-width="1.5"/>`];
  rows.forEach((r, i) => {
    const y = top + i * rh + rh / 2, isUs = r.kind === "penthera", ghost = r.kind === "penthera-before";
    const cls = isUs ? "lab-us" : "lab";
    if (isUs) g.push(`<rect x="30" y="${y - rh / 2 + 2}" width="${x0 + w - 20}" height="${rh - 4}" fill="rgba(0,0,237,0.06)"/>`);
    const tag = r.excluded ? (ghost ? "  (one release earlier)" : "  (setting, not ranked)") : "";
    g.push(`<text x="40" y="${y + 5}" class="${cls}">${esc(name(r))}<tspan class="note">${tag}</tspan></text>`);
    g.push(`<text x="430" y="${y + 5}" class="${cls}" text-anchor="end">${r.command[0]} / ${r.command[1]}</text><text x="590" y="${y + 5}" class="${cls}" text-anchor="end">${r.code[0]} / ${r.code[1]}</text>`);
    g.push(`<text x="740" y="${y + 5}" class="${cls}" text-anchor="end">${f2(r.score)} [${f2(r.pooledCI[0])}, ${f2(r.pooledCI[1])}]</text>`);
    const c = isUs || ghost ? BLUE : "#444";
    g.push(`<path d="M${X(r.pooledCI[0])},${y}H${X(r.pooledCI[1])}M${X(r.pooledCI[0])},${y - 5}v10M${X(r.pooledCI[1])},${y - 5}v10" stroke="${c}" stroke-width="${isUs ? 2 : 1.2}"/>`);
    g.push(ghost || r.excluded ? `<rect x="${X(r.score) - 6}" y="${y - 6}" width="12" height="12" fill="#fff" stroke="${c}" stroke-width="2"/>` : `<rect x="${X(r.score) - 7}" y="${y - 7}" width="14" height="14" fill="${c}"/>`);
  });
  const yEnd = top + rows.length * rh;
  g.push(`<line x1="40" x2="${x0 + w}" y1="${yEnd + 4}" y2="${yEnd + 4}" stroke="${INK}" stroke-width="1.5"/>`);
  for (let i = 0; i <= 5; i++) { const v = i / 5; g.push(`<line x1="${X(v)}" x2="${X(v)}" y1="58" y2="${yEnd}" stroke="#e0e0e0" stroke-dasharray="2 3"/><text x="${X(v)}" y="${yEnd + 26}" class="tick" text-anchor="middle">${f2(v)}</text>`); }
  g.push(`<text x="${x0 + w / 2}" y="${yEnd + 52}" class="axl" text-anchor="middle">Share of the ${us(b).pooled[1]} injection bugs found in the right file</text>`);
  const svg = `<svg width="1440" height="${yEnd + 64}" viewBox="0 0 1440 ${yEnd + 64}" xmlns="http://www.w3.org/2000/svg">${g.join("")}</svg>`;
  const odgen = b.rows.find((r) => r.tool === "odgen");
  return figure("fig-library", "Figure 3", svg, `Command and code injection bugs in JavaScript libraries (SecBench.js), sorted by the share found. Penthera 2.0 finds ${us(b).pooled[0]} of ${us(b).pooled[1]} (${f2(us(b).score)}), up from ${before(b).pooled[0]} in 1.9. Its interval overlaps ODGen's (${f2(odgen.score)}), so the first place is a tie within the margin. ODGen ran on 62 of the 64 bugs.`);
}

function figBeforeAfter() {
  const order = [["secrets", "Leaked secrets", "CredData"], ["npm", "Malicious npm packages", "Datadog"], ["pypi", "Malicious PyPI packages", "Datadog"], ["library", "JS library injection bugs", "SecBench.js"]];
  const x0 = 470, w = 900, d = [-0.3, 1], top = 40, rh = 120;
  const X = (v) => x0 + ((v - d[0]) / (d[1] - d[0])) * w;
  const g = [`<defs><marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="${BLUE}"/></marker></defs>`];
  for (let v = -0.2; v <= 1.0001; v += 0.2) g.push(`<line x1="${X(v)}" x2="${X(v)}" y1="${top}" y2="${top + order.length * rh}" stroke="${Math.abs(v) < 1e-9 ? "#9a9a9a" : "#e3e3e3"}" stroke-dasharray="${Math.abs(v) < 1e-9 ? "" : "2 3"}"/><text x="${X(v)}" y="${top + order.length * rh + 24}" class="tick" text-anchor="middle">${f2(v)}</text>`);
  order.forEach(([k, label, ds], i) => {
    const b = B[k], u = us(b), o = before(b), y = top + i * rh + rh / 2;
    const med = b.others[{ secrets: "f1", npm: "j", pypi: "j", library: "r" }[k]].median;
    g.push(`<text x="40" y="${y - 6}" class="ptitle">${label}</text><text x="40" y="${y + 16}" class="note" style="font-size:15px">${ds} · ${scoreKey[k]} · rank ${u.rank} of ${b.of}</text>`);
    g.push(`<line x1="${X(d[0])}" x2="${X(d[1])}" y1="${y}" y2="${y}" stroke="#ececec"/>`);
    for (const r of others(b)) g.push(`<line x1="${X(r.score)}" x2="${X(r.score)}" y1="${y - 14}" y2="${y + 14}" stroke="#555" stroke-width="2"/>`);
    g.push(`<path d="M${X(med)},${y - 22}l-6,-9h12z" fill="#555"/>`);
    g.push(`<line x1="${X(o.score) + 9}" x2="${X(u.score) - 13}" y1="${y}" y2="${y}" stroke="${BLUE}" stroke-width="2" marker-end="url(#ah2)"/>`);
    g.push(`<circle cx="${X(o.score)}" cy="${y}" r="8" fill="#fff" stroke="${BLUE}" stroke-width="2"/><circle cx="${X(u.score)}" cy="${y}" r="10" fill="${BLUE}" stroke="#fff" stroke-width="1.5"/>`);
    g.push(`<text x="${X(o.score)}" y="${y + 32}" class="lab" text-anchor="middle" fill="${BLUE}">${f2(o.score)}</text><text x="${X(u.score)}" y="${y + 34}" class="lab-us" text-anchor="middle">${f2(u.score)}</text>`);
  });
  const yb = top + order.length * rh;
  g.push(`<text x="${x0 + w / 2}" y="${yb + 52}" class="axl" text-anchor="middle">Ranking score on the sealed half (higher is better; Youden's J can be negative)</text>`);
  g.push(`<g transform="translate(40 ${yb + 30})"><circle cx="8" cy="0" r="7" fill="#fff" stroke="${BLUE}" stroke-width="2"/><text x="22" y="5" class="lab">1.9.0</text><circle cx="88" cy="0" r="8" fill="${BLUE}"/><text x="102" y="5" class="lab">2.0.0</text><line x1="168" x2="168" y1="-10" y2="10" stroke="#555" stroke-width="2"/><text x="180" y="5" class="lab">another free tool</text><path d="M318,-4l-6,-9h12z" fill="#555"/><text x="330" y="5" class="lab">their median</text></g>`);
  const svg = `<svg width="1420" height="${yb + 70}" viewBox="0 0 1420 ${yb + 70}" xmlns="http://www.w3.org/2000/svg">${g.join("")}</svg>`;
  return figure("fig-before-after", "Figure 4", svg, `One release of work: Penthera 1.9.0 against 2.0.0 on each benchmark, with every other ranked free tool as a tick. Rules were tuned only on the development half; the sealed half was scored once, after the method was written down. Secrets F1 rose from ${f2(before(B.secrets).score)} to ${f2(us(B.secrets).score)} and JS injection recall from ${f2(before(B.library).score)} to ${f2(us(B.library).score)}.`);
}

function tableResults() {
  const rows = [["secrets", "Leaked secrets", "Samsung CredData", `${B.secrets.n.toLocaleString("en")} secrets`], ["npm", "Malicious npm packages", "Datadog", `${us(B.npm).detect[1]} + ${benignN(B.npm)} normal`], ["pypi", "Malicious PyPI packages", "Datadog", `${us(B.pypi).detect[1]} + ${benignN(B.pypi)} normal`], ["library", "JS library injection bugs", "SecBench.js", `${us(B.library).pooled[1]} bugs`]];
  const body = rows.map(([k, what, ds, n]) => {
    const b = B[k], u = us(b), o = before(b), best = others(b).sort((a, c) => c.score - a.score)[0];
    const med = b.others[{ secrets: "f1", npm: "j", pypi: "j", library: "r" }[k]].median;
    return `<tr><td>${what}<div class="sub">${ds}</div></td><td>${n}</td><td>${scoreKey[k]}</td><td class="r">${f2(o.score)}</td><td class="r us">${f2(u.score)}</td><td>${esc(name(best))}<span class="r"> ${f2(best.score)}</span></td><td class="r">${f2(med)}</td><td class="r us">${u.rank}${k === "library" ? "<sup>a</sup>" : ""} / ${b.of}</td></tr>`;
  }).join("");
  const css = FIG_CSS + `
  table { border-collapse: collapse; font-family: ${SERIF}; font-size: 22px; width: 1420px; font-variant-numeric: tabular-nums lining-nums; }
  th, td { padding: 14px 16px; text-align: left; vertical-align: top; }
  thead tr:first-child th { border-top: 2px solid ${INK}; } thead tr:last-child th { border-bottom: 1px solid ${INK}; font-weight: 600; }
  tbody tr:last-child td { border-bottom: 2px solid ${INK}; }
  th.grp { text-align: center; font-weight: 600; padding-bottom: 4px; } th.grp span { display: block; border-bottom: 1px solid ${INK}; padding-bottom: 6px; }
  .r { text-align: right; } .us { color: ${BLUE}; font-weight: 700; }
  .sub { font-size: 16px; color: ${GREY}; font-style: italic; margin-top: 2px; }
  .tn { font-family: ${SERIF}; font-size: 16px; color: ${GREY}; margin: 14px 0 0; line-height: 1.45; max-width: 1420px; }
  .plot { flex-direction: column; align-items: flex-start; justify-content: center; }`;
  const table = `<table><thead>
    <tr><th></th><th></th><th></th><th class="grp" colspan="2"><span>Penthera</span></th><th class="grp" colspan="2"><span>Other free tools</span></th><th></th></tr>
    <tr><th>Benchmark</th><th>Sealed half</th><th>Score</th><th class="r">1.9.0</th><th class="r">2.0.0</th><th>Best</th><th class="r">Median</th><th class="r">Rank</th></tr>
    </thead><tbody>${body}</tbody></table>
    <p class="tn"><sup>a</sup> Tied within the margin: the 95% intervals of Penthera (${f2(us(B.library).pooledCI[0])}–${f2(us(B.library).pooledCI[1])}) and ODGen overlap. Not ranked: CredSweeper (trained on CredData), OSV-Scanner (a lookup of reported packages), and tool settings other than the default. Paid tools publish no results on these benchmarks and are not measured.</p>`;
  const bodyHtml = `<div class="run"><span>Penthera 2.0 — E11b, public benchmarks against free tools</span><span>Sealed test half, scored once · ${pub.date}</span></div>
    <div class="plot">${table}</div>
    <p class="cap"><b>Table 1.</b> Results on the sealed half of four public datasets that Penthera's authors did not make. Every tool ran offline on the same files with the same scoring; rankings need at least five other free tools.</p>
    <div class="foot"><img src="logo.svg" alt="Penthera"><span>Data, method and reproduction: penthera.org/#public-benchmarks</span></div>`;
  return htmlPage("table-results", 1600, 900, bodyHtml, css);
}

// ── 3. The product, light theme: the real CLI, dashboard and site ──
function ansiToHtml(s) {
  const map = { 1: "font-weight:700", 2: "opacity:.55", 31: `color:#c4161c`, 33: "color:#946200", 36: `color:${BLUE}`, 37: "color:#fff", 41: "background:#c4161c" };
  let open = 0;
  return esc(s).replace(/\x1b\[([\d;]*)m/g, (_, codes) => {
    if (codes === "0" || codes === "") { const c = "</span>".repeat(open); open = 0; return c; }
    open++;
    return `<span style="${codes.split(";").map((c) => map[c]).filter(Boolean).join(";")}">`;
  }) + "</span>".repeat(open);
}
function terminalShot() {
  // A small app with two real bugs, scanned by this checkout's CLI.
  const app = join(tmp, "my-app");
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "package.json"), `{ "name": "my-app", "private": true, "dependencies": { "express": "^4.21.0" } }\n`);
  const code = `const express = require("express");
const { exec } = require("node:child_process");

const app = express();
app.use(express.json());

app.post("/api/export/:id", (req, res) => {
  exec(\`tar czf /tmp/\${req.params.id}.tgz /data/\${req.params.id}\`, () => res.sendStatus(202));
});

app.post("/api/calc", (req, res) => {
  res.json({ result: eval(req.body.expr) });
});

app.listen(3000);
`;
  writeFileSync(join(app, "src", "server.js"), code);
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "penthera.js"), "--repo", ".", "--offline"], { cwd: app, encoding: "utf-8", env: { ...process.env, FORCE_COLOR: "1", NO_UPDATE_NOTIFIER: "1" } });
  // Keep the report, drop the progress lines; show the target as ~/my-app.
  let text = (r.stdout + r.stderr).split("\n").filter((l) => !l.includes("▸")).join("\n").replace(/^\n+/, "").trimEnd();
  text = text.replace(/(Target\s+(?:\x1b\[[\d;]*m)?)[^\s\x1b]+/, "$1~/my-app");
  // The findings and the summary line; the coverage block is in the full report.
  const blocks = text.split(/\n(?=\s*(?:\x1b\[[\d;]*m)*─)/);
  text = blocks.filter((b) => !b.includes("Coverage")).join("\n");
  const hl = { 8: "crit", 12: "high" };
  const lines = code.trimEnd().split("\n").map((l, i) => `<div class="ln ${hl[i + 1] || ""}"><i>${i + 1}</i>${esc(l) || " "}</div>`).join("");
  const css = `
  body { padding: 48px 56px; display: grid; grid-template-columns: 1.08fr 1fr; grid-template-rows: auto 1fr auto; gap: 22px 26px; background: linear-gradient(160deg, #f6f6f1, #e9e9e2); }
  .head { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; }
  .head img { height: 34px; } .head span { font-family: ${MONO}; font-size: 17px; color: ${GREY}; }
  .win { background: #fff; border: 1px solid #c9c9c2; border-radius: 10px; box-shadow: 0 20px 50px rgba(0,0,40,0.12); overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
  .bar { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-bottom: 1px solid #e3e3dc; background: #f7f7f3; font-family: ${SANS}; font-size: 13px; color: ${GREY}; }
  .bar b { width: 12px; height: 12px; border-radius: 50%; background: #d9d9d2; display: inline-block; } .bar em { margin-left: 10px; font-style: normal; }
  pre, .code { margin: 0; padding: 18px 20px; font-family: Menlo, ui-monospace, monospace; font-size: 12.5px; line-height: 1.6; white-space: pre; color: ${INK}; overflow: hidden; }
  .ln { display: block; padding: 0 6px; border-radius: 3px; } .ln i { display: inline-block; width: 26px; color: #aaa; font-style: normal; }
  .ln.crit { background: rgba(196,22,28,0.10); box-shadow: inset 3px 0 0 #c4161c; } .ln.high { background: rgba(196,22,28,0.06); box-shadow: inset 3px 0 0 #e0666a; }
  .prompt { color: ${BLUE}; } .foot { grid-column: 1 / -1; font-family: ${MONO}; font-size: 16px; color: ${GREY}; display: flex; justify-content: space-between; }`;
  const body = `<div class="head"><img src="logo.svg" alt="Penthera"><span>Real output of penthera 2.0.0 on a two-bug example app (excerpt)</span></div>
  <div class="win"><div class="bar"><b></b><b></b><b></b><em>src/server.js</em></div><div class="code">${lines}</div></div>
  <div class="win"><div class="bar"><b></b><b></b><b></b><em>~/my-app — zsh</em></div><pre><span class="prompt">$</span> npx penthera@2.0.0 --repo . --offline

${ansiToHtml(text)}</pre></div>
  <div class="foot"><span>Offline · nothing uploaded · every finding names its rule</span><span>penthera.org</span></div>`;
  return htmlPage("terminal", 1600, 900, body, css);
}

async function siteServer() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "site", "serve.mjs"), "--port", String(port)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { await wait(100); if (await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok).catch(() => false)) break; }
  return { url: `http://127.0.0.1:${port}`, close: () => proc.kill() };
}

const br = await openBrowser();
try {
  await br.shot(hero(1200, 627), join(out, "main", "hero-linkedin-1200x627.png"), { w: 1200, h: 627 });
  await br.shot(hero(1600, 900), join(out, "main", "hero-x-1600x900.png"), { w: 1600, h: 900 });
  await br.shot(hero(1080, 1080), join(out, "main", "hero-square-1080.png"), { w: 1080, h: 1080 });
  await br.shot(hero(1080, 1350), join(out, "main", "hero-portrait-1080x1350.png"), { w: 1080, h: 1350 });
  await br.shot(tableResults(), join(out, "figures", "table-1-results.png"), { w: 1600, h: 900 });
  await br.shot(figSecrets(), join(out, "figures", "figure-1-secrets.png"), { w: 1600, h: 900 });
  await br.shot(figMalware(), join(out, "figures", "figure-2-malware.png"), { w: 1600, h: 900 });
  await br.shot(figLibrary(), join(out, "figures", "figure-3-js-injection.png"), { w: 1600, h: 900 });
  await br.shot(figBeforeAfter(), join(out, "figures", "figure-4-before-after.png"), { w: 1600, h: 900 });
  await br.shot(terminalShot(), join(out, "product", "cli-scan.png"), { w: 1600, h: 900 });

  const site = await siteServer();
  try {
    await br.shot(`${site.url}/`, join(out, "product", "site-benchmarks.png"), { w: 1440, h: 900, clip: "#public-benchmarks", pad: 48, js: `document.documentElement.setAttribute("data-theme","light"); document.querySelector("#trust").classList.remove("band-invert")` });
    await br.shot(`${site.url}/`, join(out, "product", "site-home.png"), { w: 1440, h: 900, js: `document.documentElement.setAttribute("data-theme","light")` });
  } finally { site.close(); }

  const { startUiServer } = await import("../../src/ui/server.js");
  const ui = await startUiServer({ demo: true, port: 0, version: "2.0.0" });
  try {
    await br.shot(ui.url, join(out, "product", "dashboard-demo.png"), { w: 1440, h: 900, settle: 1200, js: `new Promise((ok) => setTimeout(() => { document.querySelector("dialog[open]")?.close(); ok(); }, 1500))` });
  } finally { await ui.close(); }
} finally {
  await br.close();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
