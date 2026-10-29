/**
 * E17 normalization: what the runner removes from JSON before it compares two
 * runs. Protocol: docs/research/prereg/E17-offline-and-determinism.md, § 6 and
 * the deviation of 29 Oct 2026 in § 9.
 *
 * The registered pattern dropped every key whose name matched a regex. Matched
 * case-insensitively, `At` and `Ms` also hit keys such as `hasParams` and
 * `format`, which are analysis output, not run metadata. The fix is an exact
 * list of volatile key paths. The registered pattern stays here so the runner
 * can report both, as § 6 requires for any change.
 */

/** § 6 as registered on 28 Oct 2026. Reported next to the fix, not used for the verdict. */
export const REGISTERED_PATTERN = /(At|Ms|_at|_ms|time|timestamp|date|duration|elapsed|generated)$/i;

/**
 * The fix (29 Oct 2026): the exact key paths that change between two runs of
 * the same command. `[]` stands for any array index.
 * - `timestamp`, `duration`: when the scan ran and how long it took.
 * - `findings[].collected_at`: when each finding was collected.
 * - `fingerprint.headers.date`: the HTTP `Date` header the scanned server sent (C7).
 */
export const VOLATILE_PATHS = Object.freeze([
  "timestamp",
  "duration",
  "findings[].collected_at",
  "fingerprint.headers.date",
]);

export function replaceTokens(s, tokens) {
  let r = s;
  for (const [from, to] of tokens) if (from) r = r.split(from).join(to);
  return r;
}

/**
 * Sort keys, drop volatile keys, replace per-run paths with fixed tokens.
 * `mode` is "paths" (the fix, the default) or "registered" (the old regex).
 */
export function normalize(value, tokens = [], mode = "paths", path = "") {
  if (Array.isArray(value)) return value.map((v) => normalize(v, tokens, mode, `${path}[]`));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      const p = path ? `${path}.${k}` : k;
      if (mode === "registered" ? REGISTERED_PATTERN.test(k) : VOLATILE_PATHS.includes(p)) continue;
      out[k] = normalize(value[k], tokens, mode, p);
    }
    return out;
  }
  return typeof value === "string" ? replaceTokens(value, tokens) : value;
}

/** JSON paths where two normalized values differ (at most about 50). */
export function diffPaths(a, b, path = "$", out = []) {
  if (out.length > 50) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(path); return out; }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b || {})]);
    for (const k of keys) diffPaths(a[k], b?.[k], `${path}.${k}`, out);
    return out;
  }
  if (a !== b) out.push(path);
  return out;
}
