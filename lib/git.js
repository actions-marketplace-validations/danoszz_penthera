/**
 * The one place penthera runs git.
 *
 * Every call reads a repository that may not be the user's own (a scanned
 * archive, a shared folder, a devcontainer), so every call runs with config
 * overrides that keep that repository's config from running programs: no
 * hooks, no fsmonitor, no transports, no credential helper, no signing, and
 * no attributes file. The agent loop's allow-listed runner (src/agent/git.js)
 * adds its own checks on top of these.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

export const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";

export const SAFE_CONFIG = Object.freeze([
  "-c", "protocol.allow=never",
  "-c", `core.hooksPath=${NULL_DEVICE}`,
  "-c", "core.fsmonitor=false",
  "-c", "credential.helper=",
  "-c", "commit.gpgsign=false",
  "-c", "tag.gpgsign=false",
  "-c", "log.showSignature=false",
  "-c", "gpg.program=false",
  "-c", "gpg.openpgp.program=false",
  "-c", "gpg.x509.program=false",
  "-c", "gpg.ssh.program=false",
  "-c", "gpg.ssh.defaultKeyCommand=",
  "-c", `core.attributesFile=${NULL_DEVICE}`,
]);

/** Environment for every git child: no lazy fetches, no prompts. */
export const safeEnv = (env = process.env) => ({ ...env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" });

/**
 * Run git synchronously with the safe config. Returns stdout (utf-8 unless
 * `encoding` says otherwise); throws like execFileSync.
 * `raw: true` skips the config overrides, for the few reads that must see the
 * repo's real config (where its hooks live).
 * @param {string} cwd
 * @param {string[]} args
 * @param {import("node:child_process").ExecFileSyncOptions & { raw?: boolean }} [opts]
 */
export function git(cwd, args, { raw = false, ...opts } = {}) {
  return execFileSync("git", raw ? args : [...SAFE_CONFIG, ...args], {
    cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, env: safeEnv(), ...opts,
  });
}

/** spawnSync form of git(), for calls that feed stdin; returns the spawnSync result. */
export function gitSpawn(cwd, args, opts = {}) {
  return spawnSync("git", [...SAFE_CONFIG, ...args], { cwd, maxBuffer: 1024 * 1024 * 1024, env: safeEnv(), ...opts });
}

/**
 * The work tree's toplevel as a native path (git prints D:/a/app on Windows),
 * or null outside a repo or without git.
 */
export function gitToplevel(cwd) {
  try {
    return resolve(git(cwd, ["rev-parse", "--show-toplevel"], { stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return null;
  }
}

/**
 * What git ignores under `root`: whole ignored folders (skipped, like
 * node_modules) and single ignored files (still scanned, reported as local
 * only). Null when `root` is not in a git work tree or git is missing.
 */
export function gitIgnored(root) {
  let out;
  try {
    out = git(root, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory", "--", "."], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const dirs = new Set();
  const files = new Set();
  for (const p of out.split("\0")) {
    if (!p) continue;
    if (p.endsWith("/")) dirs.add(join(root, p.slice(0, -1)));
    else files.add(join(root, p));
  }
  return { dirs, files };
}
