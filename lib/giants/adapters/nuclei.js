/**
 * nuclei (MIT): template checks against the live target, in URL scans only.
 *
 * It runs only the templates folder you give it (--nuclei <dir> or
 * giants.nucleiTemplates), never its own template download (-duc), never the
 * interactsh callback servers (-ni, a third party), and without the
 * intrusive, dos and fuzz tags unless the scan is --deep. Code-protocol and
 * headless templates stay off (nuclei needs -code / -headless for them).
 */
import { existsSync } from "node:fs";
import { cwesOf } from "../sarif.js";
import { clean, makeFinding, severityFromWord } from "../finding.js";

export const NUCLEI_EXCLUDED_TAGS = "intrusive,dos,fuzz";

export default {
  id: "nuclei",
  area: "live",
  mode: "url",
  licence: "MIT",
  homepage: "https://github.com/projectdiscovery/nuclei",
  minVersion: "3.2.0",
  tested: ["3.11.1"],
  bins: ["nuclei"],
  versionArgs: ["-version"],
  network: "target",
  install: { darwin: "brew install nuclei", linux: "go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest", other: "https://github.com/projectdiscovery/nuclei/releases" },

  command({ url, tmp, deep, settings, rate }) {
    const dir = settings.nucleiTemplates;
    if (!dir) return { skip: "no templates folder: give one with --nuclei <dir> or giants.nucleiTemplates (nuclei's own template download is never used)" };
    if (!existsSync(dir)) return { skip: `the templates folder ${dir} does not exist` };
    const out = `${tmp}/nuclei.jsonl`;
    return {
      args: ["-u", url, "-t", dir, "-duc", "-ni", "-jsonl", "-silent", "-nc", "-or", "-ot", "-o", out,
        ...(deep ? [] : ["-etags", NUCLEI_EXCLUDED_TAGS]),
        ...(rate > 0 ? ["-rl", String(Math.max(1, Math.round(rate)))] : [])],
      output: out,
      optionalOutput: true,
      network: "target",
    };
  },
  exitOk: (code) => code === 0,

  parse(text, { tool }) {
    const out = [];
    for (const line of String(text).split("\n")) {
      const t = line.trim();
      if (!t) continue;
      let o;
      try { o = JSON.parse(t); } catch (e) { throw new Error(`a line is not JSON: ${e.message}`); }
      if (!o || typeof o !== "object" || typeof o["template-id"] !== "string") throw new Error("a line has no template-id");
      const info = o.info || {};
      const at = clean(o["matched-at"] || o.url || o.host, 500);
      out.push(makeFinding({
        tool, ruleId: o["template-id"], ruleUrl: Array.isArray(info.reference) ? info.reference[0] : null,
        category: "web",
        severity: severityFromWord(info.severity) || "info",
        title: clean(info.name || o["template-id"], 160),
        description: `${clean(info.description || info.name || o["template-id"], 1000)}${o["matcher-name"] ? ` (matcher ${clean(o["matcher-name"], 80)})` : ""}${o["extracted-results"]?.length ? `; extracted: ${clean(o["extracted-results"].join(", "), 200)}` : ""}`,
        url: at,
        key: { cwe: cwesOf(info.classification?.["cwe-id"]), parameter: null },
        remediation: info.remediation || null,
      }));
    }
    return out;
  },
};
