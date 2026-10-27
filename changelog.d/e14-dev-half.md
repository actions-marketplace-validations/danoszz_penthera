section: Docs

- **E14 step 1, the dev half: Penthera plus the free tools.** A new harness,
  `bench/public/giants.mjs`, reruns gitleaks, trufflehog, Semgrep and CodeQL
  through E11b's pinned runners, keeps their per-item hits, and builds the
  pre-registered arms with the merge code `--giants` ships. On the dev half
  every tool reproduces its E11b numbers. The union finds 2.6 points more
  CredData rows at about 11 points less precision, and two more SecBench.js
  vulnerabilities while the median findings per package goes from 1 to 4; the test half is
  untouched. Results and the logged deviations are in `bench/public/RESULTS.md`
  and the E14 pre-registration.
