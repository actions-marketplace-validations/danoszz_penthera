/**
 * HTTP client limits: response bodies are bounded in size and time, and
 * redirects do not carry credentials or bodies to another origin.
 *
 * Every server here is a local listener on port 0.
 */
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { gzipSync } from "node:zlib";
import {
  request, fetchText, probeFetch, readBody, BodyLimitError, DEFAULT_MAX_BODY,
  createEgressContext, runWithEgress, checkEgress, EgressBlockedError,
} from "../src/utils/http.js";

const servers = [];

async function serve(handler) {
  const srv = http.createServer(handler);
  servers.push(srv);
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${srv.address().port}`;
}

afterEach(async () => {
  for (const srv of servers.splice(0)) {
    srv.closeAllConnections?.();
    await new Promise((resolve) => srv.close(resolve));
  }
});

/** A server that never finishes its body: one byte at a time, forever. */
function dripping(req, res) {
  res.writeHead(200, { "content-type": "text/plain" });
  const t = setInterval(() => res.write("a"), 20);
  res.on("close", () => clearInterval(t));
}

/**
 * A gzip body that inflates to `megabytes` MB: one compressed megabyte of
 * zeros, repeated as concatenated gzip members (a few KB on the wire).
 */
function gzipBomb(megabytes) {
  const member = gzipSync(Buffer.alloc(1024 * 1024));
  return Buffer.concat(Array.from({ length: megabytes }, () => member));
}

describe("response body limits", () => {
  it("an endless body ends at the request timeout (fetchText)", async () => {
    const url = await serve(dripping);
    const r = await fetchText(url, { timeout: 300 });
    expect(r.body.length).toBeLessThan(1000);
  });

  it("an endless body ends at the request timeout (request + readBody)", async () => {
    const url = await serve(dripping);
    const res = await request(url, { timeout: 300 });
    await expect(readBody(res)).rejects.toThrow();
  });

  it("readBody's own deadline applies on top of the request's", async () => {
    const url = await serve(dripping);
    const res = await request(url, { timeout: 60_000 });
    await expect(readBody(res, { timeout: 200 })).rejects.toBeInstanceOf(BodyLimitError);
  });

  it("a gzip bomb stops at the decoded size cap", async () => {
    const bomb = gzipBomb(64);
    const url = await serve((req, res) => {
      res.writeHead(200, { "content-encoding": "gzip", "content-type": "text/plain" });
      res.end(bomb);
    });
    const before = process.memoryUsage().heapUsed;
    const r = await fetchText(url, { timeout: 10_000 });
    expect(r.size).toBeLessThanOrEqual(DEFAULT_MAX_BODY);
    // The inflated 64 MB string was never built.
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(48 * 1024 * 1024);

    const res = await request(url, { timeout: 10_000 });
    await expect(readBody(res, { maxBytes: 1024 * 1024 })).rejects.toBeInstanceOf(BodyLimitError);
  });

  it("an oversized plain body is refused, a normal one is returned intact", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, 97);
    const url = await serve((req, res) => {
      if (req.url === "/big") { res.writeHead(200); res.end(big); return; }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("héllo wörld");
    });
    const res = await request(`${url}/big`);
    await expect(readBody(res, { maxBytes: 1024 * 1024 })).rejects.toBeInstanceOf(BodyLimitError);
    const ok = await probeFetch(`${url}/small`);
    expect(ok.body).toBe("héllo wörld");
  });
});

describe("--offline egress and redirects", () => {
  it("compares the port, not only the host", () => {
    const ctx = createEgressContext({ target: "http://127.0.0.1:3000/", offline: true });
    expect(checkEgress("http://127.0.0.1:3000/a", {}, ctx).allowed).toBe(true);
    expect(checkEgress("http://127.0.0.1:3001/a", {}, ctx).allowed).toBe(false);
    expect(checkEgress("http://127.0.0.1:3001/a", { redirect: true }, ctx).allowed).toBe(false);
    // http -> https on the default ports stays allowed.
    const site = createEgressContext({ target: "http://example.com/", offline: true });
    expect(checkEgress("https://example.com/", { redirect: true }, site).allowed).toBe(true);
    expect(checkEgress("https://example.com:8443/", { redirect: true }, site).allowed).toBe(false);
  });

  it("refuses a redirect to another port of the target host", async () => {
    const seen = [];
    const other = await serve((req, res) => { seen.push(req.url); res.end("ok"); });
    const target = await serve((req, res) => {
      res.writeHead(307, { location: `${other}/internal` });
      res.end();
    });
    const ctx = createEgressContext({ target: `${target}/`, offline: true });
    await runWithEgress(ctx, async () => {
      await expect(request(`${target}/x`, { redirect: "follow", probe: "t" }))
        .rejects.toBeInstanceOf(EgressBlockedError);
    });
    expect(seen).toEqual([]);
  });

  it("drops Authorization and Cookie on a cross-origin hop", async () => {
    const seen = [];
    const other = await serve((req, res) => { seen.push(req.headers); res.end("ok"); });
    const target = await serve((req, res) => {
      res.writeHead(302, { location: `${other}/landing` });
      res.end();
    });
    const res = await request(`${target}/x`, {
      redirect: "follow",
      headers: { Authorization: "Bearer t", Cookie: "sid=1", "X-Keep": "yes" },
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].authorization).toBeUndefined();
    expect(seen[0].cookie).toBeUndefined();
    expect(seen[0]["x-keep"]).toBe("yes");
  });

  it("keeps credentials on a same-origin hop", async () => {
    const seen = [];
    const target = await serve((req, res) => {
      if (req.url === "/x") { res.writeHead(302, { location: "/y" }); res.end(); return; }
      seen.push(req.headers);
      res.end("ok");
    });
    await request(`${target}/x`, { redirect: "follow", headers: { Authorization: "Bearer t" } });
    expect(seen[0].authorization).toBe("Bearer t");
  });

  it("does not replay a 307 body to another origin", async () => {
    const seen = [];
    const other = await serve((req, res) => {
      let b = "";
      req.on("data", (c) => { b += c; });
      req.on("end", () => { seen.push({ method: req.method, body: b }); res.end("ok"); });
    });
    const target = await serve((req, res) => {
      req.resume();
      res.writeHead(307, { location: `${other}/sink` });
      res.end();
    });
    const res = await request(`${target}/x`, { method: "POST", body: "payload", redirect: "follow" });
    expect(res.status).toBe(307);
    expect(seen).toEqual([]);
  });
});
