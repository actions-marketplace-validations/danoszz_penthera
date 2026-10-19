# Plan for 1.8, Phase A: measure first

Written 2026-10-19. Status: **decisions made 2026-10-19; approved when this PR is merged.**

This is the execution plan for the first milestone of
[vision-2.0.md](../vision-2.0.md): measure Penthera's accuracy on real code
(experiment E1) before anything else is built or evaluated. It covers the work
breakdown, the order, the risks, and what only the maintainer can decide or do.
The MCP server, also listed under 1.8 in the vision, is separate product work
and is not part of this plan.

## Goal and definition of done

1.8 is done when real-world precision and recall are published with 95%
intervals, from a pre-registered study. Within that, this plan has four
deliverables:

| # | Deliverable | Where | Done when |
|---|---|---|---|
| D1 | This plan | `docs/research/plan-1.8.md` | Maintainer approves it (PR merged) |
| D2 | E1 pre-registration | `docs/research/prereg/E1-real-world-accuracy.md` | Merged to `main` **before** any corpus data is collected; the merge commit is the registration timestamp |
| D3 | Penthera Bench v1 tooling | `bench/real-world/` | Merged with tests; `npm test` and `npm run audit:internal` pass |
| D4 | Pilot run on 10 projects | `bench/real-world/pilot/` | The pipeline runs end to end (fetch → scan → label → κ → score); the report is marked as **not** part of the pre-registered sample |
| D5 | Draft pre-registrations E2 to E5 | `docs/research/prereg/` | Merged as drafts, marked "not registered" until each experiment is ready to run |

After D1 to D5, the study itself runs: freeze the sampling frame, draw the
sample, scan, label, score, publish. That part needs human labelling time and
is scheduled in [After this plan](#after-this-plan-running-e1).

## Work breakdown and order

Each step is one branch and one PR. Nothing is pushed to `main` directly.

### 1. Plan (this PR)
`research/plan-1.8`. Merge = approval.

### 2. E1 pre-registration
`research/prereg-e1`. Structure follows the AsPredicted questions plus the OSF
preregistration template sections that AsPredicted lacks (sampling frame,
stopping rule, deviations). It fixes, before any data exists:

- **Hypotheses.** The primary estimands are precision and recall overall, with
  Wilson 95% intervals. Penthera states expectations as directional
  hypotheses so they can fail: H1 overall precision ≥ 0.80 (the lower bound of
  the 95% CI is above 0.70); H2 `confirmed` findings are more precise than
  `potential` ones (the confidence labels mean what they say); H3 recall is
  lower than precision (the scanner is built for few false positives).
- **Population and frame.** Permissively licensed (MIT, Apache-2.0, BSD-2/3,
  ISC, 0BSD, Unlicense) public repositories on GitHub that use Next.js, Express,
  Fastify, Hono, or FastAPI, plus public agent setups (repositories that ship
  `SKILL.md` skills, `.mcp.json` / MCP server configs, hooks, or
  `AGENTS.md` / `CLAUDE.md`). The frame is a dated, frozen snapshot of
  candidate repositories; the sample is drawn from it with a published seed.
- **Stratification.** Framework (5 strata, plus agent setups as a sixth) ×
  popularity tercile (stars), with equal allocation per framework so that no
  framework dominates. Weights are reported so a population-weighted estimate
  can be computed.
- **Inclusion and exclusion.** In: not a fork, not archived, at least one
  commit in the 24 months before the frame date, a licence in the list above,
  the framework present in a manifest, at least 10 source files. Out:
  deliberately vulnerable apps (Juice Shop, DVWA and similar, which would bias
  recall), the framework's own repository and its official examples,
  tutorials and starter templates with no application code, repositories that
  are mostly vendored or generated code, and anything Penthera's own authors
  wrote.
- **Sample size.** n = z²·p(1−p)/E² = 1.96² × 0.85 × 0.15 / 0.04² = 306.1, so
  **≥ 307 labelled findings** for ±4 points at p ≈ 0.85 (196 for ±5 points);
  **≥ 150 projects** (30 per framework). Findings cluster within projects, so
  the pre-registration caps the number of findings sampled per project per
  category and states the design effect it assumes (see
  [Risks](#risks)). If the 150 projects yield fewer than 307 eligible findings,
  the stopping rule adds projects from the same frame, in seed order, until
  both minimums are met.
- **Labelling protocol.** Two independent labellers, blind to each other and
  to whether Penthera flagged the unit (see
  [Recall](#how-recall-is-estimated)). A written codebook with one worked
  example per category. A calibration subset of 60 units, stratified by
  category, labelled by both; full labelling starts only when Cohen's
  κ ≥ 0.70. If κ is lower, the codebook is revised and calibration repeats on
  a fresh 60 units, at most three rounds; calibration units are not reused in
  the analysis. Disagreements in the full set go to adjudication by discussion
  with the codebook; unresolved ones go to a third person; every adjudication
  is logged with its reason.
- **Metrics.** Precision and recall with Wilson 95% intervals, overall and per
  category (secrets, route and auth boundary, code pattern, dependency
  capability, agent configuration) and per confidence label. Per-category and
  per-framework results are secondary and descriptive. Sensitivity analysis: a
  cluster bootstrap over projects (10,000 resamples, fixed seed) to show how
  much within-project correlation widens the intervals.
- **Frozen scanner.** E1 measures one exact Penthera version (git commit and
  npm version recorded) with the bundled rule packs only. No rule is changed
  on the basis of anything seen in the sample until E1 is published. Rule
  fixes found during labelling go into a later release and are measured on a
  fresh sample, so the study never grades its own tuning.
- **Deviations policy and date.** Any change after registration is a dated
  amendment in the same file, made before the affected data are collected, or
  reported as a deviation in the results. Analyses not in the
  pre-registration are labelled exploratory.

### How recall is estimated

Recall needs the number of real issues Penthera missed, and nobody knows that
for an arbitrary repository. The pre-registration will use two methods and
state the limits of each. The recommended primary method is (a).

**(a) Labelled sample of unflagged units (primary, recommended).** For each
in-scope category, the unit of analysis is defined (a file for secrets, a
route handler for the auth boundary, a package for dependency capabilities, a
config file for agent setups). From each project, a seeded random sample of
units Penthera did **not** flag is mixed into the same labelling queue as the
flagged ones, so labellers cannot tell which is which. Recall is estimated as
TP / (TP + N̂_FN), where N̂_FN is the false-negative rate in the unflagged
sample scaled up to all unflagged units, with its interval propagated by
bootstrap. Limit: real issues are rare in unflagged code, so the FN estimate
is imprecise unless the unflagged sample is large; the pre-registration fixes
its size from a pilot-based guess of the base rate and reports the resulting
interval width honestly. It also only covers the categories Penthera claims;
recall for "everything a pentester would find" is not estimated.

**(b) Seeded known issues (secondary).** A fixed, published set of synthetic
issues per category (for example a provider-format key with a seeded random
value, a public route without auth or rate limiting, an `npx -y` unpinned MCP
server) is inserted into copies of a subset of corpus projects, never pushed
anywhere. Recall on seeded issues is an upper bound: seeded issues look like
what the rules were written for.

**Not chosen as primary: capture–recapture with a second tool.** Running a
second scanner (Semgrep OSS rules, Gitleaks) and applying Lincoln–Petersen
needs the two tools to detect independently. They share patterns, which makes
the population estimate too small and recall too high. It is kept as an
exploratory comparison if time allows.

### 3. Penthera Bench v1 tooling
`feat/bench-real-world`. All under `bench/real-world/`:

| Part | What it does |
|---|---|
| `corpus.json` + schema | The manifest: repo URL, pinned commit SHA, SPDX licence, framework, stratum, frame date, inclusion notes. The only corpus data committed to the repo |
| `fetch.js` | Shallow-clones each repo and checks out the pinned commit into a cache outside the repo (`$PENTHERA_BENCH_CACHE`, default `~/.cache/penthera-bench`). Sequential with a delay, honours `Retry-After`, skips repos already cached, uses `GH_TOKEN` only if set. Verifies the checked-out commit matches the manifest |
| `run.js` | For each cached repo, runs Penthera's repo scan, `deps`, and `agents` in-process with the network refused (the same fetch guard as `bench/run.js`). It never installs dependencies, never runs project code or scripts, and never touches a live deployment. Writes findings JSON into the cache |
| `units.js` | Turns findings into labelling units and draws the seeded sample of unflagged units, mixed and shuffled into one queue per labeller |
| `label.js` | A local labelling CLI (keyboard driven, resumable). Shows the code region and the category question, not Penthera's verdict or the other labeller's answer. Writes append-only JSONL per labeller, outside the repo by default |
| `kappa.js` | Cohen's κ with a 95% CI, overall and per category, plus a disagreement list for adjudication |
| `score.js` | Precision and recall with Wilson intervals overall, per category, per framework, per confidence label; cluster bootstrap; writes `bench/real-world/RESULTS.md` |
| tests | Unit tests for the manifest schema, Wilson interval, κ (against hand-computed and published examples), sampling determinism, scoring, and a hermetic end-to-end run on fixture repos generated in a temp dir (no network) |

A minimal web page in the `penthera ui` style is possible later; the CLI comes
first because it is smaller to review and easier to keep blind.

### 4. Pilot on 10 projects
Ten projects drawn from the same kind of frame but **outside** the
pre-registered sample: two per framework, chosen before the E1 frame is drawn
and listed in `bench/real-world/pilot/corpus.json`, then excluded from the main
frame by URL. The pilot checks the pipeline, times the labelling, and gives a
rough base rate of issues in unflagged units to size the recall sample. Its
report is headed "Pilot, not part of the pre-registered sample", and any
protocol change it prompts is a dated amendment to the E1 pre-registration
before main data collection starts.

The pilot's committed output is aggregate counts only. Finding details from
third-party code stay in the local cache (see
[Safety](#safety-and-disclosure)).

### 5. Draft pre-registrations E2 to E5
`research/prereg-e2-e5`. One file each, following the vision's table, marked
**draft, not registered**. Each states its exact power calculation:

- E2 bandit vs fixed order: paired t-test (or Wilcoxon signed-rank as the
  pre-specified fallback), d = 0.3, α .05, power .80 → 90 paired runs.
- E3 propose-and-verify vs recipes: McNemar, 15% vs 5% discordant → 155
  findings; 173 per arm if unpaired (40% → 55%).
- E4 classifier vs rules: temporal split, AUC with DeLong's test, precision at
  fixed recall; ≥ 500 malicious and ≥ 5,000 benign packages in the test
  period; samples never executed and stored encrypted.
- E5 deterministic checks vs LLM judges: McNemar on evasion, 155 adversarial
  items built from **published** evasion techniques only.

Each is registered (moved out of draft and merged) only when its experiment is
about to run and E1's corpus exists.

## Safety and disclosure

These rules come from the vision and are not negotiable. The tooling enforces
the first three mechanically.

- **Static analysis only.** The runner reads files. It does not install
  dependencies, run builds, start servers, or execute any project code. Tests
  assert this (no child process other than `git`, network refused during
  `run.js`).
- **No live scanning.** No URL mode is ever pointed at a corpus project's
  deployment.
- **No third-party code in the repo.** Only the manifest is committed; clones
  live in a cache outside the repo, and the cache path is refused if it is
  inside the repository.
- **No attack payloads.** Seeded issues are inert static patterns (a fake key,
  a missing middleware), generated in temp copies.
- **Responsible disclosure.** A real issue found in a corpus project (above
  all, a live-looking secret) is reported privately to the owner (GitHub
  private vulnerability reporting or `SECURITY.md` contact) with a 90-day
  window. The disclosure log lives outside the public repo. Published results
  and committed labels never include secret values, and finding locations are
  published only after the issue is fixed or the window has passed.
- **Ethics.** Labellers are research staff, not study participants, but the
  maintainer confirms that with the university (see below). E6, the user study,
  needs full ethics review and is not in this milestone.
- **Rate limits.** Frame building uses the GitHub search API within its
  published limits (authenticated, sequential, backing off on `403`/`429` and
  `Retry-After`); cloning is sequential with a delay.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Too few findings per project | 150 projects yield < 307 findings | Stopping rule adds projects in seed order; the pilot estimates yield early |
| Findings cluster within projects | Wilson intervals too narrow | Cap per project per category; report the cluster bootstrap next to Wilson; state the assumed design effect |
| FastAPI coverage is thin | Penthera finds no routes in Python code today (route discovery is JS only), so FastAPI projects get only secrets and dependency findings | Report per-category coverage per framework; pre-register FastAPI route categories as not applicable rather than silently zero |
| κ below 0.70 | Labels cannot be used | Codebook with worked examples; up to three calibration rounds; if it still fails, report it and narrow the category definitions |
| Labelling time | Two labellers × (≈ 307 findings + unflagged sample + calibration) at about 2 to 4 minutes per unit is 30 to 50 hours each | Pilot measures it; the queue is resumable; budget it before the frame is frozen |
| Rare issues in unflagged units | Recall interval very wide | Size the unflagged sample from the pilot base rate; seeded issues as a second, bounded estimate; report the width as it is |
| Real secrets in public repos | Harm if republished | Redact in all output; disclosure log outside the repo; publish locations only after fix or 90 days |
| Tuning on the test set | Inflated accuracy | Scanner version frozen; pilot set kept separate; rule changes only after E1 is published |
| Frame bias from GitHub search | Search ranking favours popular repos | Stratify by popularity tercile; publish the query and the frame snapshot; note it as a validity threat |
| Flaky local test suite under load | False failures during development | Already being fixed in a separate session; run tests with `--no-file-parallelism` locally until that lands |

## What the maintainer must decide or do

**Decided 2026-10-19:**

1. Recall: a blind, labelled sample of unflagged units is the primary method;
   seeded issues are secondary.
2. True positive: two levels. "Correct" (the finding is factually right) is
   primary; "actionable" (the owner should act on it) is secondary.
3. Second labeller: a fellow researcher at the university, credited as
   co-author.
4. Agent setups: a separate sixth stratum of ≥ 50 public setups, reported
   separately from the 150 web-app projects.

**Do before main data collection:**

- Ask the university ethics office for a written determination that E1 (code
  analysis, with labellers as research staff) is not human-subjects research,
  or submit it for review if they say it is.
- Recruit and brief the second labeller; agree on credit and time.
- Approve the pilot corpus (10 projects) and, later, the frozen frame and the
  drawn sample.
- Name the disclosure contact address and keep the disclosure log.
- Pick the third person for unresolved adjudications.
- Sign off the codebook after calibration.

## After this plan: running E1

1. Merge the pre-registration (D2). This is the registration date.
2. Merge the tooling (D3), run the pilot (D4), amend the pre-registration if
   the pilot shows a protocol problem.
3. Build and freeze the frame (dated snapshot, seed published), draw the
   sample, maintainer approves it.
4. Fetch and scan with the frozen Penthera version.
5. Calibrate the labellers to κ ≥ 0.70, then label everything.
6. Adjudicate, score, write `bench/real-world/RESULTS.md`, update
   `METHODOLOGY.md` and the README with the real-world numbers and their
   intervals, and send disclosures for anything real.
