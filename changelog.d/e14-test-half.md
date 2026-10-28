section: Docs

- **E14 step 2, the registered result: Penthera plus the free tools on the
  sealed test half.** Penthera 2.1.0-rc.2 with gitleaks and trufflehog finds
  11 points more CredData rows than Penthera alone (H1 holds) but loses 9
  points of precision, beyond the registered 0.02 margin (H2 fails). With
  Semgrep and CodeQL it finds 9 more of 64 SecBench.js bugs (H4 holds), at 4
  findings per package instead of 1. By the pre-registered rule, `--giants`
  keeps Penthera-first as its default. Every other tool matched its E11b
  numbers exactly before any combination was computed. In
  `bench/public/RESULTS.md` and the E14 pre-registration.
