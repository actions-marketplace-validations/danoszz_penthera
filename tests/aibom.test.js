/**
 * CycloneDX 1.6 AI-BOM: detection on a fixture repo, and validation against
 * the official CycloneDX JSON schema vendored in tests/fixtures/cyclonedx/
 * (no network).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Ajv from "ajv";
import { buildAiBom } from "../lib/whitebox/sbom.js";
import { aiBomSummary } from "../lib/whitebox/aibom.js";

const schema = (f) => JSON.parse(readFileSync(new URL(`./fixtures/cyclonedx/${f}`, import.meta.url), "utf-8"));
const FIXTURE = new URL("./fixtures/aibom/app", import.meta.url).pathname;
const OPTS = { serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79", timestamp: "2026-10-19T12:00:00Z", toolVersion: "1.5.0" };

function validator() {
  // The CycloneDX schema is draft-07 and uses non-standard annotations
  // (meta:enum), so strict mode is off. Formats are checked loosely.
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  for (const f of ["iri-reference", "uri-reference", "uri", "iri", "idn-email", "email", "regex"]) ajv.addFormat(f, true);
  ajv.addSchema(schema("spdx.schema.json"), "spdx.schema.json");
  ajv.addSchema(schema("jsf-0.82.schema.json"), "jsf-0.82.schema.json");
  return ajv.compile(schema("bom-1.6.schema.json"));
}
const validate = validator();
const expectValid = (bom) => {
  const ok = validate(bom);
  expect(validate.errors || [], JSON.stringify(validate.errors, null, 2)).toEqual([]);
  expect(ok).toBe(true);
};

const bom = buildAiBom(FIXTURE, OPTS);
const byName = (n) => bom.components.find((c) => c.name === n);
const kind = (c) => c.properties.find((p) => p.name === "penthera:ai-kind")?.value;

describe("AI-BOM schema validity", () => {
  it("is valid CycloneDX 1.6 for the fixture repo", () => {
    expect(bom.bomFormat).toBe("CycloneDX");
    expect(bom.specVersion).toBe("1.6");
    expectValid(bom);
  });

  it("is valid for a repo with no AI at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-aibom-"));
    try {
      writeFileSync(join(dir, "index.js"), "console.log('hello');\n");
      const empty = buildAiBom(dir, OPTS);
      expect(empty.components).toEqual([]);
      expect(empty.services).toBeUndefined();
      expectValid(empty);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("the validator actually rejects broken BOMs", () => {
    expect(validate({ ...bom, specVersion: "1.6", components: [{ type: "machine-learning-model" }] })).toBe(false);
    expect(validate({ ...bom, components: [{ type: "llm", name: "x" }] })).toBe(false);
  });
});

describe("AI-BOM detection", () => {
  it("summarises what it found", () => {
    expect(aiBomSummary(bom)).toEqual({ sdks: 5, models: 7, mcpServers: 2, skills: 1, prompts: 2 });
    expect(bom.metadata.component).toMatchObject({ name: "ai-fixture-app", version: "0.3.0" });
  });

  it("lists AI SDKs (npm and pypi) with resolved versions and purls, and skips non-AI deps", () => {
    expect(byName("@anthropic-ai/sdk")).toMatchObject({ type: "library", version: "0.60.0", purl: "pkg:npm/%40anthropic-ai%2Fsdk@0.60.0" });
    expect(byName("openai").version).toBe("5.12.0");
    expect(byName("ai").properties).toContainEqual({ name: "penthera:ai-provider", value: "Vercel AI SDK" });
    expect(byName("@ai-sdk/openai")).toBeTruthy();
    expect(byName("transformers").purl).toBe("pkg:pypi/transformers@4.44.0");
    expect(byName("express")).toBeUndefined();
    expect(byName("requests")).toBeUndefined();
  });

  it("finds model identifiers with file:line evidence and a modelCard", () => {
    const sonnet = byName("claude-sonnet-4-5");
    expect(sonnet.type).toBe("machine-learning-model");
    expect(sonnet.supplier.name).toBe("Anthropic");
    expect(sonnet.evidence.occurrences).toEqual([{ location: "src/chat.js", line: 7 }, { location: "src/chat.js", line: 26 }]);
    expect(sonnet.modelCard).toBeTruthy();
    expect(byName("gpt-4o-mini").evidence.occurrences[0]).toEqual({ location: "src/chat.js", line: 8 });
    expect(byName("text-embedding-3-small").supplier.name).toBe("OpenAI");
    expect(byName("gemini-2.5-flash").evidence.occurrences[0]).toEqual({ location: "config/models.yaml", line: 3 });
    expect(byName("llama3.1:8b").supplier.name).toBe("Meta");
  });

  it("recognises Hugging Face repo ids by known org or loader context, with a model-card link", () => {
    const llama = byName("meta-llama/Llama-3.1-8B-Instruct");
    expect(llama.externalReferences).toEqual([{ type: "model-card", url: "https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct" }]);
    expect(llama.properties).toContainEqual({ name: "penthera:model-distribution", value: "open-weights" });
    expect(byName("acme-labs/support-intent").evidence.occurrences[0]).toEqual({ location: "py/embed.py", line: 4 });
  });

  it("ignores look-alikes: CLI names, paths, package names, template literals", () => {
    const names = bom.components.map((c) => c.name);
    for (const n of ["claude-code", "src/utils.js", "docs/readme.md"]) expect(names).not.toContain(n);
    expect(names.filter((n) => n.startsWith("claude-"))).toEqual(["claude-sonnet-4-5"]);
  });

  it("records MCP servers as services without leaking env values or args", () => {
    const gh = bom.services.find((s) => s.name === "github");
    expect(gh["x-trust-boundary"]).toBe(false);
    expect(gh.properties).toContainEqual({ name: "penthera:mcp-package", value: "@modelcontextprotocol/server-github@2025.4.8" });
    expect(gh.properties).toContainEqual({ name: "penthera:mcp-env-keys", value: "GITHUB_PERSONAL_ACCESS_TOKEN" });
    expect(JSON.stringify(gh)).not.toContain("GITHUB_TOKEN}");
    const docs = bom.services.find((s) => s.name === "docs");
    expect(docs).toMatchObject({ endpoints: ["https://mcp.example.com/mcp"], "x-trust-boundary": true });
  });

  it("records skills and prompt files as hashed data components", () => {
    const skill = byName("triage");
    expect(skill.type).toBe("data");
    expect(kind(skill)).toBe("skill");
    expect(skill.description).toMatch(/Triage incoming support tickets/);
    expect(skill.hashes[0].content).toMatch(/^[a-f0-9]{64}$/);
    expect(kind(byName("prompts/system.md"))).toBe("prompt");
    expect(kind(byName("summarize.prompt"))).toBe("prompt");
  });

  it("links everything from the root in the dependency graph", () => {
    const refs = new Set([...bom.components, ...bom.services].map((c) => c["bom-ref"]));
    expect(refs.size).toBe(bom.components.length + bom.services.length);
    expect(new Set(bom.dependencies[0].dependsOn)).toEqual(refs);
  });
});
