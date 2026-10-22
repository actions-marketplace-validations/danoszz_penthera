/**
 * `penthera verify`: reading Cloudflare security-audit-skill findings.json,
 * inferring classes, and rung 1 of the verification ladder (does a Penthera
 * rule agree?). Repos are built in temp folders; no model, no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { withTempDir } from "../lib/tmp.js";
import { parseCloudflareFindings, isSafeRelativePath, MAX_FINDINGS } from "../lib/llm-audit/cloudflare.js";
import { classify, CLASSES } from "../lib/llm-audit/classes.js";
import { verifyCandidates } from "../lib/llm-audit/verify.js";
import { runVerify, verifySarif } from "../src/cli/verify.js";

function put(root, rel, text = "") {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const FAKE_KEY = "AKIA" + "QWERTY1234567890"; // shape of an AWS key id, not a real one
const PAYLOAD = "PAYLOAD-MARKER-do-not-copy";

const trace = (file, line) => [
  { kind: "entrypoint", file, line: 1, scope: "handler", description: "request enters" },
  { kind: "sink", file, line, scope: "handler", description: "reaches the sink" },
];

function needsValidation(fp, title, file, line, extra = {}) {
  return {
    verdict: "needs_validation",
    fingerprint: fp,
    title,
    description: `${title} described.`,
    claimed_root_cause: "Input is not checked.",
    trace: trace(file, line),
    evidence: [{ file, line, description: "here" }],
    blockers: ["no sandbox"],
    validation_plan: { local: "run it" },
    ...extra,
  };
}

function confirmed(fp, title, file, line) {
  return {
    verdict: "confirmed",
    fingerprint: fp,
    title,
    description: `${title} described.`,
    root_cause: "Input reaches the sink.",
    intended_behavior: "It should not.",
    trace: trace(file, line),
    evidence: [{ file, line, description: "here" }],
    conditions: [],
    execution: { attacker_perspective: "anonymous", payloads: [PAYLOAD], instructions: ["send it"], observed_result: "it ran" },
    remediation: { strategy: "escape it", code_changes: [{ file_name: file, fixed_code: "safe()" }] },
    severity: {
      likelihood: { score: "high", reason: "easy" },
      impact: { score: "critical", reason: "bad" },
      overall_severity: "high",
    },
    confidence: { score: "high", reason: "reproduced" },
  };
}

const rejected = (fp) => ({
  verdict: "rejected", fingerprint: fp, title: "Not a bug", description: "Checked.", claimed_root_cause: "none",
  trace: trace("a.js", 1), evidence: [{ file: "a.js", line: 1, description: "x" }], reason: "guarded",
});

describe("reading findings.json", () => {
  it("accepts all three verdicts and drops rejected ones", () => {
    const r = parseCloudflareFindings(JSON.stringify([
      confirmed("a1", "XSS via innerHTML", "app/api/x/route.js", 2),
      needsValidation("b2", "SQL injection in search", "lib/db.js", 3),
      rejected("c3"),
    ]));
    expect(r.ok).toBe(true);
    expect(r.rejected).toBe(1);
    expect(r.candidates.map((c) => c.fingerprint)).toEqual(["a1", "b2"]);
    const [a] = r.candidates;
    expect(a).toMatchObject({ file: "app/api/x/route.js", line: 2, class: "xss", severity: "high" });
    expect(a.origin).toMatchObject({ producer: "cloudflare-security-audit", verdict: "confirmed", confidence: "high" });
    expect(JSON.stringify(r.candidates)).not.toContain(PAYLOAD);
    expect(JSON.stringify(r.candidates)).not.toContain("safe()");
  });

  it("refuses a file that does not match the schema, whole", () => {
    const missing = needsValidation("a1", "x", "a.js", 1);
    delete missing.blockers;
    const r = parseCloudflareFindings(JSON.stringify([needsValidation("z9", "ok", "a.js", 1), missing]));
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/blockers/);
  });

  it("refuses unknown fields, wrong types and bad fingerprints", () => {
    expect(parseCloudflareFindings(JSON.stringify([needsValidation("a1", "x", "a.js", 1, { extra: 1 })])).ok).toBe(false);
    expect(parseCloudflareFindings(JSON.stringify([needsValidation("-bad", "x", "a.js", 1)])).ok).toBe(false);
    expect(parseCloudflareFindings(JSON.stringify({ not: "an array" })).ok).toBe(false);
    expect(parseCloudflareFindings("not json").errors[0]).toMatch(/not valid JSON/);
    const blank = needsValidation("a1", "   ", "a.js", 1);
    expect(parseCloudflareFindings(JSON.stringify([blank])).errors.join()).toMatch(/visible/);
  });

  it("refuses duplicate fingerprints and paths that leave the repo", () => {
    expect(parseCloudflareFindings(JSON.stringify([needsValidation("a1", "x", "a.js", 1), needsValidation("a1", "y", "b.js", 1)])).errors[0]).toMatch(/duplicate/);
    for (const p of ["../etc/passwd", "/etc/passwd", "a/../../b", "C:\\x", "a//b"]) {
      expect(parseCloudflareFindings(JSON.stringify([needsValidation("a1", "x", p, 1)])).ok, p).toBe(false);
    }
    expect(isSafeRelativePath("src/a.js")).toBe(true);
  });

  it("refuses files with too many findings", () => {
    const many = Array.from({ length: MAX_FINDINGS + 1 }, (_, i) => needsValidation(`f${i}`, "x", "a.js", 1));
    expect(parseCloudflareFindings(JSON.stringify(many)).errors[0]).toMatch(/more than/);
  });
});

describe("classes", () => {
  it("are inferred from the text with a fixed table, title first", () => {
    expect(classify("Hardcoded AWS secret key in config").id).toBe("hardcoded-secret");
    expect(classify("OS command injection via filename").id).toBe("command-injection");
    expect(classify("IDOR on /api/orders/:id").id).toBe("access-control");
    expect(classify("Something odd").id).toBe("other");
    expect(classify("Open redirect", "also mentions SQL injection").id).toBe("open-redirect");
  });

  it("classify their own label to themselves, so a class can be written down and read back", () => {
    for (const c of CLASSES) expect(classify(c.label).id, c.label).toBe(c.id);
  });

  it("have unique ids and say which rule family can check them", () => {
    const ids = CLASSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CLASSES) if (c.rule) expect(["secrets", "code-pattern", "agents"]).toContain(c.rule.family);
  });
});

describe("rung 1: does a rule agree?", () => {
  let fetchSpy;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in verify")); });
  afterEach(() => fetchSpy.mockRestore());

  const repo = (root) => {
    put(root, "config/aws.js", `module.exports = { key: "${FAKE_KEY}" };\n`);
    put(root, "lib/clean.js", "module.exports = {};\n");
    put(root, "app/api/render/route.js", "export async function GET(req) {\n  el.innerHTML = req.query;\n  return new Response('ok');\n}\n");
    put(root, "lib/db.js", "export function q(s) {\n  return db.query('SELECT ' + s);\n}\n");
  };

  const candidates = (list) => parseCloudflareFindings(JSON.stringify(list)).candidates;

  it("confirms by rule, leaves the rest unverified, and checks locations", () => withTempDir("penthera-verify-", async (root) => {
    repo(root);
    await withTempDir("penthera-verify-out-", async (outside) => {
      put(outside, "x.js", "1;\n");
      symlinkSync(join(outside, "x.js"), join(root, "escape.js"));
      const r = await verifyCandidates(root, candidates([
        needsValidation("a1", "Hardcoded AWS key", "config/aws.js", 1),
        needsValidation("a2", "Hardcoded API key", "lib/clean.js", 1),
        confirmed("a3", "Stored XSS via innerHTML", "app/api/render/route.js", 2),
        needsValidation("a4", "SQL injection in q()", "lib/db.js", 2),
        needsValidation("a5", "SQL injection", "lib/missing.js", 1),
        needsValidation("a6", "SQL injection", "lib/db.js", 99),
        needsValidation("a7", "Command injection", "escape.js", 1),
      ]));
      const by = Object.fromEntries(r.candidates.map((c) => [c.fingerprint, c.verification]));
      expect(by.a1.status).toBe("confirmed-by-rule");
      expect(by.a2).toMatchObject({ status: "unverified" });
      expect(by.a2.reason).toMatch(/does not mean the finding is wrong/);
      expect(by.a3.status).toBe("confirmed-by-rule");
      expect(by.a4).toMatchObject({ status: "unverified" });
      expect(by.a4.reason).toMatch(/no rule for sql injection/);
      expect(by.a5.status).toBe("location-not-found");
      expect(by.a6.status).toBe("location-not-found");
      expect(by.a6.reason).toMatch(/3 lines/);
      expect(by.a7.status).toBe("out-of-scope");
      expect(r.counts).toEqual({ "confirmed-by-rule": 2, unverified: 2, "location-not-found": 2, "out-of-scope": 1 });

      // A confirmed candidate becomes Penthera's own finding with the model listed; unverified ones are labelled.
      const secret = r.findings.find((f) => f.category === "secrets");
      expect(secret.alsoProposedBy).toEqual([{ producer: "cloudflare-security-audit", fingerprint: "a1", title: "Hardcoded AWS key" }]);
      const model = r.findings.filter((f) => f.modelProposed);
      expect(model.map((f) => f.origin.fingerprint).sort()).toEqual(["a2", "a4"]);
      for (const f of model) expect(f).toMatchObject({ confidence: "needs-human-review", label: "model-proposed, unverified", source: "llm-import" });
      // The skill's own "confirmed" verdict does not make a finding confirmed in Penthera.
      expect(r.findings.some((f) => f.modelProposed && f.confidence === "confirmed")).toBe(false);
      expect(r.ai).toMatchObject({ modelCalledByPenthera: false, hostsContacted: [] });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }));

  it("runs only the rule families the candidates need", () => withTempDir("penthera-verify-", async (root) => {
    repo(root);
    const scanRepo = vi.fn(async () => ({ findings: [] }));
    const scanAgents = vi.fn(async () => ({ findings: [] }));
    await verifyCandidates(root, candidates([needsValidation("a1", "SQL injection", "lib/db.js", 1)]), { scanners: { scanRepo, scanAgents } });
    expect(scanRepo).not.toHaveBeenCalled();
    expect(scanAgents).not.toHaveBeenCalled();
    await verifyCandidates(root, candidates([needsValidation("a1", "MCP server runs unpinned package", ".mcp.json", 1)]), { scanners: { scanRepo, scanAgents } });
    expect(scanAgents).not.toHaveBeenCalled(); // .mcp.json does not exist: location check comes first
  }));
});

describe("penthera verify (CLI)", () => {
  const sink = () => { let s = ""; return { write: (t) => { s += t; }, text: () => s }; };

  it("prints a summary, writes JSON and SARIF, and exits 0", () => withTempDir("penthera-verify-", async (root) => {
    put(root, "lib/db.js", "x\n");
    put(root, "config/aws.js", `const k = "${FAKE_KEY}";\n`);
    put(root, "findings.json", JSON.stringify([
      needsValidation("a1", "SQL injection \u001b[31min\u001b[0m search \u202e", "lib/db.js", 1),
      needsValidation("a2", "Hardcoded AWS key", "config/aws.js", 1),
      rejected("r1"),
    ]));
    const out = sink();
    const code = await runVerify([join(root, "findings.json"), "--repo", root, "-o", join(root, "out/v.json"), "--sarif", join(root, "out/v.sarif"), "--markdown", join(root, "out/v.md")], { out, err: sink() });
    expect(code).toBe(0);
    expect(out.text()).not.toMatch(/\u001b\[31m|\u202e/);
    expect(out.text()).toMatch(/confirmed by a Penthera rule/);
    expect(out.text()).toMatch(/rejected by the producer/);
    const { readFileSync } = await import("node:fs");
    const sarif = JSON.parse(readFileSync(join(root, "out/v.sarif"), "utf-8"));
    expect(sarif.runs.map((r) => r.tool.driver.name)).toEqual(["penthera", "penthera-ai"]);
    expect(sarif.runs[1].results.every((r) => r.level === "note")).toBe(true);
    expect(sarif.runs[1].results[0].ruleId).toBe("llm-audit/sql-injection");
    const md = readFileSync(join(root, "out/v.md"), "utf-8");
    expect(md).toMatch(/## Model-proposed, unverified/);
    expect(JSON.parse(readFileSync(join(root, "out/v.json"), "utf-8")).schema).toBe("penthera.verify/1");
  }));

  it("exits 2 and imports nothing from an invalid file", () => withTempDir("penthera-verify-", async (root) => {
    put(root, "bad.json", JSON.stringify([{ verdict: "confirmed", fingerprint: "a" }]));
    const err = sink();
    expect(await runVerify([join(root, "bad.json"), "--repo", root], { out: sink(), err })).toBe(2);
    expect(err.text()).toMatch(/Nothing was imported/);
    expect(await runVerify([join(root, "nope.json"), "--repo", root], { out: sink(), err: sink() })).toBe(2);
    expect(await runVerify([], { out: sink(), err: sink() })).toBe(2);
  }));

  it("keeps model findings in their own SARIF run even with no rule findings", () => {
    const sarif = verifySarif({ timestamp: "2026-10-22T00:00:00Z", findings: [] });
    expect(sarif.runs).toHaveLength(2);
  });
});

describe("exporting seeds for an AI audit", () => {
  it("writes valid security-audit findings, with real lines, that verify confirms by rule", () => withTempDir("penthera-seeds-", async (root) => {
    const { scanRepo } = await import("../src/scan-repo.js");
    const { toSecurityAuditFindings } = await import("../lib/llm-audit/export.js");
    put(root, "config/aws.js", `// config\nmodule.exports = {\n  key: "${FAKE_KEY}",\n};\n`);
    put(root, "app/api/render/route.js", "export async function GET(req) {\n  const x = 1;\n  el.innerHTML = req.query;\n}\n");
    const scan = await scanRepo(root);
    const seeds = toSecurityAuditFindings({ findings: [...scan.findings, { severity: "high", title: "Missing CSP", url: "https://example.com", category: "headers" }] }, root);
    expect(seeds.exported).toBe(2);
    expect(seeds.skipped).toBeGreaterThanOrEqual(1); // the URL finding and info findings
    const byFile = Object.fromEntries(seeds.findings.map((f) => [f.trace[0].file, f]));
    expect(byFile["config/aws.js"].trace[0].line).toBe(3);
    expect(byFile["app/api/render/route.js"].trace[0].line).toBe(3);
    expect(seeds.findings.every((f) => f.verdict === "needs_validation" && f.fingerprint.startsWith("penthera:"))).toBe(true);
    expect(JSON.stringify(seeds.findings)).not.toContain(FAKE_KEY); // the secret stays masked

    // Round trip: the skill would accept the file, and verify confirms every seed by rule.
    const parsed = parseCloudflareFindings(JSON.stringify(seeds.findings));
    expect(parsed.ok).toBe(true);
    const r = await verifyCandidates(root, parsed.candidates);
    expect(r.counts["confirmed-by-rule"]).toBe(2);
  }));

  it("says when the line is not known instead of inventing one", async () => {
    const { toSecurityAuditFindings } = await import("../lib/llm-audit/export.js");
    await withTempDir("penthera-seeds-", async (root) => {
      put(root, ".mcp.json", "{}\n");
      const seeds = toSecurityAuditFindings({ findings: [{ severity: "medium", title: "Unpinned MCP server", description: "runs npx -y", url: ".mcp.json", category: "agent-config" }] }, root);
      expect(seeds.findings[0].trace[0].line).toBe(1);
      expect(seeds.findings[0].description).toMatch(/did not record a line/);
    });
  });

  it("is refused by the CLI without a repository", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, ["bin/penthera.js", "http://127.0.0.1:9", "--audit-seeds", "x.json"], { encoding: "utf-8", timeout: 20_000 });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/--audit-seeds needs --repo/);
  });
});
