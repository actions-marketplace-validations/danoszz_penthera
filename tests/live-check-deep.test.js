/**
 * penthera.org's owner-verified scan (api/_lib/deep.mjs, api/_lib/verify.mjs).
 * It runs only after the owner proves control of the host, and then sends
 * only the CLI's payload-free default probes to that host. The fixture on
 * 127.0.0.1 records every request so the tests can say exactly what left.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { tokenFor, deepReport, PROBE_PATHS, TEMPLATES, LISTING_PATHS, BUDGET } from "../api/_lib/deep.mjs";
import { tokenForHost } from "../api/_lib/verify.mjs";
import { VERIFIED_UA } from "../api/_lib/guard.mjs";
import { createHandler } from "../api/check.mjs";
import { BUILT_IN_TEMPLATES, LISTING_PATHS as CLI_LISTING_PATHS } from "../lib/templates.js";

const SECRET = "test-secret-not-for-production";
const errOf = async (p) => { try { await p; } catch (e) { return e; } return null; };

describe("verified scan token", () => {
  it("is the same for a host every time, and differs across hosts and secrets", () => {
    const a = tokenFor(new URL("https://Example.org/shop"), { secret: SECRET });
    expect(a.token).toBe(tokenFor(new URL("https://example.org/"), { secret: SECRET }).token);
    expect(a.token).toMatch(/^penthera-verify=[A-Za-z0-9_-]{32}$/);
    expect(a.token).not.toBe(tokenFor(new URL("https://www.example.org/"), { secret: SECRET }).token);
    expect(a.token).not.toBe(tokenFor(new URL("https://example.org/"), { secret: "another" }).token);
    expect(a.host).toBe("example.org");
    expect(a.dns).toEqual({ name: "_penthera.example.org", type: "TXT", value: a.token });
    expect(a.file).toEqual({ url: "https://example.org/.well-known/penthera.txt", contents: a.token });
    expect(a.expiresNote.length).toBeGreaterThan(20);
  });

  it("answers 501 when the server has no secret", async () => {
    const saved = process.env.PENTHERA_VERIFY_SECRET;
    delete process.env.PENTHERA_VERIFY_SECRET;
    try {
      let e = null;
      try { tokenFor(new URL("https://example.org/")); } catch (x) { e = x; }
      expect([e?.code, e?.status]).toEqual(["not_available", 501]);
      const d = await errOf(deepReport(new URL("https://example.org/"), { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));
      expect([d?.code, d?.status]).toEqual(["not_available", 501]);
      const res = await callHandler({}, { url: "example.org", action: "token" });
      expect(res.status).toBe(501);
    } finally {
      if (saved !== undefined) process.env.PENTHERA_VERIFY_SECRET = saved;
    }
  });

  it("is served by the endpoint's token action", async () => {
    const res = await callHandler({ secret: SECRET }, { url: "example.org", action: "token" });
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe(tokenForHost("example.org", SECRET));
  });
});

async function callHandler(opts, body) {
  const server = createServer(createHandler(opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await res.clone().text();
    return res;
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe("verified scan against a fixture", () => {
  const HOST = "site.example.org";
  const token = tokenForHost(HOST, SECRET);
  let server, port, log, serveToken;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = 0;
      req.on("data", (c) => { body += c.length; });
      req.on("end", () => {
        log.push({ method: req.method, path: req.url, host: req.headers.host, ua: req.headers["user-agent"], origin: req.headers.origin, body });
        const send = (status, type, text) => { res.writeHead(status, { "Content-Type": type }); res.end(text); };
        switch (req.url) {
          case "/": return send(200, "text/html", "<!doctype html><title>Shop</title>");
          case "/.well-known/penthera.txt": return serveToken ? send(200, "text/plain", `${token}\n`) : send(404, "text/plain", "no");
          case "/.env": return send(200, "text/plain", "DB_PASSWORD=hunter2-do-not-echo\nAPI_KEY=k\n");
          case "/robots.txt": return send(200, "text/plain", "User-agent: *\nDisallow: /private\nDisallow: /*.php$\nDisallow: /uploads/\n");
          case "/private/": return send(200, "text/html", "<html><title>Index of /private/</title><a href=a.zip>a.zip</a></html>");
          case "/openapi.json": return send(200, "application/json", JSON.stringify({
            openapi: "3.0.0",
            paths: { "/api/users": { get: {} }, "/api/items/{id}": { get: {} }, "/api/login": { post: {} } },
          }));
          case "/api/users": return send(200, "application/json", JSON.stringify([{ id: 1, email: "a@example.org" }]));
          // An SPA answers every unknown path with its page; nothing may match it.
          default: return send(200, "text/html", "<!DOCTYPE html><html><script>var API_KEY = 'x'; var SECRET = 1;</script></html>");
        }
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    port = server.address().port;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  const target = () => new URL(`http://${HOST}:${port}/`);
  const opts = (extra = {}) => ({
    secret: SECRET, lookup: async () => [{ address: "127.0.0.1", family: 4 }], allowPrivate: true, anyPort: true, timeout: 2000,
    resolveTxt: async () => { throw Object.assign(new Error("ENODATA"), { code: "ENODATA" }); },
    ...extra,
  });

  it("refuses with 403 and says what to place when the token is nowhere", async () => {
    log = []; serveToken = false;
    const e = await errOf(deepReport(target(), opts({ verifyOverHttp: true })));
    expect([e?.code, e?.status]).toEqual(["not_verified", 403]);
    expect(e.hint).toContain(`_penthera.${HOST}`);
    expect(e.hint).toContain(token);
    expect(e.hint).toContain(".well-known/penthera.txt");
    // Only the verification file was asked for; no probe ran.
    expect(log.map((r) => r.path)).toEqual(["/.well-known/penthera.txt"]);
  });

  it("does not accept a wrong or partial token", async () => {
    log = []; serveToken = false;
    const wrong = async () => [[tokenForHost(HOST, "other")], [token.slice(0, -1)], [`${token}x`]];
    expect((await errOf(deepReport(target(), opts({ resolveTxt: wrong }))))?.code).toBe("not_verified");
  });

  it("does not take the file over http unless the test flag says so", async () => {
    log = []; serveToken = true;
    // Without verifyOverHttp the file is fetched over https on 443, where nothing listens.
    expect((await errOf(deepReport(target(), opts())))?.code).toBe("not_verified");
    expect(log).toEqual([]);
  });

  it("accepts the token from DNS, in chunks or on the host's own name", async () => {
    serveToken = false;
    for (const resolveTxt of [
      async (name) => (name === `_penthera.${HOST}` ? [["v=spf1 -all"], [token.slice(0, 10), token.slice(10)]] : []),
      async (name) => (name === HOST ? [[token]] : Promise.reject(new Error("ENOTFOUND"))),
    ]) {
      log = [];
      const r = await deepReport(target(), opts({ resolveTxt }));
      expect(r.tier).toBe("deep");
      expect(r.verifiedBy).toBe("dns");
      expect(log.some((x) => x.path === "/.well-known/penthera.txt")).toBe(false);
    }
  });

  it("accepts the token from /.well-known/penthera.txt, then reports what the host exposes", async () => {
    log = []; serveToken = true;
    const r = await deepReport(target(), opts({ verifyOverHttp: true }));
    expect(r.tier).toBe("deep");
    expect(r.verifiedBy).toBe("file");
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));

    expect(byId["env-files"]).toMatchObject({ passed: false, severity: "critical", category: "exposure" });
    expect(byId["env-files"].evidence).toMatch(/^\/\.env: HTTP 200/);
    expect(byId["env-files"].verify).toBe(`curl -s -o /dev/null -w "%{http_code}\\n" http://${HOST}:${port}/.env`);
    expect(byId.openapi).toMatchObject({ passed: false, category: "api" });
    expect(byId["open-routes"]).toMatchObject({ passed: false, severity: "high" });
    expect(byId["open-routes"].evidence).toContain("GET /api/users");
    expect(byId.listing).toMatchObject({ passed: false });
    expect(byId.listing.evidence).toContain("/private/");
    // The SPA page served for every other path matches nothing.
    for (const id of ["git", "keys", "config-files", "firebase-db", "phpinfo", "server-status", "actuator", "metrics", "stack-trace", "api-docs"]) {
      expect(byId[id]?.passed, id).toBe(true);
    }
    // The passive checks come along, and every check can be acted on.
    expect(byId.https.passed).toBe(false);
    for (const c of r.checks.filter((x) => !x.passed)) {
      expect(c.fix.length, c.id).toBeGreaterThan(20);
      expect(c.verify, c.id).toMatch(/^(curl|openssl|echo|dig)/);
    }
    // A public .env caps the score, whatever else passes.
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.verdict).toBe("Unsafe defaults");
    expect(r.categories.map((c) => c.id)).toEqual(expect.arrayContaining(["transport", "exposure", "debug", "api"]));
    expect(r.scope).toMatch(/Owner-verified scan of site\.example\.org/);
    // Evidence names the file, never its contents.
    expect(JSON.stringify(r)).not.toContain("hunter2");
  });

  it("sends only GETs to fixed CLI paths on the verified host, with no payloads", async () => {
    log = []; serveToken = true;
    const r = await deepReport(target(), opts({ verifyOverHttp: true }));
    const allowed = new Set(["/", "/.well-known/penthera.txt", "/.well-known/security.txt", ...PROBE_PATHS, "/private/", "/api/users"]);
    expect(log.length).toBeLessThanOrEqual(BUDGET.requests);
    // The scan's own requests carry its User-Agent; the rest are the passive report's.
    expect(log.filter((x) => x.ua === VERIFIED_UA).length).toBe(r.requests);
    expect(r.requests).toBeLessThanOrEqual(BUDGET.probes + 1);
    expect(log.length - r.requests).toBeLessThanOrEqual(BUDGET.passive);
    for (const req of log) {
      expect(req.method, req.path).toBe("GET");
      expect(req.host).toBe(`${HOST}:${port}`);
      expect(req.body).toBe(0);
      expect(req.origin).toBeUndefined();
      expect(allowed.has(req.path), req.path).toBe(true);
      expect(req.path).not.toMatch(/['"<>`;|$]|%[0-9a-f]{2}|\.\.|\bunion\b|\bselect\b|sleep\(|\{\{/i);
    }
    // robots.txt's wildcard line and an already-listed folder add nothing.
    expect(log.filter((x) => x.path === "/uploads/").length).toBe(1);
    // The parameterised route and the POST route from the spec are never called.
    expect(log.some((x) => x.path.includes("{") || x.path === "/api/login")).toBe(false);
  });

  it("stops at the time budget instead of running long", async () => {
    log = []; serveToken = true;
    let t = 0;
    // Each clock read moves 1 second, so the 25-second budget runs out partway.
    const r = await deepReport(target(), opts({ verifyOverHttp: true, clock: () => (t += 1000) }));
    expect(r.requests).toBeLessThan(30);
    expect(r.scope).toMatch(/did not answer in time/);
  });
});

describe("verified scan stays inside the CLI's default scan", () => {
  const sources = ["lib/templates.js", "lib/rules/core/templates.json", "src/scan-url.js", "lib/blackbox/openapi.js"]
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
  const payloadSources = ["lib/injections.js", "lib/fuzzer.js"].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");

  it("requests only paths the CLI's default scan requests", () => {
    for (const p of PROBE_PATHS) expect(sources.includes(`"${p}"`), p).toBe(true);
    expect(LISTING_PATHS).toEqual(CLI_LISTING_PATHS);
  });

  it("copies the CLI's template matchers unchanged, except the (?m) regex JavaScript rejects", () => {
    for (const [path, t] of Object.entries(TEMPLATES)) {
      const cli = BUILT_IN_TEMPLATES.find((x) => x.id === t.cli);
      expect(cli, t.cli).toBeTruthy();
      const req = cli.http[0];
      expect(req.method, t.cli).toBe("GET");
      expect(req.path, t.cli).toBe(path);
      expect(req.headers, t.cli).toBeUndefined();
      if (t.cli === "env-local-exposure") {
        expect(req.matchers[1].regex[0]).toBe("(?m)^[A-Z][A-Z0-9_]{2,}=");
        expect(t.matchers[1]).toEqual({ type: "regex", regex: ["^[A-Z][A-Z0-9_]{2,}="], flags: "m" });
        continue;
      }
      expect(t.matchers, t.cli).toEqual(req.matchers);
    }
  });

  it("uses none of the payload-only paths", () => {
    // Paths that appear only in the --deep or --fuzz modules stay out.
    for (const p of PROBE_PATHS) {
      if (payloadSources.includes(`"${p}"`)) expect(sources.includes(`"${p}"`), p).toBe(true);
    }
  });
});
