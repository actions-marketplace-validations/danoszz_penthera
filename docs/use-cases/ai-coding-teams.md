# The AI-tooling supply chain: for teams adopting Claude Code or Cursor

## The problem

A coding agent runs with your developer's permissions. What it can do is decided
by files that rarely get reviewed: `.mcp.json`, `.claude/settings.json`, hooks,
skills, plugins, `CLAUDE.md`, `AGENTS.md` and `.cursor/` rules. Some of these
arrive from a teammate's pull request, some from a marketplace, some from a
blog post. In 2025 and 2026 attackers used exactly these paths: skills with
instructions hidden from human reviewers, MCP servers launched with `npx -y` on
whatever version was latest, and npm worms that wrote to `~/.claude` and ran the
`claude` CLI on the victim's machine.

## What to run

```bash
npx penthera agents --home         # this repo plus your user-level Claude Code, Cursor and Claude Desktop config
npx penthera agents ./some-skill   # vet a downloaded skill before you install it
npx penthera agents --pin          # record hashes in penthera.lock; later runs show what changed
```

For a team, add the pre-commit hook so agent-config changes are checked before
they are committed, and the GitHub Action in `agents` mode on pull requests:

```bash
npx penthera hook install
```

```yaml
- uses: danoszz/penthera@<release-commit-sha>
  with:
    mode: agents
```

## What you get

From Penthera's own test fixture of a deliberately bad setup (abridged):

```
  Grade       F  (0/100)
  Found      1 skills · 4 MCP servers · 3 hooks · 0 plugins · 1 rule files
  Lock       none (run with --pin)

  CRIT  MCP server "installer" launches by downloading and running code
         .mcp.json
  CRIT  SessionStart hook downloads and runs code
         .claude/settings.json
  HIGH  Instructions hidden in an HTML comment
         skills/helper/SKILL.md
  HIGH  Text addressed to a security scanner
         skills/helper/SKILL.md
  HIGH  PreToolUse (*) hook auto-approves tool calls
         .claude/settings.json
  HIGH  Permission allow-list grants `Bash(*)`
         .claude/settings.json
  MED   MCP server "filesystem" runs an unpinned package via npx
         .mcp.json
```

Each finding names the OWASP MCP Top 10 and Agentic Top 10 ids it maps to, and
the rule that fired is readable in [`lib/agents/`](../../lib/agents/). The audit
is offline and read-only: no model judges the skill, so a skill cannot talk its
way past it. [More on `penthera agents`](../commands/agents.md).

`penthera deps` also flags packages that write to `~/.claude`, `~/.cursor` or
`.mcp.json`, or run the `claude`, `gemini` or `q` CLIs, which is how the
s1ngularity attack used local AI tools. [More on `penthera deps`](../commands/deps.md).

## What it does not do

- It reads configuration and files on disk. It does not watch what an agent does
  at run time, and it does not sandbox anything.
- It does not know whether a remote MCP server is trustworthy. It checks how the
  server is launched and configured, not what the service behind it does.
- It does not check the registries for newly published malicious skills or
  packages. A registry-watching service such as
  [Socket](../compare/socket.md) covers that.
- Its rules cover the patterns in the [methodology](../METHODOLOGY.md). A new
  trick needs a new rule and a release.

[All use cases](README.md) · [Back to the README](../../README.md)
