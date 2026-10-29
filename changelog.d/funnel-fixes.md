section: Changed

- **The plugin and the repo's MCP config pin a stable release.**
  `plugin/.mcp.json` and `.mcp.json` start `penthera@2.0.0`, not the release
  candidate. The docs and examples that pinned `penthera@1.8.1` or `latest` now
  pin 2.0.0. The internal audit accepts the newest stable pin in these two
  files while the package is a release candidate.
- **Docs: a GitHub Action snippet that is valid YAML.** `docs/commands/action.md`
  shows the action pinned to the v2.0.0 commit SHA, with its name in quotes.
  The name contains a colon, so the unquoted snippet on the Marketplace page
  fails to parse. The page also says that `mode: agents` runs `npm ci` for its
  one dependency. The README now shows "Start in 30 seconds" before the
  benchmark tables and drops the dated "new in 1.9.0" labels.
