section: Changed

- **The Claude Code plugin now installs from a small `plugin/` folder.** It holds
  the Penthera skill, the pinned MCP server, a README, the licence and an icon,
  and nothing else: no `package.json`, no `bin/`, no test fixtures. It is also
  the folder Anthropic's plugin directory reviews. The skill now pre-approves only
  Penthera's own commands (`penthera`, `npx -y penthera`, `npx --no-install
  penthera`) and reading files; Claude asks before it edits a file or runs
  anything else. A test keeps the folder's copy of the skill identical to
  `skills/penthera`.
