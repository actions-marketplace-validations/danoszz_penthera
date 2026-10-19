/**
 * applyDiff: the one place fix recipes' diffs get written to disk.
 *
 * Planning never writes. Applying is a separate, explicit step that refuses to
 * write outside the repo, into .git, or into a dirty git tree (unless the caller
 * passes allowDirty), and writes nothing unless every hunk applies.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
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

/** Resolve a diff path to an absolute path inside the repo, or throw. */
function safeTarget(root, file) {
  if (!file || isAbsolute(file) || file.includes("\0")) {
    throw new FixError(`Refusing to write ${JSON.stringify(file)}: paths in a diff must be relative to the repo`, "OUTSIDE_REPO");
  }
  const target = resolve(root, file);
  if (!inside(root, target)) throw new FixError(`Refusing to write ${file}: it is outside the repo`, "OUTSIDE_REPO");
  if (relative(root, target).split(sep)[0] === ".git") throw new FixError(`Refusing to write ${file}: it is inside .git`, "OUTSIDE_REPO");
  // Follow symlinks: the real location of the file (or its nearest existing
  // parent, for a new file) must still be inside the repo.
  let probe = target;
  while (!existsSync(probe)) probe = dirname(probe);
  if (!inside(root, realpathSync(probe))) throw new FixError(`Refusing to write ${file}: it resolves outside the repo`, "OUTSIDE_REPO");
  return target;
}

/** Throws unless repoPath is in a git work tree with no uncommitted changes under it. */
export function assertCleanTree(repoPath) {
  let status;
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoPath, stdio: ["ignore", "pipe", "ignore"] });
    status = execFileSync("git", ["status", "--porcelain", "--", "."], { cwd: repoPath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new FixError(`${repoPath} is not a git work tree, so a fix could not be reviewed or reverted. Commit it to git first, or pass --allow-dirty.`, "NOT_GIT");
  }
  if (status.trim()) {
    throw new FixError(`${repoPath} has uncommitted changes. Commit or stash them first so the fix is its own reviewable change, or pass --allow-dirty.`, "DIRTY");
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
    for (const w of writes) {
      mkdirSync(dirname(w.target), { recursive: true });
      writeFileSync(w.target, w.after);
    }
  }
  return { applied: !opts.dryRun, files: writes.map((w) => ({ path: w.path, created: w.created })) };
}
