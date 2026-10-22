/**
 * A CDN firewall that challenges the scanner (Vercel's x-vercel-mitigated,
 * Cloudflare's cf-mitigated) answers with its own 403 page. Found in the
 * 2026-10-22 end-to-end test: a second scan of www.penthera.org reported five
 * missing security headers and "no login rate limiting", all read off
 * Vercel's challenge page.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import { botChallenge } from "../lib/blackbox/challenge.js";
import { probeAuthEndpoints } from "../lib/blackbox/openapi.js";
import { scanUrl } from "../src/scan-url.js";

const CHALLENGE = { "content-type": "text/html", "retry-after": "30", server: "Vercel", "x-vercel-mitigated": "challenge" };

let server;
afterEach(() => new Promise((r) => (server ? server.close(r) : r())));

function serve(handler) {
  server = createServer(handler);
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}`)));
}

describe("botChallenge", () => {
  it("recognises Vercel and Cloudflare challenges, in a plain object or a Headers", () => {
    expect(botChallenge({ "x-vercel-mitigated": "challenge" })).toEqual({ provider: "Vercel", action: "challenge" });
    expect(botChallenge(new Headers({ "X-Vercel-Mitigated": "deny" }))).toEqual({ provider: "Vercel", action: "deny" });
    expect(botChallenge({ "cf-mitigated": "challenge" })).toEqual({ provider: "Cloudflare", action: "challenge" });
    expect(botChallenge({ server: "Vercel" })).toBeNull();
    expect(botChallenge(null)).toBeNull();
  });
});

describe("a scan of a site that is challenging the scanner", () => {
  it("stops after the fingerprint with one info finding, not missing-header findings", async () => {
    const seen = [];
    const base = await serve((req, res) => {
      seen.push(`${req.method} ${req.url}`);
      res.writeHead(403, CHALLENGE);
      res.end("<html>Vercel Security Checkpoint</html>");
    });
    const result = await scanUrl(base, { offline: true, timeout: 3000, concurrency: 2 });
    expect(result.challenge).toEqual({ provider: "Vercel", action: "challenge" });
    expect(result.findings.map((f) => f.title)).toEqual(["Vercel served a bot challenge instead of the site"]);
    expect(result.findings[0].severity).toBe("info");
    // Reachability and fingerprint only: no path discovery, no login POSTs.
    expect(seen.length).toBeLessThanOrEqual(3);
    expect(seen.some((s) => s.startsWith("POST"))).toBe(false);
  });
});

describe("login rate-limit probe", () => {
  it("does not report 'no login rate limiting' when the login path is a firewall challenge", async () => {
    const base = await serve((req, res) => {
      res.writeHead(403, CHALLENGE);
      res.end("challenge");
    });
    const findings = await probeAuthEndpoints(base, { timeout: 3000 });
    expect(findings.map((f) => f.title)).not.toContain("No login rate limiting detected");
  });

  it("counts a Retry-After as being rate limited", async () => {
    let n = 0;
    const base = await serve((req, res) => {
      n++;
      if (n > 3) {
        res.writeHead(403, { "retry-after": "30", "content-type": "text/plain" });
        return res.end("slow down");
      }
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"invalid credentials"}');
    });
    const findings = await probeAuthEndpoints(base, { timeout: 3000 });
    expect(findings.map((f) => f.title)).not.toContain("No login rate limiting detected");
  });

  it("still reports a login that never slows down", async () => {
    const base = await serve((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"invalid credentials"}');
    });
    const findings = await probeAuthEndpoints(base, { timeout: 3000 });
    expect(findings.map((f) => f.title)).toContain("No login rate limiting detected");
  });
});
