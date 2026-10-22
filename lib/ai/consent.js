/**
 * Consent for AI mode (docs/ai-mode.md, spec-ai-mode.md "Consent").
 *
 * Every `--ai` run asks. Nothing is remembered as permission: the log in
 * ~/.penthera/consent.jsonl records what was agreed, for the user and for an
 * auditor, and is never read back to skip a question.
 *
 * Two routes exist, and the text always states the one that applies:
 * - local:        Ollama on 127.0.0.1 runs the model on this computer.
 * - ollama-cloud: Ollama on 127.0.0.1 forwards the code to ollama.com. Needs a
 *                 second screen where the user types the host.
 *
 * Interactive runs ask on stderr (stdout stays clean for --json). A run that
 * cannot ask (CI, piped, --json) needs --ai-consent <route> or the policy
 * file's "ai": { "allow": ... }, and a local consent never covers the cloud.
 * Declining is never an error: the scan runs with rules only.
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Bumped whenever the meaning of the consent text changes; a log entry records the version shown. */
export const CONSENT_TEXT_VERSION = 1;
export const ROUTES = ["local", "ollama-cloud"];
export const CLOUD_HOST = "ollama.com";
export const CONSENT_LOG = "consent.jsonl";

export function consentLogPath(env = process.env) {
  const base = env.PENTHERA_HOME ? resolve(env.PENTHERA_HOME) : join(homedir(), ".penthera");
  return join(base, CONSENT_LOG);
}

/**
 * The five (or six) lines of the consent screen, plus the question.
 * @param {{ route: string, model: string, project: string, maxUnits: number, repro?: boolean }} p
 */
export function consentScreen({ route, model, project, maxUnits, repro = false }) {
  const cloud = route === "ollama-cloud";
  const lines = [
    "",
    "  AI mode: a model reads your code to look for problems the rules can't see.",
    "",
    cloud
      ? `  Model     ${model}, through your local Ollama, run on ${CLOUD_HOST}`
      : `  Model     ${model}, through Ollama on this computer (127.0.0.1)`,
    `  Reads     up to ${maxUnits} parts of ${project}, with secrets masked`,
    cloud
      ? `  Sends     those parts to ${CLOUD_HOST} (you confirm the host next)`
      : "  Sends     nothing off this computer",
    "  Decides   nothing. Penthera checks every model finding with its own rules.",
    "            Unchecked ones are labelled and never fail CI.",
  ];
  if (repro) lines.push(`  Runs      parts of ${project}'s own code in a sandbox with no network, to check findings`);
  lines.push("");
  return { text: lines.join("\n") + "\n", question: `  Use this model for ${project}? [y/N/details]: ` };
}

/** The second screen for a cloud model: the host is typed back. */
export function cloudScreen({ project, maxUnits }) {
  return {
    text: [
      "",
      `  This model runs on ${CLOUD_HOST}, not on this computer.`,
      "",
      `  Sends     up to ${maxUnits} parts of ${project}, secrets masked, to ${CLOUD_HOST}`,
      "            through your local Ollama, under Ollama's terms",
      "",
    ].join("\n") + "\n",
    question: `  Type ${CLOUD_HOST} to send your code there, or press Enter to stop: `,
  };
}

/** What `details` prints: the route in full, the model, and where consent is kept. */
export function consentDetails({ route, model, digest, size, logPath }) {
  const cloud = route === "ollama-cloud";
  return [
    "",
    "  What happens",
    cloud
      ? `    Penthera sends code units, secrets masked, to Ollama on 127.0.0.1, which forwards them to ${CLOUD_HOST}.`
      : "    Penthera sends code units, secrets masked, to Ollama on 127.0.0.1. Nothing else.",
    cloud
      ? `    Your code leaves this computer and is processed by ${CLOUD_HOST} under Ollama's terms.`
      : "    The model runs on this computer. The report lists every host Penthera contacted.",
    "    Penthera checks the address and the model. It cannot see whether something on",
    "    this computer forwards port 11434 elsewhere.",
    "    The model gets no tools, files, network or shell. Its findings are candidates:",
    "    a Penthera rule confirms them, or they are shown as model-proposed, unverified.",
    "",
    "  Model",
    `    ${model}${size ? ` (${formatBytes(size)})` : ""}${digest ? `, digest ${String(digest).slice(0, 19)}` : ""}`,
    "",
    "  Consent",
    "    Asked on every run; nothing is remembered as permission.",
    `    Each answer is logged on this computer only: ${logPath}`,
    "    `penthera ai consent` shows the log.",
    "",
  ].join("\n") + "\n";
}

function formatBytes(n) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;
}

/**
 * Decide consent without asking: the --ai-consent flag or the policy file.
 * @returns {{ ok: true, via: "flag"|"policy" } | { ok: false, reason: string } | null} null when nothing was given
 */
export function consentWithoutAsking({ route, flag = null, policyAllow = null }) {
  if (flag != null) {
    if (!ROUTES.includes(flag)) return { ok: false, reason: `--ai-consent must be one of ${ROUTES.join(", ")} (got "${flag}").` };
    if (flag === route) return { ok: true, via: "flag" };
    return { ok: false, reason: route === "ollama-cloud"
      ? `This model runs on ${CLOUD_HOST}. --ai-consent local does not cover it; use --ai-consent ollama-cloud to send code there.`
      : `--ai-consent ${flag} does not match this model's route (${route}).` };
  }
  if (policyAllow) {
    if (policyAllow.includes(route)) return { ok: true, via: "policy" };
    return { ok: false, reason: `penthera.policy.json allows AI mode only for ${policyAllow.join(", ") || "nothing"}; this model's route is ${route}.` };
  }
  return null;
}

/**
 * Ask for consent. Interactive: the screens above. Non-interactive: the flag
 * or the policy, else a refusal that names the flag.
 *
 * @param {object} p
 * @param {"local"|"ollama-cloud"} p.route
 * @param {string} p.model
 * @param {string} p.project - display name of the repo
 * @param {number} p.maxUnits
 * @param {boolean} [p.repro]
 * @param {string|null} [p.flag] - --ai-consent value
 * @param {string[]|null} [p.policyAllow] - policy ai.allow
 * @param {boolean} p.interactive
 * @param {(q: string) => Promise<string>} p.ask
 * @param {(t: string) => void} p.write
 * @param {object} [p.modelInfo] - { digest, size } for details
 * @returns {Promise<{ ok: boolean, via?: string, reason?: string, declined?: boolean }>}
 */
export async function askConsent(p) {
  if (!ROUTES.includes(p.route)) return { ok: false, reason: `Unknown AI route ${p.route}` };
  if (p.policyAllow && p.policyAllow.length === 0) {
    return { ok: false, reason: "penthera.policy.json turns AI mode off for this repository (\"ai\": { \"allow\": [] })." };
  }
  if (!p.interactive) {
    const decided = consentWithoutAsking(p);
    if (decided) return decided;
    return {
      ok: false,
      reason: `AI mode needs consent, and this run cannot ask. Add --ai-consent ${p.route}, or "ai": { "allow": ["${p.route}"] } in penthera.policy.json.`,
    };
  }
  if (p.flag != null && !ROUTES.includes(p.flag)) return consentWithoutAsking(p);

  const screen = consentScreen(p);
  for (;;) {
    p.write(screen.text);
    const answer = String(await p.ask(screen.question)).trim().toLowerCase();
    if (answer === "details" || answer === "d") {
      p.write(consentDetails({ route: p.route, model: p.model, digest: p.modelInfo?.digest, size: p.modelInfo?.size, logPath: consentLogPath(p.env) }));
      continue;
    }
    if (answer !== "y" && answer !== "yes") return { ok: false, declined: true, reason: "AI mode not confirmed." };
    break;
  }
  if (p.route === "ollama-cloud") {
    const cs = cloudScreen(p);
    p.write(cs.text);
    const typed = String(await p.ask(cs.question)).trim().toLowerCase();
    if (typed !== CLOUD_HOST) return { ok: false, declined: true, reason: `${CLOUD_HOST} was not typed; nothing was sent.` };
  }
  return { ok: true, via: "terminal" };
}

/**
 * Append one consent to the local log (mode 0600). Never read back to skip a question.
 * @param {{ project: string, route: string, model: string, digest?: string, via: string, interface?: string }} entry
 */
export function logConsent(entry, env = process.env) {
  const path = consentLogPath(env);
  mkdirSync(resolve(path, ".."), { recursive: true });
  const fresh = !existsSync(path);
  const line = { at: new Date().toISOString(), textVersion: CONSENT_TEXT_VERSION, ...entry };
  appendFileSync(path, JSON.stringify(line) + "\n", { mode: 0o600 });
  if (fresh) {
    try { chmodSync(path, 0o600); } catch { /* best effort on file systems without modes */ }
  }
  return line;
}

/** The consent log, newest last. Lines that do not parse are skipped. */
export function readConsentLog(env = process.env) {
  const path = consentLogPath(env);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8").split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

/** Validate the policy file's "ai" block: { allow: ["local"] | ["local", "ollama-cloud"] | [] }. */
export function normalizeAiPolicy(raw, label) {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label}: expected an object like { "allow": ["local"] }`);
  const extra = Object.keys(raw).filter((k) => k !== "allow");
  if (extra.length) throw new Error(`${label}: unknown field(s) ${extra.join(", ")} (expected allow)`);
  const allow = typeof raw.allow === "string" ? [raw.allow] : raw.allow;
  if (!Array.isArray(allow) || allow.some((r) => !ROUTES.includes(r))) {
    throw new Error(`${label}: "allow" must list routes from ${ROUTES.join(", ")} (an empty list turns AI mode off)`);
  }
  return { allow: [...new Set(allow)] };
}
