section: Fixed

- **`penthera agents ./some-skill` scans the skill.** A folder with `SKILL.md`
  at its root, in any casing, used to report `Nothing to assess` and read
  nothing, even with a download-and-run line in it. It now gets the same rules
  and findings as a skill under `skills/<name>/`, scripts included. A direct
  path to a `SKILL.md` scans its folder, in the CLI and in the MCP
  `audit_ai_tooling` tool. Any other file is an error instead of an empty run.
  `--pin` on a skill folder leaves its own `penthera.lock` out of the hash, so
  the next run does not report the skill as changed.
- **A run that read no agent config no longer prints a clean scan.** The
  terminal report said `No findings` and `Clean scan, no issues found` next to
  `Nothing to assess`. It now says the config was not checked and that this is
  not a clean result.
