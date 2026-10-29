section: Fixed

- **`penthera agents`: a git source counts as pinned only with a full commit.**
  An MCP server launched from `git+https://…`, `git+ssh://…`, `github:owner/repo`
  or `owner/repo` was treated as pinned. It now needs a full 40-character commit
  SHA (`#<sha>` for npm, `@<sha>` for uv and pip). A tag or a branch can be moved
  to other code, so `uvx --from git+https://…@v1.2` and `npx github:owner/repo#main`
  are reported as `mcp-unpinned`.
- **The Penthera skill pins its own CLI.** `skills/penthera/SKILL.md` and its
  preflight script run `npx -y penthera@2.0.0`, and `allowed-tools` pre-approves
  only that pinned command.
