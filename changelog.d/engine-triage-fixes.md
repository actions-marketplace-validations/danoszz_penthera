section: Fixed

- **Fewer false findings in repo scans, and action plan steps that fit.** A
  run on a Next.js and FastAPI monorepo showed these, and each now has a test:
  - "Hardcoded password" no longer fires on style values (`pass:
    'text-emerald-400'`, `var(--success)`) or on a `pass` key next to `fail` or
    `warn`, which is a map of check outcomes. On the CredData dev half, recall
    and precision are unchanged.
  - The `eval` check skips folders git ignores and Next.js build folders under
    another name (`.next-dev`).
  - A Node.js advisory that names TLS gets the step "Upgrade the runtime", not
    "Fix the TLS configuration".
  - Keys in files git ignores get their own low step (check whether the file
    was shared), not "purge it from git history".
  - `eval`, `exec` and `innerHTML` findings get the code-execution step, not
    "Review and remediate this finding".
- **`penthera agents` says what a permission really allows.** A pre-approved
  script in `/tmp`, `/var/tmp` or `/dev/shm` is now its own rule,
  `permission-tmp-script`: any local process can replace the file. "With any
  arguments" now appears only when the grant has a `*` or no arguments, and an
  exact command such as `Bash(bash ./scripts/check.sh)` is no longer reported.
- **Reports leave out what does not apply.** Dependency and agent-config reports
  no longer print an empty OWASP WSTG table, and only URL scans show
  "Reachable".
- **The coverage ledger covers the `eval` check.** A new row says how many files
  it read, how many were over its size limit, and how many sat in folders it
  skips.
