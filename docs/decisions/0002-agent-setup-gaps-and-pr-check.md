---
title: "ADR 0002: close agent-setup gaps and check every pull request"
sidebarTitle: "ADR 0002: agent-setup gaps"
description: "Which agent-setup attacks Penthera now checks, which it still does not, and why the check belongs on every pull request."
---

> **Project page.** For maintainers and researchers asking "which agent-setup
> attacks does `penthera agents` miss, and what changed?"

| | |
|---|---|
| Status | Accepted by the maintainer (Daan van der Zwaag), 2026-10-28 |
| Date | 2026-10-28 |
| Context | An outside check of `penthera agents` against published attacks, reproduced on defanged fixtures in this repository |
| Authors | Daan van der Zwaag decides. Drafted with Claude (AI-assisted) |

## Context

`penthera agents` checks the files that tell coding agents what to run:
hooks, permissions, rule files, skills, MCP configs and plugins. A check of
published attacks found gaps, each reproduced on a fixture:

1. VS Code tasks that run when a folder opens (`.vscode/tasks.json` with
   `runOn: "folderOpen"`) were not read. The output still said nothing was
   skipped.
2. A hook that runs a local script file was reported only as drift, after
   `--pin`.
3. Nothing flagged a skill or hook that points the package manager at
   another registry.
4. Nothing flagged `NODE_OPTIONS`, `LD_PRELOAD` and similar variables in an
   MCP server's environment, or auto-approve settings in MCP configs.
5. Skill folders skipped `__pycache__`, `build` and `dist`, so a compiled
   file there was never seen.
6. Some findings carried the OWASP MCP "Tool Poisoning" label although no
   rule reads tool descriptions.

## Decision

- Add a deterministic rule with a defanged fixture and a test for gaps 1 to 5.
- Remove the Tool Poisoning label from rules that do not read tool
  descriptions. Say plainly that tool-description poisoning is not checked.
  A future rule may read a `tools/list` snapshot the user supplies; Penthera
  will not start servers or fetch anything (AGENTS.md rule 5).
- Ship a one-file pull-request workflow that runs `penthera agents` through a
  pinned `npx`, so the check runs where agent configs change.

## Consequences

More findings on repositories that use VS Code tasks, hook scripts or MCP
environment variables; each finding says why and how to fix it. Coverage
claims stay narrower than before on tool poisoning, which is the honest
state.
