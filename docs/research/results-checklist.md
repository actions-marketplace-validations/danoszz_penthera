# Results-file checklist

> **Project page.** For researchers asking "what must every Penthera results
> file report, and where do I find it?"

Penthera is a test that says yes or no about an item: a credential, a
package, a code sink. Its benchmarks are accuracy studies, so the reporting
items come from STARD 2015, the checklist for diagnostic accuracy studies
([Bossuyt et al., 2015](../references.md#bossuyt2015stard)). Penthera is the
index test; the dataset's labels are the reference standard. The software
items come from the ACM SIGSOFT Empirical Standards
([Ralph et al., 2021](../references.md#ralph2021empirical)): the Benchmarking
standard ([ACM SIGSOFT Empirical Standards, n.d.-a](../references.md#sigsoft2026benchmarking)),
the Registered Reports supplement ([n.d.-c](../references.md#sigsoft2026registered))
and the Inter-Rater Reliability and Agreement supplement
([n.d.-b](../references.md#sigsoft2026irr)). We kept the items that fit a
rule-based scanner scored on labelled data, and wrote each in our own words.

Use it for every `bench/*/RESULTS.md` and for every pre-registration in
[prereg/](prereg/) that has a result. A file meets it when it links this page
or has the four required headings (a test checks this):

- **Abstract** (or Summary): question, method, result, limits.
- **Data and code** (or Reproduce): how to repeat it, and what is shared.
- **Limits** (or Threats to validity, or How far to trust these numbers).
- **Changes** (or Deviations, or Amendments): what changed after
  registration or after the result, with dates.

An item with no answer is reported as a gap. Leaving it out is not allowed.

## The items

| # | Item | From | Where it lives in our results files |
|---:|---|---|---|
| 1 | Name the study type and give an abstract: question, method, result with interval, limits | STARD 1 and 2 | The "Abstract" section of the pre-registration; the "Summary" at the top of `RESULTS.md` |
| 2 | Link the registered protocol and its registration commit | STARD 28 and 29; Registered Reports | The pre-registration's Status row; the first lines of each `RESULTS.md` section |
| 3 | Say why this benchmark measures the claim, and what it cannot measure | Benchmarking, construct validity | The pre-registration's "Datasets" and "What is not measured"; "Limits of this benchmark" in `RESULTS.md` |
| 4 | Describe the items: source, pin, eligibility, sampling, split | STARD 6 to 9; Benchmarking, workload | The pre-registration's "Datasets" or "Targets"; the split manifests in `bench/public/split/` |
| 5 | Name the unit counted (row, line, file, package, root cause) | STARD 10a; Benchmarking, metric | The pre-registration's "Units" or "Scoring"; each table's header |
| 6 | Give the tool under test: version, commit, settings, command | STARD 10a and 12a; Benchmarking, setup | The opening lines of each `RESULTS.md` section; the "Reproduce" table |
| 7 | Give the reference standard: who labelled, how, and what counts as positive | STARD 10b and 12b | The pre-registration's "Datasets" and "Scope"; "How far to trust these numbers" |
| 8 | Say how many people labelled, whether they were blind, and their agreement, or why one labeller is enough | STARD 13a and 13b; Inter-Rater Reliability, essential | The pre-registration's "Labelling"; the "Spot-check" paragraph in `RESULTS.md` |
| 9 | Show the flow: items in, excluded with reasons, failed, scored | STARD 19 | Table headers (n) and the "excluded" or "errors" notes next to each table |
| 10 | Report indeterminate results and tool errors, and how they were counted | STARD 15 and 16; Benchmarking, problems with runs | Notes under each table ("left out of the denominator", "timeouts") |
| 11 | Give counts behind every rate (k of n) | STARD 23 | Every table cell, as "(k/n)" |
| 12 | Give each estimate with its 95% interval, the method, and the clustering it ignores or handles | STARD 14 and 24 | The interval note at the top of `RESULTS.md`; the "Exploratory re-analysis" section of `bench/public/RESULTS.md` |
| 13 | Say what was tuned on what data, by whom, and how many passes were kept or rolled back | Benchmarking, antipattern "tailoring the benchmark" | The pre-registration's "Human-in-the-loop protocol"; the per-pass log in `bench/public/RESULTS.md` |
| 14 | Name every comparison tool with its version and settings, and say it ran on its defaults | Benchmarking, fair competition | `bench/public/README.md` (pins); footnotes under the ranking tables |
| 15 | Log each deviation with its date and reason, never justified by the data; mark post hoc analyses exploratory | Registered Reports, RR2 essential | The pre-registration's "Deviations"; headings that say "exploratory" or "not the registered result" |
| 16 | State what the result does not show, next to the result | STARD 26 and 27 | "Limits", "Threats to validity" or "How far to trust these numbers" |
| 17 | Say what is shared, under which license, what is not and why, and where it is archived | Benchmarking, supplementary materials | "Reproduce, licenses and what is not shared"; the pre-registration's "Open science" or "Reproduce" |
| 18 | Date every addition made after the result | Registered Reports | "(added <date>)" in headings; the pre-registration's "Status and log" |
| 19 | Say who did what, including AI assistance | STARD 30 | The pre-registration's Authors row; the `AI-Assisted` trailer on each commit |

## Known gaps

These are open across our files as of 29 Oct 2026, so a reader does not have
to find them:

- **Item 8.** Every label check so far has one person or one assistant
  behind it. No agreement statistic exists yet.
- **Item 12.** Registered intervals are Wilson intervals per item. The
  exploratory re-analysis shows how much wider they get when items are
  resampled by file or repository.
- **Item 17.** Results live on GitHub only. There is no archive with a DOI
  yet.
