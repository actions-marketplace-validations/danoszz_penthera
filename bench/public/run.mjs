#!/usr/bin/env node
/**
 * E11: Penthera on public benchmarks. Protocol:
 * docs/research/prereg/E11-public-benchmarks.md
 *
 *   npm run bench:public                         # all three
 *   npm run bench:public -- --only secbench      # one (creddata, secbench, malware)
 *   npm run bench:public -- --skip-fetch         # reuse what is in the cache
 *
 * Each benchmark has a fetch step (network: datasets, tarballs, samples) in
 * this process, then a scan step in a child process with the network guard
 * preloaded and an empty HOME, so every scan is offline. Scores and a
 * markdown summary go to $PENTHERA_BENCH_CACHE/public/results/.
 * Malware samples are deleted when the malware benchmark ends, also on failure.
 */
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { RESULTS, MALWARE_DIR, ensureDir, runOffline, sh } from "./common.mjs";
import * as creddata from "./creddata.mjs";
import * as secbench from "./secbench.mjs";
import * as malware from "./malware.mjs";

const BENCHES = { creddata, secbench, malware };
const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);

if (argv.includes("--child")) {
  // Offline scan step (runs under scripts/ci/net-guard.cjs).
  const raw = await BENCHES[opt("--child")].scan();
  writeFileSync(opt("--out"), JSON.stringify(raw));
  process.exit(0);
}

const only = opt("--only") ? opt("--only").split(",") : Object.keys(BENCHES);
ensureDir(RESULTS);
const env = { penthera: sh("git", ["rev-parse", "HEAD"], { cwd: join(import.meta.dirname, "..", "..") }), node: process.version, date: new Date().toISOString() };
for (const name of only) {
  const mod = BENCHES[name];
  if (!mod) throw new Error(`unknown benchmark ${name}`);
  const started = Date.now();
  try {
    console.error(`[${name}] fetch`);
    const fetched = argv.includes("--skip-fetch") ? {} : await mod.fetchData();
    if (name === "malware" && argv.includes("--skip-fetch")) malware.extractMalware();
    console.error(`[${name}] scan (offline child)`);
    const { result, blocked } = runOffline(name);
    writeFileSync(join(RESULTS, `${name}.raw.json`), JSON.stringify(name === "malware" ? { ...result, note: "finding kinds only, no sample content" } : result));
    const scored = await mod.score(result);
    const out = { benchmark: name, pin: mod.PIN, env, fetched, blockedConnections: blocked.length, blocked, seconds: Math.round((Date.now() - started) / 1000), ...scored };
    writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify(out, null, 2));
    const md = `## ${name}\n\nDataset pin \`${mod.PIN}\`, Penthera \`${env.penthera.slice(0, 7)}\`, Node ${env.node}, ${env.date.slice(0, 10)}. Blocked connections during the scan: ${blocked.length}.\n\n${mod.markdown(scored)}\n`;
    writeFileSync(join(RESULTS, `${name}.md`), md);
    console.log(md);
  } finally {
    if (name === "malware") {
      rmSync(MALWARE_DIR, { recursive: true, force: true });
      console.error(`[malware] deleted ${MALWARE_DIR}`);
    }
  }
}
