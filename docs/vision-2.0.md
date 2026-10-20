# Penthera 2.0: the plan to become the best

Written 2026-10-19, after v1.7.0. This is the public plan for Penthera 2.0: the
gaps we see, how we intend to close them, and the research we will run to prove
each step works. Challenge any of it in
[Discussions](https://github.com/danoszz/penthera/discussions). The reasoning
behind current decisions is in [MANIFESTO.md](MANIFESTO.md).

## What "the best" means

Not the most features or the most AI. Penthera 2.0 is the best open-source
security agent for apps and AI systems if it is, measurably:

1. **The most accurate on real code.** Published precision and recall on a large,
   independently labelled set of real projects, with confidence intervals,
   reproducible by anyone.
2. **The best at closing issues, not just finding them.** The share of findings
   fixed *and verified* without breaking tests.
3. **The most trustworthy.** Local first, no runtime update channel, every
   decision explainable, and robust when an attacker tries to fool it.
4. **The easiest to start.** One command, useful in under two minutes.

Each goal has a metric and an experiment below. A feature that does not move one
of these metrics does not ship.

## The biggest gaps, and how 2.0 closes them

| Gap today | Why it matters | 2.0 answer |
|---|---|---|
| Accuracy measured on 22 findings in our own labs | We cannot claim real-world quality | **Penthera Bench:** a labelled corpus of real projects (E1) |
| Finds only what a rule describes | Misses variants of known issues | Model-proposed candidates, verified by deterministic checks (E3) |
| Fixes only what a built-in recipe covers | Many findings stay open | Propose-and-verify fixing with local models (E3) |
| "Learning" is counting | The loop does not get smarter in a principled way | Bandit-based ranking of probes and recipes (E2) |
| Malicious-package detection is rule-based | New malware families slip past fixed rules | An interpretable, offline classifier over capability features (E4) |
| No evidence about LLM judges vs rules | Our core decision rests on other people's results | Our own adversarial study (E5) |
| Hard to start for non-experts | Adoption | Shipped in 1.7.0 (`npx penthera`); next, an MCP server so AI assistants can call Penthera |

## AI roadmap

The rule that runs through all of it: **models propose, deterministic checks
decide.** Penthera's scanner is a verifier, and verifiable feedback is exactly
what makes AI systems reliable. That is our advantage, not a limitation.

### Phase A: measure (first)
- Build Penthera Bench (E1). Nothing else is evaluated until it exists.

### Phase B: learn what to try first
- Replace counting with a **contextual bandit** (Thompson sampling) that picks
  the order of probes and fix recipes per framework and project, from the local
  memory. Small, offline, explainable: it shows why it chose what it chose (E2).

### Phase C: propose and verify
- **Local models propose; Penthera verifies.** When no recipe matches, a local
  model proposes a fix. It is applied on a branch, re-scanned, and tested, and
  kept only if the finding is gone and nothing else broke. The same pattern
  proposes *candidate* findings that a deterministic check must confirm (E3).
- **Embeddings** (small open-weight models, run locally) to group duplicate
  findings and to find packages whose code resembles known malware families.

### Phase D: score what rules miss
- An **interpretable classifier** (gradient-boosted trees) over the capability
  features `penthera deps` already extracts. It is trained on public malicious
  package data and reports a score together with the features that drove it,
  never a bare verdict (E4).

### Phase E: research, not product (yet)
- **Reinforcement learning from verifier feedback:** train a small open model
  to write secure fixes, with Penthera's re-scan and tests as the reward.
  Publishable, and it only reaches the product if it beats Phase C.

### Local models
- Runtimes: Ollama today; llama.cpp and MLX (Apple silicon) next. Penthera talks
  to `127.0.0.1` only.
- Models: small open-weight code and embedding models that run on a laptop.
  Penthera documents which ones were tested, and with what results, rather than
  hard-coding one.
- Hosted models (frontier LLMs, fast structured-decision models such as
  Typesafe's Jev with calibrated outputs) are evaluated as **opt-in**
  alternatives in the same experiments. They become an option only if they beat
  the local baseline enough to justify sending data off the machine, and they
  are never the default.

## Research program

We run our own research, to the standard we would expect in a paper.

### Principles
- **Pre-register.** Before running an experiment, commit its hypothesis,
  metrics, sample size, and analysis to `docs/research/prereg/` with a date.
  Results that deviate from the plan are reported as exploratory.
- **Report effect sizes and intervals, not only p-values.** Every result gives
  the estimate, a 95% confidence interval, and the test used. α = 0.05,
  two-sided, power 0.80 unless stated otherwise.
- **Correct for multiple comparisons** within an experiment (Holm–Bonferroni).
- **Separate data honestly.** Development and test sets never overlap. Where time
  matters (malware), split by date: train on older, test on newer.
- **Two labellers.** Ground truth is labelled independently by two people;
  agreement must reach Cohen's κ ≥ 0.70 before results are used. Disagreements
  are resolved and logged.
- **Publish everything reproducible:** code, labels where licensing allows,
  seeds, and the exact Penthera version.

### Experiments

| | Question | Design | Primary metric | Sample size (α .05, power .80) |
|---|---|---|---|---|
| **E1** | How accurate is Penthera on real code? | Stratified sample of real open-source web apps and agent setups; findings labelled by two people | Precision and recall with Wilson 95% CI | ≥ 307 labelled findings for a ±4 pt interval at p ≈ 0.85 (196 for ±5 pt); ≥ 150 projects across 5 frameworks |
| **E2** | Does a bandit find real issues faster than a fixed order? | Within-project paired comparison on Bench projects | Time and requests to first true finding | 90 paired runs (paired test, d = 0.3) |
| **E3** | Does propose-and-verify fix more than recipes alone? | Same findings, both arms, paired | Share fixed *and* verified with no test regressions | 155 findings (McNemar, 15% vs 5% discordant); 173 per arm if unpaired (40% → 55%) |
| **E4** | Does a classifier catch malicious packages that rules miss? | Temporal split on public malicious-package data plus a benign sample | AUC, precision at fixed recall, vs rules alone (DeLong test) | ≥ 500 malicious and ≥ 5,000 benign packages in the test period |
| **E5** | Are deterministic checks more robust than LLM judges? | Adversarial set of skills and MCP configs using published evasion techniques; both detectors on every item | Evasion rate (paired, McNemar) | 155 adversarial items for the effect above; more if discordance is lower |
| **E6** | Does Penthera save time for real users? | Small user study: newcomers secure a seeded app with and without Penthera | Issues fixed in 30 minutes; SUS usability score | 24 to 30 participants, crossover design |

Sample sizes are planning minimums from standard power calculations; each
pre-registration states the exact calculation and assumptions.

### Threats to validity

These are the known weaknesses of the program itself, and how each is handled.

- **Selection bias.** Public, permissively licensed repositories differ from
  private company code. Results generalise to similar open-source projects, not
  to every codebase. Mitigation: stratify by framework and project size, and
  report per stratum.
- **Labeller bias.** The maintainer built the tool and is a labeller. Mitigation:
  a second, independent labeller; blind labelling (labellers do not see which
  tool raised a finding); κ ≥ 0.70 before results count.
- **Incomplete ground truth.** Nobody knows every issue in a real project, so
  recall is estimated, not measured. Each pre-registration states its estimation
  method (for example a blind labelled sample of code Penthera did not flag) and
  its error.
- **Temporal leakage** in the malicious-package study (E4): training on data from
  after the test period would inflate results. Mitigation: a strict date split.
- **Adversarial sets built by us** (E5) may not reflect what real attackers do.
  Mitigation: use published evasion techniques and invite outside contributions
  of test cases.
- **Model drift.** Hosted models change without notice, and local models change
  between versions. Each run records exact model names, versions, and settings.
- **Researcher incentives.** The maintainer benefits if Penthera looks good.
  Mitigation: pre-registration, publishing negative results, and releasing
  labels and code so others can re-run the analysis.
- **Small user study (E6).** 24 to 30 participants, likely students and
  early-career developers. Results indicate usability for newcomers, not for
  experienced security teams.

### Data sources
- Real projects: permissively licensed public repositories, analysed **statically
  on a local clone**. No live scanning of anyone else's systems.
- Malicious packages: public datasets such as the OSV malicious-packages
  repository and academic collections. They are downloaded once, used offline,
  and handled in an isolated environment.
- Agent setups: public skills and MCP server repositories, read only.

## Safety and ethics: research nobody needs to block

- **Only our own targets are tested live:** our labs, deliberately vulnerable
  applications, and apps whose owners give written permission.
- **Static analysis of public code only:** we read code, we do not attack
  deployments.
- **Responsible disclosure:** anything real we find in someone's project is
  reported privately first, with a 90-day window, before any publication.
  Published results never include unpatched details.
- **No offensive tooling:** we do not generate attack payloads for AI systems or
  build tools aimed at targets the user does not own. Experiments are designed
  around *defensive verification*.
- **Ethics review:** studies involving people (E6) go through the university's
  ethics process; participants consent and can withdraw.
- **Respect platform rules:** registry and GitHub API limits are honoured. Bulk
  data comes from published datasets and mirrors, not scraping.
- **Malware hygiene:** malicious samples are never executed, stay offline, and
  are stored encrypted.
- **The tool's own principles still hold:** experiments never add telemetry or a
  runtime update channel to the shipped product.

## Milestones toward 2.0

| Milestone | Contents | Done when |
|---|---|---|
| 1.8 | Penthera Bench v1 (E1), MCP server, pre-registrations for E2 to E5 | Real-world precision and recall published with intervals |
| 1.9 | Bandit ranking (E2), propose-and-verify fixing with local models (E3) | Each beats its baseline in its pre-registered test, or is dropped |
| 2.0 | Package classifier (E4), adversarial study (E5), stable interfaces | E4 and E5 published; CLI flags, report schema, policy file and rule-pack format frozen |
| Research track | RL from verifier feedback; user study (E6); paper | Results published, positive or not |

Negative results are published too. If a model-based approach does not beat the
rules, that is a finding, and Penthera keeps the rules.
