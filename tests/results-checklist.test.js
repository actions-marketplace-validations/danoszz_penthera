/**
 * Every results file meets docs/research/results-checklist.md: each
 * bench/<name>/RESULTS.md, and each pre-registration that has a result, links
 * the checklist or has its four required headings (abstract, data and code,
 * limits, changes). Also: the exploratory re-analysis keeps the registered
 * numbers it quotes equal to published.json, and its figures are current.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const CHECKLIST = "docs/research/results-checklist.md";

// Heading names the checklist accepts for each required part.
const REQUIRED = {
  abstract: /abstract|summary/i,
  "data and code": /data and code|reproduce/i,
  limits: /limits|threats to validity|how far to trust/i,
  changes: /changes|deviation|amendment/i,
};

const resultsFiles = () => readdirSync(join(ROOT, "bench"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, "bench", d.name, "RESULTS.md")))
  .map((d) => `bench/${d.name}/RESULTS.md`);

/** A pre-registration has a result when its Status row or Abstract heading says so. */
export function hasResult(md) {
  const status = md.split("\n").find((l) => l.startsWith("| Status")) || "";
  const abstract = md.split("\n").find((l) => /^#+ Abstract/.test(l)) || "";
  return /result|completed/i.test(status) || /result|completed/i.test(abstract);
}

const preregsWithResult = () => readdirSync(join(ROOT, "docs/research/prereg"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => `docs/research/prereg/${f}`)
  .filter((p) => hasResult(read(p)));

/** Required parts a file lacks, or [] when it links the checklist. */
export function missingParts(md) {
  if (md.includes("results-checklist.md")) return [];
  const headings = md.split("\n").filter((l) => /^#{1,6} /.test(l));
  return Object.entries(REQUIRED).filter(([, re]) => !headings.some((h) => re.test(h))).map(([k]) => k);
}

describe("results-file checklist", () => {
  it("exists and gives each item a place in our files", () => {
    const md = read(CHECKLIST);
    const items = md.split("\n").filter((l) => /^\| \d+ \|/.test(l));
    expect(items.length).toBeGreaterThanOrEqual(15);
    for (const l of items) expect(l.split("|").filter((c) => c.trim()).length, l).toBe(4);
  });

  it("finds the files it governs", () => {
    expect(resultsFiles()).toEqual(expect.arrayContaining(["bench/public/RESULTS.md", "bench/offline/RESULTS.md", "bench/known-vuln/RESULTS.md"]));
    expect(preregsWithResult()).toEqual(expect.arrayContaining(["docs/research/prereg/E11-public-benchmarks.md", "docs/research/prereg/E14-giants-combination.md"]));
    expect(preregsWithResult()).not.toContain("docs/research/prereg/E15-hidden-prompt-injection.md");
  });

  for (const file of [...resultsFiles(), ...preregsWithResult()]) {
    it(`${file} links the checklist or has the required headings`, () => {
      expect(missingParts(read(file))).toEqual([]);
    });
  }

  it("flags a file with neither", () => {
    expect(missingParts("# R\n\n## Summary\n\n## Limits\n")).toEqual(["data and code", "changes"]);
  });
});

describe("exploratory re-analysis", () => {
  const pub = JSON.parse(read("bench/public/published.json"));
  const re = JSON.parse(read("bench/public/reanalysis.json"));

  it("quotes the registered numbers as published", () => {
    const secrets = Object.fromEntries(pub.benchmarks.secrets.rows.map((r) => [`${r.tool} ${r.version}`, r]));
    for (const r of re.scopeFree.secrets) expect(r.inScope, r.tool).toEqual(secrets[`${r.tool} ${r.version}`].recall);
    const P = re.creddata.tools.Penthera;
    expect([P.precision.k, P.precision.n]).toEqual(secrets["Penthera 2.0.0"].precision);
    expect([P.recall.k, P.recall.n]).toEqual(secrets["Penthera 2.0.0"].recall);
    for (const eco of ["npm", "pypi"]) {
      const rows = Object.fromEntries(pub.benchmarks[eco].rows.map((r) => [`${r.tool} ${r.version}`, r]));
      for (const r of re.scopeFree[eco]) expect(r.registered, `${eco} ${r.tool}`).toEqual(rows[`${r.tool} ${r.version}`].detect);
    }
    for (const r of re.scopeFree.secbench.rows) expect(r.registered, r.tool).toEqual(pub.benchmarks.library.rows.find((x) => x.tool === r.tool && x.version === r.version).pooled);
  });

  it("is labelled exploratory in RESULTS.md, with the figures current", () => {
    expect(read("bench/public/RESULTS.md")).toContain("## Exploratory re-analysis (29 Oct 2026, after the registered analysis)");
    expect(() => execFileSync(process.execPath, [join(ROOT, "bench/public/figures.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
