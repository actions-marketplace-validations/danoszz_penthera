/**
 * Version strings as runtimes and servers print them, and how they compare.
 *
 * An upstream version is `major.minor[.patch][letters]`: `8.3.12`, `2.4.62`,
 * `1.1.1w` (OpenSSL 1.x used letters for patch releases). Anything after it
 * (`-1ubuntu2.19`, `+deb12u1`, `-fpm-alpine`) is a suffix. On a banner a suffix
 * means a distribution build, whose security fixes are backported without the
 * upstream number changing, so the number alone cannot say whether the fix is
 * in. That case is never reported as affected; see lib/advisories/index.js.
 *
 * A pre-release (`8.4.27-dev`, `8.5.0RC1`, `3.15.0rc1`, `3.16.0a1`,
 * `4.1.0-beta2`) is not a suffix: it is a build from before that version was
 * released, so it sorts below it. `pre` holds the marker, upstream the number.
 */

const VERSION = /^(\d{1,4})(?:\.(\d{1,4})(?:\.(\d{1,6}))?)?([a-z]{1,2})?(.*)$/;
// -dev, alpha, beta, RC and pre in any case, with or without a separator; a
// bare a/b only with a number (Python's 3.16.0a1), since OpenSSL's 1.1.1a is
// a release. The number may follow a dot (Node.js's 23.0.0-rc.1).
const PRE = /^(\d{1,4}\.\d{1,4}(?:\.\d{1,6})?)[-._~]?((?:dev|alpha|beta|rc|pre)(?:\.?\d+)?|[ab]\.?\d+)(?=$|[-+~_ ])(.*)$/i;
const PRE_RANK = { dev: 0, a: 1, alpha: 1, b: 2, beta: 2, pre: 3, rc: 3 };

/**
 * Parse a version string.
 * @param {string} s
 * `20`, `v20` and `8.3` parse too, with the missing parts null.
 * @returns {{ major: number, minor: number|null, patch: number|null, letters: string,
 *   pre: string, suffix: string, upstream: string, raw: string } | null}
 */
export function parseVersion(s) {
  if (typeof s !== "string") return null;
  const t = s.trim().replace(/^v(?=\d)/, "");
  const p = PRE.exec(t);
  if (p) {
    const base = parseVersion(p[1]);
    return { ...base, pre: p[2].toLowerCase().replace(/^\./, ""), suffix: p[3], raw: s.trim() };
  }
  const m = VERSION.exec(t);
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
    pre: "",
    suffix,
    upstream: parts.join(".") + letters,
    raw: s.trim(),
  };
}

/** Kind and number of a pre-release marker: "rc1" → [3, 1], "dev" → [0, 0]. */
function preKey(pre) {
  const m = /^([a-z]+)\.?(\d*)$/.exec(pre);
  return [PRE_RANK[m[1]], Number(m[2] || 0)];
}

/**
 * Compare two parsed versions (or strings). A missing patch sorts as 0, and a
 * pre-release sorts below its release: 8.4.27-dev < 8.4.27RC1 < 8.4.27.
 */
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
  const ex = x.pre || "", ey = y.pre || "";
  if (ex !== ey) {
    if (!ex || !ey) return ex ? -1 : 1;
    const [kx, nx] = preKey(ex), [ky, ny] = preKey(ey);
    if (kx !== ky) return kx < ky ? -1 : 1;
    if (nx !== ny) return nx < ny ? -1 : 1;
  }
  return 0;
}

/** Compare branches like "8.3" and "8.10", "20" and "22", "1.1.1" and "3.0". */
export function compareBranches(a, b) {
  return compareVersions(a, b);
}
