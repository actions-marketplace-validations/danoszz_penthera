/**
 * Fix recipes (lib/fix): diffs apply cleanly, are idempotent, and the finding
 * is gone on re-scan. Each fixture is copied into a temp git repo; nothing is
 * installed or served, so headers/cookies/CORS/rate limits are verified with
 * the recipes' static probes and secrets with the real secret scanner.
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  RECIPES, planFixes, probeRepo, redactPlan, applyDiff, createPatch, parsePatch, applyHunks,
} from "../lib/fix/index.js";
import { createModelFixer, assertLocalModelUrl, OLLAMA_ORIGIN } from "../lib/fix/model.js";
import { scanSecrets } from "../lib/whitebox/secrets.js";
import { scanRepo } from "../src/scan-repo.js";

const FIXTURES = resolve("tests/fixtures/fix");
const BIN = resolve("bin/penthera.js");
const temps = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "penthera-fix-"));
  temps.push(dir);
  return dir;
}

/** Copy a fixture into a fresh, committed git repo. */
function repoFrom(name) {
  const dir = tempDir();
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture");
  return dir;
}

function commit(dir) {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fix");
}

const findingsFor = (dir) => [...scanSecrets(dir), ...probeRepo(dir)];

describe("diff", () => {
  it("round-trips an edit, an insertion and a new file", () => {
    const before = "a\nb\nc\nd\ne\nf\ng\nh\n";
    const after = "a\nB\nc\nd\ne\nf\ng\nh\ni\n";
    const patch = createPatch("x.js", before, after);
    expect(patch).toContain("--- a/x.js");
    expect(applyHunks(before, parsePatch(patch)[0].hunks)).toBe(after);

    const created = createPatch("new.txt", null, "one\ntwo\n");
    expect(created).toMatch(/^--- \/dev\/null\n\+\+\+ b\/new.txt\n@@ -0,0 \+1,2 @@/);
    expect(applyHunks(null, parsePatch(created)[0].hunks)).toBe("one\ntwo\n");
  });

  it("keeps a missing final newline", () => {
    const patch = createPatch("x", "a\nb", "a\nc");
    expect(patch).toContain("\\ No newline at end of file");
    expect(applyHunks("a\nb", parsePatch(patch)[0].hunks)).toBe("a\nc");
  });

  it("returns an empty patch when nothing changed and refuses a stale hunk", () => {
    expect(createPatch("x", "a\n", "a\n")).toBe("");
    const patch = createPatch("x", "a\nb\n", "a\nc\n");
    expect(() => applyHunks("totally\ndifferent\n", parsePatch(patch)[0].hunks)).toThrow(/does not apply/);
  });
});

describe("applyDiff safety", () => {
  const edit = (file) => createPatch(file, "x\n", "y\n");

  it("refuses paths outside the repo, absolute paths, and .git", () => {
    const dir = repoFrom("express");
    for (const header of ["--- a/../escape.js\n+++ b/../escape.js", "--- /etc/hosts\n+++ /etc/hosts", "--- a/.git/config\n+++ b/.git/config"]) {
      const diff = `${header}\n@@ -1,1 +1,1 @@\n-x\n+y\n`;
      expect(() => applyDiff(dir, diff)).toThrow(/outside the repo|inside \.git|relative to the repo/);
    }
  });

  it("refuses a symlink that points outside the repo", () => {
    const dir = repoFrom("express");
    const outside = tempDir();
    writeFileSync(join(outside, "target.js"), "x\n");
    symlinkSync(outside, join(dir, "linked"));
    commit(dir);
    expect(() => applyDiff(dir, edit("linked/target.js"))).toThrow(/resolves outside the repo/);
    expect(readFileSync(join(outside, "target.js"), "utf-8")).toBe("x\n");
  });

  it("refuses a dirty tree or a non-git directory unless allowDirty", () => {
    const dir = repoFrom("express");
    writeFileSync(join(dir, "scratch.js"), "x\n");
    expect(() => applyDiff(dir, edit("scratch.js"))).toThrow(/uncommitted changes/);
    expect(applyDiff(dir, edit("scratch.js"), { allowDirty: true }).applied).toBe(true);
    expect(readFileSync(join(dir, "scratch.js"), "utf-8")).toBe("y\n");

    const plain = tempDir();
    writeFileSync(join(plain, "a.js"), "x\n");
    expect(() => applyDiff(plain, edit("a.js"))).toThrow(/not a git work tree/);
  });

  it("writes nothing on a dry run or when any hunk fails", () => {
    const dir = repoFrom("express");
    const good = createPatch("server.js", readFileSync(join(dir, "server.js"), "utf-8"), "replaced\n");
    expect(applyDiff(dir, good, { dryRun: true }).applied).toBe(false);
    expect(readFileSync(join(dir, "server.js"), "utf-8")).not.toBe("replaced\n");

    const bad = good + createPatch("routes/auth.js", "not the real content\n", "nope\n");
    expect(() => applyDiff(dir, bad)).toThrow(/does not apply/);
    expect(readFileSync(join(dir, "server.js"), "utf-8")).not.toBe("replaced\n");
  });
});

const EXPECTED = {
  express: ["secret-to-env", "security-headers", "cookie-flags", "cors-allowlist", "auth-rate-limit"],
  next: ["secret-to-env", "security-headers", "cookie-flags", "cors-allowlist", "auth-rate-limit"],
  fastify: ["security-headers", "cookie-flags", "cors-allowlist", "auth-rate-limit"],
  hono: ["security-headers", "cookie-flags", "cors-allowlist", "auth-rate-limit"],
};

describe.each(Object.keys(EXPECTED))("recipes on the %s fixture", (name) => {
  it("plans one fix per issue, each applying cleanly to the fixture", async () => {
    const dir = repoFrom(name);
    const { plans, unmatched } = await planFixes(dir, findingsFor(dir));
    expect(plans.map((p) => p.recipe).sort()).toEqual([...EXPECTED[name]].sort());
    expect(unmatched).toEqual([]);
    for (const p of plans) {
      expect(p.source).toBe("recipe");
      expect(applyDiff(dir, p.diff, { dryRun: true }).files.length).toBeGreaterThan(0);
    }
  });

  it("applies every fix, then re-scans clean and plans nothing (idempotent)", async () => {
    const dir = repoFrom(name);
    const original = findingsFor(dir);
    expect(original.length).toBeGreaterThan(0);

    // Apply one plan at a time and re-plan, as `penthera fix --apply` does:
    // plans touching the same file are made against the tree they will patch.
    for (let round = 0; round < 10; round++) {
      const { plans } = await planFixes(dir, findingsFor(dir));
      if (plans.length === 0) break;
      applyDiff(dir, plans[0].diff);
      commit(dir);
    }

    expect(findingsFor(dir)).toEqual([]);
    const again = await planFixes(dir, original);
    expect(again.plans).toEqual([]);
  });
});

describe("recipe details", () => {
  it("re-scanning with the real repo scanner clears the secret and the CORS wildcard", async () => {
    const dir = repoFrom("next");
    const before = await scanRepo(dir);
    expect(before.findings.some((f) => f.category === "secrets")).toBe(true);
    expect(before.findings.some((f) => /cors-wildcard/.test(f.title))).toBe(true);
    for (const recipe of ["secret-to-env", "cors-allowlist"]) {
      const { plans } = await planFixes(dir, (await scanRepo(dir)).findings.concat(probeRepo(dir)));
      applyDiff(dir, plans.find((p) => p.recipe === recipe).diff);
      commit(dir);
    }
    const after = await scanRepo(dir);
    expect(after.findings.some((f) => f.category === "secrets")).toBe(false);
    expect(after.findings.some((f) => /cors-wildcard/.test(f.title))).toBe(false);
  });

  it("secret plans always ask the owner to rotate, update .env.example, and mask the value", async () => {
    const dir = repoFrom("express");
    const { plans } = await planFixes(dir, scanSecrets(dir));
    const p = plans[0];
    expect(p.ownerActions.some((a) => /rotate/i.test(a) && /never rotate/i.test(a))).toBe(true);
    expect(p.files).toEqual(["server.js", ".env.example"]);
    expect(p.diff).toContain("+API_KEY=");
    expect(p.diff).toContain("h3J9sK2dLq8Wm4Zx");
    const shown = redactPlan(p);
    expect(shown.diff).not.toContain("h3J9sK2dLq8Wm4Zx");
    expect(shown.redactions).toBeUndefined();
  });

  it("matches header findings from a URL scan to the repo's framework", async () => {
    const dir = repoFrom("hono");
    const fromUrlScan = [
      { severity: "medium", title: "Missing Content-Security-Policy", category: "headers", url: "https://staging.example.com", source: "header-audit" },
      { severity: "low", title: "Missing X-Frame-Options", category: "headers", url: "https://staging.example.com", source: "header-audit" },
    ];
    const { plans } = await planFixes(dir, fromUrlScan);
    expect(plans).toHaveLength(1);
    expect(plans[0].findings).toHaveLength(2);
    expect(plans[0].diff).toContain('import { secureHeaders } from "hono/secure-headers";');
  });

  it("uses helmet when the Express app already depends on it", async () => {
    const dir = repoFrom("express");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    pkg.dependencies.helmet = "^8.0.0";
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
    const { plans } = await planFixes(dir, [{ title: "Missing X-Frame-Options", category: "headers", severity: "low" }]);
    expect(plans[0].diff).toContain('+import helmet from "helmet";');
    expect(plans[0].diff).toContain("+app.use(helmet());");
  });

  it("returns no plan when the anchor is not there", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { express: "^5.0.0" } }));
    writeFileSync(join(dir, "server.js"), 'import express from "express";\nconst app = makeApp(express);\nconst opts = { path: "/" };\nres.cookie("sid", "v", opts);\n');
    const { plans, unmatched } = await planFixes(dir, [
      { title: "Missing X-Frame-Options", category: "headers", severity: "low" },
      { title: 'Cookie "sid" missing HttpOnly', category: "cookie", severity: "medium" },
      { title: "Generic API key assignment in source", category: "secrets", severity: "high", url: "config.json" },
    ]);
    expect(plans).toEqual([]);
    expect(unmatched).toHaveLength(3);
  });

  it("leaves an existing Next.js headers() alone", async () => {
    const dir = repoFrom("next");
    writeFileSync(join(dir, "next.config.mjs"), 'export default {\n  async headers() {\n    return [];\n  },\n};\n');
    const { plans } = await planFixes(dir, [{ title: "Missing X-Frame-Options", category: "headers", severity: "low" }]);
    expect(plans).toEqual([]);
  });

  it("recipes never write during planning", async () => {
    const dir = repoFrom("fastify");
    await planFixes(dir, findingsFor(dir));
    expect(git(dir, "status", "--porcelain")).toBe("");
  });

  it("every recipe has the documented shape", () => {
    for (const r of RECIPES) {
      expect(typeof r.id).toBe("string");
      for (const fn of ["matches", "detect", "plan"]) expect(typeof r[fn]).toBe("function");
    }
  });
});

describe("local-model fallback", () => {
  it("only ever targets 127.0.0.1:11434", () => {
    expect(OLLAMA_ORIGIN).toBe("http://127.0.0.1:11434");
    expect(() => assertLocalModelUrl("http://127.0.0.1:11434/api/generate")).not.toThrow();
    for (const bad of ["http://localhost:11434/api/generate", "https://api.example.com/v1", "http://127.0.0.1:8080/", "http://10.0.0.2:11434/"]) {
      expect(() => assertLocalModelUrl(bad)).toThrow(/Refusing/);
    }
    expect(() => createModelFixer({})).toThrow(/model name/);
  });

  it("is used only when no recipe matches, and is labelled for human review", async () => {
    const dir = repoFrom("express");
    const calls = [];
    const fakeFetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      const before = readFileSync(join(dir, "server.js"), "utf-8");
      const diff = createPatch("server.js", before, before.replace('app.use(express.json());', 'app.use(express.json({ limit: "100kb" }));'));
      return { ok: true, json: async () => ({ response: "```diff\n" + diff + "```" }) };
    };
    const model = createModelFixer({ model: "qwen2.5-coder", fetch: fakeFetch });
    const { plans } = await planFixes(dir, [
      { title: "Missing X-Frame-Options", category: "headers", severity: "low" },
      { title: "Unbounded request body", category: "dos", severity: "medium", url: "server.js" },
    ], { model });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:11434/api/generate");
    expect(calls[0].body.model).toBe("qwen2.5-coder");
    const m = plans.find((p) => p.source === "local-model");
    expect(m.confidence).toBe("needs-human-review");
    expect(plans.find((p) => p.recipe === "security-headers").source).toBe("recipe");
  });

  it("drops model output that does not apply or leaves the repo", async () => {
    const dir = repoFrom("express");
    for (const response of ["NO_FIX", "--- a/../x.js\n+++ b/../x.js\n@@ -1,1 +1,1 @@\n-a\n+b\n", "--- a/server.js\n+++ b/server.js\n@@ -1,1 +1,1 @@\n-nope\n+b\n"]) {
      const model = createModelFixer({ model: "m", fetch: async () => ({ ok: true, json: async () => ({ response }) }) });
      expect(await model.plan(dir, { title: "x", category: "dos", severity: "high", url: "server.js" })).toBeNull();
    }
  });
});

describe("penthera fix CLI", () => {
  const cli = (dir, args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [BIN, "fix", ...args], { cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } }) };
    } catch (e) {
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };

  it("--plan prints diffs with secrets masked; --apply needs approval, then applies and verifies", () => {
    const dir = repoFrom("express");
    const plan = cli(dir, ["--plan"]);
    expect(plan.code).toBe(0);
    expect(plan.out).toContain("+++ b/server.js");
    expect(plan.out).not.toContain("h3J9sK2dLq8Wm4Zx");

    const json = JSON.parse(cli(dir, ["--plan", "--json"]).out);
    const id = json.plans.find((p) => p.recipe === "cookie-flags").id;

    const refused = cli(dir, ["--apply", id]);
    expect(refused.code).toBe(1);
    expect(git(dir, "status", "--porcelain")).toBe("");

    const applied = cli(dir, ["--apply", id, "--yes"]);
    expect(applied.code).toBe(0);
    expect(applied.out).toMatch(/verified Cookie "sid"/);
    expect(readFileSync(join(dir, "routes/auth.js"), "utf-8")).toContain("httpOnly: true");

    // The tree is now dirty, so the next apply is refused.
    const next = JSON.parse(cli(dir, ["--plan", "--json"]).out).plans[0].id;
    expect(cli(dir, ["--apply", next, "--yes"]).out).toMatch(/uncommitted changes/);
  });

  it("reads findings from a -o report", () => {
    const dir = repoFrom("fastify");
    const report = join(tempDir(), "report.json");
    writeFileSync(report, JSON.stringify({ findings: [{ title: "Missing Content-Security-Policy", category: "headers", severity: "medium" }] }));
    const out = JSON.parse(cli(dir, ["--plan", "--json", "-o", report]).out);
    expect(out.plans.map((p) => p.recipe)).toEqual(["security-headers"]);
  });
});
