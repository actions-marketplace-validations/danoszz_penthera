section: Docs

- **Ready for the Docker and Cline MCP catalogs.** `llms-install.md` gives
  Cline the `cline_mcp_settings.json` block, the Node.js 22 requirement and
  what the tools may do. `docs/commands/mcp.md` shows how to run the server in
  a container, where client roots are host paths: the server drops roots it
  cannot find and falls back to `--root`, now covered by a test. The Docker
  image's description is the approved one-liner, and `site/tools/logo.mjs`
  renders the 400 × 400 logo at `assets/penthera-logo-400.png`.
