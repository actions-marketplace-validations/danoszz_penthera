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
// A non-breaking hyphen keeps "open-source" on one line.
const LINE = "An open\u2011source cyber security agent you can use today, and verify yourself.";

const page = (w, h, layout) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Departure Mono"; src: url("${font}") format("woff2"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${w}px; height: ${h}px; background: #000; color: #fff; overflow: hidden; }
body { position: relative; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.field { position: absolute; ${layout.field}; object-fit: cover; object-position: 50% 0; image-rendering: pixelated; -webkit-mask-image: ${layout.mask}; }
.wrap { position: absolute; inset: 0; padding: ${layout.pad}px; display: flex; flex-direction: column; justify-content: flex-end; }
.logo { display: block; width: ${layout.logoW}px; height: auto; margin-bottom: ${layout.gap}px; }
h1 { font-weight: 500; font-size: ${layout.h1}px; line-height: 0.96; letter-spacing: -0.045em; max-width: ${layout.measure}; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: ${layout.gap}px; font-family: "Departure Mono", monospace; font-size: ${layout.mono}px; letter-spacing: 0.02em; }
.cmd { padding: 10px 16px; background: #0000ed; border: 1px solid #fff; box-shadow: 6px 6px 0 #fff; }
.pill { padding: 6px 12px; border: 1px solid #fff; background: #000; }
</style></head><body>
<img class="field" src="${field}" alt="">
<div class="wrap">
  ${logo}
  <h1>${LINE}</h1>
  <div class="row"><span class="cmd">$ npx penthera</span><span class="pill">Open source</span><span class="pill">MIT</span><span class="pill">Offline</span></div>
</div>
</body></html>`;

const SHOTS = [
  // The field sits away from the text and fades towards it, so nothing is read through dots.
  { file: "og.png", w: 1200, h: 630, layout: { pad: 64, field: "top: 0; right: 0; width: 58%; height: 100%", mask: "linear-gradient(to right, transparent, #000 45%)", logoW: 300, gap: 28, h1: 64, mono: 22, measure: "15ch" } },
  { file: "square.png", w: 1080, h: 1080, layout: { pad: 80, field: "top: 0; left: 0; width: 100%; height: 34%", mask: "linear-gradient(#000 25%, transparent)", logoW: 360, gap: 36, h1: 88, mono: 26, measure: "14ch" } },
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
