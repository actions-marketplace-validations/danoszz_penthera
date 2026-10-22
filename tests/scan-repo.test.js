/**
 * Repo scanner (src/scan-repo.js): an auto-detected routes/ or api/ folder that
 * holds no Next.js route.js/ts files is an Express-style app and still gets
 * route discovery, trust boundaries and risky-pattern checks.
 */
import { describe, it, expect, afterAll } from "vitest";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { scanRepo } from "../src/scan-repo.js";

const EXPRESS = resolve("tests/fixtures/repo-scan/express-routes");
const temps = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "penthera-scan-repo-"));
  temps.push(dir);
  return dir;
}

describe("scanRepo with an Express routes/ folder", () => {
  it("discovers the router's routes instead of stopping at 'No API routes found'", async () => {
    const r = await scanRepo(EXPRESS);
    expect(r.findings.some((f) => f.title === "No API routes found")).toBe(false);
    expect(r.attackSurface.map((s) => `${s.methods[0]} ${s.url}`)).toEqual(["GET /users", "POST /users/:id/export"]);
    expect(r.attackSurface.every((s) => s.framework === "express")).toBe(true);
    expect(r.apiRoot).toBe(null);
  });

  it("runs trust-boundary and risky-pattern analysis on them", async () => {
    const r = await scanRepo(EXPRESS);
    expect(r.executedProbes).toEqual(expect.arrayContaining(["trust-boundary", "risky-patterns"]));
    expect((r.boundaries.public || []).length).toBe(2);
    const risky = r.findings.filter((f) => f.source === "static-analysis");
    expect(risky.some((f) => f.severity === "critical" && /command-injection/.test(f.title))).toBe(true);
  });

  it("keeps --api-root as given: an explicit folder with no route files is not re-read as Express", async () => {
    const r = await scanRepo(EXPRESS, { apiRoot: join(EXPRESS, "routes") });
    expect(r.attackSurface).toEqual([]);
    expect(r.findings.some((f) => f.title === "No API routes found")).toBe(true);
    expect(r.executedProbes).not.toContain("risky-patterns");
  });

  it("still reports 'No API routes found' for an empty routes/ folder", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "routes"));
    writeFileSync(join(dir, "routes", "README.md"), "nothing here\n");
    const r = await scanRepo(dir);
    expect(r.findings.some((f) => f.title === "No API routes found")).toBe(true);
    expect(r.apiRoot).toBe(join(dir, "routes"));
  });

  it("still treats a Next.js app/api folder as the API root", async () => {
    const dir = tempDir();
    cpSync(EXPRESS, dir, { recursive: true });
    mkdirSync(join(dir, "app", "api", "health"), { recursive: true });
    writeFileSync(join(dir, "app", "api", "health", "route.js"), "export async function GET() { return Response.json({ ok: true }); }\n");
    const r = await scanRepo(dir);
    expect(r.apiRoot).toBe(join(dir, "app", "api"));
    expect(r.attackSurface.map((s) => s.url)).toEqual(["/api/health"]);
  });
});
