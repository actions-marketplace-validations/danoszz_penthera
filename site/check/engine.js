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
 *
 * Nothing here touches the network; the page's CSP (connect-src 'none') makes
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
import { GZ_PATHS, BUILD } from "./assets.js";

export const ROOT = "/repo";

/** The files the check reads, where they go in the repo, and how to recognise pasted text. */
export const KINDS = [
  { id: "package.json", path: "package.json", names: [/^package\.json$/i] },
  { id: ".mcp.json", path: ".mcp.json", names: [/^\.?mcp\.json$/i] },
  { id: ".claude/settings.json", path: ".claude/settings.json", names: [/^settings(\.local)?\.json$/i] },
  { id: "CLAUDE.md", path: "CLAUDE.md", names: [/^claude(\.local)?\.md$/i] },
  { id: "AGENTS.md", path: "AGENTS.md", names: [/^agents\.md$/i] },
];

/** The kind for a dropped file's name, or null when the check does not read it. */
export function kindForName(name) {
  const base = String(name).split(/[\\/]/).pop();
  return KINDS.find((k) => k.names.some((re) => re.test(base))) || null;
}

/** Best guess for pasted text: JSON by its keys, anything else is an instruction file. */
export function guessKind(text) {
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const byId = (id) => KINDS.find((k) => k.id === id);
  if (json && typeof json === "object") {
    if (json.mcpServers || json.servers) return byId(".mcp.json");
    if (json.hooks || json.permissions || json.enabledPlugins || json.env) return byId(".claude/settings.json");
    return byId("package.json");
  }
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
  for (const f of files) mount(`${ROOT}/${f.path}`, f.text);

  const findings = [];
  const agentFiles = files.filter((f) => f.path !== "package.json");
  if (agentFiles.length) {
    const r = await scanAgents(ROOT);
    findings.push(...r.findings);
  }
  findings.push(...scanSecrets(ROOT));
  const pkg = files.find((f) => f.path === "package.json");
  if (pkg) findings.push(...depsFindings(pkg.text));

  findings.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || String(a.url).localeCompare(String(b.url)));
  const counts = Object.fromEntries(SEV.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  unmount(ROOT);
  return { findings, counts, files: files.map((f) => f.path), ms: Math.round(performance.now() - start) };
}

/** What the page prints about the rules it runs. */
export function about() {
  return { packs: activePacks().map((p) => ({ name: p.name, version: p.version, rules: p.count, signature: p.signature })), build: BUILD };
}
