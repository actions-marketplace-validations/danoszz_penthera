# E17 results: offline and determinism

Protocol: [E17 pre-registration](../../docs/research/prereg/E17-offline-and-determinism.md).
Runner: [run.mjs](run.mjs).

## Deviation: the normaliser, 29 Oct 2026

A logged deviation from the registered plan (§ 6 and § 9 of the protocol).
The maintainer approved it on 29 Oct 2026.

**What was wrong.** § 6 removed every JSON key whose name matched
`/(At|Ms|_at|_ms|time|timestamp|date|duration|elapsed|generated)$/i`, with
everything under it. The match ignores case, so `At` and `Ms` also hit names
like `hasParams` and `format`. On the registered targets the pattern removed
three fields that are analysis output, not run metadata:

| Field | Where |
|---|---|
| `attackSurface[].hasParams` | C1, C2 on T1 |
| `boundaries.public[].hasParams` | C1, C2 on T1 |
| `deps.format` | C4 on T3 and T4 |

So H2 and H3 were tested on slightly less than the whole result. A methodology
review of 29 Oct 2026 found this.

**What changed.** The runner now removes an exact list of key paths, found
by running the old pattern over the real output of every command:
`timestamp`, `duration`, `findings[].collected_at` and, for the URL scan,
`fingerprint.headers.date` (the HTTP `Date` header of the scanned server).
Everything else is compared. The list is in
[normalize.mjs](normalize.mjs), and
[tests/bench-offline.test.js](../../tests/bench-offline.test.js) fails on the
old pattern. The runner still applies the old pattern and stores its result
next to the new one in each row (`registeredPattern`), as § 6 requires.

**Re-run.** macOS only, Node 26.0.0, commit `0a69642` (the fix), on the same
targets. Raw summary: [rerun-2026-10-29/macos.json](rerun-2026-10-29/macos.json).
The Ubuntu run in CI has not been repeated yet.

| | Registered run, old pattern (28 Oct) | Re-run, old pattern (29 Oct) | Re-run, exact paths (29 Oct) |
|---|---|---|---|
| H1, every command × target | pass | pass | pass |
| H2, every command × target | pass | pass | pass |
| H3, every command × target | pass | pass | pass |
| C5 strict (full stdout) | fails on every target | fails on every target | fails on every target |
| Control: guard logged outside hosts | yes | yes | yes |
| Control: H3 differing paths | 3 | 3 | 4 |

The verdict did not change. The three fields the old pattern hid were the
same in every run. The control's extra path is `retireDb.snapshotDate`:
without `--offline` the scan downloads a newer Retire.js database, so its
date differs from the bundled copy. The old pattern hid that difference too.
The control is expected to fail H3, so this changes nothing about the claim.

## Registered run, 28 Oct 2026

Registered by merge commit `dfd5053` (28 Oct 2026, 19:02 CEST), which is
also the commit that ran. Two platforms:

| | macOS | Ubuntu (GitHub Actions) |
|---|---|---|
| Node | 26.0.0 | 22.23.4 |
| Where | the maintainer's machine | [manual workflow run](https://github.com/danoszz/penthera/actions/runs/40731891267) |
| Raw summary | [registered/macos.json](registered/macos.json) | [registered/ubuntu.json](registered/ubuntu.json) |

**Positive control:** on both platforms a URL scan of the loopback mock
server without `--offline` tried to reach `raw.githubusercontent.com` and
`cdn.jsdelivr.net`, and the guard logged both. The guard works, so the run
is valid.

The two platforms gave the same table:

| Command | T1 express-routes | T2 malicious agents | T3 Penthera repo | T4 deps fixture | Mock server |
|---|---|---|---|---|---|
| C1 `--repo` (default) | ✓ ✓ ✓ | ✓ ✓ ✓ | ✓ ✓ ✓ | | |
| C2 `--repo --offline` | ✓ ✓ ✓ | ✓ ✓ ✓ | ✓ ✓ ✓ | | |
| C3 `agents` | ✓ ✓ ✓ | ✓ ✓ ✓ | ✓ ✓ ✓ | | |
| C4 `deps` | | | ✓ ✓ ✓ | ✓ ✓ ✓ | |
| C5 `--evidence` + `evidence verify` | ✓ ✓ ✓ \* | ✓ ✓ ✓ \* | ✓ ✓ ✓ \* | | |
| C6 `brief` | ✓ ✓ ✓ | ✓ ✓ ✓ | ✓ ✓ ✓ | | |
| C7 URL scan `--offline` | | | | | ✓ ✓ ✓ |
| Control: URL scan, no `--offline` | | | | | ✗ ✓ ✗ (expected) |

Each cell is H1 H2 H3: no outside connections, the same result twice, the
same result with the network blocked as with it allowed. The exit codes
were the same in all three runs of every cell.

\* C5 passes under § 9.2, which leaves out the `Generated` line. The strict
comparison of the full output fails on every target, as in the pilot,
because that line prints the time the bundle was made. The verdict, the
hashes and the exit code were identical.

### What this shows

1. **H1 holds for every command in scope:** no Node process tried a
   connection or DNS lookup past loopback, on either platform.
2. **H2 and H3 hold:** the normalized results were the same every time, and
   the same with the network blocked or allowed.
3. **URL scans are covered only with `--offline`.** Without it, a URL scan
   downloads the Retire.js database (the control). Blocked, it falls back to
   the bundled copy, and the result records a different source.

### Limits

- **`git` is not guarded.** Repo scans, evidence bundles and `brief` start
  `git` (the child-process log shows `exec git` and nothing else). The guard
  sees only Node. Penthera's code calls only local git commands (`rev-parse`,
  `ls-files`, `show`, `diff`, `log`, `status`, `config`, `cat-file`), never
  `fetch`, `clone`, `ls-remote` or `pull`. That comes from reading the code,
  not from a measurement.
- No Node child process ran without the guard.
- Four small targets and one mock server. A larger or stranger repository
  could reach a code path these did not.
- `install`, `--giants`, `--recon`, `--suppliers` and AI mode are out of
  scope by design (§ 4).

### What may be claimed

For repo scans (with or without `--offline`), `agents`, `deps`, `brief`,
evidence bundles and URL scans **with `--offline`**: "no network at run time,
and the same result every time, also with the network unplugged. Tested on
macOS and Ubuntu (E17)." The evidence check's printed timestamp is the one
line that changes. Nothing broader.

## Pilot, 28 Oct 2026 (not the registered result)

macOS, Penthera 2.1.0-rc.2 at commit `55d1d0a`. This section first said Node 22; the registered run on the same machine used Node 26.0.0, so the pilot's Node version is not certain. Ran once on the
frozen protocol to check the runner. Per § 8 it does not count as the
registered result; the registered run repeats on macOS and on Ubuntu in CI.

**Positive control:** a URL scan of the loopback mock server without
`--offline` tried to reach `raw.githubusercontent.com` and `cdn.jsdelivr.net`,
and the guard logged both. So the guard works and the run is valid.

| Command | T1 express-routes | T2 malicious agents | T3 Penthera repo | Mock server |
|---|---|---|---|---|
| C1 `--repo` (default) | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | |
| C2 `--repo --offline` | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | |
| C3 `agents` | not run (no agent config) | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | |
| C4 `deps` | n/a, no lockfile (exit 2) | n/a, no lockfile (exit 2) | H1 ✓ H2 ✓ H3 ✓ | |
| C5 `--evidence` + `evidence verify` | H1 ✓ H2 ✗ H3 ✗ | H1 ✓ H2 ✗ H3 ✗ | H1 ✓ H2 ✗ H3 ✗ | |
| C6 `brief` | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | H1 ✓ H2 ✓ H3 ✓ | |
| C7 URL scan `--offline` | | | | H1 ✓ H2 ✓ H3 ✓ |
| Control: URL scan, no `--offline` | | | | H1 ✗ (expected) H2 ✓ H3 ✗ |

H1 = zero outside connections. H2 = same normalized result twice. H3 = same
result with the network blocked as with it allowed.

### What the pilot shows

1. **No outside connections in any offline command (H1).** That includes the
   default repo scan without `--offline`, `agents`, `deps`, `brief`, the
   evidence bundle, and a URL scan of a loopback app with `--offline`.
2. **The JSON results are the same every time (H2), and the same with the
   network blocked or allowed (H3),** for every command that produced JSON.
3. **The C5 failures are one human-readable line.** `evidence verify` prints
   `Generated <timestamp>` from the bundle, and two bundles made a second
   apart have different timestamps. The verdict, the hashes checked and the
   exit code were identical. § 6 compares the full stdout for non-JSON
   output, so by the letter of the protocol this is a failure, and it stays
   reported as one.
4. **A URL scan without `--offline` is not "unplugged-safe" (control).** It
   downloads the Retire.js database. Blocked, it falls back to the vendored
   snapshot, so the result records a different `retireDb.source` and egress
   hosts. That is the documented behaviour, but it means the claim "same
   answer unplugged" holds for URL scans only with `--offline`.
5. **C4 on T1 and T2 tested nothing.** Neither fixture has a lockfile, and
   `deps` exits 2 with an explanation, the same way every run. Only T3
   tested `deps`.

### Not covered yet

- **Non-Node child processes are not guarded.** The protocol says the runner
  records them; this runner does not yet. Repo scans call `git`, which runs
  locally here, but that is not proven by the guard.
- **One platform.** Ubuntu in CI comes with the registered run.
- `install`, `--giants`, `--recon` and AI mode are out of scope by design.

### What may be claimed after the pilot

Nothing yet: the pilot is a runner check. If the registered run matches it,
the copy may say "no network at run time and the same result every time" for
repo scans, `agents`, `deps`, `brief` and evidence bundles, and for URL scans
with `--offline` only.
