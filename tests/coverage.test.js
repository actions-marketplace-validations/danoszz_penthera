/**
 * Coverage ledger: what each check family of a repo scan read, and what it
 * did not read and why. Built on temporary repos so every status is checked
 * against a real scanRepo result.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { withTempDir } from "../lib/tmp.js";
import { scanRepo } from "../src/scan-repo.js";
import { buildCoverage, fileCoverage, describeCoverage, COVERAGE_SCHEMA } from "../lib/coverage.js";
import { coverageMarkdown } from "../src/report/markdown.js";
import { mergeResults } from "../src/cli/merge-results.js";

function put(root, rel, text = "") {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const NEXT_ROUTE = "export async function GET() { return Response.json({ ok: true }); }\n";

describe("coverage ledger", () => {
  it("records per family what a Next.js repo scan read", () => withTempDir("penthera-cov-", async (root) => {
    put(root, "app/api/users/route.ts", NEXT_ROUTE);
    put(root, "lib/db.ts", "export const db = {};\n");
    put(root, "scripts/seed.py", "print('seed')\n");
    put(root, "Dockerfile", "FROM node:22\n");
    put(root, "logo.png", "png");
    put(root, "node_modules/x/index.js", "module.exports = 1;\n");

    const result = await scanRepo(root);
    const cov = result.coverage;
    expect(cov.schema).toBe(COVERAGE_SCHEMA);
    expect(cov.files).toBe(5); // node_modules is counted as excluded, not walked
    expect(cov.excludedDirs).toEqual(["node_modules"]);

    const fam = Object.fromEntries(cov.families.map((f) => [f.id, f]));
    expect(fam.routes.ran).toBe(true);
    expect(fam.routes.examined).toBe(1);
    expect(fam.routes.skipped).toEqual({ "not-a-route": 1, "language-not-supported": 1 });
    expect(fam.secrets.examined).toBe(3); // route.ts, db.ts, seed.py
    expect(fam.secrets.skipped["type-not-read"]).toBe(2); // Dockerfile, logo.png
    expect(fam["runtime-pins"].examined).toBe(1);

    expect(cov.sourceFiles).toBe(3);
    expect(cov.sourceFilesAnalysed).toBe(1);
    expect(cov.blindSpots.paths.sort()).toEqual(["lib/db.ts", "scripts/seed.py"]);
    expect(cov.notRun.map((n) => n.id)).toEqual(["deps", "agents"]);
  }));

  it("says route analysis did not run when no routes were found", () => withTempDir("penthera-cov-", async (root) => {
    put(root, "src/util.js", "export const a = 1;\n");
    const result = await scanRepo(root);
    const routes = result.coverage.families.find((f) => f.id === "routes");
    expect(routes.ran).toBe(false);
    expect(result.coverage.blindSpots.byReason).toEqual({ "no-api-surface": 1 });
    expect(describeCoverage(result.coverage).find((l) => l.family === routes.label).text).toMatch(/did not run/);
  }));

  it("reads server entry files for Express-style scans", () => withTempDir("penthera-cov-", async (root) => {
    put(root, "server.js", "const app = require('express')();\napp.get('/users', (req, res) => res.json([]));\napp.listen(3000);\n");
    put(root, "src/other.js", "module.exports = {};\n");
    const result = await scanRepo(root);
    const { files } = fileCoverage(root, result);
    expect(files.get("server.js").routes).toBe("examined");
    expect(files.get("src/other.js").routes).toBe("outside-route-folders");
  }));

  it("shows when an Express routes/ folder is taken for a Next.js API folder", () => withTempDir("penthera-cov-", async (root) => {
    // Known gap: findApiRoot picks routes/ as a Next.js API root, finds no
    // route.js files, and route analysis never runs. The ledger must say so.
    put(root, "routes/users.js", "const router = require('express').Router();\nrouter.get('/users', (req, res) => res.json([]));\nmodule.exports = router;\n");
    const result = await scanRepo(root);
    expect(fileCoverage(root, result).files.get("routes/users.js").routes).toBe("no-api-surface");
  }));

  it("does not follow symlinks or enter nested repos", () => withTempDir("penthera-cov-", async (root) => {
    put(root, "a.js", "1;\n");
    put(root, "nested/.git/HEAD", "ref: refs/heads/main\n");
    put(root, "nested/b.js", "2;\n");
    await withTempDir("penthera-cov-out-", async (outside) => {
      put(outside, "secret.js", "3;\n");
      symlinkSync(outside, join(root, "link"));
      const cov = buildCoverage(root, {});
      expect(cov.files).toBe(1);
    });
  }));

  it("is deterministic for the same repo and result", () => withTempDir("penthera-cov-", async (root) => {
    put(root, "app/api/a/route.js", NEXT_ROUTE);
    put(root, "z.py", "");
    put(root, "m.go", "");
    const result = await scanRepo(root);
    expect(buildCoverage(root, result)).toEqual(result.coverage);
  }));

  it("survives merging and renders in Markdown", () => withTempDir("penthera-cov-", async (root) => {
    put(root, "app/api/a/route.js", NEXT_ROUTE);
    put(root, "worker.py", "");
    const repo = await scanRepo(root);
    const merged = mergeResults([{ target: "http://localhost:3000", mode: "url", findings: [] }, repo]);
    expect(merged.coverage).toEqual(repo.coverage);
    const md = coverageMarkdown(merged.coverage).join("\n");
    expect(md).toMatch(/## Coverage/);
    expect(md).toMatch(/1 of 2/);
    expect(md).toMatch(/worker\.py/);
    expect(md).toMatch(/penthera deps <path>/);
  }));
});
