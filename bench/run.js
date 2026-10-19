#!/usr/bin/env node
/**
 * Penthera accuracy benchmark.
 *
 *   npm run bench                      score the bundled local targets, write bench/RESULTS.md
 *   npm run bench -- --check           also exit 1 if precision or recall drop below the CI floor
 *   npm run bench -- --target juice-shop [--url http://127.0.0.1:3000]
 *                                      scan an optional Docker target (see bench/README.md)
 *   npm run bench -- --no-write        print results, leave RESULTS.md alone
 *
 * Offline by construction: every target binds to 127.0.0.1, and global fetch is
 * wrapped so any request to a non-loopback host is refused and counted. The
 * count is printed in RESULTS.md and must be zero.
 *
 * Reproducible: Math.random is seeded for the run, so the fuzzer's payload
 * sample and the injection canaries are identical every time.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startMockServer } from "../tests/fixtures/mock-server.js";
import { startInjectionLab, startDecoyLab } from "./targets/labs.js";
import { writeRepoFixture } from "./targets/repo-fixture.js";
import { scanUrl } from "../src/scan-url.js";
import { scanRepo } from "../src/scan-repo.js";
import { mergeResults } from "../src/cli/merge-results.js";
import { resolveScanOptions } from "../src/cli/profiles.js";
import { scoreTarget, totalScore } from "./score.js";
import { mulberry32 } from "./prng.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const GROUND_TRUTH = JSON.parse(readFileSync(join(HERE, "ground-truth.json"), "utf-8"));
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

// CI floor, set just under the current score (19 TP, 3 FP, 2 FN): one extra
// false positive or one lost detection fails the build.
export const CI_FLOOR = { precision: 0.85, recall: 0.9 };

const STARTERS = {
  "mock-server": startMockServer,
  "injection-lab": startInjectionLab,
  "decoy-lab": startDecoyLab,
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Refuse and count fetches to anything but loopback. Returns { blocked, restore }. */
export function guardNetwork() {
  const realFetch = globalThis.fetch;
  const state = { blocked: [] };
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (!LOOPBACK.has(url.hostname)) {
      state.blocked.push(url.origin);
      return Promise.reject(new Error(`bench: blocked non-loopback request to ${url.origin}`));
    }
    return realFetch(input, init);
  };
  state.restore = () => { globalThis.fetch = realFetch; };
  return state;
}

async function scanTarget(name, truth, overrideUrl) {
  const started = Date.now();
  if (truth.kind === "repo") {
    const { dir, cleanup } = writeRepoFixture();
    try {
      const r = await scanRepo(dir, { onPhase: () => {} });
      return { result: mergeResults([r]), ms: Date.now() - started };
    } finally {
      cleanup();
    }
  }

  const profile = resolveScanOptions({ profile: truth.profile || "standard" });
  const opts = {
    ...profile,
    recon: false,          // passive OSINT needs the internet
    skipRetireJs: true,    // Retire.js downloads its vulnerability database
    timeout: 5_000,
    onPhase: () => {},
  };

  let server = null;
  let url = overrideUrl || truth.url;
  if (STARTERS[name]) {
    server = await STARTERS[name](0);
    url = server.url;
  }
  try {
    const r = await scanUrl(url, opts);
    if (!r.reachable) throw new Error(`${name}: target ${url} is not reachable`);
    return { result: mergeResults([r]), ms: Date.now() - started };
  } finally {
    await server?.close();
  }
}

/** Run the benchmark over the given targets. Returns a report object. */
export async function runBenchmark(targetNames, { url, seed = 1 } = {}) {
  const guard = guardNetwork();
  const realRandom = Math.random;
  const targets = [];
  try {
    for (const name of targetNames) {
      // Re-seed per target so each target's result doesn't depend on which
      // targets ran before it.
      Math.random = mulberry32(seed);
      const truth = GROUND_TRUTH.targets[name];
      if (!truth) throw new Error(`Unknown target "${name}". Known: ${Object.keys(GROUND_TRUTH.targets).join(", ")}`);
      const { result, ms } = await scanTarget(name, truth, url);
      const scored = truth.labelled === false ? null : scoreTarget(result.findings, truth);
      targets.push({ name, truth, ms, findings: result.findings, score: scored });
    }
  } finally {
    guard.restore();
    Math.random = realRandom;
  }
  const scored = targets.filter((t) => t.score);
  return {
    version: PKG.version,
    node: process.version,
    targets,
    total: totalScore(scored.map((t) => t.score)),
    blocked: guard.blocked,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────

const pct = (x) => (x == null ? "n/a" : x.toFixed(3));

export function renderResults(report) {
  const L = [];
  const t = report.total;
  L.push("# Benchmark results");
  L.push("");
  L.push("Generated by `npm run bench`. Do not edit by hand; see [README.md](README.md) for the method and [ground-truth.json](ground-truth.json) for the labels.");
  L.push("");
  L.push(`- Penthera ${report.version}, Node ${report.node.split(".")[0].slice(1)}, Math.random seeded`);
  L.push(`- Targets: ${report.targets.map((x) => `\`${x.name}\``).join(", ")}`);
  L.push(`- Requests to non-loopback hosts: **${report.blocked.length}** (any would have been refused)`);
  L.push("");
  L.push("## Summary");
  L.push("");
  L.push("| Target | Profile | TP | FP | FN | Precision | Recall | F1 |");
  L.push("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const x of report.targets) {
    const s = x.score;
    const profile = x.truth.kind === "repo" ? "repo" : x.truth.profile;
    if (!s) {
      L.push(`| ${x.name} | ${profile} | | | | unlabelled | | |`);
      continue;
    }
    L.push(`| ${x.name} | ${profile} | ${s.tp} | ${s.fp} | ${s.fn} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} |`);
  }
  L.push(`| **Total** | | **${t.tp}** | **${t.fp}** | **${t.fn}** | **${pct(t.precision)}** | **${pct(t.recall)}** | **${pct(t.f1)}** |`);
  L.push("");
  L.push(`Info-severity findings are not scored (${t.info} this run). Duplicate reports of an already-matched vulnerability are not counted as false positives (${t.duplicates} this run).`);
  L.push("");
  L.push("## Precision by confidence label");
  L.push("");
  L.push("Each finding carries a confidence label (see [METHODOLOGY.md](../docs/METHODOLOGY.md#confidence-model)). This table checks whether the labels mean what they say.");
  L.push("");
  L.push("| Confidence | TP | FP | Precision |");
  L.push("|---|---:|---:|---:|");
  for (const conf of ["confirmed", "likely", "potential", "needs-human-review", "unlabelled"]) {
    const c = t.byConfidence[conf];
    if (!c) continue;
    L.push(`| ${conf} | ${c.tp} | ${c.fp} | ${pct(c.tp + c.fp ? c.tp / (c.tp + c.fp) : null)} |`);
  }
  L.push("");
  L.push("## False positives");
  L.push("");
  const fps = report.targets.flatMap((x) => (x.score?.falsePositives || []).map((f) => ({ ...f, target: x.name })));
  if (!fps.length) L.push("None.");
  for (const f of fps) {
    L.push(`- **${f.target}**: ${f.title} (\`${f.path}\`, ${f.confidence}).${f.reason ? ` ${f.reason}` : ""}`);
  }
  L.push("");
  L.push("## False negatives");
  L.push("");
  const fns = report.targets.flatMap((x) => (x.score?.falseNegatives || []).map((f) => ({ ...f, target: x.name })));
  if (!fns.length) L.push("None.");
  for (const f of fns) {
    L.push(`- **${f.target}**: \`${f.id}\` (\`${f.path}\`).${f.note ? ` ${f.note}` : ""}`);
  }
  L.push("");
  L.push("## Limits of these numbers");
  L.push("");
  L.push("The bundled targets are small and were written by the same people who wrote the scanner, so they measure regressions and the false-positive controls, not real-world accuracy. Scores against third-party targets such as OWASP Juice Shop or crAPI are only meaningful once their findings are labelled; see [README.md](README.md#optional-targets).");
  L.push("");
  return L.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────

async function main(argv) {
  const args = { targets: [], check: false, write: true, url: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--no-write") args.write = false;
    else if (a === "--target") args.targets.push(argv[++i]);
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--json") args.json = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  const defaults = Object.entries(GROUND_TRUTH.targets).filter(([, t]) => !t.optional).map(([n]) => n);
  const names = args.targets.length ? args.targets : defaults;
  const isDefaultSet = names.join() === defaults.join();

  const report = await runBenchmark(names, { url: args.url });

  for (const x of report.targets) {
    const s = x.score;
    const line = s
      ? `TP ${s.tp}  FP ${s.fp}  FN ${s.fn}  precision ${pct(s.precision)}  recall ${pct(s.recall)}`
      : `${x.findings.length} findings (unlabelled, not scored)`;
    console.log(`${x.name.padEnd(14)} ${line}  (${(x.ms / 1000).toFixed(1)}s)`);
  }
  const t = report.total;
  console.log(`${"total".padEnd(14)} TP ${t.tp}  FP ${t.fp}  FN ${t.fn}  precision ${pct(t.precision)}  recall ${pct(t.recall)}`);
  console.log(`non-loopback requests: ${report.blocked.length}`);

  if (args.json) {
    writeFileSync(args.json, JSON.stringify(report, null, 2) + "\n");
    console.log(`wrote ${args.json}`);
  }
  // Only the bundled default set produces the committed RESULTS.md.
  if (args.write && isDefaultSet) {
    writeFileSync(join(HERE, "RESULTS.md"), renderResults(report));
    console.log("wrote bench/RESULTS.md");
  }

  if (report.blocked.length) {
    console.error(`FAIL: ${report.blocked.length} request(s) to non-loopback hosts`);
    return 1;
  }
  if (args.check && t.tp + t.fp + t.fn > 0) {
    if ((t.precision ?? 0) < CI_FLOOR.precision || (t.recall ?? 0) < CI_FLOOR.recall) {
      console.error(`FAIL: below CI floor (precision >= ${CI_FLOOR.precision}, recall >= ${CI_FLOOR.recall})`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => { console.error(err.message); process.exit(2); },
  );
}
