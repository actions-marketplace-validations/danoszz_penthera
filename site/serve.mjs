#!/usr/bin/env node
/**
 * Preview site/dist on 127.0.0.1 with the headers from the repo's vercel.json, so the
 * CSP that guards the check is the one you test against.
 *
 *   node site/serve.mjs [--port 4173] [--dir site/dist]
 */
import { createServer } from "node:http";
import { readFileSync, statSync, createReadStream, existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

/**
 * vercel.json rewrites that send a filesystem miss to a function, as
 * [RegExp, has conditions, function path]. Vercel applies them only after no
 * file matched; only header conditions are used here.
 */
export function rewriteRules(config = JSON.parse(readFileSync(join(SITE, "..", "vercel.json"), "utf8"))) {
  return (config.rewrites || []).filter((r) => r.destination.startsWith("/api/")).map((r) => [
    new RegExp(`^${r.source}$`),
    (r.has || []).map((h) => ({ key: h.key.toLowerCase(), re: new RegExp(`^${h.value ?? ".*"}$`, "i") })),
    r.destination,
  ]);
}

/** The vercel.json proxy (Routing Middleware) and the exact paths it runs on. */
function proxyRule(config = JSON.parse(readFileSync(join(SITE, "..", "vercel.json"), "utf8"))) {
  if (!config.proxy) return null;
  return { entry: join(SITE, "..", config.proxy.entrypoint), paths: [].concat(config.proxy.matcher || []) };
}

export function headersFor(pathname, rules = headerRules()) {
  const out = {};
  for (const [re, hs] of rules) if (re.test(pathname)) for (const h of hs) out[h.key] = h.value;
  return out;
}

/**
 * The production headers, minus the two that only make sense over HTTPS.
 * Safari applies upgrade-insecure-requests to localhost too, so over plain
 * HTTP it would ask for https://localhost/styles.css and get nothing.
 */
function local(headers) {
  const out = { ...headers };
  delete out["Strict-Transport-Security"];
  // Locally the live check is on this origin, not on penthera.org.
  if (out["Content-Security-Policy"]) out["Content-Security-Policy"] = out["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/, "").replace("connect-src ", "connect-src 'self' ");
  return out;
}

export function serve({ dir = join(SITE, "dist"), port = 4173, host = "127.0.0.1" } = {}) {
  const root = resolve(dir);
  const rules = headerRules();
  const rewrites = rewriteRules();
  const proxy = proxyRule();
  // Vercel Functions (api/*.mjs) run in process here.
  const fn = async (name, req, res) => (await import(pathToFileURL(join(SITE, "..", "api", `${name}.mjs`)).href)).default(req, res);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    // Routing Middleware runs first, as on Vercel; returning nothing continues.
    if (proxy?.paths.includes(url.pathname)) {
      const handler = (await import(pathToFileURL(proxy.entry).href)).default;
      const out = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers }));
      if (out) {
        res.writeHead(out.status, { ...local(headersFor(url.pathname, rules)), ...Object.fromEntries(out.headers) });
        res.end(req.method === "HEAD" ? undefined : Buffer.from(await out.arrayBuffer()));
        return;
      }
    }
    const api = /^\/api\/([a-z-]+)$/.exec(url.pathname);
    if (api && existsSync(join(SITE, "..", "api", `${api[1]}.mjs`))) return fn(api[1], req, res);
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let st;
    try { st = statSync(path); if (st.isDirectory()) { path = join(path, "index.html"); st = statSync(path); } } catch {
      // No file: vercel.json rewrites apply now, as on Vercel (filesystem first).
      for (const [re, has, dest] of rewrites) {
        if (re.test(url.pathname) && has.every((h) => h.re.test(String(req.headers[h.key] ?? "")))) {
          for (const [k, v] of Object.entries(local(headersFor(url.pathname, rules)))) res.setHeader(k, v);
          return fn(dest.slice("/api/".length), req, res);
        }
      }
      res.writeHead(404, headersFor(url.pathname, rules)).end("Not found");
      return;
    }
    // A Content-Type from vercel.json wins, as it does on Vercel.
    const headers = { "Content-Type": TYPES[extname(path)] || "application/octet-stream", ...local(headersFor(url.pathname, rules)), "Accept-Ranges": "bytes" };
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
