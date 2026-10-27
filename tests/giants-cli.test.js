/**
 * --giants from the command line: `penthera giants`, the flag checks, the
 * exit code (spec decision 2), the policy's require and failOn, the CodeQL
 * notice, and the reports (terminal, JSON, Markdown, SARIF, evidence). The
 * tools are stand-ins replaying recorded fixtures; no real tool runs.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { writeTarget, TARGET_SECRETS } from "./fixtures/giants/target.mjs";
import { fakeGiants, fakeTool, fixture, replay } from "./helpers/giants-fakes.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "penthera.js");
const NODE_DIR = dirname(process.execPath);

let base, bin, work;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "penthera-giants-cli-")));
  bin = join(base, "bin");
  // Not the parent of bin: a tool inside the current directory is refused.
  work = join(base, "work");
  mkdirSync(bin);
  mkdirSync(work);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

function cli(args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: work,
      env: { ...process.env, PATH: [bin, NODE_DIR, "/usr/bin", "/bin"].join(delimiter), NO_COLOR: "1", PENTHERA_NO_ONBOARDING: "1", PENTHERA_SEMGREP_RULES: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

/** A repo where Penthera itself finds nothing high, so only other tools can gate. */
function quietRepo(policy = null) {
  const dir = join(base, "quiet");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), "# quiet\n");
  if (policy) writeFileSync(join(dir, "penthera.policy.json"), JSON.stringify(policy));
  return dir;
}

describe("penthera giants", () => {
  it("lists each tool: found or not, version, install hint (JSON)", async () => {
    fakeTool(bin, "gitleaks", { version: "8.30.1" });
    const r = await cli(["giants", "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.schema).toBe("penthera.giants-list/1");
    expect(out.tools.find((t) => t.id === "gitleaks")).toMatchObject({ found: true, version: "8.30.1", versionStatus: "tested" });
    expect(out.tools.find((t) => t.id === "trivy")).toMatchObject({ found: false, install: expect.any(String) });
    expect(out.tools.map((t) => t.id)).toEqual(["gitleaks", "trufflehog", "semgrep", "codeql", "osv-scanner", "pip-audit", "trivy", "checkov", "nuclei", "zap"]);
  });

  it("prints a readable list and its help", async () => {
    fakeTool(bin, "trivy", { version: "0.50.0" });
    const r = await cli(["giants"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/trivy\s+found\s+0\.50\.0/);
    expect(r.stdout).toMatch(/below the minimum/);
    expect(r.stdout).toMatch(/gitleaks\s+not found/);
    const h = await cli(["giants", "--help"]);
    expect(h.stdout).toContain("--giants-online");
  });
});

describe("flag checks", () => {
  it("refuses --without, --giants-online and --giants-timeout without --giants", async () => {
    for (const args of [["--without", "trivy"], ["--giants-online"], ["--giants-timeout", "10"]]) {
      const r = await cli(["--repo", quietRepo(), ...args]);
      expect(r.code, args.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/applies with --giants or --with/);
    }
  });

  it("needs --repo or a URL, a known tool, and a sane timeout", async () => {
    expect((await cli(["--giants", "--sbom", join(base, "s.json")])).stderr).toMatch(/--giants needs --repo/);
    expect((await cli(["--repo", quietRepo(), "--with", "burp"])).stderr).toMatch(/unknown tool burp/);
    expect((await cli(["--repo", quietRepo(), "--giants", "--giants-timeout", "abc"])).stderr).toMatch(/--giants-timeout must be/);
  });
});

describe("a repo scan with --giants", () => {
  it("other tools' high findings make the exit code 1", async () => {
    const repo = quietRepo();
    fakeGiants(bin, ["osv-scanner"], { root: repo });
    const r = await cli(["--repo", repo, "--giants"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Coverage by area/);
    expect(r.stdout).toMatch(/Dependencies\s+covered\s+Penthera: run penthera deps, osv-scanner 2\.6\.0/);
    // Penthera's own secret rules ran, so the area is covered; a missing tool is
    // "not installed" with its install hint, and never "Running".
    expect(r.stdout).toMatch(/Secrets\s+covered\s+Penthera \(\d+ files?\), gitleaks: not installed/);
    expect(r.stdout).toMatch(/gitleaks: not installed, install: /);
    expect(r.stdout + r.stderr).not.toMatch(/Running gitleaks/);
    expect(r.stdout + r.stderr).toMatch(/Running osv-scanner/);
    expect(r.stdout).toMatch(/Also reported by other tools/);
    expect(r.stdout).toMatch(/and from other tools: /);
  });

  it("giants.failOn: never reports them without gating", async () => {
    const repo = quietRepo({ giants: { failOn: "never" } });
    fakeGiants(bin, ["osv-scanner"], { root: repo });
    const r = await cli(["--repo", repo, "--giants"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/not counted toward the exit code/);
  });

  it("exits 2 when a tool the policy requires did not run", async () => {
    const repo = quietRepo({ giants: { require: ["gitleaks"], failOn: "never" } });
    const r = await cli(["--repo", repo, "--giants"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/requires gitleaks, which did not run/);
  });

  it("with no tools installed, no area is covered by another tool and the scan exits 0", async () => {
    const r = await cli(["--repo", quietRepo(), "--giants", "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.giants.areas.every((a) => a.status === "not covered")).toBe(true);
    // `status` is other tools only; what Penthera's own scan read is kept apart.
    expect(out.giants.areas.find((a) => a.id === "secrets").pentheraRead).toMatchObject({ read: true });
    expect(out.giants.areas.find((a) => a.id === "dependencies").pentheraRead).toEqual({ read: false, text: "run penthera deps" });
  });

  it("writes JSON, Markdown, one SARIF run per tool and the raw output in the evidence bundle, with no secret in any of them", async () => {
    const repo = writeTarget(join(base, "target"));
    fakeGiants(bin, ["gitleaks", "trufflehog", "osv-scanner", "checkov"], { root: repo, unmask: true });
    const ev = join(base, "ev");
    const r = await cli(["--repo", repo, "--giants", "-o", join(base, "r.json"), "--sarif", join(base, "r.sarif"), "--evidence", ev]);
    expect(r.code).toBe(1);
    const json = JSON.parse(readFileSync(join(base, "r.json"), "utf-8"));
    expect(json.giants.tools.filter((t) => t.status === "ran").map((t) => t.id)).toEqual(["gitleaks", "trufflehog", "osv-scanner", "checkov"]);
    const aws = json.findings.find((f) => f.title.startsWith("AWS access key"));
    expect(aws.foundBy).toEqual(["penthera", "gitleaks", "trufflehog"]);
    const sarif = JSON.parse(readFileSync(join(base, "r.sarif"), "utf-8"));
    // One run per tool that ran, even when all its findings were folded into Penthera's (TruffleHog here).
    expect(sarif.runs.map((x) => x.tool.driver.name)).toEqual(["penthera", "gitleaks", "trufflehog", "osv-scanner", "checkov"]);
    const osv = sarif.runs[3];
    expect(osv.tool.driver.version).toBe(fixture("osv-scanner").version);
    expect(osv.results.length).toBeGreaterThan(0);
    expect(osv.invocations[0].commandLine).toMatch(/^osv-scanner scan source/);
    expect(sarif.runs[0].results.find((x) => x.properties.foundBy?.includes("trufflehog"))).toBeTruthy();
    const md = readFileSync(join(base, "r.md"), "utf-8");
    expect(md).toContain("## Other tools (--giants)");
    expect(md).toMatch(/\| Secrets \| secret rules \(read \d+ files?\) \| gitleaks 8\.30\.1/);
    expect(md).toContain("found by Penthera, gitleaks, trufflehog");
    const manifest = JSON.parse(readFileSync(join(ev, "manifest.json"), "utf-8"));
    expect(manifest.artifacts.filter((a) => a.path.startsWith("giants/")).map((a) => a.path).sort()).toEqual(["giants/checkov.txt", "giants/gitleaks.txt", "giants/osv-scanner.txt", "giants/trufflehog.txt"]);
    for (const file of [join(base, "r.json"), join(base, "r.md"), join(base, "r.sarif"), join(ev, "giants", "trufflehog.txt")]) {
      const text = readFileSync(file, "utf-8");
      for (const s of [TARGET_SECRETS.AWS_KEY_ID, TARGET_SECRETS.AWS_SECRET, TARGET_SECRETS.API_KEY]) expect(text, file).not.toContain(s);
    }
    expect((await cli(["evidence", "verify", ev])).code).toBe(0);
  });

  it("CodeQL runs only with --with codeql, after the licence notice", async () => {
    const repo = writeTarget(join(base, "target"));
    const { version, meta, outputs } = fixture("codeql");
    fakeTool(bin, "codeql", { version, reportFlag: "--output", report: replay(outputs[0], meta, repo) });
    const plain = await cli(["--repo", repo, "--giants", "--json"]);
    expect(JSON.parse(plain.stdout).giants.tools.find((t) => t.id === "codeql").status).toBe("skipped");
    expect(plain.stderr).not.toMatch(/CodeQL: its terms/);
    const r = await cli(["--repo", repo, "--with", "codeql", "--json"]);
    expect(r.stderr).toMatch(/CodeQL: its terms allow academic research and the analysis of open-source code/);
    const out = JSON.parse(r.stdout);
    expect(out.giants.tools.find((t) => t.id === "codeql")).toMatchObject({ status: "ran", findings: 3 });
    expect(existsSync(join(repo, "codeql-db"))).toBe(false);
  });
});
