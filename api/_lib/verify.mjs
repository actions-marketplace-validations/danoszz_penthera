/**
 * Proof of ownership for the verified scan, with nothing stored. The token
 * for a host is an HMAC of its name under a server secret, so penthera.org
 * can recompute it on every request instead of remembering it. The owner
 * places it in a DNS TXT record or in /.well-known/penthera.txt; the scan
 * runs only when one of them holds it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveTxt as dnsResolveTxt } from "node:dns/promises";
import { CheckError, fetchPinned } from "./guard.mjs";

const PREFIX = "penthera-verify=";

/** The host name a token is bound to: lowercase, no brackets, no trailing dot. */
export const hostOf = (target) => target.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();

function secretOf(opts) {
  const secret = opts.secret ?? process.env.PENTHERA_VERIFY_SECRET;
  if (!secret) {
    throw new CheckError("not_available", "The verified scan is not set up on this server.", 501, "Run npx penthera <url> on your own machine for the full scan.");
  }
  return secret;
}

/** "penthera-verify=" and 32 base64url characters (192 bits) of HMAC-SHA256(secret, host). */
export function tokenForHost(host, secret) {
  return PREFIX + createHmac("sha256", secret).update(host).digest("base64url").slice(0, 32);
}

/** The token and where to put it. */
export function tokenFor(target, opts = {}) {
  const host = hostOf(target);
  const token = tokenForHost(host, secretOf(opts));
  return {
    host,
    token,
    dns: { name: `_penthera.${host}`, type: "TXT", value: token },
    file: { url: `https://${host}/.well-known/penthera.txt`, contents: token },
    expiresNote: "The token does not expire and only works for this host name. Penthera stores nothing: it recomputes the token when you ask for a scan. Remove it when you are done.",
  };
}

/** Constant-time comparison; a different length is a mismatch. */
function same(candidate, token) {
  const a = Buffer.from(String(candidate).trim());
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms).unref?.())]);

async function inDns(host, token, resolveTxt) {
  for (const name of [`_penthera.${host}`, host]) {
    try {
      const records = await withTimeout(resolveTxt(name), 4000);
      // A TXT record arrives in chunks of up to 255 bytes; join them.
      if (records.some((chunks) => same([].concat(chunks).join(""), token))) return name;
    } catch { /* no record, or the resolver failed: try the next place */ }
  }
  return null;
}

async function inFile(target, pin, token, opts) {
  // HTTPS only, so a network attacker cannot answer for the owner. Tests
  // serve http on a random port and pass verifyOverHttp.
  const url = opts.verifyOverHttp
    ? new URL("/.well-known/penthera.txt", target.origin)
    : new URL(`https://${pin.host}/.well-known/penthera.txt`);
  try {
    const res = await fetchPinned(url, pin, { timeout: 5000, maxBytes: 1024, anyPort: opts.anyPort });
    if (res.status !== 200) return null;
    return res.body.split(/\r?\n/).some((line) => same(line, token)) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Throws not_verified (403) unless the token is in DNS or in the file.
 * @param {URL} target
 * @param {{host: string, address: string, family: number}} pin
 * @param {{secret?: string, resolveTxt?: Function, verifyOverHttp?: boolean, anyPort?: boolean}} opts
 * @returns {Promise<{method: "dns"|"file", where: string, requests: number}>}
 */
export async function verifyOwner(target, pin, opts = {}) {
  const host = hostOf(target);
  const token = tokenForHost(host, secretOf(opts));
  const where = await inDns(host, token, opts.resolveTxt ?? dnsResolveTxt);
  if (where) return { method: "dns", where, requests: 0 };
  const file = await inFile(target, pin, token, opts);
  if (file) return { method: "file", where: file, requests: 1 };
  throw new CheckError("not_verified", `Penthera could not confirm that you control ${host}.`, 403,
    `Add a TXT record at _penthera.${host} with the value ${token}, or serve that value at https://${host}/.well-known/penthera.txt. Then run the scan again. DNS changes can take a few minutes to show.`);
}
