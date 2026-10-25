/**
 * The skill and plugin as users install them, not as the repo holds them.
 * Found in the 2026-10-22 end-to-end test:
 * - `/plugin install penthera@penthera` installed but failed to load ("conflicting
 *   manifests: both plugin.json and marketplace entry specify components").
 * - preflight.sh from an installed skill (~/.claude/skills/penthera) made
 *   ~/.claude/reports, and failed without a global `penthera` although npx works.
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "penthera-skill-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("Claude Code plugin manifest", () => {
  it("does not declare components in both plugin.json and a non-strict marketplace entry", () => {
    const market = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf-8"));
    const entry = market.plugins.find((p) => p.name === "penthera");
    const declares = ["skills", "commands", "agents", "hooks", "mcpServers"].some((k) => entry[k] != null);
    if (existsSync(join(entry.source ?? ".", ".claude-plugin/plugin.json")) && declares) expect(entry.strict).toBe(true);
  });
});

describe("preflight.sh from an installed skill", () => {
  it("passes through npx when penthera is not installed, and writes reports/ in the project, not next to the skill", () => {
    const skill = join(tmp, "home", ".claude", "skills", "penthera");
    mkdirSync(join(skill, "scripts"), { recursive: true });
    cpSync("skills/penthera/scripts/preflight.sh", join(skill, "scripts", "preflight.sh"));
    const project = join(tmp, "project");
    mkdirSync(project);
    // Node's own bin folder has node and npx; no global penthera on this PATH.
    const PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;
    const r = spawnSync("bash", [join(skill, "scripts", "preflight.sh"), "http://localhost:3000"], {
      cwd: project,
      encoding: "utf-8",
      env: { PATH, HOME: join(tmp, "home"), npm_config_cache: join(tmp, "npm-cache"), npm_config_offline: "true" },
    });
    expect(r.stderr).not.toMatch(/ERROR/);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/through npx/);
    expect(existsSync(join(project, "reports"))).toBe(true);
    expect(existsSync(join(tmp, "home", ".claude", "reports"))).toBe(false);
  });
});
