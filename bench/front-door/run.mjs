#!/usr/bin/env node
/**
 * E20 runner: how safe is the web's front door?
 * Protocol: docs/research/prereg/E20-front-door.md (cohorts: tranco = E20,
 * the Tranco top 1000; yc = E20b, recent Y Combinator companies).
 *
 *   node bench/front-door/run.mjs --self-test
 *       Loopback only: starts tests/fixtures/mock-server.js and visits it.
 *   node bench/front-door/run.mjs --list <file> --loopback <port> [--cohort tranco|yc]
 *       Loopback only: every name resolves to 127.0.0.1:<port>, DNS records
 *       come from a stub. Nothing leaves the machine.
 *   node bench/front-door/run.mjs --list <file> --cohort tranco|yc --exclude <file> --registered E20
 *       The registered run. Refused unless the prereg says Registered, and the
 *       list file's and the exclusion list's SHA-256 match the hashes recorded
 *       there. Rate, concurrency and limit are fixed (§ 4): passing
 *       --concurrency, --delay or --limit is refused.
 *   node bench/front-door/run.mjs --compare <a/aggregate.json> <b/aggregate.json>
 *       The difference per check between two cohorts, offline.
 *
 * Options: --exclude <file> (the exclusion list, § 5: "<domain> <category>"
 * per line; a domain also covers its subdomains; never visited), --out <dir>
 * (default bench/front-door/results/<cohort>-<time>, git-ignored).
 * Loopback runs only: --limit N (default 1000 tranco, 400 yc), --concurrency N
 * (default 4, at most 8), --delay MS (default 1000, per worker between sites).
 *
 * Per site, through the live check's passiveReport (api/_lib/tier1.mjs) with
 * assets: false and secrets: false: GET /robots.txt (a group naming
 * Penthera-Research or Penthera-QuickCheck, or the * group, with Disallow: /
 * stops the visit),
 * GET / with at most 4 redirects, GET /.well-known/security.txt, and public
 * DNS lookups for SPF, DMARC and CAA. One visit per site, no retries, no
 * scripts or stylesheets fetched, no paths guessed, no payloads.
 *
 * Writes raw.jsonl (per site, private, never published) and aggregate.json
 * (no site names) to the output directory.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { passiveReport } from "../../api/_lib/tier1.mjs";
import { parseTarget, CheckError } from "../../api/_lib/guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG = join(ROOT, "docs", "research", "prereg", "E20-front-door.md");

// § 4 of the protocol. Changing any of these after registration is a deviation.
export const USER_AGENT = "Penthera-Research/E20 (+https://penthera.org/research/e20; opt out: robots.txt User-agent: Penthera-Research)";
export const OPT_OUT_TOKENS = ["penthera-research", "penthera-quickcheck"];
export const LIMITS = Object.freeze({
  concurrency: 4, maxConcurrency: 8,
  delayMs: 1000,
  siteBudgetMs: 8000, siteHardCapMs: 20_000,
  maxSites: 1000,
});
export const COHORTS = Object.freeze({
  tranco: { label: "Tranco list", defaultLimit: 1000 },
  yc: { label: "YC list", defaultLimit: 400 },
});
// E20b scope: the public homepage only. A host that names a logged-in app, an
// API or a payment flow is not a homepage, so it is excluded, never visited.
const NOT_A_HOMEPAGE = /^(app|apps|dashboard|console|portal|admin|login|signin|auth|account|accounts|my|api|checkout|pay|payments|billing|shop|store)\./i;
// § 5: the categories an exclusion list line may name.
export const EXCLUSION_CATEGORIES = Object.freeze(["adult", "gambling", "health", "government", "at-risk"]);
export const EXCLUSION_LABEL = "Exclusion list";
// Groups smaller than this are not reported (no group that small can stay anonymous).
export const MIN_GROUP = 20;

// ── List and registration ──────────────────────────────────────────────────

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** The hash the prereg records for a cohort (or "exclusions"), or null while it says `pending`. */
export function recordedHash(preregText, cohort) {
  const label = cohort === "exclusions" ? EXCLUSION_LABEL : COHORTS[cohort]?.label;
  if (!label) return null;
  const m = new RegExp(`\\|\\s*${label} SHA-256\\s*\\|\\s*\`([0-9a-f]{64})\``).exec(preregText);
  return m ? m[1] : null;
}

export const isRegistered = (preregText) => /^\|\s*Status\s*\|\s*\*\*Registered\./m.test(preregText);

/**
 * Throws unless this run may send anything. Loopback runs (every name pinned
 * to 127.0.0.1, DNS stubbed) always may. Anything else needs all of:
 * --registered E20, a prereg whose status is Registered, a list file whose
 * SHA-256 equals the one the prereg records for the cohort, an exclusion
 * list whose SHA-256 equals the one recorded for it, and no rate flags.
 */
export function authorize({ loopback, registered, cohort, listHash, excludeHash, rateFlags = [], preregText }) {
  if (loopback) return { mode: "loopback" };
  if (registered !== "E20") {
    throw new Error("Refused: this run would reach hosts other than loopback. It needs --registered E20, and only after Daan accepted the protocol (AGENTS.md rule 6).");
  }
  if (!COHORTS[cohort]) throw new Error(`Refused: --cohort must be one of ${Object.keys(COHORTS).join(", ")}.`);
  if (!isRegistered(preregText)) throw new Error("Refused: the prereg's status is not Registered.");
  const recorded = recordedHash(preregText, cohort);
  if (!recorded) throw new Error(`Refused: the prereg records no ${COHORTS[cohort].label} SHA-256 yet.`);
  if (recorded !== listHash) throw new Error(`Refused: the list file's SHA-256 (${listHash}) does not match the one in the prereg (${recorded}).`);
  const recordedEx = recordedHash(preregText, "exclusions");
  if (!recordedEx) throw new Error(`Refused: the prereg records no ${EXCLUSION_LABEL} SHA-256 yet.`);
  if (!excludeHash) throw new Error("Refused: a registered run needs --exclude <the exclusion list>.");
  if (recordedEx !== excludeHash) throw new Error(`Refused: the exclusion list's SHA-256 (${excludeHash}) does not match the one in the prereg (${recordedEx}).`);
  if (rateFlags.length) throw new Error(`Refused: ${rateFlags.join(", ")} cannot be set on a registered run; rate, concurrency and limit are fixed by the prereg (§ 4).`);
  return { mode: "registered" };
}

/** A hostname from a list cell: "Example.com", "https://www.example.com/about" → example.com, www.example.com. */
export function hostOf(cell) {
  const raw = String(cell || "").trim();
  if (!raw) return "";
  try {
    return new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

/**
 * Rows of a CSV list. Tranco's file has no header ("rank,domain"); the YC
 * file has one with at least "batch" and "domain" (or "website").
 * Each row: { rank, host, group }. group is the TLD (tranco) or the batch (yc).
 */
export function readList(text, cohort) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = lines[0].split(",").map((c) => c.trim().toLowerCase());
  const header = !/^\d+$/.test(first[0]);
  const col = (names, fallback) => { const i = header ? first.findIndex((c) => names.includes(c)) : -1; return i === -1 ? fallback : i; };
  const hostCol = col(["domain", "website", "url"], 1);
  const batchCol = col(["batch"], -1);
  const rows = [];
  const seen = new Set();
  for (const [i, line] of (header ? lines.slice(1) : lines).entries()) {
    const cells = line.split(",").map((c) => c.trim());
    const host = hostOf(cells[hostCol]);
    if (!host || seen.has(host)) continue;   // one visit per site
    seen.add(host);
    const rank = !header && /^\d+$/.test(cells[0]) ? Number(cells[0]) : i + 1;
    const group = cohort === "yc" ? (batchCol >= 0 ? cells[batchCol] || "unknown" : "unknown") : host.split(".").pop();
    rows.push({ rank, host, group });
  }
  return rows;
}

/**
 * The exclusion list (§ 5): one "<domain> <category>" per line, # comments.
 * Returns Map(domain → category). Throws on an unknown category or a bad
 * domain, so a typo cannot silently let a site through.
 */
export function readExclusions(text) {
  const out = new Map();
  for (const [i, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [cell, category, ...rest] = line.split(/\s+/);
    const host = /^[a-z0-9.-]+$/i.test(cell) ? cell.toLowerCase().replace(/^\.+|\.$/g, "") : "";
    if (!host || rest.length) throw new Error(`exclusion list line ${i + 1}: expected "<domain> <category>", got "${raw.trim()}"`);
    if (!EXCLUSION_CATEGORIES.includes(category)) throw new Error(`exclusion list line ${i + 1}: category must be one of ${EXCLUSION_CATEGORIES.join(", ")}, got "${category ?? ""}"`);
    out.set(host, category);
  }
  return out;
}

/** The category that excludes a host: the host itself or any parent domain is listed ("gov" covers every .gov host). */
export function exclusionFor(host, exclusions) {
  const labels = String(host).toLowerCase().split(".");
  for (let i = 0; i < labels.length; i++) {
    const c = exclusions.get(labels.slice(i).join("."));
    if (c) return c;
  }
  return null;
}

// ── One visit ──────────────────────────────────────────────────────────────

const loopbackLookup = async () => [{ address: "127.0.0.1", family: 4 }];
const enodata = () => Promise.reject(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
const STUB_DNS = { resolveTxt: enodata, resolveCaa: enodata };

/** What a raw record keeps of a check: no fix text, evidence capped. */
const slim = (c) => ({ id: c.id, passed: c.passed, severity: c.severity, weight: c.weight, evidence: String(c.evidence || "").slice(0, 300) });

/**
 * One site, one visit. Loopback: http://<host>:<port>/ with the name pinned
 * to 127.0.0.1. Registered: https://<host>/ (the passive report falls back to
 * http when https does not connect); when the name does not resolve, one try
 * at www.<host>.
 */
export async function visit(row, { loopbackPort, now } = {}) {
  const base = {
    userAgent: USER_AGENT, optOutTokens: OPT_OUT_TOKENS, optOutAll: true, assets: false, secrets: false,
    budgetMs: LIMITS.siteBudgetMs, now,
  };
  const opts = loopbackPort
    ? { ...base, lookup: loopbackLookup, allowPrivate: true, anyPort: true, dns: STUB_DNS }
    : base;
  const at = new Date().toISOString();
  if (NOT_A_HOMEPAGE.test(row.host)) return { ...row, at, status: "excluded", reason: "not_a_homepage" };

  const attempt = (host) => {
    const typed = loopbackPort ? `http://${host}:${loopbackPort}/` : host;
    return passiveReport(parseTarget(typed, { anyPort: Boolean(loopbackPort) }), { ...opts, typed });
  };
  const capped = (p) => {
    let timer;
    return Promise.race([p, new Promise((_, reject) => { timer = setTimeout(() => reject(new CheckError("timeout", "Hard cap", 504, "")), LIMITS.siteHardCapMs); })])
      .finally(() => clearTimeout(timer));
  };
  try {
    let report;
    try {
      report = await capped(attempt(row.host));
    } catch (e) {
      if (loopbackPort || !(e instanceof CheckError) || e.code !== "not_found" || row.host.startsWith("www.")) throw e;
      report = await capped(attempt(`www.${row.host}`));
    }
    return {
      ...row, at, status: "ok",
      finalHost: new URL(report.url).hostname, httpStatus: report.status, redirects: report.redirects.length,
      score: report.score, checks: report.checks.map(slim),
    };
  } catch (e) {
    // § 5, decided 29 Oct: a `*` group with Disallow: / is an opt-out for E20, counted as excluded.
    if (e instanceof CheckError && e.code === "opted_out" && e.all) return { ...row, at, status: "excluded", reason: "robots_disallow_all" };
    if (e instanceof CheckError && e.code === "opted_out") return { ...row, at, status: "opted_out" };
    return { ...row, at, status: "error", error: e instanceof CheckError ? e.code : "internal" };
  }
}

// ── Aggregates ─────────────────────────────────────────────────────────────

/** 95% Wilson score interval for k of n. */
export function wilson(k, n, z = 1.959964) {
  if (!n) return { p: null, lo: null, hi: null };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

// § 2: the checks the hypotheses name, plus derived ones.
const DERIVED = {
  "https+hsts": (byId) => (byId.https && byId.https.weight > 0 ? byId.https.passed && Boolean(byId.hsts?.passed) : undefined),
  "spf+dmarc": (byId) => (byId.spf?.weight > 0 && byId.dmarc?.weight > 0 ? byId.spf.passed && byId.dmarc.passed : undefined),
};

function prevalence(records) {
  const tally = {};
  for (const r of records) {
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    const outcomes = Object.entries(byId)
      // weight 0 is "could not check" (DNS did not answer, security.txt timed out): unknown, not a fail.
      .map(([id, c]) => [id, c.weight > 0 ? c.passed : undefined]);
    for (const [id, fn] of Object.entries(DERIVED)) outcomes.push([id, fn(byId)]);
    for (const [id, passed] of outcomes) {
      const t = (tally[id] ||= { n: 0, passed: 0, unknown: 0 });
      if (passed === undefined) t.unknown++;
      else { t.n++; if (passed) t.passed++; }
    }
  }
  return Object.fromEntries(Object.entries(tally).sort(([a], [b]) => a.localeCompare(b)).map(([id, t]) => {
    const w = wilson(t.passed, t.n);
    return [id, { ...t, share: w.p, ci95: [w.lo, w.hi] }];
  }));
}

/** The aggregate: counts, per-check prevalence, the score distribution, groups. No site names. */
export function aggregate(records, meta = {}) {
  const ok = records.filter((r) => r.status === "ok");
  const status = {};
  for (const r of records.filter((x) => x.status !== "ok")) {
    const key = r.status === "error" ? `error:${r.error}` : r.status === "excluded" ? `excluded:${r.reason}` : r.status;
    status[key] = (status[key] || 0) + 1;
  }
  const scores = ok.map((r) => r.score).sort((a, b) => a - b);
  const histogram = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, sites: 0 }));
  for (const s of scores) histogram[Math.min(9, Math.floor(s / 10))].sites++;
  const exclusionCategories = {};
  for (const r of records.filter((x) => x.reason === "exclusion_list")) exclusionCategories[r.category || "unknown"] = (exclusionCategories[r.category || "unknown"] || 0) + 1;
  const groups = {};
  for (const r of ok) (groups[r.group] ||= []).push(r);
  const byGroup = Object.fromEntries(Object.entries(groups)
    .filter(([, rs]) => rs.length >= MIN_GROUP)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, rs]) => [g, { sites: rs.length, medianScore: quantile(rs.map((r) => r.score).sort((a, b) => a - b), 0.5), checks: prevalence(rs) }]));
  return {
    experiment: "E20", ...meta,
    sites: { listed: records.length, visited: ok.length, ...status },
    exclusionCategories,
    checks: prevalence(ok),
    score: {
      n: scores.length,
      mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      min: scores[0] ?? null, p10: quantile(scores, 0.1), p25: quantile(scores, 0.25), median: quantile(scores, 0.5),
      p75: quantile(scores, 0.75), p90: quantile(scores, 0.9), max: scores.at(-1) ?? null,
      histogram,
    },
    byGroup,
    groupsSuppressed: Object.values(groups).filter((rs) => rs.length < MIN_GROUP).length,
  };
}

/** Newcombe's hybrid score interval (method 10) for the difference p1 − p2. */
export function newcombe(k1, n1, k2, n2) {
  const a = wilson(k1, n1), b = wilson(k2, n2);
  if (a.p === null || b.p === null) return { diff: null, ci95: [null, null] };
  const diff = a.p - b.p;
  return {
    diff,
    ci95: [diff - Math.sqrt((a.p - a.lo) ** 2 + (b.hi - b.p) ** 2), diff + Math.sqrt((a.hi - a.p) ** 2 + (b.p - b.lo) ** 2)],
  };
}

/** Per check present in both aggregates: share in each and the difference (a − b). */
export function compare(a, b) {
  const out = {};
  for (const id of Object.keys(a.checks).filter((k) => b.checks[k])) {
    const x = a.checks[id], y = b.checks[id];
    out[id] = { a: x.share, b: y.share, ...newcombe(x.passed, x.n, y.passed, y.n) };
  }
  return { a: a.cohort, b: b.cohort, checks: out };
}

// ── The run ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Visits every row, `concurrency` at a time, each worker waiting `delayMs`
 * between sites (both fixed to § 4 unless on loopback). `exclude` is the
 * exclusion list (readExclusions); a listed host is never visited. Appends each record to raw.jsonl as it lands, then writes
 * aggregate.json. Returns { records, aggregate }.
 */
export async function runStudy(rows, { cohort, out, loopbackPort, concurrency = LIMITS.concurrency, delayMs = LIMITS.delayMs, exclude = new Map(), meta = {}, onRecord } = {}) {
  // § 4, decided 29 Oct: a run that leaves loopback uses the registered rate, whatever was passed.
  if (!loopbackPort) { concurrency = LIMITS.concurrency; delayMs = LIMITS.delayMs; }
  concurrency = Math.max(1, Math.min(LIMITS.maxConcurrency, Math.floor(concurrency)));
  delayMs = Math.max(0, Math.floor(delayMs));
  mkdirSync(out, { recursive: true });
  // Belt and braces: the raw results never enter git, wherever --out points.
  writeFileSync(join(out, ".gitignore"), "*\n");
  const raw = join(out, "raw.jsonl");
  writeFileSync(raw, "");
  const records = new Array(rows.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (next < rows.length) {
      const k = next++;
      const row = rows[k];
      const category = exclusionFor(row.host, exclude);
      records[k] = category
        ? { ...row, at: new Date().toISOString(), status: "excluded", reason: "exclusion_list", category }
        : await visit(row, { loopbackPort });
      appendFileSync(raw, JSON.stringify({ cohort, ...records[k] }) + "\n");
      onRecord?.(records[k], k);
      if (next < rows.length && delayMs) await sleep(delayMs);
    }
  }));
  const agg = aggregate(records, { cohort, ...meta, concurrency, delayMs, userAgent: USER_AGENT });
  writeFileSync(join(out, "aggregate.json"), JSON.stringify(agg, null, 2) + "\n");
  return { records, aggregate: agg };
}

/**
 * Loopback self-test: four names, all pinned to the mock server on
 * 127.0.0.1 (one is an app. host, one is on the exclusion list). Checks that each site got exactly /robots.txt, / and
 * /.well-known/security.txt, once each, and that aggregates came out.
 */
export async function selfTest({ out } = {}) {
  const { startMockServer } = await import(pathToFileURL(join(ROOT, "tests", "fixtures", "mock-server.js")).href);
  const mock = await startMockServer(0);
  try {
    const rows = readList("1,site-1.e20-selftest.example.com\n2,site-2.e20-selftest.example.com\n3,app.e20-selftest.example.com\n2,site-2.e20-selftest.example.com\n4,ministry.e20-selftest.gov\n", "tranco");
    const exclude = readExclusions("# self-test\ngov government\n");
    const dir = out || join(ROOT, "bench", "front-door", "results", `selftest-${Date.now()}`);
    const { records, aggregate: agg } = await runStudy(rows, { cohort: "tranco", out: dir, loopbackPort: mock.port, delayMs: 0, exclude, meta: { selfTest: true } });
    const paths = mock.requests.map((r) => `${r.method} ${r.url}`).sort();
    const expected = ["GET /", "GET /", "GET /.well-known/security.txt", "GET /.well-known/security.txt", "GET /robots.txt", "GET /robots.txt"];
    const problems = [];
    if (rows.length !== 4) problems.push(`expected 4 unique rows, got ${rows.length}`);
    if (JSON.stringify(paths) !== JSON.stringify(expected)) problems.push(`unexpected requests: ${paths.join(", ")}`);
    if (records.filter((r) => r.status === "ok").length !== 2) problems.push("expected 2 visited sites");
    if (records.find((r) => r.host.startsWith("app."))?.status !== "excluded") problems.push("app. host was not excluded");
    if (records.find((r) => r.host.endsWith(".gov"))?.category !== "government" || agg.exclusionCategories.government !== 1) problems.push("exclusion-list host was not excluded");
    if (agg.sites.visited !== 2 || !agg.checks.https) problems.push("aggregate is incomplete");
    if (JSON.stringify(agg).includes("e20-selftest")) problems.push("aggregate names a site");
    return { ok: problems.length === 0, problems, requests: paths, out: dir, aggregate: agg };
  } finally {
    await mock.close();
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

async function main(args) {
  if (args.includes("--self-test")) {
    const r = await selfTest({ out: flag(args, "--out") });
    console.log(r.ok ? `E20 self-test passed: ${r.requests.length} requests, all to 127.0.0.1 (${r.out})` : `E20 self-test FAILED:\n  ${r.problems.join("\n  ")}`);
    return r.ok ? 0 : 1;
  }
  if (args.includes("--compare")) {
    const i = args.indexOf("--compare");
    const [a, b] = [args[i + 1], args[i + 2]].map((f) => JSON.parse(readFileSync(f, "utf8")));
    console.log(JSON.stringify(compare(a, b), null, 2));
    return 0;
  }
  const listFile = flag(args, "--list");
  if (!listFile) {
    console.error("Usage: node bench/front-door/run.mjs --self-test | --list <file> (--loopback <port> | --cohort tranco|yc --registered E20)");
    return 2;
  }
  const cohort = flag(args, "--cohort") || "tranco";
  if (!COHORTS[cohort]) { console.error(`--cohort must be one of ${Object.keys(COHORTS).join(", ")}`); return 2; }
  const loopbackPort = flag(args, "--loopback") ? Number(flag(args, "--loopback")) : undefined;
  if (loopbackPort !== undefined && !(loopbackPort > 0 && loopbackPort < 65536)) { console.error("--loopback needs a port"); return 2; }
  const bytes = readFileSync(listFile);
  const listHash = sha256(bytes);
  const excludeBytes = flag(args, "--exclude") ? readFileSync(flag(args, "--exclude")) : null;
  const excludeHash = excludeBytes ? sha256(excludeBytes) : undefined;
  const rateFlags = ["--concurrency", "--delay", "--limit"].filter((f) => args.includes(f));
  let exclude;
  try {
    authorize({ loopback: Boolean(loopbackPort), registered: flag(args, "--registered"), cohort, listHash, excludeHash, rateFlags, preregText: existsSync(PREREG) ? readFileSync(PREREG, "utf8") : "" });
    exclude = excludeBytes ? readExclusions(excludeBytes.toString("utf8")) : new Map();
  } catch (e) {
    console.error(e.message);
    return 3;
  }
  const limit = Math.min(LIMITS.maxSites, Number((loopbackPort && flag(args, "--limit")) || COHORTS[cohort].defaultLimit));
  const rows = readList(bytes.toString("utf8"), cohort).slice(0, limit);
  const out = resolve(flag(args, "--out") || join(ROOT, "bench", "front-door", "results", `${cohort}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  const { aggregate: agg } = await runStudy(rows, {
    cohort, out, loopbackPort, exclude,
    concurrency: Number(flag(args, "--concurrency") || LIMITS.concurrency),
    delayMs: Number(flag(args, "--delay") ?? LIMITS.delayMs),
    meta: { listSha256: listHash, exclusionSha256: excludeHash ?? null, loopback: Boolean(loopbackPort), startedFrom: process.version },
    onRecord: (r, k) => process.stderr.write(`\r${k + 1}/${rows.length} ${r.status.padEnd(9)}`),
  });
  process.stderr.write("\n");
  console.log(`E20 ${cohort}: ${agg.sites.visited} of ${agg.sites.listed} visited. Raw (private): ${join(out, "raw.jsonl")}. Aggregate: ${join(out, "aggregate.json")}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
