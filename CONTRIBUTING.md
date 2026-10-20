# Contributing to Penthera

> **Project page.** For contributors asking "how do I make a change, and how does it ship?"

This guide covers local setup, how the project is organized, how to write docs,
the release cadence, and the release checklist for maintainers.

By participating you agree to keep things respectful and to use the tool only
for **authorized** security testing (see [Ethics and authorization](README.md#ethics-and-authorization)).

Looking for a first task? Pick an issue labelled
[`good first issue`](https://github.com/danoszz/penthera/labels/good%20first%20issue),
or search the code for `TODO(good-first-issue)`: each marks a small, scoped
change. Maintainers: see [docs/marketing.md](docs/marketing.md#contributor-flywheel).

---

## Development setup

```bash
git clone https://github.com/danoszz/penthera.git
cd penthera
npm install
npm test          # full suite (vitest)
npm link          # optional: expose `penthera` globally for manual testing
```

Node 22+ is required (see `.nvmrc` for the pinned version).

### Test suites

| Command | What it covers |
|---------|----------------|
| `npm test` | Everything (vitest) |
| `npm run lint` | ESLint with a minimal config (`eslint.config.js`): unused code, undefined names, unreachable code. No style rules |
| `npm run pentest:mock` | Tests against the local mock vuln API |
| `npm run pentest:adaptive` | Knowledge-graph adaptive probes |
| `npm run pentest:wstg` | OWASP WSTG mapping |
| `npm run pentest:live` | Live playbooks, opt-in: needs `pentest.config.js` or `PENTEST_BASE_URL` and a running server |
| `npm run mock-server` | Start the mock API on port 8765 |
| `npm run audit:internal` | The release gate: every check above and more, written to `audit/REPORT.md` ([docs/internal-audit.md](docs/internal-audit.md)) |

CI runs `npm run lint` and the full `npm test` suite on Node 22 and 24, checks that every version
string is in sync, and self-scans the mock server (`.github/workflows/ci.yml`).
CodeQL and OpenSSF Scorecard run on their own workflows. Keep new tests offline:
no test may reach the public internet, so CI stays deterministic.

### Release checks: the package as users install it

`npm test` runs Penthera from this checkout. `.github/workflows/install-matrix.yml`
tests what npm users get, on every PR and push to `main`:

- **Fresh install.** `npm pack` once, then on Ubuntu, macOS and Windows with
  Node 22 and 24: install the tarball into an empty project and run
  `npx penthera` against a copy of `tests/fixtures/init/app` (`--version`,
  `--help`, `init --yes --dry-run`, `deps`, `deps --base`, `agents`, `--repo`,
  `hook install` plus a real `git commit` through the hook, `ui --demo`
  answering 401 without a token, `rules verify` on the bundled packs). The
  checks live in `scripts/ci/smoke-installed.mjs`.
- **Upgrade.** `penthera@1.7.0` from npm writes `~/.penthera` state (a
  `--memory` scan, `ui --demo`), then the tarball is installed over it and must
  verify and extend the same memory chain. Move `FROM_VERSION` to the latest
  release after each release.
- **Docs as tests.** `scripts/docs-commands.mjs` reads every command in
  `README.md`, `docs/**/*.md` and `skills/penthera/SKILL.md`, checks each
  subcommand and flag against `--help`, and runs the offline-safe ones on the
  fixture. It runs in `npm test` (`tests/docs-commands.test.js`) and in the
  matrix against the installed package. If you document a command, it must
  exist; if you add a flag, list it in `--help`. Run it alone with
  `node scripts/docs-commands.mjs` (add `--report out.md` for the
  runnable/placeholder/external breakdown).

Every Penthera process in these checks runs under `scripts/ci/net-guard.cjs`,
which fails any connection or DNS query past loopback. The only internet use is
npm installing the package's dependency and the old release for the upgrade
job. To run the smoke checks locally:

```bash
npm pack --ignore-scripts --pack-destination /tmp/pkg
```

then `npm install /tmp/pkg/penthera-<version>.tgz` in an empty folder and
`node scripts/ci/smoke-installed.mjs --prefix <that folder>`.

**Windows.** `.cursor/skills/penthera` is a symlink to `skills/penthera` so
Cursor picks up the skill when you work on Penthera itself. Git for Windows
checks it out as a plain text file unless symlinks are enabled: turn on
Developer Mode, then clone with `git clone -c core.symlinks=true …`. Without
it, Cursor just doesn't see the skill in this repo. The npm package does not
include `.cursor/`, so users are not affected.

### Writing tests that stay reliable

The suite runs fully parallel, often on a laptop that is busy with dev servers,
builds and other test runs. A test that passes alone but fails under load is a
bug in the test. Follow these rules:

- **No shared paths.** Make every directory with `mkdtempSync(join(tmpdir(), "penthera-<area>-"))`
  inside the test or its `beforeEach`, and remove it afterwards. Never write
  into `tests/fixtures/` or the repo: copy the fixture to a temp dir first.
- **No fixed ports.** Servers listen on port 0 (`startMockServer(0)`,
  `server.listen(0, "127.0.0.1")`) and the test reads the port back.
- **No real machine state.** `tests/setup/isolate-env.js` gives every worker a
  private `HOME`, `PENTHERA_HOME`, npm cache, `GIT_CONFIG_GLOBAL=/dev/null` and
  `GIT_CONFIG_NOSYSTEM=1`. Spawn children with `env: { ...process.env, ... }`
  (or no `env` at all) so they inherit it; don't build an env from scratch.
  Give npm its own cache dir (`npmEnv()` in `tests/fixtures/install/registry.js`).
- **Don't block a process that serves.** If the mock server or fixture registry
  runs in the test's own process, spawn with async `spawn`/`execFile`, never
  `spawnSync`/`execFileSync`: the child would wait on a server that can't answer.
- **Wait for conditions, not time.** Await the event, file or output you need;
  no `setTimeout(r, 100)` "should be enough". Performance guards
  (no-ReDoS, linear-time tests) measure CPU time with `cpuMs()` from
  `tests/fixtures/cpu-time.js`, never wall-clock time.
- **Spawn-heavy files go in `SPAWN_HEAVY`** in `vitest.config.mjs`. A file
  belongs there if its tests start `node bin/penthera.js`, `git` or `npm`, or
  run whole scans against a local server. Those files get a long timeout (a hang
  detector, not a performance budget) and only a few run at once. Don't add
  per-test timeouts there; everything else keeps the tight defaults.
- **Keep pure tests out of slow hooks.** A `beforeEach` that creates a git repo
  belongs inside the `describe` that needs it, not at file level.

To check a change against a loaded machine, run the suite repeatedly while busy
loops hold every core:

```bash
npm run test:load -- 10
```

`node scripts/test-under-load.mjs <runs> <busy threads> [--background]` takes
the same arguments; `--background` (macOS) also runs vitest at background QoS,
like a suite started from an app that is not in front.

---

## Project layout

```
bin/                CLI entry points (penthera.js, scan.js)
src/
  cli/              profiles, baseline, onboarding, run-scan, ansi, prompt
  report/           markdown.js (human-readable reports)
  utils/            url, http, auth
  scan-url.js       black-box orchestrator
  scan-repo.js      white-box + secret scanning
  reporter.js       terminal, JSON, SARIF output
lib/
  blackbox/         headers, openapi, client-auth, jwt, idor, oauth, email-dns, adaptive-scan
  whitebox/         secrets scanner (incl. AI provider keys), route discovery, SBOM
  compliance/       NIS2 readiness, self-assessment, policy pack, incident, questionnaire
  remediation/      fix playbook and prioritised action plan
  jurisdictions/    per-country config (nl.json)
  owasp-wstg.js     WSTG v4.2 probe mapping
  provenance.js     confidence + provenance on every finding
  audit-loop.js     remediation history, time-to-fix
  plugins.js        templates/plugins API (also exported from the package)
skills/penthera/    Agent Skill (SKILL.md, references/, scripts/)
docs/               documentation hub
tests/              vitest suites + fixtures/mock-server.js
```

`src/` is the CLI/orchestration layer; `lib/` is the scanner engine. The package
re-exports engine pieces via `exports` in `package.json`
(`penthera/plugins`, `penthera/adaptive`, `penthera/wstg`).

---

## Adding a probe or template

- **New black-box check:** add a module under `lib/blackbox/`, wire it into
  `src/scan-url.js`, and map it to an OWASP WSTG id in `lib/owasp-wstg.js`.
- **New custom template:** Penthera loads Nuclei-compatible YAML. Point users at
  a directory with `--templates ./dir` or call `loadTemplatesFromPaths()` from
  `penthera/plugins`.
- Every finding needs a `severity`, `title`, `target`, and a remediation hint so
  reports stay actionable. Add a test (prefer the mock server over live hosts).
- **Say where the technique comes from.** In the PR, give the source (paper,
  advisory, OWASP or MITRE ATLAS entry, incident write-up) and the date. If the
  finding uses a new `category`, map it to 1-3 entries in `lib/references.json`,
  adding any new entry to `docs/references.bib` only after checking it against
  the publisher, then run `node scripts/build-references.mjs`.
- **Add a benchmark case.** A labelled true positive in `bench/`, plus a decoy
  where a false positive is plausible, then `npm run bench` and commit the
  updated `bench/RESULTS.md`. See [bench/README.md](bench/README.md).
- Rules ship in releases only. Do not add code that downloads rules,
  templates or signatures at run time
  ([why](docs/METHODOLOGY.md#how-new-attack-techniques-are-adopted)). The
  Retire.js database download is the one existing exception, documented in
  [METHODOLOGY.md](docs/METHODOLOGY.md#offline-and-no-telemetry).

---

## Pull requests

1. Branch from `main`.
2. Keep changes focused; add or update tests.
3. Run `npm test`; it must be green on Node 22+.
4. Update `CHANGELOG.md` and the relevant docs. Docs follow the
   [voice guide](docs/voice.md): one user question per page, plain words,
   numbers over adjectives.
5. Sign off every commit (see below).
6. Open the PR with a clear description and rationale.

### Sign off your commits (DCO)

Penthera uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/).
By signing off a commit you certify that you wrote the change, or otherwise
have the right to submit it under the project's MIT licence. Add the sign-off
with `-s`:

```bash
git commit -s -m "fix: describe the change"
```

This adds a line like `Signed-off-by: Your Name <you@example.com>` to the
commit message. It must match the commit author. To sign off commits you
already made on your branch, run `git rebase --signoff main` and force-push.

### Use of generative AI

AI assistants are welcome here, and must be disclosed. Penthera follows the
disclosure rules of the
[NLnet generative AI policy](https://nlnet.nl/foundation/policies/generativeAI/);
how the project itself uses AI is described in [docs/genai.md](docs/genai.md).

If an AI assistant wrote or substantially shaped a commit, add these trailers to
the commit message:

```
AI-Assisted: <tool> with <model and version>; <what it did, in one line>
Co-Authored-By: <model and version> <noreply address of the vendor>
```

For example:

```
fix(deps): handle pax size headers in the tar reader

AI-Assisted: Claude Code with Claude Opus 5.5; wrote the parser change and
  the regression test from my description of the bug, I reviewed both
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Signed-off-by: Your Name <you@example.com>
```

- **Summarise the prompt** in the `AI-Assisted` line: what you asked for, not
  the full transcript. For grant-funded work, the full prompts and outputs also
  go in `docs/genai-logs/` (see [docs/genai.md](docs/genai.md)).
- **Keep human and generated work apart** where you can: put generated changes
  in their own commits, so the history shows which is which.
- **You remain responsible.** By signing off you certify the change can be
  published under the MIT licence and does not copy code under incompatible
  terms. Only submit code you understand and can explain.
- **Docs and tests only:** if AI only helped with documentation or tests, the
  `Co-Authored-By` trailer is enough.

Report security issues in Penthera itself privately; see [SECURITY.md](SECURITY.md).

---

## Release cadence and freeze

Penthera is maintained part-time, so releases follow a fixed rhythm that keeps
quality from depending on anyone's free evenings.

- **At most one minor release every 2 to 4 weeks**, each with one theme.
- **Every minor goes through a release candidate first:** `X.Y.0-rc.N`,
  published on npm's `next` dist-tag. It becomes `latest` only after the
  release candidate has run on real projects without a blocking issue and the
  maintainer approves.
- **Patch releases are for fixes only.** No new flags, rules or commands.
- **A feature freeze before each minor.** From the freeze, only fixes and docs
  go into that release; features wait for the next one.
- **No version bump or tag without the maintainer's go.**

**Current freeze: 1.8.0 = main + [#63](https://github.com/danoszz/penthera/pull/63)**
(the dashboard redesign). Other open pull requests go into 1.9. See the
[roadmap](ROADMAP.md#now-180-feature-freeze).

Between releases:

- The internal audit runs weekly and before every tag. A red audit blocks the
  release.
- Three to five `good first issue` issues are kept open, so contributors can
  help without needing the maintainer's time.
- Anything that needs judgement (a probe that sends payloads, anything that
  touches third parties) gets a short design note in `docs/` before code.

---

## Cutting a release

Publishing is automated and two-step. Pushing a `v*` tag runs
`.github/workflows/publish.yml`, which tests, checks the tag against
`package.json`, **stages** the package on npm with provenance (trusted
publishing, no token), and creates the GitHub Release. The version only goes
live once a maintainer approves it with 2FA. **Do not run `npm publish` locally.**

1. Bump the version everywhere it appears. CI fails if they drift:
   - `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`)
   - `skills/penthera/SKILL.md` (`metadata.version`)
   - `.claude-plugin/plugin.json` (`version`)
   - `.claude-plugin/marketplace.json` (`metadata.version`)
   - `CITATION.cff` (`version`)
   - `docs/METHODOLOGY.md` (the "How to cite" block)
2. Move the `[Unreleased]` notes in `CHANGELOG.md` under the new version.
   Refresh the typosquat list with `npm run refresh:popular` and commit
   `lib/deps/popular-packages.json.gz` if it changed (the only time it is fetched).
3. Run the internal audit on the release branch: `npm run audit:internal`.
   **It must pass.** Commit the regenerated `audit/REPORT.md` with the release
   and read its "Changes since the previous report". A new self-scan finding
   is fixed, or accepted in `audit/baseline.json` with a reason in review;
   never by loosening a threshold to make the gate pass.
4. Merge to `main` through a PR so CI runs. The PR needs a green
   "install matrix result" (the release checks above), not only `CI`.
5. Tag the merge commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
   Do not tag a commit whose audit failed. For a minor release, tag the
   release candidate first (`vX.Y.0-rc.N`, with the same version in every file
   from step 1) so it lands on the `next` dist-tag. Note: `publish.yml` does
   not pass `--tag next` for `-rc` tags yet; add that before the first release
   candidate.
6. Approve the staged version with 2FA: npmjs.com → penthera → Staged Packages →
   Approve, or `npm stage list penthera` and `npm stage approve <stage-id>`.
   Check the file list and provenance before you approve.
7. Optional: `npm run package:skill` and attach the zip to the release for
   Claude.ai uploads.
