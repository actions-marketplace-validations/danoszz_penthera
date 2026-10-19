/**
 * Run the project's own test script during verification (--run-tests only).
 *
 * Uses `node --run test` rather than `npm test`: it runs the package.json script
 * directly, without npm's update check or registry lookups. The script itself is
 * the project's code, so the user opts in to running it with --run-tests.
 */
import { spawn } from "node:child_process";
import { readPackageJson } from "../../lib/fix/util.js";

const NPM_PLACEHOLDER = /no test specified/i;

/** True when package.json has a real `test` script. */
export function hasTestScript(repoPath) {
  const script = readPackageJson(repoPath)?.scripts?.test;
  return typeof script === "string" && script.trim() !== "" && !NPM_PLACEHOLDER.test(script);
}

/**
 * @param {string} repoPath
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<{ ok: boolean, exitCode: number|null, durationMs: number, output: string }>}
 */
export function runProjectTests(repoPath, { timeout = 10 * 60_000 } = {}) {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--run", "test"], {
      cwd: repoPath,
      env: { ...process.env, CI: "1", NO_UPDATE_NOTIFIER: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const keep = (chunk) => {
      output = (output + chunk).slice(-8_000); // the tail is enough to say why it failed
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, durationMs: Date.now() - start, output: String(e.message) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, exitCode: code, durationMs: Date.now() - start, output });
    });
  });
}
