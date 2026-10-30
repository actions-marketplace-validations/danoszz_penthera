/**
 * What one E20-R2 record must not hold, read the same way by the report that seals a
 * pilot and by the watch that can stop pass 2 in flight.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Text that came from a page: all the in-flight stop reads. A stop ends pass 2 for good,
 * so it must not fire on what a site legitimately publishes in DNS.
 */
export const pageText = (r) => [
  r.evidence?.excerpt, r.evidence?.pageExcerpt?.title, r.evidence?.pageExcerpt?.text, r.evidence?.pageExcerpt?.noscript,
  ...(r.evidence?.others ?? []).map((o) => o.excerpt),
].filter(Boolean);
export const pageTextMissed = (r) => pageText(r).some((t) => Object.values(scrubMisses(t)).some(Boolean));

// A visit's own budget allows 20 requests; more means the limit failed.
const MAX_REQUESTS_PER_SITE = 20;
// A run that barely reached anything tells nothing about its instrument. Pass 1 graded 84% of what it could.
export const MIN_GRADED_SHARE = 0.5;
// A pilot too small to see these rates can't pass them.
export const MIN_ELIGIBLE = 30;
export const MIN_GRADED = 20;

/** Amendment 2's stop rules, as counts. Any entry stops the run until it is explained. */
export function stopRules(report, { floors = true } = {}) {
  const stop = [];
  if (Object.values(report.scrubMisses).some(Boolean)) stop.push("a privacy scrub missed something");
  if ((report.outcomes["error:internal"] ?? 0) > 0) stop.push("an internal error");
  if (!report.pruned && report.evidence.twoxx && report.evidence.twoxxWithExcerpt < report.evidence.twoxx * 0.9) stop.push("under 90% of 2xx responses have an excerpt");
  const eligible = report.sites - Object.entries(report.outcomes).filter(([k]) => /^(opted_out|excluded:(robots_disallow_all|robots_disallow_path|not_a_homepage|exclusion_list))$/.test(k)).reduce((n, [, v]) => n + v, 0);
  if (report.dns.read < eligible) stop.push("a site with no DNS read");
  if (report.counters.maxRequestsPerSite > MAX_REQUESTS_PER_SITE) stop.push(`a site took more than ${MAX_REQUESTS_PER_SITE} requests`);
  if (report.excludedHops) stop.push("a request reached an excluded host");
  if (eligible && report.evidence.graded / eligible < MIN_GRADED_SHARE) stop.push("under half of the eligible sites were graded");
  if (eligible && report.resolverFailures / eligible > MAX_RESOLVER_FAILURES) stop.push("over 20% of sites hit a resolver failure");
  if (eligible && report.evidence.twoxx === 0) stop.push("no site answered with a 2xx");
  if (report.dns.read && report.dns.answered.spf / report.dns.read < 1 - MAX_RESOLVER_FAILURES) stop.push("over 20% of SPF reads got no answer");
  if (report.dns.read && report.dns.answered.dmarc / report.dns.read < 1 - MAX_RESOLVER_FAILURES) stop.push("over 20% of DMARC reads got no answer");
  if (floors && eligible === 0) stop.push("no eligible site");
  else if (floors && eligible < MIN_ELIGIBLE) stop.push(`under ${MIN_ELIGIBLE} eligible sites`);
  if (floors && eligible && report.evidence.graded < MIN_GRADED) stop.push(`under ${MIN_GRADED} graded sites`);
  return stop;
}

const hash = (b) => createHash("sha256").update(b).digest("hex");

/** The hash a seal carries over its own fields, `passed` among them. */
export const sealHash = ({ sealSha256: _own, ...fields }) => hash(JSON.stringify(fields));

/**
 * Why a run can't decide claims, or null: it needs to be a finished, whole pass with
 * nothing changed under it, and the raw file it recorded, pruned or not.
 */
export function unfinishedRun(dir) {
  const file = join(dir, "manifest.json");
  if (!existsSync(file)) return "no run manifest";
  const m = JSON.parse(readFileSync(file, "utf8"));
  if (m.kind !== "pass") return "not a pass";
  if (!m.finishedAt) return "the run did not finish";
  if (m.partial) return `the run stopped: ${m.stoppedFor}`;
  if (!m.immutableAtFinish?.ok) return "something changed while it ran";
  const raw = join(dir, "raw.jsonl");
  if (!existsSync(raw)) return "no raw file";
  const now = hash(readFileSync(raw));
  if (now === m.rawSha256) return null;
  const proofFile = join(dir, "prune-manifest.json");
  const proof = existsSync(proofFile) ? JSON.parse(readFileSync(proofFile, "utf8")) : null;
  return proof?.rawSha256Before === m.rawSha256 && proof.rawSha256After === now ? null : "the raw file is not the one the manifest hashed";
}
