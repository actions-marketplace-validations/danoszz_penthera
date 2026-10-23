#!/usr/bin/env node
/**
 * Preview site/dist on 127.0.0.1 with the headers from the repo's vercel.json, so the
 * CSP that guards the check is the one you test against.
 *
 *   node site/serve.mjs [--port 4173] [--dir site/dist]
 */
import { createServer } from "node:http";
import { readFileSync, statSync, createReadStream } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SITE = dirname(fileURLToPath(import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".mp4": "video/mp4", ".vtt": "text/vtt; charset=utf-8", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};

/** vercel.json header rules as [RegExp, headers]. Sources here are plain regex groups. */
export function headerRules(config = JSON.parse(readFileSync(join(SITE, "..", "vercel.json"), "utf8"))) {
  return config.headers.map((h) => [new RegExp(`^${h.source}$`), h.headers]);
}

export function headersFor(pathname, rules = headerRules()) {
  const out = {};
  for (const [re, hs] of rules) if (re.test(pathname)) for (const h of hs) out[h.key] = h.value;
  return out;
}

export function serve({ dir = join(SITE, "dist"), port = 4173, host = "127.0.0.1" } = {}) {
  const root = resolve(dir);
  const rules = headerRules();
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let st;
    try { st = statSync(path); if (st.isDirectory()) { path = join(path, "index.html"); st = statSync(path); } } catch { res.writeHead(404, headersFor(url.pathname, rules)).end("Not found"); return; }
    // A Content-Type from vercel.json wins, as it does on Vercel.
    const headers = { "Content-Type": TYPES[extname(path)] || "application/octet-stream", ...headersFor(url.pathname, rules), "Accept-Ranges": "bytes" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      createReadStream(path, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": st.size });
    if (req.method === "HEAD") res.end(); else createReadStream(path).pipe(res);
  });
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { port: { type: "string", default: "4173" }, dir: { type: "string" } } });
  const server = await serve({ port: Number(values.port), dir: values.dir });
  console.log(`site: http://127.0.0.1:${server.address().port}/`);
}
