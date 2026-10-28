# E17: Does Penthera work unplugged, and give the same answer twice? (pre-registration draft)

| | |
|---|---|
| Experiment | E17 |
| Related | [E8](E8-harness-guardrails.md) (the network guard), [E11](E11-public-benchmarks.md) (benchmarks run under the same guard) |
| Status | **Draft, not registered.** Nothing here binds until the maintainer accepts it; the commit that merges the final version to `main` is the registration timestamp. A pilot on the frozen protocol may run before that and is reported only as a pilot (§ 8) |
| Date written | 2026-10-28 |
| Authors | Daan van der Zwaag (PI). Drafted with Claude (AI-assisted) |
| Data collected before registration | None |
| Cost | $0. Local runs only |

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
child process name the commands spawn where Node exposes it, and the report
lists non-Node children as unguarded.

## 4. Scope

**Commands (in scope):**

| ID | Command |
|---|---|
| C1 | `penthera --repo <T> --json` (default, no `--offline`) |
| C2 | `penthera --repo <T> --offline --json` |
| C3 | `penthera agents <T> --json` |
| C4 | `penthera deps <T> --json` |
| C5 | `penthera --repo <T> --evidence <dir>`, then `penthera evidence verify <dir>` |
| C6 | `penthera brief <C1 report>` |
| C7 | `penthera http://127.0.0.1:<port> --offline --json` against `tests/fixtures/mock-server.js` |

**Targets:** T1 `tests/fixtures/repo-scan/express-routes`, T2
`tests/fixtures/agents/malicious`, T3 the Penthera repository at the
registered commit. C7 uses the mock server only.

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
path replacement.

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
