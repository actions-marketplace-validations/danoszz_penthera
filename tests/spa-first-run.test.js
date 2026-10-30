/**
 * First run on a single-page app. A clean Vite app on loopback got exit 1 and a
 * critical CVE-2025-29927 finding, because the check fired on a 200 and an SPA
 * answers 200 on every path. Each check here must still fire on the real thing.
 * Servers run on 127.0.0.1 port 0.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { BUILT_IN_TEMPLATES, executeTemplate } from "../lib/templates.js";
import { scanUrl } from "../src/scan-url.js";
import { buildBrief, NOT_PROVEN_NOTE } from "../src/report/brief.js";

const BIN = fileURLToPath(new URL("../bin/penthera.js", import.meta.url));
const INDEX = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Vite + React</title>'
  + '<script type="module" src="/assets/index.js"></script></head><body><div id="root"></div>'
  + "<p>Data sources and admin</p></body></html>";
const template = (id) => BUILT_IN_TEMPLATES.find((t) => t.id === id);

let servers = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

function serve(handler) {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}`)));
}

async function cli(...args) {
  const home = mkdtempSync(join(tmpdir(), "pk-spa-"));
  const env = { ...process.env, HOME: home, NO_COLOR: "1", PENTHERA_BRIEF: "0" };
  const argv = args[0] === "agents" ? args : [...args, "--profile", "quick", "--timeout", "2000"];
  const child = spawn(process.execPath, [BIN, ...argv], { cwd: home, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  const code = await new Promise((r) => child.on("close", r));
  rmSync(home, { recursive: true, force: true });
  return { code, out, err };
}

const spa = () => serve((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(INDEX);
});

describe("a single-page app that answers 200 on every path", () => {
  it.each(["quick", "standard"])("gets no critical, high or framework finding (%s)", async (profile) => {
    const { findings } = await scanUrl(await spa(), { profile, timeout: 2_000 });
    expect(findings.filter((f) => f.severity === "critical" || f.severity === "high")).toEqual([]);
    expect(findings.filter((f) => /CVE-2025-29927|Next\.js|Swagger/.test(f.title))).toEqual([]);
  });

  it("does not get the CVE from an admin route that answers the same without the header", async () => {
    const base = await serve((req, res) => {
      const known = req.url === "/" || req.url === "/api/admin";
      res.writeHead(known ? 200 : 404, { "Content-Type": "text/html" });
      res.end(known ? INDEX : "Not found");
    });
    const { findings, endpoints } = await scanUrl(base, { profile: "quick", timeout: 2_000 });
    expect(endpoints.list.map((e) => e.path)).toContain("/api/admin");
    expect(findings.filter((f) => /CVE-2025-29927/.test(f.title))).toEqual([]);
  });

  it("exits 0 and says what a pass does not prove", async () => {
    const { code, err } = await cli(await spa());
    expect(code).toBe(0);
    expect(err).toContain(`No critical or high rule fired. ${NOT_PROVEN_NOTE}`);
  }, 30_000);

  it.each([["--json"], ["--quiet"]])("keeps that line out of %s output", async (flag) => {
    const { code, out, err } = await cli(await spa(), flag);
    expect(code).toBe(0);
    expect(out + err).not.toContain("No critical or high rule fired.");
  }, 30_000);

  it("keeps that line out of a run with a critical finding", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/api/admin/users") return res.writeHead(req.headers["x-middleware-subrequest"] ? 200 : 401).end();
      res.writeHead(200, { "Content-Type": "text/html" }).end(INDEX);
    });
    const { code, out, err } = await cli(base);
    expect(code).toBe(1);
    expect(out + err).not.toContain("No critical or high rule fired.");
  }, 30_000);

  it("keeps that line out of penthera agents", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pk-spa-agents-"));
    const { code, out, err } = await cli("agents", dir);
    rmSync(dir, { recursive: true, force: true });
    expect(code).toBe(0);
    expect(out + err).not.toContain("No critical or high rule fired.");
  }, 30_000);
});

describe("CVE-2025-29927 needs the header to change the answer", () => {
  const BYPASS = "x-middleware-subrequest";
  const check = template("cve-2025-29927-nextjs-middleware-bypass");
  const PATH = "/api/admin/users";
  const LOGIN = '<!doctype html><html><body><form action="/login"></form></body></html>';
  const route = (answer) => serve((req, res) => {
    if (req.url !== PATH) return res.writeHead(404).end();
    answer(req, res, !!req.headers[BYPASS]);
  });
  const fires = async (base) => (await executeTemplate(base, check)).length === 1;

  it.each([301, 302, 303, 307, 308, 400, 401, 403, 404, 405, 429, 500, 503])("fires when the header turns a %i into a 200", async (plain) => {
    const base = await route((req, res, sent) => {
      if (sent) return res.writeHead(200, { "Content-Type": "application/json" }).end("[]");
      res.writeHead(plain, plain >= 300 && plain < 400 ? { Location: "/login" } : {}).end();
    });
    expect(await fires(base)).toBe(true);
  });

  it("fires when a 200 login page turns into admin JSON", async () => {
    const base = await route((req, res, sent) => {
      res.writeHead(200, { "Content-Type": sent ? "application/json" : "text/html" }).end(sent ? '[{"id":1}]' : LOGIN);
    });
    expect(await fires(base)).toBe(true);
  });

  it("fires when a login page with a fresh token turns into admin JSON", async () => {
    let n = 0;
    const base = await route((req, res, sent) => {
      res.writeHead(200, { "Content-Type": sent ? "application/json" : "text/html" }).end(sent ? "[]" : `${LOGIN}<!-- csrf ${n++} -->`);
    });
    expect(await fires(base)).toBe(true);
  });

  it("fires when a stable login page turns into another HTML page", async () => {
    const base = await route((req, res, sent) => {
      res.writeHead(200, { "Content-Type": "text/html" }).end(sent ? "<html>admin panel</html>" : LOGIN);
    });
    expect(await fires(base)).toBe(true);
  });

  it("stays quiet on a route that answers 200 the same either way", async () => {
    expect(await fires(await route((req, res) => res.writeHead(200).end("[]")))).toBe(false);
  });

  it("stays quiet on a page that differs from itself, such as a nonce", async () => {
    let n = 0;
    const base = await route((req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(`<html><script nonce="${n++}"></script></html>`));
    expect(await fires(base)).toBe(false);
  });

  it("stays quiet when a rate limit, not the header, explains the difference", async () => {
    let n = 0;
    const base = await route((req, res) => (n++ === 0 ? res.writeHead(200).end("[]") : res.writeHead(429).end()));
    expect(await fires(base)).toBe(false);
  });

  const adminRoute = (plain) => serve((req, res) => {
    if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(INDEX);
    if (req.url === "/api/admin") return res.writeHead(req.headers[BYPASS] ? 200 : plain).end();
    res.writeHead(404).end();
  });

  it.each([401, 403, 400, 405, 500])("the phase 8 check fires when the header turns a %i into a 200", async (plain) => {
    const { findings } = await scanUrl(await adminRoute(plain), { profile: "quick", timeout: 2_000 });
    expect(findings.filter((f) => f.source === "framework-check")).toHaveLength(1);
  });
});

describe("the Next.js debug endpoint needs a Next.js app", () => {
  const check = template("nextjs-debug-endpoint");
  const app = (home) => serve((req, res) => {
    if (req.url === "/" || req.url === "/en") return home(req, res);
    res.writeHead(400).end("Bad Request");
  });

  it("reads the X-Powered-By header or the build paths on the home page", async () => {
    expect(await executeTemplate(await app((q, r) => r.writeHead(200).end("<html></html>")), check)).toEqual([]);
    expect(await executeTemplate(await app((q, r) => r.writeHead(200, { "X-Powered-By": "Next.js" }).end("<html></html>")), check)).toHaveLength(1);
    expect(await executeTemplate(await app((q, r) => r.writeHead(200).end('<script src="/_next/static/chunks/main.js"></script>')), check)).toHaveLength(1);
  });

  it("follows a locale or login redirect at the home page", async () => {
    const base = await app((q, r) => (q.url === "/" ? r.writeHead(307, { Location: "/en" }).end() : r.writeHead(200).end('<script src="/_next/static/chunks/main.js"></script>')));
    expect(await executeTemplate(base, check)).toHaveLength(1);
  });

  it("ignores a Next.js app that serves a page on every path", async () => {
    const base = await serve((req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><html><script src="/_next/static/chunks/main.js"></script></html>'));
    expect(await executeTemplate(base, check)).toEqual([]);
  });
});

describe("the Next.js source map check reads the shape", () => {
  const check = template("nextjs-sourcemap-exposure");
  const at = (body) => serve((req, res) => res.writeHead(200).end(body));

  it.each([
    ["a plain map", { version: 3, sources: ["a.js"], mappings: "AAAA" }],
    ["JSX in sourcesContent", { version: 3, sources: ["layout.jsx"], sourcesContent: ['<html lang="en"><body/></html>'], mappings: "AAAA" }],
    ["a doctype in sourcesContent", { version: 3, sources: ["_document.js"], sourcesContent: ['"<!DOCTYPE html>"'], mappings: "AAAA" }],
  ])("reports %s", async (_, map) => {
    expect(await executeTemplate(await at(JSON.stringify(map)), check)).toHaveLength(1);
  });

  it.each([["lower case", INDEX], ["upper case", '<HTML><BODY>data "sources" and "mappings"</BODY></HTML>']])("ignores an HTML page, %s", async (_, page) => {
    expect(await executeTemplate(await at(page), check)).toEqual([]);
  });
});

describe("the /docs check", () => {
  it("needs the page to name an API docs tool", async () => {
    const { findings } = await scanUrl(await spa(), { profile: "quick", timeout: 2_000 });
    expect(findings.filter((f) => f.source === "openapi-scan")).toEqual([]);
    const base = await serve((req, res) => {
      res.writeHead(req.url === "/docs" || req.url === "/" ? 200 : 404, { "Content-Type": "text/html" });
      res.end(req.url === "/docs" ? "<html><title>Swagger UI</title></html>" : "<html></html>");
    });
    const real = await scanUrl(base, { profile: "quick", timeout: 2_000 });
    expect(real.findings.filter((f) => f.source === "openapi-scan").map((f) => f.url)).toEqual([`${base}/docs`]);
  });
});

describe("the brief", () => {
  const brief = (mode, severity) => buildBrief({ mode, findings: severity ? [{ severity, title: "x", category: "c" }] : [] });

  it("names the three unchecked areas on a repo or URL run with nothing high", () => {
    expect(brief("repo").not_checked).toContain(NOT_PROVEN_NOTE);
    expect(brief("url").not_checked).toContain(NOT_PROVEN_NOTE);
  });

  it("leaves it out when something high fired, and on an agents run", () => {
    expect(brief("repo", "high").not_checked).not.toContain(NOT_PROVEN_NOTE);
    expect(brief("agents").not_checked).not.toContain(NOT_PROVEN_NOTE);
  });
});
