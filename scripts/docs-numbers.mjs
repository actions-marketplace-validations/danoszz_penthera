#!/usr/bin/env node
import { loadPopular } from "../lib/deps/typosquat.js";
// Prints the counts quoted in the README's "By the numbers" block, so they can
// be refreshed from the source instead of edited by hand. Offline, read-only.
//
//   node scripts/docs-numbers.mjs            # counts from the code and docs
//   node scripts/docs-numbers.mjs --tests    # also runs the test suite (a minute or two) to count tests

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { BUILT_IN_TEMPLATES } from "../lib/templates.js";
import { CAPABILITIES } from "../lib/deps/capabilities.js";
import { RULE_OWASP } from "../lib/agents/owasp.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const secretsSrc = read("lib/whitebox/secrets.js");
const patternsBlock = secretsSrc.slice(secretsSrc.indexOf("const SECRET_PATTERNS = ["));
const secretPatterns = (patternsBlock.slice(0, patternsBlock.indexOf("\n];")).match(/\bname: "/g) || []).length;

const recipes = readdirSync(new URL("../lib/fix/recipes", import.meta.url)).filter((f) => f.endsWith(".js")).length;
const references = (read("docs/references.bib").match(/^@/gm) || []).length;
const popular = loadPopular("npm").names.length;
const popularPypi = loadPopular("pypi").names.length;

const total = read("bench/RESULTS.md").match(/\| \*\*Total\*\* \|[^\n]*/)?.[0] ?? "";
const [tp, fp, fn, precision, recall] = total.replace(/\*/g, "").split("|").map((s) => s.trim()).filter(Boolean).slice(1);

const rows = [
  ["URL scan templates (built in)", BUILT_IN_TEMPLATES.length],
  ["Secret and AI-key patterns", secretPatterns],
  ["Dependency capabilities", Object.keys(CAPABILITIES).length],
  ["AI-tooling audit rules", Object.keys(RULE_OWASP).length],
  ["Fix recipes", recipes],
  ["Popular npm names for typosquat checks", popular],
  ["Popular PyPI names for typosquat checks", popularPypi],
  ["Cited references (docs/references.bib)", references],
  ["Benchmark TP / FP / FN", `${tp} / ${fp} / ${fn}`],
  ["Benchmark precision / recall", `${precision} / ${recall}`],
];

if (process.argv.includes("--tests")) {
  const vitest = new URL("../node_modules/.bin/vitest", import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), "penthera-numbers-"));
  const file = join(dir, "vitest.json");
  try {
    execFileSync(vitest, ["run", "--reporter=json", `--outputFile=${file}`], { stdio: "ignore" });
  } catch {
    // a failing test still writes its counts
  }
  const r = JSON.parse(readFileSync(file, "utf8"));
  rmSync(dir, { recursive: true, force: true });
  rows.push(["Tests (total / passed / skipped)", `${r.numTotalTests} / ${r.numPassedTests} / ${r.numPendingTests}`]);
}

for (const [label, value] of rows) console.log(`${label.padEnd(42)} ${value}`);
