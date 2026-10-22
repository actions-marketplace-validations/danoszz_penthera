#!/usr/bin/env node
/**
 * E10 runner: Penthera against known-vulnerable apps (draft protocol,
 * docs/research/prereg/E10-known-vulnerable-apps.md).
 *
 *   npm run bench:known                         pilot apps, standard run, write RESULTS.md
 *   npm run bench:known -- --app dvna --run deep
 *   npm run bench:known -- --no-write --json out.json
 *
 * Heavy (Docker, minutes per app) and never part of `npm test`.
 *
 * Isolation: each app runs on its own `docker network create --internal`
 * network, so it has no route out. A relay container (socat) joins that
 * network and a normal one, and publishes the app on 127.0.0.1 only.
 * Penthera runs as a child process with `--offline`, HOME set to an empty
 * folder, and scripts/ci/net-guard.cjs preloaded, which fails and logs any
 * connection or DNS query to a host other than loopback.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APPS, RELAY_IMAGE, RUNS } from "./apps.mjs";
import { CLASSES, pool, scoreRun } from "./score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const CACHE = join(process.env.PENTHERA_BENCH_CACHE || join(homedir(), ".cache", "penthera-bench"), "known-vuln");
export const PILOT = ["juice-shop", "dvna"];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const docker = (...args) => sh("docker", args);
const quiet = (fn) => { try { return fn(); } catch { return null; } };

const truthOf = (app) => JSON.parse(readFileSync(join(HERE, app, "truth.json"), "utf-8"));
function labelsOf(app) {
  const p = join(HERE, app, "labels.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : { labels: {} };
}

/** Clone the app's source at the pinned commit into the cache (read only from then on). */
export function ensureSource(app, truth) {
  const dir = join(CACHE, "src", app);
  const { repo, commit } = truth.source;
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    sh("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", repo, dir]);
  }
  if (quiet(() => sh("git", ["-C", dir, "rev-parse", "HEAD"])) !== commit) {
    sh("git", ["-C", dir, "fetch", "--quiet", "origin", commit]);
    sh("git", ["-C", dir, "checkout", "--quiet", "--detach", commit]);
  }
  const head = sh("git", ["-C", dir, "rev-parse", "HEAD"]);
  if (head !== commit) throw new Error(`${app}: source is at ${head}, expected ${commit}`);
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** Start the app on an internal network with a loopback-only relay. Returns { url, stop, isolation }. */
async function startApp(app, cfg) {
  const id = `pk-e10-${app}`;
  const net = { int: `${id}-int`, edge: `${id}-edge` };
  const names = { target: `${id}-target`, relay: `${id}-relay` };
  const stop = () => {
    for (const n of Object.values(names)) quiet(() => docker("rm", "-f", n));
    for (const n of Object.values(net)) quiet(() => docker("network", "rm", n));
  };
  stop(); // leftovers from an interrupted run

  docker("pull", "--quiet", ...(cfg.platform ? ["--platform", cfg.platform] : []), cfg.image);
  docker("pull", "--quiet", RELAY_IMAGE);
  docker("network", "create", "--internal", net.int);
  docker("network", "create", net.edge);
  const hostPort = await freePort();
  try {
    docker("run", "-d", "--name", names.target, "--network", net.int, "--network-alias", "target",
      "--security-opt", "no-new-privileges", "--memory", "2g", "--pids-limit", "1024",
      ...(cfg.platform ? ["--platform", cfg.platform] : []), cfg.image);
    docker("create", "--name", names.relay, "--network", net.edge, "-p", `127.0.0.1:${hostPort}:${cfg.port}`,
      "--security-opt", "no-new-privileges", RELAY_IMAGE,
      `TCP-LISTEN:${cfg.port},fork,reuseaddr`, `TCP:target:${cfg.port}`);
    docker("network", "connect", net.int, names.relay);
    docker("start", names.relay);

    const url = `http://127.0.0.1:${hostPort}`;
    const deadline = Date.now() + cfg.readyTimeoutMs;
    for (;;) {
      const status = await fetch(url + cfg.readyPath, { redirect: "manual" }).then((r) => r.status, () => 0);
      if (status && status < 500) break;
      if (Date.now() > deadline) throw new Error(`${app}: not ready after ${cfg.readyTimeoutMs / 1000}s (last status ${status})`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    const isolation = {
      internalNetwork: docker("network", "inspect", net.int, "--format", "{{.Internal}}") === "true",
      targetNetworks: Object.keys(JSON.parse(docker("inspect", names.target, "--format", "{{json .NetworkSettings.Networks}}"))),
      publishedOn: docker("port", names.relay),
      imageDigest: docker("inspect", names.target, "--format", "{{.Image}}"),
    };
    if (!isolation.internalNetwork || isolation.targetNetworks.join() !== net.int) throw new Error(`${app}: isolation check failed`);
    return { url, stop, isolation };
  } catch (e) {
    stop();
    throw e;
  }
}

/** Run the Penthera CLI from this checkout as a child process. Returns { report, blocked, ms }. */
function runPenthera(url, src, run) {
  const home = mkdtempSync(join(tmpdir(), "pk-e10-home-"));
  const guardLog = join(home, "guard.log");
  const args = ["--require", join(ROOT, "scripts", "ci", "net-guard.cjs"), join(ROOT, "bin", "penthera.js"),
    url, "--repo", src, "--offline", "--json", "--profile", run.profile, "--timeout", "10000"];
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: { PATH: process.env.PATH, HOME: home, PENTHERA_NET_GUARD_LOG: guardLog, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      const blocked = existsSync(guardLog) ? readFileSync(guardLog, "utf-8").split("\n").filter(Boolean) : [];
      rmSync(home, { recursive: true, force: true });
      const start = out.indexOf("{");
      try {
        resolve({ report: JSON.parse(out.slice(start)), blocked, ms: Date.now() - started, exitCode: code });
      } catch {
        reject(new Error(`penthera exited ${code} without JSON output:\n${err.slice(-2000)}`));
      }
    });
  });
}

/** Scan one app with each requested run. */
export async function benchApp(app, runNames) {
  const cfg = APPS[app];
  const truth = truthOf(app);
  const labels = labelsOf(app);
  const src = ensureSource(app, truth);
  const started = await startApp(app, cfg);
  const runs = [];
  try {
    for (const name of runNames) {
      const run = RUNS[name];
      const { report, blocked, ms, exitCode } = await runPenthera(started.url, src, run);
      const findings = report.findings || [];
      const score = scoreRun(findings, truth, run, labels.labels || {}, src + "/");
      runs.push({ name, run, ms, exitCode, blocked, executedProbes: [...new Set(report.executedProbes || [])].sort(), score });
    }
  } finally {
    started.stop();
  }
  return { app, truth, labeller: labels.labeller || null, isolation: started.isolation, runs };
}

// ── Rendering ────────────────────────────────────────────────────────────

const f3 = (x) => (x == null ? "n/a" : x.toFixed(2));
const ci = (w) => (w ? `${f3(w.p)} [${f3(w.lo)}, ${f3(w.hi)}]` : "n/a");
const ratio = (a, b) => `${a}/${b}`;

export function renderResults(report) {
  const L = [];
  L.push("# E10 pilot: Penthera on known-vulnerable apps");
  L.push("");
  L.push("> **Pilot, not the registered result.** E10 is a draft protocol ([E10-known-vulnerable-apps.md](../../docs/research/prereg/E10-known-vulnerable-apps.md)). These numbers test the pipeline, use one provisional labeller, and must not be quoted as Penthera's accuracy.");
  L.push("");
  L.push("Generated by `npm run bench:known`; see [README.md](README.md) for the method.");
  L.push("");
  L.push(`- Penthera ${report.version} (this checkout, commit \`${report.commit}\`), Node ${report.node}, Docker ${report.docker}`);
  L.push(`- Date: ${report.date}`);
  L.push(`- Runs: ${report.runNames.map((n) => `\`${n}\` = ${RUNS[n].label}`).join("; ")}. No run logs in, so answer-key entries that need a session are outside every recall figure here.`);
  L.push(`- Connections refused by the guard (non-loopback): **${report.apps.flatMap((a) => a.runs.flatMap((r) => r.blocked)).length}**`);
  L.push("");
  L.push("## Targets");
  L.push("");
  L.push("| App | Source | Image | Isolation |");
  L.push("|---|---|---|---|");
  for (const a of report.apps) {
    const t = a.truth;
    L.push(`| ${t.name} | [\`${t.source.commit.slice(0, 10)}\`](${t.source.repo}/tree/${t.source.commit}) (${t.source.ref}) | \`${APPS[a.app].image.split("@")[1].slice(0, 19)}…\` | internal network only; relay on ${a.isolation.publishedOn.replace(/\n/g, ", ")} |`);
  }
  const ran = new Set(report.apps.map((a) => a.app));
  for (const [app, cfg] of Object.entries(APPS)) {
    if (ran.has(app)) continue;
    L.push(`| ${app} | answer key only | | ${cfg.runnable ? "runnable, not in this run" : `not runnable yet: ${cfg.reason}`} |`);
  }
  L.push("");

  for (const name of report.runNames) {
    const rows = report.apps.map((a) => ({ a, r: a.runs.find((r) => r.name === name) })).filter((x) => x.r);
    if (!rows.length) continue;
    L.push(`## Run \`${name}\`: ${RUNS[name].label}`);
    L.push("");
    L.push("| App | Findings | Matched key | Labelled correct | Incorrect | Unlabelled | Precision [95% CI] | Strict precision | Actionable precision | Root causes found | Recall [95% CI] |");
    L.push("|---|---:|---:|---:|---:|---:|---|---|---|---:|---|");
    for (const { a, r } of rows) {
      const t = r.score.total;
      L.push(`| ${a.app} | ${t.findings} | ${t.matched} | ${t.correct - t.matched} | ${t.incorrect} | ${t.unlabelled} | ${ci(t.precision)} | ${ci(t.strictPrecision)} | ${ci(t.actionablePrecision)} | ${ratio(t.groupsHit, t.groups)} | ${ci(t.recall)} |`);
    }
    const p = pool(rows.map((x) => x.r.score));
    const t = p.total;
    L.push(`| **Pooled** | ${t.findings} | ${t.matched} | ${t.correct - t.matched} | ${t.incorrect} | ${t.unlabelled} | ${ci(t.precision)} | ${ci(t.strictPrecision)} | ${ci(t.actionablePrecision)} | ${ratio(t.groupsHit, t.groups)} | ${ci(t.recall)} |`);
    L.push("");
    L.push("By class (pooled over apps):");
    L.push("");
    L.push("| Class | Findings | Correct | Precision [95% CI] | Root causes found | Recall [95% CI] |");
    L.push("|---|---:|---:|---|---:|---|");
    for (const c of [...CLASSES, "other"]) {
      const x = p.byClass[c];
      if (x) L.push(`| ${c} | ${x.findings} | ${x.correct} | ${ci(x.precision)} | ${ratio(x.groupsHit, x.groups)} | ${ci(x.recall)} |`);
    }
    L.push("");
    L.push("Probes Penthera reports as executed:");
    L.push("");
    for (const { a, r } of rows) L.push(`- ${a.app}: ${r.executedProbes.map((x) => `\`${x}\``).join(", ") || "none reported"} (${(r.ms / 1000).toFixed(0)} s, exit ${r.exitCode}; Penthera exits 1 when it reports a critical finding)`);
    L.push("");
    L.push("Misses (in-scope root causes with no matching finding):");
    L.push("");
    for (const { a, r } of rows) {
      const missed = r.score.groups.filter((g) => !g.hitBy);
      if (!missed.length) { L.push(`- ${a.app}: none`); continue; }
      for (const g of missed) L.push(`- ${a.app}: \`${g.group}\` (${g.class}, ${g.surface}; ${g.entries.join(", ")})`);
    }
    L.push("");
    L.push("Findings judged incorrect or cannot-tell:");
    L.push("");
    let any = false;
    for (const { a, r } of rows) {
      for (const u of r.score.units.filter((x) => x.verdict === "incorrect" || x.verdict === "cannot-tell")) {
        any = true;
        L.push(`- ${a.app}: ${u.title} (\`${u.file || u.path || "-"}\`, ${u.class}, ${u.confidence || "no label"}): ${u.verdict}. ${u.reason || ""}`.trim());
      }
    }
    if (!any) L.push("None.");
    L.push("");
  }

  L.push("## How to read this");
  L.push("");
  L.push("- **Precision** counts a finding as correct when it matches an in-scope answer-key entry, or when the labeller confirmed it in the app's `labels.json` (correct but not in the answer key, such as a missing header the app's docs do not list). `cannot-tell` counts as incorrect. Unlabelled findings are left out and counted.");
  L.push("- **Actionable precision** (level 2) counts only correct findings the owner should act on: a test fixture's password is correct but not actionable.");
  L.push("- **Strict precision** counts only answer-key matches as correct: a lower bound.");
  L.push("- **Recall** is over root causes (answer-key `group`s) in scope for the run. Entries that need a session or payloads count only in runs that have them.");
  L.push("- The labels here are one provisional labeller's (see each `labels.json`); the protocol needs two, blinded, with κ ≥ 0.70.");
  L.push("");
  return L.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = { apps: [], runs: [], write: true, json: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--app") a.apps.push(argv[++i]);
    else if (k === "--run") a.runs.push(argv[++i]);
    else if (k === "--no-write") a.write = false;
    else if (k === "--json") a.json = argv[++i];
    else if (k === "--help" || k === "-h") a.help = true;
    else throw new Error(`Unknown option ${k}`);
  }
  if (!a.apps.length) a.apps = PILOT;
  if (!a.runs.length) a.runs = ["standard"];
  for (const app of a.apps) {
    if (!APPS[app]) throw new Error(`Unknown app "${app}". Known: ${Object.keys(APPS).join(", ")}`);
    if (!APPS[app].runnable) throw new Error(`${app} is not runnable yet: ${APPS[app].reason}`);
  }
  for (const r of a.runs) if (!RUNS[r]) throw new Error(`Unknown run "${r}". Known: ${Object.keys(RUNS).join(", ")}`);
  return a;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("Usage: npm run bench:known -- [--app <name>]... [--run standard|deep]... [--no-write] [--json <file>]");
    return;
  }
  const report = {
    version: PKG.version,
    commit: quiet(() => sh("git", ["-C", ROOT, "rev-parse", "--short=10", "HEAD"])) || "unknown",
    node: process.version,
    docker: docker("version", "--format", "{{.Server.Version}}"),
    date: new Date().toISOString().slice(0, 10),
    runNames: args.runs,
    apps: [],
  };
  for (const app of args.apps) {
    console.error(`[e10] ${app}: starting (${args.runs.join(", ")})`);
    const r = await benchApp(app, args.runs);
    for (const run of r.runs) {
      const t = run.score.total;
      console.error(`[e10] ${app} ${run.name}: ${t.findings} findings, ${t.matched} matched, ${t.unlabelled} unlabelled, recall ${t.groupsHit}/${t.groups}, blocked ${run.blocked.length}`);
    }
    report.apps.push(r);
  }
  const md = renderResults(report);
  if (args.write) writeFileSync(join(HERE, "RESULTS.md"), md + "\n");
  else console.log(md);
  if (args.json) {
    const slim = { ...report, apps: report.apps.map(({ truth, ...rest }) => ({ ...rest, truth: { app: truth.app, source: truth.source } })) };
    writeFileSync(args.json, JSON.stringify(slim, null, 2) + "\n");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
