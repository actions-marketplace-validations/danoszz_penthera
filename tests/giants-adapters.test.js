/**
 * Contract tests for the --giants adapters, offline, from recorded output:
 * one real output per tool version under tests/fixtures/giants/<tool>/<version>/,
 * recorded with scripts/giants/record.mjs on the target in
 * tests/fixtures/giants/target.mjs. Each test parses the recording and checks
 * the findings, the severity map and the command line.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TOOLS, toolById, versionStatus, compareVersions, parseVersion } from "../lib/giants/tools.js";
import { CATEGORIES, SEVERITIES, relPath, secretValue, severityFromScore, severityFromWord } from "../lib/giants/finding.js";
import { semgrepRules, shortRuleId } from "../lib/giants/adapters/semgrep.js";
import { requirementFiles } from "../lib/giants/adapters/pip-audit.js";
import { writeTarget, TARGET_SECRETS } from "./fixtures/giants/target.mjs";
import { FIXTURES, fixture, replay } from "./helpers/giants-fakes.js";
import { displayCommand } from "../lib/giants/runner.js";

let root;
beforeAll(() => { root = writeTarget(realpathSync(mkdtempSync(join(tmpdir(), "penthera-giants-target-")))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const SETTINGS = { semgrepRules: "/private/tmp/penthera-giants-semgrep-rules", nucleiTemplates: "/private/tmp/penthera-giants-nuclei-templates" };

function parse(id, { unmask = false } = {}) {
  const tool = toolById(id);
  const { version, meta, outputs } = fixture(id);
  const findings = outputs.flatMap((o) => tool.parse(replay(o, meta, root, { unmask }), { root, tool: { id, version }, settings: SETTINGS, prepared: { files: ["requirements.txt"] } }));
  return { tool, version, meta, findings };
}

describe("every adapter has a recorded fixture for each tested version", () => {
  for (const tool of TOOLS) {
    it(tool.id, () => {
      const versions = readdirSync(join(FIXTURES, tool.id)).sort();
      expect(versions).toEqual([...tool.tested].sort());
      for (const v of versions) expect(compareVersions(v, tool.minVersion)).toBeGreaterThanOrEqual(0);
    });
  }
});

describe("recorded output parses into Penthera's finding shape", () => {
  for (const tool of TOOLS) {
    it(`${tool.id}: count, shape, severities, relative paths`, () => {
      const { findings, meta, version } = parse(tool.id);
      expect(findings.length).toBe(meta.findings);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(CATEGORIES).toContain(f.category);
        expect(SEVERITIES).toContain(f.severity);
        expect(f.source).toBe(tool.id);
        expect(f.sources).toEqual([expect.objectContaining({ tool: tool.id, version, ruleId: expect.any(String) })]);
        expect(f.foundBy).toEqual([tool.id]);
        expect(f.confidence).toBe("likely");
        expect(f.fid).toMatch(/^[0-9a-f]{16}$/);
        if (f.file) {
          expect(f.file.startsWith("/")).toBe(false);
          expect(f.file).not.toContain(root);
        }
        expect(f.title).not.toMatch(/[\u0000-\u001f]/);
      }
    });
  }
});

describe("what each tool found on the fixture target", () => {
  it("gitleaks: the AWS key and the generic API keys, with the secret's hash from the file (not from its redacted report)", () => {
    const { findings } = parse("gitleaks");
    const aws = findings.find((f) => f.sources[0].ruleId === "aws-access-token");
    expect(aws).toMatchObject({ file: "config.js", line: 6, category: "secret", severity: "high" });
    expect(aws.key.secretHashes.length).toBe(1);
    expect(findings.filter((f) => f.sources[0].ruleId === "generic-api-key").map((f) => f.line).sort()).toEqual([2, 3, 7]);
  });

  it("trufflehog: unverified AWS key is high; nothing of the secret is in the finding", () => {
    const { findings } = parse("trufflehog", { unmask: true });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "config.js", line: 6, severity: "high", title: "AWS secret in config.js" });
    const text = JSON.stringify({ ...findings[0], key: null });
    for (const s of Object.values(TARGET_SECRETS)) expect(text).not.toContain(s);
  });

  it("trufflehog: a verified key is critical", () => {
    const tool = toolById("trufflehog");
    const line = JSON.stringify({ SourceMetadata: { Data: { Filesystem: { file: `${root}/config.js`, line: 6 } } }, DetectorName: "AWS", Verified: true, Raw: "AKIAEXAMPLEEXAMPLE12" });
    expect(tool.parse(line, { root, tool: { id: "trufflehog", version: "3.99.3" } })[0].severity).toBe("critical");
  });

  it("semgrep: rule ids without the rules folder prefix, CWE from the rule's tags", () => {
    const { findings } = parse("semgrep");
    expect(findings.map((f) => f.sources[0].ruleId).sort()).toEqual(["browser.security.eval-detected", "express.security.audit.xss.direct-response-write", "lang.security.audit.code-string-concat"]);
    expect(findings.find((f) => f.sources[0].ruleId.endsWith("eval-detected"))).toMatchObject({ file: "server.js", line: 9, key: { cwe: ["CWE-95"] } });
  });

  it("codeql: command and code injection with CWEs and security-severity", () => {
    const { findings } = parse("codeql");
    const cmd = findings.find((f) => f.sources[0].ruleId === "js/command-line-injection");
    expect(cmd).toMatchObject({ file: "server.js", line: 6, severity: "critical" });
    expect(cmd.key.cwe).toContain("CWE-78");
  });

  it("osv-scanner: one finding per alias group, aliases kept for the merge", () => {
    const { findings } = parse("osv-scanner");
    const f = findings.find((x) => x.key.pkg === "lodash" && x.key.advisories.includes("CVE-2021-23337"));
    expect(f).toMatchObject({ category: "dependency-vuln", file: "package-lock.json", key: { ecosystem: "npm", version: "4.17.15" } });
    expect(f.key.advisories).toContain("GHSA-35jh-r3h4-6jhm");
    expect(findings.some((x) => x.key.ecosystem === "pypi" && x.file === "requirements.txt")).toBe(true);
  });

  it("pip-audit: duplicates in its own output are listed once", () => {
    const { findings } = parse("pip-audit");
    const ids = findings.map((f) => `${f.key.pkg}|${f.sources[0].ruleId}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findings.every((f) => f.severity === "medium" && f.key.ecosystem === "pypi")).toBe(true);
  });

  it("trivy: vulnerabilities and misconfigurations, severity from Trivy's own word", () => {
    const { findings } = parse("trivy");
    expect(findings.filter((f) => f.category === "dependency-vuln").length).toBeGreaterThan(0);
    const sg = findings.find((f) => f.category === "infra-misconfig" && f.file === "infra/main.tf" && /SSH|ingress/i.test(f.title));
    expect(sg).toBeTruthy();
    expect(sg.key.resource).toBeTruthy();
    expect(findings.find((f) => f.sources[0].ruleId === "CVE-2021-23337").severity).toBe("high");
  });

  it("checkov: resource and check id for the merge, paths relative to the root", () => {
    const { findings } = parse("checkov");
    expect(findings.find((f) => f.sources[0].ruleId === "CKV_AWS_24")).toMatchObject({ file: "infra/main.tf", line: 6, key: { resource: "aws_security_group.web", checkIds: ["CKV_AWS_24"] }, severity: "medium" });
    expect(findings.some((f) => f.file === "Dockerfile")).toBe(true);
  });

  it("nuclei: one finding per match, at the matched URL, with the template's CWE", () => {
    const { findings } = parse("nuclei");
    expect(findings.map((f) => f.sources[0].ruleId).sort()).toEqual(["penthera-fixture-missing-nosniff", "penthera-fixture-openapi-exposed"]);
    expect(findings.find((f) => f.sources[0].ruleId === "penthera-fixture-openapi-exposed")).toMatchObject({ category: "web", severity: "low", key: { cwe: ["CWE-200"] } });
  });

  it("zap: risk codes mapped, version read from the report", () => {
    const { findings, version } = parse("zap");
    expect(toolById("zap").reportVersion(fixture("zap").outputs[0])).toBe(version);
    expect(findings.find((f) => f.sources[0].ruleId === "10038")).toMatchObject({ severity: "medium", key: { cwe: ["CWE-693"] } });
  });
});

describe("recorded command lines are what the adapters run", () => {
  for (const tool of TOOLS) {
    it(tool.id, () => {
      const { meta } = fixture(tool.id);
      // The recording used fixed paths for the rules and templates; here they are this test's root.
      const local = { semgrepRules: root, nucleiTemplates: root };
      const prepared = tool.command({ root, tmp: "/giants-tmp", url: meta.url, online: tool.id === "pip-audit", deep: false, rate: 0, settings: local, languages: ["JavaScript"] });
      const steps = prepared.steps || [{ args: prepared.args }];
      const shown = steps.map((s) => displayCommand(tool.bins[0], s.args, { tmp: "/giants-tmp" })).join(" && ")
        .replace(`--config ${root}`, `--config ${SETTINGS.semgrepRules}`)
        .replace(`-t ${root}`, `-t ${SETTINGS.nucleiTemplates}`)
        .split(root).join("<root>");
      expect(shown).toBe(meta.command);
    });
  }
});

describe("adapter rules", () => {
  it("semgrep refuses registry configs and missing folders", () => {
    expect(semgrepRules(null).skip).toMatch(/no local rules/);
    for (const c of ["auto", "p/secrets", "r/javascript", "https://semgrep.dev/c/p/ci"]) expect(semgrepRules(c).skip).toMatch(/registry/);
    expect(semgrepRules(join(root, "nope")).skip).toMatch(/does not exist/);
    expect(semgrepRules(root).path).toBe(root);
    expect(shortRuleId("home.u.rules.js.eval-detected", "/home/u/rules")).toBe("js.eval-detected");
  });

  it("pip-audit finds requirements files at the root only", () => {
    expect(requirementFiles(root)).toEqual(["requirements.txt"]);
    expect(toolById("pip-audit").command({ root: join(root, "infra"), tmp: "/T" }).skip).toMatch(/no requirements/);
  });

  it("nuclei leaves out intrusive, dos and fuzz templates unless --deep, and never uses interactsh or update checks", () => {
    const t = toolById("nuclei");
    const plain = t.command({ url: "http://127.0.0.1:1", tmp: "/T", deep: false, settings: { nucleiTemplates: root }, rate: 10 }).args;
    expect(plain).toEqual(expect.arrayContaining(["-etags", "intrusive,dos,fuzz", "-ni", "-duc", "-rl", "10"]));
    const deep = t.command({ url: "http://127.0.0.1:1", tmp: "/T", deep: true, settings: { nucleiTemplates: root } }).args;
    expect(deep).not.toContain("-etags");
    expect(t.command({ url: "http://x", tmp: "/T", settings: {} }).skip).toMatch(/no templates folder/);
  });

  it("zap runs the baseline only, with add-on updates off", () => {
    const args = toolById("zap").command({ url: "http://127.0.0.1:1", tmp: "/T" }).args;
    expect(args).toEqual(["-t", "http://127.0.0.1:1", "-J", "penthera-zap.json", "-I", "-z", "-silent"]);
  });

  it("trufflehog verifies keys only with --giants-online", () => {
    const t = toolById("trufflehog");
    expect(t.command({ root: "/R", online: false }).args).toContain("--no-verification");
    expect(t.command({ root: "/R", online: false }).network).toBe("deny");
    expect(t.command({ root: "/R", online: true }).args).not.toContain("--no-verification");
    expect(t.command({ root: "/R", online: true }).network).toBe("allow");
  });

  it("osv-scanner is --offline unless --giants-online", () => {
    const t = toolById("osv-scanner");
    expect(t.command({ root: "/R", online: false }).args).toContain("--offline");
    expect(t.command({ root: "/R", online: true }).args).not.toContain("--offline");
    expect(t.skipReason({ stderr: "unable to fetch OSV database: no offline version of the OSV database is available" }, { root: "/R" })).toMatch(/--download-offline-databases/);
  });

  it("trivy never updates its database, and says how to fill it", () => {
    const t = toolById("trivy");
    expect(t.command({ root: "/R", tmp: "/T" }).args).toEqual(expect.arrayContaining(["--skip-db-update", "--skip-check-update"]));
    expect(t.skipReason({ stderr: "FATAL\t--skip-db-update cannot be specified on the first run" })).toMatch(/trivy fs --download-db-only/);
  });

  it("a malformed report is an error, never an empty result", () => {
    for (const id of ["gitleaks", "semgrep", "codeql", "trivy", "checkov", "pip-audit", "zap"]) {
      expect(() => toolById(id).parse("{not json", { root, tool: { id, version: "1" }, settings: SETTINGS }), id).toThrow();
    }
    expect(() => toolById("trufflehog").parse("not json lines", { root, tool: { id: "trufflehog" } })).toThrow();
    expect(() => toolById("nuclei").parse('{"no":"template"}', { tool: { id: "nuclei" } })).toThrow();
    expect(() => toolById("gitleaks").parse('{"runs": 3}', { root, tool: { id: "gitleaks" } })).toThrow();
  });
});

describe("shared helpers", () => {
  it("maps severities by fixed tables", () => {
    expect([9.8, 7.5, 5, 0.1, 0].map(severityFromScore)).toEqual(["critical", "high", "medium", "low", "info"]);
    expect(["CRITICAL", "High", "moderate", "LOW", "UNKNOWN", "error", "warning", "note", "weird"].map(severityFromWord)).toEqual(["critical", "high", "medium", "low", "info", "high", "medium", "low", null]);
  });

  it("makes tool paths relative to the scanned root", () => {
    expect(relPath(root, `${root}/infra/main.tf`)).toBe("infra/main.tf");
    expect(relPath(root, "/infra/main.tf")).toBe("infra/main.tf");
    expect(relPath(root, "./config.js")).toBe("config.js");
    expect(relPath(root, `file://${root}/server.js`)).toBe("server.js");
  });

  it("takes the secret's value out of a matched span", () => {
    expect(secretValue('api_key = "abc12345"')).toBe("abc12345");
    expect(secretValue("token: abc12345;")).toBe("abc12345");
    expect(secretValue("AKIA1234")).toBe("AKIA1234");
  });

  it("parses versions and sorts them numerically", () => {
    expect(parseVersion("gitleaks version v8.30.1\n")).toBe("8.30.1");
    expect(parseVersion("Version: 0.76.1")).toBe("0.76.1");
    expect(compareVersions("0.100.0", "0.55.0")).toBe(1);
    expect(versionStatus(toolById("trivy"), "0.50.0")).toBe("below-minimum");
    expect(versionStatus(toolById("trivy"), "0.76.1")).toBe("tested");
    expect(versionStatus(toolById("trivy"), "0.99.0")).toBe("untested");
    expect(versionStatus(toolById("trivy"), null)).toBe("unknown");
  });
});
