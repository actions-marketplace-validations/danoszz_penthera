/**
 * Benchmark target: a throwaway repository with planted secrets and decoys,
 * written to a temp directory at run time.
 *
 * Secret values are assembled from fragments and a seeded generator, so no
 * credential-shaped string is committed to this repository (that would trip
 * GitHub push protection and Penthera's own self-scan). They are random, not
 * real credentials.
 *
 * Every planted file is listed in bench/ground-truth.json with its label.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { mulberry32 } from "../prng.js";

function token(rand, alphabet, n) {
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}

const UPPER_NUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const HEX = "0123456789abcdef";

/** File path -> contents. Keys match `file` in ground-truth.json. */
export function fixtureFiles() {
  const r = mulberry32(20261019);
  const aws = ["AK", "IA"].join("") + token(r, UPPER_NUM, 16);
  const stripe = ["sk", "live"].join("_") + "_" + token(r, ALNUM, 24);
  const anthropic = ["sk", "ant", "api03"].join("-") + "-" + token(r, ALNUM, 40);
  const ghp = ["gh", "p_"].join("") + token(r, ALNUM, 36);
  const openrouter = ["sk", "or", "v1"].join("-") + "-" + token(r, HEX, 64);
  const dbPassword = token(r, ALNUM, 14);
  const signingKey = token(r, ALNUM, 40);
  const hf = ["h", "f_"].join("") + token(r, ALNUM, 34);
  const awsDocsExample = ["AK", "IA"].join("") + "IOSFODNN7" + "EXAMPLE";

  return {
    // Planted secrets (true positives).
    "src/aws.js": `export const s3 = { accessKeyId: "${aws}", region: "eu-west-1" };\n`,
    "src/billing.js": `const stripe = require("stripe")("${stripe}");\nmodule.exports = stripe;\n`,
    "src/ai/client.ts": `export const anthropic = new Anthropic({ apiKey: "${anthropic}" });\n`,
    "scripts/release.sh": `#!/bin/sh\nGITHUB_TOKEN=${ghp} gh release create "$1"\n`,
    "notebooks/eval.py": `OPENROUTER_KEY = "${openrouter}"\n`,
    "server/db.js": `export const db = connect({ user: "app", password: "${dbPassword}" });\n`,
    // A token pasted into Markdown notes. Markdown is not in the scanned
    // extensions, so this is an expected miss.
    "docs/deploy-notes.md": `Deploy with \`HF_TOKEN=${hf} ./deploy.sh\`\n`,
    // No provider prefix, and a name the generic patterns don't cover.
    "src/webhooks.js": `const WEBHOOK_SIGNING_KEY = "${signingKey}";\nexport default WEBHOOK_SIGNING_KEY;\n`,

    // Decoys (true negatives): placeholders, env lookups, docs.
    "src/env.js": `export const key = process.env.OPENAI_API_KEY;\nexport const secret = process.env.JWT_SECRET;\n`,
    ".env.example": `API_KEY="your-api-key-here"\nPASSWORD="changeme"\n`,
    "src/settings.js": `export const apiKey = "<placeholder>";\nexport const password = "********";\n`,
    "docs/setup.md": "Set `api_key = \"REDACTED\"` in your local config. Never commit real keys.\n",
    // AWS's own documentation example key: credential-shaped, not a credential.
    "config/aws.example.yaml": `# Example from the AWS docs\naws_access_key_id: ${awsDocsExample}\n`,
    "README.md": "# demo app\n\nCopy `.env.example` to `.env` and fill in your keys.\n",
  };
}

/** Write the fixture to a fresh temp dir. Returns { dir, cleanup }. */
export function writeRepoFixture() {
  const dir = mkdtempSync(join(tmpdir(), "penthera-bench-repo-"));
  for (const [rel, content] of Object.entries(fixtureFiles())) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
