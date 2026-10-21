# Penthera documentation

> **Starter and pro.** For "where do I start, and where do I go next?"

**Penthera: your open-source cyber security agent**

The security review you never had time for. Offline, rule-based, and you can verify every finding yourself.

Teams ship apps and AI agents faster than anyone can check them, and most
security scanners offer no evidence of how well they actually work. Penthera is
an open-source R&D project that tackles both.

**Use it today.** A cyber security agent for your coding tools that runs
offline on your own machine: it checks your app, its dependencies and your AI
tooling, and fixes what it can with your approval, through a dashboard that
works for first-timers and pros alike.

**Trust it because it's measured.** Every check is tested in public,
pre-registered experiments, and the results are published, good or bad. What
holds up ships in the next release, so Penthera keeps pace with new attacks and
with EU rules such as NIS2 and the Cyber Resilience Act.

[![Walkthrough video: setup, a scan, the dashboard in Simple and Advanced mode, one fix approved, the report](../assets/walkthrough-poster.jpg)](../assets/walkthrough.mp4)

[Watch the 80-second walkthrough](../assets/walkthrough.mp4) of `npx penthera`, a scan, `penthera ui --demo`, a fix approved and the report. Demo data, no sound, captions in the video ([as text](../assets/walkthrough.vtt)).

## Start here

Each step answers one question. Start at the top and stop when you have what
you need.

### Starter: is it safe?

| # | Your question | Run | Read |
|---|---|---|---|
| 1 | "Is my app safe to ship?" | `npx penthera` | [Set up in one command](commands/init.md), then [before launch](use-cases/solo-founder.md) and [scanning your app](commands/scan.md) |
| 2 | "Is this package safe to add?" | `npx penthera deps` | [Dependency risk](commands/deps.md), [the install firewall](commands/install.md) |
| 3 | "Is this MCP server or skill safe?" | `npx penthera agents --home` | [Auditing your AI tooling](commands/agents.md), [the AI-tooling supply chain](use-cases/ai-coding-teams.md) |
| 4 | "Can I see it all in one place?" | `npx penthera ui` | [The local dashboard](dashboard.md) |
| 5 | "Can my coding agent run it for me?" | `npx skills add danoszz/penthera` | [Penthera as an Agent Skill](commands/skill.md) |

### Pro: make it part of how you work

| # | Your question | Read |
|---|---|---|
| 6 | "How do I put it in CI?" | [The GitHub Action](commands/action.md), [scan in CI](commands/scan.md#ci-integration), [the pre-commit hook](commands/hook.md), [example workflows](examples/github-actions-scan.yml) |
| 7 | "How do I tune the rules?" | [Scan configuration](commands/scan.md#configuration), [rule packs](rule-packs.md), [OWASP WSTG coverage](owasp-wstg-coverage.md) |
| 8 | "How do I run the fix loop?" | [Fixing what it finds](commands/fix.md), [the local loop and its memory](local-loop.md) |
| 9 | "What do I give my auditor?" | [Evidence bundles and audience reports](evidence.md), [NIS2](compliance-nis2.md), [the CRA and AI-BOM](compliance-cra.md), [EU SMEs](use-cases/eu-sme-compliance.md) |
| 10 | "What does it send over the network?" | [Privacy and network use](privacy.md) |

### Verify it: how do you know it works?

| Your question | Read |
|---|---|
| "How does it decide, and what can't it see?" | [Methodology](METHODOLOGY.md), [known limitations](METHODOLOGY.md#known-limitations) |
| "How accurate is it?" | [Benchmark](../bench/README.md), [latest results](../bench/RESULTS.md), [E1 pre-registration](research/prereg/E1-real-world-accuracy.md) |
| "What research is it based on?" | [References](references.md) ([BibTeX](references.bib)), [how to cite](METHODOLOGY.md#how-to-cite) |
| "What will you measure next?" | [Research plan](vision-2.0.md), [plan for Phase A](research/plan-1.8.md) |
| "Why was it built this way?" | [Manifesto and FAQ](MANIFESTO.md) |
| "How much of it did AI write?" | [Use of generative AI](genai.md) |
| "How does it compare to the tool I use?" | [Comparisons](compare/README.md) |

## By situation

| You are | Start with |
|---|---|
| A solo founder about to launch | [Before launch](use-cases/solo-founder.md) |
| A team adopting Claude Code or Cursor | [The AI-tooling supply chain](use-cases/ai-coding-teams.md) |
| Running AI agents on your code, in CI or in an eval | [Running AI agents safely](agents-safely.md) |
| An open-source maintainer | [For maintainers](use-cases/open-source-maintainers.md) |
| An EU SME with NIS2 or CRA duties | [Evidence for NIS2 and the CRA](use-cases/eu-sme-compliance.md) |
| An agency shipping client apps | [A repeatable handover check](use-cases/agencies.md) |

Every command and flag: [commands/](commands/README.md).

## The project

| Page | For |
|---|---|
| [Roadmap](../ROADMAP.md) | What ships next, and the current feature freeze |
| [CONTRIBUTING](../CONTRIBUTING.md) | Setup, tests, the release cadence and checklist |
| [Voice guide](voice.md) | How Penthera's docs and messages are written |
| [Internal audit](internal-audit.md) | The release gate, and its [latest report](../audit/REPORT.md) |
| [Marketing automation](marketing.md) | What runs on a schedule, and what a person still posts |
| [Funding](funding/sponsor-tiers.md) | Sponsor tiers, the [partner brief](funding/partner-one-pager.md) and the [due diligence checklist](funding/due-diligence-checklist.md) |
| [CHANGELOG](../CHANGELOG.md) | Every release |
| [Archive](archive/README.md) | Finished and superseded plans |
| [SECURITY](../SECURITY.md) | Reporting a vulnerability in Penthera itself |

## Programmatic API

```javascript
import { loadTemplatesFromPaths, runTemplateScan } from "penthera/plugins";
import { runAdaptiveProbes } from "penthera/adaptive";
```

The exports are in `lib/plugins.js` and `lib/blackbox/adaptive-scan.js`, both
shipped in the npm package. The npm package ships only `docs/examples/` from
this folder; the rest of the docs live on GitHub.

Only scan systems you own or are authorized to test.
