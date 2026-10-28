section: Added

- **`penthera agents` checks five more ways agent config runs code
  ([ADR 0002](docs/decisions/0002-agent-setup-gaps-and-pr-check.md)).**
  New rules, each with a test on a defanged fixture:
  `task-folder-open` (a `.vscode/tasks.json` task with `runOn: "folderOpen"`,
  medium, critical when it downloads and runs code); `hook-local-script` (a hook that runs a script
  file, low when the script is in the project and was read, medium when it
  is not); `registry-redirect` (`npm config set registry`, `--registry`,
  `.npmrc`, `NPM_CONFIG_REGISTRY`, `YARN_REGISTRY`, `npmRegistryServer`,
  `pip --index-url`, `--extra-index-url`, `-i` and `PIP_INDEX_URL` pointing
  anywhere but the public npm, Yarn and PyPI registries over HTTPS; low for a
  `localhost` registry, a scoped `@scope:registry` and vendor indexes such as
  `download.pytorch.org`, at most medium for `--extra-index-url`); `env-code-injection`
  (`NODE_OPTIONS` with `--require` or `--import`, `LD_PRELOAD`,
  `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `PYTHONSTARTUP` and similar, in an MCP
  server's `env`, a hook, a task or the Claude Code settings `env`); and
  `mcp-auto-approve` (Cline `autoApprove`, Roo Code `alwaysAllow`, Gemini CLI
  `trust: true`, Claude Code `enableAllProjectMcpServers` and VS Code
  `chat.tools.global.autoApprove`). It now also reads `.gemini/settings.json`,
  `.roo/mcp.json`, `.vscode/tasks.json` and `.vscode/settings.json`.
- Fixed: skill folders no longer skip `__pycache__`, `build` and `dist`, so
  compiled code there is reported. A `.pyc` compiled from a `.py` next to it
  is low, one without its source high. `node_modules`, `.git` and Python
  virtual environments (`.venv`, `venv`, any folder with `pyvenv.cfg`) are
  still skipped, and the result now says so.
- Fixed: `penthera.lock` is now version 2, which pins `dist` and `build` in a
  skill and leaves out `__pycache__`. A version 1 file is still compared the
  2.0.0 way, so upgrading never reports a changed skill; an info finding asks
  you to re-pin with `penthera agents --pin`.
- Fixed: hooks written as `"$CLAUDE_PROJECT_DIR"/.claude/hooks/x.sh`, the
  form Claude Code documents, now resolve to the script, so the hook rules
  read it. `node_modules/.bin/*` counts as a package binary, not a missing
  script.
- Fixed: `penthera agents` no longer reads a hook script or a config file
  that resolves outside the project (or the plugin folder), by absolute path
  or through a symlink; it lists them under Not checked. Parse errors no
  longer quote the file's content.
- Fixed: the pre-commit hook now runs the agent rules on staged
  `.vscode/tasks.json`, `.vscode/settings.json`, `.gemini/settings.json` and
  `.roo/` files.
- Fixed: `penthera agents --home` reads Cline's and Roo Code's MCP settings
  from VS Code's global storage, so their `autoApprove` and `alwaysAllow` keys
  are checked there too.
- Fixed: `penthera init` no longer writes a workflow or `.gitignore` through a
  symlink, a dangling one included.
- Fixed: a long run of spaces after `registry` in an `.npmrc` no longer slows
  the scan, the pre-commit hook or the MCP tool (the match was quadratic).
- Fixed: the "Not checked" part of an agents result no longer says nothing
  was skipped. It always says MCP tool descriptions are not read, and it
  names agent config on disk that no rule covers yet (Codex, Cursor hooks,
  Windsurf, Kiro, OpenCode, dev containers and others).
- Fixed: no finding carries the OWASP MCP03 "Tool Poisoning" label any more.
  No rule reads MCP tool descriptions, so hidden text in skills now maps to
  ASI01 only, and a changed pin to MCP04 and ASI04.
