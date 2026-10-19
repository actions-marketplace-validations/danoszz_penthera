# Changelog

All notable changes to Penthera are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **`penthera hook install|uninstall|run`**: a pre-commit hook that checks
  staged content only (the git index): secrets and AI provider keys, the
  `penthera agents` rules on staged `.mcp.json`, `CLAUDE.md`, `AGENTS.md`,
  `.cursor/`, `.claude/` and `skills/`, and, when `package-lock.json` is staged,
  the capability diff against HEAD plus the license policy for the packages the
  commit adds. Blocks on high and critical by default; one line per finding with
  a fix hint and a `penthera.suppress.json` id. An existing hook is kept as
  `pre-commit.pre-penthera`, runs first, and is restored by `uninstall`. Refuses
  to write into a `core.hooksPath` managed by husky or lefthook without `--force`.
  `.pre-commit-hooks.yaml` for pre-commit.com. Configured by a new `hook`
  section in `penthera.policy.json` (`blockOn`, `checks`, `ignore`)
- **License policy**: `penthera deps --license-policy <preset|file>` and a
  `licenses` section in `penthera.policy.json` (`preset`, `allow`, `deny`,
  `allowPackages`, `unknown`). Presets `permissive`, `weak-copyleft-ok` and
  `no-agpl`. A small SPDX expression parser handles `AND`/`OR`/`WITH`,
  parentheses, `+` and `LicenseRef-`, and matches deprecated ids (`GPL-3.0`) to
  their current form. Breaches and `UNLICENSED` are high; missing, custom and
  non-SPDX licenses are medium. Findings use category `license`; the SPDX id
  list is vendored (`lib/deps/spdx.json`). CycloneDX SBOM components now carry
  their license

## [1.4.0] - 2026-10-19

The biggest release so far, covering the v1.3.0 "AI toolchain" and v1.4.0
"Local loop" milestones together. Penthera now does the routine work of a small
security team on your own machine:
- tests your app;
- vets and guards your dependencies;
- audits your AI tooling;
- fixes what it finds on a local branch and verifies each fix;
- writes reports and evidence for auditors.

It still runs offline, with no telemetry. The first outside contribution, from
@Nurana100, is in this release.

Requires Node 22+. Upgrading from 1.1.x or 1.2.x needs no config changes.

### Added

- **GitHub Action** (`uses: danoszz/penthera@<sha>`, `action.yml`): on PRs that
  change the lockfile it runs `penthera deps --base <PR base>`, upserts one PR
  comment marked `<!-- penthera-deps -->` (edited in place on every push), and
  uploads SARIF. Runs from the action's own checkout with no npx or npm install.
  Fork PRs get the diff in the job summary. Also `mode: agents` and `mode: scan`,
  plus `fail-on`. Example: `docs/examples/pr-dependency-review.yml`
- **`penthera agents [path] [--home] [--pin]`**: an offline, deterministic audit
  of AI developer tooling. It finds and parses `.mcp.json`, `.cursor/`,
  `.claude/`, `.vscode/mcp.json`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`,
  `.github/copilot-instructions.md` and skill folders; with `--home` also
  `~/.claude` (settings, hooks, permissions, plugins, skills), `~/.claude.json`,
  `~/.cursor/mcp.json` and the Claude Desktop config. Read-only, no network, no
  LLM judge
- Hidden-content engine (`lib/agents/hidden-content.js`): Unicode tag
  characters (decoded), zero-width and bidi controls, variation-selector
  smuggling, whitespace inflation, instructions in HTML comments, text aimed at
  a scanner, base64 blobs (decoded and classified), binaries and archives in
  skill folders by magic bytes, symlinks that leave a skill, and `curl | sh` /
  `eval` style remote execution
- Risky-config rules: unpinned `npx -y` / `uvx` / `bunx` / `pnpm dlx` MCP
  servers, inline secrets in server env/headers/args (via `findSecretsInText()`),
  plain-HTTP remote servers, hooks that auto-approve or pipe to a shell,
  `Bash(*)` and other wildcard permissions, `bypassPermissions`, credential-file
  allows, wildcard `allowed-tools`, and unpinned plugin marketplaces
- `penthera.lock`: `--pin` records SHA-256 hashes of every skill folder, MCP
  server definition, hook and installed plugin; later runs report changed (rug
  pull), new and removed entries
- A–F grade for the agent setup in the terminal and Markdown reports. Findings
  use category `agent-config`, map to OWASP MCP Top 10 and Agentic (ASI) ids,
  and get per-rule SARIF ids (`agents/<rule>`)
- Agent Skill: Workflow 6 ("audit my MCP servers / skills / agent config")
- `docs/METHODOLOGY.md`: threat model, what black-box and white-box scanning
  can and cannot find, the confidence model, false-positive controls, the
  non-destructive default, offline operation, and how new attack techniques
  are adopted (reviewed rules in releases, never fetched at run time). Design
  choices cite published research and standards
- `docs/references.bib` and `docs/references.md`: 48 references, each checked
  against the publisher or standards body, grouped by topic
- Per-finding citations: `lib/references.json` maps each finding category to
  1-3 references. The Markdown report adds a "Why this matters / Sources" line
  per finding and a "Sources" line per action-plan item; SARIF rules get
  `helpUri`, `help` and `properties.references`
- Accuracy benchmark: `npm run bench` scans the mock server, two new local lab
  targets (vulnerable and decoy) and a generated repo fixture, scores precision
  and recall against `bench/ground-truth.json`, and writes `bench/RESULTS.md`.
  Offline and seeded; `npm test` fails if it drops below the CI floor.
  Optional Juice Shop and crAPI targets are documented
- `CITATION.cff`, so GitHub shows "Cite this repository"
- **`penthera deps [path]`**: offline, deterministic dependency risk scanning
  for npm. Reads `package-lock.json` (v1-v3), statically scans every installed
  package and reports what it can do, with `file:line` evidence: install
  scripts (including implicit `node-gyp`), shell, network, writes outside its
  folder, environment reads and bulk access, `eval` / `new Function` / `vm`,
  computed `require`/`import`, native binaries, and obfuscation signals
- **Capability diff** (`--diff <lockfile|dir>`, `--base <git-ref>`): packages
  that are new or that gained capabilities in an upgrade. Old versions come
  from the base tree or npm's local content cache, verified against the
  lockfile integrity, so the diff works offline
- Attack indicators: writes to `~/.claude`, `~/.cursor`, `.mcp.json` or the
  Claude Desktop config, running the `claude` / `gemini` / `q` CLIs (the
  s1ngularity pattern), GitHub token harvesting, and the whole environment
  serialised next to network code
- Typosquat / slopsquat check against a vendored list of ~7,800 popular npm
  names (`lib/deps/popular-packages.json`, from npm-high-impact), refreshed at
  release time by `npm run refresh:popular`. Nothing is fetched at runtime
- `--online` (off by default, the only network use): npm registry metadata for
  fresh versions, brand-new packages, publisher changes and deprecations
- `--pr-comment <file>` and an example workflow
  ([`docs/examples/github-actions-deps.yml`](docs/examples/github-actions-deps.yml))
  that comments the capability diff on PRs that change the lockfile
- Findings use category `dependency-risk` and source `deps-scan`; SARIF
  results now carry a start line when a finding has one
- **`penthera install [pkg...]`**: an install firewall on the `deps` engine.
  npm resolves the new tree in a temporary copy with scripts off
  (`--package-lock-only --ignore-scripts`), new tarballs are fetched with
  `npm cache add` and read back only after an integrity check, and the
  capability diff, new install scripts (with their commands) and typosquats
  are shown before anything in the project changes. `penthera.policy.json`
  (`allow` names/globs, `deny` and `requireApproval` capabilities) decides;
  by default new install scripts, AI-config writes, AI CLI invocation, token
  harvesting, obfuscation, typosquats and unreadable packages need approval.
  Interactive by default, `--yes` for CI (installs only when nothing breaches
  the policy), `--dry-run` to report. On approval the reviewed lockfile is
  installed as is, with `--ignore-scripts` unless the scripts were approved
  (on npm 12+, approved scripts are pinned in `package.json` `allowScripts`).
  An abort leaves the project byte for byte unchanged. npm's registry traffic
  is the only egress, and it is printed
- `scanDeps()` accepts `treeRoot` and a list of cache dirs; the diff output
  carries each changed package's install scripts
- **Fix recipes** (`lib/fix/`, `penthera fix`): deterministic, local fixes for
  common findings, printed as unified diffs. `penthera fix --plan` plans fixes
  for a fresh repo scan or an earlier `-o` report; `penthera fix --apply <id>`
  applies one after a y/N prompt (or `--yes`), then re-scans to verify. Recipes:
  security headers (Next.js, Express, Fastify, Hono), cookie flags, CORS
  wildcard to an allowlist from `CORS_ALLOWED_ORIGINS`, a rate-limit stub on
  login/auth routes, and a hardcoded secret moved to an env var with
  `.env.example` updated (always with the owner action to rotate it)
- `applyDiff()` refuses paths outside the repo (symlinks included), `.git`,
  and dirty or non-git trees unless `--allow-dirty`, and writes nothing unless
  every hunk applies. Planning never writes; nothing is committed or pushed
- Recipes edit only at exact anchors and return no plan when the anchor is
  missing, instead of a risky diff
- Optional `--fix-model <name>` fallback for findings no recipe matches. It
  talks only to Ollama on `127.0.0.1:11434`, is off by default, and labels its
  output `confidence: "needs-human-review"`, `source: "local-model"`
- Fixtures for Next.js, Express, Fastify and Hono under `tests/fixtures/fix/`
- `detectFramework()` is now exported from `lib/whitebox/frameworks.js`
- **Audience reports** (`--audience developer|owner|auditor`): developer gets
  findings with file:line, fix recipe ids or diffs, and sources; owner gets a
  plain-language summary, what to do first, owner actions and the trend from
  memory; auditor gets scope and method (linking `docs/METHODOLOGY.md`),
  confidence labels with provenance per finding, egress and inconclusive
  probes, suppressions with who and why, and NIS2 and OWASP mapping tables.
  The default report is unchanged
- **User templates** (`--report-template file.md`): `{{a.b}}`,
  `{{#each}}`, `{{#if}}`/`{{else}}`, nothing else. Values are HTML- and
  Markdown-escaped; no helpers, code, includes or prototype access. Written from
  scratch (`src/report/template.js`) and fuzz-tested against injection
- **Fix timeline** in the audience reports: found → fixed → verified with time
  to fix, from an agent loop run (`loopRun`) or memory fix events
  (`lib/memory/history.js`, also the owner report's trend)
- **Evidence bundle** (`--evidence <dir>`, `--sign-key <ssh-key>`): JSON,
  Markdown, SARIF, the three audience reports, a custom template report, the
  readiness report and SBOM when requested, and `manifest.json` (tool version,
  command line with secrets redacted, timestamp, target, git commit, SHA-256 of
  every file). Signing uses `ssh-keygen -Y sign -n penthera-evidence`; no new
  dependency. `penthera evidence verify <dir> [--allowed-signers <file>]`
  recomputes every hash, rejects changed, missing, extra and symlinked files,
  and checks the signature. See `docs/evidence.md`
- **`penthera agent --loop`** (`src/agent/`): the local scan → triage → plan →
  patch → verify → learn loop. Fixes are applied one at a time on a local
  branch `penthera/fix-<yyyymmdd-hhmm>`, verified by a re-scan (and the
  project's tests with `--run-tests`), committed when verified and reverted
  when not. Every diff needs `y/n/skip/quit` approval; `--auto low` auto-applies
  only recipes memory shows verified 3+ times with no failures on the
  framework. Stops when nothing fixable is left or at `--max-iterations`
  (default 5). `-o` writes a `loopRun` JSON (iterations, fixes, time per step),
  also appended to memory as a new `loop_run` event
- The loop runs git only through an allow-list of local subcommands with
  `protocol.allow=never`, no lazy fetch and the repo's hooks disabled; it never
  pushes, fetches or opens pull requests. Scans run in one offline egress
  context (the `--url` host only; Ollama on 127.0.0.1 only with
  `--fix-model`). It refuses a dirty tree or detached HEAD unless
  `--allow-dirty`, and Ctrl-C leaves only verified commits on the fix branch

### Docs

- Sharper positioning: "the routine work of a security team, on your own
  machine". The README now opens with what Penthera does for you, why you can
  trust it, and a factual table of how it fits next to Socket, Snyk, GitHub,
  OWASP ZAP and Anthropic's OSS Scanner. The package, plugin, skill and
  repository descriptions match.
- Funding and partnership drafts under `docs/funding/`: an NLnet application
  draft, GitHub Sponsors tiers, a partner brief, and a due diligence checklist.
- CONTRIBUTING: commits are signed off under the Developer Certificate of Origin.
- **`--offline`**: the scan contacts only the target. Recon is skipped, the
  Retire.js check uses the vendored database snapshot, and every other host is
  refused by the HTTP client (redirects may stay within the target's
  registrable domain). Groundwork for the local agent loop.
- **Vendored Retire.js database** (`lib/data/retire-jsrepository.json.gz`,
  72 KB gzipped) with source URL, date and SHA-256 in a meta file.
  `npm run refresh:retire-db` updates it at release time, and
  `npm run refresh:retire-db -- --check` reports drift from upstream. Online
  scans fall back to it when the live download fails.
- **Third-party egress report**: every scan lists the hosts it contacted
  besides the target, in the terminal summary and in a "Network egress" section
  of the Markdown report (`result.egress` in JSON).
- **`--user-agent <ua>`** to override the new default User-Agent.

### Changed

- Every request now sends `User-Agent: penthera/<version>
  (+https://github.com/danoszz/penthera)` instead of Node's default (#7;
  first added by @Nurana100 in #20, our first outside contribution).
- Probe failures (timeouts, connection errors, refused hosts) are recorded as
  `result.errors[]` (`{ probe, url, message, count }`). The terminal summary
  shows "N probes inconclusive", and the Markdown report lists them under
  "Inconclusive probes" (#8).
- All network calls go through one client in `src/utils/http.js`, which owns
  timeouts, the User-Agent and egress policy. The per-module fetch wrappers in
  the crawler, injection, fuzzer, template, recon, parameter, Retire.js and
  adaptive-probe modules are gone.
- **Local learning store** (`lib/memory/`), the memory behind the v1.4 local
  loop. `--memory` records each scan under `~/.penthera/memory/<project-id>/`
  (or `PENTHERA_HOME`) as an append-only, hash-chained event log, then uses it
  to suppress findings marked as false positives and to rank findings within a
  severity. Suppressed findings are listed in their own section with who
  suppressed them and why. Memory is never read from the scanned repo and
  nothing in it is ever executed; a broken chain means memory is not applied.
  See [docs/local-loop.md](docs/local-loop.md) for the threat model
- `penthera memory show | verify | forget [--all] | suppress <id> --reason <text>`
- Optional repo file `penthera.suppress.json` for shared suppressions. Every
  finding it hides is labelled "suppressed by repo file" with its reason

## [1.2.0] - 2026-10-19

The first step toward securing the AI toolchain itself: catch AI provider keys,
harden Penthera's own supply chain, and make CI test what it says it tests. The
[roadmap](ROADMAP.md) now sets out the AI supply-chain and local agent-loop
tracks.

### Added

- **AI provider key detection** in repo scans: Anthropic, OpenAI project and
  service-account keys, OpenRouter, Google (Gemini / Firebase), Groq, Hugging
  Face, Replicate, xAI, Perplexity, LangSmith, and Pinecone. Jupyter notebooks
  (`.ipynb`) are now scanned too. A provider key inside an `api_key = "..."`
  assignment is reported once, under its provider, instead of twice
- `findSecretsInText()` exported from `lib/whitebox/secrets.js`, so the same
  rules can run on any text (groundwork for scanning JS bundles)
- CodeQL and OpenSSF Scorecard workflows, Dependabot for npm and GitHub Actions
  (with a 7-day cooldown before adopting new releases)
- CI check that `package.json`, the lockfile, the skill, and both plugin
  manifests carry the same version
- Roadmap: AI supply-chain audit (`penthera agents`), a fully local
  scan → fix → verify → learn loop, and LLM-endpoint probes. Principles now
  state no telemetry, no auto-push, and no remote learning

### Fixed

- **Modern OpenAI keys were missed.** The old pattern stopped at the hyphen in
  `sk-proj-...` and `sk-svcacct-...`, so the key format OpenAI has issued since
  2024 never matched
- The example scan workflow lived in `.github/workflows/`, so it ran on its
  weekly cron and failed every Monday. It moved to
  `docs/examples/github-actions-scan.yml` and now uses `npx penthera@<version>`,
  so it works when copied into your own repo
- CI ran only 4 of 24 test files; it now runs the full `npm test`
- Removed `tests/pentest-static.test.js`, which tested functions defined inside
  the test file rather than anything Penthera ships
- `.claude-plugin/plugin.json` still said 1.0.0
- `SECURITY.md` listed 1.0.x as supported. It now covers 1.2.x and gives response
  times, scope, and safe-harbor terms

### Changed

- **Node.js 22 or newer is now required.** Node 18 and 20 are end-of-life, and
  the test toolchain (vitest 5) needs 22. CI runs on Node 22 and 24
- GitHub Actions are pinned to commit SHAs, and every workflow declares
  least-privilege `permissions`
- Releases use npm trusted publishing (OIDC, no stored token) and **staged
  publishing**: CI stages each version, and it only goes live after a
  maintainer approves it with 2FA. The workflow also creates the GitHub Release
- The Docker image runs as the unprivileged `node` user on `node:22-alpine`
- README reordered so install and quick start come before compliance. The full
  NIS2 guide moved to [`docs/compliance-nis2.md`](docs/compliance-nis2.md)
- vitest 3 → 5 (clears 8 dev-only advisories), yaml 2.8 → 2.9

## [1.1.1] - 2026-08-16

A correctness release. One of these was a live outage: if you are on 1.1.0,
upgrade.

### Fixed

- **JS dependency scanning was silently dead.** The Retire.js vulnerability
  database URL pointed at a fork that now returns 404, so every scan reported
  "no vulnerable JS libraries" without ever running the check. It now reads from
  upstream RetireJS with a mirror, validates the payload, and when no source is
  reachable it says the check did not run instead of returning a clean result.
  The probe is also excluded from coverage in that case, so a compliance report
  cannot claim supply-chain evidence that was never collected
- **Command injection in the machine audit.** Binary paths read from
  attacker-writable plists were interpolated into a shell string, so a malicious
  persistence entry could execute code inside the scanner. Paths are now argv
  entries and signature checks use the exit status, failing closed
- Two built-in templates fired on any single-page app with catch-all routing:
  the `.env.local` matcher accepted a bare `=` (present in every HTML attribute)
  and the Firebase one accepted any 200 without the word "error", so an
  `index.html` served at those paths was reported as critical
- Time-based SQL and command injection no longer report on a single slow
  response. A candidate delay is re-sampled and only reported when the median
  holds, which a garbage-collection pause or cold start does not survive
- Community template regexes ran unbounded against whole response bodies. A
  catastrophically-backtracking pattern would hang the scanner; patterns with
  nested quantifiers are now refused and input is capped
- Dedupe and baseline comparison used different keys that included severity, so
  re-rating a finding reported it as one resolved plus one new. Both now share
  the audit loop's fingerprint
- A measure with nothing scanned and nothing attested was scored as a gap,
  telling an entity that had not yet filled in the self-assessment that it had
  failed. That state is now reported as not assessed
- The XSS canary was a fixed, fingerprintable string; it is now randomised per
  probe
- XProtect staleness was computed and discarded; it is now reported

### Changed

- The Nuclei loader documents the subset it actually implements and reports per
  template which unsupported features it needs, instead of letting a template
  that cannot match look like a clean pass
- Provenance (confidence, method, collection time) now travels into SARIF, and
  the terminal marks findings a scanner cannot adjudicate

## [1.1.0] - 2026-08-16

NIS2 / Cyberbeveiligingswet readiness work: a hardening pass over the
open-source core, a full offline NIS2 readiness toolkit, and a humanizing pass
that removed AI-writing tells (em dashes and so on) from all public-facing text
and generated documents.

### Added

- **Customer security-questionnaire answerer** (`--questionnaire <file>`): reads a
  questionnaire (one question per line) and drafts an answer for each from the
  readiness evidence, citing the Article 21 measure and what backs it (scan
  probe or attestation). Anything it can't map is marked NEEDS HUMAN INPUT
  rather than guessed. Writes `questionnaire-response.md`
- **Attack chains surfaced in reports**: the adaptive engine's knowledge graph
  already correlated findings (for example an auth bypass that combines with an
  IDOR into cross-user access) but the result was computed nowhere. Chains now
  appear as findings with their path
- **Provenance + honest confidence on every finding**: each finding carries
  `{ source, method, collected_at, confidence }`, with confidence labelled
  `confirmed` / `likely` / `potential` / `needs-human-review` so a heuristic
  isn't presented as a certainty. Shown in the report's Confidence column and in
  JSON (`lib/provenance.js`)
- **Supplier passive rating** (`--suppliers <file>`): point Penthera's passive
  checks (homepage security headers, TLS certificate, SPF/DMARC/MX via DNS) at
  your own suppliers' public domains and get a red/amber/green posture per
  supplier, supply-chain risk screening (measure d). Strictly passive,
  public-data-only, non-intrusive, and documented as such; not a pentest of the
  supplier
- **Remediation / audit-loop tracking** (`--history <file>`): folds each scan's
  findings into a persistent history keyed by a stable fingerprint (severity-
  and count-independent), and reports open vs resolved, median time-to-fix,
  ageing buckets, and drift since last scan, the effectiveness evidence for
  measure f, and a "close the loop" counter to noisy discovery-only scanning
- **SBOM output** (`--sbom <file>`): generates a CycloneDX 1.5 software bill of
  materials from `package-lock.json` / `package.json` / `requirements.txt`,
  offline, with resolved versions and purls. Supply-chain evidence (measure d)
  and the artifact enterprises increasingly require of suppliers
- **Incident-report helper** (`--incident <file>`, `--incident-init` to scaffold):
  computes the NIS2 reporting deadlines (24h early warning / 72h notification /
  1-month final report) from when you became aware, flags overdue ones, and
  drafts each report against the jurisdiction's required content, with
  `NEEDS INPUT` markers for facts you still have to supply. Offline; drafts to
  help meet the deadlines, not a substitute for the authority's official form
- **Policy-pack generator** (`--policy-pack <dir>`): writes proportionate,
  editable Markdown starting points for the core policies NIS2 expects
  (information security, access control, incident response, backup/continuity,
  acceptable use, supplier security, vulnerability management). Pre-filled from
  the jurisdiction's incident deadlines and the readiness gaps; clearly labelled
  as templates, not legal advice
- **NIS2 readiness report** (`--readiness`): combines scan evidence with an
  offline **self-assessment** (`--assessment-init` to scaffold, `--assessment` to
  supply) into a per-measure `met / partial / gap / n-a` report across all ten
  Article 21 measures, with proportionality notes, the jurisdiction's
  incident-reporting deadlines, and **provenance** (`source, method, collected_at,
  confidence`) on every piece of evidence. Writes `<output>-readiness.md`. Works
  offline; jurisdiction data is config (`lib/jurisdictions/nl.json`, NL today)
- Remediation action plan: the report (terminal-adjacent Markdown + JSON
  `actionPlan`) now includes a prioritised, owner-actionable plan, what, why,
  how to fix, rough effort, and whether it's a code change or an owner action
  (rotate a secret, renew a cert, change DNS), replacing the old generic
  recommendations list. Built from a remediation knowledge base (`lib/remediation`)
- Agent Skill Workflow 5 + `references/reporting.md`: generate owner-facing
  documents from a scan, a remediation plan, a prefilled security-questionnaire
  response, and a NIS2 duty-of-care evidence summary, grounded in scan evidence,
  with unbacked/organisational items marked `NEEDS HUMAN INPUT` (never fabricated)
- Email authentication probe (SPF, DMARC, MX via DNS), new `lib/blackbox/email-dns.js`,
  runs in the standard profile for public domains. Flags missing/permissive SPF,
  missing or monitoring-only (`p=none`) DMARC, and nudges DKIM verification. A
  questionnaire staple that was previously uncovered
- `--framework nis2` compliance report mode: a per-scan NIS2 Article 21 coverage
  table (which measures this scan actually exercised, driven by the probes that
  ran) added to the terminal, Markdown, and JSON reports. Frameworks are
  declarative so national transpositions and other regimes can be added as data
- NIS2 / cyberwetgeving compliance section in the README: Article 21(2)(a-j)
  mapped to what Penthera actually tests, with a coverage key and a clear
  "not legal advice / not a certification" disclaimer
- Code of Conduct (Contributor Covenant 2.1), issue templates, and PR template
- `tests/detection-hardening.test.js` covering the secret-scan and SSTI fixes

### Fixed

- Interactive onboarding now attaches the remediation action plan to its report,
  matching the main CLI path (the two had drifted)
- Audit-loop fingerprint no longer merges genuinely distinct findings. Collapsing
  every digit run made different ciphers, TLS versions, library versions, API
  versions, and per-CVE findings look like one item, which distorted the
  measure-f numbers. It now collapses only numeric URL path segments and
  separates dependency CVEs by description
- `updateHistory` no longer mutates the history object passed to it
- Jurisdiction data is loaded once instead of re-read per document
- Secret scanner no longer flags dummy/probe credentials (e.g. the
  `invalid-password-12345` payload Penthera flagged on its own repo); rule
  renamed so the title no longer reads "Password in source in source"
- SSTI probe uses a randomized arithmetic canary instead of `7*7=49`, removing
  the critical false positive on any page containing "49"
- Endpoint calibration compares body length to body length (was body vs
  Content-Length), so the noise filter actually filters default/404 pages
- WSTG coverage now reflects the probes that actually ran, instead of asserting
  every profile probe was exercised; dropped two WSTG IDs that were mapped but
  never tested (CRYP-02 padding oracle, CONF-13 path confusion)
- Login "accepts arbitrary credentials" no longer fires on a bare HTTP 200; it
  requires an actual authenticated response (auth cookie or token) for the
  invalid-credential attempt, so SPA logins that return 200 `{success:false}`
  are no longer false-flagged
- Reflected XSS is only reported when the response is served as HTML; JSON/text
  APIs that echo a payload are no longer flagged as XSS
- Removed the fuzzer's prototype-pollution false positive (it fired on any
  object payload returning 200, because `payload.__proto__` is always truthy)
- Open-redirect false positives (found scanning a real Vercel-hosted site): the
  OAuth and injection open-redirect probes now confirm the `Location` actually
  resolves to the attacker's host, instead of substring-matching. A same-site
  apex→www canonicalization that preserves the payload in the query is no longer
  reported as an open redirect. Also removed the redundant, FP-prone
  "open redirect via callback" built-in template
- Login hardening probe no longer runs against a path that returns a redirect
  (3xx), 404, or 405, not a real login handler, removing a false "no login
  rate limiting detected" on redirected paths

### Changed

- Interactive wizard's remote-host permission prompt now defaults to **no**
- README shows the live CI status badge instead of a hand-written test count;
  live integration tests report as skipped (not passed) without a running target
- Corrected the built-in template count (14, not 17) in docs and progress output

## [1.0.0] - 2026-06-30

First production-ready release.

### Added

- PostHog-style interactive onboarding (`penthera` with no args, `penthera-scan`)
- Scan profiles: `quick`, `standard`, `deep`
- Markdown reports with OWASP WSTG coverage section
- Session-aware scanning (`--auth-cookie`, `--auth-bearer`, `PENTHERA_*` env)
- JWT, IDOR/BOLA, OAuth, client-side auth, and security header probes
- Secret scanning and Express/Hono/Fastify route discovery in repo mode
- Baseline diff mode (`--baseline`)
- Adaptive probe engine in CLI (`--adaptive`)
- Plugin/templates API (`--templates`, `lib/plugins.js`, programmatic exports)
- Agent Skill (`skills/penthera/`) with preflight and report validation scripts
- CI scan job with mock server, SARIF upload, and skill validation
- Staging URL workflow (`.github/workflows/scan.yml`)
- Docker image (`Dockerfile`)
- Documentation hub (`docs/index.md`, `docs/owasp-wstg-coverage.md`)

### Fixed

- URL trailing-slash normalization (double-slash 404 bug)

## [0.2.0] - 2026-04

- Markdown reports, scan profiles, auth tooling, expanded API discovery

## [0.1.x] - 2026-04

- Initial CLI: URL, repo, and machine scan modes
- Built-in templates, TLS, CORS, SARIF export

[1.1.1]: https://github.com/danoszz/penthera/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/danoszz/penthera/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/danoszz/penthera/compare/v0.2.0...v1.0.0
