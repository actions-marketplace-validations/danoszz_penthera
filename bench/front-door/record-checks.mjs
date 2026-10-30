/**
 * What one E20-R2 record must not hold, read the same way by the report that seals a
 * pilot and by the watch that can stop pass 2 in flight.
 */
import { scrubMisses } from "./classify.mjs";

// The stored text fields of one record. Hashes and counts hold no quote.
export function storedText(r) {
  const e = r.evidence;
  return [
    e?.excerpt, e?.pageExcerpt?.title, e?.pageExcerpt?.text, e?.pageExcerpt?.noscript,
    ...Object.values(e?.values ?? {}), ...(e?.cookieNames ?? []),
    ...(e?.others ?? []).flatMap((o) => [o.excerpt, ...Object.values(o.values ?? {}), ...(o.cookieNames ?? [])]),
    ...[r.dns?.listed, r.dns?.final].filter(Boolean).flatMap((d) => [d.dmarcRecord, ...Object.values(d.dmarcTags ?? {}), ...(d.caaTree?.issuers ?? [])]),
    ...(e?.headerNames ?? []), ...(e?.others ?? []).flatMap((o) => o.headerNames ?? []),
    ...(r.checks ?? []).map((c) => c.evidence),
    ...(r.app?.checks ?? []).map((c) => c.evidence),
  ].filter(Boolean);
}

// SPF records list mail servers by address on purpose, so addresses don't count here.
export const spfText = (r) => [r.dns?.listed?.spfRecord, r.dns?.final?.spfRecord].filter(Boolean);

/** Every miss in one record, by kind. */
export function recordMisses(r) {
  const out = { ipv4: 0, ipv6: 0, email: 0, query: 0, fragment: 0, jwt: 0, longHex: 0, longNumber: 0 };
  for (const text of storedText(r)) for (const [k, v] of Object.entries(scrubMisses(text))) out[k] += v;
  for (const text of spfText(r)) for (const [k, v] of Object.entries(scrubMisses(text))) if (k !== "ipv4" && k !== "ipv6") out[k] += v;
  return out;
}

// A name that doesn't exist is a finding. A resolver that didn't answer says nothing about the site.
const NO_NAME = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);
const QUERIES = Object.freeze(["txt", "dmarc", "mx", "ns", "caa"]);

/** The site's address lookup failed, or any of its five DNS queries did. */
export const resolverFailed = (r) => (r.error === "not_found" && r.netCode !== undefined && !NO_NAME.has(r.netCode))
  || QUERIES.some((q) => r.dns?.listed?.outcomes?.[q]?.startsWith("resolver-failure"));

export const MAX_RESOLVER_FAILURES = 0.2;
