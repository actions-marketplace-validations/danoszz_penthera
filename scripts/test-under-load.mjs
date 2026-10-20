#!/usr/bin/env node
// Run the full vitest suite repeatedly while busy loops occupy every core, to
// reproduce the flakiness a loaded developer laptop shows (and prove it's gone).
//
//   node scripts/test-under-load.mjs [runs=10] [burners=<cores>] [--background] [-- extra vitest args]
//
// --background (macOS) starts vitest with `taskpolicy -b`: background QoS, so
// the scheduler keeps it on the efficiency cores with throttled I/O while the
// burners compete at normal priority. That is what a suite gets when the
// terminal or app running it is not in front and the laptop is busy.
//
// Each run's failing tests (file > name: first error line) are printed; the
// exit code is the number of failed runs. Full vitest output for run N goes to
// $TMPDIR/penthera-load-<pid>-run-N.log.
import { spawn } from "node:child_process";
import { availableParallelism, tmpdir } from "node:os";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

const sep = process.argv.indexOf("--");
const args = sep === -1 ? process.argv.slice(2) : process.argv.slice(2, sep);
const background = args.includes("--background");
const pos = args.filter((a) => !a.startsWith("--"));
const extra = sep === -1 ? [] : process.argv.slice(sep + 1);
const runs = Number(pos[0] ?? 10);
const burnerCount = Number(pos[1] ?? availableParallelism());

const burners = Array.from({ length: burnerCount }, () =>
  new Worker("for (;;) Math.sqrt(Math.random());", { eval: true }));

let current = null;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (current) try { process.kill(-current.pid, "SIGKILL"); } catch {}
    process.exit(130);
  });
}

function runOnce(i) {
  return new Promise((resolve) => {
    const json = join(tmpdir(), `penthera-load-${process.pid}-run-${i}.json`);
    const log = join(tmpdir(), `penthera-load-${process.pid}-run-${i}.log`);
    const started = Date.now();
    const startedMono = process.hrtime.bigint(); // stops while the machine sleeps (macOS)
    const cmd = ["npx", "vitest", "run", "--reporter=dot", "--reporter=json", `--outputFile.json=${json}`, ...extra];
    if (background && process.platform === "darwin") cmd.unshift("taskpolicy", "-b");
    const child = spawn(cmd[0], cmd.slice(1), { stdio: ["ignore", "pipe", "pipe"], detached: true });
    current = child;
    // A starved run can wedge for good; give up on it after 20 minutes.
    const cap = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 20 * 60_000);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      clearTimeout(cap);
      current = null;
      writeFileSync(log, out);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const slept = Math.round((Date.now() - started - Number(process.hrtime.bigint() - startedMono) / 1e6) / 1000);
      let failed = [];
      let total = "?";
      try {
        const r = JSON.parse(readFileSync(json, "utf8"));
        total = `${r.numPassedTests}/${r.numTotalTests}`;
        for (const f of r.testResults) {
          if (f.status === "failed" && !f.assertionResults.some((a) => a.status === "failed")) failed.push(`${f.name.split("/tests/")[1]}: ${String(f.message).split("\n")[0]}`);
          for (const a of f.assertionResults) if (a.status === "failed") failed.push(`${f.name.split("/tests/")[1]} > ${a.fullName}: ${String(a.failureMessages?.[0] ?? "").split("\n")[0].slice(0, 200)}`);
        }
      } catch { failed.push(`no JSON report (exit ${code}); see ${log}`); }
      resolve({ code, secs, total, failed, slept });
    });
  });
}

let bad = 0;
console.log(`penthera test-under-load: ${runs} runs, ${burnerCount} busy-loop threads on ${availableParallelism()} cores${background ? ", vitest at background QoS" : ""} ${extra.join(" ")}`);
for (let i = 1; i <= runs; i++) {
  const r = await runOnce(i);
  const ok = r.code === 0 && r.failed.length === 0;
  if (!ok) bad++;
  // A laptop that sleeps mid-run freezes everything; such a run proves nothing either way.
  const note = r.slept > 5 ? `  (INVALID: machine slept ${r.slept}s during this run)` : "";
  console.log(`run ${String(i).padStart(2)}: ${ok ? "PASS" : "FAIL"}  ${r.total} tests  ${r.secs}s${note}`);
  for (const f of r.failed) console.log(`         ✗ ${f}`);
}
console.log(`${runs - bad}/${runs} runs green`);
await Promise.all(burners.map((w) => w.terminate()));
process.exit(bad);
