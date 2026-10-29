/**
 * The README's benchmark summary (bench/public/summary.mjs) and the rank
 * intervals it prints (bench/public/rank-intervals.json): README.md matches
 * what publish.mjs would write, every interval contains the published point
 * rank, and a point rank goes out alone only when its interval is one place.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readmeSummary, rankIntervalLine, fBeta } from "../bench/public/summary.mjs";
import { RANK_INTERVALS, WEAK, flagShare, tiedPhrase, weakField } from "../site/benchmarks.mjs";

const ROOT = join(import.meta.dirname, "..");
const pub = JSON.parse(readFileSync(join(ROOT, "bench", "public", "published.json"), "utf8"));
const readme = readFileSync(join(ROOT, "README.md"), "utf8");

describe("benchmark summary", () => {
  it("README.md carries the summary publish.mjs writes, unchanged", () => {
    const START = "<!-- public-benchmarks:start -->";
    const a = readme.indexOf(START) + START.length, b = readme.indexOf("<details><summary>Every tool", a);
    const label = pub.benchmarks.secrets.rows.find((r) => r.kind === "penthera").version;
    expect(readme.slice(a, b).trim()).toBe(readmeSummary(pub, label).join("\n"));
    for (const f of ["README.md", "bench/public/PUBLISHED.md"]) expect(readFileSync(join(ROOT, f), "utf8"), f).toContain(rankIntervalLine());
  });

  it("every rank interval contains Penthera's published point rank", () => {
    expect(RANK_INTERVALS.published).toBe(pub.date);
    for (const [k, iv] of Object.entries(RANK_INTERVALS.penthera)) {
      const us = pub.benchmarks[k].rows.find((r) => r.kind === "penthera");
      expect(iv.rank[0], k).toBeLessThanOrEqual(us.rank);
      expect(iv.rank[1], k).toBeGreaterThanOrEqual(us.rank);
      expect(iv.first, k).toBeGreaterThanOrEqual(0);
      expect(iv.first, k).toBeLessThanOrEqual(1);
    }
  });

  it("prints a tied range wherever the interval is wider than one place, and none where it is one", () => {
    const rows = readme.split("\n").filter((l) => l.startsWith("| [") && l.includes("penthera.org/benchmarks/"));
    for (const [k, iv] of Object.entries(RANK_INTERVALS.penthera)) {
      const row = rows.find((l) => l.includes(`/${k === "library" ? "js-injection" : k === "secrets" ? "secrets" : `${k}-malware`})`));
      if (iv.rank[0] === iv.rank[1]) expect(row, k).not.toContain("tied");
      else expect(row, k).toContain(tiedPhrase(iv).slice(2));
    }
    expect(tiedPhrase({ rank: [1, 3] })).toBe(", tied 1st to 3rd");
    expect(tiedPhrase({ rank: [2, 2] })).toBe("");
  });

  it("states the secrets rank under F0.5 and F2 from the published precision and recall", () => {
    const S = pub.benchmarks.secrets.rows.filter((r) => r.rank != null);
    const place = (beta) => [...S].sort((a, z) => fBeta(z.p, z.r, beta) - fBeta(a.p, a.r, beta)).findIndex((r) => r.kind === "penthera") + 1;
    const line = readme.split("\n").find((l) => l.startsWith("Leaked secrets: "));
    expect(line).toContain(`${["", "1st", "2nd", "3rd"][place(0.5)]} by F0.5`);
    expect(line).toContain(`${["", "1st", "2nd", "3rd"][place(2)]} by F2`);
    expect(fBeta(0.5, 0.5, 2)).toBeCloseTo(0.5);
  });

  it("names only ranked tools below the weak line, and the flag share falls as false alarms rise", () => {
    for (const b of Object.values(pub.benchmarks)) {
      const w = weakField(b);
      if (!w) continue;
      for (const t of w.tools) expect(b.rows.find((r) => r.tool === t && r.rank != null).score, t).toBeLessThan(WEAK);
    }
    for (const k of ["npm", "pypi"]) {
      const f = flagShare(pub.benchmarks[k].rows.find((r) => r.kind === "penthera"));
      if (f.measured != null) expect(f.worst, k).toBeLessThanOrEqual(f.measured);
      expect(f.worst, k).toBeGreaterThan(0);
    }
    expect(flagShare({ r: 1, fa: 0.001, benignCI: [0, 0.001] }).measured).toBeCloseTo(0.5, 2);
  });
});
