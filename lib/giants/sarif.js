/**
 * Reading another tool's SARIF 2.1.0 (gitleaks, Semgrep, CodeQL). A report
 * that does not have the shape is an error, so the tool's area is "failed",
 * never "clean".
 */
import { lineOf, relPath } from "./finding.js";

/** Parse and check the top level. Throws on anything that is not SARIF with runs. */
export function readSarif(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`not JSON: ${e.message}`);
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.runs)) throw new Error("not a SARIF report (no runs)");
  for (const run of doc.runs) {
    if (!run || typeof run !== "object" || (run.results != null && !Array.isArray(run.results))) throw new Error("not a SARIF report (a run without a results list)");
  }
  return doc;
}

/**
 * Each result with its rule and first location:
 * `{ ruleId, rule, level, message, file, line, startColumn, endColumn, result }`.
 */
export function sarifResults(doc, root) {
  const out = [];
  for (const run of doc.runs) {
    const rules = new Map();
    for (const r of run.tool?.driver?.rules || []) if (r && typeof r.id === "string") rules.set(r.id, r);
    for (const res of run.results || []) {
      if (!res || typeof res !== "object") continue;
      const ruleId = typeof res.ruleId === "string" ? res.ruleId : res.rule?.id || "unknown";
      const rule = rules.get(ruleId) || (Number.isInteger(res.ruleIndex) ? run.tool?.driver?.rules?.[res.ruleIndex] : null) || null;
      const loc = res.locations?.[0]?.physicalLocation || {};
      const region = loc.region || {};
      out.push({
        ruleId,
        rule,
        level: res.level || rule?.defaultConfiguration?.level || "warning",
        message: typeof res.message?.text === "string" ? res.message.text : "",
        file: relPath(root, loc.artifactLocation?.uri),
        line: lineOf(region.startLine),
        startColumn: lineOf(region.startColumn),
        endColumn: lineOf(region.endColumn),
        result: res,
      });
    }
  }
  return out;
}

/** CWE ids (`CWE-79`) named in a rule's tags or properties. */
export function cwesOf(...values) {
  const out = new Set();
  const visit = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(visit); return; }
    for (const m of String(v).matchAll(/\bCWE-(\d{1,5})\b/gi)) out.add(`CWE-${Number(m[1])}`);
  };
  values.forEach(visit);
  return [...out].sort();
}
