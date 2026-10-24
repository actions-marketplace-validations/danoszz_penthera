/**
 * `--json` to a pipe: the whole report arrives. The CLI used to exit right
 * after writing, which cut the output off at the pipe buffer (64 KiB) and left
 * `penthera --json | jq` with broken JSON on any large report (found by E10 on
 * Juice Shop, 2026-10-24).
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const BIN = resolve("bin/penthera.js");
const repo = mkdtempSync(join(tmpdir(), "penthera-json-pipe-"));
afterAll(() => rmSync(repo, { recursive: true, force: true }));

// Split so Penthera's own self-scan does not report this fixture.
const line = ["pass", 'word = "Wq7-kz9pL-Hq2v-Rm8x"\n'].join("");
for (let i = 0; i < 400; i++) writeFileSync(join(repo, `config${i}.js`), line);

describe("--json to a pipe", () => {
  it("writes the whole report before exiting", async () => {
    const home = mkdtempSync(join(tmpdir(), "penthera-json-home-"));
    const { out, code } = await new Promise((done) => {
      const child = spawn(process.execPath, [BIN, "--repo", repo, "--offline", "--json"], {
        env: { PATH: process.env.PATH, HOME: home, NO_COLOR: "1", PENTHERA_NO_ONBOARDING: "1" },
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      child.stdout.on("data", (d) => { out += d; });
      child.on("close", (code) => done({ out, code }));
    });
    rmSync(home, { recursive: true, force: true });
    expect(out.length).toBeGreaterThan(64 * 1024);
    const report = JSON.parse(out);
    expect(report.findings.filter((f) => f.category === "secrets")).toHaveLength(400);
    expect(code).toBe(1);
  }, 60_000);
});
