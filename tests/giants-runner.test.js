/**
 * --giants runner safety (spec-giants.md, "Running another program safely"):
 * PATH resolution outside the scanned project, no shell, timeout, output cap,
 * minimal environment, network sandbox.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { resolveTool, runTool, minimalEnv, detectSandbox, displayCommand, wrapOffline, OFFLINE_PROFILE } from "../lib/giants/runner.js";
import { fakeTool } from "./helpers/giants-fakes.js";

const NODE_DIR = dirname(process.execPath);
let base;
beforeEach(() => { base = realpathSync(mkdtempSync(join(tmpdir(), "penthera-giants-run-"))); });
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("resolveTool", () => {
  it("refuses a gitleaks planted inside the scanned repository and uses the one outside", () => {
    const repo = join(base, "repo");
    const planted = fakeTool(join(repo, "node_modules", ".bin"), "gitleaks");
    const good = fakeTool(join(base, "tools"), "gitleaks");
    const r = resolveTool(["gitleaks"], { root: repo, cwd: base, pathEnv: [join(repo, "node_modules", ".bin"), join(base, "tools")].join(delimiter), home: join(base, "home") });
    expect(r.path).toBe(good);
    expect(r.refused).toEqual([{ path: planted, reason: "inside the scanned repository" }]);
  });

  it("refuses when the only match is inside the repository", () => {
    const repo = join(base, "repo");
    fakeTool(join(repo, "bin"), "trivy");
    const r = resolveTool(["trivy"], { root: repo, cwd: base, pathEnv: join(repo, "bin"), home: join(base, "home") });
    expect(r.path).toBeNull();
    expect(r.refused[0].reason).toBe("inside the scanned repository");
  });

  it("refuses a symlink on PATH that points into the repository", () => {
    const repo = join(base, "repo");
    const inside = fakeTool(join(repo, "bin"), "semgrep");
    mkdirSync(join(base, "tools"));
    symlinkSync(inside, join(base, "tools", "semgrep"));
    const r = resolveTool(["semgrep"], { root: repo, cwd: base, pathEnv: join(base, "tools"), home: join(base, "home") });
    expect(r.path).toBeNull();
    expect(r.refused[0].reason).toBe("inside the scanned repository");
  });

  it("never uses a relative PATH entry, and refuses entries inside the current directory", () => {
    const cwd = join(base, "work");
    fakeTool(join(cwd, "bin"), "checkov");
    const rel = resolveTool(["checkov"], { root: null, cwd, pathEnv: "bin", home: join(base, "home") });
    expect(rel.path).toBeNull();
    expect(rel.refused[0].reason).toMatch(/relative PATH entry/);
    const abs = resolveTool(["checkov"], { root: null, cwd, pathEnv: join(cwd, "bin"), home: join(base, "home") });
    expect(abs.path).toBeNull();
    expect(abs.refused[0].reason).toBe("inside the current directory");
  });

  it("allows ~/.local/bin when the current directory holds the home folder", () => {
    const home = join(base, "home");
    const tool = fakeTool(join(home, ".local", "bin"), "nuclei");
    const r = resolveTool(["nuclei"], { root: null, cwd: base, pathEnv: join(home, ".local", "bin"), home });
    expect(r.path).toBe(tool);
  });

  it("reports nothing found as path null with no refusals", () => {
    expect(resolveTool(["gitleaks"], { root: base, cwd: base, pathEnv: join(base, "empty"), home: base })).toEqual({ path: null, refused: [] });
  });
});

describe("runTool", () => {
  const env = () => minimalEnv({ tmp: base, from: { PATH: `${NODE_DIR}${delimiter}/usr/bin${delimiter}/bin` } });

  it("passes arguments as an array: a file name with shell syntax is not run", async () => {
    const tool = fakeTool(join(base, "t"), "echoargs", { marker: join(base, "marker.json") });
    const evil = `$(touch ${join(base, "pwned")}); touch ${join(base, "pwned2")}`;
    const r = await runTool({ cmd: tool, args: ["scan", evil], cwd: base, env: env(), network: "allow" });
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(base, "marker.json"), "utf-8")).args).toEqual(["scan", evil]);
    expect(existsSync(join(base, "pwned"))).toBe(false);
    expect(existsSync(join(base, "pwned2"))).toBe(false);
  });

  it("stops a tool that runs past its timeout", async () => {
    const tool = fakeTool(join(base, "t"), "sleepy", { sleepMs: 60_000 });
    const r = await runTool({ cmd: tool, args: ["scan"], cwd: base, env: env(), timeoutMs: 300, network: "allow" });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
  });

  it("stops a tool that floods its output past the cap", async () => {
    const tool = fakeTool(join(base, "t"), "flood", { floodBytes: 4 * 1024 * 1024 });
    const r = await runTool({ cmd: tool, args: ["scan"], cwd: base, env: env(), maxBytes: 256 * 1024, network: "allow" });
    expect(r.overflow).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(256 * 1024);
  });

  it("gives the tool a minimal environment: no tokens from Penthera's own", async () => {
    const tool = fakeTool(join(base, "t"), "envdump", { marker: join(base, "env.json") });
    const e = minimalEnv({ tmp: base, extra: { SEMGREP_SEND_METRICS: "off" }, from: { PATH: process.env.PATH, HOME: "/home/me", GITHUB_TOKEN: "ghs_x", AWS_SECRET_ACCESS_KEY: "y", NPM_TOKEN: "z", LANG: "C", XDG_CACHE_HOME: "/c" } });
    expect(e).toEqual({ PATH: process.env.PATH, HOME: base, TMPDIR: base, LANG: "C", XDG_CACHE_HOME: "/c", SEMGREP_SEND_METRICS: "off" });
    await runTool({ cmd: tool, args: ["scan"], cwd: base, env: e, network: "allow" });
    const seen = JSON.parse(readFileSync(join(base, "env.json"), "utf-8")).env;
    for (const k of ["GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "NPM_TOKEN"]) expect(seen).not.toContain(k);
    expect(minimalEnv({ tmp: base, keepHome: true, from: { PATH: "/x", HOME: "/home/me" } }).HOME).toBe("/home/me");
  });

  it("reports a binary that cannot start instead of throwing", async () => {
    const r = await runTool({ cmd: join(base, "missing"), args: [], cwd: base, env: env(), network: "allow" });
    expect(r.error).toBeTruthy();
  });

  const sandbox = detectSandbox();
  it.skipIf(!sandbox)("denies the network to an offline tool (sandbox)", async () => {
    const server = createServer((_, res) => res.end("ok"));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    try {
      const probe = join(base, "probe.mjs");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(probe, `fetch("http://127.0.0.1:${port}/").then(() => { console.log("reached"); }, (e) => { console.log("blocked"); });`);
      const denied = await runTool({ cmd: process.execPath, args: [probe], cwd: base, env: env(), network: "deny", sandbox, timeoutMs: 15_000 });
      expect(denied.networkDenied).toBe(true);
      expect(denied.stdout.trim()).toBe("blocked");
      const open = await runTool({ cmd: process.execPath, args: [probe], cwd: base, env: env(), network: "allow", sandbox, timeoutMs: 15_000 });
      expect(open.stdout.trim()).toBe("reached");
    } finally {
      server.close();
    }
  });
});

describe("helpers", () => {
  it("shows a command line with the root and temp folder as placeholders", () => {
    expect(displayCommand("gitleaks", ["dir", "/r/app", "--report-path", "/t/x/gitleaks.sarif", "a b"], { root: "/r/app", tmp: "/t/x" }))
      .toBe('gitleaks dir <root> --report-path <tmp>/gitleaks.sarif "a b"');
  });

  it("wraps a command for sandbox-exec and bwrap, and leaves it alone without a sandbox", () => {
    expect(wrapOffline("sandbox-exec", "/bin/t", ["a"])).toEqual({ cmd: "/usr/bin/sandbox-exec", args: ["-p", OFFLINE_PROFILE, "/bin/t", "a"] });
    expect(wrapOffline("bwrap", "/bin/t", ["a"]).args).toContain("--unshare-net");
    expect(wrapOffline(null, "/bin/t", ["a"])).toEqual({ cmd: "/bin/t", args: ["a"] });
  });
});
