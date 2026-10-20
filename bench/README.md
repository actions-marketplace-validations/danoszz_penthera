# Accuracy benchmark

> **Pro.** For "how accurate is Penthera, and how do I check that myself?"

A reproducible measure of how often Penthera is right. It runs the scanner
against local targets whose vulnerabilities are labelled by hand, and scores
precision and recall. The latest numbers are in [RESULTS.md](RESULTS.md).

```bash
npm run bench
```

That one command starts the targets, scans them, scores the findings against
[ground-truth.json](ground-truth.json), and rewrites `RESULTS.md`. It takes
about five seconds, needs no Docker, and makes no network requests beyond
127.0.0.1.

Options:

| Flag | Effect |
|---|---|
| `--check` | Exit 1 if total precision or recall falls below the CI floor in `run.js` |
| `--no-write` | Print the scores, leave `RESULTS.md` alone |
| `--json <file>` | Also write the full report (every finding, every score) as JSON |
| `--target <name>` | Run one target (repeatable) |
| `--url <url>` | Override the URL of an optional target |

## Targets

| Target | Kind | What it is |
|---|---|---|
| `mock-server` | URL, deep profile | [tests/fixtures/mock-server.js](../tests/fixtures/mock-server.js), the API used by the test suite: exposed OpenAPI and Swagger UI, missing headers, IDOR, OAuth open redirect, no login rate limit |
| `injection-lab` | URL, deep profile | [targets/labs.js](targets/labs.js): one injection flaw per endpoint (error-based SQLi, reflected XSS, SSTI, open redirect, command injection) |
| `decoy-lab` | URL, deep profile | [targets/labs.js](targets/labs.js): a hardened server whose endpoints are built to fool a naive scanner (encoded reflection, a page that always contains "49", SQL error text in the baseline, one slow response, a same-site-only redirect, a rate-limited login). It has no vulnerabilities, so every finding here is a false positive |
| `repo-fixture` | Repository | [targets/repo-fixture.js](targets/repo-fixture.js): a throwaway repo written to a temp dir with planted secrets and decoys (placeholders, `process.env` lookups, AWS's documentation example key) |

The lab servers simulate their flaws with string checks; nothing executes
input. Secret values in the repo fixture are generated from a fixed seed and
assembled at run time, so no credential-shaped string is committed.

## Scoring

Each target in `ground-truth.json` lists `vulnerabilities` (what a correct
scanner should report) and `notVulnerable` (decoys, with the reason they are
safe). For each target:

- A non-info finding that matches a vulnerability is a **true positive**. A
  second report of the same vulnerability is counted as a duplicate, not a
  false positive.
- Any other non-info finding is a **false positive**. If it matches a decoy,
  the decoy's reason is shown in `RESULTS.md`.
- A vulnerability with no matching finding is a **false negative**.
- Info-severity findings (inventory, parameter discovery) are not scored.

Precision is TP / (TP + FP), recall is TP / (TP + FN). A ratio with an empty
denominator is reported as `n/a`, never as 1.0. Results are also broken down by
confidence label, to check that `confirmed` findings really are more reliable
than `potential` ones.

Matching is by finding title (case-insensitive regex) and URL path or repo
file. The rules are in [score.js](score.js) and unit-tested in
[tests/bench.test.js](../tests/bench.test.js).

## Reproducibility

- `Math.random` is seeded during the run, so the fuzzer's payload sample and
  the injection canaries are identical every time. The canaries are still
  random from the target's point of view.
- Global `fetch` is wrapped: a request to anything other than loopback is
  refused and counted, and the count must be zero. Recon and the Retire.js
  database download are switched off because they need the internet.
- `npm test` runs the same benchmark and fails below the CI floor, so a rule
  change that adds a false positive or loses a detection fails CI.

## Adding a case

Every new detection rule should come with a labelled case here: a vulnerable
endpoint or file in a target, an entry under `vulnerabilities`, and where a
false positive is plausible, a decoy under `notVulnerable`. Then run
`npm run bench` and commit the updated `RESULTS.md` with the rule. See
[METHODOLOGY.md](../docs/METHODOLOGY.md#how-new-attack-techniques-are-adopted).

Twice while building these targets, Penthera was right and the label was
wrong: a "safe" redirect accepted `/\evil.com`, and a lab endpoint crashed on
non-string JSON. Both targets were fixed. When a finding on a decoy looks
wrong, check the decoy first.

## Optional targets

Two well-known deliberately vulnerable apps can be scanned with Docker. They
are not part of CI, and they have no ground truth here yet, so the benchmark
lists their findings without scoring them.

**OWASP Juice Shop** ([juice-shop/juice-shop](https://github.com/juice-shop/juice-shop)):

```bash
docker run --rm -p 127.0.0.1:3000:3000 bkimminich/juice-shop
npm run bench -- --target juice-shop --json bench/juice-shop.json
```

**OWASP crAPI** ([OWASP/crAPI](https://github.com/OWASP/crAPI)): follow the
project's Docker Compose instructions, then:

```bash
npm run bench -- --target crapi --url http://127.0.0.1:8888 --json bench/crapi.json
```

To score one of them, label its vulnerabilities in `ground-truth.json` (set
`"labelled": true` and fill `vulnerabilities` and `notVulnerable`, with a
reference for each label, such as the Juice Shop challenge it corresponds to).
Only label issues that a black-box scanner could see; most Juice Shop
challenges need a browser and multi-step interaction, which Penthera does not
attempt.

## Why the numbers are limited

The bundled targets are small and were written by the people who wrote the
scanner. They measure regressions and the false-positive controls, not
accuracy on arbitrary applications. The OWASP Benchmark project and Antunes and
Vieira's benchmarking work are the model for a fairer evaluation; see
[METHODOLOGY.md](../docs/METHODOLOGY.md#known-limitations).
