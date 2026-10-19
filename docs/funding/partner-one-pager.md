# Penthera: a one-page brief for security platforms

For: teams at security platforms such as Aikido, Socket, Snyk, GitGuardian and
Semgrep. Draft, not sent to anyone.

## What Penthera is

An MIT-licensed security scanner that runs on the developer's own machine, as a
CLI (`npx penthera`) and as an Agent Skill for Claude Code and Cursor. It has no
accounts and no telemetry. It does three things:

1. **Scans the app.** Black-box checks of a live URL (TLS, headers, CORS,
   cookies, OpenAPI discovery, auth hardening, JWT, IDOR, OAuth redirects, opt-in
   injection probes) and white-box checks of a repo (routes, trust boundaries,
   hardcoded secrets including keys for a dozen AI providers).
2. **Audits the AI developer toolchain.** `penthera agents` (in review, pull
   request #12) reads `.mcp.json`, `~/.claude`, `~/.cursor`, hooks, plugins,
   skills and rule files, and grades them A to F, with SARIF output.
3. **Produces NIS2 evidence.** A per-measure readiness report, self-assessment,
   policy pack, incident report drafts and a CycloneDX SBOM. It never claims
   certification.

## Where it differs from your products

Checked against public product pages on 2026-10-19. These are differences in
approach, not claims that one is better.

| Penthera | What we found in public sources |
|----------|--------------------------------|
| **Offline, deterministic audit of agent configuration.** Rules decide findings; nothing about the user's setup leaves the machine; MCP servers are read from config, not started. | Snyk Agent Scan (formerly Invariant mcp-scan) covers MCP servers, skills and agent harnesses, but sends tool descriptions, server configs and skill content to a remote API, needs a Snyk token, and starts stdio servers to read their tools ([repo](https://github.com/snyk/agent-scan)). GitGuardian added AI hooks and an agent and MCP inventory in September 2026, focused on secrets in prompts and tool calls ([changelog](https://docs.gitguardian.com/releases/saas/2026/09/07/changelog)). We found no MCP or skill audit product in Socket's getting-started docs ([docs](https://docs.socket.dev/docs/getting-started)), though Socket does publish audits of individual skills listed on skills.sh. |
| **App DAST inside the coding agent, with a scan, fix, verify loop.** The skill scans, proposes a framework-aware fix, and re-scans to prove it, all locally. | Aikido offers DAST, API scanning, AI pentesting and fix and verify agents as a hosted platform ([aikido.dev](https://www.aikido.dev/)). Snyk has DAST through its 2024 Probely acquisition ([Snyk news](https://snyk.io/news/snyk-acquires-developer-first-dast-provider-probely/)). Semgrep's product list covers SAST, supply chain and secrets, with no DAST listed ([semgrep.dev](https://semgrep.dev/)). |
| **NIS2 and CRA evidence for small organisations.** Output is readiness and evidence for the Dutch Cyberbeveiligingswet and NIS2 Article 21, plus a CRA Article 14 reporting helper on the roadmap. | Aikido's homepage cites its own SOC 2 Type II and ISO 27001 status but does not mention NIS2 or CRA ([aikido.dev](https://www.aikido.dev/)). Semgrep's homepage does not mention them either ([semgrep.dev](https://semgrep.dev/)). We did not check Socket, Snyk or GitGuardian for this, and a homepage check can miss features documented elsewhere. |

Where Penthera does not compete: hosted dashboards, organisation-wide policy,
runtime protection, cloud posture, container scanning, and broad SAST rule sets.
The platforms above are far ahead there, and Penthera has no plans to build
them ([ROADMAP.md, "Not planned"](../../ROADMAP.md)).

## How it fits next to a platform

- **SARIF out.** Every scan can write SARIF, which GitHub code scanning accepts
  from third-party tools ([GitHub docs](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github)).
  A platform that ingests third-party SARIF can show Penthera findings
  next to its own. We have not yet confirmed which of the five platforms
  accept third-party SARIF; that is a question for each partner.
- **The local step before CI.** Penthera runs in the editor and agent before a
  commit. A platform covers the repo, pipeline and runtime after it.
- **The offline option for customers who need it.** For teams that cannot send
  code or configuration to a vendor, Penthera can be the documented local
  fallback.
- **Planned: a "use alongside" guide** (`docs/use-alongside.md`, not yet
  written) showing how to run Penthera with each platform without duplicate
  findings.

## Possible ways to work together

- Ingest Penthera SARIF, or list it as a supported third-party source.
- Sponsor the project ([sponsor-tiers.md](sponsor-tiers.md)).
- Share detection research: for example Penthera's deterministic rules for
  hidden content in skills and MCP tool descriptions.
- Longer term, a closer arrangement. The maintainer is open to that
  conversation. Any arrangement would keep the MIT core, the offline mode, and
  the no-telemetry rule.

## Adoption, honestly

Fetched on 2026-10-19. Penthera is four months old (first release 2026-06-30)
and small.

| Metric | Value | Source |
|--------|-------|--------|
| npm downloads, last 30 days | 46 (2026-09-17 to 2026-10-16) | https://api.npmjs.org/downloads/point/last-month/penthera |
| npm downloads, since 2026-06-01 | 435 (to 2026-10-18) | https://api.npmjs.org/downloads/range/2026-06-01:2026-10-18/penthera |
| skills.sh installs | 59 total | https://skills.sh/danoszz/penthera |
| GitHub stars | 46 | https://github.com/danoszz/penthera |
| GitHub forks | 11 | https://github.com/danoszz/penthera |
| OpenSSF Scorecard | 6.3 / 10 (2026-10-19) | https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera |

npm counts include CI and mirror downloads, so they overstate human users.
There is no telemetry, so there is no other usage data.

## Contact

Daan van der Zwaag, maintainer. GitHub: [@danoszz](https://github.com/danoszz).
