/**
 * E11b reference points: other open-source tools on the same split, scored
 * the same way (amendment E11b § 5). Not part of E11's registered hypotheses.
 *
 *   npm run bench:public -- --competitors --split dev [--only creddata,malware]
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

export const TOOLS = {
  gitleaks: { version: "8.30.1", url: "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_arm64.tar.gz", sums: "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt" },
  "detect-secrets": { version: "1.5.0", pip: "detect-secrets==1.5.0" },
  guarddog: { version: "3.2.0", pip: "guarddog==3.2.0" },
};
const TOOLS_DIR = join(CACHE, "tools");
const OFFLINE = "(version 1)(allow default)(deny network*)";

/** Run a command with every network operation denied by the kernel sandbox. */
function offline(cmd, args, opts = {}) {
  return spawnSync("sandbox-exec", ["-p", OFFLINE, cmd, ...args], {
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
  return { gitleaks: gl, detectSecrets: join(venv, "bin", "detect-secrets"), guarddog: join(venv, "bin", "guarddog") };
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

async function creddata(bin) {
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

  const glOut = join(TOOLS_DIR, "gitleaks.json");
  const g = offline(bin.gitleaks, ["dir", join(tree, "data"), "--report-format", "json", "--report-path", glOut, "--exit-code", "0", "--no-banner", "--log-level", "error"]);
  if (g.status !== 0) throw new Error(`gitleaks: ${g.stderr}`);
  const gl = JSON.parse(readFileSync(glOut, "utf-8")).map((f) => ({ file: relative(tree, f.File).split(sep).join("/"), line: f.StartLine, rule: f.RuleID }));
  out.gitleaks = { hits: gl.length, ...scoreHits(rows, gl) };

  const files = walk(join(tree, "data")).map((p) => relative(tree, p));
  const ds = [];
  for (let i = 0; i < files.length; i += 400) {
    const r = offline(bin.detectSecrets, ["scan", "--all-files", ...files.slice(i, i + 400)], { cwd: tree });
    if (r.status !== 0) throw new Error(`detect-secrets: ${r.stderr.slice(0, 500)}`);
    for (const [file, list] of Object.entries(JSON.parse(r.stdout).results || {})) {
      for (const x of list) ds.push({ file: file.split(sep).join("/"), line: x.line_number, rule: x.type });
    }
  }
  out["detect-secrets"] = { hits: ds.length, ...scoreHits(rows, ds) };
  rmSync(tree, { recursive: true, force: true });
  return { tools: out, primary: PRIMARY, families: [...PRIMARY, "partial", "out"] };
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

export async function runCompetitors(which) {
  const bin = await install();
  const split = currentSplit();
  ensureDir(RESULTS);
  for (const name of which) {
    const res = name === "creddata" ? await creddata(bin) : name === "malware" ? await malware(bin) : null;
    if (!res) continue;
    writeFileSync(join(RESULTS, `competitors-${name}.${split}.json`), JSON.stringify({ split, tools: TOOLS, ...res }, null, 2));
    console.log(markdown(name, res));
  }
}

function markdown(name, res) {
  const L = [`## Reference tools: ${name} (split ${currentSplit()})`, ""];
  if (name === "creddata") {
    L.push("| Tool | Hit lines | Precision, labelled | Strict precision | Recall, in scope (row) | Recall, all T rows (row) | Recall, file (hit on a T row) |", "|---|---:|---|---|---|---|---|");
    for (const [tool, s] of Object.entries(res.tools)) {
      const all = Object.entries(s.rec).filter(([k]) => k.startsWith("family:")).reduce((a, [, v]) => [a[0] + v.found, a[1] + v.n], [0, 0]);
      L.push(`| ${tool} | ${s.prec.all.units} | ${fmt(s.prec.all.correct, s.prec.all.labelled)} | ${fmt(s.prec.all.correct, s.prec.all.units)} | ${fmt(s.rec.primary.found, s.rec.primary.n)} | ${fmt(...all)} | ${fmt(s.rec["file:matched"].found, s.rec["file:matched"].n)} |`);
    }
    L.push("", "| Tool | provider | private-key | password | api-key | partial | out |", "|---|---|---|---|---|---|---|");
    for (const [tool, s] of Object.entries(res.tools)) L.push(`| ${tool} | ${res.families.map((f) => (s.rec[`family:${f}`] ? fmt(s.rec[`family:${f}`].found, s.rec[`family:${f}`].n) : "n/a")).join(" | ")} |`);
  } else {
    L.push("| Group | GuardDog: any issue | GuardDog: risk label above none | Excluded | Tool errors | Risk labels | Top rules |", "|---|---|---|---:|---:|---|---|");
    for (const [g, t] of Object.entries(res.guarddog)) L.push(`| ${g} | ${fmt(t.flagged, t.n)} | ${fmt(t.risky, t.n)} | ${t.excluded} | ${t.toolErrors} | ${Object.entries(t.labels).map(([k, n]) => `${k} ${n}`).join(", ")} | ${Object.entries(t.rules).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(", ")} |`);
  }
  return L.join("\n");
}
