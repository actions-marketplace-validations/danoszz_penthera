/**
 * E17 normalization (bench/offline/normalize.mjs): only run metadata is
 * removed before two runs are compared. Analysis output stays in, so a change
 * in it counts against H2 or H3.
 */
import { describe, it, expect } from "vitest";
import { normalize, diffPaths, VOLATILE_PATHS, REGISTERED_PATTERN } from "../bench/offline/normalize.mjs";

// Shapes taken from real output: `--repo` on T1, `deps` on T3, and the URL scan (C7).
const run = (n) => ({
  timestamp: `2026-10-29T10:00:0${n}.000Z`,
  duration: 100 + n,
  findings: [{ rule: "r1", collected_at: `2026-10-29T10:00:0${n}.000Z`, file: "<CWD>/a.js" }],
  attackSurface: [{ path: "/api/users", hasParams: true }],
  boundaries: { public: [{ path: "/api/health", hasParams: false }] },
  deps: { format: "npm-v3" },
  fingerprint: { headers: { date: `Thu, 29 Oct 2026 10:00:0${n} GMT`, server: "mock" } },
  retireDb: { snapshotDate: "2026-10-01" },
});

describe("E17 normalization", () => {
  it("removes the volatile key paths, so two clean runs compare equal", () => {
    expect(diffPaths(normalize(run(1)), normalize(run(2)))).toEqual([]);
    const n = normalize(run(1));
    expect(n).not.toHaveProperty("timestamp");
    expect(n).not.toHaveProperty("duration");
    expect(n.findings[0]).not.toHaveProperty("collected_at");
    expect(n.fingerprint.headers).not.toHaveProperty("date");
  });

  it("keeps analysis output whose key name ends in at, ms, time or date", () => {
    const n = normalize(run(1));
    expect(n.attackSurface[0].hasParams).toBe(true);
    expect(n.boundaries.public[0].hasParams).toBe(false);
    expect(n.deps.format).toBe("npm-v3");
    expect(n.retireDb.snapshotDate).toBe("2026-10-01");
  });

  it("reports a change in hasParams or deps.format as a difference", () => {
    const b = run(2);
    b.attackSurface[0].hasParams = false;
    b.deps.format = "yarn";
    expect(diffPaths(normalize(run(1)), normalize(b)).sort()).toEqual([
      "$.attackSurface.0.hasParams",
      "$.deps.format",
    ]);
  });

  it("drops a volatile name only at its listed path", () => {
    const n = normalize({ meta: { timestamp: "x", duration: 1 }, findings: [{ date: "y" }] });
    expect(n).toEqual({ meta: { timestamp: "x", duration: 1 }, findings: [{ date: "y" }] });
  });

  it("keeps the registered pattern for the side-by-side report, and it is the broad one", () => {
    const n = normalize(run(1), [], "registered");
    expect(n.attackSurface[0]).not.toHaveProperty("hasParams");
    expect(n.deps).not.toHaveProperty("format");
    expect(REGISTERED_PATTERN.test("format")).toBe(true);
    expect(VOLATILE_PATHS).toEqual(["timestamp", "duration", "findings[].collected_at", "fingerprint.headers.date"]);
  });

  it("replaces per-run paths with fixed tokens", () => {
    const n = normalize({ file: "/tmp/e17-cwd-abc/a.js" }, [["/tmp/e17-cwd-abc", "<CWD>"]]);
    expect(n.file).toBe("<CWD>/a.js");
  });
});
