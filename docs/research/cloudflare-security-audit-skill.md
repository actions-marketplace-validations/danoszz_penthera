# Research: Cloudflare's security-audit skill, and what Penthera does with it

Written 2026-10-22. Status: **research input, not a plan.** The maintainer
decides what moves to the [roadmap](../../ROADMAP.md). The side-by-side for
users is in [docs/compare/cloudflare-security-audit.md](../compare/cloudflare-security-audit.md).

Source: [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)
at commit `c1c8a8c` (2026-09-14), MIT. Created 2026-06-18; 37,173 stars and
2,318 forks on 2026-10-22 (GitHub API). Every claim below comes from that
repository's README and files.

## What it is

A skill for coding agents, installed with `npx skills add`. It is guidance by
default, and runs a six-phase audit only when asked for a full audit:
reconnaissance, coverage-led hunting by isolated sub-agents, validation by a
fresh agent that tries to disprove each candidate, structured `findings.json`,
independent re-verification, and reporting. Findings end as `confirmed`,
`needs_validation` or `rejected`, checked against `report-schema.json` by a
zero-dependency validator. A coverage ledger records which units were examined,
and repeated runs add to it. Target code runs only inside an OS-enforced
sandbox with no network, an allowlisted environment and resource limits;
without one, leads stay `needs_validation`. Deployed endpoints are never
probed. The only accuracy statement: one run found "roughly half" of what
repeated runs found together.

## Is it a competitor?

**For attention, yes; for the job, mostly not.** It is the most visible "AI
security audit" tool for coding agents, and it sits in the same place
Penthera's own skill does. But it is a method for a model to review source.
Penthera is a deterministic tool that also looks outside the source. They
overlap on one question, "is there a vulnerability in my code?", and answer it
in opposite ways:

| | Skill | Penthera |
|---|---|---|
| Decision maker | Model, checked by more models | Readable rules; models only propose fixes |
| Strength | Novel and logic flaws, any language | Known classes, fast, repeatable, measured |
| Weakness | Run-to-run variance, model cost, no live checks | Misses what no rule describes |
| Scope | Source only | Source, live app, dependencies' behaviour, AI tooling config, fixes, evidence |

This matches Penthera's founding decision: models propose, deterministic checks
decide ([manifesto](../MANIFESTO.md), decision 2). The skill is the strongest
public example of the "models propose" half. Penthera is the "checks decide"
half. Positioned that way, they complement each other.

## How Penthera can build on it

Ordered by value per hour. None of this changes Penthera's rules: no model
decides a finding, nothing leaves the machine by default.

| # | Idea | What it gives users | Size |
|---|---|---|---|
| 1 | **Read the skill's `findings.json`** into Penthera's report and dashboard as `needs-human-review` findings with source `llm-audit`, next to Penthera's own | One place to triage both; clear labels for which finding came from a model | Small: a parser plus schema validation |
| 2 | **Re-check with rules where one exists.** When a skill finding maps to a Penthera rule (secrets, headers, CORS, dependency behaviour, MCP config), run that rule and mark the finding "confirmed by rule" or "not reproduced by rule" | Turns model findings into deterministic evidence where possible. This is the propose-and-verify pattern from E3, applied to someone else's model | Medium |
| 3 | **Write Penthera findings in the skill's schema** (`penthera --format security-audit-findings`), so an agent running the skill starts from Penthera's results as seeds for reconnaissance and skips what rules already cover | Cheaper, faster audits; the model spends its time where rules can't look | Small |
| 4 | **A coverage section in Penthera's reports:** what was checked and what was not (no rule for this framework, version hidden, package unreadable) | Honest about blind spots, like the skill's coverage ledger | Small |
| 5 | **Adopt the sandbox rules for `--run-tests`** in the fix loop: no network, an allowlisted environment, scratch `HOME`, resource limits | Running a project's tests is running untrusted code; this is a real hardening | Medium |
| 6 | **Publish Penthera's skill to the same channel** (`npx skills add …`), next to the plugin and marketplace routes | Reach where agent users already look | Small |
| 7 | **Mine the attack-class files for rule ideas.** The AI and LLM classes (tool and action abuse, MCP trust, output disclosure) and the supply-chain and release classes map onto `penthera agents` and `deps`. Each candidate becomes a rule only if it can be checked deterministically | Fills known gaps in rule coverage | Ongoing |

Items 1–3 together are the differentiator: **Penthera as the verifier and the
fast first pass for LLM audits**, not a rival to them.

## Research: measure it, don't argue about it

A new experiment fits the existing program (see [vision-2.0.md](../vision-2.0.md)):

- **E9: deterministic rules, LLM audit, and both.** On the E1 corpus (real
  projects, two blinded labellers), compare Penthera alone, the skill alone
  (fixed model and settings, recorded), and both. Primary outcomes: precision
  and recall with Wilson intervals, per class of finding. Secondary outcomes:
  run-to-run agreement (Cohen's κ across three runs of the skill), time and
  model cost per project, and the share of skill findings that a Penthera rule
  confirms or contradicts.
- Hypotheses to pre-register: the combination has higher recall than either
  alone; Penthera's precision is higher on the classes it covers; the skill finds
  classes Penthera has no rule for.
- Safety: static analysis of public repositories in a sandbox, as in E1. No
  live probing. The skill's own sandbox rules already forbid it.
- Publish whatever comes out, including a result where the skill beats the rules.

## Messaging

Honest, and specific:

> Cloudflare's skill asks a model to think like an auditor. Penthera runs
> readable checks that give the same answer every time, checks your running app
> and your dependencies, and verifies its fixes. Use the skill for depth, and
> Penthera every day and to confirm what a model finds.

Never claim Penthera finds more. Penthera's accuracy is measured only on labs we
wrote ourselves; the comparison waits for E9.

## Sources

- Cloudflare. (2026). *security-audit-skill* [Computer software]. GitHub.
  https://github.com/cloudflare/security-audit-skill/tree/c1c8a8c
- Repository metadata: GitHub REST API, `repos/cloudflare/security-audit-skill`,
  read 2026-10-22.
