# Auditing your AI tooling: `penthera agents`

> **Starter.** For "is this MCP server or skill safe?"

## Audit your agent setup

Your AI tools run code too. `penthera agents` audits the skills, MCP servers,
hooks, permissions, plugins and rule files that Claude Code, Cursor, Claude
Desktop, VS Code and Copilot load, and grades the setup A to F.

```bash
penthera agents                 # this repo: .mcp.json, .claude/, .cursor/, AGENTS.md, CLAUDE.md, skills/
penthera agents --home          # + ~/.claude (hooks, permissions, plugins, skills), ~/.cursor/mcp.json, Claude Desktop
penthera agents ./some-skill    # vet a downloaded skill before you install it
penthera agents --pin           # write penthera.lock; later runs flag anything that changed
```

It is **offline and deterministic**: no LLM judge, no registry lookups, nothing
leaves your machine, and it never modifies the config it reads. Every verdict
is a rule you can read in [`lib/agents/`](https://github.com/danoszz/penthera/tree/main/lib/agents), so a skill can't talk
its way past it.

| Check | What it catches |
|---|---|
| Hidden content | Unicode tag characters (decoded), zero-width and bidi controls, variation-selector smuggling, text pushed past a wall of blank lines or off-screen, instructions in HTML comments, text addressed to the scanner, base64 blobs (decoded and classified), `.pyc`/archives/executables in a skill folder (by magic bytes, so a renamed `.png` doesn't hide one), symlinks that leave the folder |
| Code execution | `curl \| sh`, `wget \| bash`, `bash <(curl …)`, `eval "$(curl …)"`, `base64 -d \| sh`, `exec(base64…)`, PowerShell `iwr \| iex`, in skills, scripts, hooks and MCP launch commands |
| MCP servers | `npx -y` / `uvx` / `bunx` / `pnpm dlx` without an exact version, inline secrets in `env`, headers or args (same rules as the repo secret scan), remote servers over plain `http://` |
| Hooks & permissions | Hooks that auto-approve tool calls or pipe into a shell (including the scripts they run), `Bash(*)` and other wildcard allows, `bypassPermissions`, allow rules for `~/.ssh` and other credential files, wildcards in a skill's `allowed-tools` |
| Plugins | Marketplaces and marketplace plugins not pinned to a commit |
| Rug pulls | `--pin` writes SHA-256 hashes of every skill folder, MCP server definition, hook and installed plugin to `penthera.lock`. A later run reports what changed, appeared or disappeared |

Each finding names the OWASP [MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
and [Agentic Top 10](https://genai.owasp.org/) (ASI) ids it maps to, and the
usual `--json`, `-o`, `--markdown` and `--sarif` outputs all work. The scanner
is built for the ways LLM-judged skill scanners have been bypassed: it reads
whole files (no context window to overflow), every file in a skill folder (not
just `SKILL.md`), and treats text aimed at a reviewer as a finding rather than
an argument.

## Why these files matter

A coding agent runs with your developer's permissions. What it can do is decided
by files that rarely get reviewed: `.mcp.json`, `.claude/settings.json`, hooks,
skills, plugins, `CLAUDE.md`, `AGENTS.md` and `.cursor/` rules. Some arrive from
a teammate's pull request, some from a marketplace, some from a blog post. In
2025 and 2026 attackers used these paths: skills with instructions hidden from
human reviewers, MCP servers launched with `npx -y` on whatever version was
latest, and npm worms that wrote to `~/.claude` and ran the `claude` CLI on the
victim's machine.

`penthera deps` also flags packages that write to `~/.claude`, `~/.cursor` or
`.mcp.json`, or run the `claude`, `gemini` or `q` CLIs, which is how the
s1ngularity attack used local AI tools ([`penthera deps`](deps.md)).

## For a team

Add the [pre-commit hook](hook.md) so agent-config changes are checked before
they are committed, and the GitHub Action in `agents` mode on pull requests
([in CI](action.md)):

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

## What it does not do

- It reads configuration and files on disk. It does not watch what an agent does
  at run time, and it does not sandbox anything. For running agents, see
  [running AI agents safely](../agents-safely.md).
- It does not know whether a remote MCP server is trustworthy. It checks how the
  server is launched and configured, not what the service behind it does.
- It does not check the registries for newly published malicious skills or
  packages. A registry-watching service such as
  [Socket](../compare/socket.md) covers that.
- Its rules cover the patterns in the [methodology](../METHODOLOGY.md). A new
  trick needs a new rule and a release.

[Docs index](../index.md) · [All commands](https://github.com/danoszz/penthera/blob/main/docs/commands/README.md)
