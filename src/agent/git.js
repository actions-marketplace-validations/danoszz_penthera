/**
 * The agent loop's only way to run git: an allow-list of local subcommands.
 *
 * The loop branches, commits and reverts, and nothing else. Anything that can
 * reach a remote (push, fetch, pull, remote, clone, ls-remote, submodule, ...)
 * is not on the list, so it is refused before a process is spawned. On top of
 * that every call runs with:
 *   - protocol.allow=never, so no transport works even if a subcommand tried one;
 *   - GIT_NO_LAZY_FETCH=1, so a partial clone cannot fetch missing objects;
 *   - core.hooksPath=/dev/null, core.fsmonitor=false and commit --no-verify, so
 *     the scanned repo's hooks never run (a repo can ship hooks that do anything);
 *   - GIT_TERMINAL_PROMPT=0 and an empty credential helper, so nothing asks for
 *     or hands out credentials.
 */
import { execFileSync } from "node:child_process";

export const ALLOWED_SUBCOMMANDS = Object.freeze([
  "rev-parse", "symbolic-ref", "status", "diff", "log", "show-ref", "checkout", "add", "commit", "config",
]);

/** Arguments that would make an allowed subcommand reach outside the repo. */
const FORBIDDEN_ARGS = [
  /^-c$/, /^--config/, /^--git-dir/, /^--work-tree/, /^--exec-path/, /^--upload-pack/, /^--receive-pack/,
  /^--exec\b/, /^--recurse-submodules/, /^--remote/, /:\/\//, /^[^/\s]+@[^/\s]+:/,
];

export class GitPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "GitPolicyError";
    this.code = "GIT_FORBIDDEN";
  }
}

/** Throws GitPolicyError unless `args` is a local-only git invocation. */
export function assertAllowed(args) {
  if (!Array.isArray(args) || args.length === 0) throw new GitPolicyError("git: no subcommand");
  const [sub, ...rest] = args;
  if (!ALLOWED_SUBCOMMANDS.includes(sub)) {
    throw new GitPolicyError(`git ${sub} is not allowed: the agent loop only runs local git (${ALLOWED_SUBCOMMANDS.join(", ")})`);
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (typeof a !== "string") throw new GitPolicyError("git: arguments must be strings");
    if (sub === "commit" && rest[i - 1] === "-m") continue; // a commit message is text, not an option
    if (FORBIDDEN_ARGS.some((re) => re.test(a))) throw new GitPolicyError(`git ${sub}: argument ${JSON.stringify(a)} is not allowed`);
  }
  // `config` may only read one key; it never writes repo or global config.
  if (sub === "config" && !(rest.length === 2 && rest[0] === "--get" && /^[\w.-]+$/.test(rest[1]))) {
    throw new GitPolicyError("git config: only `config --get <key>` is allowed");
  }
  return true;
}

const SAFE_CONFIG = [
  "-c", "protocol.allow=never",
  "-c", "core.hooksPath=/dev/null",
  "-c", "core.fsmonitor=false",
  "-c", "credential.helper=",
];

/**
 * Bind a git runner to a work tree.
 *
 * @param {string} cwd
 * @param {{ exec?: typeof execFileSync, env?: object }} [opts] - exec is injectable for tests
 * @returns {{ run(...args: string[]): string, tryRun(...args: string[]): string|null }}
 */
export function createGit(cwd, { exec = execFileSync, env = process.env } = {}) {
  const childEnv = { ...env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  const run = (...args) => {
    assertAllowed(args);
    const full = args[0] === "commit" ? ["commit", "--no-verify", ...args.slice(1)] : args;
    return exec("git", [...SAFE_CONFIG, ...full], {
      cwd, env: childEnv, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024,
    });
  };
  const tryRun = (...args) => {
    try {
      return run(...args);
    } catch (e) {
      if (e instanceof GitPolicyError) throw e;
      return null;
    }
  };
  return { run, tryRun };
}
