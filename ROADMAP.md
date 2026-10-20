# Roadmap

> **Project page.** For anyone asking "what ships next, and when?"

This page lists what ships next and what is deliberately not being built. The
research behind it, the experiments that decide what ships, and the long-term
plan are in the [research plan](docs/vision-2.0.md). How releases are cut is in
[CONTRIBUTING.md](CONTRIBUTING.md#release-cadence-and-freeze).

Penthera is maintained part-time, alongside a PhD. Work is ordered by value per
hour, and a feature that does not serve a real user question, or does not hold
up when measured, does not ship. Issues and pull requests are welcome on
anything here.

## Now: 1.8.0, feature freeze

1.8.0 is what is on main plus the dashboard redesign
([#63](https://github.com/danoszz/penthera/pull/63)). From here only fixes go in.
It ships as `1.8.0-rc.1` on npm's `next` tag first, and as 1.8.0 only after
the release candidate holds up and the maintainer approves.

| In 1.8.0 | What it means for you |
|---|---|
| Dashboard redesign | `penthera ui` gets a Simple mode with a one-sentence verdict for first-timers, and an Advanced mode for pros |
| Smaller package | 657 kB packed instead of 797 kB; the docs live on GitHub |
| One set of docs, one voice | Each page answers one question, from "is my app safe to ship?" to "export evidence for an auditor" |

## Next

Ordered, but not dated. Each item names the user question it answers.

### Measure on real code (research track)

| Item | Question it answers | State |
|---|---|---|
| Penthera Bench v1 and experiment E1 | "How accurate is it on code like mine?" | Pre-registered; tooling in review ([#61](https://github.com/danoszz/penthera/pull/61)) |
| Pre-registrations for E2 to E5 | "Will the next feature actually help?" | Drafts in review |
| Real-world precision and recall, with intervals | "Can I trust a clean report?" | After E1 runs; published whatever the result |
| Harness audit: a checklist for running agents, planned `harness-*`, `sandbox-*` and `scorer-*` rules, experiments E7 and E8 | "Am I running my AI agents properly?" | Specs in review: [checklist](docs/agents-safely.md), [rule spec](docs/research/spec-harness-rules.md), [E8 draft](docs/research/prereg/E8-harness-guardrails.md), [background](docs/research/agent-incidents-2026.md). No rule code before approval |

### Before you deploy

| Item | Question it answers |
|---|---|
| `penthera ship` | "Is this build safe to ship?" One gate over repo scan, `deps`, `agents` and a localhost or preview scan, with a pass or fail for any deploy script |
| Preview-deployment scanning | "Is this pull request safe?" A GitHub Action that waits for the Vercel, Netlify or Cloudflare Pages preview of a PR, scans it and comments the result |
| Framework presets | "Why is my first scan empty?" Routes, auth flows and headers for Next.js, SvelteKit, Remix, Nuxt and Astro |
| Authenticated preview scans | "Can it test pages behind a login?" With test accounts from your own seed data, never real credentials |
| An MCP server | "Can my AI assistant call Penthera directly?" |

### After you ship

| Item | Question it answers |
|---|---|
| `penthera watch` | "Did anything change in production?" Scheduled, non-destructive checks for certificate expiry, header and CSP regressions, new endpoints, keys in bundles |
| New-CVE alerts for your SBOM | "Is something I shipped now known to be vulnerable?" As a reviewed rule-pack update or an opt-in advisory lookup |
| Alerts where you already look | A GitHub issue, the job summary or a local notification. Nothing leaves your infrastructure |
| Dashboard history | Posture over time in `penthera ui`, fed by `watch` runs |

### Open items from earlier releases

| Item | State |
|---|---|
| Signed rule packs | Built; waiting for the maintainer's signing key |
| JS bundle key scan | Open for contributors ([#6](https://github.com/danoszz/penthera/issues/6)) |
| LLM endpoint configuration checks | Parked; needs a narrower design |

## Later

- **A landing page.** One static page with no tracking scripts.
- **Team pack.** Shared policy files, a faster signed rule-pack channel and a
  self-hostable dashboard. The single-machine tool stays complete and MIT.
- **A public, signed registry** of scan results for popular skills and MCP
  servers. It would be a hosted service, so it would live outside the offline
  core, if it happens at all.
- **Earlier candidates:** risk-based prioritization, an MFA probe, a CyFun
  adapter for Belgium, exploit-chain explanations, transitive SBOM entries and
  container images, an authorised-versus-unauthorised IDOR baseline, and
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

1.3.0 was folded into 1.4.0. The original release plan for 1.2 to 1.4 and the
first plan to 2.0 are kept in [docs/archive/](docs/archive/README.md).
