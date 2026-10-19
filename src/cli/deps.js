/**
 * `penthera deps [path]`: CLI runner for the dependency capability scan.
 */
import { resolve } from "node:path";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { mergeResults } from "./merge-results.js";
import { buildActionPlan } from "../../lib/remediation/index.js";
import { printReport, printFindings, writeJsonReport, writeSarifReport, createProgress, printError } from "../reporter.js";
import { writeMarkdownReport, markdownPathFromJson } from "../report/markdown.js";

export const DEPS_FLAGS = ["diff", "base", "online", "pr-comment", "prod", "license-policy"];

/**
 * The license policy for this run: `--license-policy <preset|file>`, else the
 * `licenses` section of penthera.policy.json, else none.
 */
async function resolveLicensePolicy(root, flag) {
  const { normalizeLicensePolicy, LICENSE_PRESETS } = await import("../../lib/deps/license.js");
  if (flag) {
    if (LICENSE_PRESETS[flag]) return normalizeLicensePolicy({ preset: flag }, "--license-policy");
    const path = resolve(flag);
    if (!existsSync(path)) throw new Error(`--license-policy: "${flag}" is neither a preset (${Object.keys(LICENSE_PRESETS).join(", ")}) nor a file`);
    let raw;
    try { raw = JSON.parse(readFileSync(path, "utf-8")); } catch (e) { throw new Error(`${flag}: ${e.message}`); }
    return normalizeLicensePolicy(raw && typeof raw === "object" && "licenses" in raw ? raw.licenses : raw, `${flag}: licenses`);
  }
  const { loadPolicy } = await import("../../lib/install/policy.js");
  return loadPolicy(root).policy.licenses;
}

export async function runDeps(args, opts, { version }) {
  if (args.length > 1) {
    printError(`deps takes one path, got: ${args.join(" ")}`);
    process.exit(2);
  }
  if (opts.diff && opts.base) {
    printError("Use --diff <lockfile|dir> or --base <git-ref>, not both.");
    process.exit(2);
  }
  const root = resolve(args[0] || ".");
  if (!existsSync(root)) {
    printError(`Path not found: ${root}`);
    process.exit(2);
  }
  const quiet = opts.quiet || opts.json;
  if (opts.online && !quiet) {
    process.stderr.write("\n  \x1b[33mNOTE\x1b[0m --online fetches public package metadata from the npm registry.\n" +
      "       This is the only network use in `penthera deps`; without it, nothing leaves this machine.\n\n");
  }

  const { scanDeps } = await import("../../lib/deps/index.js");
  let result;
  try {
    const licensePolicy = await resolveLicensePolicy(root, opts["license-policy"]);
    result = await scanDeps(root, {
      licensePolicy,
      diff: opts.diff || null,
      base: opts.base || null,
      online: !!opts.online,
      prod: !!opts.prod,
      onPhase: createProgress(quiet),
    });
  } catch (e) {
    printError(e.message);
    process.exit(2);
  }

  const merged = mergeResults([result]);
  merged.actionPlan = buildActionPlan(merged.findings);

  if (opts.json) console.log(JSON.stringify(merged, null, 2));
  else if (opts.quiet) printFindings(merged.findings);
  else printReport(merged, { verbose: opts.verbose });

  const footer = !opts["no-footer"];
  const mdOpts = { version, footer };
  const note = (s) => { if (!quiet) process.stderr.write(s); };
  if (opts.output) {
    writeJsonReport(merged, opts.output);
    const md = markdownPathFromJson(opts.output);
    writeMarkdownReport(merged, md, mdOpts);
    note(`  JSON report    ${opts.output}\n  Markdown report ${md}\n`);
  }
  if (opts.markdown) {
    writeMarkdownReport(merged, opts.markdown, mdOpts);
    note(`  Markdown report ${opts.markdown}\n`);
  }
  if (opts.sarif) {
    writeSarifReport(merged, opts.sarif);
    note(`  SARIF report   ${opts.sarif}\n`);
  }
  if (opts["pr-comment"]) {
    const { formatPrComment } = await import("../../lib/deps/report.js");
    const path = resolve(opts["pr-comment"]);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, formatPrComment(merged, { version, footer }));
    note(`  PR comment     ${opts["pr-comment"]}\n`);
  }
  if (opts.output || opts.markdown || opts.sarif || opts["pr-comment"]) note("\n");

  // exitCode, not exit(): large --json output to a pipe must drain first.
  const hasSevere = merged.findings.some((f) => f.severity === "critical" || f.severity === "high");
  process.exitCode = hasSevere ? 1 : 0;
}
