#!/usr/bin/env node
/**
 * Exploratory re-analysis of the registered E11b and E14 test runs (29 Oct
 * 2026, after the registered analysis). No new scan, no new data, no
 * download: it reads the per-item and aggregate files the runs left in the
 * local bench cache, and the CredData labels already cloned there.
 *
 *   node bench/public/reanalysis.mjs           write bench/public/reanalysis.json
 *   node bench/public/reanalysis.mjs --check   exit 1 if the committed file is stale,
 *                                              2 if the local inputs are missing
 *
 * Options: --e11b <dir>     E11b results (default <bench cache>/public/results)
 *          --e14 <file>     E14 per-item hits (default ~/.cache/penthera-e14/public/results/giants.test.hits.json)
 *          --creddata <dir> the CredData clone (default <bench cache>/public/creddata)
 *
 * What it computes:
 * 1. A cluster bootstrap of the CredData numbers, by repository (CredData's
 *    own `data/<repo>/` folder), next to E11b's Wilson intervals and E14's
 *    bootstrap over files. Same resampler as E14 (mulberry32, seed 20261025,
 *    10,000 resamples, percentile 95%); only the cluster changes. The per-item
 *    hits are E14's (Penthera 2.1.0-rc.2, which scores what 2.0.0 scored in
 *    E11b, to the item); their SHA-256 must be the one RESULTS.md records.
 * 2. Recall without the scope filter: every CredData `T` row, every malicious
 *    package (payload or not, compromised releases included), every SecBench.js
 *    entry of the two classes, next to the registered in-scope recall.
 * 3. Whether a cluster bootstrap is possible on SecBench.js and DataDog.
 *
 * Before anything new is computed, the registered counts are rebuilt from the
 * inputs and compared with published.json and RESULTS.md; a difference stops
 * the run. The output holds counts and intervals only: no file names, lines,
 * values or package contents.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "reanalysis.json");
const { values: OPT } = parseArgs({ options: {
  check: { type: "boolean", default: false },
  e11b: { type: "string" },
  e14: { type: "string" },
  creddata: { type: "string" },
} });
const BENCH = join(process.env.PENTHERA_BENCH_CACHE || join(homedir(), ".cache", "penthera-bench"), "public");
const E11B = OPT.e11b || join(BENCH, "results");
const E14 = OPT.e14 || join(homedir(), ".cache", "penthera-e14", "public", "results", "giants.test.hits.json");
const CRED = OPT.creddata || join(BENCH, "creddata");

// Registered in RESULTS.md, "E14 step 2" (per-item outputs).
const E14_HITS_SHA256 = "4d5880e1f513df0b29620bee78fb9bdbc4e85bee6c9a54695d55bf12905cba41";
// E14's resampler, so that only the cluster differs (giants.mjs).
const SEED = 20261025;
const RESAMPLES = 10_000;
// E14's registered paired differences on CredData, bootstrap over files (RESULTS.md).
const E14_REGISTERED = {
  H1: { estimate: 0.109, ci: [0.025, 0.21] },
  H2: { estimate: -0.088, ci: [-0.129, -0.043] },
  H3: { estimate: 0.252, ci: [0.141, 0.408] },
};

const E11B_FILES = ["creddata.test.json", "competitors-creddata.test.json", "secbench.test.json", "competitors-secbench.test.json", "malware.test.json", "competitors-malware.test.json"];
const missing = [E14, join(CRED, "meta"), ...E11B_FILES.map((f) => join(E11B, f))].filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`reanalysis: local per-item data not found (nothing is downloaded):\n  ${missing.join("\n  ")}`);
  process.exit(2);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
const published = readJson(join(HERE, "published.json"));
const e11b = Object.fromEntries(E11B_FILES.map((f) => [f, readJson(join(E11B, f))]));
const hitsBuf = readFileSync(E14);
if (sha256(hitsBuf) !== E14_HITS_SHA256) throw new Error("E14 per-item hits: SHA-256 differs from the one registered in RESULTS.md");
const hitsAll = JSON.parse(hitsBuf);

const stop = (what, got, want) => { throw new Error(`registered count not reproduced: ${what}: got ${JSON.stringify(got)}, registered ${JSON.stringify(want)}`); };
const same = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) stop(what, got, want); };
const r4 = (x) => (x == null ? null : Math.round(x * 1e4) / 1e4);
const r4s = (xs) => xs.map(r4);

// ── Statistics (as giants.mjs) ───────────────────────────────────────────

function wilson(k, n) {
  if (!n) return [null, null];
  const z = 1.959964, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const f1 = (p, r) => (p + r ? (2 * p * r) / (p + r) : 0);
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bootstrap(clusters, stat) {
  const rand = rng(SEED);
  const vals = [];
  for (let b = 0; b < RESAMPLES; b++) {
    const s = new Array(clusters.length);
    for (let i = 0; i < clusters.length; i++) s[i] = clusters[Math.floor(rand() * clusters.length)];
    const v = stat(s);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  vals.sort((x, y) => x - y);
  const q = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(p * vals.length)))];
  return vals.length ? [q(0.025), q(0.975)] : [null, null];
}

// ── CredData: E14's merge, copied unchanged from giants.mjs ──────────────

const { sameFinding } = await import("../../lib/giants/merge.js");
function mergeHits(hits, asFinding, ownKey, bucketOf) {
  const parent = hits.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const findings = hits.map(asFinding);
  const buckets = new Map();
  hits.forEach((h, i) => {
    const b = bucketOf(h);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(i);
  });
  for (const idx of buckets.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const a = hits[idx[x]], b = hits[idx[y]];
        const sameF = a.tool === b.tool ? ownKey(a) === ownKey(b) : sameFinding(findings[idx[x]], findings[idx[y]]);
        if (sameF) { const ra = find(idx[x]), rb = find(idx[y]); if (ra !== rb) parent[rb] = ra; }
      }
    }
  }
  const groups = new Map();
  hits.forEach((h, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(h);
  });
  return [...groups.values()];
}
const armOf = (groups, members) => groups.filter((g) => g.some((h) => members.includes(h.tool))).map((g) => g.filter((h) => members.includes(h.tool)));

process.env.PENTHERA_E11_SPLIT = "test";
const C = await import("./creddata.mjs");
const { inSplit } = await import("./split.mjs");

function creddata() {
  const keep = inSplit("creddata");
  const rows = C.loadMeta(CRED).filter((r) => keep(r.file) && existsSync(join(CRED, r.file)));
  const tRows = rows.filter((r) => r.gt === "T");
  const inScope = tRows.filter((r) => C.PRIMARY.includes(C.family(r.cats)));
  const tByFile = new Map();
  for (const r of tRows) { if (!tByFile.has(r.file)) tByFile.set(r.file, []); tByFile.get(r.file).push(r); }
  const isCorrect = (file, line) => (tByFile.get(file) || []).some((r) => line >= r.ls && line <= r.le);
  const TOOLS = ["penthera", "gitleaks", "trufflehog"];
  const hits = TOOLS.flatMap((m) => (hitsAll.creddata[m]?.hits || []).map((h) => ({ tool: m, file: h.file, line: h.line, rule: h.rule, hashes: h.hashes || [] })));
  const groups = mergeHits(
    hits,
    (h) => ({ category: "secret", file: h.file, line: h.line, key: { secretHashes: h.hashes }, sources: [{ tool: h.tool, ruleId: h.rule }] }),
    (h) => `${h.file}:${h.line}`,
    (h) => `${h.file}:${h.line}`,
  );
  const arms = { P: armOf(groups, ["penthera"]), gitleaks: armOf(groups, ["gitleaks"]), trufflehog: armOf(groups, ["trufflehog"]), U: groups };

  // Per-file tallies, in E14's order, so the file bootstrap reproduces E14's.
  const files = new Set([...inScope.map((r) => r.file), ...hits.map((h) => h.file)]);
  const perFile = new Map([...files].map((f) => [f, {}]));
  const tally = (file, arm) => (perFile.get(file)[arm] ||= { units: 0, correct: 0, rows: 0, found: 0, allRows: 0, allFound: 0 });
  for (const [arm, gs] of Object.entries(arms)) {
    const lines = new Map();
    for (const g of gs) {
      const { file, line } = g[0];
      const t = tally(file, arm);
      t.units++;
      if (isCorrect(file, line)) t.correct++;
      for (const h of g) { if (!lines.has(h.file)) lines.set(h.file, new Set()); lines.get(h.file).add(h.line); }
    }
    for (const r of tRows) {
      if (!perFile.has(r.file)) perFile.set(r.file, {});
      const t = tally(r.file, arm);
      const L = lines.get(r.file);
      let found = false;
      if (L) for (let l = r.ls; l <= r.le && !found; l++) found = L.has(l);
      t.allRows++;
      if (found) t.allFound++;
      if (C.PRIMARY.includes(C.family(r.cats))) { t.rows++; if (found) t.found++; }
    }
  }
  // E14 bootstrapped over files with an in-scope row or a hit; files holding
  // only out-of-scope T rows join here for the all-rows recall, and are kept
  // out of the E14 reproduction.
  const e14Files = [...files].map((f) => perFile.get(f));
  const repoOf = (file) => file.split("/")[1];
  const perRepo = new Map();
  for (const [file, arms_] of perFile) {
    const repo = repoOf(file);
    if (!perRepo.has(repo)) perRepo.set(repo, {});
    const R = perRepo.get(repo);
    for (const [arm, t] of Object.entries(arms_)) {
      const a = (R[arm] ||= { units: 0, correct: 0, rows: 0, found: 0, allRows: 0, allFound: 0 });
      for (const k of Object.keys(a)) a[k] += t[k];
    }
  }
  const allFiles = [...perFile.values()];
  const repos = [...perRepo.values()];
  const totals = (sample, arm) => sample.reduce((a, f) => { const t = f[arm]; if (t) for (const k of Object.keys(a)) a[k] += t[k]; return a; }, { units: 0, correct: 0, rows: 0, found: 0, allRows: 0, allFound: 0 });
  const metrics = (sample, arm) => {
    const t = totals(sample, arm);
    const p = t.units ? t.correct / t.units : 0, r = t.rows ? t.found / t.rows : 0, ra = t.allRows ? t.allFound / t.allRows : 0;
    return { p, r, f1: f1(p, r), ra };
  };

  // Registered counts first (E11b published.json, E14 RESULTS.md).
  const pub = Object.fromEntries(published.benchmarks.secrets.rows.map((r) => [r.kind === "penthera" ? "penthera" : r.kind === "tool" ? r.tool : null, r]));
  const T = (arm) => totals(allFiles, arm);
  for (const [arm, name] of [["P", "penthera"], ["gitleaks", "gitleaks"], ["trufflehog", "trufflehog"]]) {
    same(`CredData ${name} strict precision`, [T(arm).correct, T(arm).units], pub[name].precision);
    same(`CredData ${name} in-scope recall`, [T(arm).found, T(arm).rows], pub[name].recall);
  }
  same("CredData union (E14 U)", [T("U").correct, T("U").units, T("U").found, T("U").rows], [3210, 4017, 1656, 2220]);
  const diff = (a, b, k) => (s) => metrics(s, a)[k] - metrics(s, b)[k];
  const tests = {
    H1: ["recall(U) - recall(P)", diff("U", "P", "r")],
    H2: ["precision(U) - precision(P)", diff("U", "P", "p")],
    H3: ["F1(U) - F1(gitleaks)", diff("U", "gitleaks", "f1")],
  };
  const e14 = {};
  for (const [h, [what, stat]] of Object.entries(tests)) {
    const est = stat(allFiles);
    const byFile = bootstrap(e14Files, stat);
    // The file bootstrap must give E14's registered interval, to 3 decimals.
    same(`E14 ${h} interval over files`, byFile.map((x) => Math.round(x * 1000) / 1000), E14_REGISTERED[h].ci);
    e14[h] = { what, estimate: r4(est), registered: E14_REGISTERED[h], files: r4s(byFile), repositories: r4s(bootstrap(repos, stat)) };
  }

  const tools = {};
  for (const [arm, name] of [["P", "Penthera"], ["gitleaks", "gitleaks"], ["trufflehog", "trufflehog"]]) {
    const t = T(arm);
    const m = metrics(allFiles, arm);
    const stat = (k) => (s) => metrics(s, arm)[k];
    tools[name] = {
      precision: { k: t.correct, n: t.units, value: r4(m.p), wilson: r4s(wilson(t.correct, t.units)), files: r4s(bootstrap(e14Files, stat("p"))), repositories: r4s(bootstrap(repos, stat("p"))) },
      recall: { k: t.found, n: t.rows, value: r4(m.r), wilson: r4s(wilson(t.found, t.rows)), files: r4s(bootstrap(e14Files, stat("r"))), repositories: r4s(bootstrap(repos, stat("r"))) },
      f1: { value: r4(m.f1), files: r4s(bootstrap(e14Files, stat("f1"))), repositories: r4s(bootstrap(repos, stat("f1"))) },
      recallAllRows: { k: t.allFound, n: t.allRows, value: r4(m.ra), wilson: r4s(wilson(t.allFound, t.allRows)), repositories: r4s(bootstrap(repos, stat("ra"))) },
    };
  }
  const reposWithRows = repos.filter((R) => (R.P?.rows || 0) > 0).length;
  const rowsPerRepo = repos.map((R) => R.P?.rows || 0).filter((n) => n > 0).sort((a, b) => b - a);
  return {
    unit: "row (recall) and file:line hit (precision), as E11b; clusters: CredData's data/<repo>/ folder",
    rows: { T: tRows.length, inScope: inScope.length },
    clusters: { files: e14Files.length, repositories: repos.length, repositoriesWithInScopeRows: reposWithRows, largestRepositoryShareOfInScopeRows: r4(rowsPerRepo[0] / inScope.length), top10RepositoriesShareOfInScopeRows: r4(rowsPerRepo.slice(0, 10).reduce((a, b) => a + b, 0) / inScope.length) },
    tools,
    e14,
  };
}

// ── Recall without the scope filter (E11b aggregates) ────────────────────

function scopeFreeSecrets() {
  const fam = (rec) => Object.entries(rec).filter(([k]) => k.startsWith("family:")).reduce((a, [, v]) => [a[0] + v.found, a[1] + v.n], [0, 0]);
  const out = [];
  for (const r of published.benchmarks.secrets.rows) {
    let rec = null;
    if (r.kind === "penthera") rec = e11b["creddata.test.json"].runs.asReported.rec;
    else if (r.kind === "tool") rec = e11b["competitors-creddata.test.json"].tools[r.tool]?.rec;
    if (!rec) { out.push({ tool: r.tool, version: r.version, kind: r.kind, inScope: r.recall, all: null, why: "no family counts stored for this run" }); continue; }
    same(`CredData ${r.tool} ${r.version} in-scope recall`, [rec.primary.found, rec.primary.n], r.recall);
    const all = fam(rec);
    const pAll = r.precision[0] / r.precision[1];
    out.push({ tool: r.tool, version: r.version, kind: r.kind, ...(r.excluded ? { excluded: true } : {}), precision: r.precision, inScope: r.recall, all, allWilson: r4s(wilson(...all)), f1InScope: r4(r.f1), f1All: r4(f1(pAll, all[0] / all[1])) });
  }
  return out;
}

function scopeFreeMalware(eco) {
  const res = e11b["malware.test.json"], comp = e11b["competitors-malware.test.json"];
  const groups = eco === "npm"
    ? ["malicious npm malicious_intent", "malicious npm compromised_lib"]
    : ["malicious pypi malicious_intent", "malicious pypi compromised_lib"];
  const gd = (t) => (t ? [(t.labels?.suspicious || 0) + (t.labels?.high_risk || 0), t.n] : null);
  const counts = (r) => {
    if (r.kind.startsWith("penthera") && r.version === "1.9.0") return null;
    if (r.kind === "penthera") return groups.map((g) => res.table[g]?.["code-medium"] || null);
    if (r.tool === "GuardDog") return groups.map((g) => gd(comp.guarddog[g]));
    const t = comp.tools[r.tool];
    return groups.map((g) => (t?.groups[g] ? [t.groups[g].flagged, t.groups[g].n] : null));
  };
  const out = [];
  for (const r of published.benchmarks[eco].rows) {
    const c = counts(r);
    if (c && c[0]) same(`${eco} ${r.tool} all malicious_intent`, c[0], r.all);
    const every = c && c[0] && c[1] ? [c[0][0] + c[1][0], c[0][1] + c[1][1]] : null;
    out.push({
      tool: r.tool, version: r.version, kind: r.kind, ...(r.excluded ? { excluded: true } : {}),
      registered: r.detect, maliciousIntent: r.all, compromised: c ? c[1] : null, all: every,
      allWilson: every ? r4s(wilson(...every)) : null, benign: r.benign, jAll: every && r.benign ? r4(every[0] / every[1] - r.benign[0] / r.benign[1]) : null,
      ...(every ? {} : { why: c ? "this tool did not run on the compromised releases" : "no per-group counts stored for this run" }),
    });
  }
  return out;
}

function scopeFreeSecbench() {
  const s = e11b["secbench.test.json"];
  const total = Object.values(s.per).reduce((a, p) => a + p.total, 0);
  const scored = Object.values(s.per).reduce((a, p) => a + p.withSink, 0);
  same("SecBench.js Penthera pooled strict", [s.pooled.strict[0], scored], published.benchmarks.library.rows.find((r) => r.kind === "penthera").pooled);
  const labels = hitsAll.secbench.penthera.results.filter((r) => r.status === "ok" && r.sinkFile);
  const names = labels.map((r) => r.folder.replace(/_[^_]*$/, ""));
  const packages = new Set(names).size;
  const rows = published.benchmarks.library.rows.filter((r) => r.pooled).map((r) => ({
    tool: r.tool, version: r.version, kind: r.kind, ...(r.excluded ? { excluded: true } : {}),
    registered: r.pooled, entries: [r.pooled[0], total], entriesWilson: r4s(wilson(r.pooled[0], total)),
  }));
  return {
    entries: total, scored, notScored: Object.fromEntries(Object.entries(s.per).map(([c, p]) => [c, { notOnRegistry: p.total - p.fetched, noSinkFile: p.fetched - p.withSink, ofWhichSinkNotInTarball: p.sinkNotInTarball || 0 }])),
    clusters: { vulnerabilities: labels.length, packages, note: packages === labels.length ? "every package holds one scored vulnerability, so a package bootstrap is an item bootstrap" : null },
    rows,
  };
}

const result = {
  note: "Exploratory re-analysis, 29 Oct 2026, after the registered analysis (bench/public/reanalysis.mjs). Not a registered result.",
  inputs: {
    e14Hits: { sha256: E14_HITS_SHA256, penthera: hitsAll.creddata.penthera.version },
    e11b: Object.fromEntries(E11B_FILES.map((f) => [f, sha256(readFileSync(join(E11B, f)))])),
    labels: "CredData meta/*.csv at the E11 pin, test half by bench/public/split/creddata.json",
  },
  bootstrap: { seed: SEED, resamples: RESAMPLES, interval: "percentile 95%" },
  creddata: creddata(),
  scopeFree: { secrets: scopeFreeSecrets(), npm: scopeFreeMalware("npm"), pypi: scopeFreeMalware("pypi"), secbench: scopeFreeSecbench() },
  malware: { clusterBootstrap: null, why: "no campaign, maintainer or publish-window id is stored for the samples; each package is already one unit, so there is nothing to cluster by without new labels" },
};

const text = JSON.stringify(result, null, 2) + "\n";
if (OPT.check) {
  let cur = "";
  try { cur = readFileSync(OUT, "utf-8"); } catch { /* missing counts as stale */ }
  if (cur !== text) { console.error("stale: bench/public/reanalysis.json"); process.exit(1); }
  console.log("bench/public/reanalysis.json is current");
} else {
  writeFileSync(OUT, text);
  console.log("wrote bench/public/reanalysis.json");
}
