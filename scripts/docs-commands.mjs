#!/usr/bin/env node
/**
 * Docs as tests: every shell command the docs show must exist, and the ones
 * that can run offline must run.
 *
 *   node scripts/docs-commands.mjs [--bin <path/to/bin/penthera.js>] [--report <file.md>] [--json] [--no-run]
 *
 * Reads README.md, docs/**\/*.md, skills/penthera/SKILL.md and the site
 * (site/index.html): fenced bash/sh blocks, `run:` lines in fenced yaml, and
 * inline `penthera …` / `npx penthera …` code spans (in the site, <code>
 * elements and backtick spans, such as the copy-paste prompts). Each command is classified:
 *
 *   runnable     offline-safe: run against a copy of tests/fixtures/init/app
 *                (a committed git repo) with substitutions such as
 *                origin/main -> HEAD. Exit 0 or 1 (findings) passes; 2 fails.
 *   placeholder  needs something the fixture can't give (<url>, a running app,
 *                a key, a path that isn't there, a TTY). Flags are checked
 *                against --help only.
 *   external     contacts the network (a public URL, npm install, --online,
 *                recon) or publishes. Flags checked against --help, not run.
 *   other        not a Penthera command (cp, ssh-keygen, curl | bash, …). Listed
 *                with the reason; not run.
 *
 * Every Penthera command is parse-checked: the subcommand and every flag must
 * appear in the matching `--help`. Commands in planning documents (roadmaps,
 * research plans) may describe unreleased features; their parse failures are
 * reported as "planned" and do not fail the check.
 *
 * Runs use a private HOME and PENTHERA_HOME and scripts/ci/net-guard.cjs, so a
 * documented command that reaches past loopback fails. Exit 0 when nothing
 * failed, 1 otherwise.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir, availableParallelism } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { mdCell } from "../src/report/md-escape.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "init", "app");
const NET_GUARD = join(ROOT, "scripts", "ci", "net-guard.cjs");

/** Docs whose commands may describe features that don't exist yet. */
export const PLANNING_DOCS = [
  "docs/plan.md", "docs/vision-2.0.md", "docs/release-plan.md", "docs/research/", "docs/funding/", "docs/archive/",
];

// ── Collect ──────────────────────────────────────────────────────────────────

export function docFiles(root = ROOT) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".md") ? [p] : [];
  });
  return ["README.md", ...walk(join(root, "docs")).map((p) => relative(root, p)), "skills/penthera/SKILL.md", "site/index.html"]
    .map((p) => p.split(sep).join("/"))
    .filter((p) => existsSync(join(root, p)));
}

const SHELL_LANGS = new Set(["bash", "sh", "shell", "console", "zsh"]);

/**
 * Commands in one Markdown file.
 * @returns {{file, line, source: "block"|"yaml"|"inline", text}[]}
 */
export function extractCommands(markdown, file) {
  const out = [];
  const lines = markdown.split(/\r?\n/);
  let fence = null; // { lang, marker }
  let pending = null; // a \-continued command: { line, text }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const open = raw.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
    if (!fence && open) { fence = { marker: open[1], lang: open[2].toLowerCase() }; continue; }
    if (fence && raw.trim().startsWith(fence.marker)) { fence = null; pending = null; continue; }
    if (fence) {
      if (SHELL_LANGS.has(fence.lang)) {
        let text = raw.replace(/^\s*\$\s+/, "");
        if (pending) { pending.text += " " + text.trim(); text = null; }
        else if (text.trim() && !text.trim().startsWith("#")) pending = { line: i + 1, text: text.trim() };
        if (pending && !/\\\s*$/.test(pending.text)) { out.push({ file, line: pending.line, source: "block", text: pending.text }); pending = null; }
        else if (pending) pending.text = pending.text.replace(/\\\s*$/, "").trimEnd();
      } else if (fence.lang === "yaml" || fence.lang === "yml") {
        const m = raw.match(/^\s*-?\s*run:\s*(.*\bpenthera\b.*)$/);
        if (m && !m[1].trim().startsWith("|")) out.push({ file, line: i + 1, source: "yaml", text: m[1].trim() });
      }
      continue;
    }
    for (const m of raw.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
      const span = m[1].trim();
      if (/^(npx\s+(--no-install\s+)?)?penthera(@\S+)?(\s|$)/.test(span)) out.push({ file, line: i + 1, source: "inline", text: span });
    }
  }
  return out;
}

/**
 * The site's HTML as the Markdown extractCommands reads: <code> becomes a
 * backtick span, other tags go, entities are decoded. Line numbers are kept.
 */
export function htmlToText(html) {
  const decode = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  let text = html.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/g, (m, c) => `\`${c}\``);
  // Strip until nothing changes, so a tag split by another ("<scr<b>ipt") cannot survive.
  for (let prev = null; prev !== text;) {
    prev = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return decode(text.replace(/[<>]/g, ""));
}

/** Commands in one doc file, Markdown or the site's HTML. */
export function extractDocCommands(text, file) {
  return extractCommands(file.endsWith(".html") ? htmlToText(text) : text, file);
}

// ── Shell-ish parsing ────────────────────────────────────────────────────────

/** Strip a trailing `# comment` that is not inside quotes. */
export function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else if (c === "\\" && q === '"') i++; continue; }
    if (c === "'" || c === '"') q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s;
}

/**
 * Split one line into simple commands on && || ; and | (outside quotes and
 * $(...)), then tokenize each. Pipes are kept so callers know what was piped.
 * @returns {{tokens: string[], pipedFrom: boolean}[]}
 */
export function splitCommands(line) {
  const parts = [];
  let cur = "", q = null, depth = 0, piped = false;
  const push = (nextPiped) => { if (cur.trim()) parts.push({ text: cur.trim(), pipedFrom: piped }); cur = ""; piped = nextPiped; };
  for (let i = 0; i < line.length; i++) {
    const c = line[i], two = line.slice(i, i + 2);
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (two === "$(") { depth++; cur += two; i++; continue; }
    if (c === ")" && depth) { depth--; cur += c; continue; }
    if (depth) { cur += c; continue; }
    if (two === "&&" || two === "||") { push(false); i++; continue; }
    if (c === ";") { push(false); continue; }
    if (c === "|") { push(true); continue; }
    cur += c;
  }
  push(false);
  return parts.map((p) => ({ tokens: tokenize(p.text), pipedFrom: p.pipedFrom, text: p.text }));
}

export function tokenize(s) {
  const out = [];
  let cur = null, q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (depth) { cur += c; if (c === "(") depth++; if (c === ")") depth--; continue; }
    if (c === "'" || c === '"') { q = c; cur ??= ""; continue; }
    if (c === "$" && s[i + 1] === "(") { cur = (cur ?? "") + "$("; depth = 1; i++; continue; }
    if (/\s/.test(c)) { if (cur !== null) out.push(cur); cur = null; continue; }
    cur = (cur ?? "") + c;
  }
  if (cur !== null) out.push(cur);
  return out;
}

// ── What --help says ─────────────────────────────────────────────────────────

const ANSI = /\x1b\[[0-9;]*m/g;
const flagsIn = (text) => new Set([...text.matchAll(/(?<![\w-])(--?[a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/**
 * Subcommands, their actions and their flags, read from `--help` output.
 * @param {(argv: string[]) => string} help  returns the help text for argv
 */
export function helpModel(help) {
  const main = help(["--help"]).replace(ANSI, "");
  const subs = new Map(); // name -> { flags:Set, actions:Set }
  for (const m of main.matchAll(/\$ penthera ([a-z][\w-]*)/g)) subs.set(m[1], null);
  // agents and deps are documented in the main help (their own --help prints it).
  const ownHelp = (name) => !["agents", "deps"].includes(name);
  for (const name of subs.keys()) {
    const text = ownHelp(name) ? help([name, "--help"]).replace(ANSI, "") : main;
    const actions = new Set();
    for (const t of [text, main]) {
      for (const m of t.matchAll(new RegExp(`penthera ${name} ((?:[a-z][\\w-]*)(?:\\|[a-z][\\w-]*)*)`, "g"))) {
        for (const a of m[1].split("|")) actions.add(a);
      }
    }
    subs.set(name, { flags: flagsIn(text), actions });
  }
  // Only subcommands whose help is built around actions require one.
  for (const [name, s] of subs) {
    s.needsAction = ["memory", "hook", "rules", "evidence"].includes(name);
    if (!s.needsAction) s.actions = new Set();
  }
  return { main: { flags: flagsIn(main) }, subs };
}

// ── Classify ─────────────────────────────────────────────────────────────────

const LICENSE_PRESETS = new Set(["permissive", "weak-copyleft-ok", "no-agpl"]);
/** Flags whose value is a file or folder the command reads. */
const INPUT_FLAGS = new Set(["--diff", "--venv", "--rules", "--rules-signers", "--assessment", "--baseline",
  "--incident", "--cra", "--report-template", "--allowed-signers", "--policy", "--questionnaire", "--suppliers", "--sign-key"]);
/** Flags that take a value (so the next token is not a positional). */
const VALUE_FLAGS = new Set([...INPUT_FLAGS, "-r", "--repo", "--api-root", "-o", "--output", "--markdown", "--sarif",
  "--audience", "--evidence", "--framework", "--assessment-init", "--policy-pack", "--org", "--incident-init", "--sbom",
  "--aibom", "--cra-init", "--history", "--auth-cookie", "--auth-bearer", "--timeout", "--concurrency", "--user-agent",
  "--profile", "--nuclei", "--templates", "--base", "--pr-comment", "--license-policy", "--port", "--project",
  "--reports", "--url", "-u", "--max-iterations", "--auto", "--fix-model", "--apply", "--input", "--dir", "--reason",
  "--expires", "--rules-signers"]);

const isPlaceholder = (t) => /<[^>]+>|\.\.\.|…|\$\(|\$\{?[A-Z_]+\}?|\[|\]|^~|eyJ/.test(t);
const isUrl = (t) => /^https?:\/\//.test(t) || /^\$\{?[A-Z_]*URL/.test(t) || /^<url>$/i.test(t);
const isLoopbackUrl = (t) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(t);
const looksLikePath = (t) => /^(\.{0,2}\/|~|[\w.-]+\/)/.test(t) || /\.\w+$/.test(t);

/**
 * Parse one simple command.
 * @returns {null | {env: string[], argv: string[], sub: string|null, action: string|null, flags: string[], positionals: string[]}}
 */
export function parsePenthera(tokens) {
  let i = 0;
  const env = [];
  while (i < tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[i])) env.push(tokens[i++]);
  if (tokens[i] === "npx") { i++; while (tokens[i]?.startsWith("-")) i++; }
  if (!/^penthera(@\S+)?$/.test(tokens[i] ?? "")) return null;
  const argv = [];
  for (const t of tokens.slice(i + 1)) {
    if (/^(\d?>>?|<|2>&1|&)$/.test(t)) break; // a redirect: the rest is the shell's
    argv.push(t);
  }
  return { env, argv };
}

/**
 * Classify one Penthera command and parse-check it against the help model.
 * @returns {{kind, reason, problems: string[], argv: string[]}}
 */
export function classify(argv, model, { file = "" } = {}) {
  const problems = [];
  // Square-bracketed optional parts ("[--expires 2027-01-01]") are checked like the rest.
  const flat = argv.flatMap((t) => t === "[" || t === "]" ? [] : [t.replace(/^\[/, "").replace(/\]$/, "")]).filter(Boolean);
  let sub = null, action = null;
  const positionals = [];
  const flags = [];
  for (let i = 0; i < flat.length; i++) {
    const t = flat[i];
    if (/^-/.test(t) && !/^-\d/.test(t)) {
      const name = t.replace(/=.*$/, "");
      flags.push({ name, value: t.includes("=") ? t.slice(t.indexOf("=") + 1) : VALUE_FLAGS.has(name) ? flat[++i] : undefined });
      continue;
    }
    if (sub === null && positionals.length === 0 && /^[a-z][\w-]*$/.test(t) && !looksLikePath(t)) {
      sub = t;
      if (!model.subs.has(sub)) problems.push(`unknown subcommand "${sub}"`);
      continue;
    }
    const s = sub && model.subs.get(sub);
    if (s?.needsAction && action === null && positionals.length === 0) {
      action = t;
      if (!isPlaceholder(t)) {
        for (const a of t.split("|")) if (!s.actions.has(a)) problems.push(`unknown action "${sub} ${a}"`);
      }
      continue;
    }
    positionals.push(t);
  }
  const known = sub && model.subs.get(sub) ? model.subs.get(sub).flags : model.main.flags;
  for (const f of flags) {
    if (isPlaceholder(f.name)) continue;
    if (!known.has(f.name)) problems.push(`${f.name} is not in \`penthera${sub && model.subs.has(sub) ? ` ${sub}` : ""} --help\``);
  }
  if (model.subs.get(sub)?.needsAction && action === null) {
    // `penthera hook` alone is fine as a name in prose, not as a command to run.
    return { kind: "placeholder", reason: "names the command group, not a full command", problems, sub, action, flags, positionals };
  }
  // Prose that names a command ("`penthera rules verify` checks …") without
  // the arguments it needs is a reference, not something to run.
  const bare = flags.find((f) => VALUE_FLAGS.has(f.name) && f.value === undefined);
  if (bare) return { kind: "placeholder", reason: `names ${bare.name} without its value`, problems, sub, action, flags, positionals };
  if ((sub === "evidence" || sub === "rules") && action === "verify" && positionals.length === 0) {
    return { kind: "placeholder", reason: `names \`${sub} verify\` without its <dir>`, problems, sub, action, flags, positionals };
  }
  if (sub === "verify" && positionals.length === 0) {
    return { kind: "placeholder", reason: "names `verify` without its findings file", problems, sub, action, flags, positionals };
  }
  const has = (n) => flags.some((f) => f.name === n);
  const url = positionals.find(isUrl);
  const res = (kind, reason) => ({ kind, reason, problems, sub, action, flags, positionals });

  // External: the network, or publishing.
  if (url && !isLoopbackUrl(url) && !isPlaceholder(url)) return res("external", `scans a public URL (${url})`);
  if (sub === "install" && !has("--offline")) return res("external", "npm resolves packages from the registry");
  if (has("--online")) return res("external", "--online reads npm registry metadata");
  if (sub === null && (has("--recon") || has("--all"))) return res("external", "recon queries public OSINT sources");
  if (sub === null && has("--suppliers")) return res("external", "--suppliers rates public domains over DNS/HTTPS");

  // Placeholders: needs something the fixture can't give.
  const ph = [...argv, ...flags.map((f) => f.value ?? "")].find((t) => isPlaceholder(t));
  if (ph) return res("placeholder", `placeholder ${ph}`);
  if (url) return res("placeholder", `needs a running app at ${url}`);
  if (sub === null && flat.length === 0) return res("placeholder", "interactive: the setup wizard on a TTY");
  if (sub === "init" && !has("--yes") && !has("-y")) return res("placeholder", "interactive: init asks questions without --yes");
  if (sub === "agent") return res("placeholder", "interactive: the fix loop asks before each diff");
  if (sub === "fix" && has("--apply")) return res("placeholder", "applies a diff by id after a plan");
  if (sub === "ui") return res("placeholder", "a long-running server (the install matrix starts ui --demo and checks it)");
  if (sub === "install") return res("external", "npm install");
  if (has("--machine")) return res("placeholder", "audits the host machine (macOS)");
  if (has("--sign-key")) return res("placeholder", "needs a private SSH key");
  if (has("--home") && sub !== "agents") return res("placeholder", "--home");
  if (PLANNING_DOCS.some((p) => file.startsWith(p)) && problems.length) return res("planned", "planning document: may describe unreleased commands");
  return res("runnable", "");
}

/**
 * Substitutions that make a documented runnable command run on the fixture,
 * and the input paths it needs. Returns null argv when an input is missing.
 */
export function substitute(c, cwd) {
  const argv = [];
  const notes = [];
  const flat = c.argv.filter((t) => t !== "[" && t !== "]").map((t) => t.replace(/^\[/, "").replace(/\]$/, ""));
  for (let i = 0; i < flat.length; i++) {
    const t = flat[i];
    const next = flat[i + 1];
    if (t === "--base" && /^(origin\/)?main$/.test(next ?? "")) { argv.push(t, "HEAD"); notes.push(`--base ${next} -> HEAD`); i++; continue; }
    if ((t === "--repo" || t === "-r") && next && next !== "." && !existsSync(join(cwd, next))) { argv.push(t, "."); notes.push(`--repo ${next} -> .`); i++; continue; }
    argv.push(t);
  }
  // Inputs that must exist.
  const missing = [];
  for (const f of c.flags) {
    if (!f.value) continue;
    const input = INPUT_FLAGS.has(f.name) || (c.sub === "fix" && (f.name === "-o" || f.name === "--input"))
      || (f.name === "--license-policy" && !LICENSE_PRESETS.has(f.value));
    if (input && !existsSync(join(cwd, f.value))) missing.push(f.value);
  }
  if (["agents", "deps"].includes(c.sub) || (c.sub === "evidence" || c.sub === "rules") && c.action === "verify") {
    for (const p of c.positionals) if (!existsSync(join(cwd, p))) missing.push(p);
  }
  return { argv, notes, missing };
}

// ── Run ──────────────────────────────────────────────────────────────────────

function makeWorkspace(base) {
  const dir = mkdtempSync(join(base, "ws-"));
  cpSync(FIXTURE, dir, { recursive: true });
  const env = gitEnv();
  for (const a of [["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "fixture", "--no-verify"]]) {
    const r = spawnSync("git", a, { cwd: dir, env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
  }
  return dir;
}

function gitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Penthera Docs", GIT_AUTHOR_EMAIL: "docs@example.com",
    GIT_COMMITTER_NAME: "Penthera Docs", GIT_COMMITTER_EMAIL: "docs@example.com",
  };
}

function runEnv(home, guardLog) {
  return {
    ...gitEnv(),
    HOME: home, USERPROFILE: home, PENTHERA_HOME: join(home, ".penthera"),
    NO_COLOR: "1",
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require "${NET_GUARD.replace(/\\/g, "/")}"`.trim(),
    PENTHERA_NET_GUARD_LOG: guardLog,
    npm_config_update_notifier: "false",
  };
}

function runOne(bin, argv, { cwd, env }) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [bin, ...argv], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", (status, signal) => { clearTimeout(timer); resolveRun({ status, signal, out: out.replace(ANSI, "") }); });
  });
}

/**
 * Extract, classify, parse-check and (unless run: false) run every command.
 * @returns {Promise<{results: object[], failures: object[]}>}
 */
export async function checkDocs({ bin = join(ROOT, "bin", "penthera.js"), run = true, root = ROOT, concurrency } = {}) {
  const helpCache = new Map();
  const help = (argv) => {
    const k = argv.join(" ");
    if (!helpCache.has(k)) {
      const r = spawnSync(process.execPath, [bin, ...argv], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
      if (r.status !== 0) throw new Error(`penthera ${k} exited ${r.status}: ${r.stderr}`);
      helpCache.set(k, r.stdout);
    }
    return helpCache.get(k);
  };
  const model = helpModel(help);

  const results = [];
  for (const file of docFiles(root)) {
    for (const cmd of extractDocCommands(readFileSync(join(root, file), "utf8"), file)) {
      for (const part of splitCommands(stripComment(cmd.text))) {
        const base = { file, line: cmd.line, source: cmd.source, text: part.text };
        const p = parsePenthera(part.tokens);
        if (!p) {
          if (cmd.source === "inline") continue; // "penthera … | jq": only the penthera part is ours
          const prev = results.at(-1);
          if (part.pipedFrom && prev?.file === file && prev.line === cmd.line) { prev.text += ` | ${part.text}`; continue; }
          results.push({ ...base, kind: "other", reason: otherReason(part.tokens), problems: [] });
          continue;
        }
        const c = classify(p.argv, model, { file });
        if (p.env.length && c.kind === "runnable") { c.kind = "placeholder"; c.reason = `needs ${p.env.join(" ")}`; }
        results.push({ ...base, ...c, argv: p.argv });
      }
    }
  }

  if (run) await runRunnables(results, { bin, concurrency });
  const failures = results.filter((r) => r.problems.length && r.kind !== "planned" || r.run?.ok === false);
  return { results, failures, model };
}

async function runRunnables(results, { bin, concurrency = Math.max(2, Math.min(4, availableParallelism())) }) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "penthera-docs-")));
  const guardLog = join(tmp, "net-guard.log");
  // One workspace (and HOME) per doc file, commands in document order: a
  // `--cra-init cra.json` earlier in the file makes `--cra cra.json` runnable.
  const byFile = new Map();
  for (const r of results) if (r.kind === "runnable") byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  const seen = new Map(); // identical inline mentions run once
  const queue = [...byFile.entries()];
  async function worker() {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [file, cmds] = next;
      const cwd = makeWorkspace(tmp);
      const home = mkdtempSync(join(tmp, "home-"));
      const env = runEnv(home, guardLog);
      for (const r of cmds) {
        const s = substitute(r, cwd);
        if (s.missing.length) {
          r.kind = "placeholder";
          r.reason = `needs ${s.missing.join(", ")}, which the fixture does not have`;
          continue;
        }
        const key = `${file}\0${s.argv.join("\0")}`;
        if (r.source === "inline" && seen.has(key)) { r.run = seen.get(key); r.notes = s.notes; continue; }
        const before = existsSync(guardLog) ? readFileSync(guardLog, "utf8") : "";
        const out = await runOne(bin, s.argv, { cwd, env });
        const after = existsSync(guardLog) ? readFileSync(guardLog, "utf8") : "";
        const net = after.slice(before.length).trim();
        const ok = (out.status === 0 || out.status === 1) && !net;
        r.run = { ok, status: out.status, net, tail: ok ? "" : out.out.trim().split("\n").slice(-15).join("\n") };
        r.notes = s.notes;
        seen.set(key, r.run);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  rmSync(tmp, { recursive: true, force: true });
}

function otherReason(tokens) {
  const t = tokens.join(" ");
  if (/^npx skills add/.test(t)) return "external: installs the skill from GitHub";
  if (/^curl\b/.test(t) || /^wget\b/.test(t)) return "external: downloads over HTTPS";
  if (/^bash\b/.test(t) && /install\.sh/.test(t)) return "external: the installer downloads the skill";
  if (/^git (push|fetch|pull|clone)/.test(t)) return "external: git network operation";
  if (/^npm (publish|install|i|ci)\b/.test(t) || /^npm run (refresh)/.test(t)) return "external: npm registry";
  if (/^\/plugin\b/.test(t)) return "a Claude Code slash command, not a shell command";
  if (/^ssh-keygen\b/.test(t)) return "needs your SSH key";
  if (/^node (bin|scripts)\//.test(t) || /^npm run\b/.test(t) || /^bash (skills|scripts)\//.test(t)) return "runs from a Penthera checkout (covered by CI and npm test)";
  return `not a Penthera command (${tokens[0]})`;
}

// ── Report ───────────────────────────────────────────────────────────────────

const cell = mdCell;
const code = (s) => "`" + cell(String(s).replace(/`/g, "'")) + "`";

export function report({ results, failures }) {
  const count = (k) => results.filter((r) => r.kind === k).length;
  const ran = results.filter((r) => r.run);
  const lines = [
    "## Documented commands",
    "",
    `${results.length} commands in ${new Set(results.map((r) => r.file)).size} files: ` +
      `${ran.length} ran (${ran.filter((r) => r.run.ok).length} passed), ` +
      `${count("placeholder")} placeholder (flags checked against --help), ` +
      `${count("external")} external (flags checked, not run), ${count("other")} other (not Penthera), ` +
      `${count("planned")} planned. **${failures.length} failure(s).**`,
    "",
  ];
  if (failures.length) {
    lines.push("### Failures", "", "| where | command | problem |", "|---|---|---|");
    for (const f of failures) {
      const why = [...f.problems, ...(f.run && !f.run.ok ? [`exit ${f.run.status}${f.run.net ? `; network: ${f.run.net}` : ""}`] : [])].join("; ");
      lines.push(`| ${f.file}:${f.line} | ${code(f.text)} | ${cell(why)} |`);
    }
    lines.push("");
  }
  // Group the rest by kind and reason, so the report stays short.
  for (const kind of ["external", "other", "placeholder", "planned"]) {
    const rows = results.filter((r) => r.kind === kind);
    if (!rows.length) continue;
    const byReason = new Map();
    for (const r of rows) byReason.set(r.reason, [...(byReason.get(r.reason) ?? []), r]);
    lines.push(`### ${kind[0].toUpperCase()}${kind.slice(1)} (${rows.length})`, "", "| reason | n | example |", "|---|---|---|");
    for (const [reason, rs] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`| ${cell(reason)} | ${rs.length} | ${code(rs[0].text)} (${rs[0].file}:${rs[0].line}) |`);
    }
    lines.push("");
  }
  if (ran.length) {
    const uniq = new Map();
    for (const r of ran) uniq.set(r.text, r);
    lines.push(`### Ran (${ran.length}, ${uniq.size} distinct)`, "", "<details><summary>commands</summary>", "");
    for (const [text, r] of uniq) lines.push(`- ${r.run.ok ? "✅" : "❌"} ${code(text)}${r.notes?.length ? ` (${r.notes.join(", ")})` : ""} exit ${r.run.status}`);
    lines.push("", "</details>", "");
  }
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { values: o } = parseArgs({ options: {
    bin: { type: "string" }, report: { type: "string" }, json: { type: "boolean", default: false },
    "no-run": { type: "boolean", default: false },
  } });
  const res = await checkDocs({ bin: o.bin ? resolve(o.bin) : undefined, run: !o["no-run"] });
  const md = report(res);
  if (o.report) writeFileSync(o.report, md + "\n", { flag: o.report === process.env.GITHUB_STEP_SUMMARY ? "a" : "w" });
  if (o.json) console.log(JSON.stringify(res.results, null, 2));
  else console.log(md);
  for (const f of res.failures) {
    console.error(`FAIL ${f.file}:${f.line}  ${f.text}\n     ${[...f.problems, ...(f.run && !f.run.ok ? [`exit ${f.run.status}`] : [])].join("; ")}`);
    if (f.run?.tail) console.error(f.run.tail.split("\n").map((l) => `     | ${l}`).join("\n"));
  }
  process.exit(res.failures.length ? 1 : 0);
}
