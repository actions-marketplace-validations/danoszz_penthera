/**
 * runGiants() end to end with stand-in tools (tests/helpers/giants-fakes.js)
 * that replay the recorded fixtures: statuses, the coverage table, the safety
 * rules (refusal, timeout, masking, malformed output), the live-tool gate and
 * the policy key. No real tool runs here.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { runGiants, attachGiants, giantsGate, checkLiveTarget, parseToolList } from "../lib/giants/index.js";
import { normalizeGiantsPolicy } from "../lib/giants/policy.js";
import { normalizePolicy } from "../lib/install/policy.js";
import { writeTarget, TARGET_SECRETS } from "./fixtures/giants/target.mjs";
import { fakeGiants, fakeTool, fixture, replay } from "./helpers/giants-fakes.js";

const NODE_DIR = dirname(process.execPath);
const REPO_TOOLS = ["gitleaks", "trufflehog", "semgrep", "osv-scanner", "trivy", "checkov"];

let base, root, bin, rules, env;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "penthera-giants-int-")));
  root = writeTarget(join(base, "repo"));
  bin = join(base, "bin");
  rules = join(base, "rules");
  mkdirSync(rules);
  mkdirSync(bin);
  env = { PATH: `${NODE_DIR}${delimiter}/usr/bin${delimiter}/bin` };
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

// The current directory is the scanned repository, as when you run `penthera --repo .`.
const run = (o = {}) => runGiants({ root, cwd: root, pathEnv: bin, env, settings: { semgrepRules: rules }, ...o });
const tool = (g, id) => g.tools.find((t) => t.id === id);

describe("with no tools installed", () => {
  it("reports every area as not covered, never as clean", async () => {
    const { giants, toolFindings } = await run();
    expect(toolFindings).toEqual([]);
    expect(giants.areas.map((a) => [a.id, a.status])).toEqual([["secrets", "not covered"], ["code", "not covered"], ["dependencies", "not covered"], ["infrastructure", "not covered"]]);
    expect(tool(giants, "gitleaks")).toMatchObject({ status: "not installed", reason: expect.stringMatching(/^install: /) });
    expect(tool(giants, "codeql")).toMatchObject({ status: "skipped", reason: "runs only with --with codeql" });
    expect(tool(giants, "pip-audit")).toMatchObject({ status: "skipped", reason: expect.stringMatching(/--giants-online/) });
    expect(giants).toMatchObject({ schema: "penthera.giants/1", merge: "penthera-first", online: false, failOn: "default" });
  });
});

describe("with the recorded tools", () => {
  it("runs each one, counts its findings and covers each area", async () => {
    fakeGiants(bin, REPO_TOOLS, { root, unmask: true });
    const { giants, toolFindings, raw } = await run();
    for (const id of REPO_TOOLS) {
      expect(tool(giants, id), id).toMatchObject({ status: "ran", version: fixture(id).version, findings: fixture(id).meta.findings, versionStatus: "tested" });
      expect(tool(giants, id).command).toContain("<root>");
    }
    expect(giants.areas.every((a) => a.status === "covered")).toBe(true);
    expect(giants.areas.find((a) => a.id === "infrastructure").tools.find((t) => t.id === "trivy").findings).toBeLessThan(tool(giants, "trivy").findings);
    expect(toolFindings.length).toBe(REPO_TOOLS.reduce((n, id) => n + fixture(id).meta.findings, 0));
    expect(raw.map((r) => r.tool)).toEqual(REPO_TOOLS);
  });

  it("masks a secret a tool prints, in the raw output and the findings", async () => {
    fakeGiants(bin, ["trufflehog"], { root, unmask: true });
    const { toolFindings, raw } = await run({ with: ["trufflehog"] });
    const text = JSON.stringify({ toolFindings: toolFindings.map((f) => ({ ...f, key: null })), raw });
    for (const s of [TARGET_SECRETS.AWS_KEY_ID, TARGET_SECRETS.AWS_SECRET]) expect(text).not.toContain(s);
    expect(raw[0].content).toContain("AKIA…");
  });

  it("refuses a gitleaks planted inside the scanned repository", async () => {
    fakeTool(join(root, "bin"), "gitleaks", { marker: join(base, "planted-ran") });
    const { giants } = await runGiants({ root, cwd: root, pathEnv: join(root, "bin"), env, with: ["gitleaks"] });
    expect(tool(giants, "gitleaks")).toMatchObject({ status: "refused", reason: expect.stringMatching(/inside the scanned repository/) });
    expect(existsSync(join(base, "planted-ran"))).toBe(false);
    expect(giants.areas.find((a) => a.id === "secrets").status).toBe("not covered");
  });

  it("stops a tool past its timeout and reports the area as timed out, not clean", async () => {
    fakeTool(bin, "gitleaks", { version: "8.30.1", sleepMs: 30_000 });
    const { giants } = await run({ with: ["gitleaks"], timeoutS: 1 });
    expect(tool(giants, "gitleaks")).toMatchObject({ status: "timed out", reason: "stopped after 1 s" });
    expect(giants.areas.find((a) => a.id === "secrets")).toMatchObject({ status: "not covered", tools: expect.arrayContaining([expect.objectContaining({ id: "gitleaks", status: "timed out" })]) });
  });

  it("marks a malformed report as failed", async () => {
    fakeTool(bin, "semgrep", { version: "1.180.0", reportFlag: "--output", report: "{not sarif" });
    const { giants } = await run({ with: ["semgrep"] });
    expect(tool(giants, "semgrep")).toMatchObject({ status: "failed", reason: expect.stringMatching(/^output could not be read/) });
  });

  it("marks a non-zero exit as failed with the tool's last error line", async () => {
    fakeTool(bin, "trivy", { version: "0.76.1", exitCode: 2, stderr: "first\nFATAL something broke\n" });
    const { giants } = await run({ with: ["trivy"] });
    expect(tool(giants, "trivy")).toMatchObject({ status: "failed", reason: "exit 2: FATAL something broke" });
  });

  it("skips Trivy with the fill command when its database is missing", async () => {
    fakeTool(bin, "trivy", { version: "0.76.1", exitCode: 1, stderr: "FATAL\t--skip-db-update cannot be specified on the first run\n" });
    const { giants } = await run({ with: ["trivy"] });
    expect(tool(giants, "trivy")).toMatchObject({ status: "skipped", reason: expect.stringMatching(/trivy fs --download-db-only/) });
  });

  it("skips a version below the minimum and warns on one without a fixture", async () => {
    fakeTool(bin, "gitleaks", { version: "8.10.0" });
    fakeGiants(bin, ["trivy"], { root });
    fakeTool(bin, "trivy", { version: "0.99.0", reportFlag: "--output", report: replay(fixture("trivy").outputs[0], fixture("trivy").meta, root) });
    const { giants } = await run({ with: ["gitleaks", "trivy"] });
    expect(tool(giants, "gitleaks")).toMatchObject({ status: "skipped", reason: "version 8.10.0 is below the minimum 8.30.0" });
    expect(tool(giants, "trivy")).toMatchObject({ status: "ran", versionStatus: "untested", reason: expect.stringMatching(/no recorded fixture/) });
  });

  it("runs Semgrep only with a local rules folder", async () => {
    fakeGiants(bin, ["semgrep"], { root });
    const { giants } = await run({ with: ["semgrep"], settings: {} });
    expect(tool(giants, "semgrep")).toMatchObject({ status: "skipped", reason: expect.stringMatching(/no local rules/) });
  });
});

describe("selection: --with, --without, --giants-online, CodeQL", () => {
  it("--with runs only the named tools; --without skips", async () => {
    fakeGiants(bin, REPO_TOOLS, { root });
    const { giants } = await run({ with: ["gitleaks", "trivy"], without: ["trivy"] });
    expect(giants.tools.filter((t) => t.status === "ran").map((t) => t.id)).toEqual(["gitleaks"]);
    expect(tool(giants, "trivy").reason).toBe("left out with --without");
    expect(tool(giants, "checkov").reason).toBe("not in --with");
  });

  it("pip-audit and TruffleHog verification only with --giants-online", async () => {
    fakeGiants(bin, ["pip-audit", "trufflehog"], { root });
    const off = await run({ with: ["pip-audit", "trufflehog"] });
    expect(tool(off.giants, "pip-audit").status).toBe("skipped");
    expect(tool(off.giants, "trufflehog").network).toMatch(/^denied|not enforced/);
    const on = await run({ with: ["pip-audit", "trufflehog"], online: true });
    expect(tool(on.giants, "pip-audit")).toMatchObject({ status: "ran", findings: fixture("pip-audit").meta.findings, network: "online" });
    expect(tool(on.giants, "trufflehog").command).not.toContain("--no-verification");
    expect(on.giants.online).toBe(true);
  });

  it("parses --with names and refuses unknown ones", () => {
    expect(parseToolList("gitleaks, ZAP,osv", "--with")).toEqual(["gitleaks", "zap", "osv-scanner"]);
    expect(() => parseToolList("gitleaks,burp", "--with")).toThrow(/unknown tool burp/);
    expect(parseToolList(undefined, "--with")).toBeNull();
  });
});

describe("live tools: the authorization gate", () => {
  const templates = () => { const d = join(base, "tpl"); mkdirSync(d, { recursive: true }); return d; };

  it("refuses a host outside the allowed set before nuclei or ZAP starts", async () => {
    fakeTool(bin, "nuclei", { version: "3.11.1", marker: join(base, "nuclei-ran") });
    fakeTool(bin, "zap-baseline.py", { marker: join(base, "zap-ran") });
    const { giants } = await runGiants({ url: "https://elsewhere.example", typedUrl: "https://staging.example", cwd: root, pathEnv: bin, env, settings: { nucleiTemplates: templates() } });
    for (const id of ["nuclei", "zap"]) expect(tool(giants, id)).toMatchObject({ status: "refused", reason: expect.stringMatching(/^not started: elsewhere\.example is not/) });
    expect(existsSync(join(base, "nuclei-ran"))).toBe(false);
    expect(existsSync(join(base, "zap-ran"))).toBe(false);
    expect(giants.areas).toEqual([expect.objectContaining({ id: "live", status: "not covered" })]);
  });

  it("allows the typed target, loopback and --allow-host hosts", () => {
    expect(checkLiveTarget("https://staging.example/x", { typedUrl: "https://staging.example" }).ok).toBe(true);
    expect(checkLiveTarget("http://127.0.0.1:8080", {}).ok).toBe(true);
    expect(checkLiveTarget("http://app.localhost:3000", {}).ok).toBe(true);
    expect(checkLiveTarget("https://other.example", { typedUrl: "https://staging.example", allowHosts: ["other.example"] }).ok).toBe(true);
    expect(checkLiveTarget("https://other.example", { typedUrl: "https://staging.example" }).ok).toBe(false);
    expect(checkLiveTarget("file:///etc/passwd", {}).ok).toBe(false);
  });

  it("runs nuclei and ZAP against a loopback target and reads their output", async () => {
    const url = "http://127.0.0.1:9";
    fakeGiants(bin, ["nuclei", "zap"], { url });
    const { giants, toolFindings } = await runGiants({ url, cwd: root, pathEnv: bin, env, settings: { nucleiTemplates: templates() } });
    expect(tool(giants, "nuclei")).toMatchObject({ status: "ran", findings: 2 });
    expect(tool(giants, "zap")).toMatchObject({ status: "ran", version: "2.17.0" });
    expect(toolFindings.filter((f) => f.source === "nuclei").every((f) => f.url.startsWith(url))).toBe(true);
    expect(giants.areas[0]).toMatchObject({ id: "live", status: "covered" });
  });

  it("skips nuclei without a templates folder (its own template download is never used)", async () => {
    fakeTool(bin, "nuclei", { version: "3.11.1" });
    const { giants } = await runGiants({ url: "http://127.0.0.1:9", cwd: root, pathEnv: bin, env, with: ["nuclei"] });
    expect(tool(giants, "nuclei")).toMatchObject({ status: "skipped", reason: expect.stringMatching(/no templates folder/) });
  });
});

describe("the giants policy key", () => {
  it("validates the section, and normalizePolicy knows it", () => {
    expect(normalizePolicy({}).giants).toMatchObject({ require: [], only: null, deny: [], failOn: "default" });
    expect(normalizePolicy({ giants: { require: ["gitleaks"], failOn: "never" } }).giants).toMatchObject({ require: ["gitleaks"], failOn: "never" });
    expect(() => normalizeGiantsPolicy({ deny: ["burp"] })).toThrow(/unknown tool/);
    expect(() => normalizeGiantsPolicy({ failOn: "sometimes" })).toThrow(/failOn/);
    expect(() => normalizeGiantsPolicy({ require: ["trivy"], deny: ["trivy"] })).toThrow(/required but also denied/);
    expect(() => normalizeGiantsPolicy({ extra: 1 })).toThrow(/unknown field/);
    expect(() => normalizeGiantsPolicy({ timeout: 0 })).toThrow(/timeout/);
  });

  it("deny, only and require", async () => {
    fakeGiants(bin, REPO_TOOLS, { root });
    const { giants } = await run({ policy: normalizeGiantsPolicy({ only: ["gitleaks", "trivy", "checkov"], deny: ["checkov"], require: ["gitleaks", "trivy"] }) });
    expect(giants.tools.filter((t) => t.status === "ran").map((t) => t.id)).toEqual(["gitleaks", "trivy"]);
    expect(tool(giants, "checkov").reason).toBe("denied by the policy file");
    expect(tool(giants, "semgrep").reason).toBe("not in the policy file's giants.only");
    expect(giants.requiredNotRun).toBeUndefined();
    const missing = await run({ policy: normalizeGiantsPolicy({ require: ["trufflehog"] }), with: ["gitleaks"] });
    expect(missing.giants.requiredNotRun).toEqual(["trufflehog"]);
  });
});

describe("into the scan result", () => {
  it("other tools' findings count toward the exit code unless giants.failOn is never", async () => {
    fakeGiants(bin, ["osv-scanner"], { root });
    const r = await run({ with: ["osv-scanner"] });
    const result = attachGiants({ findings: [] }, r, { root });
    expect(result.giants.findings.some((f) => f.severity === "high" || f.severity === "critical")).toBe(true);
    expect(giantsGate(result)).toBe(true);
    expect(giantsGate({ ...result, giants: { ...result.giants, failOn: "never" } })).toBe(false);
    expect(giantsGate({ findings: [] })).toBe(false);
  });

  it("a malformed report file on disk (not the tool's) is never read from the repository", async () => {
    writeFileSync(join(root, "gitleaks.sarif"), "{}");
    fakeTool(bin, "gitleaks", { version: "8.30.1" });
    const { giants } = await run({ with: ["gitleaks"] });
    expect(tool(giants, "gitleaks")).toMatchObject({ status: "failed", reason: "the tool wrote no report" });
  });
});
