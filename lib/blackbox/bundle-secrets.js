import { safeFetch, readBody } from "../../src/utils/http.js";
import { extractScripts } from "../retirejs.js";
import { findSecretsInText, maskMatch } from "../whitebox/secrets.js";

export const MAX_SCRIPTS = 10;
export const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * @param {string} target - base URL of the scan
 * @param {object} [opts] - { timeout, maxScripts, maxBytes, fetchUrl }; fetchUrl is injected in tests
 * @returns {Promise<object[]>} findings
 */
export async function probeBundleSecrets(target, opts = {}) {
  const { timeout = 8_000, maxScripts = MAX_SCRIPTS, maxBytes = MAX_SCRIPT_BYTES, fetchUrl = safeFetch } = opts;
  const origin = new URL(target).origin;

  const page = await fetchUrl(target, { timeout, probe: "bundle-scan", redirect: "follow" });
  if (!page?.ok) return [];

  let html;
  try {
    html = await readBody(page, { maxBytes });
  } catch {
    return [];
  }

  // Deduplicate, and keep only scripts from the target's own origin.
  const scripts = [...new Set(extractScripts(html, origin).external)].filter((u) => sameOrigin(u, origin));
  const findings = [];

  for (const url of scripts.slice(0, maxScripts)) {
    // dont follow redirects: if a url redirects(3xx) it failsand gets skipped
    const res = await fetchUrl(url, { timeout, probe: "bundle-scan" });
    if (!res?.ok) continue;

    let js;
    try {
      js = await readBody(res, { maxBytes });
    } catch {
      continue;
    }

    // One finding per rule per script, like the repo scan does per file
    const seen = new Set();
    for (const hit of findSecretsInText(js)) {
      if (seen.has(hit.name)) continue;
      seen.add(hit.name);
      findings.push({
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
