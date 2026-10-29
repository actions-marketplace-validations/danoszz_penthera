section: Docs

- **Benchmark ranks now carry their rank interval.** Where a point rank is
  less sure than it reads, the README, penthera.org, the blog and the results
  files now say "1st of 6, tied 1st to 3rd" (npm), "1st of 8, tied 1st to
  3rd" (PyPI) and "1st of 8, tied 1st to 4th" (SecBench.js), with a note on
  what the range means. Secrets stays "2nd of 10": its interval is one place.
  The intervals come from an exploratory bootstrap done after the registered
  ranking (`bench/public/rank-intervals.json`); a test checks that each one
  contains the published rank and that the README matches what
  `publish.mjs` writes.
- **Secrets by F0.5 and F2.** Penthera is 2nd by F1, 1st by F0.5 (0.82
  against deepsecrets 0.80) and 2nd by F2 (0.68 against 0.77), computed from
  the published precision and recall.
- **E17 normaliser, a logged deviation.** The registered key pattern also
  removed `hasParams` and `deps.format`, which are analysis output. The
  runner now removes an exact list of volatile paths and reports the old
  pattern next to it. Re-run on macOS on 29 Oct 2026: same verdict. In
  `bench/offline/RESULTS.md` and § 9 of the E17 pre-registration.
