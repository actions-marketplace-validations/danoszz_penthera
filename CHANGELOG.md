# Changelog

All notable changes to Penthera are documented here. Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Site

- penthera.org counts anonymous page views and load times with Vercel Web
  Analytics and Speed Insights (cookieless, served from the same origin). The
  CSP now allows connections only to those two paths on penthera.org; the
  browser check still sends nothing, and the page says so. The CLI, the
  dashboard and the npm package have no telemetry, unchanged.

### Docs

- Compared with Cloudflare's security-audit skill: a side-by-side in
  `docs/compare/` and a research note on how Penthera can read its findings,
  re-check them with rules and seed it, plus a proposed experiment (E9).
- The PHP case study and `docs/runtime-advisories.md` cite OpenAI's
  php2shell-checker as an independent cross-check. A test pins that Penthera
  agrees with its table on all 14 PHP branches.
- The website is live at [penthera.org](https://penthera.org): the README links
  it, and the npm package's homepage points to it from the next release.

## [1.8.0] - 2026-10-21

1.8.0 is 1.8.0-rc.1 plus the changes below; there was no separate rc.2
release. Highlights across both: fixes from a second independent security
review, a fix loop that cannot edit the tests that judge it, the redesigned
dashboard (Simple and Advanced mode), release checks on Linux, macOS and
Windows, and now runtime advisories, starting with PHP's critical security
release of 21 October 2026, in a new signed `advisories` rule pack (1.8.0-rc.1
cannot load it). The benchmark gained two PHP cases: precision 0.88 (95% CI
0.69 to 0.96) and recall 0.91 (0.73 to 0.98) on 24 scored findings.

### Added

- **Runtime advisories: is the PHP, Apache, nginx, Node.js, Python or OpenSSL
  you run affected?** URL scans read `Server` and `X-Powered-By` banners, the
  `PHPSESSID` cookie name and `.php` pages. Repo scans read Dockerfile and
  compose images, `.tool-versions`, `.php-version`, `.nvmrc`,
  `.python-version`, `runtime.txt` and `composer.json`. Each product and
  version gets one answer: affected, end of life with no fix, check on server,
  or has the fix (as advertised). A hidden version is never reported as safe.
  A distribution build (`8.1.2-1ubuntu2.19`, or any version behind a `Server`
  header that names a distribution) is never reported as affected, because
  distributions backport fixes under the same version number. Advisories that
  need more than a version (Windows, CGI) stay `potential`. See
  [docs/runtime-advisories.md](docs/runtime-advisories.md).
- **Two rule-pack kinds, `runtime-advisory` and `runtime-eol`**, so a new
  advisory ships as a signed data pack (`--rules`) the same day, without a
  release. End of life is judged by the pack's date, not the scan's clock.
- **A bundled `advisories` pack** with the PHP security release of 21 October
  2026 (CVE-2026-109618 and CVE-2026-109619, both Critical, CVSS 4.0 9.2,
  fixed in 8.2.35, 8.3.36, 8.4.27 and 8.5.12, from the php-src advisories),
  vendor-checked worked examples (CVE-2024-4577 and CVE-2024-8926 for PHP-CGI on Windows, CVE-2021-41773 and
  CVE-2021-42013 for Apache HTTP Server 2.4.49 and 2.4.50) and end-of-life
  release lines. Benchmark cases for both URL and repo scans.

### Site

- **A landing page in `site/`**, a static site for Vercel: the positioning,
  `npx penthera`, prompts for Claude Code, Cursor and Codex, the hero loop and
  the walkthrough, the limits and the research plan. No third-party scripts,
  analytics or cookies; fonts are self-hosted or system fonts.
- **A check in the browser.** Drop or paste a `package.json`, `.mcp.json`,
  `.claude/settings.json`, `CLAUDE.md` or `AGENTS.md` and Penthera's own
  `lib/` code runs in the tab: the agent-config rules, the secret patterns,
  install scripts, typosquats against the vendored popular list, and the
  bundled IOC pack. `site/build.mjs` bundles `lib/` at build time, so the site
  and the CLI run the same rules; `tests/site.test.js` holds the page to the
  CLI on the agents and deps fixtures. The page is served with
  `connect-src 'none'`, so it cannot send the files anywhere.
- **Runtime advisories in the browser check.** Drop a `Dockerfile`,
  `compose.yaml`, `.php-version`, `.tool-versions` or `composer.json`, or
  paste the response headers `curl -sI` printed for your site (the page never
  contacts it), and `lib/advisories` runs on them: the same findings and
  confidence as the CLI, with "check on the server: distributions backport
  fixes" next to every version-only verdict. `tests/site.test.js` compares
  pasted headers with a URL scan of a loopback server sending the same
  headers, and runtime pins with `runtimeAdvisoriesForRepo`.
- `penthera deps` findings are built in `lib/deps/findings.js` (moved from
  `lib/deps/index.js`, no behaviour change), so the browser check uses the
  same wording.
- `scripts/docs-commands.mjs` also checks every command the site shows.

### Docs

- **New title for the launch:** "Penthera: your open-source cyber security
  agent", in the README, docs index, `penthera --help`, the GitHub Action name
  (which renames its Marketplace listing), the dashboard and the report
  footer.

- **README hero is a 12-second loop** of the terminal and the dashboard
  (setup, an offline scan, Simple and Advanced mode, a fix approved), cut from
  the walkthrough video by `scripts/media/hero-gif.sh`, and it loops without a
  jump. The terminal-only scan clip is now `assets/demo-scan.gif`. The Demo
  media workflow re-cuts the loop on every release.
- **The README diagram is back**, updated: what Penthera checks, where the
  findings go, and that the fix loop asks first and cannot edit its own tests.

## [1.8.0-rc.1] - 2026-10-20

Release candidate for 1.8.0, published on npm's `next` dist-tag
(`npm install penthera@next`). It becomes 1.8.0 on `latest` after it has run
on real projects without a blocking issue.

### Security

Fixes from a second independent review. Most also apply to 1.7.0; upgrading
is recommended.

- **Dependency scans fail closed.** An npm or Python package that could not be
  read in full (a code file over 64 MB, more files than the reader takes, an
  archive with inconsistent sizes or other structural anomalies, a matched
  artifact that cannot be opened) is now `unscanned`: a high "could not be
  scanned" finding that `penthera install` always holds for approval. The
  Python scanner gained this state. Wheels are capped on the bytes actually
  inflated. Pax global headers that set a size or path are refused. Deeply
  nested `uv.lock`/`poetry.lock` files are a parse error, not a crash.
- **The fix loop and `fix --apply` run git hardened.** Commit and tag signing,
  signing programs, attribute files and every configured filter driver are
  overridden on every call (`--attr-source` on git 2.40+). Pathspecs are
  literal. Writes are refused when the repository's own config sets
  `filter.*`, `gpg.*` or `include.*`, or on git older than 2.31; the loop then
  does not start, and its one message names the key and how to go on.
- **The fix loop keeps your uncommitted work.** Dirty files are read with
  `status -z` and re-checked right before every write and commit. Reverts
  restore the exact bytes from before the fix, and only while the file still
  holds what penthera wrote (otherwise the fix is a `conflict` and the file is
  left alone). Commits use `--only`. Plans that touch untracked or ignored
  files are skipped, and every revert step runs even when one fails.
- **`applyDiff` is all-or-nothing and writes only regular files in the repo.**
  Duplicate and nested paths are refused, a failed apply puts back what it
  wrote, files are replaced through a temp file (never written through a hard
  link), NTFS stream names and 8.3 aliases are refused, and added lines may not
  contain control characters. Approval prompts show control characters as
  escapes.
- **The pre-commit hook checks everything it should.** Staged content is read
  by object id from NUL-separated output, type changes are included, files
  with NUL bytes are scanned, and a staged file over 16 MB blocks the commit
  (or warns, with `"largeFiles": "warn"`). `hook install` no longer writes
  through a symlinked `pre-commit`.
- **Secret scanning checks every match.** A placeholder no longer hides a real
  secret of the same rule later in the file. Only regular files are read, with
  a per-file size cap.
- **Dashboard sessions are bound to the page.** The one-time token travels in
  the URL fragment and is exchanged for a per-tab session sent as an
  `Authorization` header; no cookie is set or accepted. Approvals carry the
  sha256 of the diff shown, and a cut diff says so and needs an explicit
  acknowledgement. A symlinked default `reports/` is refused and every write
  re-checks the folder. Event ids keep counting past the buffer; requests,
  bodies (413), finished runs and open streams are bounded. `--open` no
  longer puts the token on a command line.
- **Evidence bundles** are built in a private folder and renamed into place,
  and verification never follows a symlinked folder and caps what it reads.
- **HTTP responses are bounded.** Every body is read with a size cap (counted
  after decompression) and a deadline that covers the body, not just the
  headers. `--offline` compares host and port, and cross-origin redirects drop
  credentials and do not replay request bodies.
- **Linear-time matching on untrusted text.** Agent-config exec patterns and
  other agent and hook checks no longer backtrack on long input. The rule-pack
  regex guard refuses ambiguous alternation and optional items inside repeated
  groups and end-anchored rescans; community templates use the same guard.
- **Hostile repos no longer hang or crash scans**: a FIFO is never read, and
  deeply nested JSON is handled; one unreadable agent config becomes a finding
  instead of aborting the run.
- `--fix-model` never sends a file from outside the repo as context.
- Installing the hook through pre-commit.com no longer runs the test suite:
  the `prepack` script is gone (publishing still runs `npm test`).
- Workflows that push or only read no longer keep credentials in the checkout.
- **The fix loop cannot game its own checker.** A fix diff, from a local
  model or a recipe, may not edit tests, test runner config or the test
  script, Penthera's policy, suppressions, baseline, lock or memory, CI
  workflows, git hooks or lockfiles; `applyDiff` refuses it with `PROTECTED`
  and says to make that change by hand. The loop verifies only against the
  checker the run began with. "Could not fix" is now a recorded outcome
  (`gave_up` in memory, `loopRun.gaveUp`, a summary line): the finding is not
  retried in that run, and a give-up never counts against a recipe. Older
  Penthera versions report a memory chain with `gave_up` events as malformed.

### Added

- Release checks in CI (`.github/workflows/install-matrix.yml`): the packed
  tarball is installed into an empty project and run with `npx penthera` on
  Linux, macOS and Windows with Node 22 and 24 (setup wizard dry run, deps,
  agents, repo scan, the pre-commit hook on a real commit, the dashboard's
  token check, bundled rule pack signatures). An upgrade job installs 1.7.0
  from npm, writes memory and dashboard state, upgrades to the tarball and
  checks the old memory chain still verifies and grows. All of it runs under a
  network guard that fails on anything past loopback.
- Docs as tests: `scripts/docs-commands.mjs` checks every command in the
  README, `docs/` and the skill against `--help` and runs the offline ones on a
  fixture, in `npm test` and against the installed package.
- Provenance check in CI (`scripts/ci/provenance.mjs`): every commit in a pull
  request that names an AI co-author must carry an `AI-Assisted` line, and the
  other way round.

### Fixed

- Windows: `npx penthera` / `penthera init` in a git repository failed with
  "Refusing to write outside the project" for its own `reports/` folder, because
  git prints the repo root with forward slashes. Git roots are now native paths.
  Found by the new Windows install checks.
- `penthera --help` lists `--rules-signers` and `--allow-unsigned-rules`. Both
  worked and were documented in `docs/rule-packs.md`, but the help left them
  out.
- `penthera ui`, Advanced mode: a run's transcript no longer shows a stray
  "null" under its title.

### Changed

- **`penthera ui` redesigned for people who are not programmers.** A first
  visit runs a three-screen setup (what Penthera does, Simple or Advanced, the
  project and a first check). Simple mode, the default, leads every project
  with a one-sentence verdict ("Not ready to ship: 1 critical problem to fix
  first."), lists problems in plain words, explains each one as what is wrong,
  how sure and what to do, and tells a run as one sentence. Advanced keeps
  everything, now as project tabs (Findings, Dependencies, AI tooling, History,
  Proof) with a severity by confidence triage matrix. A menu bar replaces the
  prompt bar and carries every action with its shortcut and the run status;
  runs start from a New scan window; every change waits in its own window
  (`y`, `n`, `q`). New look: a 1-bit "System" register of tiled windows, dither
  patterns instead of greys, `#0000ed` as the one accent, Departure Mono (OFL,
  self-hosted) for chrome, the serif Penthera wordmark, and a halftone field
  whose density is the open risk. Both themes pass WCAG AA in every state.
  `scripts/dashboard-screenshots.mjs` regenerates the docs screenshots.
- Smaller npm package: 797 kB to 657 kB packed, 2.3 MB to 1.7 MB unpacked. The
  package ships only `docs/examples/` (the documentation lives on GitHub, and
  README links resolve there), and the popular-package lists for the typosquat
  check are stored gzipped. No behaviour change.
- Code cleanup, no behaviour change: one git runner (`lib/git.js`), one
  temp-folder helper, one Markdown table-cell escape and one JSON fetch
  helper replace their copies; unused exports and helpers are gone. CI now
  runs `npm run lint` (ESLint, dev-only, minimal rules). Still one runtime
  dependency.

### Docs

- **Penthera is described as an open R&D project with a usable tool:** "an
  open-source cyber security agent you can use today, and verify yourself."
  The README, `docs/index.md`, `package.json`, the plugin and marketplace
  manifests, the Agent Skill (trigger phrases kept), the GitHub Action and the
  repository description carry the approved wording. The README has a "How it
  is measured" section (method, evidence, tool) with Wilson intervals next to
  the benchmark numbers, and stays under 14 KB.
- **One roadmap, one research plan.** `ROADMAP.md` now says what ships next,
  starting with the 1.8.0 feature freeze. `docs/vision-2.0.md` is the research
  plan and holds the quality gates from `docs/plan.md`. `docs/plan.md`,
  `docs/release-plan.md` (v1.2 to v1.4) and the Socket positioning notes moved
  to `docs/archive/`.
- **Every user-facing page names the question it answers**, for a starter ("is
  my app safe to ship?") or a pro ("how do I put it in CI?"), and
  `docs/index.md` has a Start here path from starter to pro.
- **Voice guide** (`docs/voice.md`): plain words, short sentences, numbers with
  intervals over adjectives, limits next to claims, no hype. Every user-facing
  page was edited against it.
- **Release cadence** in CONTRIBUTING: at most one minor release every 2 to 4
  weeks, always through an `-rc.N` on npm's `next` tag, patches for fixes only,
  and a feature freeze before each minor. Current freeze: 1.8.0 = main + #63.
- Fixed stale facts: SECURITY.md's supported versions (1.2.x to 1.7.x), README
  anchors that no longer existed, Agent Skill links into `docs/` that broke in
  the npm package since the docs stopped shipping there, and the partner brief
  and due diligence notes that still called shipped features "in review".
- Limitations stated in full: the methodology's "Known limitations" now covers
  every module (deps, AI tooling, fix loop), the evidence (small sample, wide
  intervals, same-team benchmark, single labeller, uncalibrated confidence
  labels), reproducibility, AI-assisted development, and compliance output. The
  2.0 research program adds "Threats to validity".
- GenAI disclosure: `docs/genai.md` states how Penthera is built with
  generative AI (models, scale, review gates, licensing, logs), the README has a
  short "How Penthera is built" section (107 of 117 non-merge commits up to
  v1.7.0 written with Claude), and CONTRIBUTING requires an
  `AI-Assisted` trailer on AI-assisted commits. Follows NLnet's generative AI
  policy.
- `docs/MANIFESTO.md`: what Penthera is today (and is not), seven design
  decisions with their costs and what would change them, and an FAQ. Written to
  be challenged in Discussions.
- **After the 2026 agent incidents:** `docs/research/agent-incidents-2026.md`
  says what the OpenAI–Hugging Face and Anthropic evaluation incidents mean
  for Penthera, with sources and caveats. `docs/agents-safely.md` is a
  one-page checklist for running AI agents. `docs/research/spec-harness-rules.md`
  specifies planned `harness-*`, `sandbox-*` and `scorer-*` rules (not built
  yet), and the research plan adds E7 and a draft pre-registration for E8
  (do harness guardrails reduce judge tampering?).
- README: a "Building in public" section linking the CHANGELOG, the freeze, the
  research in progress and the roadmap. Counts refreshed (57 references);
  `npm run docs:numbers` now also counts the secret patterns in the core rule
  pack (20, as the README says, not 8).
- `docs/genai.md` covers commits since v1.7.0 and how the agents that build
  Penthera are contained; the manifesto says the fix loop cannot edit what
  judges it.
- `docs/vision-2.0.md`: the plan for 2.0, covering the biggest gaps, an AI roadmap
  (models propose, deterministic checks decide; local models first) and a
  pre-registered research program with sample sizes and safety rules.
- **An 80-second walkthrough video** (`assets/walkthrough.mp4`, with a poster
  and `walkthrough.vtt` captions) shows `npx penthera`, an offline scan of the
  mock server, `penthera ui --demo` in Simple and Advanced mode, one fix
  approved and the owner report. It is linked from the README and
  `docs/index.md`. `scripts/media/walkthrough.mjs` renders it from demo data
  only, and the Demo media workflow re-renders it on every release.
- **The terminal GIFs are re-rendered** in the dashboard's black and white
  look. `scan.tape` now writes the README hero (`assets/demo.gif`) directly
  and scans with `--offline`. The `agents` and `deps --diff` tapes rendered a
  "Cannot find module" error, because they ran `bin/penthera.js` by a
  relative path after changing folder; they use an absolute path now.

## [1.7.0] - 2026-10-19

One view and one command. `npx penthera` now sets Penthera up in a project:
it detects what is there, asks what to check, runs it offline and offers the
hook, the PR workflow and the dashboard. `penthera ui` is a single view with
side panels. The README is rewritten, and the methodology and references
follow APA 7.

### Added

- **`penthera init`, the setup wizard** (also `npx penthera` with no arguments
  in a terminal). It detects the project offline (git, framework, npm and
  Python lockfiles, agent config, a dev server on localhost, an existing hook
  or workflow), asks one checklist question, runs the code, dependency and AI
  tooling checks (and the running app, only after you confirm it is yours),
  then shows the grade per area, the three things to fix first and one report
  folder, `reports/penthera-<date>/`. It then offers, one yes/no each, the
  pre-commit hook, a `.github/workflows/penthera.yml` pinned to the release
  commit SHA (shown as a diff first), `reports/` in `.gitignore`, the fix loop
  and the dashboard. `--yes` takes the safe defaults and never scans a URL,
  runs the fix loop or opens the dashboard; `--dry-run` prints the plan.
  Nothing is committed or pushed. See [docs/commands/init.md](docs/commands/init.md).

### Changed

- **`penthera ui` is one view, like the Claude Code desktop app.** A
  collapsible left sidebar lists projects (grade, open findings, last scan)
  and recent runs grouped by project, with "+ New scan" on top and settings
  behind a gear. The centre is one scrolling stream: the selected project's
  header (grade, severity bar, trend sparkline), what changed since the last
  scan, "Fix first" and the findings; a running scan or fix loop streams there
  as a transcript with Apply / Skip / Stop inline on each diff. A prompt-style
  bar starts scans, dependency checks, AI tooling audits and the fix loop. The
  collapsible right panel stacks Environment (egress, folder, git branch),
  Memory, Dependencies, AI tooling, Evidence and Changes cards, and shows a
  finding's detail when you pick one. `[` and `]` toggle the side panels, which
  become drawers at narrow widths. Calmer chrome, one primary action at a time;
  the themes, `--demo` and every security property are unchanged. New
  `GET /api/env` reads the branch through the agent's hardened git runner.
- `penthera-scan` keeps the URL-first wizard that `penthera` used to open.

### Docs

- README rewritten in the voice of "Penthera: Cyber Security Agent". The
  dashboard screenshots now sit directly under the demo GIF; "Get started" leads
  with one command (`npx penthera`); features are grouped as before you deploy,
  what you build with, and after you ship; and a new "Research and
  methodology" section gives the method, the benchmark numbers, and how to cite
  Penthera. About 12 KB, down from 19 KB.
- `docs/references.md` is rendered in APA 7th edition style from
  `docs/references.bib`, sorted by first author within each topic, with an
  anchor per BibTeX key. Editors for the three Springer proceedings and the NDSS
  proceedings titles were added from Crossref. A test covers the formatter.
- `docs/METHODOLOGY.md` uses APA in-text citations, opens with an abstract and
  a "How to cite" block that mirrors `CITATION.cff`, and now cites every
  reference. A test fails if a citation does not resolve or a reference is
  never cited, and the internal audit checks the "How to cite" version.

## [1.6.1] - 2026-10-19

The GitHub Action gets its Marketplace name. Nothing else changes.

### Changed

- The GitHub Action is listed on the Marketplace as "Penthera: Cyber Security
  Agent". The `uses:` reference is unchanged.

## [1.6.0] - 2026-10-19

Hardening and reach. An independent 360 review found three high-severity bugs, two of them reproduced; all are fixed with regression tests, and the open code-scanning alerts went from 18 to the 2 that need a second maintainer. `penthera deps` now covers Python, `penthera ui` adds a local dashboard (black or white, in the project blue), and every release passes an internal audit first. 1.5.0 was never published to npm; this release includes it.

### Security

- Cleared the open code-scanning alerts. The community-template regex guard
  was itself a polynomial regex; it is now a linear scan, and an invalid
  extractor regex no longer aborts a template. Markdown table cells escape
  backslashes first (one shared helper). `<script>` extraction is a tokenizer
  that accepts any case and junk in closing tags. Release workflow: read-only
  top-level token, hash-verified npm, no dependency cache. Docker base image
  pinned by digest. fast-check property tests fuzz the untrusted-input parsers.

Fixes from an independent 360 review of `main`. The first three were
reproduced; each fix has a regression test that fails without it.

- **High: tar desync hid install scripts from the install firewall and
  `penthera deps`.** A GNU base-256 size field parsed as 0, the reader lost its
  place, and 512 zero bytes then read as end-of-archive, so `package.json` and
  everything after it went unscanned and the package looked clean. The tar
  reader now handles base-256 sizes and pax `size=`, checks every header
  checksum and fails closed on any anomaly (malformed size, truncation, data
  after the end marker). A package whose archive or `package.json` cannot be
  read is reported as "could not be scanned" (high) and always needs approval
  in `penthera install`; a lockfile `hasInstallScript` that the scan cannot
  find is a high finding and is always denied (except the known benign case
  of a package that ships only prebuilt `.node` binaries, like fsevents 2.x)
- **High: `applyDiff` wrote through a dangling symlink out of the repo.** Every
  path component is now `lstat`-ed and any symlink is refused; creates use
  `O_CREAT|O_EXCL|O_NOFOLLOW`
- **High: `.GIT/` bypassed the `.git` guard on case-insensitive file systems.**
  Any path segment that is `.git` in any case, at any depth (plus HFS+ and
  NTFS aliases such as `.git.` and `GIT~1`), is refused, and fix diffs may no
  longer touch `.gitmodules`
- PR comments escape HTML, Markdown links and images, `@` mentions, `#` refs
  and bare URLs in package names, versions, paths and snippets from the
  lockfile, keep code spans on one line, and cap each field at 200 characters
- `penthera evidence verify` no longer passes a signed bundle whose signer was
  not checked: a signature only verifies against `--allowed-signers`, and a
  manifest that declares a signature with no `.sig` fails. Unsigned bundles
  pass with an UNSIGNED warning; new `--require-signature` fails them
- `penthera install` refuses git, hosted-git and tarball-URL specs, and lockfile
  entries resolved outside the configured registries, unless
  `--allow-non-registry` is passed. `npm cache add` runs with `--ignore-scripts`
- `penthera install` applies with `npm ci`, so npm installs exactly the
  reviewed lockfile and cannot re-resolve before scripts run
- `penthera deps` now honours `--audience`, `--report-template`, `--evidence`
  (with `--sign-key`) and `--baseline`, and rejects scan-only flags such as
  `--memory` with a clear error instead of ignoring them
- Gzip and tar size limits are enforced while unpacking (`maxOutputLength` on
  gunzip, per-file and total caps in the tar reader)
- The pre-commit hook reads `penthera.policy.json` and `penthera.suppress.json`
  from the git index, warns when an unstaged copy is being ignored, and never
  follows a staged symlink in agent config out of the repo
- `--base` refs are validated (no leading `-`, a plain ref charset) and passed
  after `--end-of-options`, in `penthera deps` and in the GitHub Action's fetch
- `git status` and friends on a scanned repo (fix apply, evidence bundle git
  info, `--base` reads) run with `core.fsmonitor=false`, no hooks and no
  transports
- The Action only edits marker comments posted by `github-actions[bot]`
- `--offline` no longer makes DNS TXT/MX lookups for SPF/DMARC
- Report citations now cover `dependency-risk`, `license`, `agent-config` and
  the machine-audit categories; `license` findings get their own remediation
- Docs: `docs/plan.md` lists only what v1.5.0 shipped; top-level `--help`
  lists `penthera hook`

### Added

- **Signed rule packs** (`lib/rules/`, [docs/rule-packs.md](docs/rule-packs.md)):
  detection data (secret formats, hidden-instruction and exec patterns, IOC
  lists, typosquat targets, Nuclei-compatible templates) ships as versioned
  directories. Each pack has a `pack.json` index of SHA-256 hashes, signed
  with `ssh-keygen -Y sign -n penthera-rules`. Penthera verifies the signature
  (in Node; ssh-keygen is not needed at run time), then every hash, the schema
  and every regex, before it loads anything. Packs arrive bundled in a release,
  or by path with `--rules <dir>` (plus `--rules-signers <file>` for your own
  keys). Unsigned packs are refused unless `--allow-unsigned-rules`, which
  warns loudly. Nothing is ever fetched
- `penthera rules list` and `penthera rules verify <dir>`; tooling in
  `scripts/rules/` (`build-pack.mjs`, maintainer-only `sign-pack.sh`,
  `check-bundled.mjs`). The publish workflow now refuses to stage a release
  whose bundled packs are not signed by a key in `lib/rules/allowed_signers`
- ReDoS guard for data-supplied regexes (`lib/rules/regex-guard.js`): length
  cap, no backreferences or lookaround, no nested quantifiers, no alternation
  under unbounded repeats, no unbounded quantifier that every start position
  can rescan, and a backtracking budget for overlapping quantifier chains.
  Fuzz-tested: everything it accepts runs in milliseconds on adversarial
  input. The v1.1.1 template guard moved here too, rewritten from a regex
  (itself polynomial on hostile pattern strings, flagged by CodeQL) into a
  linear scan that also catches deeper nesting
- Bundled `core` pack: 12 AI-provider key formats, the credential-path
  instruction pattern, two exec patterns and the `.env` template moved out of
  code. Behaviour is identical; a test compares against a snapshot of the old
  built-ins
- Bundled `ioc-2025-2026` pack (**unsigned in this PR; the maintainer signs it
  before release**): s1ngularity/nx versions (GHSA-cxm3-wv7p-598c), Shai-Hulud
  (StepSecurity's list, exfil URL, `bundle.js` by hash), Shai-Hulud 2.0 (Wiz
  Research's CSV, loader file names) and postmark-mcp 1.0.16 to 1.0.18 with its
  exfil domain. `penthera deps` reports hits as critical `deps-ioc` findings
  that cite the source, wherever the package sits in the tree, installed or not
- **Internal testing audit** (`npm run audit:internal`), the release gate:
  tests, benchmark drift, a self-scan against `audit/baseline.json`, a CLI
  smoke matrix, package contents and size, zero third-party egress offline,
  supply chain and version/docs checks, written to `audit/REPORT.md`. Runs
  weekly in CI. See [docs/internal-audit.md](docs/internal-audit.md)
- **Marketing automation that drafts, never posts** (`docs/marketing.md`): no
  social-media tokens, no tracking, no auto-posting; every workflow SHA-pinned
  with least-privilege permissions and a `workflow_dispatch` dry run
  - Release post drafts: `publish.yml` writes a LinkedIn (~600 characters) and
    an X/Bluesky (≤280) post from the CHANGELOG section to the job summary and
    a collapsed "Share this release" section in the GitHub Release
    (`scripts/marketing/release-post.mjs`)
  - Incident radar (`incident-radar.yml`, daily): new npm and PyPI malware
    advisories from the public GitHub Advisory Database become
    `incident-radar` issues with affected versions, an IOC checklist and a
    draft "check if you're affected" post. Popular packages get their own
    issue (at most 5 per run); the rest are batched into one issue
  - Demo media (`demo-media.yml`): VHS tapes in `assets/tapes/` for a URL
    scan, `penthera agents` and `penthera deps --diff`, re-rendered on release
    and opened as a PR
  - Monthly stats issue (`monthly-stats.yml`): npm downloads, stars, forks,
    skills.sh installs, dependents and merged PRs, with month-over-month
    changes and a draft post
  - Contributor flywheel (`contributor-flywheel.yml`): when fewer than 3
    `good first issue` issues are open, one reminder lists the
    `TODO(good-first-issue)` markers in the code
- **Report footer**: Markdown reports, audience reports, the PR comment and
  the evidence bundle end with one line, "Checked by Penthera, open-source
  security for the apps and AI systems you ship". Never in SARIF or JSON.
  `--no-footer` (or `footer: "false"` in the Action) leaves it off. Evidence
  bundles now include a `README.md`
- **Python support for `penthera deps`** (`lib/deps/python/`): reads `uv.lock`,
  `poetry.lock`, `pdm.lock`, `Pipfile.lock` and `requirements*.txt` (pinned and
  `--hash` lines, `-r` includes, pip-compile `# via` for direct deps), and the
  installed `.venv` / `venv` / `--venv <path>` through `dist-info` `METADATA`
  and `RECORD`, with no pip or interpreter. A Python tokenizer blanks comments
  and docstrings; patterns cover shell, network, env bulk access and
  exfiltration, eval/exec/compile, computed imports, unpickling, native
  extensions, obfuscation (`exec` of base64/zlib payloads, encoded blobs,
  PyArmor) and the same AI-agent indicators as npm. Install-time and
  persistence code: `setup.py` custom commands, `.pth` import lines (scored by
  what the imported module can do), `.pth` files no distribution owns, code that
  writes `.pth` files, and installed files that no longer match `RECORD`. Same
  capability ids, findings, diff, PR comment and SARIF as npm; projects with
  both get one combined report
- `--diff` / `--base` for Python lockfiles. Old versions come from pip's HTTP
  cache (sha256 from the lockfile) or uv's cache (recorded hash), else they are
  marked "not compared"
- PyPI typosquat check against a vendored list of the top 8,000 PyPI projects
  (`lib/deps/popular-pypi.json`, PEP 503 normalised, refreshed at release time by
  `scripts/refresh-popular-pypi.mjs`), including `python-` / `-py` affixes

### Changed

- The live test suites (`pentest-live`, `-recon`, `-adaptive`) are opt-in:
  they run only with `PENTEST_BASE_URL` or a `pentest.config.js`, instead of
  probing whatever listens on `localhost:3000` during `npm test`.

### Fixed

- Repo scans skip nested git repositories and worktrees (any subfolder with
  its own `.git`, such as coding-agent worktrees under `.claude/worktrees`),
  instead of reporting their files as this repo's, and no longer follow
  symlinked folders out of the repo.
- The secret scanner no longer reports a value that is only a template
  placeholder (`apiKey: "${key}"`, `{{ api_key }}`) as a hardcoded secret.
- `penthera-scan --help` and `--version` exit 0 instead of starting the wizard.
- The example workflows in `docs/examples/` pin actions by commit SHA.

### Docs

- README cut from about 45 KB to under 20 KB. It opens with a three-command
  "Try it in 60 seconds" block, a "Who it is for" table, and a "By the
  numbers" block (benchmark, rule and test counts, references, release
  provenance). Per-command detail moved to `docs/commands/` and network use to
  `docs/privacy.md`.
- Use-case pages in `docs/use-cases/`: before launch, teams adopting coding
  agents, open-source maintainers, EU SMEs with NIS2 or CRA duties, agencies.
- Comparison pages in `docs/compare/` for Socket, Snyk, GitHub Dependabot and
  code scanning, OWASP ZAP and Semgrep, framed as using the tools together, with
  sources and a last-checked date.
- `docs/research/socket-positioning-notes.md`: how Socket presents itself and
  what Penthera's docs took from it.
- `npm run docs:numbers` prints the counts quoted in the README.

## [1.5.0] - 2026-10-19

Blocks problems at commit time, adds license policy, and extends the EU
evidence to the Cyber Resilience Act. The GitHub Action is now ready for the
Marketplace as "Penthera Security Review". Penthera also has a clearer
problem statement: open-source security for the apps and AI systems you ship.

### Docs

- Problem statement: "open-source security for the apps and AI systems you
  ship", organised around three moments (before you deploy, what you build
  with, after you ship). README, package, plugin, skill and repository
  descriptions updated. Roadmap gains v1.6.0 "Before you deploy" (preview
  deployment scanning, `penthera ship`) and v1.7.0 "After you ship"
  (`penthera watch`). New `docs/plan.md` sets measurable quality gates to v2.0.

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
- **CRA Article 14 reporting helper** (`penthera --cra-init cra.json`,
  `penthera --cra cra.json`, `lib/compliance/cra.js`): for an actively exploited
  vulnerability (24h early warning, 72h notification, final report 14 days after
  a fix is available) or a severe incident (24h, 72h, final report one month
  after the notification). Computes due dates in UTC and local time (hours
  elapsed, days and months on the calendar, DST-safe), flags overdue and late
  reports, drafts each report against Art. 14(2)/(4) with `NEEDS INPUT` for
  missing facts, adds an Art. 14(8) user advisory, and can prefill the affected
  component, purl and CVEs from a Penthera SBOM and scan JSON. NL profile names
  NCSC-NL and the ENISA Single Reporting Platform. Drafts, not the official
  form, not legal advice. Guide: `docs/compliance-cra.md`
- **CycloneDX 1.6 AI-BOM** (`penthera --repo . --aibom aibom.cdx.json`,
  `lib/whitebox/aibom.js`): AI SDK dependencies, model identifiers in code as
  `machine-learning-model` components with `modelCard` and file:line evidence,
  MCP servers as `services`, and Agent Skills and prompt files as hashed `data`
  components. Offline. Tests validate the output against the official
  CycloneDX 1.6 schema, vendored in `tests/fixtures/cyclonedx/` (new dev
  dependency: `ajv`)

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

- **`penthera ui [--open] [--port 0] [--project <dir>] [--reports <dir>] [--demo]`**:
  a local dashboard on 127.0.0.1 (random port, one-time URL), styled as a
  1-bit early-90s Mac desktop with a terminal inside, in dark and light themes.
  Overview (posture per project, severity mix, findings over time, time to
  fix, hosts contacted; a three-step start when there is no data yet),
  Findings (filters, a plain-words explanation, evidence, sources, fix diff),
  Run (scan, check dependencies, audit AI tooling, or the fix loop with an
  Apply / Skip / Stop dialog on every diff, live output over SSE), History
  (new, fixed and still open between two scans), Dependencies, AI tooling,
  Evidence (create a bundle from the latest scan, verify in one click,
  download the auditor report) and Settings. Reads only the chosen folders and
  `~/.penthera`; no network, no new dependencies, no build step. Host check
  against DNS rebinding, one-time token swapped for an HttpOnly SameSite=Strict
  cookie, Origin check and JSON-only bodies on state changes, strict CSP, no
  CORS, rate-limited unauthenticated requests, allowlisted static files.
  Penthera scans it clean. `--demo` seeds fake data. See `docs/dashboard.md`
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
