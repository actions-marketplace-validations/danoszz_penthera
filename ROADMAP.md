# Roadmap

> **Project page.** For anyone asking "what ships next, and when?"

This page lists where Penthera stands, what ships next, and what is
deliberately not being built. The experiments that decide what ships are in the
[research plan](docs/vision-2.0.md). How releases are cut is in
[CONTRIBUTING.md](CONTRIBUTING.md#release-cadence-and-freeze).

Penthera is maintained part-time, alongside a PhD. Work is ordered by value per
hour. A feature that does not answer a real user question, or does not hold up
when measured, does not ship. Issues and pull requests are welcome on anything
here.

## Where it stands

| npm tag | Version | Install |
|---|---|---|
| `latest` | 1.8.1 (2026-10-22) | `npx penthera` |
| `next` | 1.9.0-rc.1 (2026-10-22) | `npx penthera@next` |

## Now: 1.9.0 release candidate

1.9.0-rc.1 is on npm's `next` tag. It becomes 1.9.0 on `latest` once it has run
on real projects without a blocking issue and the maintainer approves. Until
then, only fixes and docs go into 1.9.

| In 1.9.0-rc.1 | What it means for you |
|---|---|
| `penthera mcp` | An MCP server, so Claude Code, Cursor, Codex and other agents can call Penthera. Local and read-only ([docs](docs/commands/mcp.md)) |
| AI mode (opt-in) | A local model proposes findings where rules can't look. Penthera's rules check them, and anything unconfirmed is labelled so ([docs](docs/ai-mode.md)) |
| `penthera verify` | Checks findings from an AI security audit against Penthera's rules ([docs](docs/commands/verify.md)) |
| New detection | Python start-up code in packages, known-malicious PyPI versions, Node.js and MongoDB advisories, weak certificate keys, `X-Powered-By`, `/metrics`, directory listings, stack traces, Terraform secrets, hard-coded session secrets, code-execution sinks |
| Default scans send no attack payloads | The login burst and SQL check moved behind `--deep` |
| Signed rule packs | All four bundled packs are signed and verified on load ([docs](docs/rule-packs.md)) |
| E10 benchmark | Penthera measured on known-vulnerable apps, published as a pilot ([results](bench/known-vuln/RESULTS.md)) |

1.8.1 is a fixes-only patch on 1.8.0 (2026-10-21): runtime advisories, the
redesigned dashboard and fixes from a second independent security review. The
details are in the [CHANGELOG](CHANGELOG.md).

## Next

Ordered, not dated. Each item names the user question it answers.

### Measure on real code (research track)

| Item | Question it answers | State |
|---|---|---|
| Penthera Bench v1 and experiment E1 | "How accurate is it on code like mine?" | Pre-registered; tooling in review ([#61](https://github.com/danoszz/penthera/pull/61)) |
| Pre-registrations for E2 to E5 | "Will the next feature actually help?" | Drafts in review ([#61](https://github.com/danoszz/penthera/pull/61)) |
| The registered E10 run | "How much does it find in apps it has not seen?" | Pilot published; protocol is a draft ([E10](docs/research/prereg/E10-known-vulnerable-apps.md)) |
| E9: AI mode against rules alone | "Does AI mode find more?" | Planned; AI mode stays opt-in until it is measured |
| Harness audit: a checklist, planned `harness-*`, `sandbox-*` and `scorer-*` rules, experiments E7 and E8 | "Am I running my AI agents properly?" | Specs in review: [checklist](docs/agents-safely.md), [rule spec](docs/research/spec-harness-rules.md), [E8 draft](docs/research/prereg/E8-harness-guardrails.md). No rule code before approval |
| Real-world precision and recall, with intervals | "Can I trust a clean report?" | After E1 runs; published whatever the result |

### Before you deploy

| Item | Question it answers |
|---|---|
| A confirmation gate and rate limit for active modes | "Can `--deep` hit the wrong host by mistake?" In review ([#95](https://github.com/danoszz/penthera/pull/95)) |
| `penthera ship` | "Is this build safe to ship?" One pass or fail over repo scan, `deps`, `agents` and a localhost or preview scan |
| Preview-deployment scanning | "Is this pull request safe?" A GitHub Action that waits for the Vercel, Netlify or Cloudflare Pages preview, scans it and comments the result |
| Framework presets | "Why is my first scan empty?" Routes, auth flows and headers for Next.js, SvelteKit, Remix, Nuxt and Astro |
| Authenticated preview scans | "Can it test pages behind a login?" With test accounts from your own seed data, never real credentials |

### After you ship

| Item | Question it answers |
|---|---|
| `penthera watch` | "Did anything change in production?" Scheduled, non-destructive checks for certificate expiry, header and CSP regressions, new endpoints, keys in bundles |
| New-CVE alerts for your SBOM | "Is something I shipped now known to be vulnerable?" As a reviewed rule-pack update or an opt-in advisory lookup |
| Alerts where you already look | A GitHub issue, the job summary or a local notification. Nothing leaves your infrastructure |
| Dashboard history | Posture over time in `penthera ui`, fed by `watch` runs |

### Open for contributors

| Item | State |
|---|---|
| JS bundle key scan | Open ([#6](https://github.com/danoszz/penthera/issues/6)) |
| LLM endpoint configuration checks | Parked; needs a narrower design |

## Later

- **Team pack.** Shared policy files, a faster signed rule-pack channel and a
  self-hostable dashboard. The single-machine tool stays complete and MIT.
- **A public, signed registry** of scan results for popular skills and MCP
  servers. It would be a hosted service, so it would live outside the offline
  core, if it happens at all.
- **Earlier candidates:** risk-based prioritization, an MFA probe, a CyFun
  adapter for Belgium, exploit-chain explanations, transitive SBOM entries and
  container images, an authorized-versus-unauthorized IDOR baseline, and
  document export for non-technical owners.

## Not planned

- **Workspace API integrations (Microsoft 365, Google).** They would need OAuth,
  stored tokens and accounts. Running offline with no accounts is a deliberate
  property of this tool.
- **ISO 27001 Annex A mapping.** Mostly organizational controls, and it would
  dilute the NIS2 focus.
- **Telemetry, or an agent that pushes.** No usage data leaves your machine,
  and the fix loop never pushes, opens pull requests or sends your code
  anywhere. You review and push.
- **An LLM judge as the primary detector.** Published bypasses show it can be
  talked out of a finding. Rules decide; a model may only propose.
- **Active scans over MCP.** `penthera mcp` offers passive checks only, because
  it cannot confirm that a person typed the target host.
- **A hosted service.** If a hosted version ever exists, it will not remove
  anything from the local tool.

## Principles

- Works offline. Where an online source adds value it stays optional, with a
  local fallback.
- Nothing leaves your machine unless you ask: no telemetry, no auto-push, no
  remote learning.
- Never claims to certify. Output is readiness, evidence and self-assessment.
- Honest about confidence. A heuristic is labelled as one, and accuracy comes
  with an interval.
- Proportionate. A small organization can produce the evidence it needs without
  enterprise overhead.
- Authorized testing only. Anything that touches a third party stays passive
  and uses public data only.

## Shipped

The full history is in the [CHANGELOG](CHANGELOG.md). In short:

| Release | Theme | Highlights |
|---|---|---|
| 1.2.0 | Hardened releases | Trusted publishing with 2FA approval, SHA-pinned CI, CodeQL, OpenSSF Scorecard |
| 1.4.0 | AI toolchain and local loop | `penthera agents`, `penthera.lock`, `deps` and `deps --diff`, typosquat check, `--offline`, the fix loop, the install firewall, the PR-comment Action, evidence bundles, the methodology and benchmark |
| 1.5.0 | AI apps and compliance | Pre-commit hook, license policy, CRA helper and AI-BOM (shipped inside 1.6.0) |
| 1.6.0 | Hardening | Fixes from a full security review, Python `deps`, the internal audit gate, the first dashboard |
| 1.7.0 | One view, one command | The single-view dashboard, the `npx penthera` setup, the APA-cited methodology |
| 1.8.0 | Runtime advisories and review fixes | Runtime advisories, the Simple and Advanced dashboard, fixes from a second independent review, a fix loop that cannot edit its own tests |

1.3.0 was folded into 1.4.0.
