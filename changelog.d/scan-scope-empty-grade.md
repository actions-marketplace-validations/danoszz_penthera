section: Security

- **`scan_url` over MCP now stays in scope on every request and redirect hop,
  with or without `--offline`.** It reaches the target and hosts you listed with
  `--allow-host`. A redirect may also move within the target's registrable
  domain. It refuses any other host and names it under **Not checked** and in
  `blocked_hosts`. It now uses the vendored Retire.js snapshot, never a download.
- **`penthera agents` gives no grade when it finds no agent config.** It used to
  report A, 100 and `Nothing to fix`. It now reports `Nothing to assess`, and the
  CLI, reports, brief, MCP, `init` and dashboard all show no grade. A project
  with any agent config is graded as before.
