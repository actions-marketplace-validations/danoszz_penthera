/**
 * Penthera's findings as seeds for an AI audit: written in Cloudflare
 * security-audit-skill's findings.json schema, so an agent running the skill
 * starts from what rules already found and spends its budget where they
 * cannot look.
 *
 * Every entry is `needs_validation`: the schema's `confirmed` shape requires an
 * executed reproduction, which a rule finding does not have. Only findings
 * that point at a file in the repository are exported (a URL scan's findings
 * have no source location). Lines come from the finding, or are found again
 * in the file with the same rule; when neither works the entry says the line
 * is not known and points at line 1. The output is checked against the
 * vendored schema before it is returned, so Penthera never writes a file the
 * skill would refuse.
 */
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { findingId } from "../memory/views.js";
import { findSecretsInText } from "../whitebox/secrets.js";
import { cloudflareSchema, isSafeRelativePath, validate } from "./cloudflare.js";
import { CLASSES } from "./classes.js";

const MAX_READ_BYTES = 4 * 1024 * 1024;
const AGENTS_CATEGORY = "agent-config"; // lib/agents/index.js

// The risky-pattern tests from lib/attack-surface.js, to find the line again.
const PATTERN_LINES = {
  "error-leak": /err\.message|error\.message/,
  "cors-wildcard": /origin\s*\|\|\s*"\*"/,
  "json-parse-unguarded": /JSON\.parse/,
  eval: /eval\s*\(/,
  innerHTML: /innerHTML/,
  "command-injection": /exec\s*\(|spawn\s*\(|execSync/,
};

const norm = (p) => String(p || "").split("\\").join("/").replace(/^\.\//, "");

function readInside(root, file) {
  let fd;
  try {
    const real = realpathSync(join(root, file));
    const rel = relative(root, real);
    if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return null;
    fd = openSync(real, constants.O_RDONLY | (constants.O_NONBLOCK || 0));
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > MAX_READ_BYTES) return null;
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n === 0) break;
      off += n;
    }
    return buf.subarray(0, off).toString("utf-8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** The finding's source file, repo-relative, or null when it has none. */
function fileOf(f) {
  if (f.category === "code-pattern") return f.file ? norm(f.file) : null;
  if (!f.url || /^[a-z][a-z0-9+.-]*:\/\//i.test(f.url)) return null;
  return norm(f.url);
}

/** The line a finding points at: its own, or found again in the file. */
function lineOf(root, f, file) {
  if (Number.isInteger(f.line) && f.line > 0) return { line: f.line, known: true };
  const fromText = /\(line (\d+)\)/.exec(f.description || "");
  if (fromText) return { line: Number(fromText[1]), known: true };
  const text = readInside(root, file);
  if (text !== null) {
    if (f.category === "secrets") {
      const name = String(f.title || "").replace(/ in source$/, "");
      const hit = findSecretsInText(text).find((h) => h.name === name);
      if (hit) return { line: lineAt(text, hit.index), known: true };
    }
    const re = f.category === "code-pattern" && PATTERN_LINES[f.pattern];
    if (re) {
      const m = re.exec(text);
      if (m) return { line: lineAt(text, m.index), known: true };
    }
  }
  return { line: 1, known: false };
}

/**
 * The class a rule finding belongs to, named in the seed's root cause so the
 * skill, and `penthera verify` on the way back, read the same class.
 */
function classOf(f) {
  const id = f.category === "secrets" ? "hardcoded-secret"
    : f.category === "code-pattern" ? CLASSES.find((c) => c.rule?.patterns?.includes(f.pattern))?.id
    : f.category === AGENTS_CATEGORY ? "agent-config"
    : null;
  return CLASSES.find((c) => c.id === id) || null;
}

const visible = (s, fallback) => (typeof s === "string" && /[^\s\p{Cc}\p{Cf}]/u.test(s) ? s : fallback);

/**
 * @param {object} result - a merged Penthera scan result
 * @param {string} repoPath - the repository the findings are about
 * @returns {{ findings: object[], exported: number, skipped: number }}
 */
export function toSecurityAuditFindings(result, repoPath) {
  const root = realpathSync(repoPath);
  const out = [];
  let skipped = 0;
  const seen = new Set();
  for (const f of result.findings || []) {
    if (f.severity === "info" || f.modelProposed) { skipped++; continue; }
    const file = fileOf(f);
    if (!file || !isSafeRelativePath(file)) { skipped++; continue; }
    const fingerprint = `penthera:${findingId(f)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const { line, known } = lineOf(root, f, file);
    const where = known ? "" : " Penthera did not record a line; the finding is about the file.";
    const rule = f.templateId || f.pattern || f.category || "rule";
    const cls = classOf(f);
    out.push({
      verdict: "needs_validation",
      fingerprint,
      title: visible(f.title, `Penthera ${f.category} finding`),
      description: visible(`${f.description || f.title}${where}`, f.title),
      claimed_root_cause: `${cls ? `${cls.label}. ` : ""}A deterministic Penthera rule (${rule}, ${f.category}) matched this location. Confidence: ${f.confidence || "likely"}.`,
      trace: [{ kind: "sink", file, line, scope: f.category || "file", description: `Matched by Penthera rule ${rule}.${where}` }],
      evidence: [{ file, line, description: visible(f.description, f.title) }],
      blockers: ["Found by a rule that reads code; not reproduced by running it. Check whether the condition is reachable and exploitable."],
      validation_plan: { local: "Confirm the condition at this location, then decide whether it is reachable from an entry point and what an attacker gains." },
    });
  }
  out.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));

  const errors = [];
  validate(out, cloudflareSchema(), "$", errors);
  if (errors.length) throw new Error(`Penthera produced findings the security-audit schema rejects: ${errors[0]}`);
  return { findings: out, exported: out.length, skipped };
}
