#!/usr/bin/env node
/**
 * Build the static site into site/dist.
 *
 *   node site/build.mjs [--out <dir>]
 *
 * The browser check (site/check) is bundled with the lib/ modules it imports,
 * so the rules that run in the page are the rules in this checkout. Node
 * built-ins resolve to the small shims in site/check/shims; the rule packs and
 * popular-package lists are embedded and mounted in an in-memory folder.
 * Each pack's signature is verified here, with the real lib/rules/sshsig.js,
 * because the browser cannot do it synchronously.
 *
 * One network request: the GitHub star count for the nav button, read once at
 * build time (the page itself cannot fetch). PENTHERA_SITE_STARS=<n> sets it,
 * PENTHERA_SITE_STARS=off skips it, and a failed request falls back to the
 * last count read (site/stars.json). No server code. Output: plain files for
 * any static host.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "rolldown";
import { bundledPackDirs, activePacks, loadSigners, NAMESPACE } from "../lib/rules/index.js";
import { verifyWithSigners } from "../lib/rules/sshsig.js";
import { COUNTS } from "../scripts/docs-numbers.mjs";

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SITE, "..");
const SHIMS = join(SITE, "check", "shims");
const posix = (p) => p.split(sep).join("/");

// ── What lib/ reads from disk, embedded ─────────────────────────────────────

function embeddedFiles() {
  const files = {};
  const add = (abs, as = `/penthera/${posix(relative(ROOT, abs))}`) => {
    const buf = readFileSync(abs);
    files[as] = abs.endsWith(".gz") ? { b64: buf.toString("base64") } : { text: buf.toString("utf8") };
  };
  for (const dir of bundledPackDirs()) for (const f of readdirSync(dir)) add(join(dir, f));
  add(join(ROOT, "lib", "rules", "allowed_signers"));
  add(join(ROOT, "lib", "deps", "popular-packages.json.gz"));
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  files["/penthera/package.json"] = { text: JSON.stringify({ name: pkg.name, version: pkg.version }) };
  return { files, version: pkg.version };
}

function signatures() {
  const out = {};
  const signers = loadSigners();
  for (const dir of bundledPackDirs()) {
    const sigPath = join(dir, "pack.json.sig");
    if (!existsSync(sigPath)) continue;
    const sig = readFileSync(sigPath, "utf8");
    const v = verifyWithSigners(readFileSync(join(dir, "pack.json")), sig, NAMESPACE, signers);
    if (!v.ok) throw new Error(`${posix(relative(ROOT, dir))}: pack.json.sig does not verify (${v.reason}); refusing to build`);
    out[sig.trim()] = { ok: true, principal: v.principal };
  }
  return out;
}

/** The "Load an example" files: the malicious agents fixture the test suite uses. */
function examples() {
  const dir = join(ROOT, "tests", "fixtures", "agents", "malicious");
  return [".mcp.json", ".claude/settings.json", "AGENTS.md"].map((p) => ({ path: p, text: readFileSync(join(dir, p), "utf8") }));
}

// ── Bundle ──────────────────────────────────────────────────────────────────

function sitePlugin({ files, version, sigs }) {
  const NODE = { fs: "fs.js", path: "path.js", os: "os.js", crypto: "crypto.js", zlib: "zlib.js", url: "url.js", buffer: "buffer.js" };
  const SSHSIG = join(ROOT, "lib", "rules", "sshsig.js");
  const virtual = {
    "virtual:assets": `export const FILES = ${JSON.stringify(files)};\nexport const BUILD = ${JSON.stringify({ version })};`,
    "virtual:signatures": `export const SIGNATURES = ${JSON.stringify(sigs)};`,
    "virtual:examples": `export const EXAMPLES = ${JSON.stringify(examples())};`,
  };
  return {
    name: "penthera-site",
    resolveId(source, importer) {
      if (source in virtual) return `\0${source}`;
      const node = source.replace(/^node:/, "");
      if (source.startsWith("node:") || (importer && NODE[node] && !source.startsWith("."))) {
        if (!NODE[node]) throw new Error(`${importer} imports ${source}, which the browser check has no shim for`);
        return join(SHIMS, NODE[node]);
      }
      if (importer && source.startsWith(".") && resolve(dirname(importer), source) === SSHSIG) return join(SHIMS, "sshsig.js");
      return null;
    },
    load(id) {
      if (id.startsWith("\0virtual:")) return virtual[id.slice(1)];
      return null;
    },
    // lib/ finds its data next to itself (new URL("./x.gz", import.meta.url)).
    // Point each module at its own place in the mounted /penthera tree.
    transform(code, id) {
      if (!id.startsWith(join(ROOT, "lib") + sep) || !code.includes("import.meta.url")) return null;
      return code.replaceAll("import.meta.url", JSON.stringify(`file:///penthera/${posix(relative(ROOT, id))}`));
    },
  };
}


/** Rule counts and runtime dependencies, from the same source as the README (scripts/docs-numbers.mjs). */
function ruleNumbers() {
  const deps = Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).dependencies || {});
  return {
    N_URL: String(COUNTS.urlTemplates), N_SECRETS: String(COUNTS.secretPatterns), N_CAPS: String(COUNTS.capabilities),
    N_AGENTS: String(COUNTS.agentRules), N_RECIPES: String(COUNTS.recipes),
    DEPS_N: deps.length === 1 ? "one runtime dependency" : `${deps.length} runtime dependencies`,
    DEPS_LIST: deps.join(", "),
  };
}

/**
 * The before/after example: a real scan of the test server, from
 * site/example.json (written by site/tools/example.mjs), and the rule counts
 * behind it. Fix recipes are not counted as rules.
 */
export function exampleValues(packRules) {
  const e = JSON.parse(readFileSync(join(SITE, "example.json"), "utf8"));
  const f = e.finding, u = new URL(f.url);
  const sum = ["critical", "high", "medium", "low"].filter((s) => e.counts[s]).map((s) => `<span class="nowrap">${e.counts[s]} ${s}</span>`);
  const rules = COUNTS.urlTemplates + COUNTS.secretPatterns + COUNTS.capabilities + COUNTS.agentRules + packRules;
  return {
    EX_CMD: esc(e.command), EX_SUM: sum.join(" · "), EX_INFO: String(e.counts.info),
    EX_CHECKS: String(e.checks), EX_REQ: String(e.requests), EX_HOST: esc(u.hostname),
    EX_SEV: f.severity.toUpperCase(), EX_TITLE: esc(f.title), EX_DESC: esc(f.description), EX_CONF: esc(f.confidence),
    EX_EVIDENCE: esc(`GET ${decodeURIComponent(u.pathname + u.search)}`), EX_STATUS: String(f.status),
    RULES_ALL: String(rules), REFS: String(COUNTS.references),
    PKGS: (COUNTS.popularNpm + COUNTS.popularPypi).toLocaleString("en-US"),
  };
}

/** Wilson score interval, 95%, as README and bench/ report it. */
function wilson(k, n, z = 1.96) {
  const p = k / n;
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return `${(c - h).toFixed(2)} to ${(c + h).toFixed(2)}`;
}

/** The benchmark's Total row from bench/RESULTS.md (generated by npm run bench). */
function benchNumbers() {
  const row = readFileSync(join(ROOT, "bench", "RESULTS.md"), "utf8").match(/^\| \*\*Total\*\* \|[^|]*\| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|/m);
  if (!row) throw new Error("bench/RESULTS.md: no Total row; run npm run bench");
  const [tp, fp, fn] = row.slice(1).map(Number);
  return {
    BENCH_P: (tp / (tp + fp)).toFixed(2), BENCH_P_CI: wilson(tp, tp + fp),
    BENCH_R: (tp / (tp + fn)).toFixed(2), BENCH_R_CI: wilson(tp, tp + fn),
    BENCH_N: String(tp + fp),
    BENCH_TP: String(tp), BENCH_FP: String(fp), BENCH_FN: String(fn),
    BENCH_EGRESS: (readFileSync(join(ROOT, "bench", "RESULTS.md"), "utf8").match(/Requests to non-loopback hosts: \*\*(\d+)\*\*/) || [])[1] ?? "not reported",
  };
}

const STARS_FILE = join(SITE, "stars.json");

/**
 * GitHub stars for the nav button, formatted (49, 1.2k). Order: the
 * PENTHERA_SITE_STARS override, a live API read (authenticated with
 * GITHUB_TOKEN when set, as the anonymous limit is 60 an hour), then the last
 * count that was read, kept in site/stars.json so a rate limit or an offline
 * build still shows a number. "" only when no count was ever read.
 */
async function starCount() {
  const env = process.env.PENTHERA_SITE_STARS;
  if (env === "off") return "";
  let n = env ? Number(env) : null;
  if (n == null) {
    try {
      const headers = { accept: "application/vnd.github+json", "user-agent": "penthera-site-build" };
      if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const res = await fetch("https://api.github.com/repos/danoszz/penthera", { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        n = (await res.json()).stargazers_count;
        if (Number.isFinite(n)) writeFileSync(STARS_FILE, JSON.stringify({ stars: n, checked: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
      }
    } catch {
      // Offline or rate-limited: fall back to the last count read.
    }
  }
  if (n == null && existsSync(STARS_FILE)) n = JSON.parse(readFileSync(STARS_FILE, "utf8")).stars;
  if (!Number.isFinite(n) || n < 0) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Check site/news.json: a date, one short line, an https source. Throws on the first bad item. */
export function readNews(file = join(SITE, "news.json")) {
  const { items } = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(items) || !items.length) throw new Error("news.json: no items");
  for (const [i, n] of items.entries()) {
    const where = `news.json items[${i}]`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date || "") || Number.isNaN(Date.parse(n.date))) throw new Error(`${where}: date must be YYYY-MM-DD`);
    if (typeof n.text !== "string" || !n.text.trim() || n.text.length > 120) throw new Error(`${where}: text must be 1 to 120 characters`);
    if (!/^https:\/\/[^\s"]+$/.test(n.source || "")) throw new Error(`${where}: source must be an https URL`);
  }
  return items;
}

/**
 * The ticker: the list twice, so the scroll loops without a seam. The second
 * copy is hidden from assistive tech and from the tab order.
 */
function tickerHtml(items) {
  const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const list = (hidden) => `<ul class="ticker-list"${hidden ? ' aria-hidden="true"' : ""}>${items.map((n) =>
    `<li><svg class="lock" viewBox="0 0 12 14" aria-hidden="true"><use href="#i-lock"/></svg><time datetime="${n.date}">${fmt(n.date)}</time> <a href="${esc(n.source)}"${hidden ? ' tabindex="-1"' : ""}>${esc(n.text)}</a></li>`).join("")}</ul>`;
  return `<div class="ticker" role="region" aria-label="Security news"><div class="ticker-track">${list(false)}${list(true)}</div></div>`;
}

/**
 * The site's absolute origin, for share cards (platforms need absolute image
 * URLs): SITE_URL, else the production URL Vercel gives the build, else the
 * deployment URL. Locally it is empty and the tags fall back to relative paths.
 */
function siteUrl(env = process.env) {
  const raw = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) || (env.VERCEL_URL && `https://${env.VERCEL_URL}`) || "";
  return raw.replace(/\/+$/, "");
}

const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);
const kb = (n) => Math.round(n / 1024);

/**
 * Bundle one entry of site/check for the browser.
 * @param {string} input entry file
 * @param {string} file output file
 */
export async function bundle(input, file, { minify = true } = {}) {
  const { files, version } = embeddedFiles();
  await build({
    input,
    platform: "browser",
    plugins: [sitePlugin({ files, version, sigs: signatures() })],
    output: { file, format: "esm", minify, codeSplitting: false },
    logLevel: "warn",
  });
  return { version };
}

/**
 * Build the site.
 * @param {{ out?: string, engine?: string }} opts engine: also write the
 *   check's engine alone (no DOM code) to this file, for tests
 */
export async function buildSite({ out = join(SITE, "dist"), engine } = {}) {
  const OUT = resolve(out);
  const t0 = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const { version } = await bundle(join(SITE, "check", "ui.js"), join(OUT, "check.js"));
  if (engine) await bundle(join(SITE, "check", "engine.js"), resolve(engine), { minify: false });

  // Static files, as they are.
  for (const f of ["styles.css", "theme.js", "robots.txt"]) cpSync(join(SITE, f), join(OUT, f));
  cpSync(join(SITE, "media"), join(OUT, "media"), { recursive: true });
  // The dashboard's own font and marks, so the site and penthera ui match.
  const UI = join(ROOT, "src", "ui", "static");
  for (const f of ["favicon.svg", "logo.svg"]) cpSync(join(UI, f), join(OUT, f));
  mkdirSync(join(OUT, "fonts"), { recursive: true });
  for (const f of ["DepartureMono-Regular.woff2", "DepartureMono-LICENSE.txt"]) cpSync(join(UI, "fonts", f), join(OUT, "fonts", f));
  cpSync(join(ROOT, "assets", "walkthrough.mp4"), join(OUT, "media", "walkthrough.mp4"));
  cpSync(join(ROOT, "assets", "walkthrough-poster.jpg"), join(OUT, "media", "walkthrough.jpg"));
  cpSync(join(ROOT, "assets", "walkthrough.vtt"), join(OUT, "media", "walkthrough.vtt"));

  // The page: version-stamp the assets it loads and fill in measured numbers.
  const packs = activePacks();
  const checkBytes = statSync(join(OUT, "check.js")).size;
  const popular = JSON.parse((await import("node:zlib")).gunzipSync(readFileSync(join(ROOT, "lib", "deps", "popular-packages.json.gz"))).toString("utf8"));
  const values = {
    VERSION: version,
    RULES: String(packs.reduce((n, p) => n + p.count, 0)),
    PACKS: packs.map((p) => `${p.name}@${p.version}`).join(", "),
    POPULAR: popular.names.length.toLocaleString("en-US"),
    CHECK_KB: String(kb(checkBytes)),
    ...benchNumbers(),
    ...ruleNumbers(),
    ...exampleValues(packs.reduce((n, p) => n + p.count, 0)),
    STARS: await starCount(),
    TICKER: tickerHtml(readNews()),
    SITE_URL: siteUrl(),
  };
  values.STARS_LABEL = values.STARS ? `, ${values.STARS} stars` : "";
  let html = readFileSync(join(SITE, "index.html"), "utf8");
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in values)) throw new Error(`index.html: unknown placeholder ${m}`);
    return values[k];
  });
  html = html.replace(/(href|src)="\/(styles\.css|theme\.js|check\.js)"/g, (m, attr, f) => `${attr}="/${f}?v=${hash(readFileSync(join(OUT, f)))}"`);
  writeFileSync(join(OUT, "index.html"), html);

  const total = readdirSync(OUT, { recursive: true }).map((f) => join(OUT, f)).filter((f) => statSync(f).isFile()).reduce((n, f) => n + statSync(f).size, 0);
  writeFileSync(join(OUT, "build.json"), JSON.stringify({ version, ...values, bytes: total }, null, 2) + "\n");
  console.log(`${posix(relative(process.cwd(), OUT)) || "."}: check.js ${values.CHECK_KB} KB, ${values.RULES} pack rules (${values.PACKS}), ${kb(total)} KB in all, ${Date.now() - t0} ms`);
  return { out: OUT, values, bytes: total };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({ options: { out: { type: "string" }, engine: { type: "string" } } });
  buildSite({ out: args.out, engine: args.engine }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
