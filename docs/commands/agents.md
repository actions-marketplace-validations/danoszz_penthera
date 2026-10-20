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
is a rule you can read in [`lib/agents/`](../../lib/agents/), so a skill can't talk
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

[Back to the README](../../README.md) · [All commands](README.md)
