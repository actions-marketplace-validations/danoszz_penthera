section: Added

- **The agent config check on every pull request, in one file.**
  `docs/examples/github-actions-agents.yml` runs
  `npx --yes penthera@2.0.0 agents` on pull requests and pushes to `main`,
  uploads SARIF to code scanning and stays report-only until you opt in to
  failing the job. `penthera init` offers to write it as
  `.github/workflows/penthera-agents.yml` when the repo has agent config. It is
  shown as a diff first and never committed.
