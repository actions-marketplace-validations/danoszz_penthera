/**
 * `penthera agents` on a project with no agent config has read nothing, so it
 * gives no grade. A clean A means rules ran on something and matched nothing.
 */
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanAgents } from "../lib/agents/index.js";
import { buildBrief, formatBrief, VERDICTS } from "../src/report/brief.js";
import { formatMarkdownReport } from "../src/report/markdown.js";
import { buildAi, buildOverview } from "../src/ui/api/summarize.js";
import { startServer, structured } from "./helpers/mcp-client.js";

const dirs = [];
function tmp() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "penthera-agents-empty-")));
  dirs.push(d);
  return d;
}
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function bareProject() {
  const d = tmp();
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }));
  return d;
}

describe("agents with nothing to assess", () => {
  it("gives no grade and no score", async () => {
    const r = await scanAgents(bareProject(), { home: false });
    expect(r.findings).toEqual([]);
    expect(r.agents.grade).toBeNull();
    expect(r.agents.score).toBeNull();
    expect(r.agents.notChecked[0]).toMatch(/Nothing to assess/);
  });

  it("says so in the brief, never Nothing to fix", async () => {
    const r = await scanAgents(bareProject(), { home: false });
    const b = buildBrief(r);
    expect(b.verdict).toBe(VERDICTS.none);
    expect(b.verdict).not.toBe(VERDICTS.clean);
    expect(b.not_checked.join(" ")).toMatch(/Nothing to assess/);
    expect(formatBrief(b)).toMatch(/^\*\*Penthera: Nothing to assess\.\*\*/);
  });

  it("names agent config it saw and could not read", async () => {
    const d = bareProject();
    mkdirSync(join(d, ".codex"));
    writeFileSync(join(d, ".codex", "config.toml"), "model = \"x\"\n");
    const r = await scanAgents(d, { home: false });
    expect(r.agents.grade).toBeNull();
    expect(buildBrief(r).not_checked.join(" ")).toContain(".codex/config.toml");
  });

  it("shows no grade in the Markdown report", async () => {
    const r = await scanAgents(bareProject(), { home: false });
    const md = formatMarkdownReport(r);
    expect(md).toContain("| **Agent config grade** | none, nothing found to assess |");
    expect(md).not.toContain("null");
  });

  it("gives no grade over MCP, with the same verdict", async () => {
    const d = bareProject();
    const client = startServer({ roots: [d] });
    try {
      const res = await client.modern("tools/call", { name: "audit_ai_tooling", arguments: {} });
      const r = structured(res);
      expect(r.grade).toBeNull();
      expect(r.score).toBeNull();
      expect(r.brief.verdict).toBe(VERDICTS.none);
      expect(res.result.content[0].text).toMatch(/^\*\*Penthera: Nothing to assess\.\*\*/);
    } finally {
      await client.close();
    }
  });

  it("keeps a null grade through the dashboard summary", async () => {
    const r = await scanAgents(bareProject(), { home: false });
    const ai = buildAi([{ data: r }]);
    expect(ai.latest.grade).toBeNull();
    expect(ai.history[0].grade).toBeNull();
    const overview = buildOverview({ scans: [{ file: "agents.json", mtime: 1, data: r }] });
    expect(overview.projects[0]).toMatchObject({ grade: "–", score: null });
  });
});

describe("agents with something to assess", () => {
  it("still grades a project with only a rule file", async () => {
    const d = bareProject();
    writeFileSync(join(d, "AGENTS.md"), "# Notes\n\nBuild with npm.\n");
    const r = await scanAgents(d, { home: false });
    expect(r.agents.grade).toBe("A");
    expect(r.agents.score).toBe(100);
    expect(buildBrief(r).verdict).toBe(VERDICTS.clean);
  });

  it("still grades when a finding came from the lock alone", async () => {
    const d = bareProject();
    writeFileSync(join(d, "penthera.lock"), "{ not json");
    const r = await scanAgents(d, { home: false });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.agents.grade).toMatch(/^[A-F]$/);
  });
});
