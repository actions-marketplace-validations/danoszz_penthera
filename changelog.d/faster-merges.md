section: Changed

- **Faster merges for contributors.** Pull requests get a quicker install check
  (Linux and macOS, Node 22), and docs-, site- or benchmark-only changes skip it.
  The merge queue and `main` still run the full matrix (Linux, macOS and
  Windows on Node 22 and 24, plus the upgrade test). Release notes are written
  as fragments in `changelog.d/`, so parallel pull requests no longer conflict
  on `CHANGELOG.md`.
