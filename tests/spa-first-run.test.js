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
import { BUILT_IN_TEMPLATES, executeTemplate, sameSite } from "../lib/templates.js";
import { scanUrl } from "../src/scan-url.js";
import { buildBrief, NOT_PROVEN_NOTE } from "../src/report/brief.js";
import { wantExitNote } from "../src/cli/brief.js";

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
  const argv = args[0] === "agents" ? args : [...args, "--offline", "--timeout", "2000"];
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
    const { findings } = await scanUrl(await spa(), { profile, offline: true, timeout: 2_000 });
    expect(findings.filter((f) => f.severity === "critical" || f.severity === "high")).toEqual([]);
    expect(findings.filter((f) => /CVE-2025-29927|Next\.js|Swagger/.test(f.title))).toEqual([]);
  });

  it("does not get the CVE from an admin route that answers the same without the header", async () => {
    const base = await serve((req, res) => {
      const known = req.url === "/" || req.url === "/api/admin";
      res.writeHead(known ? 200 : 404, { "Content-Type": "text/html" });
      res.end(known ? INDEX : "Not found");
    });
    const { findings, endpoints } = await scanUrl(base, { profile: "quick", offline: true, timeout: 2_000 });
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

  it("prints that line on a repo scan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pk-spa-repo-"));
    const { code, err } = await cli("--repo", dir);
    rmSync(dir, { recursive: true, force: true });
    expect(code).toBe(0);
    expect(err).toContain(`No critical or high rule fired. ${NOT_PROVEN_NOTE}`);
  }, 30_000);

  it("gives the same meaning for exit 0 in --help", async () => {
    const { out } = await cli("--help");
    expect(out).toContain(`0  No critical or high rule fired. ${NOT_PROVEN_NOTE.replace(/\.$/, "")}`);
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

  it.each([["--brief"], ["--audience", "developer"]])("keeps that line out of %s output", async (...flags) => {
    const { code, out, err } = await cli(await spa(), ...flags);
    expect(code).toBe(0);
    expect(out + err).not.toContain("No critical or high rule fired.");
  }, 30_000);

  it("keeps that line out of a run that scanned nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pk-spa-pack-"));
    const { code, out, err } = await cli("--policy-pack", join(dir, "pack"));
    rmSync(dir, { recursive: true, force: true });
    expect(code).toBe(0);
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

  // Answers in order, then the last one forever. The check's first request has the header.
  const inTurn = (...answers) => {
    let n = 0;
    return route((req, res) => {
      const [status, body = "[]", type = "text/html"] = answers[Math.min(n++, answers.length - 1)];
      res.writeHead(status, { "Content-Type": type }).end(body);
    });
  };

  it.each([
    ["one 502 between 200s", [[200], [502], [200], [200]]],
    ["a 200 and 503 round robin", [[200], [503], [200], [503], [200], [503]]],
    ["one 429 in three", [[200], [429], [200], [200], [429], [200]]],
    ["a 5xx that clears before the last plain request", [[200], [503], [503], [200], [200]]],
    ["a 5xx on the header request", [[200], [503], [503], [503]]],
    ["a redirect on the header request", [[200], [401], [401], [302]]],
    ["a plain 200 after two refusals", [[200], [401], [401], [200], [200]]],
    ["a plain 200 between two refusals", [[200], [401], [200], [200], [401]]],
    ["a flaky route whose 200s differ in type", [[200, "[]", "application/json"], [503, "busy"], [200, "app"], [200, "[]", "application/json"], [200, "app"]]],
    ["a plain answer that matches the header answer", [[200, "[]", "application/json"], [200, "app"], [200, "app"], [200, "[]", "application/json"], [200, "[]", "application/json"]]],
    ["a page that changes at the header request and stays changed", [[200, "t1"], [200, "t1"], [200, "t1"], [200, "t2"], [200, "t2"]]],
    ["a page that changes once more after the header request", [[200, "t1"], [200, "t1"], [200, "t1"], [200, "t2"], [200, "t3"]]],
    ["two builds behind a round robin", [[200, "A"], [200, "B"], [200, "A"], [200, "B"], [200, "A"]]],
  ])("stays quiet on %s", async (_, answers) => {
    expect(await fires(await inTurn(...answers))).toBe(false);
  });

  it.each([
    ["a 401, a 503 and a 401", [[200], [401], [503], [200], [401]]],
    ["a 503, a 401 and a 429", [[200], [503], [401], [200], [429]]],
    ["three 503s", [[200], [503], [503], [200], [503]]],
  ])("fires when no plain request got a 200: %s", async (_, answers) => {
    expect(await fires(await inTurn(...answers))).toBe(true);
  });

  it("counts a redirect even when its target reads the same as the 200", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/same") return res.writeHead(200).end("[]");
      if (req.headers[BYPASS]) return res.writeHead(200).end("[]");
      res.writeHead(307, { Location: "/same" }).end();
    });
    expect(await fires(base)).toBe(true);
  });

  const adminRoute = (plain) => serve((req, res) => {
    if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(INDEX);
    if (req.url === "/api/admin") return res.writeHead(req.headers[BYPASS] ? 200 : plain).end();
    res.writeHead(404).end();
  });

  it.each([401, 403, 400, 405, 500])("the phase 8 check fires when the header turns a %i into a 200", async (plain) => {
    const { findings } = await scanUrl(await adminRoute(plain), { profile: "quick", offline: true, timeout: 2_000 });
    expect(findings.filter((f) => f.source === "framework-check")).toHaveLength(1);
  });
});

describe("the phase 8 check when the follow-up requests fail", () => {
  it("does not count a dropped connection as a change", async () => {
    let sent = false;
    const base = await serve((req, res) => {
      if (req.url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(INDEX);
      if (req.url !== "/api/admin") return res.writeHead(404).end();
      if (req.headers["x-middleware-subrequest"]) { sent = true; return res.writeHead(200).end("[]"); }
      if (sent) return req.socket.destroy();
      res.writeHead(401).end();
    });
    const { findings } = await scanUrl(base, { profile: "quick", offline: true, timeout: 2_000 });
    expect(sent).toBe(true);
    expect(findings.filter((f) => f.source === "framework-check")).toEqual([]);
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

  it("reads __NEXT_DATA__ on the home page", async () => {
    const base = await app((q, r) => r.writeHead(200).end('<script id="__NEXT_DATA__" type="application/json">{}</script>'));
    expect(await executeTemplate(base, check)).toHaveLength(1);
  });

  const NEXT_HOME = '<script src="/_next/static/chunks/main.js"></script>';

  it.each(["<html>", "<HTML>", "<!DOCTYPE html>", "<!doctype html>"])("ignores a Next.js app that answers the path with a %s page", async (tag) => {
    const base = await serve((req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(req.url === "/" ? NEXT_HOME : `${tag}page`));
    expect(await executeTemplate(base, check)).toEqual([]);
  });

  it("does not follow a redirect on the checked path", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/") return res.writeHead(200).end(NEXT_HOME);
      if (req.url === "/moved") return res.writeHead(200).end("{}");
      res.writeHead(307, { Location: "/moved" }).end();
    });
    expect(await executeTemplate(base, check)).toEqual([]);
  });

  it("does not take the proof from another origin", async () => {
    const other = await serve((req, res) => res.writeHead(200).end(NEXT_HOME));
    const base = await serve((req, res) => {
      if (req.url === "/") return res.writeHead(307, { Location: `${other}/` }).end();
      res.writeHead(400).end("Bad Request");
    });
    expect(await executeTemplate(base, check)).toEqual([]);
  });

  it("takes the proof from the same origin or registrable domain only", () => {
    expect(sameSite("https://example.com", "https://example.com/en")).toBe(true);
    expect(sameSite("https://example.com", "https://www.example.com/")).toBe(true);
    expect(sameSite("https://api.example.co.uk", "https://www.example.co.uk/")).toBe(true);
    expect(sameSite("https://example.com", "https://example.org/")).toBe(false);
    expect(sameSite("http://127.0.0.1:3000", "http://127.0.0.1:4000/")).toBe(false);
    expect(sameSite("https://example.com", "http://example.com:8080/")).toBe(false);
    expect(sameSite("http://example.com", "https://example.com/")).toBe(true);
    expect(sameSite("http://www.example.com", "https://www.example.com/en")).toBe(true);
    expect(sameSite("http://example.com", "https://www.example.com/")).toBe(true);
    expect(sameSite("http://example.com:8080", "http://example.com:8080/en")).toBe(true);
  });
});

describe("the Next.js source map check reads the shape", () => {
  const check = template("nextjs-sourcemap-exposure");
  const at = (body) => serve((req, res) => res.writeHead(200).end(body));

  it.each([
    ["a plain map", { version: 3, sources: ["a.js"], mappings: "AAAA" }],
    ["JSX in sourcesContent", { version: 3, sources: ["layout.jsx"], sourcesContent: ['<html lang="en"><body/></html>'], mappings: "AAAA" }],
    ["a doctype in sourcesContent", { version: 3, sources: ["_document.js"], sourcesContent: ['"<!DOCTYPE html>"'], mappings: "AAAA" }],
    ["a map with no top-level sources", { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { mappings: "AAAA" } }] }],
  ])("reports %s", async (_, map) => {
    expect(await executeTemplate(await at(JSON.stringify(map)), check)).toHaveLength(1);
  });

  it("reports a map after leading whitespace", async () => {
    expect(await executeTemplate(await at('\n  {"version":3,"sources":["a.js"],"mappings":"AAAA"}'), check)).toHaveLength(1);
  });

  it("ignores a page with a JSON-looking script, and JSON that only says the words", async () => {
    expect(await executeTemplate(await at('<html><script>var map = {"sources":[]}</script></html>'), check)).toEqual([]);
    expect(await executeTemplate(await at('{"note":"data sources and mappings"}'), check)).toEqual([]);
  });

  it.each([["lower case", INDEX], ["upper case", '<HTML><BODY>data "sources" and "mappings"</BODY></HTML>']])("ignores an HTML page, %s", async (_, page) => {
    expect(await executeTemplate(await at(page), check)).toEqual([]);
  });
});

describe("the /docs check", () => {
  it("needs the page to name an API docs tool", async () => {
    const { findings } = await scanUrl(await spa(), { profile: "quick", offline: true, timeout: 2_000 });
    expect(findings.filter((f) => f.source === "openapi-scan")).toEqual([]);
    const base = await serve((req, res) => {
      res.writeHead(req.url === "/docs" || req.url === "/" ? 200 : 404, { "Content-Type": "text/html" });
      res.end(req.url === "/docs" ? "<html><title>Swagger UI</title></html>" : "<html></html>");
    });
    const real = await scanUrl(base, { profile: "quick", offline: true, timeout: 2_000 });
    expect(real.findings.filter((f) => f.source === "openapi-scan").map((f) => f.url)).toEqual([`${base}/docs`]);
  });
});

describe("the exit 0 line", () => {
  // verbose keeps the terminal report on when stdout is not a terminal.
  const want = (over) => wantExitNote({ code: 0, url: "http://127.0.0.1", repo: null, opts: { verbose: true }, custom: null, ...over });

  it("goes on a scan of a URL or repo that exits 0", () => {
    expect(want()).toBe(true);
    expect(want({ url: null, repo: "." })).toBe(true);
    expect(want({ code: 1 })).toBe(false);
    expect(want({ code: 2 })).toBe(false);
  });

  it("stays off a run with no URL or repo", () => {
    for (const opts of [{ machine: true }, { "policy-pack": "dir" }, { readiness: true }, { sbom: "x" }]) {
      expect(want({ url: null, opts: { ...opts, verbose: true } })).toBe(false);
    }
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
