/**
 * Scan repository source for hardcoded secrets.
 */
import { readdirSync, lstatSync, existsSync, openSync, fstatSync, readSync, closeSync, constants } from "node:fs";
import { join, relative } from "node:path";
import { rulesOf, rulesGeneration, PACK_INPUT_CAP } from "../rules/index.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  "reports", ".security-results", "vendor",
]);

const SKIP_FILES = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|zip|tar|gz|pdf|lock)$/i;

// Values that clearly aren't real secrets: placeholders, redactions, and the
// dummy/probe credentials that security tooling (Penthera included) hardcodes
// to test login endpoints, e.g. `password: "invalid-password-12345"`. Matched
// against the assigned value only, with word boundaries so a real secret that
// merely contains one of these substrings isn't suppressed. A value that is
// only a template placeholder (`"${apiKey}"`, `"{{ api_key }}"`) holds no
// secret either: it is filled in at runtime.
const TEST_VALUE = /\b(?:placeholder|example|changeme|dummy|sample|redacted|invalid|fake|test|your)\b|xxx|\*{3,}|^\$\{[^}]+\}$|^\{\{[^}]+\}\}$/i;

const SECRET_PATTERNS = [
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/, severity: "critical" },
  { name: "GitHub token", pattern: /ghp_[a-zA-Z0-9]{36,}/, severity: "critical" },
  // AI provider keys. Vibecoded apps leak these more than any other credential,
  // often via a NEXT_PUBLIC_/VITE_ variable or a committed notebook. Specific
  // prefixes come first so a key is reported under its real provider. They
  // live in the bundled core rule pack (lib/rules/core/secrets.json).
  ...coreSecrets(),
  { name: "Stripe secret key", pattern: /sk_live_[a-zA-Z0-9]{20,}/, severity: "critical" },
  {
    name: "Generic API key assignment",
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
    severity: "high",
    skipIf: TEST_VALUE,
  },
  {
    name: "Hardcoded password",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/i,
    severity: "high",
    skipIf: TEST_VALUE,
  },
  { name: "GCP/Firebase service account", pattern: /"private_key"\s*:\s*"-----BEGIN/, severity: "critical" },
  { name: "Private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, severity: "critical" },
  {
    name: "JWT secret assignment",
    pattern: /(?:jwt[_-]?secret|session[_-]?secret)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
    severity: "high",
    skipIf: TEST_VALUE,
  },
  {
    // express-session / cookie-session signing secret written into the
    // session(...) options as a string literal, also as the fallback after
    // `process.env.SESSION_SECRET ||`. Anyone with the repo can
    // sign session cookies. The lookbehind keeps the match (and so the value
    // the placeholder filter sees) to the `secret: '...'` part.
    name: "Hardcoded session secret",
    pattern: /(?<=\b(?:session|cookieSession|expressSession)\s*\(\s*\{[^}]{0,500}?)\bsecret\s*:\s*(?:process\.env\.\w+\s*(?:\|\||\?\?)\s*)?['"][^'"\n]{4,200}['"]/,
    severity: "high",
    skipIf: TEST_VALUE,
  },
];

function fromPack(r) {
  return { name: r.name, pattern: r.pattern, severity: r.severity, ...(r.skipPlaceholders ? { skipIf: TEST_VALUE } : {}), rule: r };
}

function coreSecrets() {
  return rulesOf("secret", { pack: "core" }).map(fromPack);
}

// Built-ins first, then rules from other packs (bundled or --rules), so a
// pack can add detections but never shadow or reorder the built-in ones.
let _patterns = null;
let _generation = -1;
function secretPatterns() {
  if (_generation !== rulesGeneration()) {
    _patterns = [...SECRET_PATTERNS, ...rulesOf("secret", { exceptPack: "core" }).map(fromPack)];
    _generation = rulesGeneration();
  }
  return _patterns;
}

/** The secret rules in effect, in match order (built-ins, then packs). */
export function activeSecretPatterns() {
  return secretPatterns().map(({ name, pattern, severity, skipIf, rule }) => ({ name, pattern, severity, skipIf: !!skipIf, pack: rule?.pack || null }));
}

const SCAN_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".java",
  ".env", ".yaml", ".yml", ".json", ".toml", ".cfg", ".ini", ".sh",
  ".ipynb", // notebooks are a classic place for a pasted provider key
  ".tf", ".tfvars", ".hcl", // Terraform and other HCL: keys and passwords end up inline
]);

/** Would the repo scan read this file? `relPath` uses forward slashes (git paths). */
export function isSecretScanTarget(relPath) {
  const parts = relPath.split("/");
  if (parts.slice(0, -1).some((d) => SKIP_DIRS.has(d))) return false;
  const entry = parts[parts.length - 1];
  if (SKIP_FILES.test(entry)) return false;
  const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
  return SCAN_EXTENSIONS.has(ext) || entry.startsWith(".env");
}

// A subfolder with its own `.git` (a nested repo, submodule or worktree, such
// as the ones coding agents create under .claude/worktrees) is a separate
// project: scanning it would report its secrets as this repo's. Scan it on its
// own instead. Symlinked folders are not followed, so a link cannot pull files
// from outside the repo into the scan or loop forever.
export function isNestedRepo(dir, root) {
  return dir !== root && existsSync(join(dir, ".git"));
}

// Per-file cap for the repo scan. Larger files are reported, not read.
export const MAX_SCAN_BYTES = 16 * 1024 * 1024;

// Regular files only: a FIFO, socket or device named `.env` would block the
// read (or never end), and a symlink could point outside the repo.
function walkFiles(dir, files = [], root = dir) {
  if (!existsSync(dir) || isNestedRepo(dir, root)) return files;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walkFiles(full, files, root);
    } else if (st.isFile() && !SKIP_FILES.test(entry)) {
      const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
      if (SCAN_EXTENSIONS.has(ext) || entry.startsWith(".env")) files.push(full);
    }
  }
  return files;
}

export function maskMatch(match) {
  return match.length <= 8 ? "***" : match.slice(0, 4) + "…" + match.slice(-4);
}

// A file can repeat one key shape thousands of times; past this many reported
// hits per rule the file is already flagged, so stop looking for more.
const MAX_HITS_PER_RULE = 50;

/** Every match of a rule. Pack rules added by path see at most PACK_INPUT_CAP chars, as with packMatch(). */
function* allMatches(rule, content) {
  if (rule.rule) {
    const input = rule.rule.origin === "bundled" || content.length <= PACK_INPUT_CAP ? content : content.slice(0, PACK_INPUT_CAP);
    rule.globalPattern ??= new RegExp(rule.rule.pattern.source, rule.rule.pattern.flags.replace(/[gy]/g, "") + "g");
    yield* input.matchAll(rule.globalPattern);
    return;
  }
  rule.globalPattern ??= new RegExp(rule.pattern.source, rule.pattern.flags.replace(/[gy]/g, "") + "g");
  yield* content.matchAll(rule.globalPattern);
}

/**
 * Find secrets in a string of text (a source file, a JS bundle, a config).
 * Returns every hit: `{ name, severity, match, index }`, with the raw match so
 * callers decide how to mask it. Placeholder values are skipped one match at a
 * time, so a placeholder never hides a real secret of the same rule later in
 * the text. At most one rule fires per span: once a specific AI-provider rule
 * matches a span, broader rules skip that span.
 */
export function findSecretsInText(content) {
  const hits = [];
  const claimed = [];
  for (const rule of secretPatterns()) {
    let found = 0;
    for (const match of allMatches(rule, content)) {
      // For assignment-style rules, test the placeholder/dummy filter against
      // the assigned value only (not the whole `key = "value"` match), so a
      // variable named e.g. `testToken` can't mask a real secret.
      const value = (match[0].match(/['"]([^'"]+)['"]/) || [, match[0]])[1];
      if (rule.skipIf && rule.skipIf.test(value)) continue;
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some(([a, b]) => start < b && end > a)) continue;
      claimed.push([start, end]);
      hits.push({ name: rule.name, severity: rule.severity, match: match[0], index: start });
      if (++found >= MAX_HITS_PER_RULE) break;
    }
  }
  return hits;
}

/** 1-based line number of a character offset. */
function lineAt(text, index) {
  let line = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) line++;
  return line;
}

/** A regular file's text, or null when it is not one (anymore) or is larger than `max` bytes. */
function readRegularFile(path, max) {
  let fd;
  try {
    // O_NONBLOCK: if the file was swapped for a FIFO after the walk, open must not wait for a writer.
    fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    if (st.size > max) return { tooLarge: st.size };
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n === 0) break;
      off += n;
    }
    return { text: buf.subarray(0, off).toString("utf-8") };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function scanSecrets(repoPath, { maxBytes = MAX_SCAN_BYTES } = {}) {
  const findings = [];

  for (const filePath of walkFiles(repoPath)) {
    const read = readRegularFile(filePath, maxBytes);
    if (!read) continue;

    const rel = relative(repoPath, filePath);

    if (read.tooLarge) {
      findings.push({
        severity: "info",
        title: "File too large to scan for secrets",
        description: `\`${rel}\` is ${read.tooLarge} bytes, over the ${maxBytes}-byte secret-scan limit, so it was not checked.`,
        url: rel,
        category: "secrets",
        source: "secret-scan",
      });
      continue;
    }

    // One finding per rule per file (the finding id is per rule and file);
    // the first real hit is the one shown.
    const seen = new Set();
    for (const hit of findSecretsInText(read.text)) {
      if (seen.has(hit.name)) continue;
      seen.add(hit.name);
      findings.push({
        severity: hit.severity,
        title: `${hit.name} in source`,
        description: `Possible secret in \`${rel}\`: \`${maskMatch(hit.match)}\``,
        url: rel,
        line: lineAt(read.text, hit.index),
        category: "secrets",
        source: "secret-scan",
      });
    }
  }

  return findings;
}
