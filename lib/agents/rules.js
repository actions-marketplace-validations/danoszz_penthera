/**
 * Risky-configuration rules for MCP servers, hooks, permissions, skills'
 * allowed-tools, and plugin marketplaces. Pure functions over the inventory
 * from discover.js; each returns `{ rule, severity, title, detail, url }` hits.
 */
import { basename, isAbsolute, resolve } from "node:path";
import { findSecretsInText } from "../whitebox/secrets.js";
import { findExecPatterns, preview } from "./hidden-content.js";
import { readText, isFile } from "./discover.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function mask(s) {
  const v = String(s);
  return v.length <= 8 ? "***" : v.slice(0, 4) + "…" + v.slice(-4);
}

/** Split a command line on whitespace, honouring simple quotes. */
export function splitCommand(s) {
  return (String(s).match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])(.*)\1$/, "$2"));
}

function commandTokens(def) {
  const cmd = def.command ? splitCommand(def.command) : [];
  const args = Array.isArray(def.args) ? def.args.map(String) : [];
  return [...cmd, ...args];
}

const LOCAL_HOST = /^(?:localhost|127(?:\.\d+){3}|\[?::1\]?|0\.0\.0\.0|[\w-]+\.localhost|host\.docker\.internal)$/i;

function isPlainRemoteHttp(u) {
  if (typeof u !== "string" || !/^(?:http|ws):\/\//i.test(u)) return false;
  try {
    return !LOCAL_HOST.test(new URL(u.replace(/^ws:/i, "http:")).hostname);
  } catch {
    return false;
  }
}

// ── MCP: unpinned package runners ─────────────────────────────────────────

const EXACT_SEMVER = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** True if an npm spec (`pkg@1.2.3`, `@scope/pkg@1.2.3`) pins an exact version. */
export function npmSpecPinned(spec) {
  if (/^(?:\.{0,2}\/|file:|git\+|https?:|[A-Za-z]:\\)/.test(spec)) return true; // local path or explicit URL: not a registry lookup
  const at = spec.startsWith("@") ? spec.indexOf("@", 1) : spec.indexOf("@");
  if (at < 0) return false;
  return EXACT_SEMVER.test(spec.slice(at + 1));
}

/** True if a Python spec (`pkg==1.2.3`, `pkg@1.2.3`) pins an exact version. */
export function pySpecPinned(spec) {
  if (/^(?:\.{0,2}\/|file:|git\+|https?:)/.test(spec)) return true;
  const version = pinnedVersion(spec);
  // Same language as /^\d+(?:\.\d+)*(?:[-.+]?[A-Za-z0-9.]+)?$/, without its quadratic overlap.
  return version != null && /^(?:\d[A-Za-z0-9.]*|\d+(?:\.\d+)*[-+][A-Za-z0-9.]+)$/.test(version) && !/[<>~^*]/.test(spec);
}

/**
 * The text after the first `==` or `@` in the spec's last run of
 * non-separator characters: what `/(?:==|@)([^,;\s]+)$/` captures, found in
 * linear time (that regex rescans the tail from every `@`).
 */
function pinnedVersion(spec) {
  let start = spec.length;
  while (start > 0 && !/[,;\s]/.test(spec[start - 1])) start--;
  const tail = spec.slice(start);
  const at = tail.search(/==|@/);
  if (at < 0) return null;
  const version = tail.slice(at + (tail[at] === "@" ? 1 : 2));
  return version || null;
}

const RUNNERS = [
  { name: "npx", match: (t) => /^npx(?:\.cmd)?$/.test(basename(t[0])), from: 1, eco: "npm", valueOpts: ["-p", "--package", "-c", "--call", "--cache", "--registry"], pkgOpts: ["-p", "--package"], autoYes: (a) => a.includes("-y") || a.includes("--yes") },
  { name: "bunx", match: (t) => /^bunx$/.test(basename(t[0])), from: 1, eco: "npm", valueOpts: ["-p", "--package"], pkgOpts: ["-p", "--package"], autoYes: () => true },
  { name: "pnpm dlx", match: (t) => /^pnpm$/.test(basename(t[0])) && t[1] === "dlx", from: 2, eco: "npm", valueOpts: ["--package"], pkgOpts: ["--package"], autoYes: () => true },
  { name: "yarn dlx", match: (t) => /^yarn$/.test(basename(t[0])) && t[1] === "dlx", from: 2, eco: "npm", valueOpts: ["-p", "--package"], pkgOpts: ["-p", "--package"], autoYes: () => true },
  { name: "uvx", match: (t) => /^uvx$/.test(basename(t[0])), from: 1, eco: "py", valueOpts: ["--from", "--with", "--python", "-p", "--index-url", "--index"], pkgOpts: ["--from"], autoYes: () => true },
  { name: "uv tool run", match: (t) => /^uv$/.test(basename(t[0])) && t[1] === "tool" && t[2] === "run", from: 3, eco: "py", valueOpts: ["--from", "--with", "--python", "-p"], pkgOpts: ["--from"], autoYes: () => true },
  { name: "pipx run", match: (t) => /^pipx$/.test(basename(t[0])) && t[1] === "run", from: 2, eco: "py", valueOpts: ["--spec", "--python", "--index-url"], pkgOpts: ["--spec"], autoYes: () => true },
];

/** Identify the package an MCP launch command installs on the fly, if any. */
export function runnerPackage(tokens) {
  const runner = RUNNERS.find((r) => tokens.length && r.match(tokens));
  if (!runner) return null;
  const args = tokens.slice(runner.from);
  let pkg = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, null];
    if (runner.pkgOpts.includes(flag)) { pkg = inline ?? args[i + 1]; break; }
    if (a.startsWith("-")) {
      if (runner.valueOpts.includes(flag) && inline == null) i++;
      continue;
    }
    pkg = a;
    break;
  }
  if (!pkg) return null;
  const pinned = runner.eco === "npm" ? npmSpecPinned(pkg) : pySpecPinned(pkg);
  return { runner: runner.name, pkg, pinned, autoYes: runner.autoYes(args) };
}

// ── MCP rules ─────────────────────────────────────────────────────────────

const SECRET_NAME = /(?:token|secret|passw(?:or)?d|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth|credential|bearer|cookie)/i;
const NOT_A_SECRET = /^(?:\$\{?[\w:-]+\}?|\$\w+|%\w+%|<[^>]+>|\{\{[^}]+\}\}|env:.*|op:\/\/.*|your[-_ ].*|xxx+.*|changeme|placeholder|\*+|true|false|none|null|\d{1,6})$/i;

function inlineSecretHits(kind, k, v) {
  const value = String(v ?? "");
  if (!value || NOT_A_SECRET.test(value.trim())) return [];
  const hits = findSecretsInText(`${k}="${value}"`).map((h) => ({ name: h.name, severity: h.severity, match: h.match }));
  if (hits.length) return hits;
  // Bearer tokens in headers, and long literals under a secret-looking name.
  const bearer = value.match(/^(?:Bearer|Basic|Token)\s+(\S{12,})$/i);
  if (bearer && !NOT_A_SECRET.test(bearer[1])) return [{ name: `${kind} credential`, severity: "high", match: bearer[1] }];
  if (SECRET_NAME.test(k) && value.length >= 12 && !/\s/.test(value)) {
    return [{ name: "Credential-like value", severity: "high", match: value }];
  }
  return [];
}

export function checkMcpServer(server) {
  const { name, def, file } = server;
  const hits = [];
  const tokens = commandTokens(def);

  const run = runnerPackage(tokens);
  if (run && !run.pinned) {
    hits.push({
      rule: "mcp-unpinned",
      severity: run.autoYes ? "medium" : "low",
      title: `MCP server "${name}" runs an unpinned package via ${run.runner}`,
      detail: `\`${preview([...tokens].join(" "), 120)}\` installs \`${run.pkg}\` from the registry at launch${run.autoYes ? " without a prompt" : ""}, at whatever version is current. A compromised or hijacked release runs on your machine with the agent's access. Pin an exact version (\`${run.pkg.replace(/@[^@/]*$/, "")}@x.y.z\`${run.runner.includes("uv") || run.runner.includes("pipx") ? " or `pkg==x.y.z`" : ""}).`,
      url: file,
    });
  }

  const exec = findExecPatterns(tokens.join(" "));
  if (exec.length) {
    hits.push({
      rule: "mcp-exec",
      severity: "critical",
      title: `MCP server "${name}" launches by downloading and running code`,
      detail: `Launch command contains a ${exec[0].label}: \`${preview(exec[0].match, 120)}\`.`,
      url: file,
    });
  }

  const secretSources = [];
  if (def.env && typeof def.env === "object") for (const [k, v] of Object.entries(def.env)) secretSources.push(["env", k, v]);
  if (def.headers && typeof def.headers === "object") for (const [k, v] of Object.entries(def.headers)) secretSources.push(["header", k, v]);
  tokens.forEach((t, i) => {
    const flag = tokens[i - 1] || "";
    if (/^--?[\w-]*(?:key|token|secret|password)/i.test(flag)) secretSources.push(["arg", flag.replace(/^-+/, ""), t]);
    else if (t.includes("=")) secretSources.push(["arg", t.slice(0, t.indexOf("=")).replace(/^-+/, ""), t.slice(t.indexOf("=") + 1)]);
    else secretSources.push(["arg", "arg", t]);
  });
  const url = def.url || def.serverUrl || def.endpoint;
  if (typeof url === "string") {
    try {
      const u = new URL(url);
      for (const [k, v] of u.searchParams) secretSources.push(["url", k, v]);
    } catch { /* not a URL */ }
  }
  const reported = new Set();
  for (const [kind, k, v] of secretSources) {
    for (const h of inlineSecretHits(kind, k, v)) {
      if (reported.has(k)) continue;
      reported.add(k);
      hits.push({
        rule: "mcp-inline-secret",
        severity: h.severity === "critical" ? "critical" : "high",
        title: `MCP server "${name}" has an inline secret in ${kind} \`${k}\``,
        detail: `${h.name} stored in plain text in the config (\`${mask(h.match)}\`). Config files get synced, shared and committed. Reference an environment variable instead (\`"${k}": "\${${k.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}}"\`) and rotate this one.`,
        url: file,
      });
    }
  }

  const remote = [url, ...tokens].find(isPlainRemoteHttp);
  if (remote) {
    hits.push({
      rule: "mcp-plain-http",
      severity: "high",
      title: `MCP server "${name}" connects over plain HTTP`,
      detail: `\`${preview(remote, 100)}\` is not TLS. Anyone on the network path can read the tool traffic and inject tool results or descriptions. Use https://.`,
      url: file,
    });
  }
  return hits;
}

// ── Permissions ───────────────────────────────────────────────────────────

const SHELL_TOOL = "(?:Bash|Shell|PowerShell|run_terminal_cmd|terminal)";
const UNRESTRICTED = new RegExp(`^(?:\\*|${SHELL_TOOL}(?:\\(\\s*(?:\\*|:\\*|\\*\\*|\\*:\\*)?\\s*\\))?)$`, "i");
const DANGEROUS_CMD = new RegExp(`^${SHELL_TOOL}\\(\\s*(sudo|curl|wget|sh|bash|zsh|eval|ssh|scp|nc|ncat|rm|chmod|dd)\\b([^)]*)\\)$`, "i");
const INTERPRETER_CMD = new RegExp(`^${SHELL_TOOL}\\(\\s*(python[0-9.]*|node|npx|bunx|deno|bun|ruby|perl|php|uvx)\\b([^)]*)\\)$`, "i");
// A path in a folder every local user and process can write (`/tmp/x.sh`).
const WORLD_WRITABLE = new RegExp(`^${SHELL_TOOL}\\([^)]*?(?<=[\\s=:'"(])((?:/private)?/(?:var/)?tmp/|/dev/shm/)[^)]*\\)$`, "i");
// The arguments after the command: none, or a `*` anywhere, allow any call.
const anyArguments = (args) => !args.trim() || args.includes("*");
const CREDENTIAL_PATH = /\((?:[^)]*?)(?:~\/\.ssh|\.ssh\/|\.aws\/|\.gnupg|\.npmrc|\.netrc|\.env\b|\.docker\/config|id_rsa|id_ed25519|\.config\/gh)/i;

/** Classify one permission rule (`Bash(*)`, `Read(~/.ssh/**)`). Null if fine. */
export function classifyPermission(rule) {
  const r = String(rule).trim();
  if (UNRESTRICTED.test(r)) {
    return { rule: "permission-wildcard", severity: "high", why: "unrestricted shell: the agent can run any command without asking" };
  }
  let m = r.match(WORLD_WRITABLE);
  if (m) return { rule: "permission-tmp-script", severity: "medium", why: `runs a file from a world-writable folder (\`${m[1]}\`); any local process can replace it, and it then runs without asking`, fix: "Move the script into the repository, where changes show up in review, or remove the rule." };
  // An exact command (`Bash(bash ./scripts/check.sh)`) is the narrow form the
  // fix below asks for, so only open-ended grants are reported.
  m = r.match(DANGEROUS_CMD);
  if (m && anyArguments(m[2])) return { rule: "permission-wildcard", severity: "medium", why: `pre-approves \`${m[1]}\` with any arguments, enough to download, exfiltrate or delete` };
  if (m && /^sudo$/i.test(m[1])) return { rule: "permission-wildcard", severity: "low", why: "pre-approves a command that runs as root" };
  m = r.match(INTERPRETER_CMD);
  if (m && anyArguments(m[2])) return { rule: "permission-wildcard", severity: "low", why: `pre-approves \`${m[1]}\`, which can run arbitrary code` };
  if (/^(?:Read|Edit|Write|MultiEdit)\(/i.test(r) && CREDENTIAL_PATH.test(r)) {
    return { rule: "permission-credential-read", severity: "medium", why: "pre-approves access to credential files" };
  }
  if (/^mcp__\*$|^mcp__[^_]+__\*$/.test(r) || /^mcp__[\w-]+$/.test(r)) {
    return null; // whole-server allows are a normal pattern
  }
  return null;
}

export function checkPermissions(inv) {
  const hits = [];
  for (const p of inv.permissions) {
    if (p.list !== "allow") continue;
    const c = classifyPermission(p.rule);
    if (c) {
      hits.push({
        rule: c.rule,
        severity: c.severity,
        title: `Permission allow-list grants \`${p.rule}\``,
        detail: `\`${p.rule}\` ${c.why}. ${c.fix || "Narrow it to the exact commands the workflow needs (`Bash(npm test)`, `Bash(git status)`)."}`,
        url: p.file,
      });
    }
  }
  for (const s of inv.settings) {
    if (s.defaultMode === "bypassPermissions") {
      hits.push({
        rule: "permission-bypass-mode",
        severity: "high",
        title: "Permissions default to bypassPermissions",
        detail: "`permissions.defaultMode: \"bypassPermissions\"` runs every tool call without asking, including ones a prompt-injected agent makes. Use the default mode and an allow-list.",
        url: s.file,
      });
    }
  }
  return hits;
}

/** Tokenize an `allowed-tools` frontmatter value (string or list). */
export function parseAllowedTools(value) {
  if (Array.isArray(value)) return value.flatMap(parseAllowedTools);
  if (typeof value !== "string") return [];
  return value.match(/[A-Za-z_*][\w*-]*(?:\([^)]*\))?/g) || [];
}

export function checkAllowedTools(display, frontmatter, label) {
  const hits = [];
  const tools = parseAllowedTools(frontmatter?.["allowed-tools"] ?? frontmatter?.allowedTools);
  for (const t of tools) {
    const c = classifyPermission(t);
    if (!c) continue;
    hits.push({
      rule: c.rule,
      severity: c.severity,
      title: `${label} pre-approves \`${t}\` in allowed-tools`,
      detail: `While this ${label.toLowerCase().startsWith("skill") ? "skill" : "command"} is active, \`${t}\` ${c.why}. Instructions inside it (or injected into it) run with that grant.`,
      url: display,
    });
  }
  return hits;
}

// ── Hooks ─────────────────────────────────────────────────────────────────

// Whitespace, an optional (escaped) quote, whitespace. Written so the two
// whitespace runs cannot split one run of spaces between them, which made the
// former `\s*\\?["']?\s*` quadratic on long whitespace.
const QSEP = String.raw`\s*(?:\\?["']\s*|\\\s*)?`;
const AUTO_APPROVE = new RegExp(String.raw`["']?(?:permissionDecision|behavior)["']?${QSEP}:${QSEP}allow\b|["']?decision["']?${QSEP}:${QSEP}approve\b`, "i");
const PIPE_TO_SHELL = /\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b(?:\s|$|;|&|\))/;

/** The line holding the first pipe into a shell, for a finding's detail. */
function pipeToShellLine(text) {
  const m = /\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/.exec(text);
  if (!m) return null;
  const start = text.lastIndexOf("\n", m.index) + 1;
  const end = text.indexOf("\n", m.index + m[0].length);
  return text.slice(start, end < 0 ? text.length : end);
}

function hookScript(hook, command) {
  const env = {
    CLAUDE_PROJECT_DIR: hook.baseDir,
    CLAUDE_PLUGIN_ROOT: hook.baseDir,
  };
  const expanded = command.replace(/\$\{?(CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT)\}?/g, (_, k) => env[k] || "");
  for (const tok of splitCommand(expanded)) {
    if (!/[/\\]|\.(?:sh|py|js|mjs|cjs|ts|rb|pl)$/.test(tok)) continue;
    const p = isAbsolute(tok) ? tok : resolve(hook.baseDir || ".", tok);
    if (isFile(p)) {
      const text = readText(p);
      if (typeof text === "string") return { path: p, text };
    }
  }
  return null;
}

export function checkHook(h) {
  const hits = [];
  const command = typeof h.hook.command === "string" ? h.hook.command : "";
  if (!command) return hits;
  const where = `${h.event}${h.matcher ? ` (${h.matcher})` : ""}`;
  const script = hookScript(h, command);
  const sources = [{ label: "command", text: command }];
  if (script) sources.push({ label: `script ${basename(script.path)}`, text: script.text });

  for (const s of sources) {
    const exec = findExecPatterns(s.text);
    if (exec.length) {
      hits.push({
        rule: "hook-exec",
        severity: "critical",
        title: `${where} hook downloads and runs code`,
        detail: `Hook ${s.label} contains a ${exec[0].label}: \`${preview(exec[0].match, 120)}\`. Hooks run automatically on every matching event, with no prompt.`,
        url: h.file,
      });
      break;
    }
    if (PIPE_TO_SHELL.test(s.text)) {
      hits.push({
        rule: "hook-pipe-shell",
        severity: "high",
        title: `${where} hook pipes into a shell`,
        detail: `Hook ${s.label} pipes data into \`sh\`/\`bash\`: \`${preview(pipeToShellLine(s.text) || s.text, 120)}\`. Whatever produces that input controls the commands.`,
        url: h.file,
      });
      break;
    }
  }

  const approve = sources.find((s) => AUTO_APPROVE.test(s.text));
  if (approve) {
    const m = String(h.matcher || "");
    const broad = !m || m === "*" || m === ".*" || /\bBash\b|\bShell\b|\bmcp__/i.test(m);
    hits.push({
      rule: "hook-auto-approve",
      severity: broad ? "high" : "medium",
      title: `${where} hook auto-approves tool calls`,
      detail: `Hook ${approve.label} returns an allow/approve decision${broad ? ` for ${m ? `\`${m}\`` : "every tool"}` : ""}, so matching tool calls skip the permission prompt. A prompt-injected agent gets the same pass.`,
      url: h.file,
    });
  }
  return hits;
}

// ── Plugins and marketplaces ──────────────────────────────────────────────

const COMMIT = /^[0-9a-f]{40}$/i;

/** Describe a marketplace/plugin source and whether it is pinned to a commit. */
export function sourcePin(source) {
  if (typeof source === "string") {
    if (/^\.{0,2}\//.test(source)) return { local: true };
    if (/^https?:\/\//i.test(source)) return { pinned: false, label: source, http: isPlainRemoteHttp(source) };
    return { pinned: false, label: source };
  }
  if (!source || typeof source !== "object") return { local: true };
  const kind = source.source;
  if (kind === "directory" || kind === "file" || kind === "local") return { local: true };
  const label = source.repo || source.url || source.path || JSON.stringify(source);
  const pinned = COMMIT.test(source.sha || "") || COMMIT.test(source.ref || "") || COMMIT.test(source.commit || "");
  return { pinned, label, http: isPlainRemoteHttp(source.url), firstParty: /^anthropics\//i.test(source.repo || "") };
}

export function checkMarketplaces(inv) {
  const hits = [];
  for (const m of inv.marketplaces) {
    const s = sourcePin(m.source);
    if (s.local || s.pinned) continue;
    hits.push({
      rule: "marketplace-unpinned",
      severity: s.http ? "high" : s.firstParty ? "low" : "medium",
      title: `Plugin marketplace "${m.name}" is not pinned to a commit`,
      detail: `Source \`${preview(s.label, 100)}\` tracks a moving branch${s.http ? " over plain HTTP" : ""}. Whoever controls it can change the skills, hooks and MCP servers you install on the next update. Pin \`sha\` (or \`ref\`) to a reviewed commit.`,
      url: m.file,
    });
  }
  for (const p of inv.pluginSources) {
    const s = sourcePin(p.source);
    if (s.local || s.pinned) continue;
    hits.push({
      rule: "plugin-source-unpinned",
      severity: s.http ? "high" : "medium",
      title: `Marketplace plugin "${p.name}" is not pinned to a commit`,
      detail: `Source \`${preview(s.label, 100)}\` has no \`sha\`. Everyone installing from this marketplace gets whatever is on the branch at install time.`,
      url: p.file,
    });
  }
  return hits;
}

