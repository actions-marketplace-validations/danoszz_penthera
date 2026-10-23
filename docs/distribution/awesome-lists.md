# Awesome lists

> **Project page.** For the maintainer asking "which curated lists fit Penthera, and what exactly do we send each one?"

Drafts. Nothing has been submitted. Each list's rules and current format were
read on 23 October 2026 from its CONTRIBUTING file, PR template or issue form,
and the entries below copy the format of real entries in the target section.
Read the rules again before sending; lists change them.

| List | Route | Section | Ready? |
|---|---|---|---|
| [punkpeye/awesome-mcp-servers](#punkpeyeawesome-mcp-servers) | PR | Security | after Glama and 1.9.0 |
| [hesreallyhim/awesome-claude-code](#hesreallyhimawesome-claude-code) | issue form, by hand | Security | yes |
| [VoltAgent/awesome-agent-skills](#voltagentawesome-agent-skills) | PR | Community Skills, Specialized Domains | yes |
| [analysis-tools-dev/static-analysis](#analysis-tools-devstatic-analysis) | PR with a YAML file | linter, security | after about 30 Dec 2026 |
| [sottlmarek/DevSecOps](#sottlmarekdevsecops) | PR | SAST | yes |

## punkpeye/awesome-mcp-servers

Source: [CONTRIBUTING.md](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md)
and the `check-glama.yml` workflow that runs on every PR.

- Route: a PR that edits `README.md` only. One server per line.
- Section: `🔒 Security`, next to other scanners.
- The link text must be `owner/repo` and point to GitHub.
- Only the legend's emoji are allowed. Penthera: 📇 (TypeScript/JavaScript),
  🏠 (local service), 🍎 🪟 🐧 (macOS, Windows, Linux).
- A Glama score badge is expected; the bot labels a PR without it
  `missing-glama`. List on Glama first ([registries.md](registries.md#3-glama)).
- Placement: CONTRIBUTING says alphabetical; recent merged PRs add the line at
  the top of the section. Use alphabetical, as written.
- PR title in practice: `Add danoszz/penthera`.
- CONTRIBUTING also tells automated agents to add a marker to the PR title for
  a faster merge. This PR is sent by Daan, so leave it out.

Line:

```markdown
- [danoszz/penthera](https://github.com/danoszz/penthera) [![danoszz/penthera MCP server](https://glama.ai/mcp/servers/danoszz/penthera/badges/score.svg)](https://glama.ai/mcp/servers/danoszz/penthera) 📇 🏠 🍎 🪟 🐧 - Offline, rule-based security checks: secrets and risky code, dependency typosquats and capabilities, AI agent config (skills, MCP servers, hooks) and a passive scan of a local app. Six read-only tools.
```

PR description:

> Adds Penthera to Security. It is an MIT-licensed MCP server over stdio with six read-only tools: `scan_repo`, `check_dependencies`, `audit_ai_tooling`, `runtime_advisories`, `explain_finding` and `scan_url`. Findings come from deterministic rules, not a model. It reads only inside the workspace, never writes or runs a shell, and sends no attack payloads. Install: `npx -y penthera@1.9.0 mcp`. I maintain it.

- [ ] Approved
- [ ] Sent: date, link

## hesreallyhim/awesome-claude-code

Source: [CONTRIBUTING.md](https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md)
and the [recommend-resource issue form](https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml).

- Route: **the web issue form only.** No PRs, no `gh` CLI. The list says
  recommendations must be made by people, and accounts that break this are
  restricted. Daan fills it in by hand; the text below is a starting point.
- Eligibility: at least 14 days since the first commit with active development,
  or 100 stars. Penthera qualifies on the first.
- The description is 10 to 500 characters, descriptive, not promotional, does
  not address the reader, no emoji.
- The form has a checkbox that must stay **unchecked**. Read every box.
- The README is generated and sorted alphabetically; you do not write the line.

Fields:

- **Title:** `[Resource]: Penthera`
- **Display Name:** `Penthera`
- **Category:** `Security`
- **Link:** `https://github.com/danoszz/penthera`
- **Author Name:** `danoszz`
- **Author Link:** `https://github.com/danoszz`
- **Description:**

  > Offline, rule-based security checks as an MCP server, an Agent Skill and a CLI. Audits the project's Claude Code config (skills, MCP servers, hooks, permissions) for hidden instructions, curl-pipe-shell and inline secrets, and scans the repo and its dependencies. Tools are read-only; findings come from deterministic rules.

- [ ] Approved
- [ ] Sent by Daan: date, link

## VoltAgent/awesome-agent-skills

Chosen over ComposioHQ/awesome-claude-skills (no PR merged since May 2026,
about 1,700 open PRs) and travisvn/awesome-claude-skills (one PR merged in
2026, no AI-assisted PRs). VoltAgent merges daily and recently merged other
security skills.

Source: [CONTRIBUTING.md](https://github.com/VoltAgent/awesome-agent-skills/blob/main/CONTRIBUTING.md).

- Route: a PR. Title: `Add skill: danoszz/penthera`.
- Section: Community Skills → Specialized Domains, appended at the end.
- Format: `- **[author/skill](url)** - description`, description 10 words or fewer.
- They ask for real community usage and turn down brand-new skills. The skill
  is on skills.sh with installs; say so with the number on the day you send it.
- Their quality table: third-person description, metadata under about 100
  tokens, `SKILL.md` body under 500 lines, no absolute paths. Check
  `skills/penthera/SKILL.md` against it before sending.

Line (10 words):

```markdown
- **[danoszz/penthera](https://github.com/danoszz/penthera/tree/main/skills/penthera)** - Offline rule-based security checks for repos, dependencies and agent configs
```

PR description:

> Adds the Penthera skill to Specialized Domains. It runs Penthera's offline, rule-based checks on the user's own repo, dependencies and agent config, and a passive scan of an app they are authorized to test. Install: `npx skills add danoszz/penthera`. Listed on skills.sh with <N> installs on <date>. MIT. I maintain it.

- [ ] Approved
- [ ] Sent: date, link

## analysis-tools-dev/static-analysis

Source: [CONTRIBUTING.md](https://github.com/analysis-tools-dev/static-analysis/blob/master/CONTRIBUTING.md)
and the PR template.

- Route: a PR adding `data/tools/penthera.yml`. Do not edit `README.md`; it is generated.
- Requirements a bot checks: public for at least six months, at least 20 stars,
  more than one human contributor. The repo was created on 30 June 2026, so
  the earliest date is about **30 December 2026**, if it was public from the start.
- Tags must come from `data/tags.yml`. `uses-llm` is for tools that call a
  model while analyzing; Penthera's AI mode is opt-in and a model never
  decides a finding, so it is left out.

File:

```yaml
name: Penthera
categories:
  - linter
tags:
  - security
  - javascript
  - typescript
  - nodejs
  - skill
  - configfile
  - dotenv
license: MIT License
types:
  - cli
source: 'https://github.com/danoszz/penthera'
homepage: 'https://penthera.org'
description: >-
  Offline, rule-based security agent. Finds hardcoded secrets and AI keys,
  code-execution sinks and API routes in a repo, what each npm and Python
  dependency can do, known-malicious packages and typosquats, and risky AI
  agent config (skills, MCP servers, hooks). Reports SARIF. Also runs as an
  MCP server and an Agent Skill.
```

- [ ] Approved
- [ ] Sent: date, link

## sottlmarek/DevSecOps

Chosen over paragonie/awesome-appsec (last merge February 2025),
sbilly/awesome-security (nothing merged since January 2026, 336 open PRs) and
devsecops/awesome-devsecops (last merge 2021). sottlmarek/DevSecOps merged
third-party tools from June to August 2026.

Source: the [README's contribution rules](https://github.com/sottlmarek/DevSecOps#contribution-rules).

- Route: a PR. The description must say which tool, why, the number of stars,
  maturity and topic.
- "One tool, one topic": one section only. SAST fits best (secrets, risky code, SARIF).
- Open source only, active projects only, security tools only.
- Format: a table row with a stars badge, appended at the end of the table.

Row:

```markdown
| **Penthera** | [https://github.com/danoszz/penthera](https://github.com/danoszz/penthera) | Offline, rule-based checks for secrets, code-execution sinks, dependency capabilities and typosquats, and AI agent config (skills, MCP servers, hooks). SARIF output, MCP server and Agent Skill | ![Penthera](https://img.shields.io/github/stars/danoszz/penthera?style=for-the-badge) |
```

PR description:

> **Tool:** Penthera, https://github.com/danoszz/penthera (MIT).
> **Why:** a SAST-style scanner for the parts AI coding tools add to a repo: hardcoded AI keys, dependencies that can run code at install, and agent config such as MCP servers and hooks. Deterministic rules, offline by default, SARIF for GitHub code scanning.
> **Stars:** <N> on <date>.
> **Maturity:** released since <first release date>, <N> releases, current <version>; benchmark and method published in the repo.
> **Topic:** SAST.

- [ ] Approved
- [ ] Sent: date, link
