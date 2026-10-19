/**
 * package-lock.json reader for `penthera deps`.
 *
 * Turns a lockfile (v1, v2 or v3) into a flat, sorted list of installed
 * packages with the fields the capability scanner and the diff need: where the
 * package lives in node_modules, its exact version, and its integrity hash (the
 * key into npm's offline content cache).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/** Package name from a lockfile v2/v3 key like node_modules/a/node_modules/@s/b. */
export function nameFromLockPath(key) {
  const i = key.lastIndexOf("node_modules/");
  return i === -1 ? key : key.slice(i + "node_modules/".length);
}

/**
 * Parse lockfile JSON into packages.
 * @returns {{ name, version, path, integrity, resolved, dev, optional, hasInstallScript, link, license }[]}
 *   license: the lockfile's license field (v2/v3 only; v1 lockfiles have none)
 */
export function parseLockfile(lock) {
  const out = [];
  if (lock && lock.packages) {
    for (const [key, v] of Object.entries(lock.packages)) {
      if (key === "" || !v) continue;
      // Workspace members appear twice: a link entry under node_modules and the
      // real folder. Keep the node_modules view, skip the source folder entry.
      if (!key.includes("node_modules/")) continue;
      const name = v.name || nameFromLockPath(key);
      out.push({
        name,
        version: v.version || null,
        path: key,
        integrity: v.integrity || null,
        resolved: v.resolved || null,
        dev: !!v.dev,
        optional: !!(v.optional || v.devOptional),
        hasInstallScript: !!v.hasInstallScript,
        link: !!v.link,
        license: typeof v.license === "string" ? v.license : null,
      });
    }
  } else if (lock && lock.dependencies) {
    const walk = (deps, prefix) => {
      for (const [name, v] of Object.entries(deps)) {
        if (!v) continue;
        const path = `${prefix}node_modules/${name}`;
        out.push({
          name,
          version: v.version || null,
          path,
          integrity: v.integrity || null,
          resolved: v.resolved || null,
          dev: !!v.dev,
          optional: !!v.optional,
          hasInstallScript: false,
          link: String(v.version || "").startsWith("file:"),
          license: null,
        });
        if (v.dependencies) walk(v.dependencies, `${path}/`);
      }
    };
    walk(lock.dependencies, "");
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Direct dependency names declared by the root project (from the lockfile root entry). */
export function directDependencies(lock) {
  const root = lock?.packages?.[""] || {};
  const names = new Set([
    ...Object.keys(root.dependencies || {}),
    ...Object.keys(root.devDependencies || {}),
    ...Object.keys(root.optionalDependencies || {}),
  ]);
  return [...names].sort();
}

/** Read and parse a lockfile from disk. */
export function readLockfile(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Locate package-lock.json (or npm-shrinkwrap.json) in a project directory. */
export function findLockfile(dir) {
  for (const f of ["package-lock.json", "npm-shrinkwrap.json"]) {
    const p = join(dir, f);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Throws unless `ref` is a plain git revision: no leading "-" (it would be
 * read as an option, e.g. --output=<file>) and only characters revisions use.
 * `--base` reaches here from the command line and from CI inputs.
 */
export function assertSafeRef(ref) {
  if (typeof ref !== "string" || !/^[A-Za-z0-9_./@^~{}+-]{1,256}$/.test(ref) || ref.startsWith("-") || ref.includes("..")) {
    throw new Error(`Invalid git ref ${JSON.stringify(String(ref).slice(0, 80))}: use a branch, tag or commit (letters, digits and . _ / @ ^ ~ { } + -, not starting with -)`);
  }
  return ref;
}

/**
 * git for reading a scanned repo: no fsmonitor, no hooks, no transports.
 * Read-only plumbing only (rev-parse, show, ls-tree).
 */
export function readOnlyGit(dir) {
  return (args) => execFileSync("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "protocol.allow=never", ...args], {
    cwd: dir, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * Read the lockfile as it was at a git ref (for `--base <ref>`).
 * Only runs `git show`; no fetch, no checkout.
 */
export function readLockfileAtRef(dir, ref) {
  assertSafeRef(ref);
  const git = readOnlyGit(dir);
  const prefix = git(["rev-parse", "--show-prefix"]).trim();
  for (const f of ["package-lock.json", "npm-shrinkwrap.json"]) {
    try {
      return JSON.parse(git(["show", "--end-of-options", `${ref}:${prefix}${f}`]));
    } catch { /* try the next name */ }
  }
  throw new Error(`No package-lock.json at ${ref} in ${dir}`);
}
