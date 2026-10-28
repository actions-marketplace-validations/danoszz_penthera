# Spec: `penthera watch`, and new advisories offline

> **Project page.** For maintainers and contributors asking "what does
> `penthera watch` do, what does it check against, and what doesn't it do?"

Status: draft for review, 28 October 2026. No code yet.

## Summary

`penthera watch` answers one question on a schedule: **did anything change
since the last run?** It runs the checks Penthera already has (dependencies,
agent setup, secrets, runtime pins, and a passive check of the user's own
site), compares the results with the previous run, and reports only what
changed. In the GitHub Action it runs on a cron schedule, in the user's own
repository, and writes a job summary and one issue that it keeps up to date.

The second half is **new advisories, offline.** Each Penthera release carries
an advisory data pack: the CISA Known Exploited Vulnerabilities catalog
(KEV), EPSS scores, and the npm and PyPI advisories those point to, signed
like every rule pack. `watch` checks the project's SBOM against that pack. No
data is fetched at run time (AGENTS.md rule 5), so the data is exactly as
fresh as the user's Penthera version. Every report says how old the data is.

This is the free core of what the Pro experiment asks about: "what you
shipped, checked again every day". It runs in the user's own CI, with no
server and no account.

## Non-goals

- **No server, no account, no telemetry.** Nothing leaves the user's CI
  except what GitHub already holds: the summary and the issue.
- **No run-time downloads.** Advisory data ships in signed packs with each
  release. A user who wants live data can run `--giants` with osv-scanner
  online, which is opt-in and separate.
- **No full CVE database.** The pack holds what's exploited or likely to be
  (KEV, plus EPSS above a threshold) for the ecosystems Penthera reads (npm,
  PyPI). The report says that plainly.
- **No active tests on a schedule.** The site check is the passive one, and
  only on hosts listed in the config (AGENTS.md rule 6).

## Command line

```text
penthera watch [path] [--url <url>] [--state <file>] [--issue] [--json]   (planned)
```

- `path`: the project, defaulting to `.`.
- `--url`: a live site to check passively. It must be the user's own; the
  host also has to be listed in `penthera.config.json` under `watch.hosts`, so
  a typo can't point a schedule at someone else.
- `--state`: the previous run's result, for the diff (default
  `.penthera/watch-state.json`). In CI, the Action keeps it in the Actions
  cache, never committed.
- `--issue`: in GitHub Actions, open or update one issue titled
  "Penthera watch". If nothing changed, it adds nothing; it closes the issue
  when every item is resolved.
- **Exit codes**, the same as a scan:
  - 0: nothing new at high or critical;
  - 1: something new at high or critical;
  - 2: the run failed.

## What a run checks

| Check | Already in Penthera | New |
|---|---|---|
| Dependencies: capabilities, malware, typosquats | `penthera deps` | Diffed against the last run |
| Agent setup: MCP servers, skills, hooks, permissions | `penthera agents`, `--pin` | Diffed against the last run |
| Secrets in the repo | `--repo` secret scan | Only new findings reported |
| Runtime pins (Node.js, PHP, Python, nginx...) | runtime advisories | Re-checked against the newest pack |
| The SBOM against KEV and EPSS | none | **New:** matched offline against the advisory pack |
| The live site, passive | `penthera <url>` (standard profile, no login POST) | Diffed against the last run |

## The advisory pack

- **Contents:**
  - KEV entries (CVE, vendor, product, date added, due date);
  - EPSS score and percentile for each CVE the pack includes;
  - for npm and PyPI, the affected package and version ranges from the OSV
    advisories those CVEs point to.
- **Selection:** every KEV entry, plus CVEs with EPSS ≥ 0.1 that have an npm
  or PyPI advisory. Both thresholds go in the pack's manifest.
- **Size budget:** under 5 MB compressed, checked by a test.
- **Format:** a rule pack like the others (`lib/rules/pack.js`), with
  `kind: advisories`, signed and verified offline.
- **How it's built:** a script in the repo fetches KEV, EPSS and OSV,
  filters, and writes the pack. The maintainer runs it before a release and
  signs the result. No agent signs packs.
- **Freshness:** the pack records the date its sources were fetched. Every
  `watch` report starts with that date: "Advisory data from 2026-10-28
  (Penthera 2.1.0)". With data older than 30 days, it says so and suggests
  upgrading.
- **Ranking:** a match is ordered KEV first, then by EPSS. Severity follows
  the advisory. The report shows KEV and EPSS next to each match.

## Reports

- **Job summary:** what's new, what's resolved, what's unchanged (one count),
  the advisory data's age, and what wasn't checked.
- **The issue:** the same content, updated in place, with one checklist item
  per open finding.
- **The agent brief:** `watch` prints the brief when stdout isn't a terminal,
  like a scan does.

## Testing

- Fixture projects with a lockfile that matches a fixture pack entry, and one
  that doesn't.
- A state file from a previous run; the diff reports new, resolved and
  unchanged correctly.
- `--url` refuses a host not listed under `watch.hosts`.
- The pack size budget, signature check and freshness warning.
- The Action: a dry run in `act`-style fixtures; the issue body is a snapshot.

## Measurement

- **Time to know.** For each advisory pack, record the date each KEV entry
  was added upstream and the date it reached a Penthera release. Publish the
  median delay per release in `bench/`, whatever it is. This number is how
  `watch` is judged.
- **Recall of the SBOM match** on a fixture set of known-affected lockfiles,
  built from real advisories, as a regression test.

## Build order

1. The advisory pack: the build script, the format, signing and size test.
2. SBOM against the pack, as `penthera deps --advisories`, usable on its own.
3. State and diff, and `penthera watch` locally.
4. The Action's `mode: watch`, with cache, summary and issue.
5. Docs (`docs/commands/watch.md`), changelog, the time-to-know table.

## Open questions for review

1. **Pack cadence.** The data is only as fresh as the last release. Should
   there be a monthly advisory-only patch release (`2.1.x`) that you sign?
   Recommendation: yes, monthly, with a checklist in CONTRIBUTING.
2. **The EPSS threshold:** 0.1 (top few percent) to keep the pack small?
   Recommendation: 0.1, to be revisited with the size budget.
3. **The issue:** one rolling issue per repo, or one issue per new finding?
   Recommendation: one rolling issue, so a weekly schedule never floods a
   repo.
