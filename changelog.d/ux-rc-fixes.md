section: Fixed

- **The GitHub Action's `mode: deps` exited before scanning on every release
  from 1.5.0 to 2.0.0, and the job reported success with no PR comment and no
  SARIF.** No dependency was checked in those runs. If you use `mode: deps`,
  move your pin to 2.1.0-rc.1 or later. The cause: the CLI loaded the `yaml`
  package on every command, and the action's checkout has no `node_modules`.
  The resulting `ERR_MODULE_NOT_FOUND` exits 1, which the action read as
  "findings". Deps and URL scans no longer load `yaml`. The action now fails
  the job when Penthera writes no report. Tests cover both: an action run that
  writes no report fails, and deps and URL scans run from a copy without
  `node_modules`.
- **`penthera init` pins the workflow to v2.0.0**, the newest stable release
  before this one, not v1.6.1. v2.0.0 still has the `mode: deps` problem
  above, so move that pin to 2.1.0-rc.1 or later. A test fails when the pin
  falls behind `CHANGELOG.md`.
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
