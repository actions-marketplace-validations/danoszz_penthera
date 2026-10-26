/**
 * Stand-ins for the tools --giants runs, for offline tests. Each is a small
 * Node script on a temp PATH folder that answers --version and replays a
 * recorded fixture (tests/fixtures/giants/<tool>/<version>/) the way the real
 * tool would: to stdout, or to the report path named on its command line.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGET_SECRETS } from "../fixtures/giants/target.mjs";
import { maskMatch } from "../../lib/whitebox/secrets.js";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "giants");

/** The recorded fixture for a tool: { version, meta, outputs: [text] } (newest version). */
export function fixture(tool, version = null) {
  const v = version || readdirSync(join(FIXTURES, tool)).sort().pop();
  const dir = join(FIXTURES, tool, v);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf-8"));
  const outputs = readdirSync(dir).filter((f) => f.startsWith("output")).sort().map((f) => readFileSync(join(dir, f), "utf-8"));
  return { version: v, meta, outputs };
}

/**
 * A fixture's text as if it had been recorded on `root`: the recorded root
 * replaced (with and without macOS's /private prefix), and, with
 * `unmask`, the target's secrets put back where the recording masked them.
 */
export function replay(text, meta, root, { unmask = false } = {}) {
  let out = String(text);
  if (meta.root) {
    out = out.split(meta.root).join(root);
    const bare = meta.root.replace(/^\/private\//, "/");
    out = out.split(bare).join(root);
  }
  if (unmask) for (const s of Object.values(TARGET_SECRETS)) out = out.split(maskMatch(s)).join(s);
  return out;
}

/**
 * Write a fake tool into `dir`.
 * @param {string} dir - a temp folder used as PATH
 * @param {string} name - the executable name (gitleaks, zap-baseline.py, …)
 * @param {object} o
 * @param {string} [o.version] - printed for --version / version / -version
 * @param {string} [o.stdout]
 * @param {string} [o.stderr]
 * @param {number} [o.exitCode]
 * @param {string} [o.reportFlag] - write `report` to the path after this flag
 * @param {string} [o.reportName] - …or into this file inside that folder (Checkov)
 * @param {string} [o.report]
 * @param {number} [o.sleepMs] - wait this long first (timeout tests)
 * @param {string} [o.marker] - create this file when the tool runs a scan (refusal tests)
 * @param {number} [o.floodBytes] - print this many bytes (output-cap tests)
 */
export function fakeTool(dir, name, o = {}) {
  mkdirSync(dir, { recursive: true });
  const cfg = JSON.stringify({ name, version: "1.0.0", stdout: "", stderr: "", exitCode: 0, ...o });
  const src = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cfg = ${cfg};
const args = process.argv.slice(2);
if (args.length && ["version", "--version", "-version", "-V"].includes(args[0])) { process.stdout.write(cfg.name + " " + cfg.version + "\\n"); process.exit(0); }
if (cfg.marker) fs.writeFileSync(cfg.marker, JSON.stringify({ args, env: Object.keys(process.env) }));
const go = () => {
  if (cfg.reportFlag) {
    const i = args.indexOf(cfg.reportFlag);
    if (i >= 0) {
      let p = path.resolve(process.cwd(), args[i + 1]);
      if (cfg.reportName) { fs.mkdirSync(p, { recursive: true }); p = path.join(p, cfg.reportName); }
      fs.writeFileSync(p, cfg.report || "");
    }
  }
  if (cfg.floodBytes) { const chunk = "x".repeat(65536); let n = 0; const pump = () => { while (n < cfg.floodBytes) { n += chunk.length; if (!process.stdout.write(chunk)) { process.stdout.once("drain", pump); return; } } process.exit(cfg.exitCode); }; pump(); return; }
  process.stdout.write(cfg.stdout);
  process.stderr.write(cfg.stderr);
  process.exitCode = cfg.exitCode;
};
if (cfg.sleepMs) setTimeout(go, cfg.sleepMs); else go();
`;
  const p = join(dir, name);
  writeFileSync(p, src);
  chmodSync(p, 0o755);
  return p;
}

const BINS = { zap: "zap-baseline.py" };
const HOW = {
  gitleaks: { reportFlag: "--report-path", exitCode: 0 },
  trufflehog: { stdout: true, exitCode: 0 },
  semgrep: { reportFlag: "--output", exitCode: 0 },
  "osv-scanner": { stdout: true, exitCode: 1 },
  "pip-audit": { stdout: true, exitCode: 1 },
  trivy: { reportFlag: "--output", exitCode: 0 },
  checkov: { reportFlag: "--output-file-path", reportName: "results_json.json", exitCode: 1 },
  nuclei: { reportFlag: "-o", exitCode: 0 },
  zap: { reportFlag: "-J", exitCode: 0 },
};

/**
 * A fake for each named tool that replays its recorded fixture as if it had
 * scanned `root` (or `url` for live tools). Returns the PATH folder.
 */
export function fakeGiants(dir, tools, { root = null, url = null, unmask = false } = {}) {
  for (const id of tools) {
    const { version, meta, outputs } = fixture(id);
    let text = replay(outputs[0], meta, root || "/nowhere", { unmask });
    if (url && meta.url) text = text.split(meta.url).join(url);
    const how = HOW[id];
    fakeTool(dir, BINS[id] || id, {
      version,
      exitCode: how.exitCode,
      ...(how.stdout ? { stdout: text } : { reportFlag: how.reportFlag, reportName: how.reportName, report: text }),
    });
  }
  return dir;
}

/** True when the path exists (a marker file a refused tool must not have written). */
export const ran = (marker) => existsSync(marker);
