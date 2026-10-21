/**
 * node:fs over an in-memory folder. The page mounts the visitor's files under
 * /repo and Penthera's own rule packs and lists under /penthera, then lib/
 * reads them through these calls exactly as it reads a disk in the CLI.
 * Read-only: nothing in the check writes.
 */
import { Buffer } from "./buffer.js";
import { normalize } from "./path.js";

const files = new Map(); // absolute path -> Buffer

const toPath = (p) => normalize(p instanceof URL ? decodeURIComponent(p.pathname) : String(p));

function enoent(p, call) {
  const e = new Error(`ENOENT: no such file or directory, ${call} '${p}'`);
  e.code = "ENOENT";
  return e;
}

function isDir(p) {
  if (p === "/") return true;
  const prefix = p + "/";
  for (const k of files.keys()) if (k.startsWith(prefix)) return true;
  return false;
}

class Stats {
  constructor(kind, size) { this.kind = kind; this.size = size; this.mode = kind === "dir" ? 0o40755 : 0o100644; }
  isFile() { return this.kind === "file"; }
  isDirectory() { return this.kind === "dir"; }
  isSymbolicLink() { return false; }
}

class Dirent {
  constructor(name, kind) { this.name = name; this.kind = kind; }
  isFile() { return this.kind === "file"; }
  isDirectory() { return this.kind === "dir"; }
  isSymbolicLink() { return false; }
}

// ── Mounting (used by the engine, not by lib/) ─────────────────────────────

/** Put a file in the folder. `data` is a string or bytes. */
export function mount(path, data) {
  const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  files.set(normalize(path), buf);
  return buf;
}

/** Remove everything under a prefix, e.g. "/repo" between checks. */
export function unmount(prefix) {
  const p = normalize(prefix);
  for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k);
}

// ── node:fs ────────────────────────────────────────────────────────────────

export function existsSync(p) {
  const n = toPath(p);
  return files.has(n) || isDir(n);
}

export function statSync(p) {
  const n = toPath(p);
  if (files.has(n)) return new Stats("file", files.get(n).length);
  if (isDir(n)) return new Stats("dir", 0);
  throw enoent(n, "stat");
}
export const lstatSync = statSync;

export function realpathSync(p) {
  const n = toPath(p);
  if (!existsSync(n)) throw enoent(n, "realpath");
  return n;
}
realpathSync.native = realpathSync;

export function readlinkSync(p) {
  const e = new Error(`EINVAL: invalid argument, readlink '${toPath(p)}'`);
  e.code = "EINVAL";
  throw e;
}

export function readFileSync(p, opts) {
  const n = toPath(p);
  const buf = files.get(n);
  if (!buf) throw enoent(n, "open");
  const encoding = typeof opts === "string" ? opts : opts?.encoding;
  return encoding ? buf.toString(encoding) : buf;
}

export function readdirSync(p, opts = {}) {
  const n = toPath(p);
  if (!isDir(n)) throw enoent(n, "scandir");
  const prefix = n === "/" ? "/" : n + "/";
  const seen = new Map();
  for (const k of files.keys()) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length);
    const name = rest.split("/")[0];
    seen.set(name, rest.includes("/") ? "dir" : "file");
  }
  const names = [...seen.keys()].sort();
  return opts.withFileTypes ? names.map((name) => new Dirent(name, seen.get(name))) : names;
}

// File descriptors, for lib/whitebox/secrets.js.
const fds = new Map();
let nextFd = 3;
export const constants = { O_RDONLY: 0, O_NONBLOCK: 0, O_NOFOLLOW: 0 };

export function openSync(p) {
  const n = toPath(p);
  if (!files.has(n)) throw enoent(n, "open");
  fds.set(nextFd, n);
  return nextFd++;
}
export function fstatSync(fd) { return statSync(fds.get(fd)); }
export function readSync(fd, buf, off, len, pos) {
  const src = files.get(fds.get(fd));
  const chunk = src.subarray(pos, pos + len);
  buf.set(chunk, off);
  return chunk.length;
}
export function closeSync(fd) { fds.delete(fd); }

function readOnly() { throw new Error("The browser check is read-only"); }
export const writeFileSync = readOnly;
export const mkdirSync = readOnly;
export const rmSync = readOnly;

export default {
  existsSync, statSync, lstatSync, realpathSync, readlinkSync, readFileSync, readdirSync,
  openSync, fstatSync, readSync, closeSync, constants, writeFileSync, mkdirSync, rmSync,
};
