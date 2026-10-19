/**
 * Discover AI developer-tooling configuration in a repo and (opt-in) in the
 * user's home directory: MCP servers, hooks, permissions, skills, plugins,
 * marketplaces, and instruction files (AGENTS.md, CLAUDE.md, rules).
 *
 * Read-only. Nothing here writes, executes, or touches the network.
 */
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, relative, dirname, basename, sep, resolve } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";

const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next"]);
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_WALK_FILES = 5000;

// ── Small helpers ─────────────────────────────────────────────────────────

/** JSON.parse that tolerates // and /* *\/ comments and trailing commas (JSONC). */
export function parseJsonc(text) {
  try {
    return JSON.parse(text);
  } catch {
    let out = "";
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        out += ch;
        if (ch === "\\") { out += text[++i] ?? ""; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; continue; }
      if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
      if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
      out += ch;
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
  }
}

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

export function readText(p) {
  try {
    const st = statSync(p);
    if (!st.isFile()) return null;
    if (st.size > MAX_FILE_BYTES) return { tooLarge: true, size: st.size };
    return readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

/** Parse YAML frontmatter from a Markdown file. Returns {} when absent or invalid. */
export function parseFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/.exec(text || "");
  if (!m) return {};
  try {
    const fm = YAML.parse(m[1]);
    return fm && typeof fm === "object" ? fm : {};
  } catch {
    return {};
  }
}

/**
 * Walk a directory without following symlinks. Returns files and symlinks
 * (relative to `dir`), bounded so a hostile tree can't hang the scan.
 */
export function walk(dir, { maxDepth = 12, maxFiles = MAX_WALK_FILES } = {}) {
  const files = [];
  const symlinks = [];
  let truncated = false;
  const visit = (d, depth) => {
    if (files.length >= maxFiles) { truncated = true; return; }
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (files.length >= maxFiles) { truncated = true; return; }
      const full = join(d, e.name);
      if (e.isSymbolicLink()) { symlinks.push(full); continue; }
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || depth >= maxDepth) continue;
        visit(full, depth + 1);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  };
  visit(dir, 0);
  return { files, symlinks, truncated };
}

// ── Inventory ─────────────────────────────────────────────────────────────

function createInventory(root, homeDir, includeHome) {
  const display = (p) => {
    const abs = resolve(p);
    if (abs === root || abs.startsWith(root + sep)) return relative(root, abs) || ".";
    if (homeDir && (abs === homeDir || abs.startsWith(homeDir + sep))) return "~/" + relative(homeDir, abs).split(sep).join("/");
    return abs;
  };
  return {
    root,
    homeDir: includeHome ? homeDir : null,
    display,
    configFiles: [],      // every config file read: { path, display }
    instructionFiles: [], // Markdown/rule files a model reads: { path, display, scope }
    skills: [],           // { name, dir, display, skillFile, frontmatter, scope }
    mcpServers: [],       // { name, def, file, scope }
    hooks: [],            // { event, matcher, hook, file, key, baseDir }
    permissions: [],      // { rule, list, file }
    settings: [],         // { file, defaultMode, raw }
    marketplaces: [],     // { name, source, file }
    plugins: [],          // { id, installPath, version, gitCommitSha, file, enabled }
    pluginSources: [],    // plugin entries listed in a marketplace.json: { name, source, file }
    errors: [],           // { file, message }
  };
}

function loadJson(inv, path) {
  const text = readText(path);
  if (text == null) return null;
  if (typeof text === "object") {
    inv.errors.push({ file: inv.display(path), message: `larger than ${MAX_FILE_BYTES} bytes, not parsed` });
    return null;
  }
  try {
    const json = parseJsonc(text);
    inv.configFiles.push({ path, display: inv.display(path) });
    return json;
  } catch (e) {
    inv.errors.push({ file: inv.display(path), message: `invalid JSON: ${e.message}` });
    return null;
  }
}

function addMcpServers(inv, servers, file, scope) {
  if (!servers || typeof servers !== "object") return;
  for (const [name, def] of Object.entries(servers)) {
    if (def && typeof def === "object") inv.mcpServers.push({ name, def, file, scope });
  }
}

function addMcpFile(inv, path, scope) {
  const json = loadJson(inv, path);
  if (!json) return;
  // Claude/Cursor/Desktop use `mcpServers`; VS Code uses `servers`.
  addMcpServers(inv, json.mcpServers || json.servers, inv.display(path), scope);
}

function addHooks(inv, hooksObj, file, baseDir) {
  if (!hooksObj || typeof hooksObj !== "object") return;
  for (const [event, groups] of Object.entries(hooksObj)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, gi) => {
      const matcher = group?.matcher ?? "";
      const list = Array.isArray(group?.hooks) ? group.hooks : [group];
      list.forEach((hook, hi) => {
        if (!hook || typeof hook !== "object") return;
        inv.hooks.push({
          event,
          matcher,
          hook,
          file,
          baseDir,
          key: `hook:${file}#${event}[${matcher || "*"}]/${gi}.${hi}`,
        });
      });
    });
  }
}

function addSettingsFile(inv, path, scope) {
  const json = loadJson(inv, path);
  if (!json) return;
  const file = inv.display(path);
  const projectDir = scope === "repo" ? inv.root : dirname(dirname(path));
  inv.settings.push({ file, defaultMode: json.permissions?.defaultMode ?? null, raw: json });
  addHooks(inv, json.hooks, file, projectDir);
  for (const list of ["allow", "ask", "deny"]) {
    const rules = json.permissions?.[list];
    if (Array.isArray(rules)) for (const rule of rules) inv.permissions.push({ rule: String(rule), list, file });
  }
  addMcpServers(inv, json.mcpServers, file, scope);
  const mk = json.extraKnownMarketplaces;
  if (mk && typeof mk === "object") {
    for (const [name, v] of Object.entries(mk)) inv.marketplaces.push({ name, source: v?.source ?? v, file });
  }
}

function addInstructionFile(inv, path, scope) {
  if (!isFile(path)) return;
  inv.instructionFiles.push({ path, display: inv.display(path), scope });
}

function addMarkdownDir(inv, dir, scope) {
  if (!isDir(dir)) return;
  for (const f of walk(dir, { maxDepth: 6 }).files) {
    if (/\.(?:md|mdc|markdown|txt)$/i.test(f)) addInstructionFile(inv, f, scope);
  }
}

function addSkillsUnder(inv, dir, scope) {
  if (!isDir(dir)) return;
  const seen = new Set(inv.skills.map((s) => s.dir));
  for (const f of walk(dir, { maxDepth: 6 }).files) {
    if (basename(f).toLowerCase() !== "skill.md") continue;
    const skillDir = dirname(f);
    if (seen.has(skillDir)) continue;
    seen.add(skillDir);
    const text = readText(f);
    const fm = typeof text === "string" ? parseFrontmatter(text) : {};
    inv.skills.push({
      name: typeof fm.name === "string" ? fm.name : basename(skillDir),
      dir: skillDir,
      display: inv.display(skillDir),
      skillFile: f,
      frontmatter: fm,
      scope,
    });
  }
}

function addPluginDir(inv, pluginDir, scope) {
  addSkillsUnder(inv, join(pluginDir, "skills"), scope);
  addMarkdownDir(inv, join(pluginDir, "commands"), scope);
  addMarkdownDir(inv, join(pluginDir, "agents"), scope);
  const hooksFile = join(pluginDir, "hooks", "hooks.json");
  if (isFile(hooksFile)) {
    const json = loadJson(inv, hooksFile);
    if (json) addHooks(inv, json.hooks || json, inv.display(hooksFile), pluginDir);
  }
  const mcp = join(pluginDir, ".mcp.json");
  if (isFile(mcp)) addMcpFile(inv, mcp, scope);
  const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
  if (isFile(manifest)) {
    const json = loadJson(inv, manifest);
    if (json) {
      if (json.mcpServers && typeof json.mcpServers === "object") addMcpServers(inv, json.mcpServers, inv.display(manifest), scope);
      if (json.hooks && typeof json.hooks === "object") addHooks(inv, json.hooks.hooks || json.hooks, inv.display(manifest), pluginDir);
    }
  }
}

function addMarketplaceManifest(inv, path) {
  const json = loadJson(inv, path);
  if (!json || !Array.isArray(json.plugins)) return;
  for (const p of json.plugins) {
    if (p && typeof p === "object") inv.pluginSources.push({ name: p.name || "(unnamed)", source: p.source, file: inv.display(path) });
  }
}

// ── Repo ──────────────────────────────────────────────────────────────────

const SKILL_ROOTS = ["skills", ".claude/skills", ".cursor/skills", ".agents/skills", ".codex/skills"];
const INSTRUCTION_FILES = [
  "AGENTS.md", "CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md", "GEMINI.md",
  ".cursorrules", ".windsurfrules", ".clinerules",
  ".github/copilot-instructions.md",
];

function discoverRepo(inv) {
  const r = inv.root;
  for (const f of [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json"]) {
    if (isFile(join(r, f))) addMcpFile(inv, join(r, f), "repo");
  }
  for (const f of [".claude/settings.json", ".claude/settings.local.json"]) {
    if (isFile(join(r, f))) addSettingsFile(inv, join(r, f), "repo");
  }
  for (const f of INSTRUCTION_FILES) addInstructionFile(inv, join(r, f), "repo");
  if (isDir(join(r, ".clinerules"))) addMarkdownDir(inv, join(r, ".clinerules"), "repo");
  addMarkdownDir(inv, join(r, ".cursor", "rules"), "repo");
  addMarkdownDir(inv, join(r, ".github", "instructions"), "repo");
  addMarkdownDir(inv, join(r, ".claude", "commands"), "repo");
  addMarkdownDir(inv, join(r, ".claude", "agents"), "repo");
  for (const s of SKILL_ROOTS) addSkillsUnder(inv, join(r, s), "repo");
  // Plugins developed in this repo: plugins/<name>/{skills,hooks,...}
  if (isDir(join(r, "plugins"))) {
    for (const e of readdirSync(join(r, "plugins"), { withFileTypes: true })) {
      if (e.isDirectory()) addPluginDir(inv, join(r, "plugins", e.name), "repo");
    }
  }
  if (isFile(join(r, ".claude-plugin", "marketplace.json"))) addMarketplaceManifest(inv, join(r, ".claude-plugin", "marketplace.json"));
  if (isFile(join(r, ".claude-plugin", "plugin.json"))) addPluginDir(inv, r, "repo");
}

// ── Home ──────────────────────────────────────────────────────────────────

export function claudeDesktopConfigPaths(homeDir, platform = process.platform) {
  const out = [];
  if (platform === "darwin") out.push(join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json"));
  if (platform === "win32" && process.env.APPDATA) out.push(join(process.env.APPDATA, "Claude", "claude_desktop_config.json"));
  out.push(join(homeDir, ".config", "Claude", "claude_desktop_config.json"));
  return out;
}

function discoverHome(inv, homeDir) {
  const claude = join(homeDir, ".claude");
  for (const f of ["settings.json", "settings.local.json"]) {
    if (isFile(join(claude, f))) addSettingsFile(inv, join(claude, f), "home");
  }
  addInstructionFile(inv, join(claude, "CLAUDE.md"), "home");
  addSkillsUnder(inv, join(claude, "skills"), "home");
  addSkillsUnder(inv, join(homeDir, ".agents", "skills"), "home");
  addSkillsUnder(inv, join(homeDir, ".cursor", "skills"), "home");
  addMarkdownDir(inv, join(claude, "commands"), "home");
  addMarkdownDir(inv, join(claude, "agents"), "home");

  // User-scoped MCP servers for Claude Code live in ~/.claude.json, top level
  // and per project. Only the scanned project's entry is read.
  const userJsonPath = join(homeDir, ".claude.json");
  if (isFile(userJsonPath)) {
    const json = loadJson(inv, userJsonPath);
    if (json) {
      addMcpServers(inv, json.mcpServers, inv.display(userJsonPath), "home");
      const proj = json.projects?.[inv.root];
      if (proj?.mcpServers) addMcpServers(inv, proj.mcpServers, `${inv.display(userJsonPath)} (project ${basename(inv.root)})`, "home");
    }
  }

  if (isFile(join(homeDir, ".cursor", "mcp.json"))) addMcpFile(inv, join(homeDir, ".cursor", "mcp.json"), "home");
  for (const p of claudeDesktopConfigPaths(homeDir)) {
    if (isFile(p)) addMcpFile(inv, p, "home");
  }

  // Plugins and the marketplaces they come from.
  const pluginsDir = join(claude, "plugins");
  const known = isFile(join(pluginsDir, "known_marketplaces.json")) ? loadJson(inv, join(pluginsDir, "known_marketplaces.json")) : null;
  if (known && typeof known === "object") {
    const file = inv.display(join(pluginsDir, "known_marketplaces.json"));
    for (const [name, v] of Object.entries(known)) {
      if (!inv.marketplaces.some((m) => m.name === name)) inv.marketplaces.push({ name, source: v?.source ?? v, file });
    }
  }
  const enabled = new Set();
  for (const s of inv.settings) {
    const ep = s.raw?.enabledPlugins;
    if (ep && typeof ep === "object") for (const [id, on] of Object.entries(ep)) if (on) enabled.add(id);
  }
  const installed = isFile(join(pluginsDir, "installed_plugins.json")) ? loadJson(inv, join(pluginsDir, "installed_plugins.json")) : null;
  const pluginMap = installed?.plugins && typeof installed.plugins === "object" ? installed.plugins : {};
  const file = inv.display(join(pluginsDir, "installed_plugins.json"));
  for (const [id, entries] of Object.entries(pluginMap)) {
    for (const e of Array.isArray(entries) ? entries : [entries]) {
      if (!e || typeof e !== "object") continue;
      inv.plugins.push({
        id,
        installPath: e.installPath || null,
        version: e.version || null,
        gitCommitSha: e.gitCommitSha || null,
        file,
        enabled: enabled.has(id),
      });
      if (e.installPath && isDir(e.installPath)) addPluginDir(inv, e.installPath, `plugin:${id}`);
    }
  }
}

/**
 * Discover agent configuration.
 * @param {string} root - repo root
 * @param {object} [opts] { home: boolean, homeDir: string }
 */
export function discoverAgentConfig(root, opts = {}) {
  const absRoot = resolve(root);
  let canonical = absRoot;
  try { canonical = realpathSync(absRoot); } catch { /* keep as given */ }
  const homeDir = resolve(opts.homeDir || homedir());
  const inv = createInventory(canonical, homeDir, !!opts.home);
  if (existsSync(canonical)) discoverRepo(inv);
  if (opts.home) discoverHome(inv, homeDir);
  return inv;
}

export { isFile, isDir };
