#!/usr/bin/env node
/**
 * Render the 400 × 400 logo that MCP catalogs ask for (Docker, Cline):
 *
 *   assets/penthera-logo-400.png   the favicon's "P" monogram, white on black
 *
 *   CHROME=/path/to/chrome node site/tools/logo.mjs
 *
 * The monogram is read from src/ui/static/favicon.svg and drawn at the
 * favicon's proportions (12 × 24 in a 32 grid), scaled to 400. The output is
 * committed; assets/ is not in the npm package.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shoot } from "./social.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "assets");
const SIZE = 400;

const favicon = readFileSync(join(ROOT, "src", "ui", "static", "favicon.svg"), "utf8");
const d = favicon.match(/<path[^>]* d="([^"]+)"/)[1];
const transform = favicon.match(/<path[^>]* transform="([^"]+)"/)[1];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin: 0; } html, body { width: ${SIZE}px; height: ${SIZE}px; background: #000; overflow: hidden; }
svg { display: block; }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 32 32"><rect width="32" height="32" fill="#000"/><path transform="${transform}" d="${d}" fill="#fff"/></svg>
</body></html>`;

mkdirSync(OUT, { recursive: true });
shoot(html, SIZE, SIZE, join(OUT, "penthera-logo-400.png"));
console.log(`assets/penthera-logo-400.png ${SIZE}×${SIZE}`);
