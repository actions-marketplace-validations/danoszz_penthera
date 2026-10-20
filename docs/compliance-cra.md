# Compliance: the Cyber Resilience Act (CRA)

> **Pro.** For "what must I report under the CRA, and what is in my AI-BOM?"

NIS2 is covered in [compliance-nis2.md](compliance-nis2.md).

The Cyber Resilience Act, [Regulation (EU) 2024/2847](https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng),
puts security duties on manufacturers of products with digital elements, which
includes software you sell or make available in the EU. Most of it applies from
11 December 2027. The reporting duty in **Article 14 has applied since
11 September 2026** (Art. 71(2)), and it also covers products placed on the
market before December 2027 (Art. 69(3)).

Penthera helps with two pieces of CRA evidence, offline:

| Command | What you get |
|---------|--------------|
| `--cra-init cra.json` then `--cra cra.json` | Article 14 timeline with due dates, overdue flags and a draft of every report |
| `--repo . --aibom aibom.cdx.json` | CycloneDX 1.6 AI-BOM: AI SDKs, models referenced in code, MCP servers, skills, prompt files |

Penthera does not make you CRA compliant and does not certify anything. The
drafts are not the ENISA platform's official form, and none of this is legal
advice.

## Article 14 reporting helper

### What the regulation asks

Checked on 2026-10-19 against the Official Journal text and the
[ENISA Single Reporting Platform (SRP) FAQ](https://www.enisa.europa.eu/topics/product-security/vulnerability-services/eu-incident-response-and-cyber-crisis-management/single-reporting-platform-srp/frequently-asked-questions).

| | Actively exploited vulnerability (Art. 14(1)-(2)) | Severe incident (Art. 14(3)-(5)) |
|---|---|---|
| Early warning | within 24 hours of becoming aware, with the Member States where the product is available | within 24 hours, including whether it is suspected to be caused by unlawful or malicious acts, plus Member States |
| Notification | within 72 hours: the product, the general nature of the exploit and the vulnerability, corrective or mitigating measures taken and ones users can take, how sensitive the information is | within 72 hours: nature of the incident, an initial assessment, measures taken and ones users can take, sensitivity |
| Final report | no later than **14 days after a corrective or mitigating measure is available**: description with severity and impact, any malicious actor, details of the security update | within **one month after the incident notification**: detailed description with severity and impact, type of threat or root cause, applied and ongoing mitigations |

- **Where to send it.** Through the [ENISA Single Reporting Platform](https://portal.cra-srp.enisa.europa.eu/),
  using the end-point of the CSIRT designated as coordinator in the Member State
  of your main establishment. ENISA receives it at the same time (Art. 14(1),
  14(3), 14(7)). For the Netherlands that CSIRT is **NCSC-NL**, per ENISA's
  [list of CSIRTs designated as coordinators](https://www.enisa.europa.eu/topics/product-security/vulnerability-services/eu-incident-response-and-cyber-crisis-management/single-reporting-platform-srp/list-of-csirts-designated-as-coordinators).
- **Inform your users.** After becoming aware, inform impacted users (and where
  appropriate all users), with mitigations they can deploy, where appropriate
  in a machine-readable format (Art. 14(8)).
- **One notification** per vulnerability or incident, even across subsidiaries
  (ENISA SRP FAQ). The CSIRT may ask for an intermediate report (Art. 14(6)).
- An *actively exploited vulnerability* is one with reliable evidence that a
  malicious actor exploited it without the system owner's permission (Art. 3(42)).
  An incident is *severe* if it can harm the availability, authenticity,
  integrity or confidentiality of sensitive or important data or functions, or
  can lead to malicious code in the product or a user's systems (Art. 14(5)).

### Use it

```bash
penthera --cra-init cra.json   # set type ("vulnerability" or "incident") and aware_at
penthera --cra cra.json        # writes cra-reports.md and prints the deadlines
```

`cra-reports.md` holds the timeline (UTC and your local time), a status per
report (`due in 21h 30m`, `submitted`, `submitted late`, `OVERDUE`,
`waiting for a fix`), a draft of each report with `NEEDS INPUT` for every fact
still missing, and a draft user advisory for Art. 14(8). Record what you've sent
in `submitted.early_warning` / `submitted.notification` / `submitted.final_report`
and re-run. For a severe incident, the final report then counts from the actual
submission time instead of the 72-hour deadline.

**Prefill from your scan and SBOM.** Name the affected dependency in
`component.name` and point `prefill` at Penthera output (paths relative to
`cra.json`):

```json
{
  "type": "vulnerability",
  "aware_at": "2026-10-24T09:00:00+02:00",
  "component": { "name": "jquery" },
  "prefill": { "scan": "scan.json", "sbom": "sbom.cdx.json" }
}
```

```bash
penthera https://staging.example.com --repo . --sbom sbom.cdx.json -o scan.json
```

From the SBOM it fills the product name and version and the component's version
and purl. From the scan it fills matching CVE ids, the scanner severity and the
finding titles. Prefilled values are marked *verify* in the draft, and anything you wrote
yourself is never overwritten. A full example is in `tests/fixtures/cra/` in the repository.

### How the deadlines are counted

- **Hours are elapsed hours** from `aware_at`. If the clocks change in between,
  the local due time shifts (24 hours from 09:00 CEST on 24 October 2026 is
  08:00 CET on 25 October).
- **Days and months are calendar periods** in your `timezone` (default
  `Europe/Amsterdam`), ending at the same clock time. One month from 31 January
  ends on 28 (or 29) February, following
  [Regulation 1182/71](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31971R1182) Art. 3(2)(c).
- A timestamp without an offset is read in `timezone`. Use ISO 8601.
- This is the **strict reading**. Regulation 1182/71 can give a little more
  time (a period runs to the end of the hour or day, and a days or months period
  that ends on a weekend or public holiday moves to the next working day).
  Don't plan on that; report early.

The helper warns if `aware_at` is before 11 September 2026, if
`main_establishment` is not the Netherlands (so NCSC-NL is not your CSIRT), and
if the type or time zone is unknown.

## AI-BOM (CycloneDX 1.6)

Customers and auditors ask what AI a product contains: which
providers get your data, which models, which agent tooling. `--aibom`
inventories it from the repo, offline:

```bash
penthera --repo . --aibom aibom.cdx.json
```

| Found | How | CycloneDX |
|-------|-----|-----------|
| AI SDKs: `openai`, `@anthropic-ai/sdk`, `@google/genai`, `ai` / `@ai-sdk/*`, `langchain` / `@langchain/*`, `llamaindex`, `ollama`, `@huggingface/transformers`; on PyPI `anthropic`, `transformers`, `torch`, `langchain-*`, `llama-index-*`, `litellm`, `mcp` and others | lockfile, `package.json`, `requirements.txt`, `pyproject.toml` | `library` with purl |
| Models: `claude-*`, `gpt-*`, `o3`, `text-embedding-*`, `gemini-*`, `gemma*`, `llama*`, `mistral-*`, `deepseek-*`, `qwen*`, `phi-*`, `grok-*`, Hugging Face ids (`meta-llama/Llama-3.1-8B-Instruct`) | whole string literals in code and `model:` keys in YAML/TOML; HF ids only for known orgs or next to a loader call | `machine-learning-model` with supplier, `modelCard` stub, `evidence.occurrences` (file and line) |
| MCP servers | `lib/agents/discover.js` (`.mcp.json`, `.cursor/`, `.vscode/mcp.json`, ...) | `services` with transport, package, endpoint and trust boundary; env var *names* only, never values or args |
| Agent Skills | `SKILL.md` folders | `data` with SHA-256 |
| Prompt files | `*.prompt`, `*.prompty`, `*.prompt.md`, anything under a `prompts/` folder | `data` with SHA-256 |

Every item hangs off the root component in `dependencies`. The BOM covers only
AI components. Use `--sbom` for all dependencies.

Spec references: the [CycloneDX 1.6 JSON reference](https://cyclonedx.org/docs/1.6/json/),
the [ML-BOM capability page](https://cyclonedx.org/capabilities/mlbom/), and the
[official schema](https://github.com/CycloneDX/specification/blob/master/schema/bom-1.6.schema.json).
That schema (with its SPDX and JSF dependencies) is vendored in
`tests/fixtures/cyclonedx/`, and the tests validate every generated AI-BOM
against it without network. Penthera writes 1.6 (ML-BOM first appeared in 1.5).
CycloneDX 1.7 is also published, and support for it is not built yet.

**Limits.** A model string in code means the model is referenced, not that it
runs in production. The evidence lines let a reviewer check. Model ids built at
runtime (`` `claude-${tier}` ``) are not detected. The `modelCard` is a stub:
fill in task, datasets and considerations from the provider's model card.
