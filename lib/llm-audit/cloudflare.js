/**
 * Read Cloudflare security-audit-skill findings.json into candidates.
 *
 * The file is untrusted input written by a model. It is checked against the
 * skill's own report schema (vendored unchanged from commit c1c8a8c, MIT: see
 * CLOUDFLARE-LICENSE) with a small validator for the keywords that schema
 * uses, plus the skill's cross-finding rules that matter here: unique
 * fingerprints and safe repository-relative paths. A file that fails is
 * refused whole, with the first errors; nothing is imported from it.
 *
 * Candidates keep the skill's verdict, but it never sets Penthera's
 * confidence: a `confirmed` verdict was confirmed by a model. Reproduction
 * payloads and fixed code are not copied.
 */
import { readFileSync } from "node:fs";
import { classify } from "./classes.js";

export const PRODUCER = "cloudflare-security-audit";
export const SCHEMA_PIN = "cloudflare/security-audit-skill@c1c8a8c";
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_FINDINGS = 2_000;
const MAX_ERRORS = 10;
const MAX_TEXT = 2_000;

let _schema = null;
export function cloudflareSchema() {
  _schema ??= JSON.parse(readFileSync(new URL("./cloudflare-report-schema.json", import.meta.url), "utf-8"));
  return _schema;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
// A visible character: anything but whitespace, controls and format characters.
const VISIBLE = /[^\s\p{Cc}\p{Cf}]/u;

function typeMatches(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === "number" && actual === "integer");
}

/** Validate `value` against the schema subset report-schema.json uses. Pushes "path: message" strings. */
export function validate(value, schema, path, errors) {
  if (errors.length >= MAX_ERRORS) return;
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => { const e = []; validate(value, s, path, e); return e; });
    const ok = results.filter((e) => e.length === 0).length;
    if (ok === 1) return;
    if (ok > 1) { errors.push(`${path}: matches more than one allowed shape`); return; }
    // Report the errors of the shape whose const discriminator matched, if any; else the shortest list.
    const best = results.reduce((a, b) => (b.length < a.length ? b : a));
    errors.push(...best.slice(0, MAX_ERRORS - errors.length));
    return;
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`);
    return;
  }
  if (hasOwn(schema, "const") && value !== schema.const) {
    errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
    return;
  }
  if (typeof value === "string") {
    if (schema.minLength && [...value].length < schema.minLength) errors.push(`${path}: must not be empty`);
    if (schema.visibleContent && !VISIBLE.test(value)) errors.push(`${path}: must contain a visible character`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number" && hasOwn(schema, "minimum") && value < schema.minimum) {
    errors.push(`${path}: must be at least ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const k = JSON.stringify(item);
        if (seen.has(k)) { errors.push(`${path}: items must be unique`); break; }
        seen.add(k);
      }
    }
    if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const k of schema.required || []) if (!hasOwn(value, k)) errors.push(`${path}: missing ${k}`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (hasOwn(props, k)) validate(v, props[k], `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected field ${k}`);
    }
  }
}

/** A repository-relative path with no way out of the repository. */
export function isSafeRelativePath(p) {
  if (typeof p !== "string" || !p || p.length > 1_024) return false;
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p) || p.includes("\0")) return false;
  return !p.split(/[\\/]/).some((seg) => seg === ".." || seg === "");
}

function crossChecks(list, errors) {
  const seen = new Map();
  list.forEach((f, i) => {
    if (errors.length >= MAX_ERRORS) return;
    if (seen.has(f.fingerprint)) errors.push(`$[${i}].fingerprint: duplicate of $[${seen.get(f.fingerprint)}]`);
    else seen.set(f.fingerprint, i);
    for (const field of ["trace", "evidence"]) {
      (f[field] || []).forEach((e, j) => {
        if (!isSafeRelativePath(e.file)) errors.push(`$[${i}].${field}[${j}].file: must be a safe repository-relative path`);
      });
    }
  });
}

/**
 * Parse and validate a findings.json text.
 * @returns {{ ok: true, candidates: object[], rejected: number } | { ok: false, errors: string[] }}
 */
export function parseCloudflareFindings(text) {
  if (Buffer.byteLength(text, "utf-8") > MAX_INPUT_BYTES) return { ok: false, errors: [`file is larger than ${MAX_INPUT_BYTES} bytes`] };
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not valid JSON: ${e.message}`] };
  }
  if (Array.isArray(data) && data.length > MAX_FINDINGS) return { ok: false, errors: [`more than ${MAX_FINDINGS} findings`] };
  const errors = [];
  validate(data, cloudflareSchema(), "$", errors);
  if (!errors.length) crossChecks(data, errors);
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  const candidates = [];
  let rejected = 0;
  for (const f of data) {
    if (f.verdict === "rejected") { rejected++; continue; }
    candidates.push(toCandidate(f));
  }
  return { ok: true, candidates, rejected };
}

const SEVERITY = { informational: "info", low: "low", medium: "medium", high: "high", critical: "critical" };
const clip = (s) => (typeof s === "string" && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…" : s);

/** One skill finding as a Penthera candidate: where it points, what it claims, and who said so. */
export function toCandidate(f) {
  const rootCause = f.root_cause || f.claimed_root_cause || "";
  const cls = classify(f.title, f.description, rootCause);
  const sink = [...f.trace].reverse().find((t) => t.kind === "sink") || f.trace[f.trace.length - 1];
  const severity = SEVERITY[f.severity?.overall_severity] || SEVERITY[f.severity?.impact?.score] || null;
  return {
    fingerprint: f.fingerprint,
    title: clip(f.title),
    description: clip(f.description),
    rootCause: clip(rootCause),
    class: cls.id,
    classLabel: cls.label,
    classSource: "inferred from the finding's text",
    file: sink.file,
    line: sink.line,
    trace: f.trace.map((t) => ({ kind: t.kind, file: t.file, line: t.line })),
    severity,
    origin: { producer: PRODUCER, schema: SCHEMA_PIN, verdict: f.verdict, confidence: f.confidence?.score || null },
  };
}
