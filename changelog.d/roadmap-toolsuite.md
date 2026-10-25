section: Docs

- **Roadmap: one first pass, with the best free tools.** Penthera will run the
  free scanners you already have (gitleaks, trufflehog, Semgrep, osv-scanner,
  pip-audit, trivy, checkov, nuclei, ZAP) where they are better or cover more,
  and fold their findings into one report. Experiment E14 tests whether the
  combination beats each tool alone. Bundling or auto-installing other
  scanners is listed as not planned.
  The draft spec (`docs/research/spec-giants.md`) and the E14
  pre-registration are up for review; no code before they are approved.
