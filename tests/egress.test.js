/**
 * Egress guard: under --offline a scan talks to the target and nothing else.
 *
 * No test here reaches the network. global fetch is stubbed with an in-memory
 * fake target, and DNS and TLS are mocked, so every connection attempt the
 * scanner makes is observed and answered locally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:dns/promises", () => {
  const fail = async () => { throw Object.assign(new Error("dns disabled in tests"), { code: "ENOTFOUND" }); };
  return { resolveTxt: fail, resolveMx: fail, default: { resolveTxt: fail, resolveMx: fail } };
});
vi.mock("node:tls", () => {
  const connect = () => { throw new Error("tls disabled in tests"); };
  return { default: { connect }, connect };
});

const { scanUrl } = await import("../src/scan-url.js");
const {
  request, safeFetch, createEgressContext, runWithEgress, checkEgress,
  egressSummary, probeErrors, EgressBlockedError, DEFAULT_USER_AGENT,
} = await import("../src/utils/http.js");
const { formatMarkdownReport } = await import("../src/report/markdown.js");
const { PROFILES } = await import("../src/cli/profiles.js");
const { resolveScanOptions } = await import("../src/cli/profiles.js");

const TARGET = "https://shop.example.com";
const TARGET_HOST = "shop.example.com";

const HOME = `<html><head>
<script src="https://cdn.thirdparty.test/vendor/jquery.js"></script>
<script src="/static/app.js"></script>
</head><body>shop</body></html>`;

/** In-memory fake of the target plus every third-party host. */
function fakeNetwork({ failPaths = [] } = {}) {
  const calls = [];
  const fn = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    calls.push({ url: url.toString(), host: url.hostname, userAgent: headers.get("user-agent") });

    if (url.hostname !== TARGET_HOST) {
      // Third parties (recon sources, Retire.js mirrors, CDNs) are "down".
      return new Response("unavailable", { status: 503 });
    }
    if (failPaths.includes(url.pathname)) {
      throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(HOME, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/api/health" || url.pathname === "/api/users") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "content-type": "application/json" } });
  });
  return { fn, calls };
}

function scanOptsFor(profile, extra = {}) {
  const p = resolveScanOptions({ profile });
  return {
    timeout: 2_000,
    concurrency: 10,
    recon: p.recon,
    deep: p.deep,
    fuzz: p.fuzz,
    profile: p.profile,
    skipRetireJs: p.skipRetireJs,
    skipParamDiscovery: p.skipParamDiscovery,
    ...extra,
  };
}

let net;
beforeEach(() => {
  net = fakeNetwork();
  vi.stubGlobal("fetch", net.fn);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("--offline egress guard", () => {
  const cases = [
    ...Object.keys(PROFILES).map((profile) => ({ name: profile, profile, extra: {} })),
    { name: "deep + recon + adaptive", profile: "deep", extra: { recon: true, adaptive: true } },
  ];

  for (const { name, profile, extra } of cases) {
    it(`profile ${name}: only the target host is contacted`, async () => {
      const result = await scanUrl(TARGET, scanOptsFor(profile, { ...extra, offline: true }));

      expect(result.reachable).toBe(true);
      expect(net.calls.length).toBeGreaterThan(0);
      const hosts = [...new Set(net.calls.map((c) => c.host))];
      expect(hosts).toEqual([TARGET_HOST]);

      expect(result.egress.offline).toBe(true);
      expect(result.egress.thirdPartyHosts).toEqual([]);
      expect(result.executedProbes).not.toContain("recon");
      if (profile === "deep") expect(result.executedProbes).toEqual(expect.arrayContaining(["sqli", "xss", "api-fuzzing"]));
    }, 60_000);
  }

  it("refuses the third-party script and uses the vendored Retire.js snapshot", async () => {
    const result = await scanUrl(TARGET, scanOptsFor("standard", { offline: true }));
    expect(result.retireDb).toEqual({ source: "snapshot", snapshotDate: expect.any(String) });
    expect(result.egress.blocked.map((b) => b.host)).toContain("cdn.thirdparty.test");
    expect(result.errors).toContainEqual(expect.objectContaining({
      probe: "retirejs",
      url: "https://cdn.thirdparty.test/vendor/jquery.js",
      message: expect.stringContaining("blocked by --offline"),
    }));
    expect(result.executedProbes).toContain("retirejs");
  }, 60_000);
});

describe("online scan reports third-party egress", () => {
  it("lists recon sources and Retire.js mirrors, falls back to the snapshot", async () => {
    const result = await scanUrl(TARGET, scanOptsFor("deep", { recon: true }));
    const third = result.egress.thirdPartyHosts.map((h) => h.host);
    expect(third).toEqual(expect.arrayContaining([
      "crt.sh", "web.archive.org", "otx.alienvault.com", "raw.githubusercontent.com",
    ]));
    expect(third).not.toContain(TARGET_HOST);
    // Both live mirrors returned 503, so the snapshot took over.
    expect(result.retireDb.source).toBe("snapshot");
  }, 60_000);
});

describe("User-Agent", () => {
  it("sends penthera/<version> (+repo url) on every request", async () => {
    await scanUrl(TARGET, scanOptsFor("quick", { offline: true }));
    expect(DEFAULT_USER_AGENT).toMatch(/^penthera\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/danoszz\/penthera\)$/);
    expect(net.calls.length).toBeGreaterThan(0);
    for (const call of net.calls) expect(call.userAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("honours --user-agent", async () => {
    const result = await scanUrl(TARGET, scanOptsFor("quick", { offline: true, userAgent: "acme-audit/2" }));
    for (const call of net.calls) expect(call.userAgent).toBe("acme-audit/2");
    expect(result.egress.userAgent).toBe("acme-audit/2");
  });

  it("keeps a User-Agent the caller set explicitly", async () => {
    await safeFetch(`${TARGET}/`, { headers: { "User-Agent": "custom" } });
    expect(net.calls[0].userAgent).toBe("custom");
  });
});

describe("probe errors are recorded as inconclusive", () => {
  it("records { probe, url, message } and lists them in the Markdown report", async () => {
    net = fakeNetwork({ failPaths: ["/api/health", "/.env.production"] });
    vi.stubGlobal("fetch", net.fn);

    const result = await scanUrl(TARGET, scanOptsFor("quick", { offline: true }));
    expect(result.errors).toContainEqual(expect.objectContaining({
      probe: "endpoint-discovery",
      url: `${TARGET}/api/health`,
      message: expect.stringContaining("fetch failed"),
    }));
    expect(result.errors).toContainEqual(expect.objectContaining({
      probe: "sensitive-files",
      url: `${TARGET}/.env.production`,
    }));

    const md = formatMarkdownReport(result, { version: "test" });
    expect(md).toContain("## Inconclusive probes");
    expect(md).toContain("endpoint-discovery");
    expect(md).toContain("## Network egress");
  });
});

describe("egress policy", () => {
  it("allows the target and same-domain redirects, nothing else", () => {
    const ctx = createEgressContext({ target: "https://example.com", offline: true });
    expect(checkEgress("https://example.com/a", {}, ctx).allowed).toBe(true);
    expect(checkEgress("https://www.example.com/", {}, ctx).allowed).toBe(false);
    expect(checkEgress("https://www.example.com/", { redirect: true }, ctx).allowed).toBe(true);
    expect(checkEgress("https://example.com.evil.test/", { redirect: true }, ctx).allowed).toBe(false);
    expect(checkEgress("https://crt.sh/", {}, ctx).allowed).toBe(false);
  });

  it("allows explicitly listed hosts (e.g. a local model on loopback)", () => {
    const ctx = createEgressContext({ target: "https://example.com", offline: true, allowHosts: ["127.0.0.1"] });
    expect(checkEgress("http://127.0.0.1:11434/api/generate", {}, ctx).allowed).toBe(true);
  });

  it("checks every hop when following redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "example.com") {
        return new Response(null, { status: 302, headers: { location: "https://tracker.evil.test/x" } });
      }
      throw new Error(`unexpected request to ${url}`);
    }));
    const ctx = createEgressContext({ target: "https://example.com", offline: true });
    await runWithEgress(ctx, async () => {
      await expect(request("https://example.com/", { redirect: "follow", probe: "t" }))
        .rejects.toBeInstanceOf(EgressBlockedError);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(egressSummary(ctx).blocked).toEqual([{ host: "tracker.evil.test", requests: 1 }]);
    expect(probeErrors(ctx)[0]).toMatchObject({ probe: "t", url: "https://tracker.evil.test/x" });
  });

  it("does not restrict or record outside a scan context", async () => {
    const res = await safeFetch("https://anything.test/");
    expect(res.status).toBe(503);
  });
});
