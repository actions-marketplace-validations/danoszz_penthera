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
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
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

describe("findSecretsInText: every match counts", () => {
  it("a placeholder does not hide a real secret of the same rule later in the text", () => {
    const real = "Zx81kQ2m" + "P0vLr7Tn";
    const hits = findSecretsInText(`a = { api_key: "your-api-key-here" };\nb = { api_key: "${real}" };\n`);
    expect(hits).toHaveLength(1);
    expect(hits[0].match).toContain(real);
    expect(hits[0].index).toBeGreaterThan(20);
  });

  it("reports each distinct key, and the repo scan still reports one finding per rule and file", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-ai-secrets-"));
    try {
      const k1 = KEYS["Anthropic API key"];
      const k2 = k1.slice(0, -1) + "Z";
      const text = `const a = "${k1}";\nconst b = "${k2}";\n`;
      expect(findSecretsInText(text).map((h) => h.match)).toEqual([k1, k2]);
      writeFileSync(join(dir, "a.js"), text);
      expect(scanSecrets(dir)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scanSecrets: hostile files", () => {
  it.skipIf(process.platform === "win32")("does not read a FIFO named .env (runs in a child so a hang cannot stall the suite)", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-ai-secrets-"));
    try {
      execFileSync("mkfifo", [join(dir, ".env")]);
      writeFileSync(join(dir, "a.js"), `const k = "${KEYS["Anthropic API key"]}";\n`);
      const mod = pathToFileURL(join(import.meta.dirname, "..", "lib", "whitebox", "secrets.js")).href;
      const script = `const { scanSecrets } = await import(${JSON.stringify(mod)}); console.log(JSON.stringify(scanSecrets(process.argv[1]).map((f) => f.url)));`;
      const r = spawnSync(process.execPath, ["--input-type=module", "-e", script, dir], { encoding: "utf-8", timeout: 15_000 });
      expect(r.signal, "scan hung on the FIFO").toBeNull();
      expect(JSON.parse(r.stdout)).toEqual(["a.js"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a file over the size cap instead of reading it", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-ai-secrets-"));
    try {
      writeFileSync(join(dir, "big.json"), `{"k": "${KEYS["Anthropic API key"]}"}`);
      const findings = scanSecrets(dir, { maxBytes: 16 });
      expect(findings).toMatchObject([{ severity: "info", url: "big.json", title: "File too large to scan for secrets" }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
