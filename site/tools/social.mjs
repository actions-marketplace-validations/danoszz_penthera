#!/usr/bin/env node
/**
 * Render the site's social images with a local headless Chrome:
 *
 *   og.png       1200 × 630   the share card (Open Graph, X, LinkedIn, Facebook):
 *                             the live check, with penthera.org's own report
 *   square.png   1080 × 1080  Instagram and other square feeds
 *
 *   CHROME=/path/to/chrome node site/tools/social.mjs
 *
 * Built from the site's own pieces: the dithered field (media/field.png), the
 * logotype, Departure Mono and the approved one-liner. Outputs go to
 * site/media/social/ and are committed; the build only copies them.
 * site/tools/reel.mjs imports `page` and `shoot` for the link-preview reel's
 * end card.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SITE, "..");
const OUT = join(SITE, "media", "social");
const CHROME = process.env.CHROME || {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
}[process.platform];

const logo = readFileSync(join(ROOT, "src", "ui", "static", "logo.svg"), "utf8")
  .replace(/<svg /, '<svg class="logo" ')
  .replace(/fill="currentColor"/g, 'fill="#ffffff"');
const field = `data:image/png;base64,${readFileSync(join(SITE, "media", "field.png")).toString("base64")}`;
const font = pathToFileURL(join(ROOT, "src", "ui", "static", "fonts", "DepartureMono-Regular.woff2")).href;
// The approved title, without the "Penthera:" the logotype already says. A
// non-breaking hyphen keeps "open-source" on one line.
export const LINE = "Your open\u2011source cyber security agent";
const CHIPS = '<span class="cmd">$ npx penthera</span><span class="pill">Open source</span><span class="pill">MIT</span><span class="pill">Offline</span>';

/**
 * One page per image. Two groups with a fixed rhythm between them: the
 * logotype, then the message (title, subline, chips). `split` pins the
 * logotype to the top and the message to the bottom, with the field owning
 * the right side; `stack` sets both below the field with fixed gaps.
 * `l.chips` replaces the row of chips under the title.
 */
export const page = (w, h, l) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Departure Mono"; src: url("${font}") format("woff2"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${w}px; height: ${h}px; background: #000; color: #fff; overflow: hidden; }
body { position: relative; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.field { position: absolute; ${l.field}; object-fit: cover; object-position: 50% 0; image-rendering: pixelated; -webkit-mask-image: ${l.mask}; }
.wrap { position: absolute; inset: 0; padding: ${l.pad}px ${l.pad}px ${l.padBottom}px; display: flex; flex-direction: column; justify-content: ${l.mode === "split" ? "space-between" : "flex-end"}; }
.logo { display: block; flex: none; width: ${l.logoW}px; height: auto; margin-bottom: ${l.mode === "split" ? 0 : l.logoGap}px; }
.msg { max-width: ${l.msgW}px; }
h1 { font-weight: 500; font-size: ${l.h1}px; line-height: 0.98; letter-spacing: -0.04em; max-width: ${l.measure}; text-wrap: balance; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: ${l.chipGap}px; margin-top: ${l.rowGap}px; font-family: "Departure Mono", monospace; font-size: ${l.mono}px; letter-spacing: 0.02em; }
.cmd { padding: ${l.chipPad}; background: #0000ed; border: 1px solid #0000ed; }
.pill { padding: ${l.chipPad}; border: 1px solid #fff; background: #000; }
/* "Free", above the title: the chips' own size and padding, inverted so it
 * reads as a label rather than one more chip in the row. */
.chip.free { display: inline-block; margin-bottom: ${l.freeGap}px; padding: ${l.chipPad}; font-family: "Departure Mono", monospace; font-size: ${l.mono}px; letter-spacing: 0.02em; line-height: normal; color: #000; background: #fff; border: 1px solid #fff; }
</style></head><body>
<img class="field" src="${field}" alt="">
<div class="wrap">
  ${logo}
  <div class="msg">
    <span class="chip free">Free</span>
    <h1>${LINE}</h1>
    <div class="row">${l.chips ?? CHIPS}</div>
  </div>
</div>
</body></html>`;

export const SHOTS = [
  // 1200 × 630: 64 px margins and a deeper bottom one; the logotype top-left,
  // the title and chips bottom-left, the field owning the right.
  { file: "og.png", w: 1200, h: 630, layout: {
    mode: "split", pad: 64, padBottom: 104, msgW: 700,
    field: "top: 0; right: 0; width: 56%; height: 100%", mask: "linear-gradient(to right, transparent, #000 40%)",
    logoW: 220, logoGap: 0, h1: 66, measure: "700px", freeGap: 24,
    rowGap: 36, chipGap: 14, chipPad: "10px 16px", mono: 19,
  } },
  // 1080 × 1080: the field across the top, the logotype, title and chips below
  // it with the same rhythm.
  { file: "square.png", w: 1080, h: 1080, layout: {
    mode: "stack", pad: 80, padBottom: 120, msgW: 900,
    field: "top: 0; left: 0; width: 100%; height: 36%", mask: "linear-gradient(#000 25%, transparent)",
    logoW: 300, logoGap: 56, h1: 92, measure: "900px", freeGap: 32,
    rowGap: 52, chipGap: 16, chipPad: "12px 20px", mono: 24,
  } },
];

/**
 * The share card since the live check (2026-10-23): the question the page asks,
 * the scan field, and a real report on a brushed plate, penthera.org's own:
 * 95/100, its one gap (SPF and DMARC) listed honestly. Lit from one light
 * above, as on the site. `l.split` puts the plate beside the message (og),
 * otherwise below it (square).
 */
const meter = (score, px, gap) => `<div class="meter" style="grid-template-columns: repeat(10, ${px}px); gap: ${gap}px">${
  Array.from({ length: 100 }, (_, i) => `<i class="${i < score ? "on" : ""}" style="width:${px}px;height:${px}px"></i>`).join("")}</div>`;

export const scanCard = (w, h, l) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Departure Mono"; src: url("${font}") format("woff2"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${w}px; height: ${h}px; background: #000; color: #fff; overflow: hidden; }
body { position: relative; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.mono { font-family: "Departure Mono", monospace; letter-spacing: 0.02em; }
.field { position: absolute; ${l.field}; object-fit: cover; object-position: 50% 0; image-rendering: pixelated; -webkit-mask-image: ${l.mask}; }
.wrap { position: absolute; inset: 0; padding: ${l.pad}px; display: grid; ${l.split ? `grid-template-columns: 1fr ${l.plateW}px; column-gap: ${l.colGap}px;` : ""} align-content: ${l.split ? "stretch" : "space-between"}; row-gap: ${l.rowGap}px; }
.left { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; ${l.split ? "" : "gap: " + l.rowGap + "px;"} }
.logo { display: block; width: ${l.logoW}px; height: auto; }
h1 { font-weight: 500; font-size: ${l.h1}px; line-height: 1.42; letter-spacing: -0.035em; }
h1 span { background: #000; padding: 0 ${l.h1 * 0.18}px 4px; margin-left: -${l.h1 * 0.18}px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.scan { display: grid; grid-template-columns: 1fr auto; margin-top: ${l.scanGap}px; max-width: ${l.scanW}px; }
.scan .in { height: ${l.scanH}px; display: flex; align-items: center; padding: 0 ${l.scanH * 0.3}px; font-size: ${l.mono}px; color: rgba(255,255,255,0.55); background: #000; border: 1px solid #fff; }
.scan .go { height: ${l.scanH}px; display: flex; align-items: center; padding: 0 ${l.scanH * 0.5}px; font-size: ${l.mono}px; color: #fff; background: linear-gradient(180deg, #5a5aff, #0000ed 55%, #0000b8); box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 28px -10px rgba(0,0,237,0.9); }
.note { display: inline-block; margin-top: ${l.noteGap}px; padding: 4px 8px; margin-left: -8px; font-size: ${l.small}px; color: rgba(255,255,255,0.72); background: #000; }
.note b { color: #fff; font-weight: 400; }
.plate { align-self: ${l.split ? "center" : "end"}; padding: ${l.platePad}px; border: 1px solid rgba(255,255,255,0.24);
  background: radial-gradient(${l.plateW * 1.1}px circle at 50% -40%, rgba(255,255,255,0.16), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.08), transparent 48%, rgba(0,0,0,0.4)), #171717;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.6), 0 24px 60px -20px rgba(0,0,0,0.9); position: relative; }
.plate::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px); pointer-events: none; }
.host { font-size: ${l.small}px; color: rgba(255,255,255,0.6); }
.verdict { margin-top: 6px; font-size: ${l.verdict}px; font-weight: 500; letter-spacing: -0.03em; }
.score { display: flex; align-items: center; gap: ${l.platePad * 0.6}px; margin-top: ${l.platePad * 0.6}px; }
.meter { display: grid; }
.meter i { display: block; background: rgba(255,255,255,0.14); }
.meter i.on { background: #fff; }
.n { font-size: ${l.score}px; line-height: 0.85; letter-spacing: -0.05em; font-weight: 500; }
.n span { font-family: "Departure Mono", monospace; font-size: ${l.small}px; letter-spacing: 0; color: rgba(255,255,255,0.6); margin-left: 6px; }
.rows { margin-top: ${l.platePad * 0.7}px; border-top: 1px solid rgba(255,255,255,0.9); }
.rows div { display: flex; align-items: baseline; gap: 12px; padding: ${l.rowPad}px 0; border-bottom: 1px solid rgba(255,255,255,0.18); font-size: ${l.rowFont}px; }
.rows .m { flex: none; width: ${l.markW}px; text-align: center; padding: 1px 0; font-size: ${l.small * 0.85}px; border: 1px solid rgba(255,255,255,0.5); color: rgba(255,255,255,0.7); }
.rows .bad .m { background: #fff; color: #000; border-color: #fff; }
.fix { margin-top: ${l.platePad * 0.8}px; height: ${l.scanH * 0.86}px; display: flex; align-items: center; justify-content: center; font-size: ${l.mono}px; background: linear-gradient(180deg, #5a5aff, #0000ed 55%, #0000b8); box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 28px -10px rgba(0,0,237,0.9); }
</style></head><body>
<img class="field" src="${field}" alt="">
<div class="wrap">
  <div class="left">
    ${logo}
    <div>
      <h1><span>Is your site safe?</span></h1>
      <div class="scan mono"><div class="in">your-site.com</div><div class="go">Check</div></div>
      <p class="note mono"><b>Free</b> · passive · nothing stored · <b>penthera.org</b></p>
    </div>
  </div>
  <div class="plate">
    <p class="host mono">penthera.org</p>
    <p class="verdict">Solid basics</p>
    <div class="score">${meter(95, l.cell, 2)}<p class="n">95<span>/100</span></p></div>
    <div class="rows">
      <div><span class="m mono">OK</span>HTTPS, TLS 1.3, HSTS</div>
      <div><span class="m mono">OK</span>7 of 7 browser protections</div>
      <div class="bad"><span class="m mono">FIX</span>No SPF or DMARC record</div>
    </div>
    <div class="fix mono">Prompt to fix (2)</div>
  </div>
</div>
</body></html>`;

/** The cards the site ships: og.png for link previews, square.png for square feeds. */
export const CARDS = [
  { file: "og.png", w: 1200, h: 630, layout: {
    split: true, pad: 64, plateW: 400, colGap: 56, rowGap: 0,
    field: "top: 0; right: 0; width: 70%; height: 100%", mask: "linear-gradient(to right, transparent, #000 45%)",
    logoW: 200, h1: 74, scanGap: 28, scanW: 560, scanH: 64, mono: 21, noteGap: 18, small: 17,
    platePad: 30, verdict: 32, score: 72, cell: 9, rowPad: 10, rowFont: 18, markW: 44,
  } },
  { file: "square.png", w: 1080, h: 1080, layout: {
    split: false, pad: 72, plateW: 936, colGap: 0, rowGap: 36,
    field: "top: 150px; left: 0; width: 100%; height: 36%", mask: "linear-gradient(transparent, #000 18%, #000 40%, transparent)",
    logoW: 240, h1: 84, scanGap: 24, scanW: 936, scanH: 68, mono: 22, noteGap: 16, small: 19,
    platePad: 30, verdict: 34, score: 78, cell: 10, rowPad: 10, rowFont: 21, markW: 50,
  } },
];

/**
 * Screenshot one page with headless Chrome.
 * @param {string} html the page
 * @param {string} file the PNG to write
 * @param {{ transparent?: boolean }} opts transparent: keep the page's
 *   background see-through (for overlays)
 */
export function shoot(html, w, h, file, { transparent = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "penthera-social-"));
  try {
    const src = join(tmp, "page.html");
    writeFileSync(src, html);
    const t0 = Date.now();
    // Headless Chrome writes the screenshot and then sometimes lingers: a
    // timeout is fine as long as a fresh image is on disk.
    try {
      execFileSync(CHROME, [
        "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
        `--user-data-dir=${join(tmp, "profile")}`, "--allow-file-access-from-files",
        ...(transparent ? ["--default-background-color=00000000"] : []),
        `--window-size=${w},${h}`, `--screenshot=${file}`, "--virtual-time-budget=2000",
        pathToFileURL(src).href,
      ], { stdio: "ignore", timeout: 90_000, killSignal: "SIGKILL" });
    } catch (e) {
      if (!existsSync(file) || statSync(file).mtimeMs < t0) throw e;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  for (const s of CARDS) {
    shoot(scanCard(s.w, s.h, s.layout), s.w, s.h, join(OUT, s.file));
    console.log(`site/media/social/${s.file} ${s.w}×${s.h}`);
  }
}
