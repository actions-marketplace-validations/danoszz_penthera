#!/usr/bin/env node
/**
 * E20-R analysis: the fifteen claims of the protocol (§ 6, § 7), from the
 * private raw files of both passes and of E20. Aggregates only; no site is
 * named in the output. Under Amendment 2, --pass1 takes the run the claims are
 * decided on (pass 2) and --pass2 the run it is compared with (pass 1).
 *
 *   node bench/front-door/analyze-r.mjs --pass1 <raw.jsonl> [--pass2 <raw.jsonl>] --e20 <tranco/raw.jsonl> <yc/raw.jsonl> [--e20-excluded <hosts file>] [--industries <csv>] [--out analysis.json]
 *
 * Intervals are a cluster bootstrap over organizations, by registrable domain
 * of the final host. HTTP claims must hold on both estimands: S (every graded
 * site) and R (sites labeled `page`). Otherwise they are view-dependent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registrableDomain } from "../../src/utils/url.js";
import { seeded } from "./replicate.mjs";

export const CLAIMS_R = 15;
export const LEVEL = 1 - 0.05 / CLAIMS_R;
export const RESAMPLES = 20_000;
export const SEED = 2020;
export const SESOI = 0.10;
export const KAPPA_CHECKS = Object.freeze(["https+hsts", "csp", "framing", "nosniff", "referrer", "permissions", "spf+dmarc", "caa", "security-txt"]);
const DNS_CHECKS = new Set(["spf+dmarc", "caa", "spf", "dmarc"]);
const STRATUM_A = new Set(["cloudflare", "akamai"]);

const get = (r, id) => { const c = (r.checks || []).find((x) => x.id === id); return !c || c.weight === 0 ? undefined : Boolean(c.passed); };
/** Pass or fail for a check id, undefined when it could not run. */
export function pass(r, id) {
  if (id === "https+hsts") { const h = get(r, "https"); return h === undefined ? undefined : h && Boolean(get(r, "hsts")); }
  if (id === "spf+dmarc") { const a = get(r, "spf"), b = get(r, "dmarc"); return a === undefined || b === undefined ? undefined : a && b; }
  return get(r, id);
}
const share = (rows, id) => { let k = 0, n = 0; for (const r of rows) { const p = pass(r, id); if (p !== undefined) { n++; if (p) k++; } } return n ? k / n : NaN; };
const org = (r) => registrableDomain(r.finalHost || r.host);
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
const groups = (rows) => Object.values(rows.reduce((m, r) => ((m[org(r)] ||= []).push(r), m), {}));

/** B minus A with a cluster-bootstrap interval, resampling organizations within each cohort. */
export function clusterDiff(a, b, id, { level = LEVEL, resamples = RESAMPLES, seed = SEED } = {}) {
  // Each organization reduced to (passes, judged), so a resample is a sum.
  const tally = (rows) => groups(rows).map((g) => { let k = 0, n = 0; for (const x of g) { const p = pass(x, id); if (p !== undefined) { n++; if (p) k++; } } return [k, n]; });
  const ta = tally(a), tb = tally(b), r = seeded(seed), out = new Float64Array(resamples);
  const draw = (t) => { let k = 0, n = 0; for (let i = 0; i < t.length; i++) { const c = t[Math.floor(r() * t.length)]; k += c[0]; n += c[1]; } return k / n; };
  for (let i = 0; i < resamples; i++) out[i] = draw(tb) - draw(ta);
  const sorted = [...out].sort((x, y) => x - y), tail = (1 - level) / 2;
  return { diff: share(b, id) - share(a, id), ci: [pct(sorted, tail), pct(sorted, 1 - tail)], nA: a.length, nB: b.length };
}

/** Same rules as E20 § 6.5, with the smallest difference that matters on the interval. */
export function decide([lo, hi], sign) {
  if (sign > 0 ? lo > 0 : hi < 0) return "supported";
  if (sign > 0 ? hi < 0 : lo > 0) return "refuted";
  if (lo >= -SESOI && hi <= SESOI) return "no meaningful difference";
  return "inconclusive";
}

/** § 2: an HTTP claim needs S and R to agree. */
export function combine(s, r) {
  if (s === "supported" && r === "supported") return "supported";
  if (s === "refuted" && r === "refuted") return "refuted";
  if (s !== r && (s === "supported" || r === "supported" || s === "refuted" || r === "refuted")) return "view-dependent";
  return s;
}

/** Cohen's kappa for two paired label arrays. */
export function kappa(x, y) {
  const n = x.length;
  if (!n) return NaN;
  const labels = [...new Set([...x, ...y])];
  let agree = 0;
  for (let i = 0; i < n; i++) if (x[i] === y[i]) agree++;
  const po = agree / n;
  const pe = labels.reduce((s, l) => s + (x.filter((v) => v === l).length / n) * (y.filter((v) => v === l).length / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Bootstrap interval for a statistic of paired sites, resampling organizations. */
function bounds(pairs, stat, { level = LEVEL, resamples = 2000, seed = SEED } = {}) {
  const g = Object.values(pairs.reduce((m, p) => ((m[org(p[0])] ||= []).push(p), m), {})), r = seeded(seed), out = [];
  for (let i = 0; i < resamples; i++) { const s = []; for (let k = 0; k < g.length; k++) s.push(...g[Math.floor(r() * g.length)]); out.push(stat(s)); }
  out.sort((a, b) => a - b);
  return [pct(out, (1 - level) / 2), pct(out, 1 - (1 - level) / 2)];
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const loadAll = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const load = (f) => loadAll(f).filter((r) => r.status === "ok");
const inCohort = (rows, ...names) => rows.filter((r) => names.some((n) => r.cohorts?.[n]));
const isPage = (r) => r.evidence?.class?.label === "page";
const isRefused = (r) => ["challenge", "block"].includes(r.evidence?.class?.label);
// One definition across passes: a record from pass 2 carries pass 1's rules next to its own.
const labelForAgreement = (r) => (r.evidence?.classRegistered ?? r.evidence?.class)?.label;

/** One difference claim, on S alone for a DNS check, on S and R otherwise. */
export function diffClaim(id, label, a, b, check, sign, opts) {
  const s = clusterDiff(a, b, check, opts);
  const sDecision = decide(s.ci, sign);
  if (DNS_CHECKS.has(check)) return { id, label, check, predicted: sign > 0 ? "higher" : "lower", S: { ...s, decision: sDecision }, decision: sDecision };
  const r = clusterDiff(a.filter(isPage), b.filter(isPage), check, opts);
  const rDecision = decide(r.ci, sign);
  return { id, label, check, predicted: sign > 0 ? "higher" : "lower", S: { ...s, decision: sDecision }, R: { ...r, decision: rDecision }, decision: combine(sDecision, rDecision) };
}

/** The fifteen claims. `e20` maps host to the E20 record of that site. */
export function claims(p1, p2, e20, opts) {
  const T = inCohort(p1, "T1k"), Y = inCohort(p1, "YC-new"), Rc = inCohort(p1, "YC-new", "YC-25"), H = inCohort(p1, "T100k"), O = inCohort(p1, "YC-old");
  const edge = (rows, a) => rows.filter((r) => STRATUM_A.has(r.platform?.edge) === a);
  const out = [
    diffClaim("C1", "YC-new minus T1k", T, Y, "csp", -1, opts),
    diffClaim("C2", "YC-new minus T1k", T, Y, "spf+dmarc", -1, opts),
    diffClaim("C3", "YC-new minus T1k, Cloudflare and Akamai", edge(T, true), edge(Y, true), "https+hsts", -1, opts),
    diffClaim("C4", "YC-new minus T1k, other edges", edge(T, false), edge(Y, false), "https+hsts", +1, opts),
    diffClaim("C5", "T100k minus T1k", T, H, "csp", -1, opts),
    diffClaim("C6", "T100k minus T1k", T, H, "spf+dmarc", -1, opts),
    diffClaim("C7", "YC-recent minus T100k", H, Rc, "spf+dmarc", +1, opts),
    diffClaim("C8", "YC-recent minus T100k", H, Rc, "https+hsts", +1, opts),
    diffClaim("C9", "YC-recent minus T100k", H, Rc, "csp", -1, opts),
    diffClaim("C10", "YC-old minus YC-new", Y, O, "spf+dmarc", +1, opts),
    diffClaim("C11", "YC-old minus YC-new", Y, O, "csp", +1, opts),
  ];
  // C12, C13: paired on sites graded in E20 and in pass 1; E20 stored only the status.
  for (const [id, cohort] of [["C12", "T1k"], ["C13", "YC-new"]]) {
    const pairs = inCohort(p1, cohort).filter((r) => e20.has(r.host)).map((r) => [r, e20.get(r.host)]);
    const refused = ([r]) => ["challenge", "block"].includes(labelForAgreement(r));
    const stat = (s) => s.filter(refused).length / s.length - s.filter(([, e]) => e.httpStatus === 403).length / s.length;
    const ci = pairs.length ? bounds(pairs, stat, opts) : [NaN, NaN];
    out.push({ id, label: `server refusals minus E20 403s, ${cohort}`, n: pairs.length, diff: pairs.length ? stat(pairs) : NaN, ci, lower: ci[0], decision: Number.isNaN(ci[0]) ? "inconclusive" : decide(ci, +1) });
  }
  // C14, C15: agreement between the passes.
  // Amendment 1: one pass, so the agreement claims are reported as not run.
  if (!p2) return [...out, { id: "C14", label: "median kappa between passes", decision: "not run" }, { id: "C15", label: "label kappa between passes", decision: "not run" }];
  const byHost = new Map(p2.map((r) => [r.host, r]));
  const pairs = p1.filter((r) => byHost.has(r.host)).map((r) => [r, byHost.get(r.host)]);
  const checkKappas = (s) => median(KAPPA_CHECKS.map((id) => { const v = s.filter(([a, b]) => pass(a, id) !== undefined && pass(b, id) !== undefined); return kappa(v.map(([a]) => pass(a, id)), v.map(([, b]) => pass(b, id))); }).filter(Number.isFinite));
  const labelKappa = (s) => kappa(s.map(([a]) => labelForAgreement(a)), s.map(([, b]) => labelForAgreement(b)));
  const lo14 = pairs.length ? bounds(pairs, checkKappas, opts)[0] : NaN, lo15 = pairs.length ? bounds(pairs, labelKappa, opts)[0] : NaN;
  out.push({ id: "C14", label: "median kappa between passes", n: pairs.length, kappa: pairs.length ? checkKappas(pairs) : NaN, lower: lo14, threshold: 0.8, decision: lo14 >= 0.8 ? "supported" : "inconclusive" });
  out.push({ id: "C15", label: "label kappa between passes", n: pairs.length, kappa: pairs.length ? labelKappa(pairs) : NaN, lower: lo15, threshold: 0.6, decision: lo15 >= 0.6 ? "supported" : "inconclusive" });
  return out;
}

/**
 * Amendment 2: the mail and CAA claims on DNS read for the listed domain, for
 * every site whose domain exists, whether or not HTTP worked. `measure` is
 * `spf+dmarc` (the registered reading) or `spf+dmarc-full`.
 */
export function dnsClaims(records, { measure = "spf+dmarc", ...opts } = {}) {
  const rows = records.filter((r) => r.dns?.listed?.exists).map((r) => ({ ...r, checks: ["spf", "dmarc", "caa"].map((id) => ({ id, weight: r.dns.listed[id] === null ? 0 : 1, passed: id === "dmarc" && measure.endsWith("full") ? r.dns.listed[measure] : r.dns.listed[id] })) }));
  const T = inCohort(rows, "T1k"), Y = inCohort(rows, "YC-new"), H = inCohort(rows, "T100k"), Rc = inCohort(rows, "YC-new", "YC-25"), O = inCohort(rows, "YC-old");
  return [
    diffClaim("C2", "YC-new minus T1k", T, Y, "spf+dmarc", -1, opts),
    diffClaim("C6", "T100k minus T1k", T, H, "spf+dmarc", -1, opts),
    diffClaim("C7", "YC-recent minus T100k", H, Rc, "spf+dmarc", +1, opts),
    diffClaim("C10", "YC-old minus YC-new", Y, O, "spf+dmarc", +1, opts),
  ];
}

/** Amendment 2: refusal share among graded sites, with and without the status:403 rule. */
export function refusalShares(rows) {
  const n = rows.length;
  const refused = rows.filter(isRefused);
  return { n, all: n ? refused.length / n : NaN, signatureBacked: n ? refused.filter((r) => r.evidence.class.rule !== "status:403").length / n : NaN, registered: n ? rows.filter((r) => ["challenge", "block"].includes(r.evidence?.classRegistered?.label)).length / n : NaN };
}

/** § 7: C1 to C4 without the hosts E20 excluded, so the comparison with E20 is like for like. */
export function replicationAsE20(p1, droppedHosts, opts) {
  const keep = p1.filter((r) => !droppedHosts.has(r.host.replace(/^www\./, "")));
  return claims(keep, keep, new Map(), opts).filter((c) => ["C1", "C2", "C3", "C4"].includes(c.id));
}

/** § 6, secondary: each check by industry, from a private host-to-industry map. Groups of at least 20 only. */
export function industryTable(rows, industries, checks = KAPPA_CHECKS, min = 20) {
  const by = {};
  for (const r of rows) {
    const i = industries.get(String(r.host).replace(/^www\./, ""));
    if (i) (by[i] ||= []).push(r);
  }
  const out = { suppressedGroups: 0 };
  for (const [i, g] of Object.entries(by)) {
    if (g.length < min) { out.suppressedGroups++; continue; }
    out[i] = { sites: g.length, median: median(g.map((r) => r.score)), shares: Object.fromEntries(checks.map((c) => [c, share(g, c)])) };
  }
  return out;
}

/** § 6, secondary: each check by site trait, per cohort, groups of at least 20 sites. */
export function traitTable(rows, checks = KAPPA_CHECKS, min = 20) {
  const out = {};
  for (const trait of ["login", "payments", "shop", "securityPage"]) {
    const g = rows.filter((r) => r.evidence?.traits?.[trait] === true);
    if (g.length < min) { out[trait] = { sites: g.length, suppressed: true }; continue; }
    out[trait] = { sites: g.length, shares: Object.fromEntries(checks.map((c) => [c, share(g, c)])) };
  }
  return out;
}

function main(args) {
  const at = (n) => args[args.indexOf(n) + 1];
  if (!args.includes("--pass1")) { console.error("Usage: analyze-r.mjs --pass1 <raw> [--pass2 <raw>] --e20 <tranco raw> <yc raw> [--out file]"); return 2; }
  const i = args.indexOf("--e20");
  const e20 = new Map([...load(args[i + 1]), ...load(args[i + 2])].map((r) => [r.host, r]));
  const p1 = load(at("--pass1"));
  const out = { experiment: "E20-R", level: LEVEL, resamples: RESAMPLES, claims: claims(p1, args.includes("--pass2") ? load(at("--pass2")) : null, e20), traits: traitTable(p1), refusals: refusalShares(p1) };
  const all = loadAll(at("--pass1"));
  if (all.some((r) => r.dns?.listed)) out.dnsListed = { registered: dnsClaims(all), fullCoverage: dnsClaims(all, { measure: "spf+dmarc-full" }) };
  if (args.includes("--industries")) out.industries = industryTable(p1, new Map(readFileSync(at("--industries"), "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(",")).map(([h, i]) => [h, i])));
  if (args.includes("--e20-excluded")) out.replicationAsE20 = replicationAsE20(p1, new Set(readFileSync(at("--e20-excluded"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean)));
  const text = JSON.stringify(out, null, 2) + "\n";
  if (args.includes("--out")) writeFileSync(at("--out"), text); else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
