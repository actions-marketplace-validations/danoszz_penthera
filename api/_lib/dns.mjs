/**
 * Email and DNS checks for the passive report: SPF and DMARC for the
 * registrable domain, CAA for the host. Only public DNS lookups, nothing sent
 * to the site. A lookup that fails or times out is "unknown" (a weight-0
 * note), never a failure: a slow resolver says nothing about the site.
 *
 * Limit: the registrable domain comes from src/utils/url.js, which knows the
 * common two-level suffixes (co.uk, com.au, ...) but not the full Public
 * Suffix List. For hosts under a shared platform suffix (user.github.io,
 * app.vercel.app) it names the platform's domain, so SPF and DMARC answers
 * are the platform's. The evidence names the domain that was looked up.
 */
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { registrableDomain } from "../../src/utils/url.js";

const NONE = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);
const UNKNOWN = Symbol("unknown");

/** The domain whose SPF and DMARC records count for this host. */
export function mailDomain(host) {
  return registrableDomain(String(host).toLowerCase().replace(/^www\./, ""));
}

function defaultResolver(timeout) {
  const r = new Resolver({ timeout: Math.min(timeout, 2500), tries: 2 });
  return { resolveTxt: (n) => r.resolveTxt(n), resolveCaa: (n) => r.resolveCaa(n) };
}

/** Records, [] when the name has none, or UNKNOWN when DNS did not answer. */
async function ask(fn, name, timeout) {
  let timer;
  try {
    return await Promise.race([
      fn(name),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), timeout); }),
    ]);
  } catch (e) {
    return NONE.has(e?.code) ? [] : UNKNOWN;
  } finally {
    clearTimeout(timer);
  }
}

const txt = (records) => records.map((r) => (Array.isArray(r) ? r.join("") : String(r)));

const unknown = (id, what, verify) => ({
  id, category: "email", passed: false, severity: "info", weight: 0,
  title: `Could not check ${what}: DNS did not answer`,
  evidence: "The lookup failed or timed out; this says nothing about the site.",
  fix: "Nothing to fix from this result. Run the command below to see the record.",
  verify,
});

/**
 * @param {string} host  the final page's host name
 * @param {{dns?: {resolveTxt: Function, resolveCaa: Function}, dnsTimeout?: number}} opts
 * @returns {Promise<object[]>} checks
 */
export async function dnsChecks(host, { dns, dnsTimeout = 2500 } = {}) {
  host = String(host).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) return [];
  const resolver = dns || defaultResolver(dnsTimeout);
  const domain = mailDomain(host);

  // CAA is inherited: the first name with records, walking up from the host
  // to the registrable domain (never into the suffix above it), decides.
  const caaNames = [];
  for (let name = host; ; name = name.slice(name.indexOf(".") + 1)) {
    caaNames.push(name);
    if (name === domain || !name.includes(".")) break;
  }

  const [spfRaw, dmarcRaw, ...caaRaw] = await Promise.all([
    ask(resolver.resolveTxt, domain, dnsTimeout),
    ask(resolver.resolveTxt, `_dmarc.${domain}`, dnsTimeout),
    ...caaNames.map((n) => ask(resolver.resolveCaa, n, dnsTimeout)),
  ]);
  const checks = [];

  // ── SPF ──────────────────────────────────────────────────────────────
  const spfVerify = `dig +short TXT ${domain} | grep -i spf1`;
  if (spfRaw === UNKNOWN) checks.push(unknown("spf", "SPF", spfVerify));
  else {
    const spf = txt(spfRaw).filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
    const all = spf.length === 1 ? /\s([~?+-]?)all\b/i.exec(spf[0]) : null;
    const open = all && (all[1] === "+" || all[1] === "");
    // No "all" and no redirect= ends as ?all: the record then protects nothing.
    const neutral = spf.length === 1 && ((all && all[1] === "?") || (!all && !/\sredirect=/i.test(spf[0])));
    const ok = spf.length === 1 && !open && !neutral;
    checks.push({
      id: "spf", category: "email", passed: ok, weight: 3,
      severity: ok ? "info" : spf.length === 0 ? "medium" : "low",
      title: spf.length === 0 ? `No SPF record for ${domain}` : spf.length > 1 ? `${spf.length} SPF records for ${domain}; only one is allowed`
        : open ? "SPF lets any server send mail (+all)" : neutral ? "SPF does not end in -all or ~all, so it protects nothing" : `SPF set for ${domain}`,
      evidence: spf.length ? spf.map((t) => t.slice(0, 200)).join(" | ") : `No TXT record starting with v=spf1 on ${domain}`,
      fix: spf.length === 0
        ? `Publish one TXT record on ${domain} that lists the services that send your mail, such as "v=spf1 include:_spf.google.com -all". If the domain sends no mail, publish "v=spf1 -all".`
        : "Keep exactly one v=spf1 record, list only the services that send your mail, and end it with -all (or ~all while you test).",
      verify: spfVerify,
    });
  }

  // ── DMARC ────────────────────────────────────────────────────────────
  const dmarcVerify = `dig +short TXT _dmarc.${domain}`;
  if (dmarcRaw === UNKNOWN) checks.push(unknown("dmarc", "DMARC", dmarcVerify));
  else {
    const dmarc = txt(dmarcRaw).filter((t) => /^v=DMARC1\s*(;|$)/i.test(t.trim()));
    const policy = dmarc.length === 1 ? (/(?:^|;)\s*p\s*=\s*(\w+)/i.exec(dmarc[0])?.[1] || "").toLowerCase() : "";
    const ok = dmarc.length === 1 && (policy === "quarantine" || policy === "reject");
    checks.push({
      id: "dmarc", category: "email", passed: ok, weight: 4,
      severity: ok ? "info" : dmarc.length === 0 ? "medium" : "low",
      title: dmarc.length === 0 ? `No DMARC record for ${domain}` : dmarc.length > 1 ? "More than one DMARC record"
        : ok ? `DMARC policy ${policy}` : `DMARC policy is ${policy || "missing"}, so spoofed mail is still delivered`,
      evidence: dmarc.length ? dmarc.map((t) => t.slice(0, 200)).join(" | ") : `No TXT record starting with v=DMARC1 on _dmarc.${domain}`,
      fix: `Publish one TXT record on _dmarc.${domain}: start with "v=DMARC1; p=none; rua=mailto:dmarc@${domain}" to collect reports, then move to p=quarantine or p=reject once your real mail passes.`,
      verify: dmarcVerify,
    });
  }

  // ── CAA ──────────────────────────────────────────────────────────────
  const caaVerify = `dig +short CAA ${caaNames[0]}`;
  const firstAnswer = caaRaw.findIndex((r) => r === UNKNOWN || r.length > 0);
  if (firstAnswer !== -1 && caaRaw[firstAnswer] === UNKNOWN) checks.push(unknown("caa", "CAA", caaVerify));
  else {
    const found = firstAnswer === -1 ? [] : caaRaw[firstAnswer];
    const issuers = found.map((r) => r.issue ?? r.issuewild).filter((v) => v !== undefined);
    checks.push({
      id: "caa", category: "email", passed: found.length > 0, weight: 2,
      severity: found.length ? "info" : "low",
      title: found.length ? "CAA limits who may issue certificates" : "No CAA record: any certificate authority may issue for this domain",
      evidence: found.length ? `CAA on ${caaNames[firstAnswer]}: ${issuers.join(", ").slice(0, 160) || "records without issue tags"}` : `No CAA record on ${caaNames.join(", ")}`,
      fix: `Add a CAA record naming the certificate authority you use, such as ${domain} CAA 0 issue "letsencrypt.org". Most DNS hosts have a CAA record type.`,
      verify: caaVerify,
    });
  }

  return checks;
}
