import { safeFetch, readBody } from "../../src/utils/http.js";
import { extractScripts } from "../retirejs.js";
import { findSecretsInText, maskMatch } from "../whitebox/secrets.js";

export const MAX_SCRIPTS = 10;
export const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * The origins whose scripts this scan may read: the target's own, and the
 * page's final origin after a redirect when that is the same host on https,
 * or the same host with or without "www.". A redirect to any other host is
 * never followed for scripts: the scan stays on the site the user named.
 */
function allowedOrigins(target, finalUrl) {
  const from = new URL(target);
  const origins = new Set([from.origin]);
  let to;
  try {
    to = new URL(finalUrl);
  } catch {
    return origins;
  }
  const bare = (h) => h.replace(/^www\./, "");
  if (bare(to.hostname) === bare(from.hostname) && (to.protocol === from.protocol || to.protocol === "https:")) origins.add(to.origin);
  return origins;
}

// A Google API key (AIza...) next to Firebase config is most likely a Firebase
// web key: public by design, limited by App Check and security rules. The same
// shape is also a Gemini key, which is a real secret, so it is still reported,
// at low and with what to check.
const GOOGLE_KEY = "Google API key (Gemini / Firebase / Maps)";
const FIREBASE_CONFIG = /authDomain|firebaseapp\.com|projectId|storageBucket|messagingSenderId/;
const nearFirebaseConfig = (js, index) => FIREBASE_CONFIG.test(js.slice(Math.max(0, index - 400), index + 400));

/**
 * @param {string} target - base URL of the scan
 * @param {object} [opts] - { timeout, maxScripts, maxBytes, fetchUrl }; fetchUrl is injected in tests
 * @returns {Promise<object[]>} findings
 */
export async function probeBundleSecrets(target, opts = {}) {
  const { timeout = 8_000, maxScripts = MAX_SCRIPTS, maxBytes = MAX_SCRIPT_BYTES, fetchUrl = safeFetch } = opts;
  const page = await fetchUrl(target, { timeout, probe: "bundle-scan", redirect: "follow" });
  if (!page?.ok) return [];
  const finalUrl = page.url || target;
  const allowed = allowedOrigins(target, finalUrl);

  let html;
  try {
    html = await readBody(page, { maxBytes });
  } catch {
    return [];
  }

  // Resolve against the page as served, deduplicate, and keep only scripts
  // from the target's own origin (or its https/www twin after a redirect).
  const scripts = [...new Set(extractScripts(html, originOf(finalUrl) || new URL(target).origin).external)].filter((u) => allowed.has(originOf(u)));
  const findings = [];

  for (const url of scripts.slice(0, maxScripts)) {
    // Scripts are not followed through redirects: a 3xx fails the fetch and is skipped.
    const res = await fetchUrl(url, { timeout, probe: "bundle-scan" });
    if (!res?.ok) continue;

    let js;
    try {
      js = await readBody(res, { maxBytes });
    } catch {
      continue;
    }

    // One finding per rule per script, like the repo scan does per file. Only
    // provider-shaped rules: minified code is full of key = "value" assignments.
    const seen = new Set();
    for (const hit of findSecretsInText(js, { shapesOnly: true })) {
      if (seen.has(hit.name)) continue;
      seen.add(hit.name);
      const firebase = hit.name === GOOGLE_KEY && nearFirebaseConfig(js, hit.index);
      findings.push(firebase ? {
        severity: "low",
        title: "Likely Firebase web key in client bundle",
        description: `\`${url}\` holds a Google API key next to Firebase config: \`${maskMatch(hit.match)}\`. Firebase web keys are public by design. Check that App Check, Firebase security rules and the key's API restrictions limit what it can do, and that it is not a Gemini key.`,
        url,
        category: "secrets",
        source: "bundle-scan",
      } : {
        severity: hit.severity,
        title: `${hit.name} in client bundle`,
        description: `Possible secret in \`${url}\`: \`${maskMatch(hit.match)}\`. Anything in a browser bundle is public. Rotate the key and call the provider from your server, not from a NEXT_PUBLIC_ or VITE_ variable.`,
        url,
        category: "secrets",
        source: "bundle-scan",
      });
    }
  }

  return findings;
}
