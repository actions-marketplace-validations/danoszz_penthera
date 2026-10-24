# Public benchmarks (E11)

> **Pro.** For "how does Penthera do on public datasets that other people labelled?"

This runner scores Penthera against three public datasets, one per
capability. The protocol is pre-registered in
[E11-public-benchmarks.md](../../docs/research/prereg/E11-public-benchmarks.md);
the numbers are in [RESULTS.md](RESULTS.md).

| Benchmark | Capability | Dataset pin |
|---|---|---|
| [Samsung CredData](https://github.com/Samsung/CredData) | Secret scan | `c49ed106` |
| [SecBench.js](https://github.com/cristianstaicu/SecBench.js) | Code-execution sinks (`--repo`) | `5d362353` |
| [DataDog malicious packages](https://github.com/DataDog/malicious-software-packages-dataset) | Dependency capability scan (`penthera deps`) | `21822443` |

## Reproduce

```bash
export GH_TOKEN=$(gh auth token)                 # the malware sample is drawn through the GitHub API
npm run bench:public                             # all three
npm run bench:public -- --only secbench          # one: creddata, secbench or malware
npm run bench:public -- --only creddata --skip-fetch   # reuse the cache
npm run bench:public -- --split dev              # E11b: score the dev half only
npm run bench:public -- --competitors --split dev        # E11b: gitleaks, detect-secrets, GuardDog on dev
```

E11b splits each benchmark into a dev half and a sealed test half
([split/](split/), ids and hashes only; protocol in
[E11b-improvement-study.md](../../docs/research/prereg/E11b-improvement-study.md)).
The default, `--split all`, reproduces E11 as registered. `--split test`
is refused without `--final`: the test half runs once, at the end.

Needs Node.js 22 or later, git, `unzip`, Python 3.10 or later (for CredData's
own `download_data.py`), network access for the fetch steps, and about 3 GB
of disk. CredData's download fetches 297 repositories and takes about 15
minutes. The runner is never part of `npm test`, and none of `bench/` is in
the npm package.

Datasets go to `$PENTHERA_BENCH_CACHE/public` (default
`~/.cache/penthera-bench/public`), outside the repository. Scores and a
markdown summary per benchmark go to `results/` there. Nothing downloaded is
committed.

## How a run works

1. **Fetch** (network). Clone the dataset at its pin; for SecBench.js, fetch
   each vulnerable version's tarball from the npm registry and check its
   integrity; for DataDog, draw the seeded sample and download it; for the
   benign baseline, fetch the latest release of 300 popular names per
   ecosystem and check its hash.
2. **Scan** (offline). A child process runs every scan with
   [net-guard.cjs](../../scripts/ci/net-guard.cjs) preloaded and an empty
   `HOME`. The count of blocked connections is in the results and must be
   zero.
3. **Score.** Wilson 95% intervals, from `wilson` in
   [../known-vuln/score.mjs](../known-vuln/score.mjs).

## Malware safety

The DataDog samples are real malware. The runner:

- downloads and extracts them only under `/private/tmp/penthera-e11-malware`,
  and refuses any other path;
- extracts with `unzip -P infected` and reads the files as text with
  Penthera's scanners; it never installs, imports, requires or runs a sample;
- deletes that folder when the malware benchmark ends, also on failure;
- writes only names, versions, sample paths, hashes and finding kinds to its
  results, never code or snippets.

Do not run the malware benchmark on a machine where an accidental `npm
install` or `pip install` in that folder would matter.

## Files

| File | What |
|---|---|
| `run.mjs` | Fetch, offline scan child, score, write results |
| `common.mjs` | Paths, seeded sampling, downloads, the offline child |
| `creddata.mjs` | Rule families, CSV reader, line matching, precision and recall |
| `secbench.mjs` | Package resolution, sink matching, capability check |
| `malware.mjs` | Sampling, extraction, root detection, flag rules |
| `split.mjs`, `split/` | E11b: the seeded, stratified dev/test split and its manifests |
| `competitors.mjs` | E11b: pinned reference tools, run offline, scored the same way |
