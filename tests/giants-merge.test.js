/**
 * The --giants merge (spec-giants.md, "Merging"): hand-built overlapping
 * findings for every category, and the Penthera-first default on the
 * recorded fixtures.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeFinding, secretHash } from "../lib/giants/finding.js";
import { sameFinding, mergeToolFindings, mergePentheraFirst, pentheraKeyed, publicFinding } from "../lib/giants/merge.js";
import { toolById } from "../lib/giants/tools.js";
import { scanSecrets } from "../lib/whitebox/secrets.js";
import { scanCodeSinks } from "../lib/whitebox/code-sinks.js";
import { writeTarget, TARGET_SECRETS } from "./fixtures/giants/target.mjs";
import { fixture, replay } from "./helpers/giants-fakes.js";

const t = (id) => ({ id, version: "1.0.0" });
const f = (tool, o) => makeFinding({ tool: t(tool), ruleId: o.ruleId || `${tool}-rule`, title: o.title || "x", severity: o.severity || "medium", ...o });

describe("merge keys, one category at a time", () => {
  it("secret: same file, line and value merge; two keys on one line do not", () => {
    const a = f("gitleaks", { category: "secret", file: "a.js", line: 3, key: { secretHashes: [secretHash("k1")] } });
    const b = f("trufflehog", { category: "secret", file: "a.js", line: 3, key: { secretHashes: [secretHash("k1"), secretHash("x")] }, severity: "critical" });
    const c = f("trufflehog", { category: "secret", file: "a.js", line: 3, key: { secretHashes: [secretHash("k2")] } });
    const d = f("gitleaks", { category: "secret", file: "a.js", line: 4, key: { secretHashes: [secretHash("k1")] } });
    expect(sameFinding(a, b)).toBe(true);
    expect(sameFinding(a, c)).toBe(false);
    expect(sameFinding(a, d)).toBe(false);
    const m = mergeToolFindings([a, b, c, d]);
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ severity: "critical", foundBy: ["gitleaks", "trufflehog"] });
    expect(m[0].sources.map((s) => s.tool)).toEqual(["gitleaks", "trufflehog"]);
  });

  it("secret: no value known means no merge", () => {
    const a = f("gitleaks", { category: "secret", file: "a.js", line: 3, key: { secretHashes: [] } });
    const b = f("checkov", { category: "secret", file: "a.js", line: 3, key: { secretHashes: [] } });
    expect(sameFinding(a, b)).toBe(false);
  });

  it("code: file, line and a shared CWE; without a CWE only the same tool's same rule", () => {
    const a = f("semgrep", { category: "code", file: "s.js", line: 9, key: { cwe: ["CWE-95"] } });
    const b = f("codeql", { category: "code", file: "s.js", line: 9, key: { cwe: ["CWE-94", "CWE-95"] } });
    const c = f("codeql", { category: "code", file: "s.js", line: 9, key: { cwe: ["CWE-79"] } });
    const d = f("semgrep", { category: "code", file: "s.js", line: 9, ruleId: "r1", key: { cwe: [] } });
    const e = f("codeql", { category: "code", file: "s.js", line: 9, ruleId: "r1", key: { cwe: [] } });
    expect(sameFinding(a, b)).toBe(true);
    expect(sameFinding(a, c)).toBe(false);
    expect(sameFinding(d, e)).toBe(false);
    expect(sameFinding(d, f("semgrep", { category: "code", file: "s.js", line: 9, ruleId: "r1", key: {} }))).toBe(true);
  });

  it("dependency: ecosystem, package, version and an advisory shared across aliases", () => {
    const osv = f("osv-scanner", { category: "dependency-vuln", key: { ecosystem: "npm", pkg: "lodash", version: "4.17.15", advisories: ["GHSA-35jh-r3h4-6jhm", "CVE-2021-23337"] } });
    const trivy = f("trivy", { category: "dependency-vuln", severity: "high", key: { ecosystem: "npm", pkg: "lodash", version: "4.17.15", advisories: ["cve-2021-23337"] } });
    const other = f("trivy", { category: "dependency-vuln", key: { ecosystem: "npm", pkg: "lodash", version: "4.17.21", advisories: ["CVE-2021-23337"] } });
    const pypi = f("pip-audit", { category: "dependency-vuln", key: { ecosystem: "pypi", pkg: "lodash", version: "4.17.15", advisories: ["CVE-2021-23337"] } });
    expect(sameFinding(osv, trivy)).toBe(true);
    expect(sameFinding(osv, other)).toBe(false);
    expect(sameFinding(osv, pypi)).toBe(false);
    expect(mergeToolFindings([osv, trivy])[0]).toMatchObject({ severity: "high", foundBy: ["osv-scanner", "trivy"] });
    expect(mergeToolFindings([osv, trivy])[0].key.advisories).toEqual(["CVE-2021-23337", "GHSA-35jh-r3h4-6jhm", "cve-2021-23337"]);
  });

  it("container vulnerabilities do not merge with dependency ones", () => {
    const a = f("trivy", { category: "container-vuln", key: { ecosystem: "os:debian", pkg: "openssl", version: "1", advisories: ["CVE-1"] } });
    const b = f("osv-scanner", { category: "dependency-vuln", key: { ecosystem: "os:debian", pkg: "openssl", version: "1", advisories: ["CVE-1"] } });
    expect(sameFinding(a, b)).toBe(false);
  });

  it("infrastructure: file, resource and a shared check id; no merge across tools without one", () => {
    const a = f("checkov", { category: "infra-misconfig", file: "main.tf", line: 6, key: { resource: "aws_security_group.web", checkIds: ["CKV_AWS_24"] } });
    const b = f("trivy", { category: "infra-misconfig", file: "main.tf", line: 12, key: { resource: "aws_security_group.web", checkIds: ["AVD-AWS-0107", "AWS-0107"] } });
    const c = f("checkov", { category: "infra-misconfig", file: "main.tf", line: 6, key: { resource: "aws_security_group.web", checkIds: ["CKV_AWS_24"] } });
    expect(sameFinding(a, b)).toBe(false);
    expect(sameFinding(a, c)).toBe(true);
  });

  it("web: URL, parameter and CWE", () => {
    const a = f("zap", { category: "web", url: "http://127.0.0.1:1/", key: { cwe: ["CWE-693"], parameter: null } });
    const b = f("nuclei", { category: "web", url: "http://127.0.0.1:1", key: { cwe: ["CWE-693"], parameter: null } });
    const c = f("nuclei", { category: "web", url: "http://127.0.0.1:1/", key: { cwe: ["CWE-693"], parameter: "q" } });
    expect(sameFinding(a, b)).toBe(true);
    expect(sameFinding(a, c)).toBe(false);
  });

  it("findings of different categories never merge", () => {
    const a = f("gitleaks", { category: "secret", file: "a.js", line: 1, key: { secretHashes: ["h"] } });
    const b = f("semgrep", { category: "code", file: "a.js", line: 1, key: { cwe: ["CWE-798"] } });
    expect(sameFinding(a, b)).toBe(false);
  });

  it("the secret hashes never reach a report", () => {
    const a = f("gitleaks", { category: "secret", file: "a.js", line: 1, key: { secretHashes: [secretHash("k")] } });
    expect(JSON.stringify(publicFinding(a))).not.toContain(secretHash("k"));
  });
});

describe("Penthera-first on the recorded fixtures", () => {
  let root;
  beforeAll(() => { root = writeTarget(realpathSync(mkdtempSync(join(tmpdir(), "penthera-giants-merge-")))); });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const toolFindings = (ids) => ids.flatMap((id) => {
    const { version, meta, outputs } = fixture(id);
    return outputs.flatMap((o) => toolById(id).parse(replay(o, meta, root, { unmask: true }), { root, tool: { id, version }, settings: { semgrepRules: "/private/tmp/penthera-giants-semgrep-rules" } }));
  });

  it("folds gitleaks and TruffleHog into Penthera's AWS key finding: found by Penthera, gitleaks, trufflehog", () => {
    const penthera = scanSecrets(root);
    const { findings, also, folded } = mergePentheraFirst(penthera, toolFindings(["gitleaks", "trufflehog"]), { root });
    const aws = findings.find((x) => x.title.startsWith("AWS access key"));
    expect(aws.foundBy).toEqual(["penthera", "gitleaks", "trufflehog"]);
    expect(aws.alsoReportedBy.map((s) => s.tool)).toEqual(["gitleaks", "trufflehog"]);
    expect(aws.confidence).toBeUndefined(); // Penthera's own finding leads, untouched but for the sources
    expect(folded).toBeGreaterThanOrEqual(2);
    // What Penthera did not report stays in its own list, never in Penthera's.
    expect(findings.length).toBe(penthera.length);
    for (const a of also) expect(a.key.secretHashes).toBeUndefined();
    const json = JSON.stringify({ findings, also });
    for (const s of Object.values(TARGET_SECRETS)) expect(json).not.toContain(s);
  });

  it("folds Semgrep's eval rule into Penthera's eval finding by CWE-95", () => {
    const penthera = scanCodeSinks(root, {});
    const { findings, also } = mergePentheraFirst(penthera, toolFindings(["semgrep"]), { root });
    const ev = findings.find((x) => x.pattern === "eval");
    expect(ev.foundBy).toEqual(["penthera", "semgrep"]);
    expect(also.map((a) => a.sources[0].ruleId)).toEqual(["express.security.audit.xss.direct-response-write"]);
  });

  it("merges osv-scanner and Trivy on shared advisories", () => {
    const { also } = mergePentheraFirst([], toolFindings(["osv-scanner", "trivy"]), { root });
    const lodash = also.find((x) => x.key.pkg === "lodash" && x.key.advisories.includes("CVE-2021-23337"));
    expect(lodash.foundBy).toEqual(["osv-scanner", "trivy"]);
  });

  it("knows which Penthera findings a tool can match", () => {
    expect(pentheraKeyed({ category: "headers", url: "https://x" }, root)).toEqual([]);
    expect(pentheraKeyed({ category: "code-pattern", file: "s.js", line: 6, pattern: "command-injection" }, root)[0].key.cwe).toEqual(["CWE-78"]);
  });
});
