#!/usr/bin/env node
/**
 * Share images of the public-benchmark ranking, in the site's own style: the
 * same cards (site/public-bench.mjs) and site/dist/styles.css, rendered by
 * headless Chrome. Run `node site/build.mjs` first.
 *
 *   node scripts/media/benchmark-cards.mjs --published bench/public/published.json --out <dir>
 *
 * Writes linkedin.png (1200x627), x.png (1600x900) and one x-<benchmark>.png
 * per card (1600x900) for a thread. A sample file gets a SAMPLE stamp.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { publicBenchHtml } from "../../site/public-bench.mjs";

const { values: args } = parseArgs({ options: { published: { type: "string" }, out: { type: "string" }, chrome: { type: "string" } } });
const ROOT = resolve(import.meta.dirname, "..", "..");
const DIST = join(ROOT, "site", "dist");
const CHROME = args.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pub = JSON.parse(readFileSync(resolve(args.published), "utf-8"));
const out = resolve(args.out);
mkdirSync(out, { recursive: true });

// One page per image: the site's stylesheet and fonts, the trust band's
// colours, and the cards without the lede, links or "How it is scored".
const tmp = mkdtempSync(join(tmpdir(), "penthera-cards-"));
cpSync(join(DIST, "styles.css"), join(tmp, "styles.css"));
cpSync(join(DIST, "fonts"), join(tmp, "fonts"), { recursive: true });
cpSync(join(DIST, "logo.svg"), join(tmp, "logo.svg"));
cpSync(join(ROOT, "site", "media", "field.png"), join(tmp, "field.png"));
const css = readFileSync(join(tmp, "styles.css"), "utf-8").replaceAll('url("/fonts/', 'url("fonts/');
writeFileSync(join(tmp, "styles.css"), css);

function page(w, h, cardsHtml, cols) {
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><style>
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; color: var(--text-1); }
  html { background: var(--ground); }
  body { position: relative; z-index: 0; background: transparent; }
  .pb > h3, .pb .bench-lede, .pb .links { display: none; }
  .pb-card { padding: ${h < 700 ? 16 : 22}px; gap: ${h < 700 ? 6 : 10}px; }
  .pb-place { font-size: ${h < 700 ? 48 : 72}px; }
  .pb-row { font-size: ${h < 700 ? 10 : 13}px; } .pb-chart { gap: ${h < 700 ? 2 : 5}px; }
  .pb-track { height: ${h < 700 ? 7 : 10}px; }
  /* Retro: the site's 1-bit dither field tiled faintly, scanlines, one blue glow. */
  body::before { content: ""; position: fixed; inset: 0; z-index: -2; background: url("field.png") 0 0 / 180px auto repeat; opacity: 0.16; image-rendering: pixelated; }
  body::after { content: ""; position: fixed; inset: 0; z-index: -1; background:
    repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px),
    radial-gradient(70% 60% at 85% 0%, rgba(0,0,237,0.35), transparent 70%),
    radial-gradient(90% 80% at 0% 100%, rgba(0,0,0,0.85), transparent 70%); }
  .shot-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .shot-logo { display: block; flex: none; height: ${h < 700 ? 36 : 46}px; width: auto; filter: invert(1); } /* logo.svg is black ink */
  .shot-right { text-align: right; }
  body { display: grid; grid-template-rows: auto 1fr auto; gap: ${h < 700 ? 18 : 28}px; padding: ${h < 700 ? "36px 48px" : "56px 64px"}; box-sizing: border-box; }
  .shot-k { font-family: var(--px); font-size: 18px; color: var(--text-2); }
  .shot-t { margin: 10px 0 0; font-family: var(--display); font-size: ${h < 700 ? 40 : 64}px; line-height: 1; letter-spacing: -0.035em; font-weight: 500; color: var(--text-1); }
  .pb { margin: 0; } .pb-cards { margin: 0; grid-template-columns: repeat(${cols}, 1fr) !important; }
  .pb-more, .pb-sample { display: none; }
  .shot-f { display: flex; justify-content: space-between; font-family: var(--px); font-size: 16px; color: var(--text-2); }
  .stamp { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 6px 10px; font-family: var(--px); font-size: 16px; background: var(--accent-ink); color: #fff; }
  </style></head><body>
  <div class="shot-head"><img class="shot-logo" src="logo.svg" alt="Penthera"><div class="shot-right"><p class="shot-k">Public benchmarks · sealed test half</p><h1 class="shot-t">Ranked against the free tools</h1></div></div>
  ${cardsHtml}
  <p class="shot-f"><span>Sealed half of each dataset, scored once. Same scoring for every tool.</span><span>penthera.org/#public-benchmarks</span></p>
  ${pub.sample ? '<p class="stamp">SAMPLE · practice data, not a result</p>' : ""}
  </body></html>`;
}

function shot(name, html, w, h) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, html);
  const png = join(out, `${name}.png`);
  rmSync(png, { force: true });
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--window-size=${w},${h}`, `--screenshot=${png}`, `file://${file}`], { encoding: "utf-8", timeout: 60_000 });
  // Headless Chrome can exit non-zero on teardown after writing the file.
  if (!existsSync(png)) throw new Error(`chrome: ${r.stderr.slice(-300)}`);
  console.log(png);
}

const all = publicBenchHtml(pub);
shot("linkedin", page(1200, 627, all, 4), 1200, 627);
shot("x", page(1600, 900, all, 4), 1600, 900);
for (const key of Object.keys(pub.benchmarks)) {
  const one = publicBenchHtml({ ...pub, benchmarks: { [key]: pub.benchmarks[key] } });
  shot(`x-${key}`, page(1600, 900, one, 1).replace(".pb-cards { margin: 0;", ".pb-cards { margin: 0 auto; max-width: 560px;"), 1600, 900);
}
rmSync(tmp, { recursive: true, force: true });
