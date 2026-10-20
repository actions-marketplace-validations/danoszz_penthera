# Methodology

> **Pro.** For "how does it decide, and what can't it see?"

## Abstract

Penthera is an open-source, offline security scanner for web applications,
their dependencies, and the AI tooling used to build them. This document
specifies its method. It states the threat model, separates what black-box
(HTTP) and white-box (repository) analysis can and cannot observe, and defines
a four-level confidence model that distinguishes deterministic evidence from
heuristic signals. It describes the false-positive controls built into each
probe (randomized canaries, context-aware payload selection, baseline
comparison, and repeated timing measurement) and the non-destructive defaults
that follow from fail-safe design. Detection rules are distributed only in
reviewed, versioned releases, never through a live feed, which removes an
update channel from the attack surface. Each design choice is tied to prior
research or a published standard. On a bundled benchmark of labeled local
targets, Penthera reaches a precision of 0.86 (95% CI 0.67 to 0.95) and a recall
of 0.90 (95% CI 0.71 to 0.97) on 22 scored findings. Because the same authors
wrote the scanner and the targets, these figures measure
regressions, not accuracy on arbitrary applications.

## How to cite

If you use Penthera or this methodology in research or a report, cite the
software. The metadata are in [CITATION.cff](../CITATION.cff), which GitHub
renders as "Cite this repository".

```text
van der Zwaag, D. (2026). Penthera: An offline security scanner for web apps and AI-built code (Version 1.7.0) [Computer software]. https://github.com/danoszz/penthera
```

```bibtex
@software{vanderzwaag2026penthera,
  author  = {van der Zwaag, Daan},
  title   = {Penthera: An Offline Security Scanner for Web Apps and {AI}-Built Code},
  year    = {2026},
  version = {1.7.0},
  license = {MIT},
  url     = {https://github.com/danoszz/penthera}
}
```

Citations in this document follow APA 7th edition. Each one resolves to an
entry in [references.md](references.md), generated from
[references.bib](references.bib); a test fails if a citation has no entry or an
entry is never cited. Measured accuracy is in
[bench/RESULTS.md](../bench/RESULTS.md), and the method behind those numbers is
in [bench/README.md](../bench/README.md).

## Contents

- [Threat model](#threat-model)
- [Black-box and white-box: what each can find](#black-box-and-white-box-what-each-can-find)
- [Confidence model](#confidence-model)
- [False-positive controls](#false-positive-controls)
- [Non-destructive by default](#non-destructive-by-default)
- [Offline and no telemetry](#offline-and-no-telemetry)
- [How new attack techniques are adopted](#how-new-attack-techniques-are-adopted)
- [Citations in reports](#citations-in-reports)
- [Known limitations](#known-limitations)

## Threat model

Penthera is built for small teams that ship web apps and APIs, often with AI
coding tools, and need a first line of evidence before a human review or a paid
penetration test. The threat model follows the four questions of Shostack
(2014): what are we building, what can go wrong, what are we going to do about
it, and did we do a good job.

**Assets.** User data behind the API; credentials and API keys, including AI
provider keys; the session and identity layer; and the integrity of the code and
dependencies that get deployed.

**Adversaries in scope.**

1. A remote, unauthenticated attacker on the internet who can send arbitrary
   HTTP requests to the deployed app. The black-box scan models this attacker.
2. An authenticated user who tries to reach another user's data. Broken object
   level authorization is the first item in the OWASP API Security Top 10
   (OWASP Foundation, 2023). Penthera tests for it when given credentials.
3. Anyone who obtains a copy of the source: a leaked repository, a public fork,
   or a compromised CI log. Meli et al. (2019) found secrets leaked in over
   100,000 public GitHub repositories, with thousands of new, unique secrets
   leaked every day. The white-box secret scan models this adversary.
4. A supply-chain attacker who publishes or compromises a dependency (Ladisa et
   al., 2023; Ohm et al., 2020; Zimmermann et al., 2019), including packages
   that code-generating models invent and attackers then register (Spracklen
   et al., 2025).

**Out of scope.** Physical access, insiders with production access, denial of
service, social engineering, and anything that needs exploitation beyond a
single benign probe. Penthera does not try to replace a human tester. It tries
to find the issues a scanner can find reliably, and to say clearly which ones
it cannot judge.

**Penthera itself is in the threat model.** A security tool runs with the
user's credentials and network position, so a compromised scanner is a
compromised machine. Thompson (1984) showed that you cannot fully trust code you
did not build yourself; the argument applies to scanners and their rule feeds.
This is why Penthera fetches no rules at run time
([below](#how-new-attack-techniques-are-adopted)).

STRIDE, the threat taxonomy that Shostack's book builds on, originates at
Microsoft (Kohnfelder & Garg, 1999). Penthera's probes map onto it as follows:

| STRIDE category | Penthera coverage |
|---|---|
| Spoofing | Authentication, JWT, OAuth, email SPF and DMARC |
| Tampering | Injection, CORS |
| Repudiation | Not tested |
| Information disclosure | Exposed files, secrets, verbose errors |
| Denial of service | Not tested; only rate limiting is checked |
| Elevation of privilege | IDOR/BOLA, client-side-only authorization |

## Black-box and white-box: what each can find

Penthera runs two kinds of analysis and reports them together.

### Black-box (URL scan)

The scanner sees only HTTP responses. Its tests are those of the OWASP Web
Security Testing Guide (OWASP Foundation, n.d.-b); each probe's WSTG IDs are
listed in [owasp-wstg-coverage.md](owasp-wstg-coverage.md).

Black-box testing finds three kinds of issue well: properties visible in every
response (missing security headers, TLS configuration, cookie flags, CORS
policy), files and interfaces that should not be public, and injection flaws
whose effect shows in the response or its timing. Protocol checks follow the
relevant specifications: HSTS (Hodges et al., 2012), JWT (Jones et al., 2015;
Sheffer et al., 2020), and OAuth redirect and PKCE handling (Fett et al., 2016;
Lodderstedt et al., 2025; Sakimura et al., 2015).

Two classic evaluations of black-box scanners show what this approach misses.
Bau et al. (2010) tested eight commercial scanners against a custom vulnerable
application and older versions of real ones. As a group the tools did
reasonably well, but many of them missed second-order flaws such as stored XSS
and stored SQL injection. Doupé et al. (2010) tested eleven commercial and
open-source scanners against WackoPicko, a realistic purpose-built app with
sixteen planted flaws. Every scanner missed eight of the sixteen, among them
stored SQL injection, multi-step stored XSS, forceful browsing, and a business
logic flaw. They concluded that crawling matters as much as detection: a
scanner cannot test a page it never reaches, and losing track of state (logins,
multi-step forms) is a main reason it does not reach it.

Penthera's design responds to each point:

- **Crawl coverage.** Endpoint discovery uses a wordlist plus the app's own
  OpenAPI document when one is exposed, and records exactly which probes ran.
  The WSTG coverage table in every report lists each test as run or not run, so
  a missing check is never presented as a pass.
- **State and logic.** Penthera does not claim to find business logic flaws,
  which no scanner in the study by Doupé et al. (2010) found either. IDOR/BOLA
  results are labeled `needs-human-review` because a scanner cannot know
  whether user A is allowed to read object B.
- **Stored and second-order flaws.** Not tested. They need a write followed by
  a read elsewhere, which conflicts with the non-destructive default.

### White-box (repository scan)

The scanner reads source files. It finds hardcoded secrets, route handlers and
their authentication boundaries, and risky code patterns.

Secret detection uses provider-specific prefixes (for example `AKIA` for AWS
and `sk-ant-` for Anthropic) plus a small number of assignment patterns such as
`api_key = "..."` with a placeholder filter. Meli et al. (2019) took the same
conservative route and restricted detection to private keys and API keys with
distinctive formats. The cost is recall: a secret with no recognizable format
is invisible to this approach. SecretBench, a labeled dataset of real secrets
across many formats, is the natural yardstick for that gap (Basak et al.,
2023). The bundled benchmark includes an unprefixed signing key that Penthera
misses for this reason.

White-box scanning cannot see runtime configuration (headers added by a CDN, a
WAF in front of the app), secrets injected at deploy time, or anything in
dependencies that is only known from a vulnerability database.

### Combining them

Running both against the same app catches cases neither sees alone: a route
the repository marks as public that the black-box scan confirms is reachable,
or a header the code sets that the edge strips. The report keeps the origin of
each finding (`source`, `method`) so a reader can tell which side produced it.

## Confidence model

Severity says how bad a finding would be if real. Confidence says how likely it
is to be real. Penthera reports both and never lets a heuristic look like a
fact. The labels are defined in [lib/provenance.js](../lib/provenance.js):

| Label | Meaning | Typical sources |
|---|---|---|
| `confirmed` | Deterministic evidence. The header is absent, the certificate expired, the key matches a provider format. | Header audit, TLS check, cookie audit, secret scan, OpenAPI exposure |
| `likely` | A strong signal with a small false-positive chance. | Injection probes with a verified canary, auth and JWT probes, framework checks |
| `potential` | A heuristic or one-shot signal that needs corroboration. | Fuzzer, adaptive probes |
| `needs-human-review` | Exploitability cannot be judged from outside. | IDOR/BOLA, client-side-only auth |

Every finding also carries `source`, `method`, and `collected_at`. These travel
into SARIF, so the label survives into GitHub code scanning.

The benchmark reports precision per confidence label, which tests whether the
labels mean what they say. On the current run, all `likely` and
`needs-human-review` findings were true positives and the one `potential`
finding was a false positive. The two `confirmed` false positives are cases
where the evidence is real but the judgment is wrong: a health endpoint that
is public by design, and AWS's published example key. See
[bench/RESULTS.md](../bench/RESULTS.md).

## False-positive controls

A black-box scanner loses trust through false positives faster than through
misses. The probes apply these controls:

- **Randomized canaries.** The SSTI probe multiplies two random four-digit
  numbers and looks for the seven- or eight-digit product, and only when
  neither the raw payload nor the literal expression appears in the response
  ([lib/injections.js](../lib/injections.js), `buildSstiProbes`). The common
  fixed canary `7*7 = 49` fires on any page that happens to contain "49". XSS
  probes use a random reflection marker per probe (`makeCanary`).
- **Context before payload.** The XSS probe first checks where its marker is
  reflected (HTML body, attribute, or script), sends only payloads that would
  execute in that context, and then checks that they came back unencoded.
  Context-aware tools such as Dalfox take the same approach.
- **Baseline comparison.** Error-based SQL injection is reported only when the
  database error appears in the injected response and not in the baseline.
- **Timing re-sampling.** A single slow response proves nothing: garbage
  collection, cold starts, and network jitter all look like an injected sleep.
  Time-based SQL and command injection candidates are re-sent and reported only
  when the median delay holds (`confirmTimingDelay`). Crosby et al. (2009)
  showed that network jitter dominates single remote timing measurements and
  that filtering over many samples is what makes them usable, building on the
  original timing attacks of Kocher (1996). Penthera's injected delays are
  seconds, not microseconds, so a median of three samples is enough.
- **Host-checked redirects.** An open redirect is reported only when the
  `Location` header resolves to the attacker host, not when the payload merely
  appears in the query string of a same-site redirect.
- **Context-aware suppression.** On localhost and private hosts, findings that
  do not apply there (no HTTPS, missing `Secure` on cookies) are suppressed.

The benchmark's decoy target exercises each control with an endpoint built to
fool a naive scanner. Writing it exposed one real flaw in the decoy itself: a
"safe" redirect that accepted `/\evil.com`, which browsers treat as
`//evil.com`. Penthera reported it correctly.

## Non-destructive by default

The `quick` and `standard` profiles send only requests a normal browser or API
client would send: `GET`, `OPTIONS`, and invalid login attempts. They do not
send attack payloads, create or modify data, or exploit anything they find.

Payload-based testing (`--deep`, `--fuzz`, `--adaptive`, or `--profile deep`)
is opt-in and gated behind a confirmation prompt. Even then, each probe sends a
benign marker (a random string, an arithmetic expression, a short sleep, `id`)
rather than a working exploit, and stops at the first confirmation per
endpoint. The adaptive engine may send unexpected HTTP methods, including
`DELETE`, to routes with placeholder IDs, so it is never part of a default run.

This follows the principles of fail-safe defaults and least privilege set out by
Saltzer and Schroeder (1975): the default does the least that is still useful,
and anything riskier needs an explicit decision. NIST SP 800-115 draws the same
line between non-intrusive assessment and penetration testing, and recommends
written rules of engagement before the latter (Scarfone et al., 2008).

## Offline and no telemetry

Penthera does not phone home. It sends no usage data, analytics, or crash
reports, and it has no accounts. Reports are written to local files.

Network traffic goes to the target you name, with the exceptions below. The
full list of hosts is in [privacy.md](privacy.md):

1. `--recon` (and the `deep` profile) queries public OSINT sources (crt.sh, the
   Wayback Machine, AlienVault OTX) with the target domain. It is skipped for
   localhost.
2. The Retire.js check downloads the public Retire.js vulnerability database
   from GitHub and compares JavaScript library versions locally. Outdated
   client-side libraries are common on the web and often carry known
   vulnerabilities (Lauinger et al., 2017). The database is data, not code: it
   is parsed as JSON and never executed. It is the one place a detection input
   arrives at run time. Under `--offline`, and whenever the download fails,
   Penthera uses the snapshot vendored in the release instead. When a script's
   version can only be read from its contents, the check also fetches that
   public script from its CDN (not under `--offline`).

The benchmark enforces offline operation mechanically. It wraps `fetch` so any
request to a non-loopback host is refused and counted, and it fails if the
count is not zero.

These choices follow the principles of economy of mechanism and complete
mediation (Saltzer & Schroeder, 1975): fewer network paths mean fewer things to
audit, and a tool that talks only to its target is easy to reason about in a
regulated environment.

## How new attack techniques are adopted

Attack techniques change quickly. Recent examples include indirect prompt
injection against LLM-integrated applications (Greshake et al., 2023; Liu et
al., 2023; Perez & Ribeiro, 2022), package hallucination and slopsquatting
(Spracklen et al., 2025), and attacks on agent tooling and MCP servers,
catalogued by OWASP (OWASP Foundation, 2024, 2025a, 2025b) and in MITRE ATLAS
(The MITRE Corporation, n.d.-b). A scanner that does not keep up gives a false
sense of security.

Penthera keeps up through reviewed releases, not live updates:

- **Rules ship as code in a release.** New probes, patterns, and templates are
  added by pull request, reviewed, tested against the benchmark, and published
  in a versioned release with a CHANGELOG entry. There is no rule server, no
  background update, and no command that fetches rules from the internet.
- **Detection data ships as signed rule packs.** Patterns and IOC lists that
  are data rather than logic (key formats, malicious package versions, exfil
  hosts) live in versioned packs under `lib/rules/`. Each pack is signed with
  the maintainer's SSH key, which never enters CI. Every file is hash-pinned,
  and every regex must pass a ReDoS guard before it loads. The publish workflow
  refuses to stage a release with an unsigned bundled pack. You can add your
  own packs by path (`--rules <dir>`), never by URL. See
  [rule-packs.md](./rule-packs.md).
- **Every new rule carries a source and a date.** A rule added after v1.2.0
  records where the technique comes from (a paper, an advisory, an OWASP or
  ATLAS entry, an incident write-up) and the date it was added. Finding
  categories are already linked to their sources in
  [lib/references.json](../lib/references.json); the built-in rules that
  predate this policy are being backfilled.
- **Every new rule comes with a benchmark case.** A detection rule is added
  together with a labeled true positive and, where a false positive is
  plausible, a decoy in [bench/](../bench/). The CI floor in the benchmark
  stops a rule that adds false positives.
- **Your own templates stay local.** `--nuclei <path>` and `--templates <dirs>`
  load YAML templates from directories you choose. Penthera does not download
  them.

Why not update automatically? A rule feed is a code path from someone else's
server into a tool that runs with your network access and often your
credentials. Supply-chain research shows that update channels and package
registries are exactly where attackers insert themselves (Ladisa et al., 2023;
Ohm et al., 2020; Zimmermann et al., 2019), and that securing an update channel
needs signed metadata, key rotation, and explicit trust delegation (Samuel et
al., 2010; Torres-Arias et al., 2019). Shipping rules inside the signed,
versioned package reuses the trust you already place in the release, and gives
a clear audit trail: the rules you ran are the rules in the version you
installed.

## Citations in reports

Each finding category maps to one to three references in
[lib/references.json](../lib/references.json), chosen to explain why the
finding matters. Besides the sources discussed above, these include the
empirical work behind specific header and policy checks: Content Security
Policy (Weichselbaum et al., 2016), cookie handling and cross-site request
forgery (Barth et al., 2008), and CORS misconfiguration
(Chen et al., 2018). Email authentication findings cite the SPF and DMARC
specifications (Kitterman, 2014; Kucherawy & Zwicky, 2015). Injection,
exposure, and configuration findings cite the OWASP Top 10 (OWASP Foundation,
2021, 2025c), code-pattern findings cite the Common Weakness Enumeration (The
MITRE Corporation, n.d.-a), and license findings use the identifiers of the
SPDX License List (SPDX Workgroup, The Linux Foundation, n.d.).

The references appear in two places:

- in the Markdown report, as a "Why this matters / Sources" line under each
  finding and a "Sources" line under each action-plan item;
- in SARIF (Fanning & Golding, 2023), as the rule's `helpUri` (first source)
  and `help` text (all sources), and as `properties.references` (the BibTeX
  keys).

[references.md](references.md) and the `sources` block of `references.json`
are generated from [references.bib](references.bib) by
`node scripts/build-references.mjs`, and a test fails if they drift.

## Known limitations

This section states what Penthera cannot do and how far its evidence reaches.
It is meant to be read before relying on any result. Challenges and additions
are welcome (see [MANIFESTO.md](MANIFESTO.md)).

### What the scanners cannot see

- **URL scanning.**
  - No authenticated crawling beyond the bearer token or cookie you pass, so
    pages behind multi-step flows are not reached (Doupé et al., 2010).
  - No stored or second-order injection testing (Bau et al., 2010).
  - No DOM-based XSS analysis, because Penthera does not run JavaScript (Lekies et
    al., 2013; Stock et al., 2014).
- **Logic and authorization.** No business logic testing. IDOR/BOLA findings are
  heuristics that need a human to confirm them.
- **Secrets.** Detection is pattern-based and skips Markdown and other
  documentation files, so unprefixed secrets and secrets in notes are missed.
- **Dependencies (`deps`, `install`).**
  - Analysis is static. Behavior that is only decided at run time (code
    fetched or decrypted on execution, heavily obfuscated or minified bundles,
    logic inside native binaries) can be reported as a capability or as
    "unscanned", but not understood.
  - A package that hides its intent well can look ordinary.
  - The typosquat list and the vendored data are snapshots and age between
    releases.
- **AI tooling (`agents`).**
  - Rules recognize known patterns of hidden content and risky configuration.
  - A new phrasing of a prompt injection, or a malicious skill that behaves
    normally until a later update, can pass.
  - `penthera.lock` detects changes after you pin, not malice present before.
- **Fix loop.**
  - A fix counts as verified when the finding disappears and the project's own
    tests pass. Weak or missing tests mean weak verification.
  - Built-in recipes cover a handful of frameworks and finding types.
- **Live AI features.** LLM endpoint checks (rate limits on chat endpoints,
  exposed model servers) are not yet available.

### How far the evidence reaches

- **Small sample.** The bundled benchmark scores 22 findings. Precision 0.86 and
  recall 0.90 come with wide 95% Wilson intervals (0.67 to 0.95 and 0.71 to 0.97), so
  small changes in either are not meaningful.
- **Built by the same team.** The benchmark targets, their labels, and the
  scanner were written by the same people, so the numbers measure regressions
  and the false-positive controls, not accuracy on arbitrary applications.
  Independent benchmarks such as the OWASP Benchmark (OWASP Foundation, n.d.-a)
  and the benchmarking approach of Antunes and Vieira (2010, 2015) are the model
  for a fairer comparison.
- **Possible overfitting.** Probes were tuned while looking at these targets, so
  they may perform better here than elsewhere.
- **Single labeler.** Ground truth was labeled without a second, independent
  labeler, so label errors are not measured.
- **Recall is only partly known.** Recall counts misses of issues we planted. On
  real code, the full set of issues is unknown.
- **No head-to-head comparison** with other tools under the same conditions has
  been run.
- **Confidence labels are not calibrated.** The labels (confirmed, likely,
  potential, needs human review) are expert judgment about each probe's
  method, not measured probabilities. Severity mappings are judgment too.
- **References support the design, not the outcome.** The literature cited here
  explains why each choice was made. It does not show that Penthera's
  implementation achieves what the cited work describes. Some incident
  descriptions in the docs rely on vendor and industry reports that were not
  independently verified.
- Measuring real-world accuracy with an independent, pre-registered study is the
  first goal of the [research plan](vision-2.0.md#research-program) (experiment E1).

### Reproducibility

- Timing-based probes depend on network and machine load. Results can vary
  between runs, and the confirmation rules trade some sensitivity for stability.
- Benchmark runs are seeded, but live scans of real applications are not
  deterministic, because the applications are not.
- The full test suite can be flaky on a heavily loaded machine. CI runs it on
  clean runners.

### How it is built

- Most of the code (107 of 117 non-merge commits up to v1.7.0) was written with
  generative AI under the maintainer's direction ([details](genai.md)).
- Generated code passes the same tests, static analysis, and release gates.
  But it has had less line-by-line human scrutiny than hand-written code would.
  An independent review on 2026-10-19 found and fixed three high-severity bugs,
  and no external security audit has been done yet.

### Compliance output

Compliance output for the NIS2 Directive (European Parliament and Council of the
European Union, 2022) and the Cyber Resilience Act is evidence toward a duty of
care, not a certification and not legal advice.
