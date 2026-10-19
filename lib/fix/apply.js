/**
 * applyDiff: the one place fix recipes' diffs get written to disk.
 *
 * Planning never writes. Applying is a separate, explicit step that refuses to
 * write outside the repo, into any .git (any case, any depth), to .gitmodules,
 * through a symlink anywhere in the path, or into a dirty git tree (unless the
 * caller passes allowDirty), and writes nothing unless every hunk applies.
 */
import { existsSync, readFileSync, mkdirSync, realpathSync, lstatSync, openSync, writeSync, closeSync, constants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createGit } from "../../src/agent/git.js";
import { parsePatch, applyHunks } from "./diff.js";

export class FixError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FixError";
    this.code = code;
  }
}

function inside(root, p) {
  const rel = relative(root, p);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

// Code points HFS+ ignores in names, so ".g\u200cit" is ".git" on macOS (CVE-2014-9390).
const IGNORABLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff]/g;

/**
 * The name a path segment resolves to on case-insensitive file systems
 * (macOS, Windows): case folded, ignorable code points dropped, and the
 * trailing dots and spaces Windows strips removed.
 */
export function canonicalSegment(seg) {
  return String(seg).normalize("NFC").replace(IGNORABLE, "").replace(/[. ]+$/, "").toLowerCase();
}

/** True for a segment that names the git directory: .git, .GIT, .Git., or the 8.3 alias GIT~1. */
export function isGitDirSegment(seg) {
  const c = canonicalSegment(seg);
  return c === ".git" || /^git~\d+$/.test(c);
}

/** Files a fix diff may never touch even though they live in the work tree. */
const PROTECTED_FILES = new Set([".gitmodules"]);

/**
 * Throws unless no component of `target` below `root` is a symlink. Every
 * existing component is lstat-ed, so neither a symlinked directory nor a
 * dangling symlink at the file itself can redirect a write.
 */
function assertNoSymlinks(root, target, file) {
  let cur = root;
  for (const seg of relative(root, target).split(sep)) {
    cur = join(cur, seg);
    let st;
    try {
      st = lstatSync(cur);
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    if (st.isSymbolicLink()) {
      throw new FixError(`Refusing to write ${file}: ${relative(root, cur)} is a symlink, and fix diffs never write through symlinks`, "SYMLINK");
    }
  }
}

/** Resolve a diff path to an absolute path inside the repo, or throw. */
function safeTarget(root, file) {
  if (!file || isAbsolute(file) || file.includes("\0") || /^[a-zA-Z]:/.test(file)) {
    throw new FixError(`Refusing to write ${JSON.stringify(file)}: paths in a diff must be relative to the repo`, "OUTSIDE_REPO");
  }
  const segs = file.split(/[\\/]/);
  if (segs.includes("..")) throw new FixError(`Refusing to write ${file}: it is outside the repo`, "OUTSIDE_REPO");
  // Any .git at any depth, in any case: on macOS .GIT/hooks/pre-commit is .git/hooks/pre-commit.
  if (segs.some(isGitDirSegment)) throw new FixError(`Refusing to write ${file}: it is inside .git`, "OUTSIDE_REPO");
  if (segs.some((s) => PROTECTED_FILES.has(canonicalSegment(s)))) {
    throw new FixError(`Refusing to write ${file}: fix diffs never edit .gitmodules (it can point git at other repositories)`, "PROTECTED");
  }
  const target = resolve(root, file);
  if (!inside(root, target) || target === root) throw new FixError(`Refusing to write ${file}: it is outside the repo`, "OUTSIDE_REPO");
  assertNoSymlinks(root, target, file);
  return target;
}

/** Throws unless repoPath is in a git work tree with no uncommitted changes under it. */
export function assertCleanTree(repoPath) {
  let status;
  try {
    // The hardened runner: no fsmonitor, no hooks, no transports (src/agent/git.js).
    const git = createGit(repoPath);
    git.run("rev-parse", "--is-inside-work-tree");
    status = git.run("status", "--porcelain", "--", ".");
  } catch {
    throw new FixError(`${repoPath} is not a git work tree, so a fix could not be reviewed or reverted. Commit it to git first, or pass --allow-dirty.`, "NOT_GIT");
  }
  if (status.trim()) {
    throw new FixError(`${repoPath} has uncommitted changes. Commit or stash them first so the fix is its own reviewable change, or pass --allow-dirty.`, "DIRTY");
  }
}

const NOFOLLOW = constants.O_NOFOLLOW || 0;

/** Write one file: create exclusively, or overwrite in place, never through a symlink. */
function writeTarget(root, w) {
  assertNoSymlinks(root, w.target, w.path); // again, right before writing
  mkdirSync(dirname(w.target), { recursive: true });
  assertNoSymlinks(root, w.target, w.path);
  const flags = constants.O_WRONLY | NOFOLLOW | (w.created ? constants.O_CREAT | constants.O_EXCL : constants.O_TRUNC);
  const fd = openSync(w.target, flags, 0o644);
  try {
    const buf = Buffer.from(w.after, "utf-8");
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
  } finally {
    closeSync(fd);
  }
}

/**
 * Apply a unified diff to files under repoPath.
 *
 * @param {string} repoPath
 * @param {string} diff
 * @param {{ dryRun?: boolean, allowDirty?: boolean }} [opts]
 * @returns {{ applied: boolean, files: { path: string, created: boolean }[] }}
 */
export function applyDiff(repoPath, diff, opts = {}) {
  const root = realpathSync(resolve(repoPath));
  const parsed = parsePatch(diff);
  if (parsed.length === 0) throw new FixError("The diff contains no file changes", "EMPTY");
  if (!opts.allowDirty) assertCleanTree(root);

  const writes = [];
  for (const f of parsed) {
    if (!f.newPath) throw new FixError(`Refusing to delete ${f.oldPath}: fix diffs never delete files`, "DELETE");
    if (f.oldPath && f.oldPath !== f.newPath) throw new FixError(`Refusing to rename ${f.oldPath}: fix diffs never rename files`, "RENAME");
    const target = safeTarget(root, f.newPath);
    const exists = existsSync(target);
    if (exists && !lstatSync(target).isFile()) throw new FixError(`Refusing to write ${f.newPath}: it is not a regular file`, "CONFLICT");
    if (!f.oldPath && exists) throw new FixError(`${f.newPath} already exists; the plan expected to create it`, "CONFLICT");
    if (f.oldPath && !exists) throw new FixError(`${f.newPath} does not exist; the plan expected to edit it`, "CONFLICT");
    const before = exists ? readFileSync(target, "utf-8") : null;
    let after;
    try {
      after = applyHunks(before, f.hunks);
    } catch (e) {
      throw new FixError(`${f.newPath}: ${e.message}`, "CONFLICT");
    }
    writes.push({ path: f.newPath, target, after, created: !exists });
  }

  if (!opts.dryRun) {
    for (const w of writes) writeTarget(root, w);
  }
  return { applied: !opts.dryRun, files: writes.map((w) => ({ path: w.path, created: w.created })) };
}
