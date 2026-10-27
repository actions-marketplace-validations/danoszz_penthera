/**
 * E14: Penthera plus the free tools, against each alone
 * (docs/research/prereg/E14-giants-combination.md).
 *
 *   node bench/public/giants.mjs --split dev --collect   # rerun every arm's member, keep per-item hits
 *   node bench/public/giants.mjs --split dev             # score the arms from the kept hits
 *   node bench/public/giants.mjs --split dev --spot-check 50
 *   node bench/public/giants.mjs --split test --final    # step 2: once, after the dev step (not run yet)
 *
 * Members, as registered (§ 2): CredData: Penthera (as the CLI reports it),
 * gitleaks 8.30.1, trufflehog 3.99.3. SecBench.js: Penthera, Semgrep 1.180.0
 * (semgrep-rules 9bbf021, javascript/), CodeQL 2.27.2. Each tool runs through
 * E11b's own runner in competitors.mjs (same pin, command and network deny);
 * this file only keeps what E11b threw away, the per-item hits, and builds
 * the arms with the merge code --giants ships (lib/giants/merge.js).
 *
 * Arms (§ 2): P Penthera alone, T each tool alone, U union, A agreement
 * (Penthera plus a tool finding only when another non-Penthera tool reports
 * the same key). Scoring (§ 3) uses E11b's code: CredData strict precision
 * over distinct merged hits and in-scope row recall; SecBench.js strict
 * recall in the sink file, with findings per package as the noise measure.
 * Intervals: Wilson 95% for proportions; paired differences by a bootstrap
 * over files (CredData) or packages (SecBench.js), 10,000 resamples, seed
 * 20261025, percentile 95%.
 *
 * Output: <bench cache>/results/giants.<split>.hits.json (per-item, local
 * only; CredData hits carry hashes of the values, never the values) and
 * giants.<split>.json (the scores). The scans run with the network denied.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, linkSync, mkdtempSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const { values: OPT } = parseArgs({ options: {
  split: { type: "string", default: "dev" },
  final: { type: "boolean", default: false },
  collect: { type: "boolean", default: false },
  only: { type: "string" },
  "spot-check": { type: "string" },
} });
if (!["dev", "test"].includes(OPT.split)) throw new Error("--split must be dev or test");
if (OPT.split === "test" && !OPT.final) throw new Error("the test half is sealed: E14 runs it once, in step 2, with --final");
process.env.PENTHERA_E11_SPLIT = OPT.split;

const { CACHE, RESULTS, ensureDir } = await import("./common.mjs");
const { inSplit, currentSplit } = await import("./split.mjs");
const { sameFinding } = await import("../../lib/giants/merge.js");
const { secretTokens } = await import("../../lib/giants/adapters/gitleaks.js");
const { secretHash } = await import("../../lib/giants/finding.js");

const SPLIT = currentSplit();
const HITS = join(RESULTS, `giants.${SPLIT}.hits.json`);
const OUT = join(RESULTS, `giants.${SPLIT}.json`);
const SEED = 20261025;
const RESAMPLES = 10_000;
const CRED_TOOLS = ["gitleaks", "trufflehog"];
const SAST_TOOLS = ["semgrep", "codeql"];
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// ── Collect ──────────────────────────────────────────────────────────────

async function collectCreddata() {
  const C = await import("./creddata.mjs");
  const { findSecretsInText } = await import("../../lib/whitebox/secrets.js");
  const comp = await import("./competitors.mjs");
  console.error("[e14] creddata: Penthera");
  const raw = await C.scan();
  // Penthera's value hashes, as --giants computes them (pentheraKeyed): every
  // rule match on the reported line, tokenized and hashed. Values are not kept.
  const lineCache = new Map();
  const hashesAt = (file, line) => {
    const k = `${file}:${line}`;
    if (lineCache.has(k)) return lineCache.get(k);
    let text = "";
    try { text = readFileSync(join(CACHE, "creddata", file), "utf-8").split("\n")[line - 1] || ""; } catch { /* gone */ }
    const inRepo = file.split("/").slice(2).join("/");
    const h = [...new Set(findSecretsInText(text, { path: inRepo }).flatMap((m) => secretTokens(m.match)).map(secretHash))];
    lineCache.set(k, h);
    return h;
  };
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"));
  const out = { penthera: { version: pkg.version, hits: raw.cli.map((h) => ({ ...h, hashes: hashesAt(h.file, h.line) })), cliErrors: raw.cliErrors } };
  const bin = await comp.install();
  const keep = inSplit("creddata");
  const base = join(CACHE, "creddata");
  // Hard links of the split's files only, as E11b does, so the tools never read the other half.
  const tree = join(CACHE, `creddata-${SPLIT}`);
  rmSync(tree, { recursive: true, force: true });
  for (const p of comp.walk(join(base, "data"))) {
    const rel = relative(base, p).split(sep).join("/");
    if (!keep(rel)) continue;
    ensureDir(dirname(join(tree, rel)));
    linkSync(p, join(tree, rel));
  }
  try {
    for (const name of CRED_TOOLS) {
      console.error(`[e14] creddata: ${name}`);
      const t0 = Date.now();
      const res = comp.CRED_RUNNERS[name](bin[name], tree);
      out[name] = { command: res.command, seconds: Math.round((Date.now() - t0) / 1000), hits: res.hits };
    }
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
  return out;
}

async function collectSecbench() {
  const S = await import("./secbench.mjs");
  const comp = await import("./competitors.mjs");
  const checks = { network: comp.sandboxCheck(comp.OFFLINE), "network, loopback allowed": comp.sandboxCheck(comp.OFFLINE_LOOPBACK) };
  if (Object.values(checks).some((c) => !c.blocked)) throw new Error(`the sandbox let a curl through: ${JSON.stringify(checks)}`);
  console.error("[e14] secbench: Penthera");
  const raw = await S.scan();
  const out = { sandboxCheck: checks, penthera: { results: raw.results.map((r) => ({ cls: r.cls, folder: r.folder, sinkFile: r.sinkFile, status: r.status, sinks: r.sinks || [], otherFindings: r.otherFindings || 0 })) } };
  const bin = await comp.install();
  const status = JSON.parse(readFileSync(join(CACHE, "secbench-status.json"), "utf-8"));
  const keep = inSplit("secbench");
  const vulns = S.entries().filter((x) => S.CLASSES[x.cls] && keep(`${x.cls}/${x.folder}`) && status[`${x.cls}/${x.folder}`] === "ok");
  for (const name of SAST_TOOLS) {
    console.error(`[e14] secbench: ${name} on ${vulns.length} packages`);
    const per = {};
    const tmp = mkdtempSync(join(CACHE, `e14-${name}-`));
    const t0 = Date.now();
    try {
      await comp.pool(vulns, comp.JOBS[name], async (e, i) => {
        const key = `${e.cls}/${e.folder}`;
        const work = join(tmp, `v${i}`);
        const dir = join(work, "pkg");
        ensureDir(dir);
        await comp.unpackTo(join(CACHE, "secbench-pkgs", `${key}.tgz`), dir);
        let res;
        try { res = await comp.SAST_RUNNERS[name](bin, dir, work); } catch (err) { res = { error: err }; }
        per[key] = res.error ? { error: res.error.timeout ? "timeout" : String(res.error.message || res.error).slice(-300) } : { hits: res.hits };
        rmSync(work, { recursive: true, force: true });
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    out[name] = { seconds: Math.round((Date.now() - t0) / 1000), per };
  }
  return out;
}

// ── Statistics ───────────────────────────────────────────────────────────

/** Wilson 95% interval. */
function wilson(k, n) {
  if (!n) return [null, null];
  const z = 1.959964, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const ratio = (k, n) => ({ k, n, value: n ? k / n : null, ci: wilson(k, n) });
const f1 = (p, r) => (p + r ? (2 * p * r) / (p + r) : 0);

/** mulberry32: a small seeded PRNG, so the bootstrap is reproducible. */
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

/** Percentile bootstrap of `stat(sample)` over resampled clusters, seeded. */
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

/** Exact two-sided McNemar p-value from the discordant counts b and c. */
function mcnemar(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    let lc = 0;
    for (let j = 1; j <= i; j++) lc += Math.log((n - i + j) / j);
    tail += Math.exp(lc - n * Math.log(2));
  }
  return Math.min(1, 2 * tail);
}

/** Holm–Bonferroni adjusted p-values, same order as given (nulls stay null). */
function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => p != null).sort((a, b) => a[0] - b[0]);
  const out = ps.map(() => null);
  let prev = 0;
  idx.forEach(([p, i], r) => { prev = Math.max(prev, Math.min(1, (idx.length - r) * p)); out[i] = prev; });
  return out;
}

// ── Merging ──────────────────────────────────────────────────────────────

/**
 * Union-find over hits with the spec's keys. Within one tool, hits on the
 * unit E11b counts (`ownKey`) are one; across tools, lib/giants/merge.js
 * sameFinding decides, on the shape `asFinding` gives it.
 */
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
        const same = a.tool === b.tool ? ownKey(a) === ownKey(b) : sameFinding(findings[idx[x]], findings[idx[y]]);
        if (same) { const ra = find(idx[x]), rb = find(idx[y]); if (ra !== rb) parent[rb] = ra; }
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

/** Agreement arm: Penthera's own groups, plus a group two or more non-Penthera tools are in. */
const agreement = (groups) => groups.filter((g) => g.some((h) => h.tool === "penthera") || new Set(g.filter((h) => h.tool !== "penthera").map((h) => h.tool)).size >= 2);
/** The groups an arm made of `members` reports, each cut to those members' hits. */
const armOf = (groups, members) => groups.filter((g) => g.some((h) => members.includes(h.tool))).map((g) => g.filter((h) => members.includes(h.tool)));

// ── Score: CredData ──────────────────────────────────────────────────────

async function scoreCreddata(hitsAll) {
  const C = await import("./creddata.mjs");
  const keep = inSplit("creddata");
  const rows = C.loadMeta().filter((r) => keep(r.file) && existsSync(join(CACHE, "creddata", r.file)));
  const tRows = rows.filter((r) => r.gt === "T");
  const inScope = tRows.filter((r) => C.PRIMARY.includes(C.family(r.cats)));
  const tByFile = new Map();
  for (const r of tRows) { if (!tByFile.has(r.file)) tByFile.set(r.file, []); tByFile.get(r.file).push(r); }
  const isCorrect = (file, line) => (tByFile.get(file) || []).some((r) => line >= r.ls && line <= r.le);

  const members = ["penthera", ...CRED_TOOLS];
  const hits = members.flatMap((m) => (hitsAll[m]?.hits || []).map((h) => ({ tool: m, file: h.file, line: h.line, rule: h.rule, hashes: h.hashes || [] })));
  const groups = mergeHits(
    hits,
    (h) => ({ category: "secret", file: h.file, line: h.line, key: { secretHashes: h.hashes }, sources: [{ tool: h.tool, ruleId: h.rule }] }),
    (h) => `${h.file}:${h.line}`,
    (h) => `${h.file}:${h.line}`,
  );
  const arms = {
    P: armOf(groups, ["penthera"]),
    ...Object.fromEntries(CRED_TOOLS.map((t) => [t, armOf(groups, [t])])),
    U: groups,
    A: agreement(groups),
    ...Object.fromEntries(CRED_TOOLS.map((t) => [`P+${t}`, armOf(groups, ["penthera", t])])),
  };

  // Per-file tallies: the bootstrap's clusters.
  const files = new Set([...inScope.map((r) => r.file), ...hits.map((h) => h.file)]);
  const perFile = new Map([...files].map((f) => [f, {}]));
  const tally = (file, arm) => (perFile.get(file)[arm] ||= { units: 0, correct: 0, rows: 0, found: 0 });
  for (const [arm, gs] of Object.entries(arms)) {
    const lines = new Map();
    for (const g of gs) {
      const { file, line } = g[0];
      const t = tally(file, arm);
      t.units++;
      if (isCorrect(file, line)) t.correct++;
      for (const h of g) { if (!lines.has(h.file)) lines.set(h.file, new Set()); lines.get(h.file).add(h.line); }
    }
    for (const r of inScope) {
      const t = tally(r.file, arm);
      t.rows++;
      const L = lines.get(r.file);
      let found = false;
      if (L) for (let l = r.ls; l <= r.le && !found; l++) found = L.has(l);
      if (found) t.found++;
    }
  }
  const clusters = [...perFile.values()];
  const totals = (sample, arm) => sample.reduce((a, f) => { const t = f[arm]; if (t) { a.units += t.units; a.correct += t.correct; a.rows += t.rows; a.found += t.found; } return a; }, { units: 0, correct: 0, rows: 0, found: 0 });
  const metrics = (sample, arm) => { const t = totals(sample, arm); const p = t.units ? t.correct / t.units : 0, r = t.rows ? t.found / t.rows : 0; return { p, r, f1: f1(p, r) }; };

  const out = { rows: { T: tRows.length, inScope: inScope.length }, files: files.size, arms: {} };
  for (const arm of Object.keys(arms)) {
    const t = totals(clusters, arm);
    const P = ratio(t.correct, t.units), R = ratio(t.found, t.rows);
    out.arms[arm] = { units: t.units, precision: P, recall: R, f1: f1(P.value || 0, R.value || 0) };
  }
  // E11b's own scoring of each member (file:line units), for the "same tool" check.
  out.e11bScoring = Object.fromEntries(members.map((m) => {
    const s = C.scoreHits(rows, hitsAll[m]?.hits || []);
    return [m, { hits: (hitsAll[m]?.hits || []).length, strict: [s.prec.all.correct, s.prec.all.units], recall: [s.rec.primary?.found ?? 0, s.rec.primary?.n ?? 0] }];
  }));
  const best = CRED_TOOLS.reduce((a, b) => (out.arms[b].f1 > out.arms[a].f1 ? b : a));
  const diff = (a, b, k) => (s) => metrics(s, a)[k] - metrics(s, b)[k];
  out.bestTool = best;
  out.tests = {
    H1: { what: "recall(U) - recall(P)", estimate: out.arms.U.recall.value - out.arms.P.recall.value, ci: bootstrap(clusters, diff("U", "P", "r")), supportedWhen: "lower bound > 0" },
    H2: { what: "precision(U) - precision(P)", estimate: out.arms.U.precision.value - out.arms.P.precision.value, ci: bootstrap(clusters, diff("U", "P", "p")), supportedWhen: "lower bound > -0.02" },
    H3: { what: `F1(U) - F1(${best})`, estimate: out.arms.U.f1 - out.arms[best].f1, ci: bootstrap(clusters, diff("U", best, "f1")), supportedWhen: "lower bound > 0" },
    "A recall": { what: "recall(A) - recall(P)", estimate: out.arms.A.recall.value - out.arms.P.recall.value, ci: bootstrap(clusters, diff("A", "P", "r")), supportedWhen: "lower bound > 0" },
    "A precision": { what: "precision(A) - precision(P)", estimate: out.arms.A.precision.value - out.arms.P.precision.value, ci: bootstrap(clusters, diff("A", "P", "p")), supportedWhen: "lower bound > -0.02" },
  };
  for (const t of Object.values(out.tests)) t.holds = t.ci[0] != null && t.ci[0] > (t.supportedWhen.includes("-0.02") ? -0.02 : 0);
  out.crossToolMerges = groups.filter((g) => new Set(g.map((h) => h.tool)).size > 1).length;
  return { out, groups };
}

// ── Score: SecBench.js ───────────────────────────────────────────────────

const PATTERN_CWE = { "command-injection": ["CWE-78"], eval: ["CWE-95"] };

async function scoreSecbench(hitsAll) {
  const S = await import("./secbench.mjs");
  const pen = hitsAll.penthera.results.filter((r) => r.status === "ok");
  const byKey = new Map(pen.map((r) => [`${r.cls}/${r.folder}`, r]));
  const labels = pen.filter((r) => r.sinkFile).map((r) => ({ key: `${r.cls}/${r.folder}`, cls: r.cls, sinkFile: r.sinkFile }));
  const members = ["penthera", ...SAST_TOOLS];
  const foundBy = (tool, l) => tool === "penthera"
    ? byKey.get(l.key).sinks.some((s) => s.pattern === S.CLASSES[l.cls] && s.file === l.sinkFile)
    : (hitsAll[tool]?.per?.[l.key]?.hits || []).some((h) => h.cls === l.cls && h.file === l.sinkFile);
  const armsOf = { P: ["penthera"], semgrep: ["semgrep"], codeql: ["codeql"], U: members, "P+semgrep": ["penthera", "semgrep"], "P+codeql": ["penthera", "codeql"] };
  const rowsFound = labels.map((l) => Object.fromEntries(members.map((m) => [m, foundBy(m, l)])));
  const inArm = (arm, f) => (arm === "A" ? f.penthera || (f.semgrep && f.codeql) : armsOf[arm].some((m) => f[m]));
  const out = { labels: labels.length, toolErrors: Object.fromEntries(SAST_TOOLS.map((t) => [t, Object.values(hitsAll[t]?.per || {}).filter((x) => x.error).length])), arms: {} };
  for (const arm of [...Object.keys(armsOf), "A"]) out.arms[arm] = { recall: ratio(rowsFound.filter((f) => inArm(arm, f)).length, labels.length) };

  // Noise: distinct merged findings per package (Penthera's non-sink findings
  // have no location in the raw output, so they are added unmerged).
  const noise = Object.fromEntries([...Object.keys(armsOf), "A"].map((a) => [a, []]));
  const crossGroups = [];
  for (const [key, r] of byKey) {
    const hits = [
      ...r.sinks.map((s) => ({ tool: "penthera", file: s.file, line: s.line, rule: s.pattern, cwe: PATTERN_CWE[s.pattern] || [] })),
      ...SAST_TOOLS.flatMap((t) => (hitsAll[t]?.per?.[key]?.hits || []).map((h) => ({ tool: t, file: h.file, line: h.line, rule: h.rule, cwe: h.cwe || [] }))),
    ];
    const groups = mergeHits(
      hits,
      (h) => ({ category: "code", file: h.file, line: h.line, key: { cwe: h.cwe }, sources: [{ tool: h.tool, ruleId: h.rule }] }),
      (h) => `${h.file}:${h.line}:${h.rule ?? ""}`,
      (h) => `${h.file}:${h.line}`,
    );
    for (const g of groups) if (new Set(g.map((h) => h.tool)).size > 1) crossGroups.push(g.map((h) => ({ ...h, pkg: key })));
    for (const arm of Object.keys(noise)) {
      const m = arm === "A" ? members : armsOf[arm];
      const gs = arm === "A" ? agreement(groups) : armOf(groups, m);
      noise[arm].push(gs.length + (m.includes("penthera") ? r.otherFindings : 0));
    }
  }
  const stats = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const med = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
    return { packages: s.length, median: med, mean: s.length ? Math.round((s.reduce((x, y) => x + y, 0) / s.length) * 10) / 10 : null, max: s.length ? s[s.length - 1] : null };
  };
  for (const arm of Object.keys(noise)) out.arms[arm].findingsPerPackage = stats(noise[arm]);
  // E11b's own per-class counts per member, for the "same tool" check.
  out.e11bScoring = Object.fromEntries(members.map((m) => [m, Object.fromEntries(Object.keys(S.CLASSES).map((c) => {
    const ls = labels.map((l, i) => [l, rowsFound[i]]).filter(([l]) => l.cls === c);
    return [c, [ls.filter(([, f]) => f[m]).length, ls.length]];
  }))]));
  const b = rowsFound.filter((f) => f.penthera && !inArm("U", f)).length;
  const c = rowsFound.filter((f) => !f.penthera && inArm("U", f)).length;
  out.tests = {
    H4: {
      what: "recall(U) - recall(P), pooled", estimate: out.arms.U.recall.value - out.arms.P.recall.value,
      ci: bootstrap(rowsFound, (s) => (s.filter((f) => inArm("U", f)).length - s.filter((f) => f.penthera).length) / s.length),
      mcnemar: { b, c, p: mcnemar(b, c) }, supportedWhen: "lower bound > 0",
    },
  };
  out.tests.H4.holds = out.tests.H4.ci[0] > 0;
  out.crossToolMerges = crossGroups.length;
  return { out, groups: crossGroups };
}

// ── Spot-check ───────────────────────────────────────────────────────────

/** A seeded sample of cross-tool merged groups, with the line for a reviewer (local only). */
function spotCheck(groups, n, readText) {
  const cross = groups.filter((g) => new Set(g.map((h) => h.tool)).size > 1);
  const rand = rng(SEED);
  return cross.map((g) => [rand(), g]).sort((a, b) => a[0] - b[0]).slice(0, n)
    .map(([, g]) => ({ ...(g[0].pkg ? { pkg: g[0].pkg } : {}), file: g[0].file, line: g[0].line, tools: g.map((h) => `${h.tool}:${h.rule}`), text: readText(g[0]) }));
}

// ── Main ─────────────────────────────────────────────────────────────────

ensureDir(RESULTS);
const only = OPT.only ? OPT.only.split(",") : ["creddata", "secbench"];
if (OPT.collect) {
  const prev = existsSync(HITS) ? JSON.parse(readFileSync(HITS, "utf-8")) : {};
  const out = { ...prev, split: SPLIT, date: new Date().toISOString() };
  if (only.includes("creddata")) out.creddata = await collectCreddata();
  if (only.includes("secbench")) out.secbench = await collectSecbench();
  writeFileSync(HITS, JSON.stringify(out));
  console.error(`[e14] per-item hits → ${HITS}`);
}

const all = JSON.parse(readFileSync(HITS, "utf-8"));
const result = { experiment: "E14", split: SPLIT, date: new Date().toISOString(), hitsSha256: sha256(readFileSync(HITS)), seed: SEED, resamples: RESAMPLES };
let credGroups = null;
if (all.creddata) {
  const { out, groups } = await scoreCreddata(all.creddata);
  result.creddata = out;
  credGroups = groups;
}
let sastGroups = null;
if (all.secbench) {
  const { out, groups } = await scoreSecbench(all.secbench);
  result.secbench = out;
  sastGroups = groups;
}
const fam = [result.creddata?.tests?.H1, result.creddata?.tests?.H2, result.creddata?.tests?.H3, result.secbench?.tests?.H4];
const adj = holm(fam.map((t) => t?.mcnemar?.p ?? null));
fam.forEach((t, i) => { if (t?.mcnemar) t.mcnemar.pHolm = adj[i]; });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

if (OPT["spot-check"]) {
  const n = Number(OPT["spot-check"]);
  const line = (path, l) => { try { return readFileSync(path, "utf-8").split("\n")[l - 1].slice(0, 160); } catch { return null; } };
  const sample = {
    creddata: credGroups ? spotCheck(credGroups, n, (h) => line(join(CACHE, "creddata", h.file), h.line)) : [],
    // Penthera's scan leaves each package unpacked in secbench-src (secbench.mjs scan()).
    secbench: sastGroups ? spotCheck(sastGroups, n, (h) => line(join(CACHE, "secbench-src", h.pkg, h.file), h.line)) : [],
  };
  const file = join(RESULTS, `giants.${SPLIT}.spot-check.json`);
  writeFileSync(file, JSON.stringify(sample, null, 2));
  console.error(`[e14] spot-check sample → ${file}`);
}
