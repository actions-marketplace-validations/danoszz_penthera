section: Docs

- **E17, a check that Penthera works unplugged.** A draft pre-registration and
  a runner that runs each offline command with the network blocked, twice, and
  once with it allowed, and compares the results. The pilot found no outside
  connections and the same JSON every time; the evidence check's printed
  timestamp and URL scans without `--offline` are the exceptions, written up in
  `bench/offline/RESULTS.md`.
