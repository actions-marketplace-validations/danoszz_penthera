/**
 * A fixed scan result for the audience report snapshots: a URL + repo scan
 * with a secret, missing headers, a suppression, an inconclusive probe, an
 * egress record, a memory trend and an agent-loop run.
 */
export const REPORT_VERSION = "1.4.0-test";

export function reportResult() {
  const ts = "2026-10-19T09:30:00.000Z";
  return {
    target: "https://shop.example + ./shop",
    timestamp: ts,
    duration: 18_400,
    modes: ["url", "repo"],
    profile: "standard",
    reachable: true,
    executedProbes: ["reachability", "security-headers", "cookies", "secret-scanning", "tls", "cors"],
    findings: [
      {
        fid: "1a2b3c4d5e6f7a8b", title: "Hardcoded Stripe secret key", severity: "critical", category: "secrets",
        source: "secret-scan", method: "secret-scan", collected_at: ts, confidence: "confirmed",
        url: "src/lib/payments.js", line: 14, description: "A live-format Stripe key is committed to source.",
      },
      {
        fid: "2b3c4d5e6f7a8b9c", title: "Missing Content-Security-Policy header", severity: "medium", category: "headers",
        source: "header-audit", method: "header-audit", collected_at: ts, confidence: "confirmed",
        url: "https://shop.example/",
      },
      {
        fid: "3c4d5e6f7a8b9c0d", title: "Session cookie without Secure | HttpOnly <flags>", severity: "medium", category: "cookie",
        source: "cookie-audit", method: "cookie-audit", collected_at: ts, confidence: "confirmed",
        url: "https://shop.example/login",
      },
      {
        fid: "4d5e6f7a8b9c0d1e", title: "Possible IDOR on /api/orders/:id", severity: "high", category: "auth-bypass",
        source: "idor-probe", method: "idor-probe", collected_at: ts, confidence: "needs-human-review",
        url: "https://shop.example/api/orders/1001",
      },
      {
        fid: "5e6f7a8b9c0d1e2f", title: "DMARC policy is p=none", severity: "low", category: "email-auth",
        source: "email-dns-probe", method: "email-dns-probe", collected_at: ts, confidence: "confirmed",
        url: "https://shop.example",
      },
    ],
    suppressed: [
      {
        fid: "6f7a8b9c0d1e2f3a", title: "X-Powered-By header discloses Express", severity: "low", category: "headers",
        suppression: { source: "memory", reason: "Stripped at the CDN edge; verified 2026-10-01", actor: "daan", expires: "2027-01-01T00:00:00.000Z" },
      },
      {
        fid: "7a8b9c0d1e2f3a4b", title: "Test fixture key in tests/", severity: "high", category: "secrets",
        suppression: { source: "repo-file", reason: "Fake key used by unit tests", actor: "ci-bot", expires: null },
      },
    ],
    errors: [
      { probe: "retirejs", url: "https://shop.example/_next/static/chunks/main.js", message: "timeout after 10000 ms", count: 3 },
    ],
    egress: {
      offline: true,
      userAgent: "penthera/1.4.0 (+https://github.com/danoszz/penthera)",
      thirdPartyHosts: [],
      blocked: [{ host: "crt.sh", requests: 1 }],
    },
    memory: {
      projectId: "f00d",
      chain: "ok",
      history: {
        trend: [
          { ts: "2026-09-01T09:00:00.000Z", critical: 2, high: 2, medium: 4, low: 3, total: 11, suppressed: 0 },
          { ts: "2026-09-20T09:00:00.000Z", critical: 1, high: 2, medium: 3, low: 2, total: 8, suppressed: 1 },
          { ts: "2026-10-19T09:30:00.000Z", critical: 1, high: 1, medium: 2, low: 1, total: 5, suppressed: 2 },
        ],
        fixes: [],
      },
    },
    loopRun: {
      iterations: [
        { n: 1, found: ["1a2b3c4d5e6f7a8b", "2b3c4d5e6f7a8b9c", "8b9c0d1e2f3a4b5c"], fixed: [{ fid: "8b9c0d1e2f3a4b5c", recipe: "cors-allowlist" }, { fid: "2b3c4d5e6f7a8b9c", recipe: "security-headers" }], verified: [], failed: [], ms: 41_000 },
        { n: 2, found: [], fixed: [], verified: ["8b9c0d1e2f3a4b5c"], failed: ["2b3c4d5e6f7a8b9c"], ms: 23_500 },
      ],
    },
  };
}
