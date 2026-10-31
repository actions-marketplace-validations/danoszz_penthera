section: Fixed

- **Reports no longer read as clean on a run that fails.** A critical or high
  finding in a test fixture or build output printed "Nothing to fix" and exited
  1. Another tool's finding or a required tool that did not run printed "Clean
  scan" in the terminal and "No security findings detected" in Markdown. The
  exit codes stay the same, so a live-format key in a fixture still fails CI.
  The brief says `Review`, with a line that says why the run fails, and names
  the tool and file for another tool's finding. The terminal, Markdown and
  audience reports give that reason when Penthera's own findings do not explain
  the exit code, and SARIF carries a notification when a required tool did not
  run.
- **`--repo <missing path>` exits 2.** It used to read as clean and exit 0.
- **`--help` no longer prints escape codes to a pipe.** The help of every command
  honors `NO_COLOR` and uses color only on a terminal.
- **`dist/` and `build/` in a skill you name are no longer likely noise.** They
  are the skill's own code.
