section: Docs

- **E17 registered result: no network at run time, same result every time.**
  On macOS and Ubuntu, repo scans, `agents`, `deps`, `brief`, evidence
  bundles and URL scans with `--offline` made no outside connections and gave
  the same result twice, and the same with the network blocked or allowed.
  The evidence check's printed timestamp is the one line that changes. Limits
  are in `bench/offline/RESULTS.md`: `git` runs outside the guard, and URL
  scans without `--offline` download the Retire.js database.
- **README and the trust page say what E17 showed,** for the commands that
  passed only, with its limits.
