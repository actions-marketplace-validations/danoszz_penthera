# Spec: `--giants`, one first pass with the best free tools

> **Project page.** For "how would Penthera run gitleaks, Semgrep, trivy and the
> rest, fold their findings into its own report, and stay offline and
> deterministic while doing it?"

| | |
|---|---|
| Status | **Approved by Daan van der Zwaag on 2026-10-25**, with the [decisions](#decisions) below. Measured by the [E14 pre-registration](prereg/E14-giants-combination.md) |
| Date written | 2026-10-25 |
| Authors | Daan van der Zwaag (maintainer, decides). Drafted with Claude (AI-assisted) |
| Source | [ROADMAP.md](../../ROADMAP.md), "One first pass, with the best free tools"; a widely shared post listing gitleaks, trufflehog, semgrep, codeql, osv-scanner, pip-audit, trivy, checkov, nuclei, zap and burp as the stack to run |
| Release | Earliest 2.1.0-rc. 2.1.0 only after the rc is hardened and E14 is published |

## Summary

`--giants` makes one `penthera` run cover the first pass that people now
assemble from separate scanners. Penthera runs its own scan as today. Then, for
each area, it runs the free tools **you already have installed**, reads their
JSON or SARIF, and folds their findings into the same terminal report, Markdown,
JSON and SARIF. Each finding names the tool, its version and the rule that
raised it. Duplicates are merged by a fixed key. Areas with no tool installed
are reported as **not covered**, never as clean.

Nothing about Penthera's own detection changes. Rules still decide every
Penthera finding. Another tool's findings are its own deterministic output,
labelled as such; no model is involved anywhere in `--giants`.

| Area | Penthera's own | Tools `--giants` runs, if installed | Default network use |
|---|---|---|---|
| Secrets | Secret rules (F1 0.74 on CredData, E11b) | gitleaks, trufflehog | None |
| Code | Code patterns, library mode (0.70 on SecBench.js) | Semgrep with local rules | None |
| Dependencies | Capabilities, malware, licences, typosquats | osv-scanner (with a local database), pip-audit | osv-scanner: none with `--offline`; pip-audit: always online |
| Infrastructure | Runtime versions in Dockerfiles and version files | trivy (filesystem and IaC), checkov | None, with databases already cached |
| Live app (URL scans) | Passive checks, templates, `--deep` probes | nuclei, the ZAP baseline scan | The target URL only |

CodeQL is supported but never runs by default (see [Licences](#licences)).
Burp is out of scope: manual, proxy-driven testing by a person is a different
job, and it is proprietary.

## Non-goals

- **No downloads.** Penthera never installs a tool, pulls its container image or
  fetches its rules or databases. AGENTS.md rule 5 applies to tools as it does to
  rules. `penthera giants` prints the install command; you run it.
- **No bundling.** No tool's binary, rules or database ships in the npm package.
  Each runs as its own program under its own licence.
- **No re-scoring of other tools' findings by a model.** Their findings are
  labelled by source. Penthera's verification ladder from AI mode is not applied
  to them in this spec (see decision 6).
- **No claim that the combination finds more** until E14 is published.
- **Not a replacement for a pentest**, and not a replacement for each tool's own
  configuration when you need it tuned. `--giants` runs each tool with sane
  defaults.

## Command line

```
penthera [path] --repo . --giants
penthera [path] --repo . --with gitleaks,trivy
penthera [path] --repo . --giants --without trufflehog
penthera [path] --repo . --giants --giants-online
penthera https://staging.example.com --giants
penthera giants            # which tools are installed, their versions, install hints
```

| Flag | Default | Meaning |
|---|---|---|
| `--giants` | off | Run every supported tool that is installed and allowed offline, for the scan's mode (repo tools for `--repo`, live tools for a URL) |
| `--with <list>` | none | Run only these tools. Implies `--giants`. Naming a tool that needs the network still needs `--giants-online` |
| `--without <list>` | none | Skip these tools |
| `--giants-online` | off | Also run tools, or tool features, that contact a service: pip-audit, trufflehog key verification, osv-scanner without a cached database. Shown in the report header |
| `--giants-timeout <s>` | 300 per tool | A tool past its timeout is stopped; its area is reported as "timed out", not clean |

`penthera giants` (no scan) lists each supported tool: found or not, path,
version, whether the version is supported, and the install command for your
platform. It reads `PATH` only and runs each found tool with `--version`.

The policy file gains a `giants` key (same as the planned `ai` and `harness`
keys), so a team can require, limit or forbid tools for a repository.
`normalizePolicy` must add it to its `known` list.

## The tools

Versions are the minimum each adapter is written and tested against. Flags marked
"confirm" are to be checked against the tool's own `--help` in build step 1;
the rest were checked on 2026-10-25 against the installed tool or its docs.

| Tool | Licence | Command Penthera runs (repo at `<dir>`) | Output read | Network | Checked |
|---|---|---|---|---|---|
| gitleaks ≥ 8.30 | MIT | `gitleaks detect --no-git --source <dir> --report-format sarif --report-path <tmp> --redact` | SARIF | None | yes |
| trufflehog ≥ 3.90 | AGPL-3.0 (run as its own program) | `trufflehog filesystem <dir> --json --no-verification` | JSON lines | None; verification only with `--giants-online` | yes |
| Semgrep ≥ 1.100 | LGPL-2.1 engine; rules under their own licence | `semgrep scan --config <local rules dir> --metrics off --sarif --output <tmp> <dir>` | SARIF | None with a local config | confirm |
| osv-scanner ≥ 2.0 | Apache-2.0 | `osv-scanner scan source --offline-vulnerabilities --format json <dir>` | JSON | None with a cached database; otherwise needs `--giants-online` | yes |
| pip-audit ≥ 2.7 | Apache-2.0 | `pip-audit -r <requirements> --format json` | JSON | Always (PyPI or OSV); only with `--giants-online` | confirm |
| trivy ≥ 0.55 | Apache-2.0 | `trivy fs --skip-db-update --skip-check-update --scanners vuln,misconfig --format sarif --output <tmp> <dir>` | SARIF | None with cached databases | yes |
| checkov ≥ 3.0 | Apache-2.0 | `checkov -d <dir> --output sarif --output-file-path <tmp> --skip-download` | SARIF | None with `--skip-download` | confirm |
| nuclei ≥ 3.2 | MIT | `nuclei -u <url> -t <your templates dir> -duc -jsonl -etags intrusive,dos,fuzz` | JSON lines | The target only | confirm |
| ZAP baseline ≥ 2.15 | Apache-2.0 | `zap-baseline.py -t <url> -J <tmp>` (installed locally or in your own container) | JSON | The target only (passive spider and scan) | confirm |
| CodeQL | GitHub CodeQL Terms | Only with `--with codeql`; see [Licences](#licences) | SARIF | None | confirm |

**Semgrep rules.** Semgrep's registry rules download at run time, so `--giants`
uses only a local rules directory: the one you set in the policy file or
`PENTHERA_SEMGREP_RULES`, or a checkout of `semgrep-rules` you cloned. No local
rules means Semgrep is skipped, with that reason in the report.

**trivy and osv-scanner databases.** Both need a vulnerability database. Penthera
never fetches it. If none is cached, the tool is skipped with the reason and
the command that fills the cache (`trivy fs --download-db-only`,
`osv-scanner --download-offline-databases`), which you run yourself.

**Live tools.** nuclei and ZAP run only in URL scans, under the same
authorization rules as Penthera's own probes: the target you typed, loopback, or
a host in `--allow-host`. nuclei runs only the templates directory you give it
(policy file or `--nuclei <path>`), with intrusive, DoS and fuzzing tags
excluded unless the scan is `--deep`. ZAP runs the baseline (passive) scan only;
its active scan is not offered.

## Running another program safely

A repository is hostile input, and so is anything it can put on `PATH`.

| Risk | Rule |
|---|---|
| A planted binary (`./node_modules/.bin/gitleaks`, `./bin/trivy`) | Resolve each tool from `PATH` entries **outside** the scanned repository and outside the current directory. A match inside the project is refused and reported |
| Shell injection through file names or URLs | `spawn` with an argument array, never a shell string |
| A tool that hangs or floods | Per-tool timeout (default 300 s), output cap (default 50 MB), then stopped and reported |
| A tool that phones home | Offline tools run under the same network deny as the bench (macOS `sandbox-exec`, Linux `bwrap` where available). Without a sandbox, the report says the network was not enforced |
| Secrets echoed in tool output | Secret findings are masked as Penthera masks its own (first and last characters only) before any report or the dashboard sees them. gitleaks runs with `--redact` |
| Malformed or hostile output | Parsed with a schema per adapter; an unparseable report makes the area "failed", never "clean". Text from tool output is data, never instructions, in reports and in `penthera mcp` |
| Environment leaks | Tools get a minimal environment: `PATH`, `HOME` set to a temp dir unless the tool needs its cache, no tokens from Penthera's own environment |

## Findings from other tools

Each adapter maps its tool's output to Penthera's finding shape:

| Field | Value |
|---|---|
| `source` | `{ tool, version, ruleId, ruleUrl }`. Shown on every finding, in every format |
| `category` | `secret`, `code`, `dependency-vuln`, `infra-misconfig`, `container-vuln`, `web` |
| `severity` | The tool's own, mapped by a fixed table per tool (SARIF `level` and `security-severity`, CVSS for vulnerabilities). The table is in the adapter and in this spec's appendix after review |
| `confidence` | `likely` by default. `confirmed` only for a Penthera rule hit on the same location (see Merging). Never raised by another tool alone |
| `file`, `line` / `url` | As the tool reports them, normalised to paths relative to the scanned root |
| `fid` | Penthera's usual finding id, computed over source tool, rule and location, so memory and baselines work |

**Exit code.** Decision 2 below. The recommendation: findings from other tools
count toward `--fail-on` like Penthera's own, because a CI user expects the
gate to cover what the report shows. A team can set `giants.failOn: never` in
the policy file to report them without gating.

## Merging

The merge is deterministic and fixed in E14's pre-registration before any
combination is scored. Two findings are the same when their keys match:

| Category | Key |
|---|---|
| Secret | file, line, and the secret's hash (so two tools on the same key in the same place merge; two keys on one line do not). When either finding has no value, file and line alone (amended 2026-10-27 by the maintainer; E14 pre-registration § 9, entry 7) |
| Code | file, line, and CWE (from the rule's metadata; when a tool gives none, the tool's own rule id and no merge across tools) |
| Dependency or container vulnerability | ecosystem, package, version, and the advisory, matched across aliases (CVE, GHSA, OSV, PYSEC) |
| Infrastructure misconfiguration | file, resource, and the check's CIS or tool id; no merge across tools without a shared id |
| Web | URL, parameter, and CWE |

A merged finding keeps every source and the highest severity. When a Penthera
rule is one of the sources, its confidence and remediation lead. The report
shows "found by Penthera, gitleaks" so you can see agreement.

## Reports

- **Terminal:** findings as today, each with a short source tag (`gitleaks`,
  `trivy`); a new **Coverage by area** table: area, tools that ran, versions,
  findings, and "not installed", "skipped: needs `--giants-online`",
  "timed out" or "failed" where that applies.
- **Markdown and JSON:** the same, plus each tool's command line and exit code,
  so a reviewer can rerun it.
- **SARIF:** one `run` per tool, with that tool's `tool.driver` name and version,
  so GitHub code scanning shows each tool honestly. Penthera's own run stays
  first.
- **Dashboard:** a source filter and the coverage table. No other change.
- **Evidence bundle:** each tool's raw output, hashed like Penthera's own.

## Licences

| Tool | What it means for `--giants` |
|---|---|
| CodeQL | The CodeQL Terms allow academic research and analysis of open-source codebases, not automated analysis of other code. `--giants` never runs it. `--with codeql` runs it after a one-line notice; using it on closed-source code is your responsibility under your own licence (for example GitHub Advanced Security) |
| Semgrep rules | The Semgrep Rules License v1.0 allows use and forbids offering the rules as a competing service. Penthera runs your local copy for you, on your machine; it does not redistribute them |
| trufflehog | AGPL-3.0. Run as a separate program, unmodified; Penthera does not link or ship it |
| Others | Permissive (MIT, Apache-2.0) |

## Testing

- **Contract tests per adapter**, offline, from recorded output: one real
  output file per tool version (from a run on `tests/fixtures/`), checked in
  under `tests/fixtures/giants/<tool>/<version>/`. The test parses it and checks
  the findings, the severity map and the coverage line.
- **Merge tests** on hand-built overlapping findings for every category.
- **Safety tests:** a fake `gitleaks` inside the scanned repo is refused; a tool
  that sleeps past the timeout is stopped; a tool that prints a secret has it
  masked; a malformed report makes the area "failed".
- **No tool binaries in CI by default.** An optional workflow
  (`giants-integration.yml`, manual trigger) installs pinned versions and runs
  the adapters against the fixtures, to catch output-format changes.
- `npm run audit:internal` gains a check that `--giants` with no tools installed
  reports every area as not covered and exits 0.

## Measurement

E14 measures whether the combination is better than Penthera alone and than the
best single tool, on the public benchmarks where both have a score. Until it is
published:

- the docs describe `--giants` as "runs the tools you have and merges their
  findings", a feature description, and make no accuracy claim;
- no page, README or post says the combination finds more;
- the default merge is the one E14 recommends, or Penthera-first if E14 is not
  done by the rc.

## Communication

| When | What we say | Where |
|---|---|---|
| Now | "On the roadmap" | Replies; [ROADMAP.md](../../ROADMAP.md) |
| 2.1.0-rc | "Penthera runs the free tools you already have and merges them into one report. Nothing is downloaded or uploaded." A screenshot of the coverage table | README, `docs/commands/giants.md`, one post |
| E14 published | Whatever E14 shows, with intervals, wins and losses | RESULTS, site, a thread with the figure |

## Build order

One PR for the batch (per the maintainer's "fewer PRs"), in this order of
commits, each with tests, `npm test` and `npm run audit:internal`:

1. Confirm every "confirm" flag above from the installed tools; record
   fixtures.
2. The runner: `PATH` resolution outside the repo, spawn, timeout, output cap,
   sandbox, minimal environment. `penthera giants` (the listing).
3. The finding shape (`source`, `category`), the merge keys, the coverage table.
4. Adapters for the offline repo tools: gitleaks, trufflehog, Semgrep,
   osv-scanner, trivy, checkov.
5. `--giants-online` and pip-audit; trufflehog verification.
6. Live adapters: nuclei, ZAP baseline, behind the existing authorization gate,
   with refusal tests for hosts outside the allowed set (decision 5: in the
   first rc).
7. SARIF runs per tool, Markdown and JSON, the dashboard filter, the evidence
   bundle, the `giants` policy key.
8. Docs: `docs/commands/giants.md`, the README section, `--help`.

## Decisions

Taken by the maintainer on 2026-10-25:

1. **Flag name:** `--giants`, plus `--with <list>` and `--without <list>`.
2. **CI gate:** other tools' findings count toward `--fail-on` like
   Penthera's own. A team opts out with `giants.failOn: never` in the policy
   file.
3. **Default merge:** decided by E14's rule (§ 5 of the pre-registration).
   Until E14 reports, Penthera-first.
4. **CodeQL:** only with `--with codeql`, after a one-line licence notice.
   Never in plain `--giants`.
5. **Live tools:** nuclei and the ZAP baseline are in the **first rc**, with
   the repo tools. Their authorization gate (the target you typed, loopback, or
   `--allow-host`; intrusive templates only with `--deep`; ZAP passive only) is
   reviewed in the same PR, with tests that a host outside the allowed set is
   refused before either tool starts.
6. **Oracle checks of other tools' findings:** not in this spec. Considered
   after E14.
7. **Versions:** a minimum version per tool; newer versions run with a warning
   until a recorded fixture exists for them.

No open questions remain for this spec. Code may start, in the build order
above.

## Appendix: build notes (2026-10-26)

Written during the build, for review. Nothing here changes a decision above.

### Flags confirmed from each tool's `--help`

| Tool (version checked) | Result |
|---|---|
| gitleaks 8.30.1 | `detect` is no longer listed; `gitleaks dir <path>` replaces `detect --no-git --source <path>`. `--redact`, `--report-format sarif`, `--report-path`, `--exit-code` as planned |
| TruffleHog 3.99.3 | `filesystem`, `--json`, `--no-verification` as planned; `--no-update` added (no self-update check) |
| Semgrep 1.180.0 | `--config`, `--metrics off`, `--sarif`, `--output` confirmed; `--disable-version-check` and `--quiet` added |
| osv-scanner 2.6.0 | `--offline-vulnerabilities` alone still tries deps.dev for transitive Python resolution; `--offline` turns off every network feature and implies it, so `--offline` is used, with `--recursive` |
| pip-audit 2.10.1 | `-r`, `--format json` confirmed. `--no-deps --disable-pip` added: pip-audit otherwise pip-installs the requirements into a temp venv, which runs their build scripts |
| Trivy 0.76.1 | Flags as planned, plus `--skip-version-check`, `--disable-telemetry`, `--quiet` |
| Checkov 3.3.30 | `-d`, `--output`, `--output-file-path` (a folder; the report is `results_<format>.<ext>` inside), `--skip-download` confirmed; `--quiet` added (failed checks only) |
| nuclei 3.11.1 | `-u`, `-t`, `-duc`, `-jsonl`, `-etags` confirmed; `-ni` added (no interactsh, a third-party callback server), `-or -ot -silent -nc` for clean output. Code-protocol and headless templates need `-code` / `-headless`, which are never passed |
| ZAP 2.17.0 (`zap-baseline.py`) | `-t`, `-J` confirmed; `-I` added (warnings do not fail the run); `-z -silent` added, because the script otherwise runs `-addonupdate` against the ZAP marketplace. No `--version`: the version is read from the JSON report |
| CodeQL 2.27.2 | `database create --db-cluster --language --source-root --build-mode=none`, then `database analyze --format sarif-latest --output --no-download` |

### Deviations from the text above

- **`source` stays a string.** Every Penthera finding already has `source` as
  a string (the check family), and baselines, memory and the audit loop key
  on it. A tool finding's `source` is the tool's name; the object the spec
  describes (`tool`, `version`, `ruleId`, `ruleUrl`) is in `sources`, a list,
  because a merged finding keeps every tool. `foundBy` lists the tool names.
- **Trivy and Checkov are read as JSON, not SARIF.** Trivy's SARIF puts the
  package name and version in free text, and Checkov's SARIF has no resource
  name; the merge keys need both as fields. SARIF output to GitHub is
  unchanged: Penthera writes one run per tool either way.
- **Penthera-first, concretely.** A tool finding that matches a Penthera
  finding by the keys above is folded into it (`foundBy`, `alsoReportedBy`);
  the rest are merged among the tools and listed under "Also reported by other
  tools" (`giants.findings` in JSON). Penthera findings that can match today:
  secrets (the value is read back from the file at the reported line and
  hashed) and code patterns (Penthera's `eval` is CWE-95, command injection
  CWE-78).
- **A secret with no value merges on file and line** (2026-10-27, the maintainer's decision after E14's dev half). Penthera's value is read back from the reported line; a line inside a private key block has none, so those findings never merged with gitleaks'. Two different values on one line still do not merge.
- **SARIF.** A tool whose findings were all folded into Penthera's still gets
  its own (empty) run, so code scanning shows that it ran.
- **`--allow-host`.** The live-tool gate takes an allow-list, but the scan
  command has no `--allow-host` flag today, so on the command line the allowed
  set is the URL you typed and hosts on your machine.

### Severity tables

| Tool | Penthera severity from |
|---|---|
| gitleaks | No severity in its output: **high** for every rule |
| TruffleHog | **critical** when the provider accepted the key (`--giants-online`), else **high** |
| Semgrep | The rule's `security-severity` score when present, else SARIF level: error high, warning medium, note low |
| CodeQL | `security-severity` score, else `problem.severity` / level as for Semgrep |
| osv-scanner | The group's `max_severity` CVSS score, else the advisory's own word, else medium |
| pip-audit | No severity in its output: **medium** |
| Trivy | Trivy's own word (CRITICAL, HIGH, MEDIUM, LOW; UNKNOWN is info) |
| Checkov | Its `severity` when set (only with a Prisma Cloud key), else **medium** |
| nuclei | The template's `info.severity` |
| ZAP | `riskcode`: 3 high, 2 medium, 1 low, 0 info |

Scores: 9.0 and up critical, 7.0 high, 4.0 medium, above 0 low.
