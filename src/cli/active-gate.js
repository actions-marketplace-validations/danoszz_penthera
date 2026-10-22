/**
 * The gate in front of payload-based testing (--deep, --fuzz, --adaptive,
 * --all, --profile deep).
 *
 * METHODOLOGY.md promises that these modes are opt-in and need a
 * confirmation. This module is that confirmation, and the CLI and the
 * wizard both go through it:
 *
 * - Interactive: the user confirms in the terminal. A target on this machine
 *   needs a yes; any other target needs its hostname typed back, the same
 *   rule as the dashboard.
 * - Non-interactive (CI, Docker, piped, --json): `--confirm-target <host>`
 *   must name the target's hostname exactly. Consent is bound to one host,
 *   so a script cannot point an active scan somewhere else by accident.
 *
 * Active scans are also rate-limited by default (DEFAULT_ACTIVE_RATE
 * requests per second; --rate overrides it, 0 removes the limit).
 */
import { createInterface } from "node:readline";
import { isLocalHost } from "../ui/api/runs.js";

/** Requests per second for an active scan unless --rate says otherwise. */
export const DEFAULT_ACTIVE_RATE = 10;

/** The payload-sending modes switched on, in a stable order. */
export function activeModes({ deep = false, fuzz = false, adaptive = false } = {}) {
  return [deep && "deep", fuzz && "fuzz", adaptive && "adaptive"].filter(Boolean);
}

/**
 * Parse --rate. Undefined means "use the default": DEFAULT_ACTIVE_RATE for
 * an active scan, no limit otherwise. 0 means no limit.
 * @returns {number} requests per second, 0 for unlimited
 */
export function resolveRate(raw, active) {
  if (raw == null || raw === "") return active ? DEFAULT_ACTIVE_RATE : 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--rate must be a number of requests per second, 0 or more (got "${raw}").`);
  return n;
}

/**
 * Decide whether an active scan of `url` may start without asking.
 *
 * @param {object} p
 * @param {string} p.url - the scan target
 * @param {string|null} [p.confirmTarget] - the --confirm-target value
 * @returns {{ ok: true } | { ok: false, reason: string } | { ask: "yes" | "hostname", host: string }}
 */
export function checkActiveConsent({ url, confirmTarget = null }) {
  const host = new URL(url).hostname.toLowerCase();
  if (confirmTarget != null) {
    const given = String(confirmTarget).trim().toLowerCase();
    if (given === host) return { ok: true };
    return { ok: false, reason: `--confirm-target "${confirmTarget}" does not match the scan target's hostname (${host}).` };
  }
  return { ask: isLocalHost(host) ? "yes" : "hostname", host };
}

/** What an active scan sends, in plain words, for the prompt and the refusal. */
export function describeActive(modes) {
  const parts = [];
  if (modes.includes("deep")) parts.push("injection probes (SQLi, SSTI, SSRF, XSS, command injection) and a burst of login attempts with a SQL error check");
  if (modes.includes("fuzz")) parts.push("fuzzed API request bodies");
  if (modes.includes("adaptive")) parts.push("adaptive probes that may send unexpected methods, including DELETE");
  return parts.join("; ");
}

/**
 * Run the gate for the CLI. Prompts on stderr (stdout stays clean for
 * --json) when stdin and stderr are terminals; otherwise requires
 * --confirm-target.
 *
 * @param {object} p
 * @param {string} p.url
 * @param {string[]} p.modes - from activeModes()
 * @param {string|null} [p.confirmTarget]
 * @param {boolean} [p.interactive] - defaults to stdin and stderr being TTYs
 * @param {(question: string) => Promise<string>} [p.ask] - the wizard passes its own; injectable for tests
 * @param {(text: string) => void} [p.write] - where the explanation goes (stderr by default)
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function confirmActiveScan({ url, modes, confirmTarget = null, interactive, ask = askOnStderr, write = (t) => process.stderr.write(t) }) {
  const verdict = checkActiveConsent({ url, confirmTarget });
  if ("ok" in verdict) return verdict;

  const isInteractive = interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
  const what = describeActive(modes);
  if (!isInteractive) {
    return {
      ok: false,
      reason: `Active modes (${modes.join(", ")}) send ${what}. ` +
        `In a non-interactive run, confirm the target you own or are authorized to test with --confirm-target ${verdict.host}`,
    };
  }

  write(
    `\n  Active scan of ${verdict.host}: ${what}.\n` +
    "  Only test systems you own or have written permission to test.\n",
  );
  if (verdict.ask === "yes") {
    const answer = (await ask(`  ${verdict.host} is on this machine. Run the active scan? [y/N]: `)).trim().toLowerCase();
    return answer === "y" || answer === "yes" ? { ok: true } : { ok: false, reason: "Active scan not confirmed." };
  }
  const answer = (await ask(`  Type the hostname (${verdict.host}) to confirm you own it or have written permission to test it: `)).trim().toLowerCase();
  return answer === verdict.host ? { ok: true } : { ok: false, reason: "Hostname did not match; active scan not confirmed." };
}

function askOnStderr(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
