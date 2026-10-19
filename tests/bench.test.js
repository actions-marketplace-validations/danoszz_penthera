/**
 * Accuracy benchmark: scoring rules, plus a full offline run against the
 * bundled targets that fails if precision or recall drop below the CI floor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { scoreTarget, totalScore, ratios, findingPath } from "../bench/score.js";
import { runBenchmark, renderResults, guardNetwork, CI_FLOOR } from "../bench/run.js";

const truth = {
  vulnerabilities: [
    { id: "a", title: "SQL injection", path: "/api/search" },
    { id: "b", title: "IDOR", path: "/api/users/" },
    { id: "c", title: "AWS access key", file: "src/aws.js" },
  ],
  notVulnerable: [{ id: "d", path: "/api/health", reason: "public by design" }],
};

describe("bench scoring", () => {
  it("counts TP, FP, FN and ignores info findings", () => {
    const s = scoreTarget([
      { severity: "critical", title: "SQL injection (error-based)", url: "http://127.0.0.1:1/api/search" },
      { severity: "high", title: "IDOR/BOLA: GET /api/users/{id}", url: "http://127.0.0.1:1/api/users/1" },
      { severity: "medium", title: "Unauthenticated endpoint", url: "http://127.0.0.1:1/api/health" },
      { severity: "info", title: "1 active params", url: "http://127.0.0.1:1/api/search" },
    ], truth);
    expect(s).toMatchObject({ tp: 2, fp: 1, fn: 1, info: 1 });
    expect(s.falsePositives[0]).toMatchObject({ decoy: "d", reason: "public by design" });
    expect(s.falseNegatives[0].id).toBe("c");
  });

  it("counts a second report of the same vulnerability as a duplicate, not a FP", () => {
    const f = { severity: "high", title: "SQL injection", url: "http://x/api/search" };
    const s = scoreTarget([f, { ...f }], truth);
    expect(s).toMatchObject({ tp: 1, fp: 0, duplicates: 1 });
  });

  it("matches repo findings by file, and exact paths exactly", () => {
    expect(findingPath({ url: "src/aws.js" })).toBe("src/aws.js");
    const s = scoreTarget([
      { severity: "critical", title: "AWS access key in source", url: "src/aws.js" },
      { severity: "high", title: "SQL injection", url: "http://x/api/search/extra" },
    ], truth);
    expect(s).toMatchObject({ tp: 1, fp: 1 });
  });

  it("returns null ratios for empty denominators instead of a flattering 1.0", () => {
    expect(ratios(0, 0, 0)).toEqual({ precision: null, recall: null, f1: null });
    expect(totalScore([]).precision).toBeNull();
  });

  it("breaks precision down by confidence label", () => {
    const s = scoreTarget([
      { severity: "high", title: "SQL injection", url: "http://x/api/search", confidence: "likely" },
      { severity: "low", title: "Fuzz", url: "http://x/api/z", confidence: "potential" },
    ], truth);
    expect(s.byConfidence).toEqual({ likely: { tp: 1, fp: 0 }, potential: { tp: 0, fp: 1 } });
  });
});

describe("bench network guard", () => {
  it("refuses non-loopback fetches and counts them", async () => {
    const g = guardNetwork();
    try {
      await expect(fetch("https://example.com/")).rejects.toThrow(/blocked/);
      expect(g.blocked).toEqual(["https://example.com"]);
    } finally {
      g.restore();
    }
  });
});

describe("bench ground truth", () => {
  it("labels every default target and gives each entry an id", () => {
    const gt = JSON.parse(readFileSync(new URL("../bench/ground-truth.json", import.meta.url), "utf-8"));
    for (const [name, t] of Object.entries(gt.targets)) {
      if (t.optional) continue;
      expect(t.source, name).toBeTruthy();
      for (const e of [...t.vulnerabilities, ...t.notVulnerable]) expect(e.id, name).toBeTruthy();
    }
  });
});

describe("bench run (offline, bundled targets)", () => {
  it("stays above the CI floor and makes no non-loopback requests", async () => {
    const report = await runBenchmark(["mock-server", "injection-lab", "decoy-lab", "repo-fixture"]);
    expect(report.blocked).toEqual([]);
    expect(report.total.precision).toBeGreaterThanOrEqual(CI_FLOOR.precision);
    expect(report.total.recall).toBeGreaterThanOrEqual(CI_FLOOR.recall);
    // The decoy lab is not vulnerable by construction: any finding is a FP.
    expect(report.targets.find((t) => t.name === "decoy-lab").score.fp).toBe(0);
    expect(renderResults(report)).toMatch(/## Summary/);
  }, 60_000);
});
