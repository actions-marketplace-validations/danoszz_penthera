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
import { checkRegex } from "../lib/rules/regex-guard.js";
import { scanUrl } from "../src/scan-url.js";
import { buildBrief, NOT_CHECKED_NOTE } from "../src/report/brief.js";

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

  it("exits 0 and says what the run does not check", async () => {
    const base = await spa();
    const home = mkdtempSync(join(tmpdir(), "pk-spa-"));
    const env = { ...process.env, HOME: home, NO_COLOR: "1", PENTHERA_BRIEF: "0" };
    const child = spawn(process.execPath, [BIN, base, "--profile", "quick", "--timeout", "2000"], { cwd: home, env, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.stdout.resume();
    const code = await new Promise((r) => child.on("close", r));
    rmSync(home, { recursive: true, force: true });
    expect(code).toBe(0);
    expect(err).toContain(`No critical or high rule fired. ${NOT_CHECKED_NOTE}`);
  }, 30_000);
});

describe("the checks still fire on the real thing", () => {
  const BYPASS = "x-middleware-subrequest";

  it.each([401, 403, 307])("CVE-2025-29927 fires when the header turns a %i into a 200", async (gate) => {
    const base = await serve((req, res) => {
      if (req.url === "/api/admin/users" && req.headers[BYPASS]) return res.writeHead(200).end("[]");
      res.writeHead(gate, gate === 307 ? { Location: "/login" } : {}).end();
    });
    const findings = await executeTemplate(base, template("cve-2025-29927-nextjs-middleware-bypass"));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("CVE-2025-29927 stays quiet on a public route that answers 200 either way", async () => {
    const base = await serve((req, res) => res.writeHead(200).end("[]"));
    expect(await executeTemplate(base, template("cve-2025-29927-nextjs-middleware-bypass"))).toEqual([]);
  });

  it("the phase 8 check fires when the header opens an admin route", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(INDEX);
      if (req.url === "/api/admin") return res.writeHead(req.headers[BYPASS] ? 200 : 401).end();
      res.writeHead(404).end();
    });
    const { findings } = await scanUrl(base, { profile: "quick", timeout: 2_000 });
    expect(findings.filter((f) => f.source === "framework-check")).toHaveLength(1);
  });

  const nextDebug = (home) => serve((req, res) => {
    if (req.url === "/") return res.writeHead(200, home).end("<html><body>home</body></html>");
    res.writeHead(400).end("Bad Request");
  });

  it("the debug endpoint needs a Next.js home page", async () => {
    const check = template("nextjs-debug-endpoint");
    expect(await executeTemplate(await nextDebug({}), check)).toEqual([]);
    expect(await executeTemplate(await nextDebug({ "X-Powered-By": "Next.js" }), check)).toHaveLength(1);
    const built = await serve((req, res) => {
      if (req.url === "/") return res.writeHead(200).end('<html><script src="/_next/static/chunks/main.js"></script></html>');
      res.writeHead(200).end("{}");
    });
    expect(await executeTemplate(built, check)).toHaveLength(1);
  });

  it("the source map template reads a map and not a page", async () => {
    const check = template("nextjs-sourcemap-exposure");
    expect(await executeTemplate(await spa(), check)).toEqual([]);
    const base = await serve((req, res) => res.writeHead(200).end('{"version":3,"sources":["a.js"],"mappings":"AAAA"}'));
    expect(await executeTemplate(base, check)).toHaveLength(1);
  });

  it("a confirm request's regexes pass the guard like the others", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      for (const m of (t.http || []).flatMap((h) => h.confirm?.matchers || [])) {
        for (const p of /regex/.test(m.type) ? m.regex : []) expect(checkRegex(p, m.flags).ok, `${t.id}: ${p}`).toBe(true);
      }
    }
  });
});

describe("the brief", () => {
  const brief = (mode, severity) => buildBrief({ mode, findings: severity ? [{ severity, title: "x", category: "c" }] : [] });

  it("names the three unchecked areas on a repo or URL run with nothing high", () => {
    expect(brief("repo").not_checked).toContain(NOT_CHECKED_NOTE);
    expect(brief("url").not_checked).toContain(NOT_CHECKED_NOTE);
  });

  it("leaves it out when something high fired, and on an agents run", () => {
    expect(brief("repo", "high").not_checked).not.toContain(NOT_CHECKED_NOTE);
    expect(brief("agents").not_checked).not.toContain(NOT_CHECKED_NOTE);
  });
});
