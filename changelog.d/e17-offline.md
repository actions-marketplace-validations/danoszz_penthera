section: Docs

- **E17, a check that Penthera works unplugged.** A pre-registration and a
  runner that runs each offline command with the network blocked, twice, and
  once with it allowed, and compares the results. It also records the child
  processes a command starts, since the guard sees only Node. A manual
  workflow runs it on Ubuntu. The pilot found no outside connections and the
  same JSON every time; the evidence check's printed timestamp and URL scans
  without `--offline` are the exceptions, written up in
  `bench/offline/RESULTS.md`.
