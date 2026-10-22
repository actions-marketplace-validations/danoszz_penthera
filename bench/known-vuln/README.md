# Known-vulnerable apps (E10)

> **Pro.** For "how does Penthera do on apps someone else wrote, where the answer key is public?"

Penthera's own benchmark ([../README.md](../README.md)) uses labs its authors
wrote. This one runs Penthera against widely used, deliberately vulnerable
apps whose vulnerabilities are documented by their own authors. The protocol
is a draft pre-registration:
[E10-known-vulnerable-apps.md](../../docs/research/prereg/E10-known-vulnerable-apps.md).
The latest numbers are a **pilot**, in [RESULTS.md](RESULTS.md). Its misses are
verified one by one in [MISSES.md](MISSES.md), and a re-run after the fixes
that followed is in [RESULTS-after-fixes.md](RESULTS-after-fixes.md) (not
independent: the fixes were written against these apps).

```bash
npm run bench:known                                  # Juice Shop and DVNA, standard run
npm run bench:known -- --app webgoat --run deep      # one app, payload probes on
npm run bench:known -- --no-write --json out.json    # print, keep RESULTS.md
npm run bench:known -- --out RESULTS-after-fixes.md  # write another file, keep RESULTS.md
```

Needs Docker (Docker Desktop, Colima or OrbStack on macOS) and network
access to pull the pinned images and clone the pinned sources. It takes a
few minutes per app. It is never part of `npm test`, and none of it is in
the npm package. A manual workflow, **E10 known-vulnerable apps (manual)**,
runs it on GitHub and uploads the results as an artifact.

## Apps

| App | Answer key | Runnable |
|---|---|---|
| [OWASP Juice Shop](juice-shop/truth.json) | challenge list, companion guide | yes |
| [DVNA](dvna/truth.json) | solution guide | yes |
| [OWASP WebGoat](webgoat/truth.json) | lesson sources | yes |
| [OWASP NodeGoat](nodegoat/truth.json) | in-app tutorial | not yet (needs MongoDB) |
| [DVWA](dvwa/truth.json) | module help pages | not yet (needs MariaDB and setup) |
| [OWASP crAPI](crapi/truth.json) | challenges and solutions | not yet (Compose, many services) |

How each app is started is in [apps.mjs](apps.mjs): image pinned by digest,
source pinned by commit.

## Isolation

- Each app runs on its own `docker network create --internal` network: no
  route out.
- A relay container (`alpine/socat`, pinned) publishes it on `127.0.0.1`
  only.
- Penthera runs with `--offline`, an empty `HOME`, and
  [scripts/ci/net-guard.cjs](../../scripts/ci/net-guard.cjs) preloaded, which
  fails and logs any connection or DNS query past loopback. The count is in
  `RESULTS.md` and must be zero.
- The `standard` run sends no attack payloads. The `deep` run does, to the
  local container only. `RESULTS.md` lists the probes Penthera ran.
- No run logs in to any app.

## Files

| File | What |
|---|---|
| `<app>/truth.json` | Answer key: every documented item, with a link to the app's own docs at the pinned commit, our class, and in-scope flag or exclusion code. Frozen before the app was scanned |
| `<app>/labels.json` | Labels for findings the key does not cover, keyed by finding fingerprint (pilot: one provisional labeller) |
| `score.mjs` | Classes, matching, precision and recall with Wilson intervals (tested in `tests/bench-known-vuln.test.js`) |
| `run.mjs` | Clone, start, scan, score, tear down, write `RESULTS.md` (or `--out`) |
| `MISSES.md` | Verdict and evidence for each pilot miss, and which fix addresses it |
| `RESULTS-after-fixes.md` | The pilot re-run after those fixes, with before and after |
| `apps.mjs` | How each app is started |

Answer keys hold links and short descriptions in our own words, never the
apps' code. Juice Shop's out-of-scope entries quote one sentence of each
challenge description (MIT); the GPL apps (DVWA, WebGoat) are only linked.

## Adding a label

When a run reports unlabelled findings, open the app's `labels.json` and
add the fingerprint from the `--json` output with `verdict` (`correct`,
`incorrect`, `cannot-tell`), `actionable`, and a one-line `reason` that
says what you checked. Do not edit `truth.json` after the app has been
scanned except as a dated amendment (see the protocol, § 5.4).
