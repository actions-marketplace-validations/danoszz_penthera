#!/usr/bin/env node
/**
 * Render the site's social images with a local headless Chrome:
 *
 *   og.png       1200 × 630   the share card (Open Graph, X, LinkedIn, Facebook)
 *   square.png   1080 × 1080  Instagram and other square feeds
 *
 *   CHROME=/path/to/chrome node site/tools/social.mjs
 *
 * Built from the site's own pieces: the dithered field (media/field.png), the
 * logotype, Departure Mono and the approved one-liner. Outputs go to
 * site/media/social/ and are committed; the build only copies them.
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
// The approved title (without the "Penthera:" the logotype already says) and
// the subline. A non-breaking hyphen keeps "open-source" on one line.
const LINE = "Your open\u2011source cyber security agent";
const SUB = "The security review you never had time for. Offline, rule-based, and you can verify every finding yourself.";

/**
 * One page per image. Two groups with a fixed rhythm between them: the
 * logotype, then the message (title, subline, chips). `split` pins the
 * logotype to the top and the message to the bottom, with the field owning
 * the right side; `stack` sets both below the field with fixed gaps.
 */
const page = (w, h, l) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Departure Mono"; src: url("${font}") format("woff2"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${w}px; height: ${h}px; background: #000; color: #fff; overflow: hidden; }
body { position: relative; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.field { position: absolute; ${l.field}; object-fit: cover; object-position: 50% 0; image-rendering: pixelated; -webkit-mask-image: ${l.mask}; }
.wrap { position: absolute; inset: 0; padding: ${l.pad}px; display: flex; flex-direction: column; justify-content: ${l.mode === "split" ? "space-between" : "flex-end"}; }
.logo { display: block; flex: none; width: ${l.logoW}px; height: auto; margin-bottom: ${l.mode === "split" ? 0 : l.logoGap}px; }
.msg { max-width: ${l.msgW}px; }
h1 { font-weight: 500; font-size: ${l.h1}px; line-height: 0.98; letter-spacing: -0.04em; max-width: ${l.measure}; text-wrap: balance; }
.sub { margin-top: ${l.subGap}px; max-width: ${l.subMeasure}; font-size: ${l.sub}px; line-height: 1.4; color: rgba(255, 255, 255, 0.85); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: ${l.chipGap}px; margin-top: ${l.rowGap}px; font-family: "Departure Mono", monospace; font-size: ${l.mono}px; letter-spacing: 0.02em; }
.cmd { padding: ${l.chipPad}; background: #0000ed; border: 1px solid #fff; box-shadow: 6px 6px 0 #fff; margin-right: 6px; }
.pill { padding: ${l.chipPad}; border: 1px solid #fff; background: #000; }
</style></head><body>
<img class="field" src="${field}" alt="">
<div class="wrap">
  ${logo}
  <div class="msg">
    <h1>${LINE}</h1>
    <p class="sub">${SUB}</p>
    <div class="row"><span class="cmd">$ npx penthera</span><span class="pill">Open source</span><span class="pill">MIT</span><span class="pill">Offline</span></div>
  </div>
</div>
</body></html>`;

const SHOTS = [
  // 1200 × 630: 80 px margins; the logotype top-left, the message bottom-left in
  // the left half, the field owning the right and fading out before the text.
  { file: "og.png", w: 1200, h: 630, layout: {
    mode: "split", pad: 80, msgW: 640,
    field: "top: 0; right: 0; width: 56%; height: 100%", mask: "linear-gradient(to right, transparent, #000 40%)",
    logoW: 220, logoGap: 0, h1: 56, measure: "620px", subGap: 22, sub: 21, subMeasure: "38ch",
    rowGap: 34, chipGap: 14, chipPad: "10px 16px", mono: 19,
  } },
  // 1080 × 1080: the field across the top, the logotype and message below it with
  // the same rhythm, 96 px margins.
  { file: "square.png", w: 1080, h: 1080, layout: {
    mode: "stack", pad: 96, msgW: 860,
    field: "top: 0; left: 0; width: 100%; height: 36%", mask: "linear-gradient(#000 25%, transparent)",
    logoW: 300, logoGap: 56, h1: 80, measure: "880px", subGap: 30, sub: 30, subMeasure: "30ch",
    rowGap: 48, chipGap: 16, chipPad: "12px 20px", mono: 24,
  } },
];

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "penthera-social-"));
try {
  for (const s of SHOTS) {
    const html = join(tmp, `${s.file}.html`);
    writeFileSync(html, page(s.w, s.h, s.layout));
    const t0 = Date.now();
    // Headless Chrome writes the screenshot and then sometimes lingers: a
    // timeout is fine as long as a fresh image is on disk.
    try {
      execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      `--user-data-dir=${join(tmp, "profile")}`, "--allow-file-access-from-files",
      `--window-size=${s.w},${s.h}`, `--screenshot=${join(OUT, s.file)}`, "--virtual-time-budget=2000",
      pathToFileURL(html).href,
      ], { stdio: "ignore", timeout: 90_000, killSignal: "SIGKILL" });
    } catch (e) {
      if (!existsSync(join(OUT, s.file)) || statSync(join(OUT, s.file)).mtimeMs < t0) throw e;
    }
    console.log(`site/media/social/${s.file} ${s.w}×${s.h}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
