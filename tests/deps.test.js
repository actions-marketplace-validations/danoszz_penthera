/**
 * `penthera deps`: capability detection, typosquats, capability diff, the
 * offline cache path, --online (mocked), output formats and the CLI.
 *
 * Fixture packages are generated into a temp dir by tests/fixtures/deps/build.js,
 * and every suspicious string below is assembled at runtime, so this repo never
 * contains anything that reads like a real payload.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { buildFixtures } from "./fixtures/deps/build.js";
import { blankComments, scanSource, scanPackage, obfuscationSignals, entropy, nodeScriptTargets } from "../lib/deps/capabilities.js";
import { parseLockfile, directDependencies } from "../lib/deps/lockfile.js";
import { DirSource, untar, verifyIntegrity, sourceFromNpmCache, parseIntegrity } from "../lib/deps/source.js";
import { editDistance, checkName, findTyposquats, loadPopular } from "../lib/deps/typosquat.js";
import { diffTrees, compareVersions } from "../lib/deps/diff.js";
import { registrySignals, fetchPackument } from "../lib/deps/online.js";
import { scanDeps } from "../lib/deps/index.js";
import { formatPrComment, formatDepsMarkdown } from "../lib/deps/report.js";
import { mergeResults } from "../src/cli/merge-results.js";
import { writeSarifReport } from "../src/reporter.js";
import { formatMarkdownReport } from "../src/report/markdown.js";

const j = (...p) => p.join("");
const CP = j("child", "_process");
const SER = j("JSON.string", "ify(process.env)");
const caps = (src) => Object.keys(scanSource(src, "x.js").caps);

let dir;
let fx;
const noCache = () => join(dir, "empty-cache");

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "penthera-deps-"));
  fx = buildFixtures(join(dir, "fx"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// ── Tokenizer ─────────────────────────────────────────────────────────────

describe("blankComments", () => {
  it("blanks comments, keeps strings, regex literals and line numbers", () => {
    const src = `// require("${CP}")\nconst u = "http://x"; /* a\nb */ const r = /\\/\\/x/;\nlet s = '//not a comment';`;
    const out = blankComments(src);
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    expect(out).not.toContain(CP);
    expect(out).toContain('"http://x"');
    expect(out).toContain("/\\/\\/x/");
    expect(out).toContain("'//not a comment'");
  });

  it("keeps a division operator from swallowing the rest of the line", () => {
    const out = blankComments("const a = b / c; // note\nd();");
    expect(out).toContain("b / c;");
    expect(out).not.toContain("note");
  });
});

// ── Capability detection ──────────────────────────────────────────────────

describe("scanSource capabilities", () => {
  it("detects child_process in require, import and node: forms", () => {
    expect(caps(`const cp = require("${CP}");`)).toContain("shell");
    expect(caps(`import { spawn } from "node:${CP}";`)).toContain("shell");
    expect(caps(`const m = await import('${CP}');`)).toContain("shell");
  });

  it("ignores child_process mentioned only in comments or as plain words", () => {
    expect(caps(`// uses ${CP} sometimes\nconst x = 1;`)).not.toContain("shell");
    expect(caps(`const name = "${CP}";`)).not.toContain("shell");
  });

  it("detects network modules, fetch and WebSocket, not method calls named fetch", () => {
    for (const mod of ["http", "https", "net", "dgram", "tls", "node:http2"]) {
      expect(caps(`const m = require("${mod}");`)).toContain("network");
    }
    expect(caps("const r = await fetch(url);")).toContain("network");
    expect(caps("const ws = new WebSocket(addr);")).toContain("network");
    expect(caps("const r = await this.fetch(url); store.fetch(k);")).not.toContain("network");
    expect(caps("async function fetch(url) { return 1 }")).not.toContain("network");
  });

  it("detects env reads and bulk env access", () => {
    expect(caps("const d = process.env.DEBUG;")).toEqual(["env"]);
    expect(caps(`const all = ${SER};`)).toEqual(expect.arrayContaining(["env", "env-bulk"]));
    expect(caps("for (const k in process.env) {}")).toContain("env-bulk");
    expect(caps("const env = { ...process.env, FOO: 1 };")).not.toContain("env-bulk");
  });

  it("flags env serialised next to network code as exfil, not key filtering", () => {
    const https = j("ht", "tps");
    const exfil = `const h = require("${https}");\nconst b = ${SER};\nh.request(o).end(b);`;
    expect(scanSource(exfil, "x.js").exfil).toMatchObject({ line: 2 });
    const filter = `const h = require("${https}");\nconst keys = Object.keys(process.env).filter(k => k.startsWith("VITE_"));`;
    expect(scanSource(filter, "x.js").exfil).toBeNull();
  });

  it("detects eval, new Function and vm, but not the globalThis polyfill", () => {
    expect(caps(j("ev", "al(code);"))).toContain("eval");
    expect(caps("const f = new Function('a', 'return a');")).toContain("eval");
    expect(caps("const vm = require('vm');")).toContain("eval");
    expect(caps("var g = new Function('return this')();")).not.toContain("eval");
    expect(caps("var g = Function('return this')();")).not.toContain("eval");
    expect(caps("if (isFunction(x)) obj.eval(1);")).not.toContain("eval");
  });

  it("detects computed require/import but not literal ones", () => {
    expect(caps("const m = require(name);")).toContain("dynamic-require");
    expect(caps("const m = await import(`./locale/${lang}.js`);")).toContain("dynamic-require");
    expect(caps("const m = require('./static');")).not.toContain("dynamic-require");
    expect(caps("const m = await import(`./static.js`);")).not.toContain("dynamic-require");
    expect(caps("const m = __webpack_require__(id);")).not.toContain("dynamic-require");
  });

  it("detects writes outside the package only near a home/system path", () => {
    const near = "const p = path.join(os.homedir(), '.cfg');\nfs.writeFileSync(p, data);";
    expect(caps(near)).toContain("fs-write");
    expect(caps("fs.writeFileSync(path.join(__dirname, 'cache.json'), data);")).not.toContain("fs-write");
  });

  it("detects the AI-config, AI-CLI and token-harvest indicators", () => {
    const cfg = `const fs = require('fs');\nconst p = require('path').join(require('os').homedir(), '${j(".cur", "sor")}', 'mcp.json');\nfs.writeFileSync(p, '{}');`;
    expect(caps(cfg)).toContain("ai-config-write");
    const desktop = `fs.writeFileSync(dir + '/${j("claude_", "desktop_", "config.json")}', s);`;
    expect(caps(desktop)).toContain("ai-config-write");

    const cli = `const { spawn } = require('${CP}');\nspawn('${j("gem", "ini")}', ['-p', 'x', '${j("--yo", "lo")}']);`;
    expect(caps(cli)).toContain("ai-cli-invoke");
    const q = `const { execSync } = require('${CP}');\nexecSync('q chat --${j("trust-", "all-", "tools")}');`;
    expect(caps(q)).toContain("ai-cli-invoke");

    const gh = `const { execSync } = require('${CP}');\nconst t = execSync('${j("gh auth ", "tok", "en")}');`;
    expect(caps(gh)).toContain("token-harvest");
    const creds = `const c = fs.readFileSync(path.join(home, '${j(".git-", "credentials")}'));`;
    expect(caps(creds)).toContain("token-harvest");
  });

  it("treats project-level AI config writes as normal unless an install hook runs them", () => {
    const mcp = `fs.writeFileSync('${j(".m", "cp.json")}', JSON.stringify(cfg));\nfs.mkdirSync('${j(".cl", "aude")}/agents');`;
    const r = scanSource(mcp, "init.js");
    expect(Object.keys(r.caps)).not.toContain("ai-config-write");
    expect(r.aiConfigProject).toMatchObject({ file: "init.js", line: 1 });

    const files = new Map([
      ["package.json", Buffer.from(JSON.stringify({ name: "p", version: "1.0.0", scripts: { postinstall: "node -e \"require('./init')\"" } }))],
      ["init.js", Buffer.from(mcp)],
    ]);
    const viaHook = scanPackage({ files: () => [...files.keys()], read: (f) => files.get(f), size: (f) => files.get(f).length });
    expect(viaHook.capabilities["ai-config-write"]).toBeDefined();
    expect(viaHook.installRisk.join(" ")).toMatch(/init\.js \(ai-config-write\)/);

    files.set("package.json", Buffer.from(JSON.stringify({ name: "p", version: "1.0.0", bin: "init.js" })));
    const viaCli = scanPackage({ files: () => [...files.keys()], read: (f) => files.get(f), size: (f) => files.get(f).length });
    expect(viaCli.capabilities["ai-config-write"]).toBeUndefined();
  });

  it("does not flag reading AI config or naming AI CLIs without writes or a shell", () => {
    expect(caps(`const p = path.join(home, '${j(".cl", "aude")}');\nconst s = fs.readFileSync(p);`)).not.toContain("ai-config-write");
    expect(caps(`const cli = '${j("cla", "ude")}';`)).not.toContain("ai-cli-invoke");
  });

  it("carries file:line evidence", () => {
    const r = scanSource(`\n\nconst cp = require("${CP}");`, "lib/a.js");
    expect(r.caps.shell.evidence[0]).toMatchObject({ file: "lib/a.js", line: 3 });
  });
});

describe("obfuscation signals", () => {
  it("flags obfuscator identifiers and escape-heavy strings", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `_0x${(0xabc0 + i).toString(16)}`).join("+");
    expect(obfuscationSignals(`var a=${ids};`).flagged).toBe(true);
    const esc = "'" + Array.from({ length: 80 }, (_, i) => "\\x" + (0x41 + (i % 26)).toString(16)).join("") + "'";
    expect(obfuscationSignals(`var s=${esc};`).flagged).toBe(true);
  });

  it("flags a decoded blob fed to dynamic code, but not a bare blob, wasm or ANSI codes", () => {
    const blob = createHash("sha512").update("x").digest("base64").repeat(12).replace(/[=]/g, "A");
    const run = j("ev", "al");
    expect(obfuscationSignals(`var d='${blob}';\n${run}(atob(d));`, { hasDynamicCode: true }).flagged).toBe(true);
    expect(obfuscationSignals(`var d='${blob}';`, { hasDynamicCode: false }).flagged).toBe(false);
    expect(obfuscationSignals(`var w='AGFzbQEAAAAB${blob}';\n${run}(atob(w));`, { hasDynamicCode: true }).flagged).toBe(false);
    const ansi = Array.from({ length: 100 }, () => "'\\x1b[31m'").join(",");
    expect(obfuscationSignals(`var c=[${ansi}];`).flagged).toBe(false);
  });

  it("does not flag a blob, a decode call and dynamic code that are far apart", () => {
    const blob = createHash("sha512").update("y").digest("base64").repeat(12).replace(/[=]/g, "A");
    const run = j("ev", "al");
    const filler = "x = x + 1;\n".repeat(600);
    expect(obfuscationSignals(`var d='${blob}';\n${filler}var s=atob(k);\n${filler}${run}(code);`, { hasDynamicCode: true }).flagged).toBe(false);
  });

  it("does not flag ordinary minified code with long lines", () => {
    const min = Array.from({ length: 800 }, (_, i) => `function f${i}(a){return a+${i}}`).join(";");
    expect(obfuscationSignals(min).flagged).toBe(false);
  });

  it("computes Shannon entropy", () => {
    expect(entropy("aaaa")).toBe(0);
    expect(entropy("abcd")).toBe(2);
  });
});

describe("scanPackage", () => {
  it("reports install scripts with package.json line evidence and risky targets", () => {
    const pkg = scanPackage(new DirSource(join(fx.head, "node_modules", "setup-hooks")), { prefix: "node_modules/setup-hooks/" });
    expect(pkg.installScripts).toEqual({ postinstall: "node install.js" });
    expect(pkg.capabilities["install-scripts"].evidence[0]).toMatchObject({ file: "node_modules/setup-hooks/package.json" });
    expect(pkg.installRisk.join(" ")).toMatch(/install\.js/);
  });

  it("treats binding.gyp as an implicit install script and a native binary", () => {
    const pkg = scanPackage(new DirSource(join(fx.head, "node_modules", "native-thing")));
    expect(Object.keys(pkg.capabilities)).toEqual(expect.arrayContaining(["install-scripts", "native"]));
  });

  it("finds nothing in a benign package", () => {
    const pkg = scanPackage(new DirSource(join(fx.head, "node_modules", "tiny-format")));
    expect(pkg.capabilities).toEqual({});
  });

  it("Penthera's own deps scanner and fixture builder do not trip the attack indicators", () => {
    for (const d of [resolve("lib/deps"), resolve("tests/fixtures/deps"), resolve("tests")]) {
      const pkg = scanPackage(new DirSource(d));
      for (const id of ["ai-config-write", "ai-cli-invoke", "token-harvest", "obfuscated"]) {
        expect(pkg.capabilities[id], `${id} in ${d}`).toBeUndefined();
      }
      expect(pkg.exfil).toEqual([]);
    }
  });
});

// ── Lockfile, tarballs, cache ─────────────────────────────────────────────

describe("lockfile and sources", () => {
  it("parses v3 and v1 lockfiles", () => {
    const v3 = { packages: { "": { dependencies: { a: "1" }, devDependencies: { b: "1" } }, "node_modules/a": { version: "1.0.0", integrity: "sha512-x" }, "node_modules/a/node_modules/@s/c": { version: "2.0.0", dev: true }, "packages/ws": { version: "0.0.0" } } };
    const p = parseLockfile(v3);
    expect(p.map((x) => [x.name, x.path])).toEqual([["a", "node_modules/a"], ["@s/c", "node_modules/a/node_modules/@s/c"]]);
    expect(directDependencies(v3)).toEqual(["a", "b"]);
    const v1 = { dependencies: { a: { version: "1.0.0", dependencies: { b: { version: "2.0.0", dev: true } } } } };
    expect(parseLockfile(v1).map((x) => x.path)).toEqual(["node_modules/a", "node_modules/a/node_modules/b"]);
  });

  it("reads verified tarballs from an npm-style cache by integrity", () => {
    const lock = JSON.parse(readFileSync(join(fx.baseLockOnly, "package-lock.json"), "utf-8"));
    const entry = lock.packages["node_modules/net-helper"];
    const src = sourceFromNpmCache(entry.integrity, fx.cache);
    expect(src.kind).toBe("npm-cache");
    expect(JSON.parse(src.read("package.json").toString()).version).toBe("1.0.0");
    expect(sourceFromNpmCache(entry.integrity, noCache())).toBeNull();
  });

  it("rejects bytes that do not match the integrity", () => {
    const buf = gzipSync(Buffer.from("x"));
    const good = `sha512-${createHash("sha512").update(buf).digest("base64")}`;
    expect(verifyIntegrity(buf, good)).toBe(true);
    expect(verifyIntegrity(Buffer.from("y"), good)).toBe(false);
    expect(parseIntegrity("md5-abc")).toEqual([]);
  });

  it("untar drops path traversal entries", () => {
    const h = Buffer.alloc(512);
    h.write("package/../../evil.js", 0);
    h.write("00000000001\0", 124);
    h.write("0", 156);
    const files = untar(Buffer.concat([h, Buffer.from("x"), Buffer.alloc(511), Buffer.alloc(1024)]));
    expect([...files.keys()]).toEqual([]);
  });
});

// ── Typosquats ────────────────────────────────────────────────────────────

describe("typosquat check", () => {
  it("ships a vendored popular-package list", () => {
    const p = loadPopular();
    expect(p.names.length).toBeGreaterThan(1000);
    expect(p.source).toMatch(/^npm-high-impact@/);
  });

  it("computes Damerau-Levenshtein distance", () => {
    expect(editDistance("lodash", "lodahs")).toBe(1);
    expect(editDistance("express", "expresss")).toBe(1);
    expect(editDistance("react", "preact", 2)).toBe(1);
    expect(editDistance("abc", "xyzuvw", 2)).toBe(3);
  });

  it("flags near misses of popular names and leaves real packages alone", () => {
    expect(checkName("crossenv")).toMatchObject({ target: "cross-env" });
    expect(checkName("expresss")).toMatchObject({ target: "express" });
    expect(checkName("lodash.js")).toMatchObject({ target: "lodash" });
    for (const real of ["express", "lodash", "react", "yaml", "vitest", "ms", "chalk", "@types/node"]) {
      expect(checkName(real), real).toBeNull();
    }
    expect(findTyposquats(["express", "expresss", "tiny-format"]).map((h) => h.name)).toEqual(["expresss"]);
    // Same scope means same publisher.
    expect(checkName("@img/sharp-linux-arm6")).toBeNull();
  });
});

// ── Diff ──────────────────────────────────────────────────────────────────

describe("diffTrees", () => {
  const cap = (...ids) => Object.fromEntries(ids.map((id) => [id, { count: 1, evidence: [] }]));

  it("reports added, upgraded (gained/lost) and removed packages", () => {
    const d = diffTrees(
      [{ name: "a", version: "1.0.0", capabilities: cap("env") }, { name: "gone", version: "1.0.0", capabilities: {} }],
      [{ name: "a", version: "1.1.0", capabilities: cap("network") }, { name: "new", version: "0.1.0", capabilities: cap("shell") }],
    );
    expect(d.upgraded[0]).toMatchObject({ name: "a", from: "1.0.0", to: "1.1.0", gained: ["network"], lost: ["env"] });
    expect(d.added[0]).toMatchObject({ name: "new", capabilities: ["shell"] });
    expect(d.removed).toEqual([{ name: "gone", version: "1.0.0" }]);
  });

  it("compares against the closest older version", () => {
    const d = diffTrees(
      [{ name: "a", version: "1.0.0", capabilities: {} }, { name: "a", version: "2.0.0", capabilities: cap("network") }],
      [{ name: "a", version: "2.0.0", capabilities: cap("network") }, { name: "a", version: "3.0.0", capabilities: cap("network", "shell") }],
    );
    expect(d.upgraded).toHaveLength(1);
    expect(d.upgraded[0]).toMatchObject({ from: "2.0.0", to: "3.0.0", gained: ["shell"] });
  });

  it("orders versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("2.0.0-beta.1", "2.0.0")).toBe(-1);
  });
});

// ── scanDeps end to end ───────────────────────────────────────────────────

describe("scanDeps", () => {
  it("benign tree: no findings", async () => {
    const r = await scanDeps(fx.benign, { cacheDir: noCache() });
    expect(r.findings).toEqual([]);
    expect(r.deps.scanned).toBe(3);
  });

  it("full scan of the head tree reports each risk once, with evidence", async () => {
    const r = await scanDeps(fx.head, { cacheDir: noCache() });
    const titles = r.findings.map((f) => `${f.severity} ${f.title}`);
    expect(titles).toEqual(expect.arrayContaining([
      "critical setup-hooks@1.0.0: writes AI agent config",
      "critical setup-hooks@1.0.0: drives AI CLIs",
      "critical setup-hooks@1.0.0: GitHub token harvesting",
      "high fast-fmt@0.0.1: obfuscated code",
      "high net-helper@1.1.0: serialises the whole environment next to network code",
      "medium setup-hooks@1.0.0: runs a risky install script",
      "low native-thing@2.0.0: runs install script",
      "medium expresss looks like express (one edit away)",
    ]));
    for (const f of r.findings) {
      expect(f).toMatchObject({ category: "dependency-risk", source: "deps-scan" });
      expect(f.url).toMatch(/node_modules\//);
    }
    expect(r.findings.find((f) => /AI CLIs/.test(f.title)).line).toBe(8);
  });

  it("--diff against an installed base tree reports the gained capabilities", async () => {
    const r = await scanDeps(fx.head, { diff: fx.base, cacheDir: noCache() });
    const d = r.deps.diff;
    expect(d.upgraded).toEqual([expect.objectContaining({ name: "net-helper", from: "1.0.0", to: "1.1.0", gained: ["network", "env-bulk"] })]);
    expect(d.added.map((a) => a.name)).toEqual(["expresss", "fast-fmt", "setup-hooks"]);
    const gained = r.findings.find((f) => f.method === "deps-capability-diff" && f.change === "upgraded");
    expect(gained).toMatchObject({ title: "net-helper 1.0.0 → 1.1.0 gained network, whole environment", severity: "medium", from: "1.0.0" });
    // Unchanged packages are not re-reported in diff mode.
    expect(r.findings.some((f) => f.package === "native-thing")).toBe(false);
    // New packages don't repeat what their own findings already say.
    const newHooks = r.findings.find((f) => f.title.startsWith("New dependency setup-hooks"));
    expect(newHooks.capabilities).toEqual(["shell", "fs-write"]);
  });

  it("--diff against a bare lockfile reads old versions from the npm cache", async () => {
    const r = await scanDeps(fx.head, { diff: join(fx.baseLockOnly, "package-lock.json"), cacheDir: fx.cache });
    expect(r.deps.diff.upgraded[0].gained).toEqual(["network", "env-bulk"]);
  });

  it("says so when an old version is not available offline", async () => {
    const r = await scanDeps(fx.head, { diff: join(fx.baseLockOnly, "package-lock.json"), cacheDir: noCache() });
    expect(r.deps.diff.upgraded[0]).toMatchObject({ gained: null, unavailable: "old" });
    expect(r.findings.find((f) => f.severity === "info").title).toMatch(/not compared/);
  });

  it("--base reads the old lockfile from git", async () => {
    const repo = join(dir, "git-repo");
    mkdirSync(repo, { recursive: true });
    const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    git("init", "-q");
    copyFileSync(join(fx.base, "package-lock.json"), join(repo, "package-lock.json"));
    git("add", "package-lock.json");
    git("commit", "-qm", "base");
    copyFileSync(join(fx.head, "package-lock.json"), join(repo, "package-lock.json"));
    execFileSync("cp", ["-R", join(fx.head, "node_modules"), join(repo, "node_modules")]);
    const r = await scanDeps(repo, { base: "HEAD", cacheDir: fx.cache });
    expect(r.deps.diff.base).toBe("HEAD");
    expect(r.deps.diff.upgraded[0].gained).toEqual(["network", "env-bulk"]);
  });

  it("--prod skips devDependencies", async () => {
    const all = await scanDeps(fx.head, { cacheDir: noCache() });
    const prod = await scanDeps(fx.head, { prod: true, cacheDir: noCache() });
    expect(all.deps.packages.some((p) => p.name === "dev-only")).toBe(true);
    expect(prod.deps.packages.some((p) => p.name === "dev-only")).toBe(false);
  });

  it("is deterministic", async () => {
    const strip = (r) => JSON.stringify({ ...r, timestamp: 0, duration: 0 });
    const a = await scanDeps(fx.head, { diff: fx.base, cacheDir: noCache() });
    const b = await scanDeps(fx.head, { diff: fx.base, cacheDir: noCache() });
    expect(strip(a)).toBe(strip(b));
  });

  it("fails clearly without a lockfile", async () => {
    await expect(scanDeps(dir, {})).rejects.toThrow(/No package-lock.json/);
  });
});

// ── --online (mocked; no real network in tests) ───────────────────────────

describe("--online registry checks", () => {
  const NOW = Date.parse("2026-10-19T00:00:00Z");
  const day = 24 * 3600 * 1000;
  const iso = (ms) => new Date(ms).toISOString();

  it("derives fresh-version, new-package, publisher-change and deprecated signals", () => {
    const doc = {
      time: { created: iso(NOW - 10 * day), "1.0.0": iso(NOW - 9 * day), "1.1.0": iso(NOW - 2 * day) },
      versions: {
        "1.0.0": { _npmUser: { name: "alice" }, maintainers: [{ name: "alice" }] },
        "1.1.0": { _npmUser: { name: "mallory" }, maintainers: [{ name: "mallory" }], deprecated: "use x" },
      },
    };
    const ids = registrySignals(doc, "1.1.0", { now: NOW }).map((s) => s.id).sort();
    expect(ids).toEqual(["deprecated", "fresh-version", "new-package", "publisher-change"]);
    expect(registrySignals(doc, "9.9.9", { now: NOW })[0].id).toBe("missing-version");
  });

  it("uses only the injected fetch, and fetches old tarballs it cannot find offline", async () => {
    const urls = [];
    const lock = JSON.parse(readFileSync(join(fx.baseLockOnly, "package-lock.json"), "utf-8"));
    const oldIntegrity = lock.packages["node_modules/net-helper"].integrity;
    const tgz = sourceFromNpmCache(oldIntegrity, fx.cache) && readFileSync(join(fx.cache, "_cacache", "content-v2", "sha512", ...(() => {
      const hex = parseIntegrity(oldIntegrity)[0].hex;
      return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4)];
    })()));
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.endsWith(".tgz")) return { ok: true, arrayBuffer: async () => tgz };
      return { ok: true, json: async () => ({ time: { created: iso(NOW - 400 * day) }, versions: {} }) };
    };
    const r = await scanDeps(fx.head, { diff: join(fx.baseLockOnly, "package-lock.json"), cacheDir: noCache(), online: true, fetchImpl, now: NOW });
    expect(urls.every((u) => u.startsWith("https://registry.npmjs.org/"))).toBe(true);
    expect(r.deps.online.fetchedTarballs).toBe(1);
    expect(r.deps.diff.upgraded[0].gained).toEqual(["network", "env-bulk"]);
    expect(r.deps.network).toMatch(/online/);
  });
});

// ── Output formats ────────────────────────────────────────────────────────

describe("deps output", () => {
  let merged;
  beforeAll(async () => {
    merged = mergeResults([await scanDeps(fx.head, { diff: fx.base, cacheDir: noCache() })]);
  });

  it("stamps provenance and honest confidence", () => {
    const obf = merged.findings.find((f) => /obfuscated/.test(f.title));
    expect(obf).toMatchObject({ source: "deps-scan", method: "deps-capability-scan", confidence: "potential" });
    expect(merged.findings.find((f) => /install script/.test(f.title)).confidence).toBe("confirmed");
  });

  it("writes SARIF with file and line locations", () => {
    const p = join(dir, "deps.sarif");
    writeSarifReport(merged, p);
    const sarif = JSON.parse(readFileSync(p, "utf-8"));
    const res = sarif.runs[0].results.find((x) => /AI CLIs/.test(x.message.text));
    expect(res.locations[0].physicalLocation).toMatchObject({ artifactLocation: { uri: "node_modules/setup-hooks/install.js" }, region: { startLine: 8 } });
    expect(res.properties.confidence).toBe("likely");
  });

  it("renders a Dependencies section in the Markdown report and a PR comment", () => {
    const md = formatMarkdownReport(merged, { version: "test" });
    expect(md).toContain("## Dependencies");
    expect(md).toContain("### Capability diff");
    expect(formatDepsMarkdown(merged.deps)).toContain("| **net-helper** | 1.0.0 → 1.1.0 |");
    const pr = formatPrComment(merged, { version: "test" });
    expect(pr.startsWith("<!-- penthera-deps -->")).toBe(true);
    expect(pr).toContain("Upgrades that gained capabilities");
    expect(pr).toContain("network, whole environment");
    expect(pr).toContain("Risk signals");
  });
});

// ── CLI ───────────────────────────────────────────────────────────────────

describe("penthera deps CLI", () => {
  const BIN = resolve("bin/penthera.js");
  const run = (args) => {
    try {
      const out = execFileSync(process.execPath, [BIN, ...args], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", PENTHERA_NO_ONBOARDING: "1", npm_config_cache: noCache() },
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };

  it("prints the gained-capabilities report and exits 1 on the fixture upgrade", () => {
    const pr = join(dir, "pr.md");
    const { code, out } = run(["deps", fx.head, "--diff", fx.base, "--pr-comment", pr]);
    expect(code).toBe(1);
    expect(out).toContain("Gained capabilities");
    expect(out).toMatch(/net-helper 1\.0\.0 → 1\.1\.0 {2}\+ network, whole environment/);
    expect(readFileSync(pr, "utf-8")).toContain("<!-- penthera-deps -->");
  });

  it("exits 0 on a benign tree and emits JSON", () => {
    const { code, out } = run(["deps", fx.benign, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out);
    expect(json.mode).toBe("deps");
    expect(json.findings).toEqual([]);
  });

  it("rejects deps-only flags outside deps mode", () => {
    const { code, out } = run(["--repo", ".", "--online"]);
    expect(code).toBe(2);
    expect(out).toMatch(/only apply to `penthera deps`/);
  });

  it("keeps the network out of the offline path", () => {
    // The offline modules never import the online module or reference fetch.
    for (const f of ["index.js", "capabilities.js", "diff.js", "lockfile.js", "source.js", "typosquat.js", "report.js"]) {
      const src = readFileSync(resolve("lib/deps", f), "utf-8");
      expect(src, f).not.toMatch(/(?<![\w.])fetch\s*\(/);
    }
    expect(readFileSync(resolve("lib/deps/index.js"), "utf-8")).toMatch(/if \(opts\.online\) \{\n\s+const \{ checkRegistry, fetchTarballSource \} = await import\("\.\/online\.js"\)/);
  });
});


describe("hostile input stays cheap", () => {
  it("parses node script targets from install hooks in linear time", () => {
    expect(nodeScriptTargets("node scripts/postinstall.js")).toEqual(["scripts/postinstall.js"]);
    expect(nodeScriptTargets("node --no-warnings --max-old-space-size=4096 ./setup.js && echo ok")).toEqual(["./setup.js"]);
    const hostile = "node " + "-- -".repeat(50_000) + "!";
    const t0 = performance.now();
    nodeScriptTargets(hostile);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("encodes package names for the registry, scoped or not", async () => {
    const seen = [];
    const fetchImpl = async (url) => { seen.push(url); return { ok: false }; };
    await fetchPackument("@scope/pkg", { fetchImpl, registry: "https://r.test/" });
    await fetchPackument("../../x?y", { fetchImpl, registry: "https://r.test/" });
    expect(seen).toEqual(["https://r.test/@scope%2Fpkg", "https://r.test/..%2F..%2Fx%3Fy"]);
  });
});
