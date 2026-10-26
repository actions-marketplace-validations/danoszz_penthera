/**
 * CodeQL (GitHub CodeQL Terms): only with `--with codeql`, never in plain
 * --giants (spec decision 4). The CLI prints a one-line licence notice first.
 *
 * Two steps: build a database from source (JavaScript/TypeScript and Python,
 * which need no build), then run the language's default query suite from the
 * bundle. --no-download keeps it from fetching query packs.
 */
import { makeFinding, severityFromScore, severityFromWord, where } from "../finding.js";
import { cwesOf, readSarif, sarifResults } from "../sarif.js";

export const CODEQL_NOTICE = "CodeQL: its terms allow academic research and the analysis of open-source code; using it on other code is your responsibility under your own licence (for example GitHub Advanced Security).";

const LANGS = { JavaScript: "javascript", TypeScript: "javascript", Python: "python" };

export default {
  id: "codeql",
  area: "code",
  mode: "repo",
  licence: "GitHub CodeQL Terms and Conditions",
  homepage: "https://github.com/github/codeql-action/releases",
  minVersion: "2.15.0",
  tested: ["2.27.2"],
  bins: ["codeql"],
  versionArgs: ["version", "--format=terse"],
  network: "none",
  explicitOnly: true,
  install: { darwin: "Download a CodeQL bundle from https://github.com/github/codeql-action/releases", linux: "Download a CodeQL bundle from https://github.com/github/codeql-action/releases", other: "https://github.com/github/codeql-action/releases" },

  command({ root, tmp, languages = [] }) {
    const langs = [...new Set(languages.map((l) => LANGS[l]).filter(Boolean))].sort();
    if (!langs.length) return { skip: "no JavaScript, TypeScript or Python source to analyse" };
    const db = `${tmp}/codeql-db`;
    return {
      steps: [
        { args: ["database", "create", db, "--db-cluster", ...langs.map((l) => `--language=${l}`), "--source-root", root, "--build-mode=none", "--overwrite", "--quiet"] },
        ...langs.map((l) => ({ args: ["database", "analyze", `${db}/${l}`, "--format", "sarif-latest", "--output", `${tmp}/codeql-${l}.sarif`, "--no-download", "--quiet"], output: `${tmp}/codeql-${l}.sarif` })),
      ],
    };
  },
  exitOk: (code) => code === 0,

  parse(text, { root, tool }) {
    const doc = readSarif(text);
    return sarifResults(doc, root).map((r) => {
      const props = r.rule?.properties || {};
      return makeFinding({
        tool, ruleId: r.ruleId, ruleUrl: r.rule?.helpUri || null,
        category: "code",
        severity: severityFromScore(props["security-severity"]) || severityFromWord(props["problem.severity"] || r.level) || "medium",
        title: `${r.rule?.shortDescription?.text || r.ruleId} in ${where(r.file, r.line)}`,
        description: r.message || r.ruleId,
        file: r.file, line: r.line,
        key: { cwe: cwesOf(props.tags) },
      });
    });
  },
};
