/**
 * penthera.lock: SHA-256 pins for skills, MCP server definitions, hooks and
 * installed plugins. A skill or server that changes after you reviewed it (a
 * "rug pull") shows up as a changed entry on the next run.
 *
 * The file is deterministic (sorted keys, no timestamps) so it diffs cleanly
 * in git.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readlinkSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { walk } from "./discover.js";

export const LOCK_FILENAME = "penthera.lock";
const LOCK_VERSION = 1;

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** Stable JSON: object keys sorted at every level. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Hash a folder: every file's path and content hash, plus symlink targets. */
export function hashDir(dir) {
  const { files, symlinks } = walk(dir, { maxDepth: 12, maxFiles: 20000 });
  const lines = [];
  for (const f of files) {
    let content;
    try { content = readFileSync(f); } catch { content = Buffer.alloc(0); }
    lines.push(`${relative(dir, f).split(sep).join("/")}\0${sha256(content)}`);
  }
  for (const l of symlinks) {
    let target = "";
    try { target = readlinkSync(l); } catch { /* broken */ }
    lines.push(`${relative(dir, l).split(sep).join("/")}\0link:${target}`);
  }
  lines.sort();
  return sha256(lines.join("\n"));
}

function scopeOf(display) {
  return display.startsWith("~/") || display.startsWith("/") ? "home" : "repo";
}

/** Compute the current lock entries for an inventory. */
export function computeLockEntries(inv) {
  const entries = {};
  for (const s of inv.skills) {
    entries[`skill:${s.display}`] = { kind: "skill", scope: scopeOf(s.display), sha256: hashDir(s.dir) };
  }
  for (const m of inv.mcpServers) {
    entries[`mcp:${m.file}#${m.name}`] = { kind: "mcp", scope: scopeOf(m.file), sha256: sha256(canonicalJson(m.def)) };
  }
  for (const h of inv.hooks) {
    entries[h.key] = { kind: "hook", scope: scopeOf(h.file), sha256: sha256(canonicalJson({ event: h.event, matcher: h.matcher, hook: h.hook })) };
  }
  for (const p of inv.plugins) {
    entries[`plugin:${p.id}`] = { kind: "plugin", scope: "home", sha256: sha256(canonicalJson({ version: p.version, gitCommitSha: p.gitCommitSha })) };
  }
  return entries;
}

export function serializeLock(entries) {
  const sorted = {};
  for (const k of Object.keys(entries).sort()) sorted[k] = entries[k];
  return JSON.stringify({
    lockfileVersion: LOCK_VERSION,
    generator: "penthera agents --pin",
    note: "SHA-256 pins for agent skills, MCP servers, hooks and plugins. Review changes before re-pinning.",
    entries: sorted,
  }, null, 2) + "\n";
}

export function lockPath(root) {
  return join(root, LOCK_FILENAME);
}

/** Read a lock file. Returns null when absent; throws on a corrupt file. */
export function readLock(path) {
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, "utf-8"));
  if (!json || typeof json.entries !== "object") throw new Error("missing `entries`");
  return json;
}

export function writeLock(path, entries) {
  writeFileSync(path, serializeLock(entries));
}

/**
 * Diff a lock against current entries. Entries for a scope that wasn't scanned
 * this run (home, without --home) are not reported as removed.
 */
export function diffLock(lock, current, { scopes = ["repo"] } = {}) {
  const pinned = lock?.entries || {};
  const changed = [];
  const added = [];
  const removed = [];
  for (const [key, cur] of Object.entries(current)) {
    const old = pinned[key];
    if (!old) added.push({ key, ...cur });
    else if (old.sha256 !== cur.sha256) changed.push({ key, ...cur, previous: old.sha256 });
  }
  for (const [key, old] of Object.entries(pinned)) {
    if (!current[key] && scopes.includes(old.scope || "repo")) removed.push({ key, ...old });
  }
  return { changed, added, removed };
}
