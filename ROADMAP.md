# Roadmap

What's shipped, what's next, and what's deliberately not being built yet.

Penthera is maintained part-time. New features are gated on evidence that people
actually want them, so the list below is ordered by value per hour rather than
by ambition. Issues and PRs are welcome on anything here.

## Shipped

- URL scanning: TLS, security headers, CORS, cookies, endpoint and OpenAPI
  discovery, auth hardening, JWT, IDOR/BOLA, OAuth redirect, client-side auth
- Repo scanning: API route discovery, trust boundaries, hardcoded secrets,
  including keys for a dozen AI providers (Anthropic, OpenAI, Google, Groq,
  Hugging Face, and more)
- Email authentication: SPF, DMARC, MX
- Injection probes and property-based API fuzzing (opt-in, payload-based)
- macOS machine audit
- Reports: terminal, Markdown, JSON, SARIF, with provenance and an honest
  confidence label on every finding
- NIS2 readiness: per-measure report, offline self-assessment, policy pack,
  incident-report drafts, questionnaire answerer, CycloneDX SBOM, passive
  supplier rating, remediation and audit-loop tracking
- Agent Skill with an authorization gate, and a CLI
- A hardened release pipeline: SHA-pinned actions, least-privilege workflows,
  CodeQL, OpenSSF Scorecard, npm provenance

## Next

Penthera is growing from "scan the app you built with AI" into "secure the AI
tooling you build with". Three tracks, each ordered by value per hour.

### 1. AI supply chain: is what you installed safe?

Skills, MCP servers, plugins, hooks, and rule files now run with your
credentials and in your shell. Poisoned skills and MCP servers have been found
in the wild, and the scanners that exist mostly rely on a cloud LLM judge that
has already been bypassed. Penthera's take: offline, deterministic, and
explainable.

| Feature | Why | Rough size |
|---------|-----|-----------|
| `penthera agents` | Audit `.mcp.json`, `~/.claude`, `~/.cursor`, hooks, plugins, skills, `AGENTS.md`/`CLAUDE.md`/`.cursorrules`, graded A–F with SARIF | Large |
| Hidden-content engine | Unicode tag / zero-width / bidi characters, whitespace padding, embedded `.pyc` and archives, `curl \| sh`, auto-approve hooks, unpinned `npx -y` MCP servers | Medium |
| `penthera.lock` | Hash-pin skills, MCP tool definitions, and hooks; a CI diff catches a silent "rug pull" update | Medium |
| Install-time package checks | Packages that don't exist or are days old (slopsquatting), risky `postinstall` scripts, IOC packs for known npm worm campaigns | Medium |
| JS bundle key scan | Provider keys shipped to the browser via `NEXT_PUBLIC_` / `VITE_` variables | Small |

### 2. A local scan → fix → verify → learn loop

`penthera agent --loop`: scan, rank, propose a fix, apply it on a local branch,
re-scan to prove it, and remember what worked, so the next run is sharper.
Built to run entirely on your machine.

| Feature | Why | Rough size |
|---------|-----|-----------|
| `--offline` egress guard | One HTTP client that can only reach the target you named. Recon sources and the CVE database become explicit opt-ins with a vendored fallback | Medium |
| Local learning store | `~/.penthera/` history of verified fixes, false-positive suppressions, and probe yield per stack. Append-only and hash-chained, so it cannot be quietly poisoned. It re-ranks and suppresses; it never executes anything | Medium |
| Agent loop | Built-in fixes for the common cases (headers, cookies, CORS), an optional local model (Ollama) for the rest, a human approval gate on every diff | Large |
| Custom reports | Templates per audience (developer, owner, auditor), a loop timeline of found → fixed → verified, and a hashed evidence bundle | Medium |

### 3. AI-infused apps and compliance

| Feature | Why | Rough size |
|---------|-----|-----------|
| LLM endpoint probes | Missing rate limits on chat endpoints, canary prompt-injection and system-prompt leakage (opt-in), markdown-image exfiltration, exposed Ollama / vector DBs, unauthenticated remote MCP | Large |
| OWASP LLM, Agentic and MCP Top 10 mapping | The same per-run coverage table WSTG already gets | Medium |
| CRA Art. 14 reporting helper | Vulnerability reporting under the Cyber Resilience Act applies from 11 Sept 2026; the NIS2 incident helper already does most of the work | Small |
| CycloneDX AI-BOM | Models, MCP servers, and skills alongside the existing SBOM | Medium |
| Risk-contextual prioritisation ("fix these three first") | A ranked shortlist beats a long list | Small |
| MFA probe | The last Article 21 measure still marked planned | Medium |
| CyFun adapter (Belgium) | Jurisdiction data is already config | Small |
| Exploit-chain storytelling | Show how discovered chains combine, not just a flat list | Medium |

## Under consideration

**Local dashboard and live monitor.** A `penthera ui` command that opens a local
web app: a dashboard of current posture, findings and their history, a field to
enter a URL and run a scan, deep-scan and re-scan controls, downloadable
reports, and an interactive view of the agent working rather than a wall of
terminal output. Long-running monitoring with status reporting over time. This
is the largest item on the list and would change what the tool feels like to
use, so it needs real demand before the maintenance cost is worth taking on.

**A GitHub Action and pre-commit hook** for `penthera agents`, so a team's
agent configuration is checked on every PR.

**A public, signed registry** of scan results for popular skills and MCP
servers. Useful, but it would be a hosted service, so it lives outside the
offline core if it happens at all.

**Other candidates**, roughly in order: SBOM transitive dependencies and
container images, an authorised-versus-unauthorised baseline for the IDOR probe,
broader injection targeting, document export for non-technical owners, and
credential-exposure lookup.

## Not planned

- **Workspace API integrations (Microsoft 365, Google).** They would need OAuth,
  stored tokens, and accounts. Running entirely offline with no accounts is a
  deliberate property of this tool, not a limitation to fix.
- **ISO 27001 Annex A mapping.** Mostly organisational controls, and it would
  dilute the NIS2 focus that makes the compliance output useful.
- **Telemetry, or an agent that pushes.** No usage data leaves your machine,
  and the agent loop never pushes, opens pull requests, or sends your code
  anywhere. You review and push.
- **An LLM judge as the primary detector.** Published bypasses show it can be
  talked out of a finding. Deterministic rules come first; a model may only add
  context on top.
- **A hosted service.** Penthera is an open-source tool you run yourself. If a
  hosted version ever exists it will not remove anything from this one.

## Principles

- Works offline. Where an API adds value it stays optional with a local fallback.
- Nothing leaves your machine unless you ask for it: no telemetry, no
  auto-push, no remote learning.
- Never claims to certify. Output is readiness, evidence, and self-assessment.
- Honest about confidence. A heuristic is labelled as one.
- Proportionate. A small organisation should be able to produce appropriate
  evidence without enterprise overhead.
- Authorized testing only. Anything touching third parties stays passive and
  public-data-only.
