section: Added

- **`penthera agents` checks five more ways agent config runs code
  ([ADR 0002](docs/decisions/0002-agent-setup-gaps-and-pr-check.md)).**
  New rules, each with a test on a defanged fixture:
  `task-folder-open` (a `.vscode/tasks.json` task with `runOn: "folderOpen"`,
  medium, high when `task.allowAutomaticTasks` is on, critical when it
  downloads and runs code); `hook-local-script` (a hook that runs a script
  file, low when the script is in the project and was read, medium when it
  is not); `registry-redirect` (`npm config set registry`, `--registry`,
  `.npmrc`, `NPM_CONFIG_REGISTRY`, `YARN_REGISTRY`, `npmRegistryServer`,
  `pip --index-url`, `--extra-index-url`, `-i` and `PIP_INDEX_URL` pointing
  anywhere but the public npm, Yarn and PyPI registries); `env-code-injection`
  (`NODE_OPTIONS` with `--require` or `--import`, `LD_PRELOAD`,
  `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `PYTHONSTARTUP` and similar, in an MCP
  server's `env`, a hook, a task or the Claude Code settings `env`); and
  `mcp-auto-approve` (Cline `autoApprove`, Roo Code `alwaysAllow`, Gemini CLI
  `trust: true`, Claude Code `enableAllProjectMcpServers` and VS Code
  `chat.tools.global.autoApprove`). It now also reads `.gemini/settings.json`,
  `.roo/mcp.json`, `.vscode/tasks.json` and `.vscode/settings.json`.
- Fixed: skill folders no longer skip `__pycache__`, `build` and `dist`, so a
  compiled `.pyc` there is reported and pinned. `node_modules` and `.git` are
  still skipped, and the result now says so.
- Fixed: the "Not checked" part of an agents result no longer says nothing
  was skipped. It always says MCP tool descriptions are not read, and it
  names agent config on disk that no rule covers yet (Codex, Cursor hooks,
  Windsurf, Kiro, OpenCode, dev containers and others).
- Fixed: no finding carries the OWASP MCP03 "Tool Poisoning" label any more.
  No rule reads MCP tool descriptions, so hidden text in skills now maps to
  ASI01 only, and a changed pin to MCP04 and ASI04.
