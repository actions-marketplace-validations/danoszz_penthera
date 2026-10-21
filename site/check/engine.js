/**
 * The browser check: Penthera's own lib/ code, run in the visitor's tab.
 *
 * The visitor's files are mounted in an in-memory folder (/repo) and the same
 * functions the CLI calls read them through a node:fs shim:
 *
 *   scanAgents   lib/agents: MCP servers, hooks, permissions, instruction files
 *   scanSecrets  lib/whitebox/secrets.js: secret and AI-key patterns
 *   package.json lib/deps: install scripts (scanPackage), typosquats against the
 *                vendored popular list, and the bundled IOC rule pack
 *   runtime pins lib/advisories: Dockerfile and compose images, version files and
 *                composer.json against the runtime advisories and end-of-life lines
 *   headers      lib/advisories again, on response headers the visitor pasted
 *                (they ran curl themselves; the page never contacts their site)
 *
 * Nothing here touches the network; the page's CSP (connect-src: only Vercel's counters) makes
 * sure of it. site/build.mjs bundles this file and its lib/ imports.
 */
import "./shims/globals.js";
import { mount, unmount, readFileSync } from "./shims/fs.js";
import { prewarm } from "./shims/zlib.js";
import { Buffer } from "./shims/buffer.js";
import "./assets.js"; // mounts the rule packs and lists before lib/rules loads them
import { scanAgents } from "../../lib/agents/index.js";
import { scanSecrets } from "../../lib/whitebox/secrets.js";
import { scanPackage } from "../../lib/deps/capabilities.js";
import { MapSource } from "../../lib/deps/source.js";
import { findTyposquats } from "../../lib/deps/typosquat.js";
import { loadIocs } from "../../lib/deps/iocs.js";
import { riskFindings, typosquatFindings, iocFindings } from "../../lib/deps/findings.js";
import { activePacks } from "../../lib/rules/index.js";
import { runtimeAdvisoriesForRepo, runtimeAdvisoriesForResponse } from "../../lib/advisories/index.js";
import { GZ_PATHS, BUILD } from "./assets.js";

export const ROOT = "/repo";

/** Pasted response headers are staged under this name; they are not a file. */
export const HEADERS = "response headers";

/**
 * The files the check reads, where they go in the repo, and which engine reads
 * them. A kind with `keepName` keeps the dropped file's own name (Dockerfile.prod,
 * compose.override.yaml), as lib/advisories matches those by pattern.
 */
export const KINDS = [
  { id: "package.json", path: "package.json", group: "deps", names: [/^package\.json$/i] },
  { id: ".mcp.json", path: ".mcp.json", group: "agents", names: [/^\.?mcp\.json$/i] },
  { id: ".claude/settings.json", path: ".claude/settings.json", group: "agents", names: [/^settings(\.local)?\.json$/i] },
  { id: "CLAUDE.md", path: "CLAUDE.md", group: "agents", names: [/^claude(\.local)?\.md$/i] },
  { id: "AGENTS.md", path: "AGENTS.md", group: "agents", names: [/^agents\.md$/i] },
  { id: "Dockerfile", path: "Dockerfile", group: "runtime", keepName: true, names: [/^(?:Dockerfile|Containerfile)(?:\..+)?$/i, /\.(?:dockerfile|containerfile)$/i] },
  { id: "compose.yaml", path: "compose.yaml", group: "runtime", keepName: true, names: [/^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/i] },
  { id: "composer.json", path: "composer.json", group: "runtime", names: [/^composer\.json$/i] },
  { id: ".php-version", path: ".php-version", group: "runtime", names: [/^\.php-version$/i] },
  { id: ".tool-versions", path: ".tool-versions", group: "runtime", names: [/^\.tool-versions$/i] },
  { id: ".nvmrc", path: ".nvmrc", group: "runtime", keepName: true, names: [/^\.(?:nvmrc|node-version)$/i] },
  { id: ".python-version", path: ".python-version", group: "runtime", names: [/^\.python-version$/i] },
  { id: "runtime.txt", path: "runtime.txt", group: "runtime", names: [/^runtime\.txt$/i] },
];

/** Where a dropped file goes, or null when the check does not read it. */
export function kindForName(name) {
  const base = String(name).split(/[\\/]/).pop();
  const kind = KINDS.find((k) => k.names.some((re) => re.test(base)));
  if (!kind) return null;
  return kind.keepName ? { ...kind, path: base } : kind;
}

const groupOf = (path) => (path === HEADERS ? "headers" : kindForName(path)?.group);

/** Best guess for pasted text: JSON by its keys, anything else is an instruction file. */
export function guessKind(text) {
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const byId = (id) => KINDS.find((k) => k.id === id);
  if (json && typeof json === "object") {
    if (json.mcpServers || json.servers) return byId(".mcp.json");
    if (json.hooks || json.permissions || json.enabledPlugins || json.env) return byId(".claude/settings.json");
    if (json.require?.php || json.config?.platform?.php || (json.require && !json.dependencies && !json.devDependencies)) return byId("composer.json");
    return byId("package.json");
  }
  if (/^\s*FROM\s+\S/im.test(text)) return byId("Dockerfile");
  if (/^services:\s*$/m.test(text)) return byId("compose.yaml");
  if (/^\s*(?:php|nodejs|python)\s+\d/m.test(text)) return byId(".tool-versions");
  return /\bagents?\b/i.test(text.slice(0, 200)) && !/claude/i.test(text.slice(0, 200)) ? byId("AGENTS.md") : byId("CLAUDE.md");
}

let warm = null;
/** Inflate the gzipped popular-package lists once (DecompressionStream). */
export function ready() {
  warm ??= Promise.all(GZ_PATHS.map((p) => prewarm(readFileSync(p))));
  return warm;
}

const SEV = ["critical", "high", "medium", "low", "info"];

function depsFindings(text) {
  const buf = Buffer.from(text);
  const iocs = loadIocs();
  const own = scanPackage(new MapSource(new Map([["package.json", buf]]), "local"), { iocs });
  const pkg = { ...own, name: own.name || "package.json", version: own.version || "local", path: "", ecosystem: "npm" };
  let json = {};
  try { json = JSON.parse(text); } catch { /* reported by scanPackage as unscanned */ }
  const deps = {};
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, spec] of Object.entries(json?.[field] || {})) deps[name] = String(spec);
  }
  // package.json holds ranges. Only an exact pin names one version; the
  // lockfile, which `npx penthera deps` reads, names them all.
  const declared = Object.entries(deps).map(([name, spec]) => ({
    name, version: (spec.match(/^=?v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/) || [, spec])[1], path: "package.json", iocHits: [],
  }));
  const names = declared.map((d) => d.name);
  return [
    ...riskFindings(pkg),
    ...iocFindings([pkg, ...declared], iocs),
    ...typosquatFindings(findTyposquats(names), new Map(declared.map((d) => [d.name, d])), new Set(names)),
  ];
}

/**
 * Check a set of files.
 * @param {{ path: string, text: string }[]} files paths relative to the repo root
 * @returns {Promise<{ findings: object[], counts: Record<string, number>, files: string[], ms: number }>}
 */
export async function check(files) {
  await ready();
  const start = performance.now();
  unmount(ROOT);
  // Pasted headers are not a file in the repo, so no file scan sees them.
  for (const f of files) if (f.path !== HEADERS) mount(`${ROOT}/${f.path}`, f.text);

  const findings = [];
  const groups = new Set(files.map((f) => groupOf(f.path)));
  if (groups.has("agents")) findings.push(...(await scanAgents(ROOT)).findings);
  findings.push(...scanSecrets(ROOT));
  const pkg = files.find((f) => f.path === "package.json");
  if (pkg) findings.push(...depsFindings(pkg.text));
  if (groups.has("runtime")) findings.push(...runtimeAdvisoriesForRepo(ROOT));
  const headers = files.find((f) => f.path === HEADERS);
  if (headers) findings.push(...runtimeAdvisoriesForResponse(fingerprintFromText(headers.text), { url: HEADERS }));

  findings.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || String(a.url).localeCompare(String(b.url)));
  const counts = Object.fromEntries(SEV.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  unmount(ROOT);
  return { findings, counts, files: files.map((f) => f.path), ms: Math.round(performance.now() - start) };
}

/**
 * The fingerprint lib/crawler.js builds from a live response, built from the
 * text `curl -sI` printed instead: the same Headers object, so names are
 * lower-cased and repeated headers joined exactly as the CLI sees them, and
 * the same cookie-name filter. With redirects (curl -L) the last response wins.
 */
export function fingerprintFromText(text) {
  const blocks = String(text).replace(/\r/g, "").split(/\n(?=HTTP\/[\d.]+\s)/);
  const headers = new Headers();
  for (const line of blocks.at(-1).split("\n")) {
    const m = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (m) try { headers.append(m[1], m[2]); } catch { /* not a valid header value */ }
  }
  return {
    headers: Object.fromEntries(headers.entries()),
    cookieNames: (headers.getSetCookie?.() || [])
      .map((c) => c.split("=")[0].trim())
      .filter((n) => /^[\w.-]{1,64}$/.test(n))
      .slice(0, 20),
    phpLink: null,
  };
}

/** What the page prints about the rules it runs. */
export function about() {
  return { packs: activePacks().map((p) => ({ name: p.name, version: p.version, rules: p.count, signature: p.signature })), build: BUILD };
}
