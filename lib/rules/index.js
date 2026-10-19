/**
 * The rule-pack registry: which packs are active in this process. Bundled
 * packs (lib/rules/<name>/) load at import; packs given with --rules are added
 * by the CLI through addRulePack. Engines read rules with rulesOf(kind).
 * Verification lives in ./pack.js; see docs/rule-packs.md.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { verifyPack, loadSigners, RULES_DIR, PACK_INPUT_CAP } from "./pack.js";

export { verifyPack, loadSigners, KINDS, NAMESPACE, RULES_DIR, BUILTIN_SIGNERS, PACK_INPUT_CAP } from "./pack.js";

// ── Registry ──────────────────────────────────────────────────────────────

const active = [];
let generation = 0;

/** Packs bundled with this release: lib/rules/<name>/pack.json. */
export function bundledPackDirs() {
  return readdirSync(RULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(RULES_DIR, d.name, "pack.json")))
    .map((d) => join(RULES_DIR, d.name))
    .sort((a, b) => (basename(a) === "core" ? -1 : basename(b) === "core" ? 1 : a.localeCompare(b)));
}

function activate(v, origin) {
  if (active.some((p) => p.name === v.name)) throw new Error(`rule pack "${v.name}" is already loaded`);
  active.push({ name: v.name, version: v.version, dir: v.dir, origin, signature: v.signature, signer: v.signer, rules: v.rules, count: v.count });
  generation++;
}

/**
 * Bundled packs ship inside the npm release, so they carry the same trust as
 * the code beside them; they are hash-checked so a partial edit or corrupted
 * install fails loudly. Their signatures are enforced at release time
 * (scripts/rules/check-bundled.mjs), not on every run.
 */
function loadBundled() {
  for (const dir of bundledPackDirs()) {
    const v = verifyPack(dir);
    if (!v.ok) throw new Error(`Bundled rule pack ${basename(dir)} failed verification, so this Penthera install is damaged (reinstall it): ${v.errors.join("; ")}`);
    activate(v, "bundled");
  }
}
loadBundled();

/**
 * Verify and activate a pack given by path (`--rules <dir>`).
 * Refuses unsigned or badly signed packs unless allowUnsigned. Hash, schema
 * and ReDoS failures are refused always.
 * @returns {{ pack: object, warnings: string[] }}
 */
export function addRulePack(dir, opts = {}) {
  const v = verifyPack(dir, { signers: opts.signers || loadSigners(opts.signersFiles), now: opts.now });
  if (!v.ok) throw new Error(`Rule pack ${dir} refused: ${v.errors.join("; ")}`);
  const warnings = [...v.warnings];
  if (v.signature !== "valid") {
    const why = v.signature === "missing" ? "it is not signed (no pack.json.sig)" : `its signature is invalid: ${v.signatureError}`;
    if (!opts.allowUnsigned) {
      throw new Error(`Rule pack ${dir} refused: ${why}. Only packs signed by a key in allowed_signers load. Pass --allow-unsigned-rules to load it anyway, if you wrote it or have reviewed every rule.`);
    }
    warnings.unshift(`LOADING AN UNTRUSTED RULE PACK: ${v.name}@${v.version} from ${v.dir}: ${why}. --allow-unsigned-rules is set, so it loads anyway. Its rules decide what this scan reports.`);
  }
  activate(v, "path");
  return { pack: active[active.length - 1], warnings };
}

/** Drop packs added by path (tests, and long-lived library callers). */
export function resetRulePacks() {
  for (let i = active.length - 1; i >= 0; i--) if (active[i].origin !== "bundled") active.splice(i, 1);
  generation++;
}

/** Active packs, for `penthera rules list` and reports. */
export function activePacks() {
  return active.map(({ rules, ...p }) => ({ ...p }));
}

/** Changes whenever packs are added or removed; engines key caches on it. */
export function rulesGeneration() {
  return generation;
}

/**
 * Compiled rules of one kind from active packs.
 * @param {string} kind
 * @param {{ pack?: string, exceptPack?: string }} [filter]
 */
export function rulesOf(kind, filter = {}) {
  const out = [];
  for (const p of active) {
    if (filter.pack && p.name !== filter.pack) continue;
    if (filter.exceptPack && p.name === filter.exceptPack) continue;
    for (const r of p.rules[kind] || []) out.push({ ...r, origin: p.origin });
  }
  return out;
}

/** Test a pack regex, capping input for packs added by path. */
export function packTest(rule, s) {
  return rule.pattern.test(rule.origin === "bundled" || s.length <= PACK_INPUT_CAP ? s : s.slice(0, PACK_INPUT_CAP));
}

/** Match a pack regex, capping input for packs added by path. */
export function packMatch(rule, s) {
  return (rule.origin === "bundled" || s.length <= PACK_INPUT_CAP ? s : s.slice(0, PACK_INPUT_CAP)).match(rule.pattern);
}
