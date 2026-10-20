# Internal testing audit

> **Pro.** For "how do I know a Penthera release is sound?"

Penthera is a security tool, so its own release bar has to be easy to check.
The internal audit is that bar: one command that runs every check a release
needs and writes the result to [`audit/REPORT.md`](../audit/REPORT.md).

```bash
npm run audit:internal
```

It exits 1 if any gate fails. A release is only tagged from a commit whose
audit passed (see the release checklist in
[CONTRIBUTING.md](../CONTRIBUTING.md#cutting-a-release)). The same audit runs
every Monday in CI ([`internal-audit.yml`](../.github/workflows/internal-audit.yml))
so drift shows up between releases.

## The gates

| Gate | What it checks | Fails when |
|---|---|---|
| Test suite | `npm test`, with the live suites pointed at the bundled mock server (`PENTEST_BASE_URL`) | Any test fails |
| Benchmark | `npm run bench` (offline, seeded) against the **Total** row of the committed [`bench/RESULTS.md`](../bench/RESULTS.md) | Precision or recall drops by more than 0.02, or any request leaves loopback |
| Self-scan | `penthera --repo .`, `penthera agents .`, `penthera deps .`, and `penthera hook run` on a copy of the tree with every file staged | A high or critical finding is not in [`audit/baseline.json`](../audit/baseline.json), or a baseline entry has no reason |
| CLI smoke | `--help` for every subcommand, plus a fixture run of each: a mock-server scan in every report format, `agents` on a clean and a malicious fixture, `deps`, `install --dry-run`, `fix --plan`, an evidence bundle and its `verify`, one `agent --loop` iteration (every diff declined), `hook install/uninstall` and `memory show/verify` | Any command exits with an unexpected code or produces the wrong output |
| Packaging | `npm pack --dry-run` | A file outside the allow-list ships, anything that looks like tests, fixtures, reports or secrets ships, or the package exceeds its size budget |
| Offline | A full `--all --adaptive --offline` scan of the mock server | The report's `egress` field shows any third-party host |
| Supply chain | `npm audit --omit=dev`; sha512 integrity for every lockfile entry; install scripts in runtime dependencies (via `penthera deps --prod`); every `uses:` in `.github/workflows`, `action.yml` and `docs/examples` | Any vulnerability, missing integrity, runtime install script, typosquat, action not pinned by commit SHA, or workflow without top-level `permissions:` |
| Versions and docs | The version in `package.json`, the lockfile, the plugin manifests, `SKILL.md`, `CITATION.cff` and the "How to cite" block in `docs/METHODOLOGY.md`; a `CHANGELOG.md` section for it; every relative link in `README.md` and `docs/` | Any mismatch or broken link |

Everything runs on this machine against this repo or `127.0.0.1`. The only
network use is `npm audit` (the npm registry) and, with `--with-docker`,
pulling the Juice Shop image.

## Options

| Flag | Effect |
|---|---|
| `--only bench,versions-docs` | Run some gates (ids: `tests`, `bench`, `self-scan`, `smoke`, `packaging`, `offline`, `supply-chain`, `versions-docs`, `docker`). Prints results and writes nothing. |
| `--update-baseline` | Rewrite `audit/baseline.json` from this run's self-scan. New entries get a `TODO` reason, which fails the gate until a person writes one. |
| `--with-docker` | Add the optional heavier targets below. |
| `--no-write` | Leave `audit/` untouched. |

Command output from each run goes to `audit/logs/` (ignored by git, uploaded
with the report as the CI artifact).

## Optional targets: Juice Shop and crAPI

`--with-docker` starts [OWASP Juice Shop](https://github.com/juice-shop/juice-shop)
on `127.0.0.1:3300`, scans it with the benchmark's `juice-shop` target, and
removes the container. Pin the image for reproducible numbers with
`JUICE_SHOP_IMAGE=bkimminich/juice-shop@sha256:...`.

[OWASP crAPI](https://github.com/OWASP/crAPI) needs its own Docker Compose
stack, so the audit scans it only if it is already running at `CRAPI_URL`
(default `http://127.0.0.1:8888`). Start it with the project's compose file
first.

Both are skipped by default. Neither has labelled ground truth yet, so the
report lists their finding counts and shows precision and recall as
"unlabelled" until they are labelled in `bench/ground-truth.json` (see
[bench/README.md](../bench/README.md#optional-targets)).

## When a gate fails

- **Tests, smoke, offline, packaging, supply chain, versions:** fix the cause.
  These describe what Penthera promises its users.
- **Benchmark:** if the change is intended (a new rule that trades a little
  precision for recall, a relabelled target), run `npm run bench`, commit the
  new `bench/RESULTS.md`, and say why in the PR.
- **Self-scan:** fix the finding. If it is a deliberate fixture, run
  `--update-baseline` and replace the `TODO` with the reason, so the
  acceptance is reviewed like any other change.

Thresholds (the 0.02 benchmark drop, the package size budget, the allow-list)
live at the top of [`scripts/audit/run.mjs`](../scripts/audit/run.mjs).
Change them in their own PR, never to make a release pass.

## The report

`audit/REPORT.md` has a pass/fail table with the numbers behind each gate,
the changes since the previous report (read from a data block at the end of
the previous file), and per-gate details. Commit it with each release so the
history of the gate lives in git.
