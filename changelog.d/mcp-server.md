section: Added

- **`penthera mcp`: Penthera as an MCP server for your coding agent.** Claude
  Code, Cursor, Codex, VS Code and Windsurf can call it over stdio. Add it
  with a pinned version: `claude mcp add penthera -- npx -y penthera@1.9.0 mcp`.
  Six read-only tools: `scan_repo`, `scan_url` (passive only),
  `check_dependencies`, `audit_ai_tooling`, `explain_finding` and
  `runtime_advisories`. Results are structured JSON plus a summary, with
  evidence at `file:line`, confidence labels and each tool's limits.
  - Tools read only inside the workspace roots, and symlinks cannot lead
    out. `scan_url` reaches loopback, or hosts you list with
    `--allow-host`; active modes are not reachable over MCP.
  - Text from scanned files has invisible characters removed and is marked
    as data, so a file cannot steer the agent through the results.
  - Speaks MCP 2026-07-28 and the earlier `initialize` versions. No new
    dependency, no port, no telemetry.
  - `server.json` and `mcpName` for the MCP Registry
    (`io.github.danoszz/penthera`). See `docs/commands/mcp.md`.
- **Secret findings carry the line number**, so reports and SARIF point at
  the line.
