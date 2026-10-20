/**
 * `penthera install`: the install firewall.
 *
 * Integration tests run real npm against a fixture registry on 127.0.0.1
 * (tests/fixtures/install/registry.js). npm's proxy points at a closed port
 * with only 127.0.0.1 exempt, so nothing here can reach the public registry.
 * `color-helper@1.1.0` gains a postinstall that writes a marker file: the
 * marker existing means the script ran.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, mkdirSync, chmodSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { startRegistry, installPackages, npmEnv, createProject } from "./fixtures/install/registry.js";
import { normalizePolicy, loadPolicy, matchAllow, evaluatePolicy, DEFAULT_POLICY } from "../lib/install/policy.js";
import { changesFromDiff, withAllowScripts, nonRegistryPackages, planInstall, applyInstall } from "../lib/install/index.js";

const BIN = join(import.meta.dirname, "..", "bin", "penthera.js");

// ── Policy ────────────────────────────────────────────────────────────────

describe("policy", () => {
  it("defaults require approval for new install scripts and the known-bad capabilities", () => {
    const p = normalizePolicy({});
    expect(p.requireApproval).toEqual(expect.arrayContaining(["install-scripts", "ai-config-write", "ai-cli-invoke", "token-harvest", "obfuscated"]));
    expect(p.allow).toEqual([]);
    expect(p.deny).toEqual([]);
  });

  it("a field given replaces the default, a field left out keeps it", () => {
    const p = normalizePolicy({ deny: ["shell"] });
    expect(p.deny).toEqual(["shell"]);
    expect(p.requireApproval).toEqual(DEFAULT_POLICY.requireApproval);
    expect(normalizePolicy({ requireApproval: [] }).requireApproval).toEqual([]);
  });

  it("rejects unknown capabilities, unknown fields and bad shapes", () => {
    expect(() => normalizePolicy({ deny: ["telepathy"] })).toThrow(/unknown capability.*telepathy/);
    expect(() => normalizePolicy({ alow: [] })).toThrow(/unknown field/);
    expect(() => normalizePolicy({ allow: "x" })).toThrow(/array/);
    expect(() => normalizePolicy([])).toThrow(/object/);
  });

  it("matches allow entries by name, glob and pinned version", () => {
    const allow = ["esbuild", "@acme/*", "sharp@0.33.5"];
    expect(matchAllow(allow, "esbuild", "1.0.0")).toBe("esbuild");
    expect(matchAllow(allow, "@acme/ui", "2.0.0")).toBe("@acme/*");
    expect(matchAllow(allow, "@acmex/ui", "2.0.0")).toBe(null);
    expect(matchAllow(allow, "sharp", "0.33.5")).toBe("sharp@0.33.5");
    expect(matchAllow(allow, "sharp", "0.34.0")).toBe(null);
    expect(matchAllow(["a.b"], "aXb", "1.0.0")).toBe(null); // dots are literal
  });

  it("deny beats requireApproval, and allow overrides both", () => {
    const policy = normalizePolicy({ deny: ["network"], allow: ["trusted"] });
    const v = evaluatePolicy([
      { name: "bad", version: "1.0.0", flags: ["network", "install-scripts"] },
      { name: "trusted", version: "1.0.0", flags: ["network", "install-scripts"] },
      { name: "plain", version: "1.0.0", flags: ["env"] },
    ], policy);
    expect(v.denied.map((i) => i.name)).toEqual(["bad"]);
    expect(v.items[0]).toMatchObject({ deny: ["network"], approval: ["install-scripts"] });
    expect(v.items[1]).toMatchObject({ allowedBy: "trusted", deny: [], approval: [] });
    expect(v.clean).toBe(false);
    expect(evaluatePolicy([v.items[1], v.items[2]], policy).clean).toBe(true);
  });

  it("loads penthera.policy.json from the project, and errors on a missing --policy", () => {
    const d = mkdtempSync(join(tmpdir(), "penthera-policy-"));
    try {
      expect(loadPolicy(d).path).toBe(null);
      writeFileSync(join(d, "penthera.policy.json"), JSON.stringify({ allow: ["x"] }));
      expect(loadPolicy(d).policy.allow).toEqual(["x"]);
      expect(() => loadPolicy(d, join(d, "nope.json"))).toThrow(/not found/);
      writeFileSync(join(d, "bad.json"), "{");
      expect(() => loadPolicy(d, join(d, "bad.json"))).toThrow(/bad\.json/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("policy floors (360 review)", () => {
  it("always denies script-mismatch and always holds unscanned, whatever the policy or allow list says", () => {
    const lax = normalizePolicy({ allow: ["*"], deny: [], requireApproval: [] });
    const v = evaluatePolicy([
      { name: "liar", version: "1.0.0", flags: ["script-mismatch"] },
      { name: "ghost", version: "1.0.0", flags: ["unscanned"] },
      { name: "fine", version: "1.0.0", flags: ["network"] },
    ], lax);
    expect(v.denied.map((i) => i.name)).toEqual(["liar"]);
    expect(v.needsApproval.map((i) => i.name)).toEqual(["ghost"]);
    expect(v.clean).toBe(false);
    // A policy may still escalate unscanned to a denial.
    const strict = normalizePolicy({ deny: ["unscanned"] });
    expect(evaluatePolicy([{ name: "ghost", version: "1.0.0", flags: ["unscanned"] }], strict).denied).toHaveLength(1);
  });
});

describe("non-registry sources (360 review)", () => {
  const reg = ["https://registry.npmjs.org/", "https://npm.acme.test/"];
  it("lists lockfile entries resolved outside the configured registries", () => {
    const pkgs = [
      { name: "ok", resolved: "https://registry.npmjs.org/ok/-/ok-1.0.0.tgz" },
      { name: "scoped", resolved: "https://npm.acme.test/@acme/x/-/x-1.0.0.tgz" },
      { name: "bundled", resolved: null },
      { name: "gitdep", resolved: "git+ssh://git@github.com/x/y.git#abc" },
      { name: "url", resolved: "https://evil.example/x.tgz" },
    ];
    expect(nonRegistryPackages(pkgs, reg).map((p) => p.name)).toEqual(["gitdep", "url"]);
  });

  it("refuses git, hosted-git and tarball-URL specs unless --allow-non-registry is passed", async () => {
    const d = mkdtempSync(join(tmpdir(), "penthera-spec-"));
    try {
      writeFileSync(join(d, "package.json"), '{"name":"x","version":"1.0.0"}');
      const info = { version: "10.0.0", major: 10, registry: reg[0], registries: reg };
      for (const spec of ["github:evil/pkg", "evil/pkg", "git+https://example.test/x.git", "https://example.test/x.tgz", "x@git+ssh://git@example.test/x.git"]) {
        await expect(planInstall(d, [spec], { info }), spec).rejects.toThrow(/Non-registry package spec/);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

/**
 * A stand-in npm on PATH that records its arguments and plays just enough of
 * npm for planInstall/applyInstall: `install --package-lock-only` writes the
 * given lockfile. Lets the tests see exactly which npm commands run.
 */
function fakeNpm(root, lock) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(root, "npm-calls.jsonl");
  const script = join(root, "fake-npm.mjs");
  writeFileSync(script, `
import { appendFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "--version") console.log("10.9.0");
else if (args[0] === "config") console.log(JSON.stringify({ registry: "https://registry.npmjs.org/" }));
else if (args[0] === "install" && args.includes("--package-lock-only")) writeFileSync("package-lock.json", ${JSON.stringify(JSON.stringify(lock))});
`);
  writeFileSync(join(bin, "npm"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`);
  chmodSync(join(bin, "npm"), 0o755);
  return { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, npm_config_cache: join(root, "cache") }, calls: () => readFileSync(log, "utf-8").trim().split("\n").map((l) => JSON.parse(l)) };
}

describe.skipIf(process.platform === "win32")("npm invocations (360 review)", () => {
  const lockWith = (resolved) => ({
    lockfileVersion: 3,
    packages: {
      "": { name: "x", version: "1.0.0", dependencies: { dep: "1.0.0" } },
      "node_modules/dep": { version: "1.0.0", resolved, integrity: "sha512-AAAA" },
    },
  });

  it("fetches with npm cache add --ignore-scripts", async () => {
    const d = mkdtempSync(join(tmpdir(), "penthera-fakenpm-"));
    try {
      writeFileSync(join(d, "package.json"), '{"name":"x","version":"1.0.0"}');
      const npm = fakeNpm(d, lockWith("https://registry.npmjs.org/dep/-/dep-1.0.0.tgz"));
      await planInstall(d, ["dep@1.0.0"], { env: npm.env });
      const add = npm.calls().find((a) => a[0] === "cache");
      expect(add).toBeTruthy();
      expect(add).toContain("--ignore-scripts");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("refuses a resolved tree with a package from outside the registry before fetching anything", async () => {
    const d = mkdtempSync(join(tmpdir(), "penthera-fakenpm-"));
    try {
      writeFileSync(join(d, "package.json"), '{"name":"x","version":"1.0.0"}');
      const npm = fakeNpm(d, lockWith("https://evil.example/dep.tgz"));
      await expect(planInstall(d, ["dep@1.0.0"], { env: npm.env })).rejects.toThrow(/outside the configured registry/);
      expect(npm.calls().some((a) => a[0] === "cache")).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("applies with npm ci, which installs the reviewed lockfile and cannot re-resolve", async () => {
    const d = mkdtempSync(join(tmpdir(), "penthera-fakenpm-"));
    try {
      const npm = fakeNpm(d, {});
      const lock = Buffer.from(JSON.stringify(lockWith("https://registry.npmjs.org/dep/-/dep-1.0.0.tgz")));
      const plan = {
        root: d, lockName: "package-lock.json", original: {}, npm: { allowScriptsPolicy: false },
        proposed: { "package.json": Buffer.from('{"name":"x","version":"1.0.0"}'), "package-lock.json": lock },
        verdict: { items: [] },
      };
      const r = await applyInstall(plan, { runScripts: false, env: npm.env });
      expect(r.args[0]).toBe("ci");
      expect(npm.calls().map((a) => a[0])).toEqual(["ci"]);
      expect(npm.calls()[0]).toContain("--ignore-scripts");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("changesFromDiff", () => {
  it("flags new hooks, changed hook commands, typosquats and unreadable packages", () => {
    const diff = {
      added: [
        { name: "a", version: "1.0.0", capabilities: ["install-scripts", "network"], installScripts: { postinstall: "node x.js" } },
        { name: "expresss", version: "1.0.0", capabilities: [], installScripts: {} },
        { name: "ghost", version: "1.0.0", capabilities: null, installScripts: undefined },
      ],
      upgraded: [
        { name: "b", from: "1.0.0", to: "1.1.0", gained: [], unavailable: null, installScripts: { install: "node evil.js" }, previousInstallScripts: { install: "node-gyp rebuild" } },
        { name: "c", from: "1.0.0", to: "1.1.0", gained: [], unavailable: null, installScripts: { install: "node-gyp rebuild" }, previousInstallScripts: { install: "node-gyp rebuild" } },
        { name: "d", from: "1.0.0", to: "2.0.0", gained: null, unavailable: "old", installScripts: {}, previousInstallScripts: null },
      ],
    };
    const packages = [{ name: "d", version: "2.0.0", capabilities: { shell: {} } }];
    const byName = Object.fromEntries(changesFromDiff(diff, [{ name: "expresss", target: "express" }], packages).map((c) => [c.name, c]));
    expect(byName.a.flags).toEqual(["install-scripts", "network"]);
    expect(byName.expresss).toMatchObject({ flags: ["typosquat"], typosquatOf: "express" });
    expect(byName.ghost.flags).toEqual(["unscanned"]);
    expect(byName.b.flags).toEqual(["install-scripts"]);
    expect(byName.c.flags).toEqual([]);
    // Old version unreadable: judged on everything the new one can do.
    expect(byName.d).toMatchObject({ flags: ["shell"], compared: false });
  });

  it("flags a lockfile install script the scan did not find, and packages whose tarball was unreadable (360 review)", () => {
    const diff = {
      added: [
        { name: "liar", version: "1.0.0", capabilities: [], installScripts: {}, scriptMismatch: true },
        { name: "broken", version: "1.0.0", capabilities: null, installScripts: {}, unscanned: "tarball could not be read safely (bad header checksum at byte 0)" },
      ],
      upgraded: [
        { name: "up", from: "1.0.0", to: "1.1.0", gained: null, unavailable: "new", installScripts: {}, unscanned: "package.json is missing" },
      ],
    };
    const byName = Object.fromEntries(changesFromDiff(diff).map((c) => [c.name, c]));
    expect(byName.liar.flags).toEqual(["script-mismatch"]);
    expect(byName.broken).toMatchObject({ flags: ["unscanned"], unscanned: expect.stringMatching(/checksum/) });
    expect(byName.up.flags).toEqual(["unscanned"]);
  });

  it("pins approvals in allowScripts, keeps indentation and explicit denials", () => {
    const src = Buffer.from('{\n    "name": "x",\n    "allowScripts": { "no": false }\n}\n');
    const out = withAllowScripts(src, [{ name: "a", version: "1.0.0" }, { name: "no", version: "2.0.0" }]).toString();
    expect(JSON.parse(out).allowScripts).toEqual({ "a@1.0.0": true, no: false });
    expect(out).toMatch(/^\{\n {4}"name"/);
    expect(out.endsWith("}\n")).toBe(true);
  });
});

// ── End to end, real npm, fixture registry ────────────────────────────────

let dir;
let reg;
let env;
let marker;
let template;

/** Run the CLI without blocking the event loop (the registry lives in this process). */
function penthera(cwd, args, input = "") {
  return new Promise((res) => {
    const child = spawn(process.execPath, [BIN, "install", ...args], { cwd, env: { ...env, NO_COLOR: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => res({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

/** sha256 of every file under dir (node_modules included), by relative path. */
function snapshot(root) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(root, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(root);
  return out;
}

/**
 * Packages whose payload sits where a capped scanner would not look: behind
 * 9 MB of padding, last of 5,001 files, or in a file too large to scan.
 */
function unreadCodePackages() {
  const j = (...s) => s.join("");
  const gh = `const { execSync } = require('${j("child", "_process")}');\nconst t = execSync('${j("gh auth ", "tok", "en")}');\n`;
  const many = {};
  for (let i = 0; i < 5000; i++) many[`a/f${String(i).padStart(4, "0")}.js`] = "module.exports = 1;\n";
  many["zz/index.js"] = gh;
  return {
    "padded-pkg@1.0.0": { "index.js": `/*${" ".repeat(9 * 1024 * 1024)}*/\n${gh}` },
    "many-files@1.0.0": many,
    "huge-pkg@1.0.0": { "index.js": `${" ".repeat(64 * 1024 * 1024)}\n${gh}` },
  };
}

let n = 0;
/** A fresh copy of the base project: tiny-format@1.0.0 and color-helper@1.0.0, installed. */
function project(policy = null) {
  const p = join(dir, `p${++n}`);
  cpSync(template, p, { recursive: true });
  if (policy) writeFileSync(join(p, "penthera.policy.json"), JSON.stringify(policy, null, 2));
  return p;
}
const installed = (p, name) => JSON.parse(readFileSync(join(p, "node_modules", name, "package.json"), "utf-8")).version;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "penthera-install-test-"));
  marker = join(dir, "POSTINSTALL_RAN");
  reg = await startRegistry({ ...installPackages(marker), ...unreadCodePackages() });
  env = npmEnv(reg.url, join(dir, "npm"));
  template = await createProject(join(dir, "template"), { "tiny-format": "1.0.0", "color-helper": "1.0.0" }, env);
});

afterAll(async () => {
  await reg?.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => rmSync(marker, { force: true }));

describe("penthera install (fixture registry)", () => {
  it("stops a package that gains a postinstall script before the script runs (--yes)", async () => {
    const p = project();
    const before = snapshot(p);
    const r = await penthera(p, ["color-helper@1.1.0", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("color-helper 1.0.0 → 1.1.0");
    expect(r.stdout).toContain("postinstall: node postinstall.js");
    expect(r.stdout).toMatch(/needs approval: install script/);
    expect(r.stdout).toContain("Project untouched");
    expect(r.stdout).toMatch(/npm contacts http:\/\/127\.0\.0\.1:\d+\/ .*only egress/);
    expect(existsSync(marker)).toBe(false);
    expect(snapshot(p)).toEqual(before);
    // npm did fetch the new tarball (into a private cache), it just never ran it.
    expect(reg.requests).toContain("GET /color-helper/-/color-helper-1.1.0.tgz");
  });

  it("leaves the project byte-identical when the prompt is declined or unanswered", async () => {
    const p = project();
    const before = snapshot(p);
    for (const input of ["n\n", ""]) {
      const r = await penthera(p, ["color-helper@1.1.0"], input);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("Aborted. Project untouched.");
      expect(existsSync(marker)).toBe(false);
      expect(snapshot(p)).toEqual(before);
    }
  });

  it("runs the script once approved (the marker proves the block above was real)", async () => {
    const p = project();
    const r = await penthera(p, ["color-helper@1.1.0"], "y\n");
    expect(r.code).toBe(0);
    expect(existsSync(marker)).toBe(true);
    expect(installed(p, "color-helper")).toBe("1.1.0");
  });

  it("installs without running the script when the user picks [s]kip", async () => {
    const p = project();
    const r = await penthera(p, ["color-helper@1.1.0"], "s\n");
    expect(r.code).toBe(0);
    expect(installed(p, "color-helper")).toBe("1.1.0");
    expect(existsSync(marker)).toBe(false);
    expect(r.stdout).toContain("Install scripts skipped for color-helper@1.1.0");
  });

  it("passes a clean upgrade with --yes", async () => {
    const p = project();
    const r = await penthera(p, ["tiny-format@1.0.1", "--yes"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Nothing breaches the policy");
    expect(installed(p, "tiny-format")).toBe("1.0.1");
    expect(JSON.parse(readFileSync(join(p, "package.json"), "utf-8")).dependencies["tiny-format"]).toBe("^1.0.1");
    expect(JSON.parse(readFileSync(join(p, "package-lock.json"), "utf-8")).packages["node_modules/tiny-format"].version).toBe("1.0.1");
  });

  it("lets a policy allow entry override the block", async () => {
    const p = project({ allow: ["color-helper"] });
    const r = await penthera(p, ["color-helper@1.1.0", "--yes"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('allowed by "color-helper"');
    expect(installed(p, "color-helper")).toBe("1.1.0");
    expect(existsSync(marker)).toBe(true);
  });

  it("denies by capability without prompting, even when the answer is yes", async () => {
    const p = project({ deny: ["network"] });
    const before = snapshot(p);
    const r = await penthera(p, ["net-report"], "y\n");
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/net-report@1\.0\.0 {2}denied: network/);
    expect(r.stdout).not.toContain("Install anyway");
    expect(snapshot(p)).toEqual(before);
  });

  it("holds a typosquatted name for approval and reports new transitive packages", async () => {
    const p = project();
    const r = await penthera(p, ["expresss", "tiny-format@1.1.0", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("looks like express");
    expect(r.stdout).toContain("pad-utils 2.0.0 (new)");
    expect(r.stdout).toMatch(/expresss@1\.0\.0 {2}needs approval: looks like a popular package/);
  });

  it("--dry-run --json reports the plan and writes nothing", async () => {
    const p = project();
    const before = snapshot(p);
    const r = await penthera(p, ["color-helper@1.1.0", "--dry-run", "--json"]);
    expect(r.code).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ action: "dry-run", clean: false });
    expect(out.changes[0]).toMatchObject({ name: "color-helper", from: "1.0.0", version: "1.1.0", approval: ["install-scripts"], installScripts: { postinstall: "node postinstall.js" } });
    expect(snapshot(p)).toEqual(before);
  });

  it("does not let a tar desync hide a postinstall script (360 review)", async () => {
    const p = project();
    const before = snapshot(p);
    const r = await penthera(p, ["sneaky-pkg@1.0.0", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("postinstall: node postinstall.js");
    expect(r.stdout).toMatch(/sneaky-pkg@1\.0\.0 {2}needs approval: install script/);
    expect(existsSync(marker)).toBe(false);
    expect(snapshot(p)).toEqual(before);
  });

  it("holds packages whose code is padded, spread over 5,001 files, or too large to scan", async () => {
    const p = project();
    const before = snapshot(p);
    const r = await penthera(p, ["padded-pkg@1.0.0", "many-files@1.0.0", "huge-pkg@1.0.0", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/padded-pkg@1\.0\.0 {2}needs approval: GitHub token harvesting/);
    expect(r.stdout).toMatch(/many-files@1\.0\.0 {2}needs approval: GitHub token harvesting/);
    expect(r.stdout).toMatch(/huge-pkg@1\.0\.0 {2}needs approval: could not be scanned/);
    expect(r.stdout).toContain("Project untouched");
    expect(snapshot(p)).toEqual(before);
  });

  it("rejects a broken policy file and local path specs with exit 2", async () => {
    const p = project({ deny: ["telepathy"] });
    expect((await penthera(p, ["tiny-format@1.0.1"])).code).toBe(2);
    const q = project();
    const r = await penthera(q, ["../evil"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Unsupported package spec/);
  });
});
