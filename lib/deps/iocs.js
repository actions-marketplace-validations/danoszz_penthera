/**
 * Indicators of compromise from rule packs (lib/rules), for `penthera deps`.
 *
 *   ioc-package  known-malicious name@version, matched against the lockfile,
 *                so it works for packages that are not installed
 *   ioc-pypi-package  the same for PyPI (normalized names, PEP 440 versions)
 *   ioc-host     exfiltration domains and endpoint URLs, matched as literal
 *                strings in package code and package.json
 *   ioc-file     files a campaign drops into packages, by path and
 *                optionally SHA-256
 *
 * Literal matching only, no regexes: a pack cannot make this slow.
 */
import { createHash } from "node:crypto";
import { rulesOf } from "../rules/index.js";

/** Build the active IOC set once per scan. Returns null when no pack has IOCs. */
export function loadIocs() {
  const pkgRules = { npm: rulesOf("ioc-package"), pypi: rulesOf("ioc-pypi-package") };
  const hostRules = rulesOf("ioc-host");
  const fileRules = rulesOf("ioc-file");
  if (!pkgRules.npm.length && !pkgRules.pypi.length && !hostRules.length && !fileRules.length) return null;

  // Keyed by ecosystem too: the same name on npm and PyPI is two packages.
  const byName = new Map();
  for (const [eco, rules] of Object.entries(pkgRules)) {
    for (const r of rules) {
      for (const p of r.packages) {
        const k = `${eco}:${p.name}`;
        const list = byName.get(k) || [];
        list.push({ rule: r, versions: new Set(p.versions) });
        byName.set(k, list);
      }
    }
  }
  const needles = [];
  for (const r of hostRules) {
    for (const h of r.hosts) needles.push({ rule: r, value: h, type: "host" });
    for (const u of r.urls) needles.push({ rule: r, value: u, type: "url" });
  }
  const files = fileRules.flatMap((r) => r.files.map((f) => ({ rule: r, ...f })));

  return {
    /** Lockfile entries that match a known-malicious version (PyPI names already normalized). */
    matchPackage(name, version, ecosystem = "npm") {
      return (byName.get(`${ecosystem}:${name}`) || [])
        .filter((e) => e.versions.has(version) || e.versions.has("*"))
        .map((e) => ({ type: "package", value: `${name}@${version}`, rule: e.rule }));
    },
    /** Host and URL indicators in one file's text. */
    scanText(text, file) {
      const hits = [];
      for (const n of needles) {
        const idx = text.indexOf(n.value);
        if (idx < 0) continue;
        // A host must stand on its own: evil.example should not fire on notevil.example.
        if (n.type === "host" && /[a-z0-9-]/i.test(text[idx - 1] || "")) continue;
        hits.push({ type: n.type, value: n.value, rule: n.rule, file, line: text.slice(0, idx).split("\n").length });
      }
      return hits;
    },
    /** Dropped-file indicators in a package's file list. */
    scanFiles(list, source, prefix) {
      const hits = [];
      for (const f of files) {
        const found = list.filter((p) => p === f.path || p.endsWith(`/${f.path}`));
        for (const p of found) {
          if (f.sha256) {
            let digest;
            try { digest = createHash("sha256").update(source.read(p)).digest("hex"); } catch { continue; }
            if (digest !== f.sha256) continue;
          }
          hits.push({ type: "file", value: f.sha256 ? `${f.path} (sha256 ${f.sha256.slice(0, 12)}…)` : f.path, rule: f.rule, file: `${prefix}${p}`, line: 1 });
        }
      }
      return hits;
    },
  };
}
