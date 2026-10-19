/**
 * `penthera.policy.json`: what an install may bring in without a human.
 *
 *   {
 *     "allow": ["@acme/*", "esbuild", "sharp@0.33.5"],
 *     "deny": ["ai-cli-invoke", "token-harvest"],
 *     "requireApproval": ["install-scripts", "obfuscated", "typosquat"]
 *   }
 *
 * `deny` and `requireApproval` list capability ids from lib/deps/capabilities.js,
 * plus two of the firewall's own: `typosquat` (a new name close to a popular
 * package) and `unscanned` (a new package whose files could not be read).
 * `allow` lists package names or globs (`*` matches any run of characters),
 * optionally pinned to one version with `@x.y.z`; an allowed package passes
 * both lists. A field left out keeps its default; a field given replaces it.
 * Everything here is pure: no files are read except the policy itself.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPABILITY_ORDER, CAPABILITIES } from "../deps/capabilities.js";

export const POLICY_FILE = "penthera.policy.json";

export const RULE_IDS = [...CAPABILITY_ORDER, "typosquat", "unscanned"];

export const RULE_LABELS = {
  ...Object.fromEntries(CAPABILITY_ORDER.map((id) => [id, CAPABILITIES[id].label])),
  typosquat: "looks like a popular package",
  unscanned: "could not be scanned",
};

export const DEFAULT_POLICY = Object.freeze({
  allow: [],
  deny: [],
  requireApproval: ["install-scripts", "ai-config-write", "ai-cli-invoke", "token-harvest", "obfuscated", "typosquat", "unscanned"],
});

/**
 * Validate and complete a policy object. Throws with a readable message on
 * unknown fields, unknown rule ids, or non-string entries.
 */
export function normalizePolicy(raw, label = POLICY_FILE) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label}: expected a JSON object`);
  const known = ["allow", "deny", "requireApproval", "$schema", "description"];
  const extra = Object.keys(raw).filter((k) => !known.includes(k));
  if (extra.length) throw new Error(`${label}: unknown field(s) ${extra.join(", ")} (expected allow, deny, requireApproval)`);
  const out = {};
  for (const field of ["allow", "deny", "requireApproval"]) {
    const v = raw[field] ?? DEFAULT_POLICY[field];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x.trim())) {
      throw new Error(`${label}: "${field}" must be an array of non-empty strings`);
    }
    out[field] = [...new Set(v.map((x) => x.trim()))];
  }
  for (const field of ["deny", "requireApproval"]) {
    const bad = out[field].filter((id) => !RULE_IDS.includes(id));
    if (bad.length) throw new Error(`${label}: unknown capability in "${field}": ${bad.join(", ")}. Known: ${RULE_IDS.join(", ")}`);
  }
  return out;
}

/**
 * Load the policy: an explicit path, else penthera.policy.json in the project,
 * else the defaults. Returns { policy, path } (path null for defaults).
 */
export function loadPolicy(root, explicitPath = null) {
  const path = explicitPath || join(root, POLICY_FILE);
  if (!existsSync(path)) {
    if (explicitPath) throw new Error(`Policy file not found: ${explicitPath}`);
    return { policy: normalizePolicy({}), path: null };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(`${path}: ${e.message}`);
  }
  return { policy: normalizePolicy(raw, path), path };
}

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Split "name@1.2.3" / "@scope/name@1.2.3" into { name, version }. */
function splitEntry(entry) {
  const at = entry.lastIndexOf("@");
  if (at > 0) return { name: entry.slice(0, at), version: entry.slice(at + 1) };
  return { name: entry, version: null };
}

/** The first allow entry matching name@version, or null. */
export function matchAllow(allow, name, version) {
  for (const entry of allow) {
    const e = splitEntry(entry);
    const re = new RegExp(`^${e.name.split("*").map(escapeRe).join(".*")}$`);
    if (!re.test(name)) continue;
    if (e.version && e.version !== "*" && e.version !== version) continue;
    return entry;
  }
  return null;
}

/**
 * Apply the policy to the changes an install would make.
 * @param {{ name, version, flags: string[] }[]} changes flags: the rule ids this change raises
 * @returns {{ items: object[], denied: object[], needsApproval: object[], clean: boolean }}
 */
export function evaluatePolicy(changes, policy) {
  const items = changes.map((c) => {
    const allowedBy = matchAllow(policy.allow, c.name, c.version);
    const deny = allowedBy ? [] : c.flags.filter((id) => policy.deny.includes(id));
    const approval = allowedBy ? [] : c.flags.filter((id) => policy.requireApproval.includes(id) && !deny.includes(id));
    return { ...c, allowedBy, deny, approval };
  });
  const denied = items.filter((i) => i.deny.length);
  const needsApproval = items.filter((i) => i.approval.length);
  return { items, denied, needsApproval, clean: denied.length === 0 && needsApproval.length === 0 };
}
