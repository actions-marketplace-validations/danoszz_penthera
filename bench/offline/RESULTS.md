# E17 results: offline and determinism

Protocol: [E17 pre-registration](../../docs/research/prereg/E17-offline-and-determinism.md).
Runner: [run.mjs](run.mjs).

## Pilot, 28 Oct 2026 (not the registered result)

macOS, Node 22, Penthera 2.1.0-rc.2 at commit `55d1d0a`. Ran once on the
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
