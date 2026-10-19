const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/** Strip trailing slash so path joins do not produce double slashes. */
export function normalizeBaseUrl(url) {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "") || "";
  return `${parsed.origin}${path}`;
}

/** Join base URL and path safely: `http://host` + `/api` → `http://host/api`. */
export function joinUrl(baseUrl, path = "/") {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function isPrivateHost(url) {
  try {
    const { hostname } = new URL(url);
    if (PRIVATE_HOSTS.has(hostname)) return true;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * True only when a redirect actually SENDS the browser to `attackerHost`, i.e.
 * the Location header resolves to that host's origin. A Location that merely
 * contains the attacker string in its path or query (e.g. an apex→www
 * canonicalization redirect that preserves the query string) is NOT an open
 * redirect, and must not be flagged as one.
 */
export function redirectsToHost(locationHeader, requestUrl, attackerHost) {
  if (!locationHeader) return false;
  try {
    const dest = new URL(locationHeader, requestUrl); // resolve relative/protocol-relative
    const host = dest.hostname.toLowerCase();
    const attacker = String(attackerHost).toLowerCase();
    return host === attacker || host.endsWith(`.${attacker}`);
  } catch {
    return false;
  }
}

// Second-level labels that act as public suffixes under country TLDs
// (example.co.uk, example.com.au). Not a full public-suffix list: a miss makes
// two sibling hosts look unrelated, which errs toward blocking, not allowing.
const SECOND_LEVEL_SUFFIXES = new Set(["ac", "co", "com", "edu", "gov", "ltd", "ne", "net", "or", "org", "plc"]);

/**
 * Registrable domain of a hostname, e.g. "app.staging.example.com" →
 * "example.com", "shop.example.co.uk" → "example.co.uk". IPs and
 * single-label hosts come back unchanged.
 */
export function registrableDomain(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const tld = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (tld.length === 2 && SECOND_LEVEL_SUFFIXES.has(second)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

/** Convert a URL into a safe filename fragment. */
export function urlToFilename(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}
