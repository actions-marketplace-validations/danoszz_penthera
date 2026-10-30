section: Fixed

- **`penthera agents ./some-skill` scans the skill.** A folder you name with
  `SKILL.md` at its root, in any casing, used to report `Nothing to assess` and
  read nothing, even with a download-and-run line in it. It now gets the same
  rules and findings as a skill under `skills/<name>/`, scripts included. A
  direct path to a `SKILL.md` scans its folder. Any other file is an error
  instead of an empty run. A skill Penthera could not read in full gets a high
  finding, so it never grades A. `--pin` on a skill folder leaves its own
  `penthera.lock` out of the hash, so the next run does not report the skill as
  changed.
- **Project scans do not change.** `penthera agents`, `penthera agents .` and
  the full path of your working folder ignore a `SKILL.md` at the root, as
  before. So do `--aibom` and the GitHub Action with its default `path`.
- **The MCP `audit_ai_tooling` tool takes more in `path`.** Besides a project
  folder, it now accepts a skill folder or a `SKILL.md` inside the workspace.
  The tool's description is unchanged, so clients that pin it see no change.
- **A run that read no agent config no longer looks clean.** The terminal
  report said `No findings` and `Clean scan, no issues found` next to `Nothing
  to assess`, and `--markdown` said `No security findings detected`. Both now
  say this is not a clean result. SARIF stays free of results and carries the
  same message as a warning notification on the run.
- **`penthera.lock` is never read or written through a symbolic link.** A linked
  lock is reported as unreadable, and `--pin` refuses to follow it.
- Terminal output strips control characters from finding titles and paths. A
  linked `bin/` in a skill's virtual environment is no longer followed. Large
  skill files are hashed in chunks. `--aibom` hashes only regular files inside
  the repo.
