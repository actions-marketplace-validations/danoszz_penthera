#!/usr/bin/env node
/**
 * Build a rule pack's pack.json: hash every rule file in the directory and
 * write the index. Run it after editing any rule file, then sign the result
 * with scripts/rules/sign-pack.sh (maintainer only).
 *
 *   node scripts/rules/build-pack.mjs <dir> [--name n] [--version x.y.z]
 *        [--min-penthera x.y.z] [--description "..."] [--created-at ISO]
 *
 * Existing pack.json values are kept unless overridden. created_at only moves
 * when a rule file changed, so rebuilding an unchanged pack is a no-op. A
 * pack.json.sig left over from before a change is deleted: it no longer
 * matches, and a stale signature is worse than none.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    version: { type: "string" },
    "min-penthera": { type: "string" },
    description: { type: "string" },
    "created-at": { type: "string" },
  },
});
if (positionals.length !== 1) {
  console.error("usage: node scripts/rules/build-pack.mjs <pack-dir> [--name n] [--version x.y.z] [--min-penthera x.y.z] [--description text] [--created-at ISO]");
  process.exit(2);
}

const dir = resolve(positionals[0]);
const manifestPath = join(dir, "pack.json");
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf-8")) : {};
const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf-8"));

const rules = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && f !== "pack.json")
  .sort()
  .map((file) => {
    const buf = readFileSync(join(dir, file));
    let kind;
    try { kind = JSON.parse(buf.toString("utf-8")).kind; } catch (e) { console.error(`${file}: invalid JSON (${e.message})`); process.exit(1); }
    return { file, kind, sha256: createHash("sha256").update(buf).digest("hex") };
  });
if (rules.length === 0) { console.error(`No rule files (*.json) in ${dir}`); process.exit(1); }

const changed = JSON.stringify(old.rules || []) !== JSON.stringify(rules);
const manifest = {
  schema: 1,
  name: opts.name || old.name || basename(dir),
  version: opts.version || old.version || "1.0.0",
  created_at: opts["created-at"] || (!changed && old.created_at) || new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  min_penthera: opts["min-penthera"] || old.min_penthera || pkg.version,
  ...(opts.description || old.description ? { description: opts.description || old.description } : {}),
  rules,
};
const out = JSON.stringify(manifest, null, 2) + "\n";
const before = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : null;
writeFileSync(manifestPath, out);

// Validate the result with the same code that loads packs.
const { verifyPack } = await import("../../lib/rules/pack.js");
const sigPath = join(dir, "pack.json.sig");
if (before !== out && existsSync(sigPath)) {
  unlinkSync(sigPath);
  console.log("Removed pack.json.sig: pack.json changed, so the old signature no longer applies. Re-sign it.");
}
const v = verifyPack(dir);
if (!v.ok) {
  console.error(`pack.json written, but the pack does not verify:\n  ${v.errors.join("\n  ")}`);
  process.exit(1);
}
for (const w of v.warnings) console.log(`warning: ${w}`);
console.log(`${before === out ? "Unchanged" : "Wrote"} ${manifestPath}: ${manifest.name}@${manifest.version}, ${v.count} rule(s) in ${rules.length} file(s). Signature: ${v.signature}.`);
if (v.signature !== "valid") console.log("Next: sign it with scripts/rules/sign-pack.sh before release.");
