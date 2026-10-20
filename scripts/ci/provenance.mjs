/**
 * Provenance check for pull requests (CONTRIBUTING.md, "Use of generative AI").
 *
 *   node scripts/ci/provenance.mjs <base-ref> [head-ref]
 *
 * Every non-merge commit in base..head that names an AI co-author must also
 * carry an `AI-Assisted:` trailer saying what the AI did, and the other way
 * round. Commits with neither are human-written and pass. Exits 1 and lists
 * the offending commits otherwise.
 */
import { execFileSync } from "node:child_process";

const AI_COAUTHOR = /^Co-Authored-By:.*\b(?:Claude|GPT|ChatGPT|Codex|Gemini|Copilot|Cursor|Llama|Mistral|Qwen|DeepSeek)\b/im;
const AI_ASSISTED = /^AI-Assisted:\s*\S.*;\s*\S/im;

const [base, head = "HEAD"] = process.argv.slice(2);
if (!base) {
  console.error("usage: provenance.mjs <base-ref> [head-ref]");
  process.exit(2);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf-8" });
const shas = git("rev-list", "--no-merges", `${base}..${head}`).split("\n").filter(Boolean);

const bad = [];
for (const sha of shas) {
  const body = git("show", "-s", "--format=%B", sha);
  const coauthor = AI_COAUTHOR.test(body);
  const assisted = AI_ASSISTED.test(body);
  if (coauthor && !assisted) bad.push(`${sha.slice(0, 7)} names an AI co-author but has no "AI-Assisted: <tool> with <model>; <what it did>" trailer`);
  if (assisted && !coauthor) bad.push(`${sha.slice(0, 7)} has an AI-Assisted trailer but no Co-Authored-By trailer naming the model`);
}

if (bad.length) {
  console.error(`Provenance: ${bad.length} of ${shas.length} commit(s) need trailers (see CONTRIBUTING.md#use-of-generative-ai):\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`Provenance: ${shas.length} commit(s) checked, all disclosed consistently.`);
