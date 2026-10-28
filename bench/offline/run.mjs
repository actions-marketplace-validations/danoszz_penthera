#!/usr/bin/env node
/**
 * E17 runner: does Penthera work unplugged, and give the same answer twice?
 * Protocol: docs/research/prereg/E17-offline-and-determinism.md
 *
 *   node bench/offline/run.mjs [--pilot] [--out bench/offline/results]
 *
 * Every command × target runs three times: A and B with scripts/ci/net-guard.cjs
 * preloaded, C without it. Each run gets a fresh empty HOME and cwd. The
 * runner writes raw outputs and a summary.json; RESULTS.md is written by hand
 * from that summary.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = join(ROOT, "bin", "penthera.js");
const GUARD = join(ROOT, "scripts", "ci", "net-guard.cjs");
const args = process.argv.slice(2);
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(ROOT, "bench", "offline", "results");
const PILOT = args.includes("--pilot");

// § 6: fixed before any run.
const VOLATILE = /(At|Ms|_at|_ms|time|timestamp|date|duration|elapsed|generated)$/i;

const TARGETS = {
  T1: join(ROOT, "tests", "fixtures", "repo-scan", "express-routes"),
  T2: join(ROOT, "tests", "fixtures", "agents", "malicious"),
  T3: ROOT,
};

// Each command returns argv for a target; `json` says whether stdout is JSON.
const COMMANDS = {
  C1: { argv: (t) => ["--repo", t, "--json"], json: true },
  C2: { argv: (t) => ["--repo", t, "--offline", "--json"], json: true },
  C3: { argv: (t) => ["agents", t, "--json"], json: true },
  C4: { argv: (t) => ["deps", t, "--json"], json: true },
  C5: { evidence: true },
  C6: { brief: true },
};

function normalize(value, tokens) {
  if (Array.isArray(value)) return value.map((v) => normalize(v, tokens));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE.test(k)) continue;
      out[k] = normalize(value[k], tokens);
    }
    return out;
  }
  return typeof value === "string" ? replaceTokens(value, tokens) : value;
}

function replaceTokens(s, tokens) {
  let r = s;
  for (const [from, to] of tokens) if (from) r = r.split(from).join(to);
  return r;
}

function diffPaths(a, b, path = "$", out = []) {
  if (out.length > 50) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(path); return out; }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b || {})]);
    for (const k of keys) diffPaths(a[k], b?.[k], `${path}.${k}`, out);
    return out;
  }
  if (a !== b) out.push(path);
  return out;
}

function run(argv, { guard }) {
  const home = mkdtempSync(join(tmpdir(), "e17-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "e17-cwd-"));
  const log = join(cwd, "..", `${cwd.split("/").pop()}-guard.log`);
  const env = {
    PATH: process.env.PATH, HOME: home, CI: "1", NO_COLOR: "1", PENTHERA_BRIEF: "0",
    TMPDIR: process.env.TMPDIR || tmpdir(),
  };
  if (guard) {
    env.NODE_OPTIONS = `--require ${GUARD}`;
    env.PENTHERA_NET_GUARD_LOG = log;
  }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [BIN, ...argv.map((a) => a.replace("{cwd}", cwd))], {
    cwd, env, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024, timeout: 600_000,
  });
  const guardLog = existsSync(log) ? readFileSync(log, "utf-8") : "";
  return { home, cwd, code: r.status, stdout: r.stdout, stderr: r.stderr, guardLog, ms: Date.now() - t0 };
}

function hostsOf(guardLog) {
  return [...new Set(guardLog.split("\n").filter(Boolean).map((l) => l.split(" ").slice(0, 2).join(" ")))];
}

function compare(cmd, a, b) {
  const tok = (r) => [[r.cwd, "<CWD>"], [r.home, "<HOME>"], [ROOT, "<ROOT>"]];
  if (cmd.json) {
    let ja, jb;
    try { ja = normalize(JSON.parse(a.stdout), tok(a)); jb = normalize(JSON.parse(b.stdout), tok(b)); }
    catch (e) { return { ok: false, paths: [`unparseable JSON: ${e.message}`] }; }
    const paths = diffPaths(ja, jb);
    return { ok: paths.length === 0 && a.code === b.code, paths, codes: [a.code, b.code] };
  }
  const sa = replaceTokens(a.stdout, tok(a)), sb = replaceTokens(b.stdout, tok(b));
  return { ok: sa === sb && a.code === b.code, paths: sa === sb ? [] : ["stdout"], codes: [a.code, b.code] };
}

// C5 and C6 are two-step: they need a file from an earlier command.
function stepArgv(id, target, phase) {
  if (id === "C5") return phase === 1 ? ["--repo", target, "--evidence", "{cwd}/ev"] : null;
  if (id === "C6") return phase === 1 ? ["--repo", target, "--output", "{cwd}/r.json"] : null;
  return COMMANDS[id].argv(target);
}

function runCommand(id, target, guard) {
  const cmd = COMMANDS[id];
  if (!cmd.evidence && !cmd.brief) return run(cmd.argv(target), { guard });
  const first = run(stepArgv(id, target, 1), { guard });
  const second = cmd.evidence
    ? runIn(first, ["evidence", "verify", join(first.cwd, "ev")], guard)
    : runIn(first, ["brief", join(first.cwd, "r.json")], guard);
  return { ...second, guardLog: first.guardLog + second.guardLog, firstCode: first.code };
}

function runIn(prev, argv, guard) {
  const log = join(prev.cwd, "..", `${prev.cwd.split("/").pop()}-guard2.log`);
  const env = { PATH: process.env.PATH, HOME: prev.home, CI: "1", NO_COLOR: "1", PENTHERA_BRIEF: "0" };
  if (guard) { env.NODE_OPTIONS = `--require ${GUARD}`; env.PENTHERA_NET_GUARD_LOG = log; }
  const r = spawnSync(process.execPath, [BIN, ...argv], { cwd: prev.cwd, env, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  return { home: prev.home, cwd: prev.cwd, code: r.status, stdout: r.stdout, stderr: r.stderr, guardLog: existsSync(log) ? readFileSync(log, "utf-8") : "" };
}

async function withMockServer(fn) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn(process.execPath, [join(ROOT, "tests", "fixtures", "mock-server.js")], { env: { ...process.env, MOCK_PORT: String(port) }, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  try { return await fn(port); } finally { srv.kill(); }
}

mkdirSync(OUT, { recursive: true });
const summary = { experiment: "E17", pilot: PILOT, node: process.version, platform: process.platform, rows: [] };

for (const id of Object.keys(COMMANDS)) {
  for (const [tid, target] of Object.entries(TARGETS)) {
    if (id === "C3" && tid !== "T2" && tid !== "T3") continue; // agents: config targets only
    const A = runCommand(id, target, true);
    const B = runCommand(id, target, true);
    const C = runCommand(id, target, false);
    const h2 = compare(COMMANDS[id].json ? COMMANDS[id] : { json: false }, A, B);
    const h3 = compare(COMMANDS[id].json ? COMMANDS[id] : { json: false }, A, C);
    const row = {
      command: id, target: tid, codes: { A: A.code, B: B.code, C: C.code },
      H1: { pass: !A.guardLog && !B.guardLog, hosts: hostsOf(A.guardLog + B.guardLog) },
      H2: { pass: h2.ok, paths: h2.paths }, H3: { pass: h3.ok, paths: h3.paths },
    };
    summary.rows.push(row);
    writeFileSync(join(OUT, `${id}-${tid}-A.out`), A.stdout + "\n--- stderr\n" + A.stderr);
    writeFileSync(join(OUT, `${id}-${tid}-C.out`), C.stdout + "\n--- stderr\n" + C.stderr);
    process.stderr.write(`${id} ${tid}: H1 ${row.H1.pass ? "pass" : "FAIL " + row.H1.hosts.join(", ")} · H2 ${row.H2.pass ? "pass" : "FAIL " + row.H2.paths.slice(0, 5).join(", ")} · H3 ${row.H3.pass ? "pass" : "FAIL " + row.H3.paths.slice(0, 5).join(", ")} · exit ${A.code}/${B.code}/${C.code}\n`);
    for (const r of [A, B, C]) { rmSync(r.home, { recursive: true, force: true }); rmSync(r.cwd, { recursive: true, force: true }); }
  }
}

// C7 and the positive control: a loopback mock server.
await withMockServer(async (port) => {
  const url = `http://127.0.0.1:${port}`;
  const mk = (extra) => ({ argv: () => [url, ...extra, "--json"], json: true });
  for (const [id, cmd] of [["C7", mk(["--offline"])], ["CTRL", mk([])]]) {
    COMMANDS[id] = cmd;
    const A = run(cmd.argv(), { guard: true });
    const B = run(cmd.argv(), { guard: true });
    const C = run(cmd.argv(), { guard: false });
    const h2 = compare(cmd, A, B), h3 = compare(cmd, A, C);
    const row = {
      command: id, target: "mock", codes: { A: A.code, B: B.code, C: C.code },
      H1: { pass: !A.guardLog && !B.guardLog, hosts: hostsOf(A.guardLog + B.guardLog) },
      H2: { pass: h2.ok, paths: h2.paths }, H3: { pass: h3.ok, paths: h3.paths },
    };
    summary.rows.push(row);
    process.stderr.write(`${id} mock: H1 ${row.H1.pass ? "pass" : "FAIL " + row.H1.hosts.join(", ")} · H2 ${row.H2.pass ? "pass" : "FAIL " + row.H2.paths.slice(0, 5).join(", ")} · H3 ${row.H3.pass ? "pass" : "FAIL " + row.H3.paths.slice(0, 5).join(", ")}\n`);
    for (const r of [A, B, C]) { rmSync(r.home, { recursive: true, force: true }); rmSync(r.cwd, { recursive: true, force: true }); }
  }
});

const ctrl = summary.rows.find((r) => r.command === "CTRL");
summary.guardWorks = ctrl ? !ctrl.H1.pass : null;
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
process.stderr.write(`\nPositive control (guard logs an outside connection): ${summary.guardWorks ? "yes" : "NO, run void"}\n`);
