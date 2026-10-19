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

Penthera is open-source security for the apps and AI systems you ship: check it
before you deploy, vet what you build with, keep watching after you ship. All on
your own machine, deterministic, and free. How quality is measured on the way to
v2.0 is in the [plan](docs/plan.md).
The engineering detail, order of work, and acceptance criteria are in the
[release plan](docs/release-plan.md).

### v1.3.0 "AI toolchain" (shipped in 1.4.0)

| Feature | What it does |
|---------|--------------|
| `penthera agents` | Offline audit of `.mcp.json`, `~/.claude`, `~/.cursor`, hooks, plugins, skills, and `AGENTS.md` / `CLAUDE.md` / `.cursorrules`, graded A–F, with OWASP MCP and Agentic mapping |
| Hidden-content engine | Unicode tag / zero-width / bidi characters, whitespace padding, embedded `.pyc` and archives, `curl \| sh`, auto-approve hooks, unpinned `npx -y` MCP servers |
| `penthera.lock` | Hash-pins skills, MCP tool definitions, and hooks; a diff catches a silent "rug pull" update |
| `penthera deps` | Static capability detection for every dependency (install scripts, network, shell, env, eval, obfuscation), with file:line evidence |
| `penthera deps --diff` | What your dependencies can do now that they could not before: "this upgrade added network access" |
| Typosquat check | Names close to popular packages, against a vendored list. Registry metadata only with `--online` |
| Methodology and benchmark | `docs/METHODOLOGY.md`, verified citations on every finding category, `CITATION.cff`, and published precision and recall |

### v1.4.0 "Local loop" (shipped in 1.4.0)

| Feature | What it does |
|---------|--------------|
| `--offline` egress guard | One HTTP client that can only reach the target you named. Vendored CVE database, recon as explicit opt-in, an identifying User-Agent, and probe errors reported as inconclusive |
| Local learning store | `~/.penthera/` history of verified fixes, false-positive suppressions, and probe yield. Append-only and hash-chained; it re-ranks and suppresses, never executes |
| Fix recipes | Deterministic diffs for headers, cookies, CORS, rate limiting, and hardcoded secrets across Next.js, Express, Fastify, and Hono. Optional local model (Ollama) for the rest, labelled as such |
| `penthera agent --loop` | Scan → fix on a local branch → verify by re-scan and tests → learn → repeat. Never pushes, never opens pull requests, approval on every diff by default |
| `penthera install` | An install firewall: shows what new capabilities an install brings (install scripts, network, shell) before any script runs, with a policy file |
| PR-comment GitHub Action | Comments the dependency capability diff on every PR that changes a lockfile, and uploads SARIF |
| Custom reports and evidence bundle | Templates per audience, a found → fixed → verified timeline, and a SHA-256 manifest you can sign with a local SSH key |

### v1.5.x "AI apps and compliance" (partly shipped in 1.5.0)

| Feature | Status |
|---------|--------|
| Pre-commit hook and license policy | Shipped in 1.5.0 |
| CRA Art. 14 reporting helper and CycloneDX AI-BOM | Shipped in 1.5.0 |
| Signed, versioned rule packs (new detection knowledge without a runtime update channel) | Building |
| `penthera deps` for Python (pip, Poetry, uv) | Building |
| Local dashboard, `penthera ui` | Building |
| Internal testing audit (standing release gate) | Building |
| LLM endpoint configuration checks (rate limits, exposed inference and vector stores, unauthenticated remote MCP, CSP exfiltration surface) | Parked; needs a narrower design |
| JS bundle key scan | Open for contributors ([#6](https://github.com/danoszz/penthera/issues/6)) |

### v1.6.0 "Before you deploy" (planned)

Test what you are about to ship, where it already runs: on your machine or on a
preview deployment.

| Feature | Why |
|---------|-----|
| `penthera ship` | One pre-deploy gate: repo scan, `deps`, `agents`, and a scan of your localhost or preview URL, with a pass/fail you can wire into any deploy script |
| Preview-deployment scanning | A GitHub Action that waits for the Vercel, Netlify, or Cloudflare Pages preview URL of a PR, scans it, and comments the result. Your own preview, so authorization is built in |
| Framework presets | Sensible routes, auth flows, and headers for Next.js, SvelteKit, Remix, Nuxt, and Astro, so the first scan is useful without config |
| Authenticated preview scans | Test accounts from your own seed data, never real credentials |

### v1.7.0 "After you ship" (planned)

Keep watching what you shipped, without agents on your servers and without a
cloud service.

| Feature | Why |
|---------|-----|
| `penthera watch` | Scheduled, non-destructive checks of your own production: certificate expiry, header and CSP regressions, newly exposed endpoints, keys appearing in bundles, drift since the last release |
| New-CVE alerts for your SBOM | Your shipped SBOM checked against new advisories on a schedule, as a reviewed rule-pack update or an opt-in advisory lookup |
| Alerts where you already look | A GitHub issue, the job summary, or a local notification. Nothing leaves your infrastructure |
| Dashboard history | Posture over time in `penthera ui`, fed by `watch` runs |

### Scheduled for later

- **Landing page.** One static page, no tracking scripts: what it does, install
  in 30 seconds, why you can trust it.
- **Team pack.** Shared policy files, a faster signed rule-pack channel, and a
  self-hostable dashboard for teams. The single-machine tool stays complete and
  MIT.
- **A public, signed registry** of scan results for popular skills and MCP
  servers. Useful, but it would be a hosted service, so it lives outside the
  offline core if it happens at all.
- **Earlier candidates:** risk-contextual prioritisation, the MFA probe, a CyFun
  adapter for Belgium, exploit-chain storytelling, SBOM transitive dependencies
  and container images, an authorised-versus-unauthorised IDOR baseline, and
  document export for non-technical owners.

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
