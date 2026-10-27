# E14: Penthera plus the free tools, against each alone (pre-registration)

> **Project page.** For researchers asking "does running Penthera together with
> gitleaks, trufflehog and Semgrep give a better report, or only a longer one?"

| | |
|---|---|
| Builds on | [E11b](E11b-improvement-study.md): its split, scoring code, tool versions and sealed test half |
| Feature it decides | [`--giants`](../spec-giants.md): which merge ships as the default |
| Status | **Registered.** Approved by Daan van der Zwaag on 2026-10-25 as drafted. The commit that merges this file to `main` is the registration timestamp |
| Date written | 2026-10-25 |
| Authors | Daan van der Zwaag (PI, decides). Drafted with Claude (AI-assisted) |
| Seen before this registration | Each tool's **aggregate** scores on the E11b test half, as published in `bench/public/RESULTS.md`. E11b stored only those aggregates for the other tools (`competitors-*.test.json`), not their per-item hits, so **no combination has been computed or could have been**. Penthera's own per-item test output exists (`creddata.test.raw.json`), and E11b's leakage audit read parts of it. Per-item outputs on the dev half were looked at during E11b |

## 1. Research questions

**RQ1.** Does a merged report from Penthera and the free tools find more of
what is labelled, without losing more than a fixed margin of precision, than
Penthera alone?

**RQ2.** Is the merged report better than the best single free tool on the same
benchmark?

**RQ3.** Which merge rule should `--giants` ship as its default?

## 2. Benchmarks and arms

Only benchmarks where Penthera and at least one `--giants` tool both have a
score in E11b are in scope.

| Benchmark (E11b test half) | Penthera | Other tools (versions as in E11b) |
|---|---|---|
| Samsung CredData, secrets | 2.0.0 | gitleaks 8.30.1, trufflehog 3.99.3 |
| SecBench.js, command and code injection | 2.0.0 | Semgrep 1.180.0 (semgrep-rules `9bbf021`, `javascript/`), CodeQL 2.27.2 |

Out of scope, and said so in the results:

- **DataDog malware:** none of the `--giants` tools is a malware detector;
  osv-scanner is a lookup of reported packages (E11b did not rank it).
- **Known CVEs, infrastructure, live apps:** no shared public benchmark with a
  Penthera score yet. Their coverage is reported by `--giants`, not measured here.

CodeQL is used under its terms for research on open-source code (E11b's licence
note). It is an arm here even though `--giants` does not run it by default.

The arms, per benchmark:

| Arm | What it is |
|---|---|
| **P** | Penthera alone (the E11b result, recomputed with the same code) |
| **T** | Each other tool alone (E11b results) |
| **U** (union) | Penthera's findings plus every other tool's, merged by the spec's keys |
| **A** (agreement) | Penthera's findings, plus another tool's finding only when at least one other non-Penthera tool reports the same key |

The merge keys are those in the spec's [Merging](../spec-giants.md#merging)
section and are frozen by this registration: for CredData, file, line and the
value's hash; for SecBench.js, file, line and CWE when counting findings, while
a labelled bug counts as found when any member of the arm reports it in the
right file, as in E11b. No key, threshold or arm is changed after the first
combined count.

## 3. Scoring

E11b's code and units, unchanged:

- **CredData:** strict precision as the CLI reports (each distinct merged hit
  counted once) and in-scope row recall; F1 of the two, as in E11b's ranking.
- **SecBench.js:** strict recall, pooled over command and code injection, in
  the right file. SecBench.js has no labelled negatives, so precision is not
  measurable there; the **number of findings per package** is reported for each
  arm as a noise measure.

Intervals: Wilson 95% for proportions; for paired differences between arms, a
bootstrap over files (CredData) or packages (SecBench.js), 10,000 resamples,
seed `20261025`, percentile 95% interval.

## 4. Hypotheses

Each can fail. Results are published whatever they show.

| | Hypothesis | Supported when |
|---|---|---|
| H1 | On CredData, **U** has higher row recall than **P** | The 95% interval of recall(U) − recall(P) lies above 0 |
| H2 | On CredData, **U** loses no more than 0.02 precision against **P** (non-inferiority) | The 95% interval of precision(U) − precision(P) lies above −0.02 |
| H3 | On CredData, **U** has higher F1 than the better of gitleaks and trufflehog. deepsecrets, the best free tool in E11b, is not a `--giants` tool; the comparison with it is reported, not tested | The bootstrap interval of F1(U) − F1(best T) lies above 0 |
| H4 | On SecBench.js, **U** has higher pooled recall than **P** | The paired interval lies above 0 (exact McNemar test reported alongside) |

H1 to H4 are one family. Where a test gives a p-value it is adjusted with
Holm–Bonferroni; raw and adjusted values are both reported. Arm **A** and every
per-tool pair (P + gitleaks, P + trufflehog, P + Semgrep, P + CodeQL) are
secondary and descriptive.

## 5. The decision this experiment makes

The default merge for `--giants` (spec decision 3) follows from the results,
by this rule, fixed now:

1. If H2 holds and H1 holds: **union** is the default.
2. Else, if arm **A** passes the same two tests (recall above P, precision
   within 0.02): **agreement** is the default.
3. Else: **Penthera-first**. Other tools' findings are shown in their own
   section, "also reported by", and not merged into Penthera's list.

SecBench.js cannot test precision, so it does not decide the default alone. If
H4 holds while the default from CredData is Penthera-first, the result is
reported as "more found on code, at a cost not measurable here", and the
maintainer decides whether code findings follow a different rule.

## 6. Procedure

1. **Dev half first.** Extend the bench harness to keep each tool's per-item
   hits, rerun the tools on the **dev** half with E11b's pinned versions,
   commands and network deny, and build the merge code there: a spot-check of
   50 merged pairs per benchmark by hand, and a check that each tool's dev
   aggregate matches E11b's to within rounding (so the rerun is the same
   tool). Nothing on the test half runs in this step. Any change to the keys
   after this step is a deviation and is logged.
2. **One run on the test half.** Rerun each tool on the test half the same
   way, then compute all arms and hypotheses in one script run
   (`bench/public/giants.mjs --split test --final`). Each tool's test
   aggregate is checked against E11b's published one before any arm is
   computed; a mismatch stops the run and is reported. The per-item outputs
   are hashed and the hashes recorded here.
3. **Publish** the table, the intervals, the decision from § 5, and the
   per-tool pairs, in `bench/public/RESULTS.md` under "E14".

## 7. Threats to validity

- **Same test half as E11b.** The test half has been scored once for each
  tool, and those aggregates are public. No combination has been computed, and
  the arms and keys are fixed here, so the combination is not tuned to it. A
  clean check still needs new data: E14 is repeated on E1's projects and on
  post-freeze holdouts when they exist, with the same keys.
- **Merge keys decide the precision.** A loose key merges distinct findings and
  flatters precision; a strict key double-counts. The keys are fixed before the
  first count and the dev-half spot-check is published.
- **Tool defaults.** Each tool runs with the settings used in E11b. Tuned
  configurations might do better; that is a different question.
- **Author's own tool.** Penthera's maintainer designed the experiment. The
  pre-registration, the fixed decision rule and publishing every result are the
  guard; tool authors are invited to check their tool's configuration, as in
  E11b.
- **Benchmarks cover two areas.** E14 says nothing about dependencies,
  infrastructure or live apps.

## 8. Cost

Runs locally: the pinned tools rerun on both halves under the bench's network
deny, about the time of E11b's tool step. No model, no paid service. Within
the $20-per-experiment budget at $0.

## 9. Deviations

Any change after registration is logged here with its date and reason before
the test-half run. A look at any combined test-half count before step 2 voids
the confirmatory claim and is reported as such.

**2026-10-27, step 1 (dev half), from main `1f70835`.** Results in
[RESULTS.md](../../../bench/public/RESULTS.md#e14-step-1-the-dev-half-2026-10-27-not-the-registered-test).
No test-half item was read or run.

1. **Penthera's version on dev.** Arm P on the dev half is Penthera
   2.1.0-rc.1 (main `1f70835`), not 2.0.0. Between the two, the only change to
   the secret and code-sink rules is one file filter (translation files under
   `intl/` or named like `de-DE.json` get shape rules only, `c93b270`). For
   step 2, see entry 6.
2. **Units within one tool.** Each tool's own hits are counted with E11b's
   unit (a file and line for CredData; file, line and rule for code), and the
   spec's key decides only across tools. This is how § 3's "E11b's code and
   units, unchanged" was read; it reproduces every tool's E11b numbers.
3. **The value key for multi-line secrets.** `--giants` reads Penthera's
   secret value back from the reported line. For a line inside a private key
   block that yields no value, so those hits never merged with gitleaks'
   (535 of 911 shared lines on dev). Fixed by entry 7.
4. **Who spot-checked.** The 50 + 50 merged pairs were read by Claude
   (AI-assisted), not by the maintainer, and are kept for him to recheck.
5. **Noise counts.** Penthera's SecBench.js findings other than code sinks
   have no location in the raw output, so they are added to its findings per
   package unmerged.

**2026-10-27, the maintainer's decisions after step 1.** Both made before
any test-half run.

6. **P for step 2 is Penthera 2.1.0-rc.2**, not 2.0.0 as § 2 registers. It
   includes the E1 password fix; the CredData dev numbers do not change with
   it. Step 2 waits until 2.1.0-rc.2 is released.
7. **The secret key, when a value is missing.** When either of two secret
   findings has no value, they merge on file and line alone, for every tool;
   two different values on one line still do not merge. This changes the
   spec's key (§ 2 freezes it), so it is a deviation. It is in
   `lib/giants/merge.js`, the code `--giants` ships, with a fixture test of a
   private key block (`tests/giants-merge.test.js`). The dev half was
   rescored with it from the same per-item hits: the union's precision goes
   from 0.83 to 0.82 and H2 fails either way
   ([RESULTS.md](../../../bench/public/RESULTS.md#e14-step-1-the-dev-half-2026-10-27-not-the-registered-test)
   keeps both). Nothing else was changed.
