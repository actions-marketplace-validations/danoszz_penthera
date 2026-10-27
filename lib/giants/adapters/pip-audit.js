/**
 * pip-audit (Apache-2.0): known vulnerabilities in pinned Python
 * requirements. It always asks a service (PyPI or OSV), so it runs only with
 * --giants-online.
 *
 * It runs with --no-deps --disable-pip: it audits the pins as written and
 * never pip-installs the project's requirements, which would run their build
 * scripts.
 */
import { readdirSync } from "node:fs";
import { makeFinding } from "../finding.js";
import { packageName } from "./osv-scanner.js";

/** requirements*.txt at the root of the scanned folder, sorted. */
export function requirementFiles(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isFile() && /^requirements[\w.-]*\.txt$/i.test(e.name))
      .map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export default {
  id: "pip-audit",
  area: "dependencies",
  mode: "repo",
  licence: "Apache-2.0",
  homepage: "https://github.com/pypa/pip-audit",
  minVersion: "2.7.0",
  tested: ["2.10.1"],
  bins: ["pip-audit"],
  versionArgs: ["--version"],
  network: "online",
  onlineFeature: "every run (it asks PyPI or OSV)",
  install: { darwin: "pipx install pip-audit", linux: "pipx install pip-audit", other: "pipx install pip-audit" },
  // pip-audit gives no severity: medium for every advisory.
  severity: "medium",

  command({ root }) {
    const files = requirementFiles(root);
    if (!files.length) return { skip: "no requirements*.txt at the root of the scanned folder" };
    return {
      args: [...files.flatMap((f) => ["-r", `${root}/${f}`]), "--format", "json", "--progress-spinner", "off", "--no-deps", "--disable-pip", "--desc", "on", "--aliases", "on"],
      output: "stdout",
      network: "allow",
      files,
    };
  },
  // 0: none found; 1: vulnerabilities found.
  exitOk: (code) => code === 0 || code === 1,

  parse(text, { tool, prepared }) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
    if (!doc || !Array.isArray(doc.dependencies)) throw new Error("no dependencies list");
    const file = prepared?.files?.length === 1 ? prepared.files[0] : null;
    const out = [];
    for (const d of doc.dependencies) {
      // pip-audit can list one advisory twice for a package; once is enough.
      const seen = new Set();
      for (const v of d.vulns || []) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        const ids = [...new Set([v.id, ...(v.aliases || [])].filter((x) => typeof x === "string"))].sort();
        out.push(makeFinding({
          tool, ruleId: v.id, ruleUrl: `https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`,
          category: "dependency-vuln", severity: this.severity,
          title: `${d.name}@${d.version}: ${v.id}`,
          description: `${d.name} ${d.version} (PyPI) is affected by ${ids.join(", ")}.${v.description ? ` ${v.description}` : ""}`,
          file,
          key: { ecosystem: "pypi", pkg: packageName("pypi", d.name), version: String(d.version || ""), advisories: ids },
          remediation: v.fix_versions?.length ? `Upgrade ${d.name} to ${v.fix_versions.join(" or ")}.` : `No fixed version of ${d.name} is listed yet.`,
        }));
      }
    }
    return out;
  },
};
