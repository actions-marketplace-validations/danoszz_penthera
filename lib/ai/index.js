/**
 * AI mode, stages 2 to 4 (docs/ai-mode.md): build units, let the local model
 * propose, verify every proposal with Penthera's rules, and describe the run.
 *
 * Consent and model choice happen before this is called (src/cli/ai.js).
 * The result keeps model-proposed findings apart from rule findings: the
 * confirmed ones are attached to the rule finding that confirmed them, the
 * unverified ones live in `ai.findings` and never reach the headline counts,
 * the grade or the exit code.
 */
import { fingerprintFinding } from "../audit-loop.js";
import { stampProvenance } from "../provenance.js";
import { modelFinding, verifyCandidates } from "../llm-audit/verify.js";
import { buildUnits } from "./units.js";
import { runHunt } from "./hunt.js";
import { CONSENT_TEXT_VERSION } from "./consent.js";

export const AI_SCHEMA = "penthera.ai/1";
const norm = (p) => String(p || "").split("\\").join("/");

/** Rule finding titles per file, so the model is told what rules already found. */
function rulesByFile(findings) {
  const out = {};
  for (const f of findings || []) {
    if (f.severity === "info") continue;
    const file = f.category === "code-pattern" ? f.file : f.category === "secrets" ? f.url : null;
    if (!file) continue;
    (out[norm(file)] ||= []).push(f.title);
  }
  return out;
}

/**
 * @param {object} p
 * @param {string} p.repoPath
 * @param {object} p.scanResult - the repo scan result (findings, attackSurface, apiRoot)
 * @param {{ name: string, digest?: string, route: string }} p.model
 * @param {{ generate: Function }} p.ollama
 * @param {{ units: number, tokens: number, timeMs: number }} p.budget
 * @param {{ via: string }} p.consent
 * @param {string|null} [p.scope]
 * @param {AbortSignal} [p.signal]
 * @param {Function} [p.onUnit]
 * @param {object} [p.scanners] - for verify, injectable in tests
 */
export async function runAiMode({ repoPath, scanResult, model, ollama, budget, consent, scope = null, signal, onUnit, scanners }) {
  const { units, skipped } = buildUnits(repoPath, scanResult, { scope });
  const hunt = await runHunt({ units, ollama, model, budget, alreadyFound: rulesByFile(scanResult.findings), signal, onUnit });
  const verified = await verifyCandidates(repoPath, hunt.candidates, { repoFindings: scanResult.findings, scanners, input: { producer: "penthera-ai" } });

  const byStatus = (s) => verified.candidates.filter((c) => c.verification.status === s);
  return {
    schema: AI_SCHEMA,
    route: model.route,
    model: { name: model.name, digest: model.digest || null },
    consent: { via: consent.via, textVersion: CONSENT_TEXT_VERSION },
    hostsContacted: ["127.0.0.1"],
    forwardedTo: model.route === "ollama-cloud" ? "ollama.com" : null,
    budget,
    spent: { units: hunt.ledger.examined, tokens: hunt.tokens.prompt + hunt.tokens.output, timeMs: hunt.durationMs },
    tokens: hunt.tokens,
    units: { ...hunt.ledger, skipped },
    stopReason: hunt.stopReason,
    partial: hunt.partial,
    promptHash: hunt.promptHash,
    promptVersion: hunt.promptVersion,
    runId: hunt.runId,
    counts: verified.counts,
    dropped: hunt.dropped,
    errors: hunt.errors,
    confirmed: byStatus("confirmed-by-rule").map(({ fingerprint, title, file, line, classLabel, verification }) => ({ fingerprint, title, file, line, classLabel, rule: verification.rule })),
    notKept: [...byStatus("location-not-found"), ...byStatus("out-of-scope")].map(({ fingerprint, title, file, line, verification }) => ({ fingerprint, title, file, line, status: verification.status, reason: verification.reason })),
    findings: stampProvenance(byStatus("unverified").map(modelFinding), new Date().toISOString()),
    // Rule findings a model also proposed: fingerprint of the rule finding → proposals.
    alsoProposed: verified.findings.filter((f) => f.alsoProposedBy).map((f) => ({ finding: fingerprintFinding(f), by: f.alsoProposedBy })),
  };
}

/** Mark the rule findings a model also proposed; leaves every other finding untouched. */
export function attachProposals(findings, ai) {
  const byKey = new Map(ai.alsoProposed.map((p) => [p.finding, p.by]));
  return findings.map((f) => {
    const by = byKey.get(fingerprintFinding(f));
    return by ? { ...f, alsoProposedBy: by } : f;
  });
}
