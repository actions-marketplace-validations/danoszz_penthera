#!/usr/bin/env node
/**
 * Release gate: every rule pack bundled in lib/rules/ must verify and carry a
 * valid signature from a key in lib/rules/allowed_signers. Runs in the publish
 * workflow before `npm stage publish`, so a rule change cannot ship without
 * passing through the maintainer's signing key.
 *
 *   node scripts/rules/check-bundled.mjs        (npm run rules:check)
 */
import { basename } from "node:path";
import { verifyPack, bundledPackDirs } from "../../lib/rules/index.js";

let bad = 0;
for (const dir of bundledPackDirs()) {
  const v = verifyPack(dir);
  const name = `${basename(dir)}${v.version ? `@${v.version}` : ""}`;
  if (!v.ok) {
    console.error(`FAIL ${name}: ${v.errors.join("; ")}`);
    bad++;
  } else if (v.signature !== "valid") {
    console.error(`FAIL ${name}: ${v.signature === "missing" ? "not signed" : `signature invalid (${v.signatureError})`}. Sign it: scripts/rules/sign-pack.sh lib/rules/${basename(dir)}`);
    bad++;
  } else {
    console.log(`ok   ${name}: ${v.count} rules, signed by ${v.signer}`);
  }
}
if (bad) {
  console.error(`\n${bad} bundled rule pack(s) not ready to release. See docs/rule-packs.md ("Signing a release").`);
  process.exit(1);
}
