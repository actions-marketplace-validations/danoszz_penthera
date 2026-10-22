# E10: Penthera on known-vulnerable apps (pre-registration draft)

| | |
|---|---|
| Experiment | E10. Not yet listed in [vision-2.0.md](../../vision-2.0.md#experiments); adding it there is an open decision (§ 13) |
| Related | [E1](E1-real-world-accuracy.md) (real-world accuracy, registered). E10 complements it: E1 has no answer key and estimates recall from a labelled sample; E10 has a public answer key but unrepresentative code |
| Status | **Draft, not registered.** Nothing here binds until the maintainer accepts it; the commit that merges the final version to `main` is the registration timestamp |
| Date written | 2026-10-22 |
| Authors | Daan van der Zwaag (PI, labeller A); labeller B named in an amendment before calibration. Drafted with Claude (AI-assisted) |
| Data collected before registration | Answer keys for six apps, frozen before any scan (commits `ce0cf42` and `1163b0e` on the E10 branch). A pilot on two apps ran after the keys were frozen (§ 12); its results are a pipeline check, published only as a pilot |
| Structure | Mirrors E1: questions and hypotheses, variables, targets, scope, procedure, labelling, analysis, threats, safety, deviations |

## 1. Research questions and hypotheses

**RQ1.** On widely used, deliberately vulnerable web applications whose
vulnerabilities are documented by their own authors, what share of
Penthera's findings are correct (precision)?

**RQ2.** Of the documented vulnerabilities in classes Penthera claims to
detect, what share does it find (recall)?

Both are answered overall, per app, and per class (§ 4), with Wilson 95%
intervals. The hypotheses are stated so that they can fail; the estimates
are reported whatever the outcome.

| | Hypothesis | Test | Supported when |
|---|---|---|---|
| H1 | Pooled precision (level 1) in the standard run is above 0.70 | Wilson 95% interval, findings pooled over apps (§ 8.1) | The lower bound is above 0.70 |
| H2 | Pooled recall over in-scope root causes in the deep run is above 0.50 | Wilson 95% interval over root causes (§ 8.2) | The lower bound is above 0.50 |
| H3 | Precision on these apps is lower than on Penthera's own labs (0.875, `bench/RESULTS.md`) | Pooled standard-run precision vs 0.875 | The upper bound of the Wilson interval is below 0.875 |

Why these thresholds: 0.70 is E1's precision threshold, kept the same so
the two studies can be read together. 0.50 for recall is deliberately
modest: the in-scope set is restricted to classes Penthera claims, so a
scanner that finds fewer than half of them in those classes has a coverage
problem, whatever its precision. H3 checks whether the self-written labs
overstate accuracy; it is the reason E10 exists.

H1 to H3 are one family; p-values, where a test gives one, are adjusted with
Holm–Bonferroni. Everything else (per app, per class, level 2, the
authenticated run if one is added) is secondary and descriptive.

## 2. Dependent variables

- **Level 1, correct (primary).** For a finding: is the stated condition
  actually present at the stated location of the running app or its source?
  A finding that matches an in-scope answer-key entry (§ 5.3) is correct
  without labelling. Every other finding is labelled.
- **Level 2, actionable (secondary).** For a correct finding: should the
  owner of a real application change something? A password in a test
  fixture is correct but not actionable.
- **Found (recall).** For an in-scope answer-key root cause: did at least one
  finding match it?

Labels are `correct`, `incorrect` or `cannot-tell`. As in E1, `cannot-tell`
counts as incorrect in the primary analysis; a sensitivity analysis drops it.

## 3. Targets

### 3.1 Inclusion

A target is included when all hold:

1. Its project says it is deliberately vulnerable and meant for security
   training or testing.
2. It has an OSI-approved licence that allows running it and linking to it.
3. It documents its own vulnerabilities (challenge list, solution guide or
   lessons) at a pinnable version.
4. It runs in Docker from a published image, or from its own Dockerfile.

### 3.2 The six targets

| App | Licence | Intended use (own words, see truth file) | Source pin | Image pin | Answer key |
|---|---|---|---|---|---|
| OWASP Juice Shop | MIT | "intentionally insecure" training app | v20.3.0, `f189f521` | `bkimminich/juice-shop@sha256:cea5a4af…` | `data/static/challenges.yml`, companion guide, `vuln-code-snippet` markers |
| DVNA | MIT | demonstrates the OWASP Top 10 in Node.js | `master` @ `9ba473ad` (app code unchanged since 2018-08) | `appsecco/dvna:sqlite@sha256:2657051b…` (amd64) | `docs/solution/` |
| OWASP NodeGoat | Apache-2.0 | teaches the OWASP Top 10 in Node.js | v1.4, `9e35cae2` | built from its Dockerfile (base images `node:4`, `mongo`) | in-app tutorial (`app/views/tutorial`) |
| DVWA | GPL-3.0-or-later | "damn vulnerable" PHP/MySQL app for training | 2.5, `a96943dc` | `ghcr.io/digininja/dvwa:a96943d@sha256:d8e960e0…` + `mariadb:10` | `vulnerabilities/*` modules and help pages |
| OWASP crAPI | Apache-2.0 | "vulnerable by design" API | v1.1.6, `700f03d1` | ten images, pinned by digest in the truth file | `docs/challenges.md`, `docs/challengeSolutions.md` |
| OWASP WebGoat | GPL-2.0-or-later | "deliberately insecure" teaching app | v2026.5, `7e198f39` | `webgoat/webgoat@sha256:95c23e70…` | lesson sources and pages |

Full pins, licence links and the place each project states its purpose are
in `bench/known-vuln/<app>/truth.json`. Known pinning gaps, reported rather
than hidden: crAPI publishes no `v1.1.6` image tags (the `latest` digests of
the release date are pinned); NodeGoat has no published image; DVWA has no
`2.5` image tag (the commit-SHA tag of the release commit is pinned); the
database images of DVWA, crAPI and NodeGoat use moving tags whose digest is
recorded on the date resolved.

### 3.3 Licensing of what is committed

No application code is committed. Answer keys hold links to the app's own
pages at the pinned commit, short descriptions in our own words, and our
class mapping. The one exception is Juice Shop's out-of-scope entries,
which quote the first sentence of each challenge description from
`challenges.yml` (MIT, credited in the file). GPL-licensed apps (DVWA,
WebGoat) are linked and described, never quoted.

## 4. Classes

E10 scores Penthera only on what `penthera <url> --repo <src> --offline`
claims to find. Its finding categories map onto seven classes:

| E10 class | What it covers | Penthera sources (categories) |
|---|---|---|
| `secrets` | Hardcoded credentials, keys, signing secrets in source or config | repo secret scan (`secrets`) |
| `code-sink` | Dangerous sinks on input visible in source: eval, shell exec with concatenated input, innerHTML | repo risky patterns (`code-pattern`: eval, innerHTML, command-injection) |
| `exposure` | Served things that should not be: listings, backups, IaC, logs, metrics, API docs, stack traces | URL discovery, sensitive files, OpenAPI (`exposure`, `info-leak`, `disclosure`; `error-leak` patterns) |
| `misconfig` | Response headers, cookie flags, CORS, TLS | URL headers, cookies, CORS, TLS (`headers`, `cookie`, `cors*`, `tls`, `config`, …) |
| `auth` | Login rate limiting, unauthenticated endpoints a spec says need auth, JWT verification, numeric-id IDOR | URL auth checks (`auth`, `auth-bypass`, `rate-limiting`) |
| `vulnerable-component` | Known-vulnerable client JS libraries; pinned runtimes or images with advisories | Retire.js, runtime advisories (`js-vulnerability`, `cve`, `runtime-advisory`) |
| `injection` | SQLi, reflected XSS, SSTI, OS command injection, SSRF, open redirect, by sending payloads | `--deep` probes and fuzzing (`sqli`, `xss`, `ssti`, `cmdi`, `ssrf`, `open-redirect`, `fuzzing`, `injection`) |

A finding whose category has no class is `other`. It is still a precision
unit; it can never match an answer-key entry. The mapping is code
(`bench/known-vuln/score.mjs`, `classOf`) and unit-tested.

## 5. Scope and answer keys

### 5.1 One entry per documented item

Every item in an app's answer key gets an entry in its `truth.json`, in
scope or not. Each entry records the app's own name and key, a link to the
documentation at the pinned commit, a short description in our words, the
app's own category, our class, and either the in-scope fields or an
exclusion code.

In-scope entries also record: the **surface** a scanner must see it on
(`url` or `repo`), whether the URL needs a logged-in session (`needsAuth`)
or attack payloads (`needsPayloads`), one or more **locations** (URL path,
`/`-suffix for a prefix, `*` for app-wide; or repo-relative file), a
**group** (root cause: several documented items that are one flaw at one
location share a group, such as Juice Shop's three login SQL-injection
challenges), and optional **keywords** (§ 5.3).

### 5.2 What is excluded, and why

An item is in scope only when its class is one Penthera claims **and** its
location is concrete. Everything else is excluded with a code:

| Code | Meaning | Example |
|---|---|---|
| `business-logic` | Needs the app's rules | Juice Shop negative order quantity, crAPI refund abuse |
| `access-control-logic` | Authorisation decisions beyond a numeric-id IDOR | another user's basket, BFLA, mass assignment |
| `needs-browser` | Exists only when JavaScript runs in a browser | DOM XSS, hidden client routes |
| `stored-or-multistep` | Stored XSS, chained steps, prior bypass needed | Juice Shop backups behind a null-byte bypass |
| `class-not-claimed` | A class Penthera does not claim | XXE, deserialisation, NoSQL injection, CSRF, upload, weak crypto, logging, path traversal |
| `dependency-cve` | Server-side dependency advisory | DVNA's mathjs RCE (`penthera deps` reports capabilities, and is not part of this run) |
| `weak-credentials` | Guessable or default passwords | Juice Shop `admin123` |
| `osint-or-social` | Outside research, social engineering, reporting to the shop | Juice Shop OSINT challenges |
| `llm` | Chatbot and prompt injection | Juice Shop and crAPI chatbot challenges |
| `not-a-vulnerability` | Tutorial or good-practice items | Juice Shop "Privacy Policy" |
| `out-of-band` | Needs an external server, email or phone | crAPI's `jku` JWT variant |
| `not-in-answer-key` | Found in source by the key's author, not in the app's docs | NodeGoat config secrets |
| `other` | Explained in the entry's note | |

Excluded entries stay in the file. A Penthera finding on an excluded item
is still a precision unit and is labelled like any other finding; it just
does not count towards recall.

| App | Entries | In scope | Root causes in recall: standard | deep | deep + session |
|---|---:|---:|---:|---:|---:|
| Juice Shop | 116 | 19 | 10 | 13 | 13 |
| DVNA | 21 | 9 | 4 | 5 | 8 |
| NodeGoat | 31 | 10 | 7 | 7 | 10 |
| DVWA | 21 | 8 | 1 | 2 | 7 |
| crAPI | 18 | 5 | 1 | 1 | 5 |
| WebGoat | 126 | 31 | 9 | 9 | 25 |
| **Total** | **333** | **82** | **32** | **37** | **68** |

### 5.3 Matching a finding to the key

A finding matches an in-scope entry when (a) its E10 class equals the
entry's class, (b) its location matches one of the entry's locations of the
entry's own surface (paths for `url` entries, files for `repo` entries),
and (c) if the entry lists `keywords`, one of them occurs in the finding's
title or description. Keywords are tool-neutral words (`x-powered-by`,
`mongo`) and are required where a location is shared: an app-wide header
entry (`*`), or two components pinned in one file. The rules are in
`score.mjs` and unit-tested in `tests/bench-known-vuln.test.js`.

### 5.4 Freezing

Answer keys are written from the apps' own documentation only, before any
Penthera scan of that app, and committed. A change to an answer key after a
scan of that app is an amendment with a date and reason, recorded in the
truth file's `amendments` array and in § Amendments below. Keywords were
added this way after the pilot (§ 12).

## 6. Runs

| Run | Penthera flags | Sends attack payloads | Logged in |
|---|---|---|---|
| `standard` (primary for H1) | `<url> --repo <src> --offline --json --profile standard` | No | No |
| `deep` (primary for H2) | `… --profile deep` (injection probes, fuzzing) | Yes, to the local container only | No |
| `deep + session` | `… --profile deep --auth-cookie …` | Yes | Yes. **Not built; open decision (§ 13)** |

An entry marked `needsAuth` counts only in a logged-in run, and
`needsPayloads` only in a run that sends payloads. The probes Penthera
reports as executed (`executedProbes`) are recorded per app and run.

## 7. Procedure

1. **Source.** The app's repository is cloned into a cache outside this
   repository (`$PENTHERA_BENCH_CACHE/known-vuln/src`) and checked out at the
   pinned commit; the runner refuses to continue if `HEAD` differs. Nothing
   in it is built, installed or run.
2. **Start.** The pinned image is pulled by digest and started on its own
   `docker network create --internal` network, so it has no route out. A
   relay container (`alpine/socat`, pinned by digest) joins that network
   and a normal one, and publishes the app on `127.0.0.1` only. The runner
   checks the target's only network is the internal one before scanning.
3. **Scan.** The Penthera CLI from the checkout under test runs as a child
   process with `HOME` set to an empty temporary folder (no memory store, no
   user config) and `scripts/ci/net-guard.cjs` preloaded, which fails and
   logs any connection or DNS query past loopback. The count must be zero
   and is reported.
4. **Score** against the answer key and the app's `labels.json` (§ 8).
5. **Tear down** containers and networks, also on failure.

`bench/known-vuln/run.mjs` does all of this (`npm run bench:known`). It is
never part of `npm test` and not in the npm package. A manual GitHub
workflow (`bench-known-vuln.yml`) runs it on a GitHub runner and uploads the
results as an artifact.

**Frozen scanner.** The registered run measures one Penthera release
(version and npm tarball integrity recorded) with only its bundled rules.
No rule is changed because of anything seen in these apps until the
results are published; fixes ship later and are measured on a fresh run.

## 8. Labelling and analysis

### 8.1 Precision

Every non-info finding is a unit; identical title at an identical location
counts once. Units matching an in-scope entry are correct. All other units
are labelled by **two labellers**, independently, into each app's
`labels.json` keyed by a stable fingerprint:

- **Blinding.** Labellers see the finding's claim and location, the app
  and its source, and the answer key, but not each other's labels, and not
  Penthera's severity or confidence label. Full blinding to the claim is
  impossible here (the claim is what is judged); this is a known limit.
- **Codebook.** A written decision rule with a worked positive and negative
  example per class, frozen before calibration. The pilot's provisional
  rules (stored in each `labels.json`) are its starting point.
- **Calibration and agreement.** Both labellers label a calibration set of
  30 units drawn from apps scanned for calibration only (to be chosen; Juice
  Shop's test-fixture secrets are a candidate). Main labelling starts only
  when Cohen's κ ≥ 0.70 on level 1; otherwise the codebook is revised and a
  fresh set is drawn, at most three rounds, as in E1 § 6.2. κ with a 95%
  interval, raw agreement and prevalence are reported on the full set.
- **Adjudication.** Disagreements are discussed against the codebook after
  both finish; a third person decides deadlocks. Every adjudication is
  logged; κ uses the original labels.

Reported per app, per class and pooled: precision (correct / labelled) with
a Wilson 95% interval; **strict precision** (answer-key matches / all
units), a lower bound needing no labels; level-2 actionable precision; and
the count of unlabelled units, which must be zero in the registered result.

### 8.2 Recall

Recall = in-scope root causes with at least one matching finding / in-scope
root causes applicable to the run, with a Wilson 95% interval, per app, per
class and pooled. Root causes, not documented items, are the unit, so an app
that documents one SQL injection as three challenges does not count it
three times.

### 8.3 Sample size, stated honestly

The answer keys fix the recall denominator at 32 (standard), 37 (deep) and
68 (with a session) root causes over six apps. At p = 0.5 the Wilson 95%
interval for n = 37 is about ±0.16, so H2 can only be supported if recall is
well above 0.5. The precision denominator depends on Penthera's output and
is not known in advance. These intervals are wide; E10 is a check on the
self-written labs, not a precise accuracy estimate (that is E1).

### 8.4 Software

All computation is in `bench/known-vuln/` (Node.js, no statistics
dependencies). The results record the Penthera version and commit, Node and
Docker versions, the image digests the containers actually ran, and the
answer-key commits.

## 9. Threats to validity

- **Unrepresentative code.** These apps are written to be vulnerable,
  densely and often in ways real code is not. Recall here does not transfer
  to real applications; precision may not either. E1 measures real code.
- **Well known.** The apps, their challenges and their solutions are public
  and old. Scanner rules (Penthera's, or the community templates it can
  load) may have been written with them in mind, which would inflate
  recall. Penthera's bundled rules were not tuned on them, but nobody can
  rule out indirect influence; the pilot and the registered run use only
  bundled rules.
- **Answer keys written by us.** The mapping from each app's documentation
  to in-scope entries is ours, made by one author with AI assistance. A
  generous scope inflates the denominator (lower recall); a narrow scope
  inflates recall. The keys are frozen before scanning, published, and
  checked by labeller A before registration; every exclusion has a code.
- **Coverage of the keys.** Answer keys list what the authors documented,
  not every flaw. Correct findings outside the key are credited through
  labels (precision), never through recall.
- **Single-page apps.** Juice Shop answers every unknown path with its
  index page. Findings about paths that do not exist are false positives
  and are labelled so; the effect is large in the pilot and is a real
  property of the scanner, not of the method.
- **Unauthenticated runs.** Most documented items sit behind a login. A
  study without a logged-in run measures a scanner used without
  credentials, which is the default but not the only way Penthera is used.
- **Language coverage.** Penthera's repo route analysis reads JS/TS only.
  For DVWA (PHP), WebGoat (Java) and crAPI (Java, Go, Python) the repo half
  contributes secrets and runtime pins only. This is reported per app.
- **Version drift.** Moving database tags and crAPI's missing release tags
  mean a later run may use other images; the digests actually run are
  recorded.

## 10. Safety

- **Local only.** Every app runs on an internal Docker network with no
  route out, reachable only through a relay bound to `127.0.0.1`. Nothing
  is ever exposed on another interface or the internet.
- **No third-party systems.** Penthera runs with `--offline` under a guard
  that fails any connection or DNS query past loopback; the count is
  reported and must be zero. Payloads (in `deep`) go only to the local
  container. SSRF probes ask the container to fetch metadata or loopback
  addresses; with no route out, they reach nothing.
- **Containment.** Containers run with `no-new-privileges`, a memory limit
  and a process limit, and are removed after each app. App source is cloned
  to a cache, read and never executed on the host.
- **Recorded probes.** The runs, their flags and the probes Penthera
  reports as executed are in the results, so a reader knows exactly which
  requests were attack payloads.
- **Disclosure.** These apps are vulnerable by design; their flaws are not
  reported to anyone. A flaw found in Penthera, or in shared infrastructure
  (a base image), is handled through the normal channel in `SECURITY.md`.

## 11. Deviations and amendments

As in E1 § 10: changes after registration are dated amendments made before
the data they affect; changes made after are reported as deviations with
the planned and actual analysis side by side; other analyses are labelled
exploratory; results are published whatever they show.

## 12. Pilot (not the registered result)

A pilot on Juice Shop and DVNA ran on 2026-10-22, after their answer keys
were frozen, with both runs (standard and deep, no session). Results are in
[`bench/known-vuln/RESULTS.md`](../../../bench/known-vuln/RESULTS.md), headed
as a pilot. Its labels are one provisional, AI-assisted labeller's, who was
not blinded. They are a pipeline check, not evidence for H1 to H3.

What the pilot changed, before registration:

1. **Matching.** Class-plus-location matching credited unrelated findings
   (any header finding for DVNA's documented `X-Powered-By`; an nginx
   end-of-life finding for Juice Shop's documented `mongo` image in the same
   compose file). Fixed by matching each entry only on its own surface and
   by tool-neutral `keywords` on shared locations (§ 5.3). Which items are
   listed and in scope did not change.
2. **Finding locations.** Repo findings carry their file in `url`; the
   scorer reads it there (before, 52 distinct secret findings collapsed
   into 2).
3. **Level 2.** Juice Shop's test suites hold the demo accounts' passwords.
   They are correct but not actionable; the actionable column was added so
   this shows.

## 13. Open decisions for the maintainer

1. Which apps are in the registered set (all six, or the four with a
   scripted start).
2. Whether to add a logged-in run, and how its session is obtained (most
   documented items need one).
3. Whether `penthera deps` joins the run, which would bring dependency
   typosquats (Juice Shop) into scope.
4. Whether test and spec files count as precision units, or are reported
   separately.
5. Whether the pilot numbers are published on the site, or stay in the
   repository as a pilot.
6. Adding E10 to `vision-2.0.md`.

## Amendments

None yet (draft).
