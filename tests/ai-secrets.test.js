/**
 * AI provider key detection.
 *
 * Fake keys are assembled at runtime from a prefix and filler so this file never
 * contains a string that looks like a real credential (to GitHub push
 * protection, or to Penthera scanning its own repo).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSecrets, findSecretsInText } from "../lib/whitebox/secrets.js";

const fill = (n, chars = "aB3dE5fG7h") => chars.repeat(Math.ceil(n / chars.length)).slice(0, n);
const hex = (n) => fill(n, "0a1b2c3d4e5f");

const KEYS = {
  "Anthropic API key": "sk-" + "ant-api03-" + fill(93),
  "OpenRouter API key": "sk-" + "or-v1-" + hex(64),
  "OpenAI API key": "sk-" + "proj-" + fill(120),
  "OpenAI API key (legacy format)": "sk-" + fill(48),
  "Google API key (Gemini / Firebase / Maps)": "AI" + "za" + fill(35),
  "Groq API key": "gs" + "k_" + fill(52),
  "Hugging Face token": "h" + "f_" + fill(34),
  "Replicate API token": "r8" + "_" + fill(37),
  "xAI API key": "xa" + "i-" + fill(80),
  "Perplexity API key": "pp" + "lx-" + fill(48),
  "LangSmith API key": "lsv2" + "_pt_" + hex(32) + "_" + hex(10),
  "Pinecone API key": "pc" + "sk_" + fill(60),
};

describe("findSecretsInText: AI provider keys", () => {
  for (const [name, key] of Object.entries(KEYS)) {
    it(`detects ${name}`, () => {
      const hits = findSecretsInText(`const client = new Client({ key: "${key}" });`);
      expect(hits.map((h) => h.name)).toEqual([name]);
    });
  }

  it("reports a modern OpenAI project key (the old pattern missed the hyphen)", () => {
    const hits = findSecretsInText(`OPENAI_API_KEY=${KEYS["OpenAI API key"]}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("critical");
  });

  it("reports one finding, not two, when a provider key sits in an api_key assignment", () => {
    const hits = findSecretsInText(`api_key = "${KEYS["Anthropic API key"]}"`);
    expect(hits.map((h) => h.name)).toEqual(["Anthropic API key"]);
  });

  it("treats Google AIza keys as high, not critical (Firebase web keys are public)", () => {
    const [hit] = findSecretsInText(KEYS["Google API key (Gemini / Firebase / Maps)"]);
    expect(hit.severity).toBe("high");
  });

  it("does not fire on short prefixes or prose", () => {
    expect(findSecretsInText("use the sk-ant- prefix and hf_ tokens; see gsk_ docs")).toHaveLength(0);
  });
});

describe("scanSecrets: AI keys in repo files", () => {
  it("finds a provider key in a committed notebook and masks it", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-ai-secrets-"));
    try {
      const key = KEYS["Anthropic API key"];
      writeFileSync(join(dir, "demo.ipynb"), JSON.stringify({ cells: [{ source: [`client = Anthropic(api_key="${key}")`] }] }));
      const findings = scanSecrets(dir);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Anthropic API key in source");
      expect(findings[0].description).not.toContain(key);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
