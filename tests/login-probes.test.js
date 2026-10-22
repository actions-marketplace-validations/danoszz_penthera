/**
 * What each profile sends to /api/login. The default scan used to POST nine
 * logins and an `' OR '1'='1` string, and Vercel's firewall challenged the
 * scanner for it (docs/research/e2e-test-2026-10-22.md, D1). Now: quick sends
 * none, standard one invalid-credential POST, --deep the burst and the SQL check.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startMockServer } from "./fixtures/mock-server.js";
import { scanUrl } from "../src/scan-url.js";
import { resolveScanOptions } from "../src/cli/profiles.js";

const INJECTION = /' OR '|OR 1=1|UNION SELECT|<script|\{\{.*\}\}|;\s*(ls|id|cat)\b|sleep\(|DROP TABLE/i;

let mock;
beforeAll(async () => { mock = await startMockServer(0); });
afterAll(() => mock.close());
beforeEach(() => { mock.requests.length = 0; });

async function scan(profile) {
  const p = resolveScanOptions({ profile });
  // deep's recon and fuzzing are not what this test is about; its login level is.
  return scanUrl(mock.url, { ...p, recon: false, fuzz: false, offline: true, skipRetireJs: true, timeout: 3000, concurrency: 4, onPhase: () => {} });
}

const loginPosts = () => mock.requests.filter((r) => r.method === "POST" && r.url === "/api/login");

describe("login probes per profile", () => {
  it("a default (standard) scan sends no injection strings anywhere, and one login POST", async () => {
    const result = await scan("standard");
    expect(result.reachable).toBe(true);
    const bad = mock.requests.filter((r) => INJECTION.test(decodeURIComponent(r.url)) || INJECTION.test(r.body));
    expect(bad).toEqual([]);
    expect(loginPosts()).toHaveLength(1);
    expect(JSON.parse(loginPosts()[0].body)).toEqual({ username: "penthera-probe-invalid", password: "invalid-password-12345" });
    expect(result.findings.map((f) => f.title)).not.toContain("No login rate limiting detected");
  });

  it("quick sends no login POST at all", async () => {
    await scan("quick");
    expect(loginPosts()).toHaveLength(0);
    expect(mock.requests.filter((r) => INJECTION.test(r.body))).toEqual([]);
  });

  it("--deep sends the rate-limit burst and the SQL error check, and still reports no rate limiting", async () => {
    const result = await scan("deep");
    expect(loginPosts().length).toBeGreaterThanOrEqual(10);
    expect(loginPosts().some((r) => r.body.includes("' OR '1'='1"))).toBe(true);
    expect(result.findings.map((f) => f.title)).toContain("No login rate limiting detected");
  });
});
