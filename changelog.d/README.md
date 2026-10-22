# Changelog fragments

Each pull request adds **one file here** instead of editing `CHANGELOG.md`, so
parallel pull requests never conflict on the changelog.

Name it after the change, for example `changelog.d/mcp-server.md`:

```markdown
section: Added

- **`penthera mcp`: an MCP server for coding agents.** What changed for users,
  in the voice of [docs/voice.md](../docs/voice.md).
```

Sections, in release order: Security, Added, Detection, Changed, Fixed,
Removed, Site, Docs.

`npm run changelog` checks every fragment (it also runs in `npm test`). At
release time, `npm run changelog -- --release <version> <YYYY-MM-DD>` moves
them into `CHANGELOG.md` and deletes the files.
