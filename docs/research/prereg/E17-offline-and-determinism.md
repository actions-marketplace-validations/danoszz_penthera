# E17: Does Penthera work unplugged, and give the same answer twice? (pre-registration)

| | |
|---|---|
| Experiment | E17 |
| Related | [E8](E8-harness-guardrails.md) (the network guard), [E11](E11-public-benchmarks.md) (benchmarks run under the same guard) |
| Status | **Registered.** Accepted by the maintainer on 28 Oct 2026; the commit that merges this version to `main` is the registration timestamp. The pilot (§ 8) ran before it and counts only as a pilot |
| Date written | 2026-10-28 |
| Authors | Daan van der Zwaag (PI). Drafted with Claude (AI-assisted) |
| Data collected before registration | None |
| Cost | $0. Local runs only |

## Abstract (added 29 Oct 2026, after registration and the result)

> **Project page.** For researchers asking "does Penthera make no network
> calls, and give the same answer twice?" This abstract was added after the
> result. It changes nothing in the protocol. The registered text is the
> version merged to `main` in `dfd5053` (28 Oct 2026); § 9 entry 5 is the one
> logged change since, and `git diff dfd5053 -- docs/research/prereg/E17-offline-and-determinism.md`
> shows every later edit.

**Question.** Do Penthera's offline commands make no outside connections,
give the same result twice, and give the same result with the network
blocked as with it allowed?
**Method.** Seven commands on four fixed targets and a loopback mock server,
each run twice under a network guard and once without it, on macOS and on
Ubuntu. A positive control checks that the guard sees a real connection.
Pass or fail per cell, no sampling.
**Result.** All three hypotheses hold for every command in scope, on both
platforms. URL scans hold only with `--offline`. The guard covers Node
processes; `git` runs unguarded. Results:
[bench/offline/RESULTS.md](../../../bench/offline/RESULTS.md).
**Limits.** Four small targets. `install`, `--giants`, `--recon`,
`--suppliers` and AI mode are out of scope by design.

## 1. Why

Penthera's copy says it is offline and that "you can verify every finding
yourself". A proposed change would go further and tell regulated and
air-gapped teams: *unplug the cable and it gives the same answer*. That is
three separate claims, and each can be false:

1. it makes no network connections;
2. two runs on the same commit give the same result;
3. the result with the network blocked equals the result with it allowed.

The benchmarks already run under a network guard, but only for the commands
they use. Nobody has checked every offline command, or determinism, or the
blocked-versus-allowed comparison. E17 checks them before any copy says so.

## 2. Questions and hypotheses

| | Hypothesis | Supported when |
|---|---|---|
| H1 | Each in-scope command (§ 4) attempts **zero** non-loopback connections or DNS lookups | The guard log is empty for every command × target |
| H2 | Two runs of the same command on the same target give the **same** normalized JSON (§ 6) | Zero differing paths for every command × target |
| H3 | A run with the network blocked gives the **same** normalized JSON as a run with it allowed | Zero differing paths for every command × target |

These are pass/fail claims about a deterministic program, so there is no
sampling and no interval. A single failure fails the hypothesis for that
command, and the failure is reported with the offending host or JSON path.

**Positive control.** A URL scan of a loopback mock server **without**
`--offline` is expected to attempt at least one outside connection (the
Retire.js download). If the guard logs nothing there, the guard is broken
and the whole run is void.

## 3. The guard

`scripts/ci/net-guard.cjs`, preloaded with `NODE_OPTIONS=--require` into every
Node process the command starts. It blocks and logs any TCP/TLS connection
or DNS query to a host that is not loopback. Each run gets an empty `HOME`,
an empty temp `cwd`, and `CI=1` (so no interactive prompts).

**Known limit, stated now:** the guard covers Node processes only. A non-Node
child process (for example `git`) is not guarded. The runner records every
child process the commands spawn (`bench/offline/child-log.cjs`, preloaded
next to the guard), and the report lists non-Node children, and Node children
started without the guard, as unguarded.

## 4. Scope

**Commands (in scope):**

| ID | Command |
|---|---|
| C1 | `penthera --repo <T> --json` (default, no `--offline`) |
| C2 | `penthera --repo <T> --offline --json` |
| C3 | `penthera agents <T> --json` |
| C4 | `penthera deps <T> --json` (on T3 and T4 only, § 9.1) |
| C5 | `penthera --repo <T> --evidence <dir>`, then `penthera evidence verify <dir>` |
| C6 | `penthera brief <C1 report>` |
| C7 | `penthera http://127.0.0.1:<port> --offline --json` against `tests/fixtures/mock-server.js` |

**Targets:** T1 `tests/fixtures/repo-scan/express-routes`, T2
`tests/fixtures/agents/malicious`, T3 the Penthera repository at the
registered commit, T4 the `head` tree that `tests/fixtures/deps/build.js`
writes (a lockfile project, for C4). C7 uses the mock server only.

**Out of scope, by design:** `install` (it reads the npm registry), `--giants`
(third-party tools), `--recon`, `--suppliers`, `--giants-online`, AI mode
(it talks to a local model; loopback is allowed, but a model's output is not
deterministic and is not a finding until a rule confirms it).

## 5. Procedure

For each command × target:

1. run A: guard on;
2. run B: guard on (same inputs, fresh `HOME` and `cwd`);
3. run C: guard off, network available.

Record exit code, stdout, the guard log and wall time. Runs are sequential.

## 6. Normalization (fixed before any run)

Before comparing JSON, remove keys whose name matches
`/(At|Ms|_at|_ms|time|timestamp|date|duration|elapsed|generated)$/i` and
replace the per-run temp paths and `HOME` with fixed tokens. Nothing else is
removed. Every other difference counts against H2 or H3 and is reported
with its JSON path. If a field must be added to this list after the pilot,
that is a deviation (§ 9), and the report shows the result both with and
without it.

For non-JSON outputs (C5 verify, C6 brief), compare stdout after the same
path replacement. For C5 the comparison also leaves out the one line that
starts with `Generated`, and the exit code must match; the strict comparison
of the full stdout is reported next to it (§ 9.2).

## 7. Analysis and reporting

A table of command × target × H1/H2/H3 with pass or fail, the hosts for
any H1 failure and the JSON paths for any H2/H3 failure. Published in
`bench/offline/RESULTS.md` whatever the outcome.

**What the result decides:**
- H1–H3 all pass: the copy may say "no network at run time" and "same answer
  every time" for the passing commands, naming them.
- Any failure: fix it in the code, or narrow the claim to the commands that
  pass. The copy never claims more than the table shows.

## 8. Pilot

A pilot may run on macOS before registration to check the runner. Its
results are reported as a pilot, labelled as such, and do not count as the
registered result. The registered run repeats on macOS and on Ubuntu in CI.

## 9. Deviations

Any change after registration is listed here with its date and reason.

**Adopted before registration, from the pilot (28 Oct 2026; [pilot results](../../../bench/offline/RESULTS.md)).** The maintainer accepted all three with the protocol, and § 3, § 4 and § 6 above already include them:

1. **C4 targets.** T1 and T2 have no lockfile, so `deps` tests nothing there.
   C4 runs on T3 and on T4, the fixture built by `tests/fixtures/deps/build.js`.
2. **C5 comparison.** `evidence verify` prints the bundle's generation time.
   C5 compares the exit code and the verify lines (hashes and signature)
   and leaves out the `Generated` line. The strict result stays
   reported next to it.
3. **Child processes.** The runner records child processes, as § 3 says
   (`bench/offline/child-log.cjs`).
4. **C3 on T1.** The pilot runner skipped `agents` on T1. The registered run
   includes it, as § 4 already says (every command × target).

**After registration:**

5. **Normalization by exact paths (29 Oct 2026, approved by the maintainer).**
   The § 6 pattern, matched without case, also removed `hasParams`
   (`attackSurface[]`, `boundaries.public[]`) and `deps.format`, which are
   analysis output. The runner now removes only `timestamp`, `duration`,
   `findings[].collected_at` and `fingerprint.headers.date`, and reports the
   old pattern's result next to it. Re-run on macOS at commit `0a69642` and on
   Ubuntu in CI: the verdict is unchanged under both. The § 6 text above stays as registered.
   Old and new results side by side: [E17 results](../../../bench/offline/RESULTS.md#deviation-the-normaliser-29-oct-2026).

## Notes added after the result, 29 Oct 2026

These notes add context, reproduction details and what the result means.
They change no part of the protocol or its deviations above.

### Context and references

Same output from the same input is the goal reproducible builds set for
software packages ([Lamb & Zacchiroli, 2022](../../references.md#lamb2022reproducible)).
E17 applies the same test to a scanner's output, not to its build.
Pre-registration: [Nosek et al. (2018)](../../references.md#nosek2018preregistration).
No statistics are cited: the hypotheses are pass or fail on a
deterministic program (§ 2).

### Reproduce

| What | Value |
|---|---|
| Runner | `node bench/offline/run.mjs [--out <dir>]` ([run.mjs](../../../bench/offline/run.mjs)) |
| Guard and child log | `scripts/ci/net-guard.cjs`, `bench/offline/child-log.cjs` |
| Normalizer (after entry 5) | [normalize.mjs](../../../bench/offline/normalize.mjs), tested in `tests/bench-offline.test.js` |
| Registered run | commit `dfd5053`, 28 Oct 2026: macOS (Node 26.0.0) and Ubuntu in GitHub Actions (Node 22.23.4, workflow `bench-offline.yml`) |
| Re-run after entry 5 | commit `0a69642`, 29 Oct 2026, macOS and Ubuntu |
| Raw summaries | `bench/offline/registered/*.json`, `bench/offline/rerun-2026-10-29/macos.json` (MIT, as the repository) |

**Not shared, and why.** The full raw stdout of each run stays in the
runner's output folder: it is large, and the summaries hold every verdict
and differing path. The CI run uploads it as an artifact.

### What the result means

- **For users.** Repo scans, `agents`, `deps`, `brief`, evidence bundles and
  URL scans with `--offline` made no outside connection and gave the same
  result every time, on macOS and Ubuntu. A URL scan without `--offline`
  downloads the Retire.js database; use `--offline` on an air-gapped host.
- **For the tool and its copy.** The claim may name these commands and
  nothing broader (§ 7). `git` is not guarded; that it only runs local
  commands comes from reading the code, not from a measurement.

### Limits (added 29 Oct 2026)

`git` runs outside the guard. Four small targets and one mock server.
`install`, `--giants`, `--recon`, `--suppliers` and AI mode are out of
scope. The full list is under "Limits" in
[bench/offline/RESULTS.md](../../../bench/offline/RESULTS.md). What every
results file reports is in the
[results-file checklist](../results-checklist.md).

### Status

Draft `dd37a9b`; pilot `00209fd`; registered `dfd5053` (28 Oct 2026);
normalizer deviation `6c9e736` and Ubuntu re-run `933c404` (29 Oct 2026);
this abstract and these notes 29 Oct 2026. No figure: the result is a
pass-or-fail table.
