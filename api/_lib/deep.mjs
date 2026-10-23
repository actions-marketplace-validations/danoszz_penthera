/**
 * The owner-verified scan. After verify.mjs confirms the owner placed the
 * token, it sends the payload-free part of `npx penthera <url>`'s default
 * scan: GET requests to fixed paths that should not be public (dotenv files,
 * .git, keys, debug pages, API docs, directory listings), read with the same
 * matchers as the CLI. Nothing else: no POST, no login attempt, no crafted
 * headers or origins, no injection strings, no other host. Redirects are not
 * followed, exactly as the CLI's templates do not follow them.
 *
 * The paths and matchers are copied from the CLI (lib/templates.js,
 * src/scan-url.js phase 6, lib/blackbox/openapi.js), not imported: those
 * modules load the rule-pack registry from disk at import, which a serverless
 * bundle does not reliably carry. tests/live-check-deep.test.js fails if a
 * path here is missing from those files or a copied template drifts.
 *
 * Where this differs from the CLI, on purpose: the phase 6 "body names a
 * secret" rule skips HTML pages (a single-page app's index.html is not a
 * leak); phpinfo.php and server-status are known by their own page text; an
 * API docs path needs docs text even at /docs; a spec must parse as one; and
 * the .env.local regex uses the m flag, since the CLI's inline (?m) is not
 * valid JavaScript and never matches.
 *
 * The report holds the passive report's checks (tier1.mjs) plus these, scored
 * together. Budget: the passive report's own 20 requests, the verification
 * file and at most 39 probes, so 60 at most; probes run 4 at a time, start
 * only within 25 seconds of the request, and time out after 5 seconds each.
 * Left out on purpose: the source map guess (the passive report follows the
 * page's own source map references), Firebase rules files and openapi.yaml
 * (the CLI reads specs as JSON only), to stay inside the budget.
 */
import { resolvePublic, fetchPinned } from "./guard.mjs";
import { CATEGORIES } from "./grade.mjs";
import { passiveReport } from "./tier1.mjs";
import { tokenFor, verifyOwner, hostOf } from "./verify.mjs";

export { tokenFor };

export const BUDGET = { requests: 60, passive: 20, probes: 39, concurrency: 4, totalMs: 25_000, requestMs: 5_000, bodyBytes: 32_768, specBytes: 262_144 };

const DEEP_CATEGORIES = {
  exposure: "Exposed files",
  debug: "Debug and internal pages",
  api: "API surface",
};

// ── Matchers, as in lib/templates.js runMatcher (status, word, regex, negatives) ──
const HTML = ["<html", "<!DOCTYPE", "<script"];
const SENSITIVE_RE = /private_key|SECRET|PASSWORD|API_KEY|FIREBASE_|STRIPE_|DATABASE_URL|client_email|\[core\]|\[remote/i;

function matches(m, res) {
  const body = res.body;
  switch (m.type) {
    case "status": return m.status.includes(res.status);
    case "word": return m.condition === "and" ? m.words.every((w) => body.includes(w)) : m.words.some((w) => body.includes(w));
    case "regex": return m.regex.some((p) => new RegExp(p, m.flags || "").test(body));
    case "negative-word": return m.words.every((w) => !body.includes(w));
    default: return false;
  }
}
const all = (...ms) => (res) => ms.every((m) => matches(m, res));
const ok200 = { type: "status", status: [200] };
// src/scan-url.js phase 6: a 200 whose body names a secret. Unlike the CLI,
// an HTML page does not count: a single-page app answers every path with its
// index.html, whose scripts often say "API_KEY", and that is not a leak.
const isHtml = (body) => /^\s*(<!--[\s\S]*?-->\s*)*<(!doctype html|html)/i.test(body);
const sensitiveFile = (res) => res.status === 200 && !isHtml(res.body) && SENSITIVE_RE.test(res.body);
// phpinfo() and mod_status are HTML pages, so they are known by their own text.
const phpinfoPage = (res) => res.status === 200 && /<title>[^<]{0,80}phpinfo\(\)[^<]{0,80}<\/title>/i.test(res.body);
const serverStatusPage = (res) => res.status === 200 && /Apache Server Status for|Server uptime:|Total accesses:/i.test(res.body);

// Directory listings, lib/templates.js LISTING_SIGNATURES and LISTING_PATHS.
const LISTING_SIGNATURES = [
  "<title>\\s{0,10}(?:Index of|listing directory|Directory listing for) /",
  "\\[To Parent Directory\\]",
];
export const LISTING_PATHS = ["/uploads/", "/files/", "/backup/", "/backups/", "/logs/", "/download/", "/downloads/"];
const listing = all(ok200, { type: "regex", regex: LISTING_SIGNATURES, flags: "i" });

/**
 * CLI templates copied as is; `cli` names the template in lib/templates.js
 * (or lib/rules/core/templates.json) whose first request this is.
 */
export const TEMPLATES = {
  "/.env": { cli: "env-file-exposure", matchers: [ok200, { type: "word", words: ["DB_", "API_KEY", "SECRET", "PASSWORD", "FIREBASE_", "STRIPE_"], condition: "or" }] },
  // The CLI writes this regex with an inline (?m), which JavaScript rejects, so
  // there it never matches; here the multiline flag is passed instead.
  "/.env.local": { cli: "env-local-exposure", matchers: [ok200, { type: "regex", regex: ["^[A-Z][A-Z0-9_]{2,}="], flags: "m" }, { type: "negative-word", words: HTML }] },
  "/.git/config": { cli: "git-config-exposure", matchers: [ok200, { type: "word", words: ["[core]", "[remote"], condition: "or" }] },
  "/.git/HEAD": { cli: "git-head-exposure", matchers: [ok200, { type: "word", words: ["ref: refs/"] }] },
  "/serviceAccountKey.json": { cli: "service-account-key-exposure", matchers: [ok200, { type: "word", words: ["private_key", "client_email"], condition: "and" }] },
  "/.json": { cli: "firebase-database-open-read", matchers: [ok200, { type: "regex", regex: ["^\\s*[\\{\\[]"] }, { type: "negative-word", words: ["Permission denied", "error", "<html", "<!DOCTYPE"] }] },
  "/api/__nextjs_original-stack-frame": { cli: "nextjs-debug-endpoint", matchers: [{ type: "status", status: [200, 400] }] },
  "/metrics": { cli: "prometheus-metrics-exposed", matchers: [ok200,
    { type: "regex", regex: ["^# HELP [a-zA-Z_:]"], flags: "m" },
    { type: "regex", regex: ["^# TYPE [a-zA-Z_:][a-zA-Z0-9_:]* (?:counter|gauge|histogram|summary|untyped|gaugehistogram|info|stateset)\\b"], flags: "m" },
    { type: "negative-word", words: ["<html", "<!DOCTYPE"] }] },
  "/api/": { cli: "directory-listing", matchers: [ok200, { type: "word", words: ["Index of", "Directory listing", "<pre>"], condition: "or" }] },
};
const STACK_TRACE = { type: "regex", regex: [
  "\\bat (?:[\\w$.<>\\[\\] ]{1,200} \\()?(?:/|[A-Za-z]:\\\\|file://)[^\\s()<>\"]{1,250}:\\d{1,6}:\\d{1,6}",
  "Traceback \\(most recent call last\\):",
  "\\bat [a-zA-Z_$][\\w$.]{0,250}\\([\\w$]{1,100}\\.java:\\d{1,6}\\)",
  "Stack trace:\\s{0,20}(?:<br\\s?/?>\\s{0,20})?#0 ",
  "\\bat [\\w.`<>]{1,250}\\([^)\\n]{0,250}\\) in [^\\n<]{1,250}:line \\d{1,6}",
] };
const tpl = (path) => all(...TEMPLATES[path].matchers);

// OpenAPI discovery, lib/blackbox/openapi.js SPEC_CANDIDATES and DOC_CANDIDATES.
export const SPEC_PATHS = ["/openapi.json", "/swagger.json", "/api/openapi.json"];
export const DOC_PATHS = ["/docs", "/redoc", "/swagger", "/api/docs"];

function parseSpec(res) {
  if (res.status !== 200 || res.truncated) return null;
  try {
    const spec = JSON.parse(res.body);
    // A JSON catch-all ({} for every path) is not a spec.
    return spec && typeof spec === "object" && (spec.openapi || spec.swagger || spec.paths) ? spec : null;
  } catch {
    return null;
  }
}

/**
 * What the scan checks. Each group is one graded check; any matching path
 * fails it. Severities and descriptions follow the CLI's findings.
 */
const GROUPS = [
  { id: "env-files", category: "exposure", severity: "critical", weight: 10,
    found: "Environment file with secrets is public", clean: "No environment files exposed",
    probes: [["/.env", tpl("/.env")], ["/.env.local", tpl("/.env.local")], ["/.env.production", sensitiveFile]],
    fix: "Remove .env files from the web root and from the deploy output, then rotate every key they held: assume they are copied. Block dotfiles at the server (nginx: location ~ /\\. { deny all; })." },
  { id: "git", category: "exposure", severity: "high", weight: 8,
    found: "The .git folder is public", clean: "No .git folder exposed",
    probes: [["/.git/config", tpl("/.git/config")], ["/.git/HEAD", tpl("/.git/HEAD")]],
    fix: "Deploy a build, not the repository, or deny /.git at the server. With .git public, anyone can download the source and its history, including removed secrets." },
  { id: "keys", category: "exposure", severity: "critical", weight: 10,
    found: "Cloud service account key is public", clean: "No service account keys exposed",
    probes: [["/serviceAccountKey.json", tpl("/serviceAccountKey.json")], ["/service-account.json", sensitiveFile]],
    fix: "Delete the key file from the site, revoke the key in the cloud console now, and load credentials from the host's secret store instead." },
  { id: "config-files", category: "exposure", severity: "medium", weight: 3,
    found: "Server config with secrets is public", clean: "No server config with secrets exposed",
    probes: ["/.htaccess", "/web.config"].map((p) => [p, sensitiveFile]),
    fix: "Keep server config files out of the public folder, and move any password or connection string in them to environment variables." },
  { id: "firebase-db", category: "exposure", severity: "high", weight: 6,
    found: "Database answers reads without auth", clean: "No open Firebase-style database at /.json",
    probes: [["/.json", tpl("/.json")]],
    fix: "Require auth in the database rules (Firebase: \".read\": \"auth != null\") and deny everything else by default." },
  { id: "listing", category: "exposure", severity: "medium", weight: 5,
    found: "A folder lists its files", clean: "No browsable directory listings",
    probes: [["/api/", tpl("/api/")], ...LISTING_PATHS.map((p) => [p, listing])],
    fix: "Turn off directory indexes (Apache: Options -Indexes; nginx: autoindex off; Express: no serve-index), or restrict the folder." },
  { id: "phpinfo", category: "debug", severity: "high", weight: 6,
    found: "phpinfo() page is public", clean: "No phpinfo() page",
    probes: [["/phpinfo.php", phpinfoPage]],
    fix: "Delete phpinfo.php. It shows the PHP build, paths and environment variables." },
  { id: "server-status", category: "debug", severity: "medium", weight: 3,
    found: "Apache server-status is public", clean: "No public Apache server-status",
    probes: [["/server-status", serverStatusPage]],
    fix: "Restrict mod_status to localhost (Require local) or turn it off." },
  { id: "actuator", category: "debug", severity: "high", weight: 6,
    found: "Spring Boot actuator is public", clean: "No public Spring Boot actuator",
    probes: [["/actuator", sensitiveFile], ["/actuator/env", sensitiveFile]],
    fix: "Expose only health over the web (management.endpoints.web.exposure.include=health) and put the rest behind auth or on a management port." },
  { id: "metrics", category: "debug", severity: "medium", weight: 4,
    found: "Prometheus metrics are public", clean: "No public Prometheus metrics",
    probes: [["/metrics", tpl("/metrics")]],
    fix: "Serve /metrics on an internal port or behind auth. Metrics name internal components, versions and routes." },
  { id: "nextjs-debug", category: "debug", severity: "medium", weight: 3,
    found: "Next.js debug endpoint answers", clean: "No Next.js debug endpoint",
    probes: [["/api/__nextjs_original-stack-frame", tpl("/api/__nextjs_original-stack-frame")]],
    fix: "Deploy a production build (next build && next start); the dev server's debug routes should not be reachable." },
  { id: "stack-trace", category: "debug", severity: "low", weight: 3,
    found: "Error pages show a stack trace", clean: "Error pages show no stack trace",
    probes: ["/api/penthera-not-found", "/penthera-not-found"].map((p) => [p, all(STACK_TRACE)]),
    fix: "Turn off debug error pages in production and log the trace on the server instead." },
  { id: "openapi", category: "api", severity: "medium", weight: 4,
    found: "OpenAPI specification is public", clean: "No public OpenAPI specification",
    probes: SPEC_PATHS.map((p) => [p, (res) => !!parseSpec(res)]), bodyBytes: BUDGET.specBytes,
    fix: "Serve the API spec only to signed-in developers, or only in staging. It lists every route, parameter and schema." },
  { id: "api-docs", category: "api", severity: "medium", weight: 3,
    found: "API documentation UI is public", clean: "No public API documentation UI",
    probes: DOC_PATHS.map((p) => [p, (res) => res.status === 200 && /swagger|openapi|redoc|rapidoc|api-docs/i.test(res.body)]),
    fix: "Turn off Swagger UI or ReDoc in production (FastAPI: docs_url=None, redoc_url=None), or put it behind auth." },
];

// String#match, not RegExp#exec, in this file: `penthera --repo` reads a path string and an
// .exec( call in one file as a route with a shell exec (a false positive, noted for the CLI).
const ROBOTS = "/robots.txt";

/** Every fixed path the scan may request; robots.txt folders and spec routes are added at run time. */
export const PROBE_PATHS = [ROBOTS, ...new Set(GROUPS.flatMap((g) => g.probes.map(([p]) => p)))];

const MAX_ROBOTS = 3;
const MAX_ROUTES = 4;

/** Folder paths from robots.txt Disallow lines, as lib/templates.js robotsDisallowedPaths. */
export function robotsFolders(text) {
  const paths = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*disallow\s*:\s*(\S+)/i);
    if (!m) continue;
    const p = m[1];
    if (!p.startsWith("/") || p.startsWith("//") || p === "/" || /[*$?#\\]/.test(p) || p.length > 200) continue;
    const folder = p.endsWith("/") ? p : `${p}/`;
    if (LISTING_PATHS.includes(folder) || paths.includes(folder)) continue;
    paths.push(folder);
    if (paths.length >= MAX_ROBOTS) break;
  }
  return paths;
}

/** GET routes without parameters from a spec, sensitive-looking ones first (lib/blackbox/openapi.js). */
export function openRoutes(spec) {
  if (!spec?.paths || typeof spec.paths !== "object") return [];
  if (Array.isArray(spec.security) && spec.security.length) return [];
  return Object.entries(spec.paths)
    .filter(([p, ops]) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !/[{}?#\\]/.test(p) && p.length <= 200
      && ops?.get && !(Array.isArray(ops.get.security) && ops.get.security.length))
    .map(([p]) => p)
    .sort((a, b) => Number(!/data|json|user|admin|config|secret|env|export/i.test(a)) - Number(!/data|json|user|admin|config|secret|env|export/i.test(b)))
    .slice(0, MAX_ROUTES);
}

async function pool(items, n, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

const curlStatus = (url) => `curl -s -o /dev/null -w "%{http_code}\\n" ${url}`;

/**
 * The share of weight that passed, as in grade.mjs, with a ceiling: a public
 * secret or key outweighs any number of good headers. A failed critical check
 * caps the score at 40 (Unsafe defaults), a failed high one at 69.
 */
function score(checks) {
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const got = checks.reduce((n, c) => n + (c.passed ? c.weight : 0), 0);
  const failed = (sev) => checks.some((c) => !c.passed && c.severity === sev);
  const cap = failed("critical") ? 40 : failed("high") ? 69 : 100;
  return Math.min(cap, total ? Math.round((got / total) * 100) : 100);
}

/**
 * @param {URL} target  from parseTarget
 * @param {{secret?: string, resolveTxt?: Function, lookup?: Function, allowPrivate?: boolean, anyPort?: boolean,
 *          verifyOverHttp?: boolean, now?: number, clock?: () => number}} opts
 */
export async function deepReport(target, opts = {}) {
  const clock = opts.clock ?? Date.now;
  const deadline = clock() + BUDGET.totalMs;
  const host = hostOf(target);
  const { address, family } = await resolvePublic(host, { lookup: opts.lookup, allowPrivate: opts.allowPrivate });
  const pin = { host, address, family };

  const verified = await verifyOwner(target, pin, opts);

  // The passive checks: one GET of the page, redirects guarded.
  // tier1.mjs keeps its own budget: at most 20 requests and about 8 seconds.
  const passive = await passiveReport(target, opts);

  // Probes go to the verified host's root, over the scheme the passive check
  // ended on when it stayed on this host, else the one that was typed.
  const final = new URL(passive.url);
  const sameHost = hostOf(final) === host;
  const origin = (sameHost ? final : target).origin;

  // Counts this scan's own requests: the verification file and the probes.
  let sent = verified.requests;
  let probes = 0;
  const get = async (path, bodyBytes = BUDGET.bodyBytes) => {
    const left = deadline - clock();
    if (probes >= BUDGET.probes || left < 500) return null;
    probes++;
    sent++;
    try {
      return await fetchPinned(new URL(path, origin), pin, { timeout: Math.min(BUDGET.requestMs, left), maxBytes: bodyBytes, anyPort: opts.anyPort });
    } catch {
      return null;
    }
  };

  // Round one: every fixed path, plus robots.txt.
  const results = new Map();
  const first = [[ROBOTS, BUDGET.bodyBytes], ...GROUPS.flatMap((g) => g.probes.map(([p]) => [p, g.bodyBytes || BUDGET.bodyBytes]))];
  const seen = new Set();
  const round1 = first.filter(([p]) => !seen.has(p) && seen.add(p));
  await pool(round1, BUDGET.concurrency, async ([p, bytes]) => { results.set(p, await get(p, bytes)); });

  // Round two: folders robots.txt asks crawlers to skip, and the spec's open GET routes.
  const robots = results.get(ROBOTS);
  const folders = robots?.status === 200 && !/html/i.test(String(robots.headers["content-type"] || "")) ? robotsFolders(robots.body) : [];
  const specPath = SPEC_PATHS.find((p) => results.get(p) && parseSpec(results.get(p)));
  const spec = specPath ? parseSpec(results.get(specPath)) : null;
  const routes = openRoutes(spec).filter((p) => !results.has(p));
  await pool([...routes, ...folders], BUDGET.concurrency, async (p) => { results.set(p, await get(p)); });

  // ── Checks ──────────────────────────────────────────────────────────
  const at = (p) => new URL(p, origin).href;
  const checks = [];
  let unanswered = 0;
  for (const g of GROUPS) {
    const probes = g.id === "listing" ? [...g.probes, ...folders.map((p) => [p, listing])] : g.probes;
    const answered = probes.filter(([p]) => results.get(p));
    unanswered += probes.length - answered.length;
    if (!answered.length) continue;
    const hits = answered.filter(([p, match]) => match(results.get(p)));
    const shown = hits[0]?.[0] ?? answered[0][0];
    checks.push({
      id: g.id, category: g.category, passed: hits.length === 0, severity: g.severity,
      title: hits.length ? g.found : g.clean,
      evidence: hits.length
        ? hits.map(([p]) => `${p}: HTTP ${results.get(p).status}, ${results.get(p).body.length} bytes${results.get(p).truncated ? "+" : ""}`).join("; ")
        : `${answered.length} path${answered.length === 1 ? "" : "s"} checked: ${answered.map(([p]) => p).join(", ")}`,
      fix: g.fix,
      verify: curlStatus(at(shown)),
      weight: g.weight,
    });
  }
  if (routes.length) {
    const open = routes.filter((p) => {
      const r = results.get(p);
      return r && r.status < 400 && r.body.length > 2 && !/^\s*<(!doctype|html)/i.test(r.body);
    });
    const sensitive = open.filter((p) => /password|secret|token|user_id|email/i.test(results.get(p).body));
    checks.push({
      id: "open-routes", category: "api", passed: open.length === 0,
      severity: sensitive.length ? "high" : "medium",
      title: open.length ? `${open.length} API route${open.length === 1 ? "" : "s"} from the spec answer without auth` : "Spec routes ask for auth",
      evidence: open.length
        ? open.map((p) => `GET ${p}: HTTP ${results.get(p).status}${sensitive.includes(p) ? ", body names user or secret fields" : ""}`).join("; ")
        : `${routes.length} GET route${routes.length === 1 ? "" : "s"} from ${specPath} checked`,
      fix: "Require auth on these routes, or mark them public on purpose in the spec. Check that each one returns only what an anonymous visitor may see.",
      verify: curlStatus(at(open[0] ?? routes[0])),
      weight: 6,
    });
  }

  const allChecks = [...passive.checks, ...checks];
  const s = score(allChecks);
  const labels = { ...CATEGORIES, ...DEEP_CATEGORIES };
  const notes = [];
  if (!sameHost) notes.push(`${host} redirects to ${final.hostname}; the paths were checked on ${host}. To check ${final.hostname}, verify that host too.`);
  if (unanswered) notes.push(`${unanswered} path${unanswered === 1 ? "" : "s"} did not answer in time and count for nothing.`);

  return {
    url: passive.url,
    tier: "deep",
    host,
    verifiedBy: verified.method,
    status: passive.status,
    redirects: passive.redirects,
    score: s,
    verdict: s >= 90 ? "Solid basics" : s >= 70 ? "A few quick fixes" : s >= 45 ? "Important gaps remain" : "Unsafe defaults",
    categories: Object.entries(labels).map(([id, label]) => {
      const cs = allChecks.filter((c) => c.category === id);
      return { id, label, passed: cs.filter((c) => c.passed).length, total: cs.length };
    }).filter((c) => c.total),
    checks: allChecks,
    requests: sent,
    scope: [
      `Owner-verified scan of ${host} (by ${verified.method === "dns" ? "DNS TXT record" : "/.well-known/penthera.txt"}).`,
      `The passive checks plus ${probes} GET requests to fixed paths from the CLI's default scan: exposed files, debug pages, API docs and directory listings.`,
      "No payloads, no form posts, no login attempts. The paths go to this host only and redirects are not followed. Nothing stored.",
      ...notes,
      "For the full scan, including the endpoint wordlist and JavaScript libraries, run npx penthera on your own machine.",
    ].join(" "),
  };
}

