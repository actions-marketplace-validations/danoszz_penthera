/**
 * Where a package's files come from, offline.
 *
 * The capability scanner reads files through a small source interface so the
 * same code can scan an installed folder in node_modules or a tarball from
 * npm's local content cache. The cache is what makes `--diff` work without a
 * network: npm stores every tarball it has downloaded under its integrity hash,
 * and a lockfile records that hash, so an old version can be read back exactly
 * and verified byte for byte.
 */
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { homedir } from "node:os";

const MAX_FILES = 5000;

/** Files of an installed package folder. Skips nested node_modules and symlinks. */
export class DirSource {
  constructor(dir, { skip } = {}) {
    this.dir = dir;
    this.kind = "installed";
    this.skip = skip || null;
  }

  files() {
    if (this._files) return this._files;
    const out = [];
    const walk = (d) => {
      let entries;
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (out.length >= MAX_FILES) return;
        const p = join(d, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".git" || this.skip?.has(e.name)) continue;
          walk(p);
        } else if (e.isFile()) {
          out.push(relative(this.dir, p).split(sep).join("/"));
        }
      }
    };
    walk(this.dir);
    this._files = out;
    return out;
  }

  size(rel) {
    try { return lstatSync(join(this.dir, rel)).size; } catch { return 0; }
  }

  read(rel) {
    return readFileSync(join(this.dir, rel));
  }
}

/** Files of an unpacked tarball, held in memory. */
export class MapSource {
  constructor(map, kind = "npm-cache") {
    this.map = map;
    this.kind = kind;
  }

  files() {
    return [...this.map.keys()].sort().slice(0, MAX_FILES);
  }

  size(rel) {
    return this.map.get(rel)?.length || 0;
  }

  read(rel) {
    return this.map.get(rel);
  }
}

// ── Tarballs ──────────────────────────────────────────────────────────────

function cstr(buf, start, len) {
  const s = buf.subarray(start, start + len);
  const z = s.indexOf(0);
  return (z === -1 ? s : s.subarray(0, z)).toString("utf-8");
}

/**
 * Minimal tar reader (ustar + pax/GNU long names). Returns Map<path, Buffer>
 * with the leading "package/" directory stripped. Only regular files are kept;
 * paths that try to climb out ("..") are dropped.
 */
export function untar(buf) {
  const files = new Map();
  let off = 0;
  let longName = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    let name = cstr(header, 0, 100);
    const size = parseInt(cstr(header, 124, 12).trim() || "0", 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const prefix = cstr(header, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;

    if (type === "x") { // pax extended header
      const m = body.toString("utf-8").match(/\d+ path=([^\n]*)\n/);
      if (m) longName = m[1];
      continue;
    }
    if (type === "L") { // GNU long name
      longName = cstr(body, 0, body.length);
      continue;
    }
    if (type === "g") continue;
    if (longName) { name = longName; longName = null; }
    if (type !== "0" && type !== "\0" && type !== "7") continue;
    const parts = name.split("/").filter(Boolean);
    parts.shift(); // top-level folder, usually "package"
    if (parts.length === 0 || parts.includes("..")) continue;
    files.set(parts.join("/"), Buffer.from(body));
  }
  return files;
}

/** Split an SRI string into { algo, hex } entries. */
export function parseIntegrity(sri) {
  return String(sri || "").split(/\s+/).filter(Boolean).map((s) => {
    const i = s.indexOf("-");
    if (i === -1) return null;
    const algo = s.slice(0, i);
    const b64 = s.slice(i + 1).replace(/\?.*$/, "");
    return { algo, hex: Buffer.from(b64, "base64").toString("hex") };
  }).filter((x) => x && /^sha(1|256|384|512)$/.test(x.algo) && x.hex);
}

/** True when the bytes match the SRI integrity string. */
export function verifyIntegrity(bytes, sri) {
  const entries = parseIntegrity(sri);
  if (entries.length === 0) return false;
  return entries.some(({ algo, hex }) => createHash(algo).update(bytes).digest("hex") === hex);
}

/** npm's cache directory: npm_config_cache, else ~/.npm. */
export function npmCacheDir(env = process.env) {
  return env.npm_config_cache || env.NPM_CONFIG_CACHE || join(homedir(), ".npm");
}

/**
 * Read a package tarball from npm's content-addressed cache (cacache) by its
 * lockfile integrity, verify it, and unpack it. Returns a MapSource or null.
 */
export function sourceFromNpmCache(integrity, cacheDir = npmCacheDir()) {
  for (const { algo, hex } of parseIntegrity(integrity)) {
    const p = join(cacheDir, "_cacache", "content-v2", algo, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
    if (!existsSync(p)) continue;
    try {
      const tgz = readFileSync(p);
      if (!verifyIntegrity(tgz, integrity)) continue;
      return new MapSource(untar(gunzipSync(tgz)), "npm-cache");
    } catch { /* corrupt entry, try the next hash */ }
  }
  return null;
}

/** Unpack a verified tarball buffer (used by --online). */
export function sourceFromTarball(tgz, integrity, kind = "registry") {
  if (integrity && !verifyIntegrity(tgz, integrity)) return null;
  return new MapSource(untar(gunzipSync(tgz)), kind);
}
