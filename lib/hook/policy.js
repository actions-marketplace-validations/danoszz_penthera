/**
 * The `hook` section of penthera.policy.json: what `penthera hook run` checks
 * and what blocks a commit.
 *
 *   "hook": {
 *     "blockOn": "high",                 // lowest severity that blocks: critical | high | medium | low
 *     "checks": { "secrets": true, "agents": true, "deps": true, "licenses": true },
 *     "ignore": ["tests/fixtures/**"]    // staged paths the hook skips (globs)
 *   }
 */
export const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const CHECKS = ["secrets", "agents", "deps", "licenses"];

export const DEFAULT_HOOK_POLICY = Object.freeze({
  blockOn: "high",
  checks: Object.freeze(Object.fromEntries(CHECKS.map((c) => [c, true]))),
  ignore: Object.freeze([]),
});

export function normalizeHookPolicy(raw, label = "hook") {
  if (raw == null) return { ...DEFAULT_HOOK_POLICY, checks: { ...DEFAULT_HOOK_POLICY.checks }, ignore: [] };
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label}: expected an object`);
  const extra = Object.keys(raw).filter((k) => !["blockOn", "checks", "ignore"].includes(k));
  if (extra.length) throw new Error(`${label}: unknown field(s) ${extra.join(", ")} (expected blockOn, checks, ignore)`);
  const blockOn = raw.blockOn ?? "high";
  if (!SEVERITIES.slice(0, 4).includes(blockOn)) throw new Error(`${label}: "blockOn" must be one of critical, high, medium, low`);
  const checks = { ...DEFAULT_HOOK_POLICY.checks };
  if (raw.checks != null) {
    if (typeof raw.checks !== "object" || Array.isArray(raw.checks)) throw new Error(`${label}: "checks" must be an object`);
    for (const [k, v] of Object.entries(raw.checks)) {
      if (!CHECKS.includes(k)) throw new Error(`${label}: unknown check "${k}" (known: ${CHECKS.join(", ")})`);
      if (typeof v !== "boolean") throw new Error(`${label}: checks.${k} must be true or false`);
      checks[k] = v;
    }
  }
  const ignore = raw.ignore ?? [];
  if (!Array.isArray(ignore) || ignore.some((x) => typeof x !== "string" || !x.trim())) throw new Error(`${label}: "ignore" must be an array of path globs`);
  return { blockOn, checks, ignore: ignore.map((x) => x.trim()) };
}

/** Git-style path glob: `**` crosses folders, `*` and `?` stay inside one; a bare name matches at any depth. */
export function globToRegExp(glob) {
  let g = glob.replace(/^\.\//, "");
  if (!g.includes("/")) g = `**/${g}`;
  if (g.endsWith("/")) g += "**";
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*" && g[i + 1] === "*") {
      i++;
      if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function isAtLeast(severity, threshold) {
  const s = SEVERITIES.indexOf(severity);
  return s !== -1 && s <= SEVERITIES.indexOf(threshold);
}
