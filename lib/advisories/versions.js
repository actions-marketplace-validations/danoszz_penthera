/**
 * Version strings as runtimes and servers print them, and how they compare.
 *
 * An upstream version is `major.minor[.patch][letters]`: `8.3.12`, `2.4.62`,
 * `1.1.1w` (OpenSSL 1.x used letters for patch releases). Anything after it
 * (`-1ubuntu2.19`, `+deb12u1`, `-fpm-alpine`) is a suffix. On a banner a suffix
 * means a distribution build, whose security fixes are backported without the
 * upstream number changing, so the number alone cannot say whether the fix is
 * in. That case is never reported as affected; see lib/advisories/index.js.
 */

const VERSION = /^(\d{1,4})(?:\.(\d{1,4})(?:\.(\d{1,6}))?)?([a-z]{1,2})?(.*)$/;

/**
 * Parse a version string.
 * @param {string} s
 * `20`, `v20` and `8.3` parse too, with the missing parts null.
 * @returns {{ major: number, minor: number|null, patch: number|null, letters: string,
 *   suffix: string, upstream: string, raw: string } | null}
 */
export function parseVersion(s) {
  if (typeof s !== "string") return null;
  const m = VERSION.exec(s.trim().replace(/^v(?=\d)/, ""));
  if (!m) return null;
  const [, major, minor, patch, letters = "", suffix = ""] = m;
  // "8.3.12abc" is not a version; letters only follow a full x.y.z.
  if (letters && patch === undefined) return null;
  // A suffix starts with a separator: "20-alpine", "8.1.2-1ubuntu2", not "8x".
  if (suffix && !/^[-+~_ ]/.test(suffix)) return null;
  const parts = [major, minor, patch].filter((x) => x !== undefined).map(Number);
  return {
    major: Number(major),
    minor: minor === undefined ? null : Number(minor),
    patch: patch === undefined ? null : Number(patch),
    letters,
    suffix,
    upstream: parts.join(".") + letters,
    raw: s.trim(),
  };
}

/** Compare two parsed versions (or strings). A missing patch sorts as 0. */
export function compareVersions(a, b) {
  const x = typeof a === "string" ? parseVersion(a) : a;
  const y = typeof b === "string" ? parseVersion(b) : b;
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  if (x.major !== y.major) return x.major < y.major ? -1 : 1;
  const mx = x.minor ?? 0;
  const my = y.minor ?? 0;
  if (mx !== my) return mx < my ? -1 : 1;
  const px = x.patch ?? 0;
  const py = y.patch ?? 0;
  if (px !== py) return px < py ? -1 : 1;
  if (x.letters !== y.letters) {
    // OpenSSL: 1.1.1 < 1.1.1a < 1.1.1z < 1.1.1za
    if (x.letters.length !== y.letters.length) return x.letters.length < y.letters.length ? -1 : 1;
    return x.letters < y.letters ? -1 : 1;
  }
  return 0;
}

/** Compare branches like "8.3" and "8.10", "20" and "22", "1.1.1" and "3.0". */
export function compareBranches(a, b) {
  return compareVersions(a, b);
}
