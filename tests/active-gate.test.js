/**
 * The active-scan gate and the rate limit: payload modes (--deep, --fuzz,
 * --adaptive) need a confirmation bound to the target host, and run at a
 * capped request rate. Network-free: the CLI refuses before any request,
 * and the limiter is tested against a stubbed fetch.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  activeModes, resolveRate, checkActiveConsent, confirmActiveScan, DEFAULT_ACTIVE_RATE,
} from "../src/cli/active-gate.js";
import { createEgressContext, runWithEgress, request, fetchText, egressSummary } from "../src/utils/http.js";
import { executeScan } from "../src/cli/run-scan.js";

const BIN = resolve("bin/penthera.js");

function cli(args) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", PENTHERA_NO_ONBOARDING: "1" },
      timeout: 20_000,
    });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || ""), err: String(e.stderr || "") };
  }
}

describe("activeModes and resolveRate", () => {
  it("lists only the payload modes that are on", () => {
    expect(activeModes({})).toEqual([]);
    expect(activeModes({ deep: true, adaptive: true })).toEqual(["deep", "adaptive"]);
  });

  it("defaults to the active rate only for active scans; 0 means no limit", () => {
    expect(resolveRate(undefined, false)).toBe(0);
    expect(resolveRate(undefined, true)).toBe(DEFAULT_ACTIVE_RATE);
    expect(resolveRate("0", true)).toBe(0);
    expect(resolveRate("2.5", false)).toBe(2.5);
    expect(() => resolveRate("-1", true)).toThrow(/--rate/);
    expect(() => resolveRate("fast", true)).toThrow(/--rate/);
  });
});

describe("checkActiveConsent and confirmActiveScan", () => {
  it("accepts --confirm-target only when it names the target's hostname", () => {
    expect(checkActiveConsent({ url: "https://Staging.Example.com/app", confirmTarget: "staging.example.com" })).toEqual({ ok: true });
    const wrong = checkActiveConsent({ url: "https://staging.example.com", confirmTarget: "example.com" });
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toMatch(/does not match/);
  });

  it("asks for a yes on this machine and the typed hostname elsewhere", () => {
    expect(checkActiveConsent({ url: "http://localhost:3000" })).toMatchObject({ ask: "yes" });
    expect(checkActiveConsent({ url: "http://127.0.0.1:8080" })).toMatchObject({ ask: "yes" });
    expect(checkActiveConsent({ url: "http://192.168.1.20" })).toMatchObject({ ask: "hostname" });
    expect(checkActiveConsent({ url: "https://staging.example.com" })).toMatchObject({ ask: "hostname", host: "staging.example.com" });
  });

  it("refuses a non-interactive run without --confirm-target and names the flag", async () => {
    const r = await confirmActiveScan({ url: "https://staging.example.com", modes: ["deep"], interactive: false, write: () => {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/--confirm-target staging\.example\.com/);
  });

  it("interactive: a remote target needs its hostname typed back; a yes is not enough", async () => {
    const opts = { url: "https://staging.example.com", modes: ["deep"], interactive: true, write: () => {} };
    expect((await confirmActiveScan({ ...opts, ask: async () => "y" })).ok).toBe(false);
    expect((await confirmActiveScan({ ...opts, ask: async () => " Staging.Example.com " })).ok).toBe(true);
  });

  it("interactive: a local target needs an explicit yes; the default is no", async () => {
    const opts = { url: "http://localhost:3000", modes: ["fuzz"], interactive: true, write: () => {} };
    expect((await confirmActiveScan({ ...opts, ask: async () => "" })).ok).toBe(false);
    expect((await confirmActiveScan({ ...opts, ask: async () => "yes" })).ok).toBe(true);
  });
});

describe("CLI: active modes are gated before any request", () => {
  it("--deep without a terminal or --confirm-target exits 2 and explains", () => {
    const r = cli(["http://127.0.0.1:9", "--deep", "--offline"]);
    expect(r.code).toBe(2);
    expect(r.err + r.out).toMatch(/--confirm-target 127\.0\.0\.1/);
  });

  it("--profile deep and --adaptive are gated too", () => {
    expect(cli(["https://staging.example.com", "--profile", "deep", "--offline"]).code).toBe(2);
    expect(cli(["https://staging.example.com", "--adaptive", "--offline"]).code).toBe(2);
  });

  it("a --confirm-target for another host is refused", () => {
    const r = cli(["https://staging.example.com", "--fuzz", "--confirm-target", "example.org", "--offline"]);
    expect(r.code).toBe(2);
    expect(r.err + r.out).toMatch(/does not match/);
  });

  it("rejects a bad --rate before scanning", () => {
    const r = cli(["http://127.0.0.1:9", "--rate", "-3", "--offline"]);
    expect(r.code).toBe(2);
    expect(r.err + r.out).toMatch(/--rate/);
  });
});

describe("executeScan refuses an unconfirmed active scan", () => {
  it("throws for profile deep without activeConfirmed, before any request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(executeScan({ url: "http://127.0.0.1:9", profile: "deep", json: true, onPhase: () => {} }))
      .rejects.toThrow(/confirmation/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("rate limit in the HTTP client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("spaces requests 1000/rate ms apart across concurrent callers", async () => {
    const sent = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      sent.push(Date.now());
      return new Response("ok", { status: 200 });
    });
    const ctx = createEgressContext({ target: "http://127.0.0.1:3000", rateLimit: 20 });
    const start = Date.now();
    await runWithEgress(ctx, () => Promise.all(
      Array.from({ length: 5 }, () => request("http://127.0.0.1:3000/").then((r) => r.body?.cancel())),
    ));
    expect(sent).toHaveLength(5);
    // 20 req/s = 50 ms per slot: the fifth request leaves no sooner than ~200 ms in.
    expect(Math.max(...sent) - start).toBeGreaterThanOrEqual(190);
    expect(egressSummary(ctx).rateLimit).toBe(20);
  });

  it("does not count queue time as response time (timing probes stay honest)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("ok", { status: 200 }));
    const ctx = createEgressContext({ target: "http://127.0.0.1:3000", rateLimit: 5 });
    const results = await runWithEgress(ctx, () => Promise.all(
      Array.from({ length: 4 }, () => fetchText("http://127.0.0.1:3000/")),
    ));
    // The last one waited ~600 ms in the queue but the server answered at once.
    for (const r of results) expect(r.elapsed).toBeLessThan(100);
  });

  it("has no limit when rateLimit is 0 or unset", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("ok", { status: 200 }));
    const ctx = createEgressContext({ target: "http://127.0.0.1:3000" });
    const start = Date.now();
    await runWithEgress(ctx, () => Promise.all(
      Array.from({ length: 20 }, () => request("http://127.0.0.1:3000/").then((r) => r.body?.cancel())),
    ));
    expect(Date.now() - start).toBeLessThan(150);
    expect(egressSummary(ctx).rateLimit).toBeNull();
  });
});
