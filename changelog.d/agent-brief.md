section: Added

- **The agent brief: one short reply for your AI assistant.** After a scan,
  assistants used to write their own summary of a long report, and had to sort
  out the noise themselves. The brief does that with rules: a verdict (`Fix
  now`, `Review` or `Nothing to fix`), then Act on, Check first, Likely noise,
  Not checked and Next. Hits in gitignored files, build output and test
  fixtures are grouped as likely noise, repeats collapse into one line, and
  every finding is counted once. A scan prints it when stdout is not a terminal
  (an agent calling the CLI; `PENTHERA_BRIEF=0` turns that off), or anywhere
  with `--brief`. Also in the JSON report (`brief`), as `--audience agent`, as
  the text of every MCP tool result, and merged across scans with `penthera
  brief repo.json deps.json agents.json`. The MCP server and the Agent Skill
  ask the assistant to keep the brief's sections and put its own view under
  "My read". See [docs/commands/brief.md](docs/commands/brief.md).
