/**
 * Scan repository source for hardcoded secrets.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { rulesOf, rulesGeneration, packMatch } from "../rules/index.js";

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

function walkFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, files);
    } else if (!SKIP_FILES.test(entry)) {
      const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
      if (SCAN_EXTENSIONS.has(ext) || entry.startsWith(".env")) files.push(full);
    }
  }
  return files;
}

export function maskMatch(match) {
  return match.length <= 8 ? "***" : match.slice(0, 4) + "…" + match.slice(-4);
}

/**
 * Find secrets in a string of text (a source file, a JS bundle, a config).
 * Returns one hit per rule: `{ name, severity, match }`, with the raw match so
 * callers decide how to mask it. At most one rule fires per provider key: once a
 * specific AI-provider rule matches a span, broader rules skip that span.
 */
export function findSecretsInText(content) {
  const hits = [];
  const claimed = [];
  for (const rule of secretPatterns()) {
    const match = rule.rule ? packMatch(rule.rule, content) : content.match(rule.pattern);
    if (!match) continue;
    // For assignment-style rules, test the placeholder/dummy filter against
    // the assigned value only (not the whole `key = "value"` match), so a
    // variable named e.g. `testToken` can't mask a real secret.
    const value = (match[0].match(/['"]([^'"]+)['"]/) || [, match[0]])[1];
    if (rule.skipIf && rule.skipIf.test(value)) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (claimed.some(([a, b]) => start < b && end > a)) continue;
    claimed.push([start, end]);
    hits.push({ name: rule.name, severity: rule.severity, match: match[0] });
  }
  return hits;
}

export function scanSecrets(repoPath) {
  const findings = [];

  for (const filePath of walkFiles(repoPath)) {
    let content;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const rel = relative(repoPath, filePath);

    for (const hit of findSecretsInText(content)) {
      findings.push({
        severity: hit.severity,
        title: `${hit.name} in source`,
        description: `Possible secret in \`${rel}\`: \`${maskMatch(hit.match)}\``,
        url: rel,
        category: "secrets",
        source: "secret-scan",
      });
    }
  }

  return findings;
}
