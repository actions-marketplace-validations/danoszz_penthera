/**
 * Record --giants fixtures: run each installed tool on the fixture target
 * (tests/fixtures/giants/target.mjs) through Penthera's own runner, and keep
 * its output under tests/fixtures/giants/<tool>/<version>/.
 *
 *   node scripts/giants/record.mjs [--only gitleaks,trivy] [--semgrep-rules <dir>] [--check]
 *
 * --check writes nothing and exits 1 when a tool did not run or its output
 * could not be read: the manual giants-integration workflow uses it to catch
 * a change in a tool's output format.
 *
 * Needs the tools on PATH (outside this repository) and their databases
 * cached; nothing is installed or downloaded here. Live tools (nuclei, ZAP)
 * scan the mock server in tests/fixtures/mock-server.js on 127.0.0.1 with the
 * templates in tests/fixtures/giants/nuclei-templates. pip-audit and
 * osv-scanner are recorded offline where they can be; pip-audit needs the
 * network (PyPI) and is recorded with --giants-online.
 *
 * Output is kept as Penthera keeps it for the evidence bundle: secrets
 * masked (TruffleHog prints them raw), everything else byte for byte except
 * one thing: your home folder (where the tools live) reads `/home/user`. The
 * fixture target, the Semgrep rules and the nuclei templates are copied to
 * fixed paths under /private/tmp so the recorded paths are stable.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { writeTarget } from "../../tests/fixtures/giants/target.mjs";
import { runGiants } from "../../lib/giants/index.js";
import { startMockServer } from "../../tests/fixtures/mock-server.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES = join(REPO, "tests/fixtures/giants");
const TMP = process.platform === "darwin" ? "/private/tmp" : "/tmp";
export const TARGET_ROOT = `${TMP}/penthera-giants-target`;
const RULES = `${TMP}/penthera-giants-semgrep-rules`;
const TEMPLATES = `${TMP}/penthera-giants-nuclei-templates`;

const { values } = parseArgs({ options: { only: { type: "string" }, "semgrep-rules": { type: "string" }, check: { type: "boolean", default: false } } });
let problems = 0;
const only = values.only ? values.only.split(",") : null;

for (const p of [TARGET_ROOT, RULES, TEMPLATES]) rmSync(p, { recursive: true, force: true });
if (problems) {
  process.stderr.write(`  ${problems} tool(s) did not run or could not be read\n`);
  process.exitCode = 1;
}
writeTarget(TARGET_ROOT);
const rulesFrom = values["semgrep-rules"] || process.env.PENTHERA_SEMGREP_RULES || null;
for (const [from, to] of [[rulesFrom, RULES], [join(FIXTURES, "nuclei-templates"), TEMPLATES]]) {
  rmSync(to, { recursive: true, force: true });
  if (from) cpSync(from, to, { recursive: true });
}
const settings = { semgrepRules: rulesFrom ? RULES : null, nucleiTemplates: TEMPLATES };
const scrub = (text) => String(text).split(homedir()).join("/home/user");

async function record(opts, ids) {
  const run = await runGiants({ timeoutS: 900, ...opts, with: ids, settings, languages: ["JavaScript"], onPhase: (m) => process.stderr.write(`  ${m}\n`) });
  for (const t of run.giants.tools) {
    if (t.status !== "ran") {
      process.stderr.write(`  ${t.id}: ${t.status}${t.reason ? `: ${t.reason}` : ""}\n`);
      if (ids.includes(t.id)) problems++;
      continue;
    }
    if (values.check) {
      process.stderr.write(`  ${t.id} ${t.version}: ran, ${t.findings} findings${t.reason ? ` (${t.reason})` : ""}\n`);
      continue;
    }
    const dir = join(FIXTURES, t.id, t.version);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const outputs = run.raw.filter((r) => r.tool === t.id);
    outputs.forEach((r, i) => writeFileSync(join(dir, outputs.length > 1 ? `output-${i + 1}.txt` : "output.txt"), scrub(r.content)));
    writeFileSync(join(dir, "meta.json"), JSON.stringify({
      tool: t.id, version: t.version, command: scrub(t.command), exitCode: t.exitCode, network: t.network,
      root: opts.root || null, url: opts.url || null, findings: t.findings, recordedOn: new Date().toISOString().slice(0, 10),
    }, null, 2) + "\n");
    process.stderr.write(`  ${t.id} ${t.version}: ${t.findings} findings → ${dir}\n`);
  }
}

const want = (ids) => (only ? ids.filter((i) => only.includes(i)) : ids);
const repoTools = want(["gitleaks", "trufflehog", "semgrep", "codeql", "osv-scanner", "trivy", "checkov"]);
if (repoTools.length) await record({ root: TARGET_ROOT }, repoTools);
if (want(["pip-audit"]).length) await record({ root: TARGET_ROOT, online: true }, ["pip-audit"]);
const liveTools = want(["nuclei", "zap"]);
if (liveTools.length) {
  const mock = await startMockServer(0);
  try {
    await record({ url: mock.url, typedUrl: mock.url }, liveTools);
  } finally {
    await mock.close();
  }
}
for (const p of [TARGET_ROOT, RULES, TEMPLATES]) rmSync(p, { recursive: true, force: true });
if (problems) {
  process.stderr.write(`  ${problems} tool(s) did not run or could not be read\n`);
  process.exitCode = 1;
}
