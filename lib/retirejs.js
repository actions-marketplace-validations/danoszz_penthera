/**
 * Retire.js Integration, Client-Side JS Library Vulnerability Detection
 *
 * Fetches the Retire.js vulnerability database (open JSON, maintained by
 * the Retire.js community on GitHub) and checks discovered JS files.
 *
 * Detection cascade (same 4-layer approach as Retire.js itself):
 *   1. Filename/URL pattern matching (jquery-3.5.1.min.js)
 *   2. File content pattern matching (/*! jQuery v3.5.1 *​/)
 *   3. Hash matching for minified files (sha1)
 *   4. URI path matching (/3.5.1/jquery.min.js)
 *
 * Database source, in order:
 *   1. live upstream (two mirrors), unless the scan runs with --offline;
 *   2. the snapshot vendored in lib/data/, refreshed at release time by
 *      scripts/refresh-retire-db.mjs (source URL, date and SHA-256 recorded
 *      next to it). Used under --offline and whenever the live fetch fails.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { safeFetch, currentEgress } from "../src/utils/http.js";

// Upstream RetireJS repository. This previously pointed at a personal fork that
// now 404s, which made every scan silently report "no vulnerable libraries".
// A vulnerability database that fails closed and quietly is worse than none.
const DB_URLS = [
  "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository.json",
  "https://cdn.jsdelivr.net/gh/RetireJS/retire.js@master/repository/jsrepository.json",
];
const DB_CACHE_MS = 3600_000; // 1 hour
const SNAPSHOT_URL = new URL("./data/retire-jsrepository.json.gz", import.meta.url);
const SNAPSHOT_META_URL = new URL("./data/retire-jsrepository.meta.json", import.meta.url);

let cachedLive = null;
let cachedAt = 0;
let cachedSnapshot = null;

// ── Database loading ─────────────────────────────────────────────────────

/** The vendored database, or null if the files are missing or corrupt. */
export function loadSnapshot() {
  if (cachedSnapshot) return cachedSnapshot;
  try {
    const db = JSON.parse(gunzipSync(readFileSync(SNAPSHOT_URL)).toString("utf-8"));
    const meta = JSON.parse(readFileSync(SNAPSHOT_META_URL, "utf-8"));
    cachedSnapshot = { db, source: "snapshot", fetchedAt: meta.fetchedAt, sha256: meta.sha256 };
    return cachedSnapshot;
  } catch {
    return null;
  }
}

async function loadLive() {
  if (cachedLive && Date.now() - cachedAt < DB_CACHE_MS) return cachedLive;

  // Try each mirror in turn so one host being down doesn't disable the check.
  for (const url of DB_URLS) {
    // probe: false, a failed mirror is not an inconclusive probe: the
    // vendored snapshot takes over.
    const res = await safeFetch(url, { timeout: 15_000, probe: false, redirect: "follow" });
    if (!res || !res.ok) continue;
    try {
      const db = await res.json();
      if (db && typeof db === "object" && Object.keys(db).length > 0) {
        cachedLive = { db, source: "live", url };
        cachedAt = Date.now();
        return cachedLive;
      }
    } catch {
      // Malformed response from this mirror; try the next.
    }
  }
  return null;
}

/**
 * Load the database: live unless offline, the vendored snapshot otherwise or
 * as fallback. Returns `{ db, source, ... }` or null.
 */
export async function loadDb(opts = {}) {
  const offline = opts.offline ?? currentEgress()?.offline ?? false;
  if (!offline) {
    const live = await loadLive();
    if (live) return live;
  }
  return loadSnapshot();
}

// ── Version comparison ───────────────────────────────────────────────────

function parseVersion(v) {
  return String(v).split(/[.\-]/).map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });
}

function isBelow(detected, threshold) {
  const a = parseVersion(detected);
  const b = parseVersion(threshold);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    if (va < vb) return true;
    if (va > vb) return false;
  }
  return false;
}

function isAtOrAbove(detected, threshold) {
  return !isBelow(detected, threshold);
}

function isVulnerable(version, vuln) {
  if (vuln.below && !isBelow(version, vuln.below)) return false;
  if (vuln.atOrAbove && !isAtOrAbove(version, vuln.atOrAbove)) return false;
  return true;
}

// ── Extractor engine ─────────────────────────────────────────────────────

const VERSION_PLACEHOLDER = /§§version§§/g;

function extractVersion(text, patterns) {
  if (!patterns || !Array.isArray(patterns)) return null;
  for (const pattern of patterns) {
    const regexStr = pattern.replace(VERSION_PLACEHOLDER, "([\\d][\\d.a-z\\-]+)");
    try {
      const match = text.match(new RegExp(regexStr, "i"));
      if (match && match[1]) return match[1];
    } catch {
      // Invalid regex in DB entry, skip
    }
  }
  return null;
}

// ── Script discovery ─────────────────────────────────────────────────────

/**
 * Extract <script src="..."> URLs and inline script blocks from HTML.
 *
 * A small tokenizer rather than regexes: the HTML comes from the scanned
 * target, so tag names match case-insensitively, attributes may use either
 * quote or none, and a closing tag may carry whitespace or junk before its `>`
 * (`</script >`, `</SCRIPT foo>`), as browsers accept. This only reads; it
 * never rewrites or "sanitises" HTML.
 */
export function extractScripts(html, baseUrl) {
  const scripts = { external: [], inline: [] };
  const lower = String(html ?? "").toLowerCase();
  const src0 = String(html ?? "");
  let pos = 0;
  while ((pos = lower.indexOf("<script", pos)) !== -1) {
    const after = lower[pos + 7];
    // `<scripts>` or `<script-x>` is a different tag.
    if (after !== undefined && after !== ">" && after !== "/" && !/\s/.test(after)) { pos += 7; continue; }
    const { attrs, end } = readTag(src0, pos + 7);
    if (end === -1) break;
    const src = attrs.src;
    if (src) {
      let url = src;
      if (url.startsWith("//")) url = "https:" + url;
      else if (url.startsWith("/")) url = baseUrl + url;
      else if (!url.startsWith("http")) url = baseUrl + "/" + url;
      scripts.external.push(url);
    }
    const close = findScriptClose(lower, end);
    const body = src0.slice(end, close.start);
    if (body.trim().length > 10) scripts.inline.push(body);
    pos = close.end;
  }
  return scripts;
}

/** Read attributes from just after `<script` to the tag's `>`. */
function readTag(s, i) {
  const attrs = Object.create(null);
  const n = s.length;
  while (i < n) {
    while (i < n && (/\s/.test(s[i]) || s[i] === "/")) i++;
    if (i >= n) return { attrs, end: -1 };
    if (s[i] === ">") return { attrs, end: i + 1 };
    let name = "";
    while (i < n && !/[\s=>/]/.test(s[i])) name += s[i++];
    while (i < n && /\s/.test(s[i])) i++;
    let value = "";
    if (s[i] === "=") {
      i++;
      while (i < n && /\s/.test(s[i])) i++;
      const q = s[i];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, i + 1);
        if (close === -1) return { attrs, end: -1 };
        value = s.slice(i + 1, close);
        i = close + 1;
      } else {
        while (i < n && !/[\s>]/.test(s[i])) value += s[i++];
      }
    }
    name = name.toLowerCase();
    if (name && !(name in attrs)) attrs[name] = value;
  }
  return { attrs, end: -1 };
}

/** Find `</script ...>` (any case, anything up to `>`); unclosed runs to EOF. */
function findScriptClose(lower, from) {
  let i = from;
  while ((i = lower.indexOf("</script", i)) !== -1) {
    const c = lower[i + 8];
    if (c === undefined || c === ">" || c === "/" || /\s/.test(c)) {
      const gt = lower.indexOf(">", i + 8);
      return { start: i, end: gt === -1 ? lower.length : gt + 1 };
    }
    i += 8;
  }
  return { start: lower.length, end: lower.length };
}

// ── Main scanner ─────────────────────────────────────────────────────────

/**
 * Scan a target for vulnerable JavaScript libraries.
 *
 * @param {string} baseUrl - Target base URL
 * @param {object} opts - { onPhase, timeout, maxScripts }
 * @returns {{ libraries: object[], findings: object[] }}
 */
export async function scanJsLibraries(baseUrl, opts = {}) {
  const progress = opts.onPhase || (() => {});
  const maxScripts = opts.maxScripts || 20;
  const timeout = opts.timeout || 8_000;
  const result = { libraries: [], findings: [] };

  // Load Retire.js database
  progress("Loading Retire.js vulnerability database...");
  const loaded = await loadDb({ offline: opts.offline });
  if (!loaded) {
    // Never return a silent "no vulnerable libraries" when the check could not
    // run. Say so, and tell the caller the probe did not really execute.
    result.dbLoaded = false;
    result.findings.push({
      severity: "info",
      title: "JS dependency check did not run",
      description: "Could not load the Retire.js vulnerability database (every mirror unreachable and the vendored snapshot missing). Known-CVE checks on client-side JavaScript were skipped for this scan; this is not a clean result.",
      url: baseUrl,
      category: "config",
      source: "retirejs",
      confidence: "confirmed",
    });
    return result;
  }
  result.dbLoaded = true;
  result.dbSource = loaded.source;
  if (loaded.source === "snapshot") result.dbSnapshotDate = loaded.fetchedAt;
  const db = loaded.db;

  // Fetch the target page HTML
  const res = await safeFetch(baseUrl, { timeout, probe: "retirejs", redirect: "follow" });
  if (!res || !res.ok) return result;
  const html = await res.text().catch(() => "");

  // Extract script URLs and inline scripts
  const scripts = extractScripts(html, baseUrl);

  // Check each library in the DB
  for (const [libName, libData] of Object.entries(db)) {
    if (!libData.extractors) continue;
    let detectedVersion = null;

    // 1. Check against inline script content + HTML
    if (libData.extractors.filecontent) {
      detectedVersion = extractVersion(html, libData.extractors.filecontent);
    }

    // 2. Check against external script URLs (filename + uri patterns)
    if (!detectedVersion) {
      for (const scriptUrl of scripts.external) {
        if (libData.extractors.filename) {
          const filename = scriptUrl.split("/").pop().split("?")[0];
          detectedVersion = extractVersion(filename, libData.extractors.filename);
          if (detectedVersion) break;
        }
        if (libData.extractors.uri) {
          detectedVersion = extractVersion(scriptUrl, libData.extractors.uri);
          if (detectedVersion) break;
        }
      }
    }

    // 3. If found in URL but no version, try fetching the file content
    if (!detectedVersion && libData.extractors.filecontent) {
      for (const scriptUrl of scripts.external.slice(0, maxScripts)) {
        // Only fetch if URL looks like it could be this library
        const lower = scriptUrl.toLowerCase();
        if (!lower.includes(libName.toLowerCase().replace(/\./g, ""))) continue;

        const jsRes = await safeFetch(scriptUrl, { timeout: 5_000, probe: "retirejs", redirect: "follow" });
        if (!jsRes || !jsRes.ok) continue;
        const jsContent = await jsRes.text().catch(() => "");
        if (jsContent.length > 0) {
          detectedVersion = extractVersion(jsContent, libData.extractors.filecontent);
          if (detectedVersion) break;
        }
      }
    }

    if (!detectedVersion) continue;

    // Record the detected library
    const lib = { name: libName, version: detectedVersion, vulnerabilities: [] };

    // Check against known vulnerabilities
    for (const vuln of libData.vulnerabilities || []) {
      if (isVulnerable(detectedVersion, vuln)) {
        const cves = vuln.identifiers?.CVE || [];
        const severity = vuln.severity || "medium";
        lib.vulnerabilities.push({
          severity,
          below: vuln.below,
          cves,
          info: vuln.info || [],
        });

        result.findings.push({
          severity,
          title: `Vulnerable JS library: ${libName} ${detectedVersion}`,
          description: cves.length > 0
            ? `${cves.join(", ")}, upgrade to ${vuln.below || "latest"}`
            : `Known vulnerability, upgrade to ${vuln.below || "latest"}`,
          url: baseUrl,
          category: "js-vulnerability",
          source: "retirejs",
        });
      }
    }

    result.libraries.push(lib);
  }

  return result;
}
