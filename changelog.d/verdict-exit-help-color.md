section: Fixed

- **The brief no longer says "Nothing to fix" on a run that fails.** A critical
  or high finding in a test fixture, build output or a file git ignores printed
  "Nothing to fix" and exited 1. The exit code stays 1, so a live-format key in
  a fixture still fails CI. The finding stays under Likely noise, and the
  verdict is now `Review`, with a line that says why the run fails. The same
  holds for other tools' findings and for a required tool that did not run.
- **`--help` no longer prints escape codes to a pipe.** It now honors `NO_COLOR`
  and uses bold and dim only on a terminal.
