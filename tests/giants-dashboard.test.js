/**
 * --giants in the dashboard: other tools' findings are listed (marked, so
 * the verdict and score stay Penthera's), each row says who found it for the
 * source filter, and the coverage table comes from the latest scan.
 */
import { describe, it, expect } from "vitest";
import { buildFindings, buildGiantsCoverage, locateFinding, findingRow } from "../src/ui/api/summarize.js";
import { findingId } from "../lib/memory/views.js";

const report = (ts, extra = {}) => ({
  name: `r-${ts}.json`, mtime: 0,
  data: {
    target: "/work/app", timestamp: ts,
    findings: [{ severity: "critical", title: "AWS access key in source", category: "secrets", source: "secret-scan", url: "config.js", foundBy: ["penthera", "gitleaks"] }],
    ...extra,
  },
});

const giants = {
  schema: "penthera.giants/1", online: false,
  areas: [
    { id: "secrets", label: "Secrets", status: "covered", tools: [{ id: "gitleaks", status: "ran", version: "8.30.1", findings: 4 }] },
    { id: "code", label: "Code", status: "not covered", tools: [{ id: "semgrep", status: "skipped", version: null, findings: 0 }] },
  ],
  findings: [{ severity: "high", title: "lodash@4.17.15: Command Injection", category: "dependency-vuln", source: "osv-scanner", url: "package-lock.json", file: "package-lock.json", foundBy: ["osv-scanner", "trivy"] }],
};

describe("dashboard data", () => {
  it("lists other tools' findings as marked rows with who found them", () => {
    const rows = buildFindings([report("2026-10-25T10:00:00Z", { giants })]);
    expect(rows.map((r) => [r.title, Boolean(r.other), r.foundBy])).toEqual([
      ["AWS access key in source", false, ["penthera", "gitleaks"]],
      ["lodash@4.17.15: Command Injection", true, ["osv-scanner", "trivy"]],
    ]);
  });

  it("opens an other-tool finding by its id", () => {
    const scans = [report("2026-10-25T10:00:00Z", { giants })];
    const hit = locateFinding(scans, findingId(giants.findings[0]), null);
    expect(hit.finding.source).toBe("osv-scanner");
  });

  it("builds the coverage table from each project's latest scan only", () => {
    const scans = [report("2026-10-24T10:00:00Z", { giants }), report("2026-10-25T10:00:00Z")];
    expect(buildGiantsCoverage(scans)).toEqual([]);
    const cov = buildGiantsCoverage([report("2026-10-25T10:00:00Z", { giants })]);
    expect(cov).toEqual([{ project: "/work/app", online: false, areas: [
      { label: "Secrets", status: "covered", tools: [{ id: "gitleaks", status: "ran", version: "8.30.1", findings: 4 }] },
      { label: "Code", status: "not covered", tools: [{ id: "semgrep", status: "skipped", version: null, findings: 0 }] },
    ] }]);
  });

  it("keeps foundBy to short strings", () => {
    const row = findingRow({ title: "x", severity: "low", foundBy: ["a".repeat(100), 3, "trivy"] }, { target: "/w" });
    expect(row.foundBy).toEqual(["trivy"]);
  });
});
