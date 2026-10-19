/**
 * --audience, --report-template and --evidence for the scan command. Kept out
 * of src/cli.js: prepareReportOptions() runs before the scan (so a bad
 * template or a non-empty evidence directory fails fast), customReport()
 * renders the chosen report, writeEvidence() writes the bundle.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { formatAudienceReport, AUDIENCES } from "../report/audience.js";
import { buildReportModel } from "../report/model.js";
import { parseTemplate, renderTemplate } from "../report/template.js";
import { formatMarkdownReport } from "../report/markdown.js";
import { formatSarif } from "../reporter.js";
import { formatReadinessMarkdown } from "../../lib/compliance/readiness.js";
import { writeEvidenceBundle, assertEmptyDir } from "../report/evidence.js";

/** Validate the report flags. Returns { template } or throws with a user-facing message. */
export function prepareReportOptions(opts) {
  if (opts.audience && !AUDIENCES.includes(opts.audience)) {
    throw new Error(`Unknown --audience "${opts.audience}". Use one of: ${AUDIENCES.join(", ")}.`);
  }
  if (opts.audience && opts["report-template"]) throw new Error("Use --audience or --report-template, not both.");
  if (opts["sign-key"] && !opts.evidence) throw new Error("--sign-key signs an evidence bundle; add --evidence <dir>.");
  if (opts["sign-key"] && !existsSync(resolve(opts["sign-key"]))) throw new Error(`--sign-key ${opts["sign-key"]} not found.`);
  if (opts.evidence) assertEmptyDir(resolve(opts.evidence));
  let template = null;
  if (opts["report-template"]) {
    const src = readFileSync(resolve(opts["report-template"]), "utf-8");
    template = parseTemplate(src); // throws TemplateError with a line number
  }
  return { template };
}

/** The --audience or --report-template report as Markdown, or null when neither is set. */
export function customReport(result, opts, { version, template }) {
  if (template) return renderTemplate(template, buildReportModel(result, { version }));
  if (opts.audience) return formatAudienceReport(result, opts.audience, { version });
  return null;
}

/**
 * Write the evidence bundle: JSON, Markdown, SARIF, the three audience reports,
 * the custom template report, readiness and SBOM when they were produced.
 */
export function writeEvidence(result, opts, { version, template, mdOpts, sbom, argv, now = new Date().toISOString() }) {
  const artifacts = [
    { path: "report.json", kind: "json", content: JSON.stringify(result, null, 2) + "\n" },
    { path: "report.md", kind: "markdown", content: formatMarkdownReport(result, mdOpts) },
    { path: "report.sarif", kind: "sarif", content: JSON.stringify(formatSarif(result), null, 2) + "\n" },
    ...AUDIENCES.map((a) => ({ path: `report-${a}.md`, kind: `audience:${a}`, content: formatAudienceReport(result, a, { version }) })),
  ];
  if (template) artifacts.push({ path: "report-custom.md", kind: "template", content: renderTemplate(template, buildReportModel(result, { version })) });
  if (result.readiness) artifacts.push({ path: "nis2-readiness.md", kind: "readiness", content: formatReadinessMarkdown(result.readiness) });
  if (sbom) artifacts.push({ path: "sbom.cdx.json", kind: "sbom", content: JSON.stringify(sbom, null, 2) + "\n" });

  return writeEvidenceBundle(opts.evidence, artifacts, {
    version,
    argv,
    target: result.target || "unknown",
    generatedAt: now,
    scan: {
      timestamp: result.timestamp || null,
      modes: result.modes || (result.mode ? [result.mode] : []),
      profile: result.profile || null,
      offline: Boolean(result.egress?.offline),
      findings: (result.findings || []).length,
      suppressed: (result.suppressed || []).length,
    },
    repo: opts.repo ? resolve(opts.repo) : null,
    signKey: opts["sign-key"] || null,
  });
}
