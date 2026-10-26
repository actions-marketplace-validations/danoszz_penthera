/**
 * Trivy (Apache-2.0): vulnerable dependencies and infrastructure-as-code
 * misconfigurations in the scanned folder (`trivy fs`).
 *
 * It reads the vulnerability database already in its cache and never updates
 * it (--skip-db-update, --skip-check-update). Without a cached database it is
 * skipped with the command that fills the cache, which you run yourself.
 *
 * The JSON report is read, not SARIF: Trivy's SARIF puts the package name
 * and version in free text, and the merge key needs them as fields.
 */
import { clean, lineOf, makeFinding, relPath, severityFromWord, where } from "../finding.js";
import { ecosystemOf, packageName } from "./osv-scanner.js";

// Trivy's package types as ecosystem names.
const TYPES = { npm: "npm", yarn: "npm", pnpm: "npm", bun: "npm", "node-pkg": "npm", pip: "pypi", pipenv: "pypi", poetry: "pypi", uv: "pypi", "python-pkg": "pypi", gomod: "go", gobinary: "go", cargo: "cargo", "rust-binary": "cargo", composer: "composer", bundler: "gem", gemspec: "gem", nuget: "nuget", "dotnet-core": "nuget", pom: "maven", gradle: "maven", jar: "maven" };

export default {
  id: "trivy",
  area: ["dependencies", "infrastructure"],
  mode: "repo",
  licence: "Apache-2.0",
  homepage: "https://github.com/aquasecurity/trivy",
  minVersion: "0.55.0",
  tested: ["0.76.1"],
  bins: ["trivy"],
  versionArgs: ["--version"],
  network: "none",
  keepHome: true,
  install: { darwin: "brew install trivy, then fill its database: trivy fs --download-db-only", linux: "See https://trivy.dev/latest/getting-started/installation/, then: trivy fs --download-db-only", other: "https://trivy.dev/latest/getting-started/installation/" },

  command({ root, tmp }) {
    const out = `${tmp}/trivy.json`;
    return {
      args: ["fs", "--skip-db-update", "--skip-check-update", "--skip-version-check", "--disable-telemetry", "--scanners", "vuln,misconfig", "--format", "json", "--output", out, "--quiet", root],
      output: out,
    };
  },
  exitOk: (code) => code === 0,

  skipReason(run) {
    if (/--skip-db-update cannot be specified on the first run|vulnerability database (?:is )?not found|DB not found|db\.Init|no such file.*trivy\.db/i.test(run.stderr)) {
      return "no cached vulnerability database; download it yourself with `trivy fs --download-db-only`";
    }
    return null;
  },

  parse(text, { root, tool }) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
    if (!doc || typeof doc !== "object" || (doc.Results != null && !Array.isArray(doc.Results))) throw new Error("no Results list");
    const out = [];
    for (const r of doc.Results || []) {
      const file = relPath(root, r.Target);
      for (const v of r.Vulnerabilities || []) {
        const ecosystem = ecosystemOf(TYPES[r.Type] || r.Type);
        const container = r.Class === "os-pkgs";
        const ids = [v.VulnerabilityID, ...(v.VendorIDs || [])].filter((x) => typeof x === "string");
        out.push(makeFinding({
          tool, ruleId: v.VulnerabilityID, ruleUrl: v.PrimaryURL || null,
          category: container ? "container-vuln" : "dependency-vuln",
          severity: severityFromWord(v.Severity) || "medium",
          title: `${v.PkgName}@${v.InstalledVersion}: ${clean(v.Title || v.VulnerabilityID, 140)} (${v.VulnerabilityID})`,
          description: `${v.PkgName} ${v.InstalledVersion} is affected by ${v.VulnerabilityID}${file ? `, from \`${file}\`` : ""}.${v.Description ? ` ${v.Description}` : ""}`,
          file,
          key: { ecosystem: container ? `os:${r.Type}` : ecosystem, pkg: packageName(ecosystem, v.PkgName), version: String(v.InstalledVersion || ""), advisories: [...new Set(ids)].sort(), cwe: v.CweIDs || [] },
          remediation: v.FixedVersion ? `Upgrade ${v.PkgName} to ${v.FixedVersion}.` : `No fixed version of ${v.PkgName} is listed yet.`,
        }));
      }
      for (const m of r.Misconfigurations || []) {
        if (m.Status && m.Status !== "FAIL") continue;
        const line = lineOf(m.CauseMetadata?.StartLine);
        const id = m.AVDID || m.ID;
        out.push(makeFinding({
          tool, ruleId: id, ruleUrl: m.PrimaryURL || null,
          category: "infra-misconfig",
          severity: severityFromWord(m.Severity) || "medium",
          title: `${clean(m.Title || id, 140)} in ${where(file, line)}${m.CauseMetadata?.Resource ? ` (${clean(m.CauseMetadata.Resource, 80)})` : ""}`,
          description: `${clean(m.Message || m.Description || m.Title, 1000)}${m.CauseMetadata?.Resource ? ` (resource \`${m.CauseMetadata.Resource}\`)` : ""}`,
          file, line,
          key: { resource: m.CauseMetadata?.Resource || null, checkIds: [m.ID, m.AVDID].filter(Boolean) },
          remediation: m.Resolution || null,
        }));
      }
    }
    return out;
  },
};
