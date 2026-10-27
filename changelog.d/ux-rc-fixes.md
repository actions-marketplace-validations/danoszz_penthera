section: Fixed

- **The GitHub Action's `mode: deps` runs again.** From 1.5.0 to 2.0.0 the CLI
  loaded the `yaml` package on every command. The action's checkout has no
  `node_modules`, so deps mode stopped with `ERR_MODULE_NOT_FOUND`, exit 1. The
  action read that as "findings", so the job passed with no comment and no
  SARIF. Deps and URL scans no longer load `yaml`. The action now fails the job
  when Penthera writes no report. A test runs both modes from a copy without
  `node_modules`.
- **`penthera init` pins the workflow to v2.0.0**, the newest stable release
  before this one, not v1.6.1. A test fails when the pin falls behind
  `CHANGELOG.md`.
- **Nothing unread is reported as clean.** When packages in the lockfile are not
  installed or cached, `penthera deps` says how many were not read and how to
  read them (`npm ci --ignore-scripts`). It prints "Not checked" instead of
  "Clean scan" when it read none. `init` grades that area `–`, not `A`. The PR
  comment says "N of M packages scanned".
- **No arguments without a terminal** (an agent, CI, a pipe) prints three
  commands to run, `init --yes --dry-run`, `init --yes` and `--repo .`, instead
  of an error and 150 lines of help. The exit code is still 2.
- **`--giants` names what ran.** "Running gitleaks..." shows only for a tool
  that is installed. A missing tool is listed as `not installed`, with its
  install command. An area where Penthera's own rules read files is "covered",
  and the row says what Penthera read, for example `Penthera (7 files)`.
- **The owner report no longer says every serious finding is "things an
  attacker could use today".** It says "if they are real", and it says how many
  sit in test or fixture files.
