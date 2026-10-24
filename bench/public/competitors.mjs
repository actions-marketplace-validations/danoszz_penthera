/**
 * E11b reference points: other open-source tools on the same split, scored
 * the same way (amendment E11b § 5). Not part of E11's registered hypotheses.
 *
 *   npm run bench:public -- --competitors --split dev [--only creddata,malware] [--tools a,b]
 *
 * Tools are pinned, installed into $PENTHERA_BENCH_CACHE/public/tools, and run
 * under macOS `sandbox-exec` with all network access denied, so a tool that
 * needs the network at scan time fails instead of reaching out. GuardDog
 * applies its own kernel sandbox, which always blocks the network and cannot
 * nest inside ours; it refuses to scan when that sandbox is unavailable. Malware rules
 * as in E11 § 10: samples only under MALWARE_DIR, never installed or run,
 * deleted at the end.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync, readdirSync, lstatSync, linkSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { CACHE, RESULTS, MALWARE_DIR, fetchBuf, ensureDir, sh, fmt } from "./common.mjs";
import { currentSplit, inSplit } from "./split.mjs";

// Each tool pinned to the newest release that was at least four days old on
// 2026-10-24. sha256 is checked on every download: against the release's own
// checksum file where it publishes one (gitleaks, trufflehog), the GitHub
// release asset digest (kingfisher), or the hash of the first download
// (noseyparker, ripsecrets, which publish none).
export const TOOLS = {
  gitleaks: { version: "8.30.1", url: "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_arm64.tar.gz", sums: "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt" },
  "detect-secrets": { version: "1.5.0", pip: "detect-secrets==1.5.0" },
  guarddog: { version: "3.2.0", pip: "guarddog==3.2.0" },
  trufflehog: { version: "3.99.3", url: "https://github.com/trufflesecurity/trufflehog/releases/download/v3.99.3/trufflehog_3.99.3_darwin_arm64.tar.gz", sums: "https://github.com/trufflesecurity/trufflehog/releases/download/v3.99.3/trufflehog_3.99.3_checksums.txt", sha256: "07d8744261d4460c2e8ee8d908d71e4aee70e049496100290b50aac7757ad078", bin: "trufflehog" },
  noseyparker: { version: "0.24.0", url: "https://github.com/praetorian-inc/noseyparker/releases/download/v0.24.0/noseyparker-v0.24.0-aarch64-apple-darwin.tar.gz", sha256: "b19f983d586a738f127bc8c53ef1331055010db4926ac1789791f717fcc107b7", bin: "bin/noseyparker" },
  kingfisher: { version: "2.14.0", url: "https://github.com/mongodb/kingfisher/releases/download/v2.14.0/kingfisher-darwin-arm64.tgz", sha256: "df6710130fac7314a6479e3ac7b2b092f8aa3a2bef131fbd307fa3dd8d7d9471", bin: "kingfisher" },
  ripsecrets: { version: "0.1.11", url: "https://github.com/sirwart/ripsecrets/releases/download/v0.1.11/ripsecrets-0.1.11-aarch64-apple-darwin.tar.gz", sha256: "b2c822742e8cbf355ba0cb4cc690c3cd8fdc9ec1916c8148f27bd9098cb7aee4", bin: "ripsecrets-0.1.11-aarch64-apple-darwin/ripsecrets" },
  credsweeper: { version: "1.19.4", pip: "credsweeper==1.19.4", venv: "venv-credsweeper", bin: "credsweeper", caveat: "trained on this dataset, not comparable: made by the CredData authors, its ML model was trained with CredData" },
  whispers: { version: "2.4.0", pip: "whispers==2.4.0", venv: "venv-whispers", bin: "whispers" },
  deepsecrets: { version: "2.2.0", pip: "deepsecrets==2.2.0", venv: "venv-deepsecrets", bin: "deepsecrets" },
  secretlint: { version: "13.0.7", npm: ["secretlint@13.0.7", "@secretlint/secretlint-rule-preset-recommend@13.0.7"] },
};
// Not run: Semgrep's public p/secrets ruleset is fetched from the registry at
// scan time, which breaks the no-network rule (and AGENTS.md rule 5).
export const SKIPPED = { "semgrep p/secrets": "downloads its rules from the Semgrep registry at scan time; cannot run offline" };
const TOOLS_DIR = join(CACHE, "tools");
const OFFLINE = "(version 1)(allow default)(deny network*)";
// Python multiprocessing (credsweeper's SyncManager, deepsecrets' forkserver)
// talks over Unix-domain sockets. This profile allows those and nothing else:
// every IP connection is still denied.
const OFFLINE_UNIX = `${OFFLINE}(allow network* (local unix-socket))(allow network* (remote unix-socket))`;
const TIMEOUT = 1_800_000; // 30 minutes per tool run on dev

/** Run a command with every network operation denied by the kernel sandbox. */
function offline(cmd, args, opts = {}) {
  return spawnSync("sandbox-exec", ["-p", opts.profile || OFFLINE, cmd, ...args], {
    encoding: "utf-8", maxBuffer: 1 << 30, timeout: 3_600_000,
    env: { PATH: process.env.PATH, HOME: TOOLS_DIR, SEMGREP_SEND_METRICS: "off", SEMGREP_ENABLE_VERSION_CHECK: "0", ...opts.env },
    ...opts,
  });
}

async function install() {
  ensureDir(TOOLS_DIR);
  const gl = join(TOOLS_DIR, "gitleaks");
  if (!existsSync(gl)) {
    const tgz = await fetchBuf(TOOLS.gitleaks.url);
    const sums = (await fetchBuf(TOOLS.gitleaks.sums)).toString("utf-8");
    const want = sums.split("\n").find((l) => l.endsWith(TOOLS.gitleaks.url.split("/").pop()))?.split(/\s+/)[0];
    if (createHash("sha256").update(tgz).digest("hex") !== want) throw new Error("gitleaks checksum mismatch");
    const t = join(TOOLS_DIR, "gitleaks.tgz");
    writeFileSync(t, tgz);
    sh("tar", ["-xzf", t, "-C", TOOLS_DIR, "gitleaks"]);
  }
  const venv = join(TOOLS_DIR, "venv");
  if (!existsSync(join(venv, "bin", "python"))) {
    sh(process.env.PYTHON || "python3.12", ["-m", "venv", venv]);
    sh(join(venv, "bin", "pip"), ["install", "-q", TOOLS["detect-secrets"].pip, TOOLS.guarddog.pip], { stdio: ["ignore", "inherit", "inherit"] });
  }
  const bin = { gitleaks: gl, detectSecrets: join(venv, "bin", "detect-secrets"), guarddog: join(venv, "bin", "guarddog") };
  for (const [name, t] of Object.entries(TOOLS)) {
    try {
      if (t.url && t.bin) bin[name] = await installRelease(name, t);
      else if (t.venv) bin[name] = installPip(t);
      else if (t.npm) bin[name] = installNpm(name, t);
    } catch (e) {
      bin[name] = { error: `did not install: ${String(e.message || e).split("\n")[0].slice(0, 300)}` };
    }
  }
  return bin;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** A pinned GitHub release archive, hash checked, unpacked into tools/<name>-<version>. */
async function installRelease(name, t) {
  const dir = join(TOOLS_DIR, `${name}-${t.version}`);
  const exe = join(dir, t.bin);
  if (existsSync(exe)) return exe;
  const buf = await fetchBuf(t.url);
  if (!buf) throw new Error(`${t.url} not found`);
  if (t.sums) {
    const sums = (await fetchBuf(t.sums)).toString("utf-8");
    const want = sums.split("\n").find((l) => l.trim().endsWith(t.url.split("/").pop()))?.split(/\s+/)[0];
    if (want !== t.sha256) throw new Error(`${name}: published checksum ${want} differs from the pin`);
  }
  if (sha256(buf) !== t.sha256) throw new Error(`${name} checksum mismatch`);
  ensureDir(dir);
  const arc = join(dir, t.url.split("/").pop());
  writeFileSync(arc, buf);
  sh("tar", ["-xzf", arc, "-C", dir]);
  rmSync(arc);
  return exe;
}

/** A pinned PyPI package in its own venv under tools/, so dependencies cannot clash. */
function installPip(t) {
  const venv = join(TOOLS_DIR, t.venv);
  const exe = join(venv, "bin", t.bin);
  if (existsSync(exe)) return exe;
  rmSync(venv, { recursive: true, force: true });
  sh(process.env.PYTHON || "python3.12", ["-m", "venv", venv]);
  sh(join(venv, "bin", "pip"), ["install", "-q", t.pip], { stdio: ["ignore", "inherit", "inherit"], timeout: 900_000 });
  return exe;
}

/** Pinned npm packages under tools/<name>, install scripts off. */
function installNpm(name, t) {
  const prefix = join(TOOLS_DIR, name);
  const exe = join(prefix, "node_modules", ".bin", name);
  if (existsSync(exe)) return exe;
  sh("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund", "--ignore-scripts", "--save-exact", ...t.npm], { timeout: 900_000 });
  return exe;
}

// ── CredData ──────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    const st = lstatSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

/** File path as CredData's meta has it ("data/<repo>/..."), from what a tool printed. */
function relPath(tree, f) {
  let p = String(f).split(sep).join("/");
  if (p.startsWith("/")) p = relative(tree, p).split(sep).join("/");
  return p.replace(/^(\.\/)+/, "");
}

/** Run one tool under the sandbox, cwd = the split tree; null stdout on timeout. */
function run(cmd, args, tree, opts = {}) {
  const r = offline(cmd, args, { cwd: tree, timeout: TIMEOUT, ...opts });
  if (r.error?.code === "ETIMEDOUT" || r.signal === "SIGTERM") throw Object.assign(new Error("timeout after 30 minutes"), { timeout: true });
  if (r.error) throw r.error;
  return r;
}

const jsonl = (text) => text.split("\n").filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// One entry per tool: how it scans the split tree (cwd = tree, target "data"),
// with the tool's default rules; only network verification and update checks
// are turned off. Each returns the exact command line and {file, line, rule}
// hits; `variants` are other output modes of the same scan.
const CRED_RUNNERS = {
  gitleaks(exe, tree) {
    const out = join(TOOLS_DIR, "gitleaks.json");
    const args = ["dir", join(tree, "data"), "--report-format", "json", "--report-path", out, "--exit-code", "0", "--no-banner", "--log-level", "error"];
    const g = run(exe, args, tree);
    if (g.status !== 0) throw new Error(`gitleaks: ${g.stderr}`);
    const hits = JSON.parse(readFileSync(out, "utf-8")).map((f) => ({ file: relPath(tree, f.File), line: f.StartLine, rule: f.RuleID }));
    return { command: `gitleaks ${args.join(" ").replaceAll(tree, "<tree>").replaceAll(TOOLS_DIR, "<tools>")}`, hits };
  },
  "detect-secrets"(exe, tree) {
    const files = walk(join(tree, "data")).map((p) => relative(tree, p));
    const hits = [];
    for (let i = 0; i < files.length; i += 400) {
      const r = run(exe, ["scan", "--all-files", ...files.slice(i, i + 400)], tree);
      if (r.status !== 0) throw new Error(`detect-secrets: ${r.stderr.slice(0, 500)}`);
      for (const [file, list] of Object.entries(JSON.parse(r.stdout).results || {})) {
        for (const x of list) hits.push({ file: relPath(tree, file), line: x.line_number, rule: x.type });
      }
    }
    return { command: "detect-secrets scan --all-files <every file, 400 per call>", hits };
  },
  trufflehog(exe, tree) {
    // --no-verification: verification calls each provider's API. The default
    // --results (verified,unverified,unknown) is the main row; the variant adds
    // filtered_unverified, the results TruffleHog itself filters out.
    const parse = (r) => jsonl(r.stdout).filter((o) => o.SourceMetadata).map((o) => ({ file: relPath(tree, o.SourceMetadata.Data.Filesystem.file), line: o.SourceMetadata.Data.Filesystem.line, rule: o.DetectorName }));
    const base = ["filesystem", "data", "--no-verification", "--json", "--no-update"];
    const r = run(exe, base, tree);
    if (r.status !== 0) throw new Error(`trufflehog: ${r.stderr.slice(-500)}`);
    const all = [...base, "--results=verified,unverified,unknown,filtered_unverified"];
    const r2 = run(exe, all, tree);
    if (r2.status !== 0) throw new Error(`trufflehog: ${r2.stderr.slice(-500)}`);
    return { command: `trufflehog ${base.join(" ")}`, hits: parse(r), variants: { "trufflehog, all results": { command: `trufflehog ${all.join(" ")}`, hits: parse(r2) } } };
  },
  noseyparker(exe, tree) {
    // Findings group identical secrets; `report` lists 3 locations per finding
    // by default. The variant lists every location (--max-matches 0).
    const ds = mkdtempSync(join(TOOLS_DIR, "np-"));
    try {
      const store = join(ds, "datastore.np");
      const s1 = run(exe, ["scan", "--datastore", store, "--progress", "never", "data"], tree);
      if (s1.status !== 0) throw new Error(`noseyparker scan: ${s1.stderr.slice(-500)}`);
      const rep = (extra) => {
        const r = run(exe, ["report", "--datastore", store, "--format", "jsonl", ...extra], tree);
        if (r.status !== 0) throw new Error(`noseyparker report: ${r.stderr.slice(-500)}`);
        const hits = [];
        for (const f of jsonl(r.stdout)) for (const m of f.matches || []) for (const pv of m.provenance || []) if (pv.kind === "file") hits.push({ file: relPath(tree, pv.path), line: m.location.source_span.start.line, rule: f.rule_text_id || f.rule_name });
        return hits;
      };
      return {
        command: "noseyparker scan --datastore <tmp> --progress never data && noseyparker report --datastore <tmp> --format jsonl",
        hits: rep([]),
        variants: { "noseyparker, every match": { command: "noseyparker scan --datastore <tmp> --progress never data && noseyparker report --datastore <tmp> --format jsonl --max-matches 0", hits: rep(["--max-matches", "0"]) } },
      };
    } finally {
      rmSync(ds, { recursive: true, force: true });
    }
  },
  kingfisher(exe, tree) {
    // Default output keeps one location per distinct secret; the variant
    // (--no-dedup) prints every occurrence.
    const parse = (r) => jsonl(r.stdout).filter((o) => o.finding?.path).map((o) => ({ file: relPath(tree, o.finding.path), line: o.finding.line, rule: o.rule?.id }));
    const base = ["scan", "data", "--no-validate", "--no-update-check", "--format", "jsonl"];
    const r = run(exe, base, tree);
    if (r.status !== 0 && r.status !== 200 && r.status !== 205) throw new Error(`kingfisher: exit ${r.status} ${r.stderr.slice(-500)}`);
    const nd = [...base, "--no-dedup"];
    const r2 = run(exe, nd, tree);
    if (r2.status !== 0 && r2.status !== 200 && r2.status !== 205) throw new Error(`kingfisher: exit ${r2.status} ${r2.stderr.slice(-500)}`);
    return { command: `kingfisher ${base.join(" ")}`, hits: parse(r), variants: { "kingfisher, every occurrence": { command: `kingfisher ${nd.join(" ")}`, hits: parse(r2) } } };
  },
  ripsecrets(exe, tree) {
    // Prints path:line:text per hit; exit 1 means secrets were found.
    const r = run(exe, ["data"], tree);
    if (r.status !== 0 && r.status !== 1) throw new Error(`ripsecrets: exit ${r.status} ${r.stderr.slice(-500)}`);
    const hits = [];
    for (const l of r.stdout.split("\n")) {
      const m = /^(data\/[^:]+):(\d+):/.exec(l);
      if (m) hits.push({ file: relPath(tree, m[1]), line: +m[2], rule: "ripsecrets" });
    }
    return { command: "ripsecrets data", hits };
  },
  credsweeper(exe, tree) {
    const out = join(TOOLS_DIR, "credsweeper.json");
    rmSync(out, { force: true });
    const r = run(exe, ["--path", "data", "--save-json", out], tree, { profile: OFFLINE_UNIX });
    if (r.status !== 0 || !existsSync(out)) throw new Error(`credsweeper: exit ${r.status} ${r.stderr.slice(-500)}`);
    const hits = [];
    for (const c of JSON.parse(readFileSync(out, "utf-8"))) for (const d of c.line_data_list || []) hits.push({ file: relPath(tree, d.path), line: d.line_num, rule: c.rule });
    rmSync(out, { force: true });
    return { command: "credsweeper --path data --save-json <out>", profile: "network denied except Unix-domain sockets", hits };
  },
  whispers(exe, tree) {
    const out = join(TOOLS_DIR, "whispers.json");
    rmSync(out, { force: true });
    const r = run(exe, ["data", "-o", out], tree);
    if (!existsSync(out)) throw new Error(`whispers: exit ${r.status} ${r.stderr.slice(-500)}`);
    const hits = JSON.parse(readFileSync(out, "utf-8") || "[]").map((x) => ({ file: relPath(tree, x.file), line: x.line, rule: x.rule_id }));
    rmSync(out, { force: true });
    return { command: "whispers data -o <out>", hits };
  },
  deepsecrets(exe, tree) {
    const out = join(TOOLS_DIR, "deepsecrets.sarif");
    rmSync(out, { force: true });
    const r = run(exe, ["--target-dir", "data", "--outfile", out], tree, { profile: OFFLINE_UNIX });
    if (!existsSync(out)) throw new Error(`deepsecrets: exit ${r.status} ${r.stderr.slice(-500)}`);
    const hits = [];
    for (const res of JSON.parse(readFileSync(out, "utf-8")).runs?.[0]?.results || []) {
      for (const loc of res.locations || []) hits.push({ file: relPath(tree, join("data", loc.physicalLocation.artifactLocation.uri)), line: loc.physicalLocation.region.startLine, rule: res.ruleId });
    }
    rmSync(out, { force: true });
    return { command: "deepsecrets --target-dir data --outfile <out>", profile: "network denied except Unix-domain sockets", hits };
  },
  secretlint(exe, tree) {
    const rc = join(TOOLS_DIR, "secretlint", ".secretlintrc.json");
    writeFileSync(rc, JSON.stringify({ rules: [{ id: "@secretlint/secretlint-rule-preset-recommend" }] }));
    // The json formatter embeds every file's full text and fails on the whole
    // tree (one string too long), so the unix formatter: path:line:col: message.
    const r = run(exe, ["--secretlintrc", rc, "--format", "unix", "--maskSecrets", "data/**/*"], tree);
    if (r.status !== 0 && r.status !== 1) throw new Error(`secretlint: exit ${r.status} ${r.stderr.slice(0, 500)}`);
    const hits = [];
    for (const l of r.stdout.split("\n")) {
      const m = /^(\S.*?):(\d+):\d+: .*\[(?:Error|Warning|Info)\/([^\]]+)\]\s*$/.exec(l);
      if (m) hits.push({ file: relPath(tree, m[1]), line: +m[2], rule: m[3] });
    }
    return { command: "secretlint --secretlintrc <preset-recommend only> --format unix --maskSecrets 'data/**/*'", hits };
  },
};

async function creddata(bin, only) {
  const { loadMeta, scoreHits, PRIMARY } = await import("./creddata.mjs");
  const base = join(CACHE, "creddata");
  const keep = inSplit("creddata");
  // Hard links of the split's files only, so the tools never read the other half.
  const tree = join(CACHE, `creddata-${currentSplit()}`);
  rmSync(tree, { recursive: true, force: true });
  for (const p of walk(join(base, "data"))) {
    const rel = relative(base, p).split(sep).join("/");
    if (!keep(rel)) continue;
    ensureDir(dirname(join(tree, rel)));
    linkSync(p, join(tree, rel));
  }
  const rows = loadMeta().filter((r) => keep(r.file));
  const out = {};
  const exes = { ...bin, "detect-secrets": bin.detectSecrets };
  try {
    for (const [name, runner] of Object.entries(CRED_RUNNERS)) {
      if (only && !only.includes(name)) continue;
      const meta = { version: TOOLS[name].version, ...(TOOLS[name].caveat ? { caveat: TOOLS[name].caveat } : {}) };
      const exe = exes[name];
      if (!exe || exe.error) { out[name] = { ...meta, error: exe?.error || "not installed" }; continue; }
      console.error(`[competitors] ${name}`);
      const t0 = Date.now();
      try {
        const res = runner(exe, tree);
        const seconds = Math.round((Date.now() - t0) / 100) / 10;
        out[name] = { ...meta, command: res.command, ...(res.profile ? { sandbox: res.profile } : {}), seconds, hits: res.hits.length, ...scoreHits(rows, res.hits) };
        for (const [v, vr] of Object.entries(res.variants || {})) {
          out[v] = { ...meta, variantOf: name, command: vr.command, seconds: null, hits: vr.hits.length, ...scoreHits(rows, vr.hits) };
        }
      } catch (e) {
        out[name] = { ...meta, error: e.timeout ? "timeout after 30 minutes" : String(e.message || e).slice(0, 500), seconds: Math.round((Date.now() - t0) / 1000) };
      }
    }
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
  return { tools: out, primary: PRIMARY, families: [...PRIMARY, "partial", "out"], skipped: SKIPPED };
}

// ── Malware (GuardDog) ────────────────────────────────────────────────────

async function malware(bin) {
  const M = await import("./malware.mjs");
  const { untar, unpackTgz } = await import("../../lib/deps/source.js");
  const { unzip } = await import("../../lib/deps/python/source.js");
  const { gunzipSync } = await import("node:zlib");
  const results = [];
  const guard = (eco, dir) => {
    const r = spawnSync(bin.guarddog, [eco, "scan", dir, "--output-format", "json"], {
      encoding: "utf-8", maxBuffer: 1 << 30, timeout: 600_000,
      env: { PATH: process.env.PATH, HOME: TOOLS_DIR, SEMGREP_SEND_METRICS: "off" },
    });
    let j = null;
    try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { /* reported below */ }
    if (!j) return { error: `exit ${r.status}: ${(r.stderr || "").slice(-200)}` };
    return { issues: j.issues ?? 0, risk: j.risk_score?.label || null, rules: Object.entries(j.results || {}).filter(([, v]) => v && (Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : v)).map(([k]) => k), errors: Object.keys(j.errors || {}).length };
  };
  try {
    await M.fetchData(); // the split's archives only, hash checked, extracted under MALWARE_DIR
    const { sample } = JSON.parse(readFileSync(join(CACHE, "malware-sample.json"), "utf-8"));
    const keepM = inSplit("malware");
    for (const s of sample.filter((x) => keepM(x.path))) {
      const dir = join(MALWARE_DIR, "x", s.id);
      const root = existsSync(dir) ? M.findRoot(dir, s.eco) : null;
      if (!root) { results.push({ group: `malicious ${s.eco} ${s.cat}`, id: s.path, excluded: true }); continue; }
      results.push({ group: `malicious ${s.eco} ${s.cat}`, id: s.path, ...guard(s.eco, root) });
    }
  } finally {
    rmSync(MALWARE_DIR, { recursive: true, force: true });
  }
  const list = JSON.parse(readFileSync(join(CACHE, "benign", "list.json"), "utf-8"));
  const keepB = inSplit("benign");
  const tmp = mkdtempSync(join(CACHE, "benign-x-"));
  try {
    for (const eco of ["npm", "pypi"]) {
      for (const b of list[eco].filter((x) => keepB(`${eco}/${x.name}@${x.version}`))) {
        const buf = readFileSync(join(CACHE, "benign", eco, `${encodeURIComponent(b.name)}.json.bin`));
        let files;
        try {
          files = eco === "npm" ? unpackTgz(buf) : buf.readUInt32LE(0) === 0x04034b50 ? unzip(buf) : untar(gunzipSync(buf));
        } catch { results.push({ group: `benign ${eco}`, id: b.name, excluded: true }); continue; }
        const dir = join(tmp, eco, encodeURIComponent(b.name));
        for (const [rel, data] of files) {
          const p = join(dir, rel);
          if (!p.startsWith(dir + sep)) continue;
          ensureDir(dirname(p));
          writeFileSync(p, data);
        }
        results.push({ group: `benign ${eco}`, id: `${b.name}@${b.version}`, ...guard(eco, dir) });
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const table = {};
  for (const r of results) {
    const t = (table[r.group] ||= { flagged: 0, risky: 0, n: 0, excluded: 0, toolErrors: 0, rules: {}, labels: {} });
    if (r.excluded) { t.excluded++; continue; }
    if (r.error) { t.toolErrors++; continue; }
    t.n++;
    if (r.issues > 0) t.flagged++;
    if (r.risk && r.risk !== "no_risks_detected") t.risky++;
    t.labels[r.risk || "none"] = (t.labels[r.risk || "none"] || 0) + 1;
    for (const k of r.rules) t.rules[k] = (t.rules[k] || 0) + 1;
  }
  return { guarddog: table, failures: results.filter((r) => r.error).slice(0, 5).map((r) => r.error) };
}

export async function runCompetitors(which, tools = null) {
  const bin = await install();
  const split = currentSplit();
  ensureDir(RESULTS);
  for (const name of which) {
    const res = name === "creddata" ? await creddata(bin, tools) : name === "malware" ? await malware(bin) : null;
    if (!res) continue;
    const file = join(RESULTS, `competitors-${name}.${split}.json`);
    // A --tools run replaces only the tools it ran and keeps the rest.
    if (name === "creddata" && tools && existsSync(file)) {
      const prev = JSON.parse(readFileSync(file, "utf-8"));
      res.tools = { ...prev.tools, ...res.tools };
    }
    writeFileSync(file, JSON.stringify({ split, date: new Date().toISOString(), pins: TOOLS, ...res }, null, 2));
    const md = markdown(name, res);
    writeFileSync(file.replace(/\.json$/, ".md"), md + "\n");
    console.log(md);
  }
}

function markdown(name, res) {
  const L = [`## Reference tools: ${name} (split ${currentSplit()})`, ""];
  if (name === "creddata") {
    const ok = Object.entries(res.tools).filter(([, s]) => !s.error);
    L.push("Rows marked \"variant\" are another output mode of the scan above them. Scored with `scoreHits` (creddata.mjs): a hit unit is a distinct file:line.", "");
    L.push("| Tool | Version | Hits | Hit lines | Precision, labelled | Strict precision | Recall, in scope (row) | Recall, all T rows (row) | Recall, file (hit on a T row) | Seconds | Caveat |", "|---|---|---:|---:|---|---|---|---|---|---:|---|");
    for (const [tool, s] of ok) {
      const all = Object.entries(s.rec).filter(([k]) => k.startsWith("family:")).reduce((a, [, v]) => [a[0] + v.found, a[1] + v.n], [0, 0]);
      L.push(`| ${tool}${s.variantOf ? " (variant)" : ""} | ${s.version ?? ""} | ${s.hits} | ${s.prec.all.units} | ${fmt(s.prec.all.correct, s.prec.all.labelled)} | ${fmt(s.prec.all.correct, s.prec.all.units)} | ${fmt(s.rec.primary.found, s.rec.primary.n)} | ${fmt(...all)} | ${fmt(s.rec["file:matched"].found, s.rec["file:matched"].n)} | ${s.seconds ?? (s.variantOf ? "in the row above" : "")} | ${s.caveat || ""} |`);
    }
    L.push("", "| Tool | provider | private-key | password | api-key | partial | out |", "|---|---|---|---|---|---|---|");
    for (const [tool, s] of ok) L.push(`| ${tool} | ${res.families.map((f) => (s.rec[`family:${f}`] ? fmt(s.rec[`family:${f}`].found, s.rec[`family:${f}`].n) : "n/a")).join(" | ")} |`);
    L.push("", "Commands (cwd = the split's hard-link tree, network denied by `sandbox-exec`):", "");
    for (const [tool, s] of ok) if (s.command) L.push(`- ${tool}: \`${s.command}\`${s.sandbox ? ` (${s.sandbox})` : ""}`);
    const failed = Object.entries(res.tools).filter(([, s]) => s.error);
    const skipped = Object.entries(res.skipped || {});
    if (failed.length || skipped.length) {
      L.push("", "Not measured:", "");
      for (const [tool, s] of failed) L.push(`- ${tool} ${s.version ?? ""}: ${s.error}`);
      for (const [tool, why] of skipped) L.push(`- ${tool}: ${why}`);
    }
  } else {
    L.push("| Group | GuardDog: any issue | GuardDog: risk label above none | Excluded | Tool errors | Risk labels | Top rules |", "|---|---|---|---:|---:|---|---|");
    for (const [g, t] of Object.entries(res.guarddog)) L.push(`| ${g} | ${fmt(t.flagged, t.n)} | ${fmt(t.risky, t.n)} | ${t.excluded} | ${t.toolErrors} | ${Object.entries(t.labels).map(([k, n]) => `${k} ${n}`).join(", ")} | ${Object.entries(t.rules).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(", ")} |`);
  }
  return L.join("\n");
}
