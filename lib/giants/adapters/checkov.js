/**
 * Checkov (Apache-2.0): infrastructure-as-code misconfigurations (Terraform,
 * Dockerfiles, Kubernetes, CloudFormation and more).
 *
 * --skip-download keeps it from fetching guidelines from Prisma Cloud. Its
 * JSON report is read, not SARIF, because the merge key needs the resource
 * name, which SARIF leaves out. It runs from a temp folder, never from the
 * scanned repository, so a `.checkov.yaml` in the repository (which can load
 * Python checks from a folder) is not picked up.
 */
import { clean, lineOf, makeFinding, relPath, severityFromWord, where } from "../finding.js";

export default {
  id: "checkov",
  area: "infrastructure",
  mode: "repo",
  licence: "Apache-2.0",
  homepage: "https://github.com/bridgecrewio/checkov",
  minVersion: "3.0.0",
  tested: ["3.3.30"],
  bins: ["checkov"],
  versionArgs: ["--version"],
  network: "none",
  install: { darwin: "pipx install checkov", linux: "pipx install checkov", other: "pipx install checkov" },
  // The open-source output has no severity (it needs a Prisma Cloud key): medium.
  severity: "medium",

  command({ root, tmp }) {
    return {
      args: ["-d", root, "--output", "json", "--output-file-path", `${tmp}/checkov`, "--skip-download", "--quiet"],
      output: `${tmp}/checkov/results_json.json`,
      // With nothing to scan, Checkov writes no file and prints nothing useful.
      optionalOutput: true,
    };
  },
  // 0: all passed; 1: failed checks.
  exitOk: (code) => code === 0 || code === 1,

  parse(text, { root, tool }) {
    if (!String(text).trim()) return [];
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
    const reports = Array.isArray(doc) ? doc : [doc];
    const out = [];
    for (const rep of reports) {
      if (!rep || typeof rep !== "object") throw new Error("a report entry is not an object");
      for (const c of rep.results?.failed_checks || []) {
        const file = relPath(root, c.file_abs_path || c.repo_file_path || c.file_path);
        const line = lineOf(c.file_line_range?.[0]);
        const secret = rep.check_type === "secrets";
        out.push(makeFinding({
          tool, ruleId: c.check_id, ruleUrl: c.guideline || null,
          category: secret ? "secret" : "infra-misconfig",
          severity: severityFromWord(c.severity) || this.severity,
          title: `${clean(c.check_name || c.check_id, 140)} in ${where(file, line)}${c.resource ? ` (${clean(c.resource, 80)})` : ""}`,
          description: `${c.check_id}: ${clean(c.check_name, 300)}${c.resource ? ` (resource \`${clean(c.resource, 200)}\`)` : ""}.`,
          file, line,
          key: secret ? { secretHashes: [] } : { resource: c.resource || null, checkIds: [c.check_id, c.bc_check_id].filter(Boolean) },
        }));
      }
    }
    return out;
  },
};
