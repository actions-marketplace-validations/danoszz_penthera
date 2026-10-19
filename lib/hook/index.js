/**
 * `penthera hook`: a git pre-commit hook that runs the checks that matter most
 * before code leaves the laptop, on staged content only.
 *
 *   - secrets in staged files (lib/whitebox/secrets.js, AI provider keys included)
 *   - `penthera agents` rules on staged agent config (.mcp.json, CLAUDE.md, skills/, ...)
 *   - a staged package-lock.json: the capability diff against HEAD's lockfile,
 *     plus the license policy when penthera.policy.json has one
 *
 * Everything is read from the git index (what will be committed), never the
 * working tree, so a half-staged file is judged by its staged half. Offline,
 * no telemetry. Findings use the standard shape, so ids match a full scan and
 * penthera.suppress.json works here too.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findSecretsInText, isSecretScanTarget, maskMatch } from "../whitebox/secrets.js";
import { loadPolicy } from "../install/policy.js";
import { loadRepoSuppressions } from "../memory/repo-suppress.js";
import { findingId } from "../memory/views.js";
import { fingerprintFinding } from "../audit-loop.js";
import { globToRegExp, isAtLeast, SEVERITIES } from "./policy.js";

export const HOOK_MARKER = "# penthera-hook";
export const BACKUP_NAME = "pre-commit.pre-penthera";
const MAX_BLOB_BYTES = 2 * 1024 * 1024;

// ── git plumbing ──────────────────────────────────────────────────────────

function git(cwd, args, opts = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, ...opts });
}

export function repoRoot(cwd) {
  try {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    throw new Error(`Not inside a git repository: ${cwd}`);
  }
}

/** Paths added, copied, modified or renamed in the index (what this commit adds). */
export function stagedFiles(root) {
  return git(root, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR", "--no-renames"]).split("\0").filter(Boolean);
}

/** Read index blobs in one `git cat-file --batch` call. Returns Map(path → Buffer); large files are skipped. */
export function readStaged(root, paths) {
  const out = new Map();
  const wanted = paths.filter((p) => !p.includes("\n"));
  if (!wanted.length) return out;
  const r = spawnSync("git", ["cat-file", "--batch"], { cwd: root, input: wanted.map((p) => `:${p}\n`).join(""), maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git cat-file failed: ${String(r.stderr).trim()}`);
  const buf = r.stdout;
  let pos = 0;
  for (const p of wanted) {
    const nl = buf.indexOf(10, pos);
    if (nl === -1) break;
    const header = buf.subarray(pos, nl).toString();
    pos = nl + 1;
    const m = /^\S+ (\w+) (\d+)$/.exec(header);
    if (!m) continue; // "<name> missing"
    const size = Number(m[2]);
    if (m[1] === "blob" && size <= MAX_BLOB_BYTES) out.set(p, buf.subarray(pos, pos + size));
    pos += size + 1;
  }
  return out;
}

// ── Checks ────────────────────────────────────────────────────────────────

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function checkSecrets(files, blobs) {
  const findings = [];
  for (const path of files) {
    if (!isSecretScanTarget(path)) continue;
    const buf = blobs.get(path);
    if (!buf || buf.subarray(0, 8192).includes(0)) continue;
    const text = buf.toString("utf-8");
    for (const hit of findSecretsInText(text)) {
      // Same title/url/category/source as the repo scan, so finding ids match.
      findings.push({
        severity: hit.severity,
        title: `${hit.name} in source`,
        description: `Possible secret in \`${path}\`: \`${maskMatch(hit.match)}\``,
        url: path,
        line: lineOf(text, text.indexOf(hit.match)),
        evidence: maskMatch(hit.match),
        category: "secrets",
        source: "secret-scan",
      });
    }
  }
  return findings;
}

const AGENT_FILES = new Set(["AGENTS.md", "CLAUDE.md", "CLAUDE.local.md", "GEMINI.md", ".cursorrules", ".windsurfrules", ".mcp.json", ".github/copilot-instructions.md", ".vscode/mcp.json"]);
const AGENT_DIRS = [".claude/", ".cursor/", ".agents/", ".codex/", ".clinerules/", ".claude-plugin/", ".github/instructions/", "skills/", "plugins/"];

/** Is this repo path agent configuration that `penthera agents` reads? */
export function isAgentConfig(path) {
  return AGENT_FILES.has(path) || AGENT_DIRS.some((d) => path.startsWith(d));
}

/**
 * Agent rules on the staged view of the agent config. The whole agent config
 * in the index is checked out to a temp folder (a skill is judged as a folder,
 * not file by file); only findings that touch a staged path are kept.
 */
async function checkAgents(root, staged) {
  const touched = staged.filter(isAgentConfig);
  if (!touched.length) return { findings: [], files: 0 };
  const all = git(root, ["ls-files", "-z", "--cached"]).split("\0").filter((p) => p && isAgentConfig(p));
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "penthera-hook-")));
  try {
    const r = spawnSync("git", ["checkout-index", "-z", "--stdin", `--prefix=${tmp}/`], { cwd: root, input: all.join("\0") });
    if (r.status !== 0) throw new Error(`git checkout-index failed: ${String(r.stderr).trim()}`);
    const { scanAgents } = await import("../agents/index.js");
    const result = await scanAgents(tmp, { lockPath: join(tmp, ".penthera-hook-no-lock") });
    const relates = (url) => touched.some((s) => url === s || s.startsWith(`${url}/`) || url.startsWith(`${s}/`));
    const findings = result.findings
      .filter((f) => !String(f.templateId).startsWith("agents/lock-") && relates(f.url))
      .map((f) => {
        const m = /\(line (\d+)\)/.exec(f.description || "");
        return m ? { ...f, line: Number(m[1]) } : f;
      });
    return { findings, files: touched.length };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const EMPTY_LOCK = { lockfileVersion: 3, packages: {} };

/** Capability diff (and license policy) for each staged lockfile, against HEAD. */
async function checkLockfiles(root, staged, blobs, { licensePolicy }) {
  const locks = staged.filter((p) => ["package-lock.json", "npm-shrinkwrap.json"].includes(posix.basename(p)));
  if (!locks.length) return { findings: [], files: 0 };
  const { scanDeps } = await import("../deps/index.js");
  const findings = [];
  for (const path of locks) {
    const buf = blobs.get(path);
    if (!buf) continue;
    let lock;
    try { lock = JSON.parse(buf.toString("utf-8")); } catch (e) {
      findings.push({ severity: "high", title: `${path} is not valid JSON`, description: e.message, url: path, category: "dependency-risk", source: "deps-scan" });
      continue;
    }
    let baseLock = EMPTY_LOCK;
    try { baseLock = JSON.parse(git(root, ["show", `HEAD:${path}`])); } catch { /* new lockfile or first commit */ }
    const dir = posix.dirname(path);
    const result = await scanDeps(join(root, dir), { lock, baseLock, baseLabel: "HEAD", changedOnly: true, licensePolicy });
    const prefix = dir === "." ? "" : `${dir}/`;
    for (const f of result.findings) findings.push({ ...f, url: f.url ? `${prefix}${f.url}` : path });
  }
  return { findings, files: locks.length };
}

// ── Run ───────────────────────────────────────────────────────────────────

function suppressedBy(entries, f) {
  if (!entries.length) return null;
  const id = findingId(f);
  const fp = fingerprintFinding(f);
  return entries.find((e) => e.id === id || e.fingerprint === fp) || null;
}

const bySeverity = (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || String(a.url).localeCompare(String(b.url)) || (a.line || 0) - (b.line || 0);

/**
 * Check what is staged. Never writes to the repo.
 * @param {string} cwd anywhere inside the repo
 * @param {{ policyPath?: string, now?: string }} opts
 * @returns {Promise<{ root, staged, checked, blocking, below, suppressed, blockOn, policyPath, warnings, duration }>}
 */
export async function runHook(cwd, opts = {}) {
  const started = Date.now();
  const root = repoRoot(cwd);
  const { policy, path: policyPath } = loadPolicy(root, opts.policyPath || null);
  const { blockOn, checks, ignore } = policy.hook;
  const ignored = ignore.map(globToRegExp);
  const staged = stagedFiles(root).filter((p) => !ignored.some((re) => re.test(p)));

  const wantBlobs = staged.filter((p) => (checks.secrets && isSecretScanTarget(p)) || /(^|\/)(package-lock|npm-shrinkwrap)\.json$/.test(p));
  const blobs = readStaged(root, wantBlobs);

  const secrets = checks.secrets ? checkSecrets(staged, blobs) : [];
  const agents = checks.agents ? await checkAgents(root, staged) : { findings: [], files: 0 };
  const deps = checks.deps ? await checkLockfiles(root, staged, blobs, { licensePolicy: checks.licenses ? policy.licenses : null }) : { findings: [], files: 0 };

  const sup = loadRepoSuppressions(root, { now: opts.now });
  const all = [...secrets, ...agents.findings, ...deps.findings].map((f) => ({ ...f, id: findingId(f) }));
  const suppressed = [];
  const kept = [];
  for (const f of all) {
    const s = suppressedBy(sup.entries, f);
    if (s) suppressed.push({ ...f, suppression: { reason: s.reason } });
    else kept.push(f);
  }
  kept.sort(bySeverity);
  return {
    root,
    staged: staged.length,
    checked: { secrets: checks.secrets ? staged.filter(isSecretScanTarget).length : 0, agents: agents.files, lockfiles: deps.files },
    blockOn,
    policyPath,
    blocking: kept.filter((f) => isAtLeast(f.severity, blockOn)),
    below: kept.filter((f) => !isAtLeast(f.severity, blockOn)),
    suppressed,
    warnings: sup.warnings,
    duration: Date.now() - started,
  };
}

/** One short "how to fix" line per finding. */
export function fixHint(f) {
  if (f.category === "secrets") return "Load it from an env var or secret store and unstage the file; rotate it if it was ever pushed or shared.";
  if (f.category === "license") return `Replace ${f.package}, or add it to "allowPackages" in the licenses section of penthera.policy.json.`;
  if (f.category === "dependency-risk") return `Review it before committing the lockfile: \`penthera deps --base HEAD -v\` shows the evidence.`;
  const first = String(f.description || "").replace(/\s*\[[^\]]*\]$/, "").replace(/\s*\(line \d+\)/, "").split(/(?<=\.)\s/)[0];
  return first || "See `penthera agents` for details.";
}

// ── Install / uninstall ───────────────────────────────────────────────────

const BIN = fileURLToPath(new URL("../../bin/penthera.js", import.meta.url));
const sq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

export function hookScript({ node = process.execPath, bin = BIN } = {}) {
  return `#!/bin/sh
${HOOK_MARKER}: pre-commit hook installed by \`penthera hook install\`.
# Remove it with \`penthera hook uninstall\`, which restores any hook it replaced.
# Skip it for one commit with \`git commit --no-verify\`.
hook_dir=$(dirname "$0")
if [ -x "$hook_dir/${BACKUP_NAME}" ]; then
  "$hook_dir/${BACKUP_NAME}" "$@" || exit $?
fi
if [ -f ${sq(bin)} ] && [ -x ${sq(node)} ]; then
  exec ${sq(node)} ${sq(bin)} hook run
elif command -v penthera >/dev/null 2>&1; then
  exec penthera hook run
fi
echo "penthera: not found, pre-commit check skipped (npm install -g penthera, then penthera hook install)" >&2
exit 0
`;
}

/** Where git looks for hooks (honours core.hooksPath and worktrees). */
export function hooksDir(root) {
  return resolve(root, git(root, ["rev-parse", "--git-path", "hooks"]).trim());
}

function hooksPathSetting(root) {
  try { return git(root, ["config", "--get", "core.hooksPath"]).trim() || null; } catch { return null; }
}

const isOurs = (path) => existsSync(path) && readFileSync(path, "utf-8").includes(HOOK_MARKER);

/**
 * Write .git/hooks/pre-commit. An existing hook that is not ours is kept as
 * pre-commit.pre-penthera and runs first.
 * @returns {{ path, chained: string|null, updated: boolean }}
 */
export function installHook(cwd, { force = false, script = hookScript() } = {}) {
  const root = repoRoot(cwd);
  const custom = hooksPathSetting(root);
  if (custom && !force) {
    const err = new Error(`core.hooksPath is set to "${custom}" (husky, lefthook or similar manage hooks here). Add \`penthera hook run\` to that tool's pre-commit config instead, or rerun with --force to write ${join(custom, "pre-commit")}.`);
    err.code = "HOOKS_PATH";
    throw err;
  }
  const dir = hooksDir(root);
  const path = join(dir, "pre-commit");
  const backup = join(dir, BACKUP_NAME);
  let updated = false;
  if (existsSync(path)) {
    if (isOurs(path)) updated = true;
    else if (existsSync(backup)) throw new Error(`Both ${path} and ${backup} exist. Merge them by hand, then run \`penthera hook install\` again.`);
    else renameSync(path, backup);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return { path, chained: existsSync(backup) ? backup : null, updated };
}

/**
 * Remove our hook and put back the one it replaced.
 * @returns {{ path, removed: boolean, restored: string|null }}
 */
export function uninstallHook(cwd) {
  const root = repoRoot(cwd);
  const dir = hooksDir(root);
  const path = join(dir, "pre-commit");
  const backup = join(dir, BACKUP_NAME);
  if (!existsSync(path)) return { path, removed: false, restored: null };
  if (!isOurs(path)) throw new Error(`${path} was not installed by penthera; left untouched.`);
  unlinkSync(path);
  if (existsSync(backup)) {
    renameSync(backup, path);
    return { path, removed: true, restored: path };
  }
  return { path, removed: true, restored: null };
}
