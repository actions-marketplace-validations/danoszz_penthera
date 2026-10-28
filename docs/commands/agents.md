---
title: "Auditing your AI tooling: penthera agents"
sidebarTitle: "Agent config audit"
description: "Your AI tools run code too."
---

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
| Hidden content | Unicode tag characters (decoded), zero-width and bidi controls, variation-selector smuggling, text pushed past a wall of blank lines or off-screen, instructions in HTML comments, text addressed to the scanner, base64 blobs (decoded and classified), `.pyc`/archives/executables in a skill folder (by magic bytes, so a renamed `.png` doesn't hide one), symlinks that leave the folder. Every file in a skill folder is read, `__pycache__`, `build` and `dist` included; only `node_modules` and `.git` are skipped, and the result lists them under Not checked |
| Code execution | `curl \| sh`, `wget \| bash`, `bash <(curl …)`, `eval "$(curl …)"`, `base64 -d \| sh`, `exec(base64…)`, PowerShell `iwr \| iex`, in skills, scripts, hooks and MCP launch commands |
| MCP servers | `npx -y` / `uvx` / `bunx` / `pnpm dlx` without an exact version, inline secrets in `env`, headers or args (same rules as the repo secret scan), remote servers over plain `http://`. Read from `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json` and `.roo/mcp.json` |
| Hooks & permissions | Hooks that auto-approve tool calls or pipe into a shell (including the scripts they run), hooks that run a local script file, `Bash(*)` and other wildcard allows, `bypassPermissions`, allow rules for `~/.ssh` and other credential files, wildcards in a skill's `allowed-tools` |
| Auto-run and auto-approve | VS Code tasks that run when the folder opens, MCP auto-approve keys (`autoApprove`, `alwaysAllow`, `trust: true`), Claude Code `enableAllProjectMcpServers`, VS Code `chat.tools.global.autoApprove` |
| Environment and registries | `NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `PYTHONSTARTUP` and similar in an MCP server's `env`, a hook, a task or the settings `env`; a skill, hook, plugin or MCP config that points npm, Yarn or pip at another registry |
| Plugins | Marketplaces and marketplace plugins not pinned to a commit |
| Rug pulls | `--pin` writes SHA-256 hashes of every skill folder, MCP server definition, hook and installed plugin to `penthera.lock`. A later run reports what changed, appeared or disappeared |

### Rules for auto-run, registries and environment

Each rule below is deterministic. The finding says why it matters and how to
fix it.

| Rule | Severity | Why | How to fix |
|---|---|---|---|
| `task-folder-open` | medium; high when the workspace sets `task.allowAutomaticTasks: "on"`; critical when the task downloads and runs code | VS Code runs a task with `runOptions.runOn: "folderOpen"` when a trusted workspace opens. By default it asks once per folder ([VS Code tasks](https://code.visualstudio.com/docs/editor/tasks)). Medium, because one click on that prompt runs a command from the repository. | Remove `runOn`, or run the task by hand. |
| `hook-local-script` | low when the script is in the project and was read; medium when it is outside the project or missing | The hook runs a script file on every matching event with no prompt. Low when Penthera read the script: its content went through the hook rules, and a change shows up in code review. Medium when nobody can read it here. A changed script does not change the settings file or `penthera.lock`. | Keep hook scripts in the repository and review them like code. |
| `registry-redirect` | high in skills, rule files and hooks; medium in MCP configs, settings `env` and plugin `.npmrc` files | Another registry decides what every later `npm install` or `pip install` gets. Medium where a team may point at its own mirror on purpose. `registry.npmjs.org`, `registry.yarnpkg.com` and `pypi.org` are never flagged, and a `$VARIABLE` value cannot be resolved offline, so it is not flagged either. | Remove it. Set a company mirror in your own user config. |
| `env-code-injection` | high | `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `PYTHONSTARTUP`, `PERL5OPT`, `RUBYOPT -r`, `JAVA_TOOL_OPTIONS -javaagent` and `NODE_OPTIONS` with `--require` or `--import` load code into every process started with them. `NODE_OPTIONS=--max-old-space-size=4096` is not flagged. | Remove it from the config. Set it in your own shell if a tool needs it. |
| `mcp-auto-approve` | high for `trust: true`, `"*"` and the VS Code switch; medium for a list of named tools and for `enableAllProjectMcpServers` | These keys skip the prompt before a tool call or a server start: Cline `autoApprove` ([Cline docs](https://docs.cline.bot/mcp/configuring-mcp-servers)), Roo Code `alwaysAllow` ([Roo Code docs](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo)), Gemini CLI `trust: true` ([Gemini CLI docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)), Claude Code `enableAllProjectMcpServers` ([settings](https://code.claude.com/docs/en/settings)) and VS Code `chat.tools.global.autoApprove` ([Copilot settings](https://code.visualstudio.com/docs/copilot/reference/copilot-settings)). Cursor and Windsurf document no per-server auto-approve key in their MCP config. | Approve tools one by one. List reviewed servers in `enabledMcpjsonServers`. |

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
- It does not check MCP tool descriptions. It never starts a server, so
  instructions hidden in a tool's description (tool poisoning, OWASP MCP03)
  are not checked, and no finding carries the MCP03 label. Every agents
  result says so under Not checked.
- It does not read every agent's config yet. Codex `config.toml`, Cursor
  `hooks.json`, Windsurf, Continue, Kiro, Amazon Q, OpenCode, Zed and dev
  container files are listed under Not checked when they exist, instead of
  being read.
- It does not check the registries for newly published malicious skills or
  packages. A registry-watching service such as
  [Socket](../compare/socket.md) covers that.
- Its rules cover the patterns in the [methodology](../METHODOLOGY.md). A new
  trick needs a new rule and a release.

[Docs index](../index.md) · [All commands](https://github.com/danoszz/penthera/blob/main/docs/commands/README.md)
