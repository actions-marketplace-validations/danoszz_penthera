/**
 * Two first-run bugs. A key in test/fixtures printed "Nothing to fix" and
 * exited 1, so the verdict and the exit code disagreed. And --help printed
 * escape codes into a pipe, even with NO_COLOR. Repos are temp dirs.
 */
import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildBrief, exitCodeOf, formatBrief, VERDICTS } from "../src/report/brief.js";

const BIN = fileURLToPath(new URL("../bin/penthera.js", import.meta.url));
// Built from parts so this file holds no key-shaped string.
const KEY = ["sk", "live", "a1B2c3D4".repeat(3)].join("_");
const f = (over) => ({ severity: "high", confidence: "likely", category: "secrets", title: "Secret", url: "src/a.js", ...over });

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function tmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function repoWith(files) {
  const repo = tmp("pk-verdict-repo-");
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
  return repo;
}

function run(args, env = {}, nodeArgs = []) {
  const home = tmp("pk-verdict-home-");
  const full = { ...process.env, HOME: home, NO_COLOR: "1", ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete full[k];
  const child = spawn(process.execPath, [...nodeArgs, BIN, ...args], { cwd: home, env: full, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  return new Promise((r) => child.on("close", (code) => r({ code, out, err })));
}

describe("verdict and exit code on a real scan", () => {
  const scan = (repo) => run(["--repo", repo, "--offline", "--brief"]);

  it("fails a key in test fixtures, keeps it as likely noise, and says why", async () => {
    const { code, out } = await scan(repoWith({ "test/fixtures/stripe.js": `const key = "${KEY}";\n` }));
    expect(code).toBe(1);
    expect(out).toContain("**Penthera: Review.**");
    expect(out).not.toContain("Nothing to fix");
    expect(out).toContain("The CLI exits 1 on this: 1 critical or high finding sits outside Act on.");
    expect(out).toMatch(/### Likely noise[\s\S]*Stripe secret key[\s\S]*\(1 critical or high\)/);
  }, 30_000);

  it("says Fix now for the same key in source", async () => {
    const { code, out } = await scan(repoWith({ "src/stripe.js": `const key = "${KEY}";\n` }));
    expect(code).toBe(1);
    expect(out).toContain("**Penthera: Fix now.**");
    expect(out).not.toContain("The CLI exits");
  }, 30_000);

  it("says Nothing to fix and exits 0 on a clean repo", async () => {
    const { code, out } = await scan(repoWith({ "src/a.js": "export const a = 1;\n" }));
    expect(code).toBe(0);
    expect(out).toContain("**Penthera: Nothing to fix.**");
    expect(out).not.toContain("The CLI exits");
  }, 30_000);
});

describe("verdict and exit code on every severity and place", () => {
  const places = [{}, { url: "test/fixtures/a.js" }, { url: "dist/a.js" }, { localOnly: true }, { confidence: "potential" }, { category: "dependency-risk" }];
  const cases = ["critical", "high", "medium", "low", "info"].flatMap((severity) => places.map((p) => f({ severity, ...p })));

  it.each(cases.map((c) => [`${c.severity} ${c.url} ${c.confidence} ${c.category} ${!!c.localOnly}`, c]))("agree: %s", (_, finding) => {
    const result = { mode: "repo", findings: [finding] };
    const b = buildBrief(result);
    const severe = finding.severity === "critical" || finding.severity === "high";
    expect(exitCodeOf(result)).toBe(severe ? 1 : 0);
    expect(b.exit_code).toBe(severe ? 1 : 0);
    if (severe) expect(b.verdict).not.toBe(VERDICTS.clean);
  });

  it("stays Nothing to fix for noise below high", () => {
    const b = buildBrief({ findings: [f({ severity: "medium", url: "test/fixtures/a.js" })] });
    expect(b.verdict).toBe(VERDICTS.clean);
    expect(b.exit_reason).toBeNull();
    expect(formatBrief(b)).not.toContain("critical or high");
  });

  it("counts every failing finding, and only those", () => {
    const b = buildBrief({ findings: [f({ url: "test/fixtures/a.js" }), f({ url: "dist/b.js", severity: "critical" }), f({ url: "test/fixtures/c.js", severity: "low" })] });
    expect(b.exit_reason).toBe("The CLI exits 1 on this: 2 critical or high findings sit outside Act on. Fix them, or write down why you accept them.");
    expect(b.likely_noise.map((n) => n.severe).reduce((a, n) => a + n, 0)).toBe(2);
  });

  it("agrees across merged reports", () => {
    expect(buildBrief([{ findings: [] }, { findings: [f({ url: "test/fixtures/a.js" })] }]).exit_code).toBe(1);
    expect(buildBrief([{ findings: [] }, { findings: [f({ url: "test/fixtures/a.js" })] }]).verdict).toBe(VERDICTS.review);
    expect(buildBrief([]).exit_code).toBe(0);
  });
});

describe("verdict and exit code with other tools", () => {
  const giants = (over) => ({ findings: [], giants: { findings: [{ severity: "high", title: "x" }], ...over } });

  it("says Review when only another tool's finding fails the run", () => {
    const b = buildBrief(giants({}));
    expect(b).toMatchObject({ verdict: VERDICTS.review, exit_code: 1 });
    expect(b.exit_reason).toContain("1 critical or high finding sits");
  });

  it("adds other tools' findings to the count", () => {
    expect(buildBrief({ ...giants({}), findings: [f({ url: "test/fixtures/a.js" })] }).exit_reason).toContain("2 critical or high findings sit");
  });

  it("counts only other tools' critical and high findings", () => {
    const result = { findings: [], giants: { findings: [{ severity: "high" }, { severity: "medium" }] } };
    expect(buildBrief(result).exit_reason).toContain("1 critical or high finding sits");
  });

  it("leaves it out when the policy says failOn: never", () => {
    const b = buildBrief(giants({ failOn: "never" }));
    expect(b).toMatchObject({ verdict: VERDICTS.clean, exit_code: 0, exit_reason: null });
  });

  it("ignores other tools' findings below high", () => {
    expect(buildBrief({ findings: [], giants: { findings: [{ severity: "medium" }] } }).verdict).toBe(VERDICTS.clean);
  });

  it("says exit 2 and names the tool when a required tool did not run", () => {
    const b = buildBrief({ findings: [], giants: { findings: [], requiredNotRun: ["gitleaks"] } });
    expect(b).toMatchObject({ verdict: VERDICTS.review, exit_code: 2 });
    expect(b.exit_reason).toBe("The CLI exits 2 on this: the policy requires gitleaks, which did not run.");
    expect(exitCodeOf({ findings: [f()], giants: { requiredNotRun: ["gitleaks"] } })).toBe(2);
  });

  it("gives exit 2 the last word across merged reports", () => {
    expect(buildBrief([{ findings: [f()] }, { findings: [], giants: { requiredNotRun: ["trivy"] } }]).exit_code).toBe(2);
  });
});

describe("--help styling", () => {
  const ESC = "\x1b[";
  const forceTty = () => {
    const file = join(tmp("pk-verdict-tty-"), "tty.cjs");
    writeFileSync(file, 'Object.defineProperty(process.stdout, "isTTY", { value: true });\n');
    return ["--require", file];
  };

  it.each([["--help", "1"], ["-h", "1"], ["--help", undefined], ["-h", undefined]])("prints plain text into a pipe: %s, NO_COLOR=%s", async (flag, NO_COLOR) => {
    const { code, out, err } = await run([flag], { NO_COLOR });
    expect(code).toBe(0);
    expect(out).toContain("Usage");
    expect(out + err).not.toContain(ESC);
  }, 30_000);

  it("styles a terminal", async () => {
    const { out } = await run(["--help"], { NO_COLOR: undefined }, forceTty());
    expect(out).toContain(`${ESC}1mpenthera${ESC}0m`);
    expect(out).toContain(`${ESC}2mUsage${ESC}0m`);
  }, 30_000);

  it("honors NO_COLOR on a terminal", async () => {
    const { out } = await run(["--help"], { NO_COLOR: "1" }, forceTty());
    expect(out).toContain("Usage");
    expect(out).not.toContain(ESC);
  }, 30_000);

  it("treats an empty NO_COLOR as unset, as the convention says", async () => {
    expect((await run(["--help"], { NO_COLOR: "" }, forceTty())).out).toContain(ESC);
  }, 30_000);
});
