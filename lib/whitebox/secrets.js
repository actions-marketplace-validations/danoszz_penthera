/**
 * Scan repository source for hardcoded secrets.
 */
import { readdirSync, lstatSync, existsSync, openSync, fstatSync, readSync, closeSync, constants } from "node:fs";
import { join, relative } from "node:path";
import { rulesOf, rulesGeneration, PACK_INPUT_CAP } from "../rules/index.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  "reports", ".security-results", "vendor",
  // Python: virtualenvs and tool caches hold third-party code (Pillow's
  // ImageFont.py matches the AWS key shape), not this project's secrets.
  "venv", ".venv", "site-packages", "__pycache__", ".tox", ".nox",
  ".mypy_cache", ".pytest_cache", ".ruff_cache",
  // Note vaults: plugin bundles and caches, not source.
  ".obsidian",
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

/** Does the repo scan skip every folder with this name? */
export function isSecretSkipDir(name) {
  return SKIP_DIRS.has(name);
}

/** Would the repo scan read this file? `relPath` uses forward slashes (git paths). */
export function isSecretScanTarget(relPath) {
  const parts = relPath.split("/");
  if (parts.slice(0, -1).some((d) => SKIP_DIRS.has(d))) return false;
  return wantsFile(parts[parts.length - 1]);
}

function wantsFile(entry) {
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

// A virtualenv under any name (`env`, `.py311`, ...) is marked by pyvenv.cfg.
export function isVirtualenv(dir) {
  return existsSync(join(dir, "pyvenv.cfg"));
}

// Per-file cap for the repo scan. Larger files are reported, not read; files
// under it are read in chunks of SCAN_CHUNK_BYTES, so a big file is still
// scanned without being held in memory whole.
export const MAX_SCAN_BYTES = 512 * 1024 * 1024;
const SCAN_CHUNK_BYTES = 8 * 1024 * 1024;
// Chunks overlap by this much so a secret on a chunk boundary is still matched
// whole; it is longer than any single-line secret the rules match.
const CHUNK_OVERLAP = 4096;

// Regular files only: a FIFO, socket or device named `.env` would block the
// read (or never end), and a symlink could point outside the repo. The name is
// checked before the entry is stat'ed, and an entry that vanishes between the
// listing and the stat (a SQLite -wal file, an editor swap file, build output
// written while the scan runs) is skipped: the scan must not stop on it.
function walkFiles(dir, files = [], root = dir, skipDir = () => false) {
  if (!existsSync(dir) || isNestedRepo(dir, root) || (dir !== root && (isVirtualenv(dir) || skipDir(dir)))) return files;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    // Dirent types come from the listing, so most files are filtered without a stat.
    if (e.isFile() && !wantsFile(e.name)) continue;
    const full = join(dir, e.name);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walkFiles(full, files, root, skipDir);
    } else if (st.isFile() && wantsFile(e.name)) {
      files.push(full);
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

// A long unbroken run of base64 (an inlined image, font or model file) holds
// key-shaped substrings by chance: `AIza...` and `AKIA...` turn up in image
// data. Real secrets sit between quotes or delimiters, never mid-run, so runs
// this long are blanked before matching. Blanking keeps the length, so match
// indexes (and the line numbers callers derive from them) do not move. The
// lookbehind starts a match only at the start of a run, which keeps the regex
// linear on text made of many runs just under the threshold.
const ENCODED_BLOB = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{512,}={0,2}/g;

export function maskEncodedBlobs(text) {
  return text.replace(ENCODED_BLOB, (m) => " ".repeat(m.length));
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
  content = maskEncodedBlobs(content);
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

/**
 * Open a regular file for reading, or null when it is not one (anymore): it
 * vanished, or was swapped for a FIFO, device or symlink after the walk.
 * O_NONBLOCK: a FIFO must not make open wait for a writer. O_NOFOLLOW: never
 * read through a symlink.
 */
function openRegularFile(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0));
    const st = fstatSync(fd);
    if (!st.isFile()) { closeSync(fd); return null; }
    return { fd, size: st.size };
  } catch {
    if (fd !== undefined) closeSync(fd);
    return null;
  }
}

function countNewlines(buf, end) {
  let n = 0;
  for (let i = buf.indexOf(10); i !== -1 && i < end; i = buf.indexOf(10, i + 1)) n++;
  return n;
}

/**
 * The file's text in overlapping chunks: `{ text, linesBefore }`, where
 * linesBefore is the number of lines that end before the chunk starts, so a
 * hit at `index` is on line `linesBefore + lineAt(text, index)`.
 */
function* readChunks(fd, size, chunk = SCAN_CHUNK_BYTES) {
  let start = 0;
  let linesBefore = 0;
  while (start < size) {
    const len = Math.min(size - start, chunk);
    const buf = Buffer.alloc(len);
    let off = 0;
    while (off < len) {
      const n = readSync(fd, buf, off, len - off, start + off);
      if (n === 0) break;
      off += n;
    }
    yield { text: buf.subarray(0, off).toString("utf-8"), linesBefore };
    if (off < len || start + len >= size) return;
    // The next chunk starts CHUNK_OVERLAP bytes back, unless the chunk is no
    // longer than the overlap (tiny test chunks); then it starts where this one ended.
    const step = len > CHUNK_OVERLAP ? len - CHUNK_OVERLAP : len;
    linesBefore += countNewlines(buf, step);
    start += step;
  }
}

// An ignored file never reaches a commit, so a key in it is a local dev
// secret (the usual `.env`), not a leak. It is still reported, at this
// severity, so a key that is shared some other way is not invisible.
const LOCAL_ONLY_SEVERITY = "low";

/**
 * Scan a repository's files for secrets. `ignored` is what git ignores under
 * `repoPath` (gitIgnored() in lib/git.js): ignored folders are skipped and a
 * hit in an ignored file is reported as local only. It is passed in rather
 * than looked up here so this module never runs git (the site bundles it).
 */
export function scanSecrets(repoPath, { maxBytes = MAX_SCAN_BYTES, chunkBytes = SCAN_CHUNK_BYTES, ignored = null } = {}) {
  const findings = [];
  const skipDir = ignored ? (dir) => ignored.dirs.has(dir) : undefined;

  for (const filePath of walkFiles(repoPath, [], repoPath, skipDir)) {
    const file = openRegularFile(filePath);
    if (!file) continue;

    const rel = relative(repoPath, filePath);
    const localOnly = !!ignored && ignored.files.has(filePath);

    try {
      if (file.size > maxBytes) {
        findings.push({
          severity: "info",
          title: "File too large to scan for secrets",
          description: `\`${rel}\` is ${file.size} bytes, over the ${maxBytes}-byte secret-scan limit, so it was not checked.`,
          url: rel,
          category: "secrets",
          source: "secret-scan",
        });
        continue;
      }

      // One finding per rule per file (the finding id is per rule and file);
      // the first real hit is the one shown. A hit in the overlap of two
      // chunks is seen twice and reported once.
      const seen = new Set();
      for (const { text, linesBefore } of readChunks(file.fd, file.size, chunkBytes)) {
        for (const hit of findSecretsInText(text)) {
          if (seen.has(hit.name)) continue;
          seen.add(hit.name);
          findings.push({
            severity: localOnly ? LOCAL_ONLY_SEVERITY : hit.severity,
            title: `${hit.name} in source`,
            description: localOnly
              ? `Possible secret in \`${rel}\`: \`${maskMatch(hit.match)}\`. The file is ignored by git, so it is not committed; it is reported at ${LOCAL_ONLY_SEVERITY} instead of ${hit.severity}. Rotate the key if this file was ever shared.`
              : `Possible secret in \`${rel}\`: \`${maskMatch(hit.match)}\``,
            url: rel,
            line: linesBefore + lineAt(text, hit.index),
            category: "secrets",
            source: "secret-scan",
            ...(localOnly ? { localOnly: true } : {}),
          });
        }
      }
    } finally {
      closeSync(file.fd);
    }
  }

  return findings;
}
