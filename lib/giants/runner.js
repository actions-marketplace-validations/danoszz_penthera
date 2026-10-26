/**
 * Running another program safely, for --giants (docs/research/spec-giants.md,
 * "Running another program safely").
 *
 * A scanned repository is hostile input, and so is anything it can put on
 * PATH. This module:
 *
 * - resolves each tool from PATH entries outside the scanned repository and
 *   outside the current directory (relative entries are never used); a match
 *   inside the project is refused and reported;
 * - spawns with an argument array, never a shell;
 * - stops a tool past its timeout or output cap (the whole process group);
 * - denies the network to offline tools with macOS `sandbox-exec` or Linux
 *   `bwrap` where available, and says so when it cannot;
 * - gives the tool a minimal environment: PATH, a temp HOME unless the tool
 *   needs its cache, TMPDIR, the locale, and nothing from Penthera's own
 *   environment (no tokens).
 *
 * Nothing here is downloaded or installed.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync, realpathSync, accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

/** Seconds per tool unless --giants-timeout or the policy says otherwise. */
export const DEFAULT_TIMEOUT_S = 300;
/** Bytes of output (stdout, stderr or a report file) a tool may write. */
export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

// Every IP connection denied. Unix-domain sockets stay allowed: Python tools
// (checkov, Semgrep) talk to their own worker processes over them.
export const OFFLINE_PROFILE = "(version 1)(allow default)(deny network*)(allow network* (local unix-socket))(allow network* (remote unix-socket))";
// A live tool scanning a target on this machine: loopback only (macOS).
export const LOOPBACK_PROFILE = `${OFFLINE_PROFILE}(allow network* (local ip "localhost:*"))(allow network* (remote ip "localhost:*"))`;

/** True when `child` is `parent` or inside it (both absolute). */
export function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function real(p) {
  try { return realpathSync(p); } catch { return resolve(p); }
}

function isExecutable(p) {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a tool on PATH, refusing anything the scanned project could have put
 * there. Returns `{ path, refused }`; `path` is null when no usable binary was
 * found, and `refused` lists `{ path, reason }` for every match that was
 * skipped. A PATH entry is skipped when it is relative (it would resolve
 * against the current directory), inside the scanned root, or inside the
 * current directory (unless the current directory holds the home folder,
 * where ~/.local/bin and ~/go/bin live). The binary's real path, after
 * symlinks, must also be outside the root.
 *
 * @param {string[]} names - executable names to try, in order
 * @param {object} o
 * @param {string|null} o.root - the scanned repository (absolute), or null for a URL scan
 * @param {string} [o.cwd]
 * @param {string} [o.pathEnv]
 * @param {string} [o.home]
 */
export function resolveTool(names, { root = null, cwd = process.cwd(), pathEnv = process.env.PATH || "", home = homedir() } = {}) {
  const refused = [];
  const realRoot = root ? real(root) : null;
  const realCwd = real(cwd);
  const cwdHoldsHome = isInside(real(home), realCwd);
  for (const dir of pathEnv.split(delimiter)) {
    for (const name of names) {
      if (!dir) continue;
      const candidate = join(dir, name);
      if (!isAbsolute(dir)) {
        if (isExecutable(resolve(cwd, candidate))) refused.push({ path: candidate, reason: "on a relative PATH entry, which resolves against the current directory" });
        continue;
      }
      if (!isExecutable(candidate)) continue;
      const realDir = real(dir);
      const target = real(candidate);
      if (realRoot && (isInside(realDir, realRoot) || isInside(target, realRoot))) {
        refused.push({ path: candidate, reason: "inside the scanned repository" });
        continue;
      }
      if (!cwdHoldsHome && (isInside(realDir, realCwd) || isInside(target, realCwd))) {
        refused.push({ path: candidate, reason: "inside the current directory" });
        continue;
      }
      return { path: candidate, refused };
    }
  }
  return { path: null, refused };
}

let sandboxCache;

/**
 * The network sandbox this machine offers: "sandbox-exec" (macOS), "bwrap"
 * (Linux, bubblewrap, when it can create a network namespace here), or null.
 * Checked once per process.
 */
export function detectSandbox({ platform = process.platform } = {}) {
  if (sandboxCache !== undefined && platform === process.platform) return sandboxCache;
  let kind = null;
  if (platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) {
    const r = spawnSync("/usr/bin/sandbox-exec", ["-p", OFFLINE_PROFILE, "/usr/bin/true"], { timeout: 10_000 });
    if (r.status === 0) kind = "sandbox-exec";
  } else if (platform === "linux") {
    const r = spawnSync("bwrap", ["--dev-bind", "/", "/", "--unshare-net", "--", "true"], { timeout: 10_000 });
    if (r.status === 0) kind = "bwrap";
  }
  if (platform === process.platform) sandboxCache = kind;
  return kind;
}

/**
 * The command and arguments that run `cmd args` with the network denied by
 * `sandbox`. `loopback` keeps connections to this machine open (macOS only;
 * bwrap's new network namespace has its own, empty loopback, so it is not
 * used for that).
 */
export function wrapOffline(sandbox, cmd, args, { loopback = false } = {}) {
  if (sandbox === "sandbox-exec") return { cmd: "/usr/bin/sandbox-exec", args: ["-p", loopback ? LOOPBACK_PROFILE : OFFLINE_PROFILE, cmd, ...args] };
  if (sandbox === "bwrap" && !loopback) return { cmd: "bwrap", args: ["--dev-bind", "/", "/", "--unshare-net", "--die-with-parent", "--", cmd, ...args] };
  return { cmd, args };
}

// Variables a tool may see besides PATH, HOME and TMPDIR: the locale and the
// cache locations a user set for these tools. No tokens, no proxies.
const PASS_THROUGH = ["LANG", "LC_ALL", "TERM", "XDG_CACHE_HOME", "TRIVY_CACHE_DIR", "OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY"];

/**
 * The environment a tool runs with.
 * @param {object} o
 * @param {string} o.tmp - this run's temp folder
 * @param {boolean} [o.keepHome] - the tool reads its database or templates from the user's home
 * @param {object} [o.extra] - tool settings (e.g. SEMGREP_SEND_METRICS=off)
 * @param {object} [o.from] - the environment to pick from (process.env)
 */
export function minimalEnv({ tmp, keepHome = false, extra = {}, from = process.env } = {}) {
  const env = { PATH: from.PATH || "/usr/bin:/bin", HOME: keepHome ? (from.HOME || homedir()) : tmp, TMPDIR: tmp };
  for (const k of PASS_THROUGH) if (from[k]) env[k] = from[k];
  return { ...env, ...extra };
}

/**
 * Run one tool. Never throws for the tool's own failures: the result says
 * what happened.
 *
 * @param {object} o
 * @param {string} o.cmd - absolute path of the tool
 * @param {string[]} o.args
 * @param {string} o.cwd - a private temp folder, never the scanned repository
 * @param {object} o.env - from minimalEnv()
 * @param {number} [o.timeoutMs]
 * @param {number} [o.maxBytes] - per stream
 * @param {"deny"|"loopback"|"allow"} [o.network] - "deny" wraps the tool in the sandbox when there is
 *   one; "loopback" allows connections to this machine only (macOS); "allow" does not wrap it
 * @param {string|null} [o.sandbox] - from detectSandbox()
 * @returns {Promise<{ exitCode: number|null, signal: string|null, stdout: string, stderr: string,
 *   timedOut: boolean, overflow: boolean, durationMs: number, networkDenied: boolean, error: string|null }>}
 */
export function runTool({ cmd, args, cwd, env, timeoutMs = DEFAULT_TIMEOUT_S * 1000, maxBytes = DEFAULT_MAX_BYTES, network = "deny", sandbox = null }) {
  const wrapped = (network === "deny" || network === "loopback") && sandbox ? wrapOffline(sandbox, cmd, args, { loopback: network === "loopback" }) : { cmd, args };
  const started = Date.now();
  return new Promise((done) => {
    let child;
    try {
      child = spawn(wrapped.cmd, wrapped.args, { cwd, env, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      done({ exitCode: null, signal: null, stdout: "", stderr: "", timedOut: false, overflow: false, durationMs: 0, networkDenied: false, error: e.message });
      return;
    }
    const out = { stdout: [], stderr: [], bytes: { stdout: 0, stderr: 0 } };
    let timedOut = false;
    let overflow = false;
    let settled = false;
    const kill = () => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* gone */ } }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    for (const stream of ["stdout", "stderr"]) {
      child[stream].on("data", (buf) => {
        if (overflow) return;
        out.bytes[stream] += buf.length;
        if (out.bytes[stream] > maxBytes) {
          overflow = true;
          kill();
          return;
        }
        out[stream].push(buf);
      });
    }
    const finish = (exitCode, signal, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({
        exitCode, signal,
        stdout: Buffer.concat(out.stdout).toString("utf-8"),
        stderr: Buffer.concat(out.stderr).toString("utf-8"),
        timedOut, overflow,
        durationMs: Date.now() - started,
        networkDenied: wrapped.cmd !== cmd,
        error,
      });
    };
    child.on("error", (e) => finish(null, null, e.message));
    child.on("close", (code, signal) => finish(code, signal));
  });
}

/** A command line for the report, with the scanned root and the temp folder replaced by placeholders. */
export function displayCommand(name, args, { root = null, tmp = null } = {}) {
  const show = (a) => {
    let s = String(a);
    if (tmp) s = s.split(tmp + sep).join("<tmp>/").split(tmp).join("<tmp>");
    if (root) s = s.split(root).join("<root>");
    return /[\s"'$`\\]/.test(s) ? JSON.stringify(s) : s;
  };
  return [name, ...args.map(show)].join(" ");
}
