/**
 * osv-scanner (Apache-2.0): known vulnerabilities in the dependencies named
 * by the project's lockfiles and manifests.
 *
 * Offline it runs with --offline and the local database you downloaded
 * (`osv-scanner scan source --download-offline-databases
 * --offline-vulnerabilities <dir>`); without one it is skipped with that
 * command. With --giants-online it queries the OSV API instead.
 */
import { clean, makeFinding, relPath, severityFromScore, severityFromWord } from "../finding.js";

const ECOSYSTEMS = { npm: "npm", pypi: "pypi", go: "go", "crates.io": "cargo", maven: "maven", rubygems: "gem", packagist: "composer", nuget: "nuget", pub: "pub", hex: "hex" };

/** A lowercase ecosystem name shared by every adapter. */
export function ecosystemOf(name) {
  const n = String(name || "").toLowerCase();
  return ECOSYSTEMS[n] || n || null;
}

/** Package names compared the way their registry does (PyPI: case, `-`, `_` and `.` are the same). */
export function packageName(ecosystem, name) {
  const n = String(name || "").toLowerCase();
  return ecosystem === "pypi" ? n.replace(/[-_.]+/g, "-") : n;
}

export default {
  id: "osv-scanner",
  area: "dependencies",
  mode: "repo",
  licence: "Apache-2.0",
  homepage: "https://github.com/google/osv-scanner",
  minVersion: "2.0.0",
  tested: ["2.6.0"],
  bins: ["osv-scanner"],
  versionArgs: ["--version"],
  network: "none",
  onlineFeature: "querying the OSV API when no local database is cached",
  keepHome: true,
  install: { darwin: "brew install osv-scanner", linux: "go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest", other: "https://github.com/google/osv-scanner/releases" },

  command({ root, online }) {
    return {
      args: ["scan", "source", "--format", "json", "--recursive", ...(online ? [] : ["--offline"]), root],
      output: "stdout",
      network: online ? "allow" : "deny",
    };
  },
  // 0: none found; 1: vulnerabilities found; 128: no packages found.
  exitOk: (code) => code === 0 || code === 1 || code === 128,

  skipReason(run, { root }) {
    if (/no offline version of the OSV database is available/i.test(run.stderr)) {
      return `no local vulnerability database; download it yourself with \`osv-scanner scan source --download-offline-databases --offline-vulnerabilities ${root}\`, or use --giants-online`;
    }
    return null;
  },

  parse(text, { root, tool }) {
    if (!String(text).trim()) return [];
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
    if (!doc || typeof doc !== "object" || (doc.results != null && !Array.isArray(doc.results))) throw new Error("no results list");
    const out = [];
    for (const res of doc.results || []) {
      const file = relPath(root, res.source?.path);
      for (const p of res.packages || []) {
        const ecosystem = ecosystemOf(p.package?.ecosystem);
        const pkg = packageName(ecosystem, p.package?.name);
        const version = String(p.package?.version || "");
        const byId = new Map((p.vulnerabilities || []).map((v) => [v.id, v]));
        const groups = p.groups?.length ? p.groups : (p.vulnerabilities || []).map((v) => ({ ids: [v.id], aliases: v.aliases || [] }));
        for (const g of groups) {
          const ids = [...new Set([...(g.ids || []), ...(g.aliases || [])].filter((x) => typeof x === "string"))].sort();
          if (!ids.length) continue;
          const lead = (g.ids || []).find((x) => byId.has(x)) || ids[0];
          const v = byId.get(lead) || {};
          const severity = severityFromScore(g.max_severity) || severityFromWord(v.database_specific?.severity) || "medium";
          out.push(makeFinding({
            tool, ruleId: lead, ruleUrl: `https://osv.dev/vulnerability/${encodeURIComponent(lead)}`,
            category: "dependency-vuln", severity,
            title: `${p.package?.name}@${version}: ${clean(v.summary || lead, 140)}`,
            description: `${p.package?.name} ${version} (${p.package?.ecosystem}) is affected by ${ids.join(", ")}${file ? `, from \`${file}\`` : ""}.${v.summary ? ` ${v.summary}` : ""}`,
            file,
            key: { ecosystem, pkg, version, advisories: ids },
            remediation: `Upgrade ${p.package?.name} to a version that fixes ${lead}.`,
          }));
        }
      }
    }
    return out;
  },
};
