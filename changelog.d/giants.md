section: Added

- **`--giants`: run the free scanners you already have, in one report.** After
  its own scan, Penthera runs the tools installed on your machine (gitleaks,
  TruffleHog, Semgrep with your local rules, osv-scanner, Trivy and Checkov
  for `--repo`; nuclei with your templates and the ZAP baseline for a URL)
  and folds their findings into the terminal report, JSON, Markdown, SARIF
  (one run per tool) and the evidence bundle, each labelled with the tool, its
  version and its rule. `--with` and `--without` pick tools,
  `--giants-online` adds pip-audit and TruffleHog key verification, and
  `penthera giants` lists what you have. A new "Coverage by area" table says
  which areas another tool covered; an area with no tool is "not covered",
  never clean. Nothing is downloaded or installed: tools come from `PATH`
  outside the scanned project, run without a shell, with a timeout, an output
  cap, a minimal environment and, on macOS and Linux where available, the
  network denied. CodeQL runs only with `--with codeql`, after a licence
  notice. Other tools' critical and high findings count toward the exit code
  unless the policy file says `giants.failOn: never`; the new `giants` policy
  key can also require, limit or forbid tools. The default merge is
  Penthera-first until experiment E14 reports, and no accuracy claim is made
  for the combination before then. Docs: `docs/commands/giants.md`.
