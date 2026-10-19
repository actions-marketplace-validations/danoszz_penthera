/**
 * Per-finding research citations: data integrity, and that they reach the
 * Markdown report and SARIF.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { CATEGORY_REFERENCES, SOURCES, referencesFor, referenceKeysFor } from "../lib/references.js";
import { parseBib } from "../scripts/build-references.mjs";
import { FINDING_WSTG } from "../lib/owasp-wstg.js";
import { formatMarkdownReport } from "../src/report/markdown.js";
import { writeSarifReport } from "../src/reporter.js";
import { buildActionPlan, formatActionPlanMarkdown } from "../lib/remediation/index.js";

const bib = parseBib(readFileSync(new URL("../docs/references.bib", import.meta.url), "utf-8"));
const bibKeys = new Set(bib.map((e) => e.key));

describe("references data", () => {
  it("maps every category to 1-3 keys that exist in references.bib", () => {
    for (const [cat, keys] of Object.entries(CATEGORY_REFERENCES)) {
      expect(keys.length, cat).toBeGreaterThanOrEqual(1);
      expect(keys.length, cat).toBeLessThanOrEqual(3);
      for (const k of keys) expect(bibKeys.has(k), `${cat} -> ${k}`).toBe(true);
    }
  });

  it("covers every WSTG finding category and the main remediation categories", () => {
    const required = [
      ...Object.keys(FINDING_WSTG),
      "headers", "transport", "email-auth", "js-vulnerability", "disclosure", "injection",
    ];
    for (const cat of required) expect(referenceKeysFor({ category: cat }).length, cat).toBeGreaterThan(0);
  });

  it("gives every bib entry a DOI or URL, a title, a year or urldate, and a topic", () => {
    for (const e of bib) {
      expect(e.doi || e.url, e.key).toBeTruthy();
      expect(e.title, e.key).toBeTruthy();
      expect(e.year || e.urldate, e.key).toBeTruthy();
      expect(e.note, e.key).toMatch(/^(blackbox|design|threatmodel|supplychain|secrets|web|llm|standards)$/);
    }
  });

  it("has generated sources and references.md in sync with the bib", () => {
    expect(Object.keys(SOURCES).sort()).toEqual([...bibKeys].sort());
    expect(() => execFileSync(process.execPath, ["scripts/build-references.mjs", "--check"], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
    })).not.toThrow();
  });

  it("returns [] for unknown categories", () => {
    expect(referencesFor({ category: "no-such-thing" })).toEqual([]);
    expect(referencesFor({})).toEqual([]);
  });
});

const result = {
  target: "http://127.0.0.1:1",
  timestamp: "2026-10-19T00:00:00.000Z",
  findings: [
    { severity: "medium", title: "Missing Content-Security-Policy", category: "headers", source: "header-audit", confidence: "confirmed", url: "http://127.0.0.1:1/" },
    { severity: "critical", title: "AWS access key in source", category: "secrets", source: "secret-scan", confidence: "confirmed", url: "src/aws.js" },
  ],
};

describe("references in reports", () => {
  it("adds a Why this matters / Sources line to the Markdown report", () => {
    const md = formatMarkdownReport(result);
    expect(md).toContain("Why this matters / Sources: [Weichselbaum et al. 2016](https://doi.org/10.1145/2976749.2978363)");
    expect(md).toContain("[Meli et al. 2019](https://doi.org/10.14722/ndss.2019.23418)");
  });

  it("adds Sources to action-plan items", () => {
    const md = formatActionPlanMarkdown(buildActionPlan(result.findings));
    expect(md).toMatch(/\*\*Sources:\*\* \[Meli et al\. 2019\]/);
  });

  it("sets helpUri, help and properties.references on SARIF rules", () => {
    const file = join(mkdtempSync(join(tmpdir(), "penthera-refs-")), "out.sarif");
    writeSarifReport(result, file);
    const rules = JSON.parse(readFileSync(file, "utf-8")).runs[0].tool.driver.rules;
    const headers = rules.find((r) => r.id === "headers");
    expect(headers.helpUri).toBe("https://doi.org/10.1145/2976749.2978363");
    expect(headers.help.markdown).toContain("Weichselbaum et al. 2016");
    expect(headers.help.text).toMatch(/^Sources: /);
    expect(headers.properties.references).toEqual(["weichselbaum2016csp", "hodges2012rfc6797", "owaspwstg42"]);
  });

  it("leaves SARIF rules without references untouched", () => {
    const file = join(mkdtempSync(join(tmpdir(), "penthera-refs-")), "out.sarif");
    writeSarifReport({ ...result, findings: [{ severity: "low", title: "x", category: "unmapped" }] }, file);
    const [rule] = JSON.parse(readFileSync(file, "utf-8")).runs[0].tool.driver.rules;
    expect(rule.helpUri).toBeUndefined();
    expect(rule.help).toBeUndefined();
    expect(rule.properties.references).toBeUndefined();
  });
});
