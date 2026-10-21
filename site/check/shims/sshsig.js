/**
 * Stands in for lib/rules/sshsig.js. The browser cannot verify an SSH
 * signature synchronously, so site/build.mjs verifies each bundled pack's
 * pack.json.sig with the real lib/rules/sshsig.js and records the result
 * here (SIGNATURES, keyed by the signature text). Every rule file is still
 * hash-checked against pack.json in the page, by lib/rules/pack.js itself.
 */
import { SIGNATURES } from "virtual:signatures";

export function parseAllowedSigners() {
  return [];
}

export function verifyWithSigners(_raw, sig) {
  return SIGNATURES[sig.trim()] || { ok: false, reason: "not verified when the site was built" };
}
