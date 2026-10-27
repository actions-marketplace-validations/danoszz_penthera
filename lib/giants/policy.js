/**
 * The `giants` key of penthera.policy.json: which other tools a repository
 * requires, allows or forbids, and whether their findings gate the exit code.
 *
 *   "giants": {
 *     "require": ["gitleaks"],         a scan fails (exit 2) if one of these did not run
 *     "only": ["gitleaks", "trivy"],   run no other tool
 *     "deny": ["trufflehog"],          never run these
 *     "failOn": "never",               report other tools' findings without gating (default: "default")
 *     "semgrepRules": "../semgrep-rules/javascript",
 *     "nucleiTemplates": "./nuclei-templates",
 *     "timeout": 300                   seconds per tool
 *   }
 *
 * Paths are relative to the policy file. Absent, everything keeps its default.
 */
import { TOOL_IDS } from "./tools.js";

export const FAIL_ON = ["default", "never"];

export const DEFAULT_GIANTS_POLICY = Object.freeze({ require: [], only: null, deny: [], failOn: "default", semgrepRules: null, nucleiTemplates: null, timeout: null });

/** Validate the `giants` section. Throws with a readable message. */
export function normalizeGiantsPolicy(raw, label = "giants") {
  if (raw == null) return { ...DEFAULT_GIANTS_POLICY };
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label}: expected an object`);
  const known = ["require", "only", "deny", "failOn", "semgrepRules", "nucleiTemplates", "timeout"];
  const extra = Object.keys(raw).filter((k) => !known.includes(k));
  if (extra.length) throw new Error(`${label}: unknown field(s) ${extra.join(", ")} (expected ${known.join(", ")})`);
  const tools = (field) => {
    const v = raw[field];
    if (v == null) return field === "only" ? null : [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`${label}: "${field}" must be an array of tool names`);
    const bad = v.filter((x) => !TOOL_IDS.includes(x));
    if (bad.length) throw new Error(`${label}: unknown tool in "${field}": ${bad.join(", ")}. Known: ${TOOL_IDS.join(", ")}`);
    return [...new Set(v)];
  };
  const out = { require: tools("require"), only: tools("only"), deny: tools("deny") };
  const clash = out.require.filter((t) => out.deny.includes(t) || (out.only && !out.only.includes(t)));
  if (clash.length) throw new Error(`${label}: ${clash.join(", ")} is required but also denied or left out of "only"`);
  out.failOn = raw.failOn ?? "default";
  if (!FAIL_ON.includes(out.failOn)) throw new Error(`${label}: "failOn" must be one of ${FAIL_ON.join(", ")}`);
  for (const f of ["semgrepRules", "nucleiTemplates"]) {
    if (raw[f] != null && (typeof raw[f] !== "string" || !raw[f].trim())) throw new Error(`${label}: "${f}" must be a path`);
    out[f] = raw[f] ?? null;
  }
  if (raw.timeout != null && !(Number.isInteger(raw.timeout) && raw.timeout > 0 && raw.timeout <= 86_400)) {
    throw new Error(`${label}: "timeout" must be a whole number of seconds between 1 and 86400`);
  }
  out.timeout = raw.timeout ?? null;
  return out;
}
