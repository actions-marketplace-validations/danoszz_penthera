# E11 results: Penthera on public benchmarks

> **Project page.** For researchers asking "what did E11 measure, and how sure are the numbers?"

The protocol is pre-registered in
[E11-public-benchmarks.md](../../docs/research/prereg/E11-public-benchmarks.md),
committed before any of these runs. Every number below comes from
`npm run bench:public` on 2026-10-24 (Node.js 26.0.0, macOS). Intervals are
Wilson 95%. The network guard counted 0 blocked connections in every scan
step.

Scanner: the detection code of `58ae9d7` (version 1.9.0). The runs were made
from this branch, whose commits add only the protocol and the runner; no rule
was changed.

## In this file (added 29 Oct 2026)

This file holds three studies on the same three public datasets. Each
section keeps its own date, scanner and commit; read the newest first for
the current numbers, and E11 for the registered baseline.

| Study | Section | Scanner | Data | Headline |
|---|---|---|---|---|
| E11, registered baseline | [Summary](#summary) and §§ 1 to 3 | 1.9.0, `58ae9d7` | All data, 24 Oct 2026 | None of five hypotheses supported |
| E14 step 2, registered | [E14 step 2](#e14-step-2-the-sealed-test-half-scored-once-2026-10-28) | 2.1.0-rc.2, `efbe8c8` | Test half, 28 Oct 2026 | The union finds more but costs more than 0.02 precision; Penthera-first stays the default |
| E14 step 1 | [E14 step 1](#e14-step-1-the-dev-half-2026-10-27-not-the-registered-test) | 2.1.0-rc.1, `1f70835` | Dev half, 27 Oct 2026 | Not a result: builds and checks the merge |
| E11b final | [E11b final](#e11b-final-the-sealed-test-half-scored-once-2026-10-25) | 2.0.0, `219b73a` | Test half, 25 Oct 2026 | The tuned rules against 1.9.0 and the free tools |
| E11b dev baseline | [E11b dev baseline](#e11b-dev-baseline-dev-half-only-the-test-half-is-sealed) | 1.9.0 | Dev half, 24 Oct 2026 | The reference for tuning |

The datasets are CredData ([Yun et al., 2021](../../docs/references.md#yun2021creddata)),
SecBench.js ([Bhuiyan et al., 2023](../../docs/references.md#bhuiyan2023secbenchjs))
and DataDog's malicious packages
([Datadog Security Labs, 2023](../../docs/references.md#datadog2023malicious)).
Intervals are Wilson's ([Wilson, 1927](../../docs/references.md#wilson1927probable));
the malware ranking score is Youden's J ([Youden, 1950](../../docs/references.md#youden1950index));
paired differences use the bootstrap ([Efron, 1979](../../docs/references.md#efron1979bootstrap))
and McNemar's test ([McNemar, 1947](../../docs/references.md#mcnemar1947note)).
How to repeat each run, and what is not shared, is at the
[end of this file](#reproduce-licenses-and-what-is-not-shared-added-29-oct-2026).

## Summary

| | Hypothesis | Estimate | Verdict |
|---|---|---|---|
| H1 | Secret precision above 0.70 | 0.58 [0.55, 0.60], n = 2,099 labelled hit lines | Not supported |
| H2 | Secret recall above 0.50 in scope | 0.27 [0.26, 0.29], n = 4,459 true credentials | Not supported |
| H3 | SecBench.js recall at the sink above 0.50 | 0.13 [0.08, 0.20], n = 129 | Not supported |
| H4 | Malware flagged above 0.70, each ecosystem | npm 0.44 [0.39, 0.50], n = 300; PyPI 0.80 [0.75, 0.84], n = 299 | Not supported (npm fails; PyPI alone would pass) |
| H5 | Benign flagged below 0.10, each ecosystem | npm 0.00 [0.00, 0.01], n = 300; PyPI 0.08 [0.06, 0.12], n = 300 | Not supported (PyPI's upper bound is 0.12; npm alone would pass) |

![Dot plot of the seven E11 estimates with 95% intervals against their registered thresholds. Only PyPI malware detection (0.80, threshold above 0.70) and npm benign flags (0.00, threshold below 0.10) clear their thresholds; every other estimate fails, so no hypothesis holds as stated.](figures/e11-hypotheses.svg)

*Figure 1 (added 29 Oct 2026). The table above as a picture: each estimate
with its Wilson 95% interval, against the threshold registered in E11 § 1
(dashed). Blue circles pass, orange squares fail. n as in the table. Data:
this table, run 24 Oct 2026. Script: `node bench/public/figures.mjs`.*

The short version:

- **Secrets.** On the files it reads, Penthera finds about half the true
  credentials it has a rule for (0.52 [0.50, 0.54]). It does not read `.txt`,
  `.md`, `.pem`, `.key`, `.php` or `.cs` files, which hold 47% of them. A
  little over half of its hits on labelled lines are real.
- **Code sinks.** It found no SecBench.js command injection (0 of 96) and
  about half of the code injections (17 of 33). Its sink check is built for
  request handlers, not library functions.
- **Malware.** The primary rule flags 80% of malicious PyPI packages and 44%
  of malicious npm packages, mostly through risky install scripts. It flags
  none of 300 popular npm packages and 8% of 300 popular PyPI packages, again
  mostly through install scripts (`setup.py` custom commands).

## 1. Secrets on Samsung CredData

Dataset: CredData `c49ed106`, materialised with its own `download_data.py`
(Python 3.12): 337 repository folders, 11,565 files, 67,896 labelled lines
(15,753 `T`, 48,061 `F`, 4,082 `X`). Every labelled file downloaded.

| Run | Precision, labelled hit lines | Strict precision, all hit lines | Recall, in scope | Recall, in scope, files the scan reads |
|---|---|---|---|---|
| **Primary**: rules on the files the repo scan reads | **0.58 [0.55, 0.60]** (1,209/2,099) | 0.54 [0.52, 0.56] (1,209/2,224) | **0.27 [0.26, 0.29]** (1,212/4,459) | 0.52 [0.50, 0.54] (1,212/2,347) |
| Rules on every file, whatever the extension | 0.63 [0.61, 0.64] (2,032/3,242) | 0.60 [0.58, 0.61] (2,032/3,401) | 0.45 [0.44, 0.47] (2,028/4,459) | 0.52 [0.50, 0.54] |
| As the CLI reports it (`penthera --repo`) | 0.59 [0.56, 0.63] (502/845) | 0.58 [0.54, 0.61] (502/869) | 0.11 [0.10, 0.12] (491/4,459) | 0.21 [0.19, 0.23] |

The CLI keeps the first hit per rule per file, so it reports fewer lines.
That is a reporting choice; a user still sees each file with a secret.

### Recall by family (primary run)

| Family | In scope | True rows | Recall |
|---|---|---:|---|
| `provider` (AWS, GitHub, Google API key, Stripe, AI providers) | yes | 266 | 0.48 [0.42, 0.54] (127) |
| `private-key` (PEM) | yes | 1,193 | 0.11 [0.09, 0.13] (132) |
| `password` | yes | 2,778 | 0.33 [0.32, 0.35] (929) |
| `api-key` | yes | 222 | 0.11 [0.07, 0.16] (24) |
| `partial` (`Key`, `Secret` names Penthera partly covers) | no | 5,478 | 0.01 [0.00, 0.01] (32) |
| `out` (no Penthera rule) | no | 5,816 | 0.01 [0.00, 0.01] (34) |

Out of scope, with no Penthera rule, by true rows: `UUID` 2,524, `Auth`
1,125, `Token` 1,034, `Basic Authorization` 692, `Bearer Authorization` 289,
`URL Credentials` 217, `JSON Web Token` 180, `Nonce` 177, `NTLM Token` 126,
`AWS S3 Bucket` 92, `Salt` 88, `JWK` 78, `PASERK Keys` 72, `PASETO Token` 63,
`NKEY Seed` 58, `SQL Password` 40, `BASE64 Private Key` 30, and smaller ones.
These are not counted as misses.

### Recall by file extension (primary run, in scope)

| Extension | Read by the scan | Recall |
|---|---|---|
| `.txt` | no | 0.00 (0/814) |
| `.go` | yes | 0.64 [0.59, 0.67] (350/551) |
| `.py` | yes | 0.37 [0.33, 0.42] (157/423) |
| `.json` | yes | 0.26 [0.21, 0.30] (89/349) |
| `.md` | no | 0.00 (0/295) |
| `.yml` | yes | 0.17 [0.13, 0.22] (50/287) |
| `.js` | yes | 0.82 [0.76, 0.86] (164/201) |
| `.java` | yes | 0.59 [0.52, 0.66] (99/167) |
| `.rb` | yes | 0.71 [0.63, 0.77] (111/157) |
| `.ts` | yes | 0.88 [0.82, 0.92] (137/156) |
| `.key` | no | 0.00 (0/105) |
| `.php` | no | 0.00 (0/86) |
| `.yaml` | yes | 0.26 [0.17, 0.37] (19/73) |
| `.pem` | no | 0.00 (0/67) |
| `.cs` | no | 0.00 (0/57) |

Penthera does well where its rules were written (quoted assignments in
JavaScript, TypeScript, Ruby and Go) and poorly in YAML and JSON, where
values are often unquoted or the key name is not `password`/`api_key`.

### Precision by rule (primary run)

| Rule | Precision, labelled | Strict precision | Hit lines |
|---|---|---|---:|
| Hardcoded password | 0.54 [0.52, 0.56] | 0.51 [0.48, 0.53] | 1,813 |
| Private key block | 0.91 [0.85, 0.95] | 0.86 [0.80, 0.91] | 152 |
| Generic API key assignment | 0.43 [0.34, 0.52] | 0.40 [0.31, 0.48] | 124 |
| AWS access key | 0.87 [0.79, 0.92] | 0.87 [0.79, 0.92] | 102 |
| JWT secret assignment | 0.58 [0.32, 0.81] | 0.58 [0.32, 0.81] | 12 |
| Google API key | 1.00 [0.65, 1.00] | 1.00 [0.65, 1.00] | 7 |
| Hardcoded session secret | 0.17 [0.03, 0.56] | 0.17 [0.03, 0.56] | 6 |
| GCP/Firebase service account | 0.25 [0.05, 0.70] | 0.25 [0.05, 0.70] | 4 |
| Perplexity, Anthropic, OpenAI (legacy) keys | 1.00 (4/4) | 1.00 | 4 |

The password rule drives the overall precision: 1,813 of 2,224 hit lines.
Prefix rules and private keys are above 0.85.

### Limits of this benchmark

- CredData's values are obfuscated. Prefix shapes survive; values are random
  strings of the original character set and length.
- CredData labels test-folder credentials `T` (its ground rule 1). Penthera
  is not penalised for finding them, and is credited for it.
- Hit lines not in CredData's labels (125 of 2,224) are left out of primary
  precision and counted wrong in strict precision.

## 2. Code sinks on SecBench.js

Dataset: SecBench.js `5d362353`. Packages fetched from the npm registry at
the version each folder names, integrity checked, unpacked as files, never
installed or run. Three `package.json` files write the version as `^x.y.z`;
the runner takes the exact version from the folder name, as § 5.2 says.
5 command-injection packages are no longer on the
registry and are excluded.

| Class | Vulnerabilities | Scanned | Strict recall (sink file) | Lenient recall (anywhere) | Capability scan sees it at the sink file |
|---|---:|---:|---|---|---|
| Command injection | 101 | 96 | **0.00 [0.00, 0.04]** (0/96) | 0.00 [0.00, 0.04] (0/96) | 0.90 [0.82, 0.94] (86/96) |
| Code injection | 40 | 40 | **0.52 [0.35, 0.67]** (17/33) | 0.53 [0.37, 0.67] (21/40) | 0.73 [0.56, 0.85] (24/33) |
| **Pooled** | 141 | 136 | **0.13 [0.08, 0.20]** (17/129) | 0.15 [0.10, 0.22] (21/136) | 0.85 [0.78, 0.90] (110/129) |

All 17 strict code-injection hits are at `potential` confidence (eval or
`new Function` with a non-literal argument). Code injection has 7 entries
without a sink location, so its strict denominator is 33; 3 sink files are
not in the published tarball (built or moved files).

Why command injection scores zero: the sink check reports `exec` only when
request data (`req.body`, `req.query`, ...) reaches it. In a library, the
command comes from a function parameter, so the check stays silent by
design. The capability scan (`penthera deps`) does see `child_process` in
the sink file in 86 of 96 packages, but a capability says "can run
programs", not "is injectable", so it is not a detection.

Out of scope and not scanned: path traversal (170), prototype pollution
(192) and ReDoS (97). Penthera has no static rule for them. Its static JS
check claims 141 of SecBench.js's 600 vulnerabilities by class.

Precision is not estimated (§ 6.2). Other non-info findings in the
scanned packages: 8 in total.

## 3. Malicious packages on the DataDog dataset

Dataset: DataDog `21822443`. Seeded sample (mulberry32, seed 20261024),
one archive per package name, drawn from 12,847 npm and 1,816 PyPI
`malicious_intent` names and 1,004 npm and 17 PyPI `compromised_lib` names.
667 archives were downloaded; 1 npm name was skipped for an archive over
50 MB (the next name was taken), and 2 PyPI samples had no package root
(excluded). Benign: 300 npm and 300 PyPI names drawn from Penthera's popular
lists, latest release, hash checked (npm tarballs; PyPI sdists where
published, else a wheel).

Flag rules (§ 4.3). `code-medium` is primary.

| Group | n | code-medium (primary) | code-high | code-any | name (typosquat or IOC list) | any |
|---|---:|---|---|---|---|---|
| Malicious npm, `malicious_intent` | 300 | **0.44 [0.39, 0.50]** (133) | 0.07 [0.04, 0.10] (20) | 0.55 [0.50, 0.61] (166) | 0.01 [0.00, 0.02] (2) | 0.45 [0.39, 0.50] (134) |
| Malicious npm, `compromised_lib` | 50 | 0.84 [0.71, 0.92] (42) | 0.80 [0.67, 0.89] (40) | 0.90 [0.79, 0.96] (45) | 0.48 [0.35, 0.61] (24) | 0.84 [0.71, 0.92] (42) |
| Malicious PyPI, `malicious_intent` | 299 | **0.80 [0.75, 0.84]** (238) | 0.10 [0.07, 0.14] (29) | 0.81 [0.76, 0.85] (242) | 0.08 [0.05, 0.12] (24) | 0.83 [0.78, 0.86] (247) |
| Malicious PyPI, `compromised_lib` | 16 | 0.06 [0.01, 0.28] (1) | 0.06 [0.01, 0.28] (1) | 0.06 [0.01, 0.28] (1) | 0.06 [0.01, 0.28] (1) | 0.13 [0.03, 0.36] (2) |
| **Benign npm** | 300 | **0.00 [0.00, 0.01]** (0) | 0.00 [0.00, 0.01] (0) | 0.01 [0.00, 0.02] (2) | 0.00 [0.00, 0.01] (0) | 0.00 [0.00, 0.01] (0) |
| **Benign PyPI** | 300 | **0.08 [0.06, 0.12]** (25) | 0.02 [0.01, 0.04] (5) | 0.11 [0.08, 0.15] (33) | 0.00 [0.00, 0.01] (0) | 0.08 [0.06, 0.12] (25) |

Counting "could not be scanned" as not flagged changes only benign PyPI, to
0.07 [0.05, 0.11] (22/300).

What fired (packages with each finding kind, any severity):

| Group | Finding kinds |
|---|---|
| Malicious npm, `malicious_intent` | risky install script 126, plain install script 33, obfuscated 18, environment sent next to network code 2, typosquat 2 |
| Malicious npm, `compromised_lib` | obfuscated 33, GitHub token harvesting 32, plain install script 26, IOC in content 25, IOC list (name and version) 24, risky install script 15 |
| Malicious PyPI, `malicious_intent` | risky install script 225, obfuscated 29, typosquat 24, plain install script 4 |
| Malicious PyPI, `compromised_lib` | obfuscated 1, startup hook 1, typosquat 1 |
| Benign npm | plain install script 2 |
| Benign PyPI | risky install script 19, plain install script 8, could not be scanned 3, IOC in content 1, startup hook 1, AI config write and AI CLI 1 |

Reading the numbers:

- **The install script carries the result.** 126 of 133 flagged npm and 225
  of 238 flagged PyPI malicious-intent packages have a risky install script.
  Malware that runs on `require` or `import` without obfuscation or an
  exfiltration shape is mostly missed: 134 of the 167 missed npm packages had
  no finding at all, and 24 of them had no JavaScript file to read (the
  payload, if any, is outside what the scanner reads).
- **Compromised popular packages** on npm are
  caught at 0.84, largely by the token-harvesting, obfuscation and IOC
  rules; 24 of 50 are also on Penthera's IOC list by name, so that part is
  knowledge, not analysis. PyPI's compromised packages (16) are full source
  trees of real libraries with a small injected payload; Penthera flagged 1.
- **PyPI false positives are install scripts.** 19 of the 25 benign PyPI
  flags are `setup.py` custom commands that use the shell or network
  (building native code, fetching data). The others: 3 packages too large
  to read (`mkl`, two NVIDIA wheels; Penthera fails closed), `virtualenv`'s
  `.pth` file, an agent tool that writes AI config (`fno`), and `litellm`
  1.106.3, whose code matched a content IOC from the bundled rule pack. That
  last one is worth a look by the maintainer: either the IOC is too broad, or
  the release references the campaign's indicator for another reason.
- **The `name` rule** adds little on malicious-intent packages (2 of 300 npm,
  24 of 299 PyPI typosquats). It cannot fire on the benign baseline by
  construction (§ 9), so its false-positive rate here means nothing.
- **Base rates.** These are rates per group, not precision. In real
  dependency trees malware is rare, so even 0% to 1% false positives on npm
  and 8% on PyPI translate into a precision this study does not estimate.

Sample list: names, versions, archive paths and SHA-256 hashes are in
`results/malware.json` in the cache after a run; no sample content is kept.

Safety log: archives were downloaded to `/private/tmp/penthera-e11-malware`,
extracted there with `unzip -P infected`, read as text by `scanPackage` and
`scanPythonPackage` in an offline child process (0 blocked connections),
and the folder was deleted at the end of the run (checked: it no longer
exists). Nothing was installed, imported, required or executed.

## Follow-ups (rule ideas, not in this pull request)

Each needs its own pull request, tests, and a fresh run; none was applied
here (frozen scanner, protocol § 5).

1. **Read more file types in the secret scan.** `.txt`, `.md`, `.pem`,
   `.key`, `.php`, `.cs`, `.properties`, `.conf`, `.xml` and `.tfstate` hold
   47% of in-scope true credentials. Reading `.key`, `.pem` and `.p8` alone
   would reach 176 missed private-key rows (105, 67 and 4). Watch
   precision on `.md` (examples and placeholders).
2. **Private-key header variants.** Add `DSA`, `ENCRYPTED` and `PGP PRIVATE
   KEY BLOCK` to the private-key rule; all three were missed in files the
   scan reads.
3. **Unquoted YAML and `.env`-style values for passwords.** Recall is 0.17 in
   `.yml` and 0.26 in `.json`; the rule needs quotes. A YAML-aware variant
   (`password: value`) should be measured for precision first, because the
   password rule is already the main source of false positives.
4. **Tighten the password rule.** 0.54 precision over 1,813 hit lines. The
   `F` rows it hits are worth a codebook pass (function calls, variables,
   localisation files) before adding filters.
5. **AWS keys in presigned URLs.** 54 missed `AWS Client ID` rows in `.json`
   have an `AKIA` key inside a long S3 URL; check whether the encoded-blob
   mask hides them.
6. **Library mode for the sink check.** Treat exported function parameters
   as tainted when scanning a package (or with a flag), so `exec(cmd + arg)`
   in a library is reported at `potential`. Measure the false positives on
   the benign npm sample before shipping.
7. **Static rules for path traversal and prototype pollution** would bring
   362 more SecBench.js vulnerabilities into scope; both are hard to do
   without taint tracking and would need their own pre-registered run.
8. **Python install scripts.** The risky-`setup.py` signal is the main
   PyPI detector and the main PyPI false positive (19 of 300 benign). Split
   it by what the custom command does (download and run, write outside the
   tree, read credentials) versus building native code, and measure both
   sides again.
9. **npm code that runs on load.** 134 missed npm malicious-intent packages
   produced no finding. A rule for top-level code in the `main` file that
   reaches the network or spawns a shell at import time would target them;
   it needs a false-positive check on the benign sample first.
10. **Content IOC on `litellm` 1.106.3.** Check which rule-pack indicator
    matched and whether it should be narrowed.
11. **Compromised PyPI libraries.** 15 of 16 were missed. Diffing against the
    previous clean release (`penthera deps --diff`) is the method that fits
    these; E11 did not test it.

## E14 step 2: the sealed test half, scored once (2026-10-28)

Pre-registration: [E14-giants-combination.md](../../docs/research/prereg/E14-giants-combination.md)
(registered at `1b7823a`; deviations in its § 9, entries 1 to 9). This is the
registered result. The test half was opened once, with
`node bench/public/giants.mjs --split test --final --collect --spot-check 50`,
on 2026-10-28 from commit `8bcdd68` (main `efbe8c8` plus the same-tool check
of § 6, written and committed before the run). Nothing was changed after the
results were seen.

Penthera is **2.1.0-rc.2**: main `efbe8c8`, the commit npm records for the
`penthera@2.1.0-rc.2` tarball. Each other tool ran through E11b's own runner
in `competitors.mjs` (same pins, commands and `sandbox-exec` network deny; a
curl under each profile failed before the run). Per-item outputs: SHA-256
`4d5880e1f513df0b29620bee78fb9bdbc4e85bee6c9a54695d55bf12905cba41`
(local; CredData hits carry hashes of the values, never the values).

| Member | Ran |
|---|---|
| Penthera 2.1.0-rc.2 | yes, as the CLI reports |
| gitleaks 8.30.1 | yes |
| trufflehog 3.99.3 | yes |
| Semgrep 1.180.0, semgrep-rules `9bbf021` `javascript/` | yes, 67 packages, 0 errors |
| CodeQL 2.27.2, javascript-security-extended | yes, 67 packages, 0 errors |

**Same tools as E11b.** Before any arm was computed, the harness scored each
other tool with E11b's code and compared it with E11b's published test
numbers; a difference would have stopped the run. All four match exactly:
gitleaks 2,242/2,635 precise and 831/2,220 rows found, trufflehog 152/383
and 122/2,220, Semgrep 15/47 command and 9/17 code injection, CodeQL 37/47
and 4/17. Penthera 2.1.0-rc.2 scores what 2.0.0 scored in E11b, to the item
count: 1,640/1,849 and 1,415/2,220 on CredData, 35/47 and 10/17 on
SecBench.js.

### CredData, test (2,220 in-scope `T` rows, 1,258 files)

Strict precision over distinct merged hits (a hit is a file and line; across
tools, hits merge on file, line and the value's hash, or on file and line when
either has no value), in-scope row recall, F1.

| Arm | Hits | Precision | Recall (row) | F1 |
|---|---:|---|---|---:|
| P: Penthera alone | 1,849 | 0.89 [0.87, 0.90] (1,640/1,849) | 0.64 [0.62, 0.66] (1,415/2,220) | 0.74 |
| gitleaks alone | 2,635 | 0.85 [0.84, 0.86] (2,242/2,635) | 0.37 [0.35, 0.39] (831/2,220) | 0.52 |
| trufflehog alone | 383 | 0.40 [0.35, 0.45] (152/383) | 0.05 [0.05, 0.07] (122/2,220) | 0.10 |
| P + gitleaks | 3,729 | 0.84 [0.83, 0.86] (3,146/3,729) | 0.74 [0.72, 0.76] (1,648/2,220) | 0.79 |
| P + trufflehog | 2,140 | 0.80 [0.78, 0.81] (1,706/2,140) | 0.64 [0.62, 0.66] (1,424/2,220) | 0.71 |
| **U: union** | 4,017 | 0.80 [0.79, 0.81] (3,210/4,017) | 0.75 [0.73, 0.76] (1,656/2,220) | 0.77 |
| A: agreement | 1,852 | 0.89 [0.87, 0.90] (1,642/1,852) | 0.64 [0.62, 0.66] (1,415/2,220) | 0.74 |

Paired differences, bootstrap over files (10,000 resamples, seed 20261025):

| | Difference | Estimate [95% interval] | Supported when | Result |
|---|---|---|---|---|
| H1 | recall(U) − recall(P) | +0.109 [+0.025, +0.210] | lower bound > 0 | **holds** |
| H2 | precision(U) − precision(P) | −0.088 [−0.129, −0.043] | lower bound > −0.02 | **fails** |
| H3 | F1(U) − F1(gitleaks, the better tool) | +0.252 [+0.141, +0.408] | lower bound > 0 | **holds** |
| A | recall(A) − recall(P) | 0.000 [0.000, 0.000] | lower bound > 0 | fails |
| A | precision(A) − precision(P) | −0.000 [−0.002, 0.000] | lower bound > −0.02 | holds |

The union finds 241 more rows (11 points) and pays about 9 points of
precision: it adds 2,168 hits, 598 of them on no `T` row. Almost all of the
gain comes from gitleaks; trufflehog adds 9 rows and 291 hits to Penthera.
The agreement arm adds 3 hits where gitleaks and trufflehog agree and
Penthera did not report, none on a new row. deepsecrets (not a `--giants`
tool, not rerun) had F1 0.78 here in E11b; the union's is 0.77. Reported,
not tested.

### SecBench.js, test (64 vulnerabilities with a sink file)

| Arm | Strict recall, pooled | Findings per package (median / mean / max) |
|---|---|---|
| P: Penthera alone | 0.70 [0.58, 0.80] (45/64) | 1 / 1.0 / 6 |
| Semgrep alone | 0.38 [0.27, 0.50] (24/64) | 2 / 29.2 / 777 |
| CodeQL alone | 0.64 [0.52, 0.75] (41/64) | 2 / 3.3 / 35 |
| P + Semgrep | 0.75 [0.63, 0.84] (48/64) | 2 / 29.9 / 779 |
| P + CodeQL | 0.84 [0.74, 0.91] (54/64) | 2 / 4.0 / 40 |
| **U: union** | 0.84 [0.74, 0.91] (54/64) | 4 / 32.4 / 791 |
| A: agreement | 0.75 [0.63, 0.84] (48/64) | 1 / 1.4 / 12 |

H4, recall(U) − recall(P): +0.141, bootstrap interval [+0.063, +0.234];
exact McNemar 0 against 9, p = 0.0039. **H4 holds.** The union finds 9 more
vulnerabilities and loses none, and its median findings per package goes
from 1 to 4. CodeQL alone gives all 9: P + CodeQL has the union's recall at
a mean of 4.0 findings per package, against 32.4 with Semgrep (one package
gets 777 Semgrep findings).

H1 to H4 are one family. Only H4 has a p-value (H1 to H3 are decided by
their bootstrap intervals), so the Holm adjustment leaves it at 0.0039.

### What the rule decides

§ 5 of the pre-registration, applied as written:

1. Union, if H1 and H2 hold: **no.** H1 holds; H2 fails, with the whole
   interval below −0.02.
2. Agreement, if arm A has recall above P and precision within 0.02: **no.**
   Its precision holds, but it finds no row Penthera does not.
3. Otherwise **Penthera-first.** This is the result: `--giants` keeps
   Penthera-first as its default. Other tools' findings stay in their own
   section, "Also reported by other tools".

H4 holds while the CredData default is Penthera-first, so § 5 reads it as
**more found on code, at a cost not measurable here**: SecBench.js has no
labelled negatives, so the union's extra findings cannot be scored as right
or wrong. Whether code findings follow a different merge rule is the
maintainer's decision.

![Scatter plot of strict precision against in-scope recall for the E14 arms on the CredData test half. Penthera alone is at precision 0.89 and recall 0.64. The union moves right to recall 0.75 but down to precision 0.80, below the shaded band that marks 0.02 under Penthera alone. The agreement arm overlaps Penthera alone.](figures/e14-creddata-arms.svg)

*Figure 2 (added 29 Oct 2026). The CredData arms above, precision against
recall, with Wilson 95% whiskers for each arm's own proportion. The shaded
band is H2's margin; the union lands below it. The H1 and H2 tests use the
paired bootstrap in the table above, which the whiskers do not show.
n = 2,220 in-scope true rows. Data: the CredData table in this section, run
28 Oct 2026.*

**Spot-check.** 50 cross-tool merges per benchmark, drawn with the seed and
read line by line (by Claude, for the maintainer to recheck; the samples are
in the local results folder). CredData: 50 of 50 join one secret on one line,
30 of them private key blocks. SecBench.js: 50 of 50 join findings on the same
call or statement on one line.

**Limits.** The same test half as E11b, so each tool's aggregate was public
before this run (§ 7); the combination was not. CredData is split by file,
not by repository. Each tool runs on its defaults. Two benchmarks, two
areas: E14 says nothing about dependencies, infrastructure or live apps.

## E14 step 1: the dev half (2026-10-27; not the registered test)

Pre-registration: [E14-giants-combination.md](../../docs/research/prereg/E14-giants-combination.md)
(registered at `1b7823a`). This is § 6 step 1 only: the dev half, to build
the merge code and check that each rerun tool is the tool E11b measured. The
test half was not touched, and no combined test-half count exists. Nothing
was tuned to these numbers; the keys are the spec's, as `--giants` ships
them in `lib/giants/merge.js`.

**One fix, then rescored (2026-10-27).** The first scoring found that a
secret with no readable value (a line inside a private key block) never
merged across tools. The maintainer decided the fix: when either finding has
no value, file and line decide, for every tool (§ 9 of the pre-registration).
The tables below show both scorings from the same per-item hits; nothing
else changed. **H2 fails either way.**

`node bench/public/giants.mjs --split dev --collect`, 2026-10-27, from main
`1f70835`, with a bench cache of its own (results only; the inputs are E11b's).
Each tool ran through E11b's own runner in `competitors.mjs` (same pins,
commands and `sandbox-exec` network deny; a curl under each profile failed
to resolve). Per-item outputs: SHA-256 `e89fe650b77dde860bea36ae74ae0527a4a5ceaba029bb705753578314c5ddad`
(local; CredData hits carry hashes of the values, never the values).

| Member | Ran | Seconds |
|---|---|---:|
| Penthera 2.1.0-rc.1 (main `1f70835`; see the deviations) | yes, as the CLI reports | |
| gitleaks 8.30.1 | yes | 13 |
| trufflehog 3.99.3 | yes | 115 |
| Semgrep 1.180.0, semgrep-rules `9bbf021` `javascript/` | yes, 69 packages, 0 errors | 430 |
| CodeQL 2.27.2, javascript-security-extended | yes, 69 packages, 0 errors | 486 |

Nothing in the registered arms was missing.

**Same tools as E11b.** Each tool's dev numbers, scored with E11b's code,
match E11b's stored dev results exactly: gitleaks 4,708/5,687 precise and
747/2,239 rows found, trufflehog 157/351 and 77/2,239, Semgrep 15/49 command
and 9/16 code injection, CodeQL 35/49 and 5/16. One difference: Semgrep
reported more findings per package than in E11b's stored run (mean 9.5
against 8.4, largest 152 against 109) with the same recall. The noise column
below uses this run.

### CredData, dev (2,239 in-scope `T` rows, 1,327 files)

Strict precision over distinct merged hits (a hit is a file and line; across
tools, hits merge on file, line and the value's hash, or on file and line when
either has no value), in-scope row recall, F1. The single-tool rows do not
change with the fix.

| Arm | Hits | Precision | Recall (row) | F1 |
|---|---:|---|---|---:|
| P: Penthera alone | 1,944 | 0.94 [0.93, 0.95] (1,823/1,944) | 0.72 [0.70, 0.73] (1,601/2,239) | 0.81 |
| gitleaks alone | 5,687 | 0.83 [0.82, 0.84] (4,708/5,687) | 0.33 [0.31, 0.35] (747/2,239) | 0.48 |
| trufflehog alone | 351 | 0.45 [0.40, 0.50] (157/351) | 0.03 [0.03, 0.04] (77/2,239) | 0.06 |
| P + gitleaks, after the fix | 6,762 | 0.84 [0.83, 0.85] (5,676/6,762) | 0.74 [0.72, 0.76] (1,655/2,239) | 0.79 |
| P + gitleaks, before | 7,302 | 0.85 [0.84, 0.86] (6,203/7,302) | 0.74 [0.72, 0.76] (1,655/2,239) | 0.79 |
| P + trufflehog, after the fix | 2,244 | 0.86 [0.85, 0.88] (1,935/2,244) | 0.72 [0.70, 0.74] (1,606/2,239) | 0.78 |
| P + trufflehog, before | 2,280 | 0.86 [0.85, 0.88] (1,965/2,280) | 0.72 [0.70, 0.74] (1,606/2,239) | 0.78 |
| **U: union, after the fix** | 7,055 | 0.82 [0.81, 0.83] (5,781/7,055) | 0.74 [0.72, 0.76] (1,659/2,239) | 0.78 |
| U: union, before | 7,631 | 0.83 [0.82, 0.84] (6,338/7,631) | 0.74 [0.72, 0.76] (1,659/2,239) | 0.78 |
| A: agreement (same before and after) | 1,951 | 0.94 [0.93, 0.95] (1,830/1,951) | 0.72 [0.70, 0.73] (1,601/2,239) | 0.81 |

Paired differences, bootstrap over files (10,000 resamples, seed 20261025):

| | Difference | After the fix | Before the fix | Would hold on dev |
|---|---|---|---|---|
| H1 | recall(U) − recall(P) | +0.026 [+0.017, +0.037] | +0.026 [+0.017, +0.037] | yes, both |
| H2 | precision(U) − precision(P), margin −0.02 | −0.118 [−0.299, +0.004] | −0.107 [−0.256, +0.004] | **no, both** |
| H3 | F1(U) − F1(gitleaks, the better tool here) | +0.303 [+0.195, +0.438] | +0.308 [+0.214, +0.439] | yes, both |
| | recall(A) − recall(P) | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | no, both |
| | precision(A) − precision(P) | +0.000 [0.000, +0.001] | +0.000 [0.000, +0.001] | yes, both |

The union finds 58 more rows (2.6 points) and pays about 12 points of
precision after the fix (11 before): gitleaks adds 5,687 hits, 979 of them
on no `T` row. The fix merges private-key lines that both tools report, which
removes duplicate correct hits, so the union's precision goes down, not up. The agreement
arm adds 7 hits where gitleaks and trufflehog agree and Penthera did not
report, none on a new row. deepsecrets (not a `--giants` tool, not rerun)
had F1 0.77 on dev in E11b; the union's is 0.78.

### SecBench.js, dev (65 vulnerabilities with a sink file)

| Arm | Strict recall, pooled | Findings per package (median / mean / max) |
|---|---|---|
| P: Penthera alone | 0.88 [0.78, 0.94] (57/65) | 1 / 1.3 / 9 |
| Semgrep alone | 0.37 [0.26, 0.49] (24/65) | 2 / 9.5 / 152 |
| CodeQL alone | 0.62 [0.49, 0.72] (40/65) | 1 / 3.2 / 55 |
| P + Semgrep | 0.89 [0.79, 0.95] (58/65) | 2 / 10.3 / 158 |
| P + CodeQL | 0.89 [0.79, 0.95] (58/65) | 2 / 4.0 / 64 |
| U: union | 0.91 [0.81, 0.96] (59/65) | 4 / 12.9 / 210 |
| A: agreement | 0.88 [0.78, 0.94] (57/65) | 1 / 1.4 / 12 |

H4, recall(U) − recall(P): +0.031, bootstrap interval [0.000, +0.077]; exact
McNemar 0 against 2, p = 0.50 (Holm-adjusted 0.50). It would not hold on
dev. The union finds two more vulnerabilities and triples the findings per
package (median 1 to 4).

### What the dev half says, and what it does not

If § 5's rule were applied to these dev numbers, the default would stay
**Penthera-first**, before and after the fix: H1 holds but H2 fails, and the
agreement arm finds nothing Penthera does not. This is the dev half: it informs no claim and
does not decide the default. The test half runs once, in step 2.

**Spot-check (§ 6 step 1).** 50 cross-tool merges per benchmark, drawn with
the seed, read line by line (by Claude, for the maintainer to recheck; the
samples are in the local results folder). CredData before the fix: 49 of 50
join one value hit by two or three tools; one line holds two values (an MD5
string and a password in a comment), so it cannot be told which each tool
matched. CredData after the fix (a new draw, since the merged set changed):
49 of 50 join one secret, 26 of them private key blocks that both tools
report at the same first line; one curl line holds a Slack token and an
auth header, and gitleaks' two rules on it are one hit by E11b's line unit.
SecBench.js: 50 of 50 join the same call on the same line (the fix does not
touch code findings).

**The gap the first scoring found, and its fix.** Of 911 lines that two or
more CredData tools hit, the first scoring merged 337; 34 hold different
values; 540 did not merge because one tool's value was not known (Penthera's
value is read back from the reported line, and a line inside a private key
block holds no value on its own: 535 of the 540). With the fix, 877 merge and
the 34 lines with two different values stay apart. Counting with E11b's own
unit (every hit on a line merges) gives the union 0.82 (5,732/7,004), the
same as after the fix to two decimals.

## E11b final: the sealed test half, scored once (2026-10-25)

Penthera 2.0.0 (main `219b73a`) and 1.9.0 against every free tool we could
run offline, on the test half sealed before any tuning (§ 2 of the
[amendment](../../docs/research/prereg/E11b-improvement-study.md)). Ranking
rules were registered before the run (§ 7): secrets by F1, malware by caught
minus false alarms (Youden's J), SecBench.js by strict recall; a rank only
where at least five other free tools were measured. Generated by
`bench/public/publish.mjs` from the result files; numbers in
[published.json](published.json).

#### Leaked secrets (Samsung CredData)

| Rank | Tool | Precision | Recall | F1 |
|---:|---|---|---|---|
| 1 | deepsecrets 2.2.0 | 0.80 [0.79, 0.82] | 0.77 [0.75, 0.78] | 0.78 |
| 2 | **Penthera** 2.0.0 | 0.89 [0.87, 0.90] | 0.64 [0.62, 0.66] | 0.74 |
| 3 | noseyparker 0.24.0 | 0.76 [0.74, 0.78] | 0.62 [0.60, 0.64] | 0.69 |
| 4 | gitleaks 8.30.1 | 0.85 [0.84, 0.86] | 0.37 [0.35, 0.39] | 0.52 |
| 5 | ripsecrets 0.1.11 | 0.65 [0.64, 0.67] | 0.35 [0.33, 0.37] | 0.45 |
| 6 | kingfisher 2.14.0 | 0.96 [0.94, 0.97] | 0.29 [0.28, 0.31] | 0.45 |
| 7 | detect-secrets 1.5.0 | 0.30 [0.29, 0.31] | 0.53 [0.51, 0.56] | 0.38 |
| 8 | secretlint 13.0.7 | 0.92 [0.89, 0.94] | 0.19 [0.18, 0.21] | 0.32 |
| 9 | whispers 2.4.0 | 0.46 [0.43, 0.50] | 0.09 [0.08, 0.10] | 0.15 |
| 10 | trufflehog 3.99.3 | 0.40 [0.35, 0.45] | 0.05 [0.05, 0.07] | 0.10 |
| – | credsweeper 1.19.4 ¹ | 1.00 [1.00, 1.00] | 0.98 [0.98, 0.99] | 0.99 |
| – | Penthera 1.9.0 | 0.56 [0.51, 0.60] | 0.10 [0.09, 0.12] | 0.18 |
| | Free tools, mean / median | 0.68 / 0.76 | 0.36 / 0.35 | 0.43 / 0.45 |

![Scatter plot of strict precision against in-scope recall for the secret scanners on the CredData test half. Penthera 2.0.0 sits at precision 0.89 and recall 0.64; deepsecrets at 0.80 and 0.77 has the highest F1 among ranked tools; Penthera 1.9.0 sits at 0.56 and 0.10.](figures/e11b-secrets-precision-recall.svg)

*Figure 3 (added 29 Oct 2026). The secrets table above, precision against
recall, with Wilson 95% whiskers and dashed curves of equal F1. Hollow
marks are not ranked. n = 2,220 in-scope true rows. Data:
[published.json](published.json), test half, 25 Oct 2026.*

#### Malicious npm packages (DataDog)

| Rank | Tool | Caught | False alarms on benign packages | Caught minus false alarms |
|---:|---|---|---|---|
| 1 | **Penthera** 2.0.0 | 0.71 [0.62, 0.78] (79/112) | 0.00 [0.00, 0.02] (0/150) | 0.71 |
| 2 | malcontent 1.27.1 (bf280ad6), yara-x 1.21.0 | 0.68 [0.59, 0.76] (76/112) | 0.05 [0.03, 0.10] (8/150) | 0.63 |
| 3 | GuardDog 3.2.0 ² | 0.62 [0.52, 0.70] (69/112) | 0.03 [0.01, 0.07] (4/150) | 0.59 |
| 4 | ossgadget 0.2.20 (414b6a59) | 0.94 [0.88, 0.97] (105/112) | 0.89 [0.83, 0.93] (133/150) | 0.05 |
| 5 | clamav 1.5.4 | 0.01 [0.00, 0.05] (1/112) | 0.00 [0.00, 0.02] (0/150) | 0.01 |
| 6 | yara yara-python 4.5.4 (YARA 4.5), YARA-Forge core 20261004 | 0.00 [0.00, 0.03] (0/112) | 0.00 [0.00, 0.02] (0/150) | 0.00 |
| – | osv-scanner 2.6.0 ³ | 0.90 [0.83, 0.94] (101/112) | 0.01 [0.00, 0.04] (1/150) | 0.90 |
| – | Penthera 1.9.0 | 0.57 [0.48, 0.66] (64/112) | 0.00 [0.00, 0.02] (0/150) | 0.57 |

#### Malicious PyPI packages (DataDog)

| Rank | Tool | Caught | False alarms on benign packages | Caught minus false alarms |
|---:|---|---|---|---|
| 1 | **Penthera** 2.0.0 | 0.87 [0.81, 0.92] (131/150) | 0.05 [0.03, 0.10] (8/150) | 0.82 |
| 2 | GuardDog 3.2.0 ² | 0.85 [0.79, 0.90] (128/150) | 0.11 [0.07, 0.17] (16/147) | 0.74 |
| 3 | malcontent 1.27.1 (bf280ad6), yara-x 1.21.0 | 0.93 [0.87, 0.96] (139/150) | 0.22 [0.16, 0.29] (32/147) | 0.71 |
| 4 | yara yara-python 4.5.4 (YARA 4.5), YARA-Forge core 20261004 | 0.25 [0.18, 0.32] (37/150) | 0.00 [0.00, 0.03] (0/147) | 0.25 |
| 5 | clamav 1.5.4 | 0.00 [0.00, 0.02] (0/150) | 0.00 [0.00, 0.03] (0/147) | 0.00 |
| 6 | ossgadget 0.2.20 (414b6a59) | 0.77 [0.70, 0.83] (116/150) | 0.97 [0.93, 0.99] (143/147) | -0.20 |
| 7 | aura 2.1 (SourceCode-AI/aura b40e6dd2) | 0.59 [0.51, 0.67] (88/149) | 0.83 [0.75, 0.88] (100/121) | -0.24 |
| 8 | bandit4mal lyvd/bandit4mal 03ba95f3 (bandit 1.6.3 fork) | 0.59 [0.51, 0.67] (89/150) | 0.84 [0.78, 0.89] (124/147) | -0.25 |
| – | Penthera 1.9.0 | 0.83 [0.77, 0.88] (125/150) | 0.09 [0.06, 0.15] (14/150) | 0.74 |
| – | osv-scanner 2.6.0 ³ | 0.74 [0.66, 0.80] (110/149) | 0.00 [0.00, 0.03] (0/147) | 0.74 |

![Two scatter plots, npm and PyPI, of the share of malicious packages caught against the share of benign packages flagged. On npm, Penthera 2.0.0 catches 0.71 and flags none of 150 benign packages. On PyPI it catches 0.87 and flags 0.05. ossgadget, aura and bandit4mal flag most benign packages.](figures/e11b-malware-caught-vs-false-alarms.svg)

*Figure 4 (added 29 Oct 2026). The two malware tables above: share of
malicious packages caught against share of benign packages flagged, with
Wilson 95% whiskers. The dashed diagonal is chance; the height above it is
Youden's J, the registered ranking score. Hollow marks are not ranked or
inflated by construction. n = 112 npm packages with a payload, 150 PyPI
packages, about 150 benign per ecosystem. Data: [published.json](published.json),
test half, 25 Oct 2026.*

#### Injection bugs in JavaScript libraries (SecBench.js)

| Rank | Tool | Command injection | Code injection | Both |
|---:|---|---|---|---|
| 1 | **Penthera** 2.0.0 | 35/47 | 10/17 | 0.70 [0.58, 0.80] |
| 2 | odgen c5157ee | 36/46 | 6/16 | 0.68 [0.55, 0.78] |
| 3 | codeql 2.27.2 (used under the GitHub CodeQL terms, for research on open-source code) | 37/47 | 4/17 | 0.64 [0.52, 0.75] |
| 4 | eslint-plugin-security 4.2.0 | 32/47 | 9/17 | 0.64 [0.52, 0.75] |
| 5 | semgrep 1.180.0 | 15/47 | 9/17 | 0.38 [0.27, 0.50] |
| 6 | graudit 849d7c7 | 12/47 | 10/17 | 0.34 [0.24, 0.47] |
| 7 | bearer 2.1.1 | 14/47 | 0/17 | 0.22 [0.14, 0.33] |
| 8 | njsscan 1.0.1 | 2/45 | 1/15 | 0.05 [0.02, 0.14] |
| – | semgrep, every file 1.180.0 (another setting of semgrep, not ranked) | 16/47 | 9/17 | 0.39 [0.28, 0.51] |
| – | Penthera 1.9.0 | 0/47 | 10/17 | 0.16 [0.09, 0.26] |

A rank is shown only where at least 5 other free tools were measured; otherwise "–". The rank column orders tools by score, and close scores can swap places. Penthera's 95% rank interval (bootstrap, exploratory): 2nd on CredData, 1st to 3rd on npm, 1st to 3rd on PyPI, 1st to 4th on SecBench.js.

Paid tools (GitGuardian, Socket, Snyk, Phylum, Semgrep Pro) publish no results on these benchmarks, so they are not in the tables.

Published elsewhere, on other datasets (context, not comparable):

- [A comparative study of software secrets reporting by secret detection tools (2023): nine tools on SecretBench, ggshield included](https://arxiv.org/abs/2307.00714)
- [How effective are npm malicious package detectors? (2026): eleven detectors on their own benchmark](https://arxiv.org/abs/2603.27549)
- [Cutting the Gordian knot: detecting malicious PyPI packages (USENIX Security 2026): GuardDog, Bandit4Mal and OSSGadget on PyPI](https://arxiv.org/abs/2601.16463)
- [Study of JavaScript static analysis tools for vulnerability detection in Node.js packages (2023): nine tools incl. CodeQL, NodeJsScan, ODGen](https://www.researchgate.net/publication/367088656)

¹ Not ranked: trained on this dataset by its authors. ² Found most samples in this dataset, so its rate is inflated by construction. ³ Not ranked: a lookup of already-reported packages, not detection.

#### Both test runs

The first final run (round 1, main `2db5a71`) was stopped before anyone read
it, sealed (SHA-256 `7fc41259…`) and opened after round 2. Both are reported;
Penthera 1.9.0 scores the same in both, so the harness is deterministic.

| Benchmark | Round 1 | Round 2 (2.0.0) |
|---|---|---|
| Secrets F1 | 0.74 | 0.74 |
| npm, caught minus false alarms | 0.71 | 0.71 |
| PyPI, caught minus false alarms | 0.75 | 0.82 |
| SecBench.js, found | 0.63 | 0.70 |

#### How far to trust these numbers

- **Leakage audit** by a reviewer who did not write the rules: no dataset
  identifiers, values or package names in any rule or test added since 1.9.0,
  and no IOC added. Two leaks in the split: CredData is split by file, so most
  repositories have files on both halves (removing the repository one word
  list fits moves F1 from 0.742 to 0.738); SecBench.js had four packages on
  both halves (without them command injection is 0.77, not 0.74).
- **Dev to test:** secrets F1 0.81 to 0.74, SecBench.js 0.88 to 0.70, npm 0.83
  to 0.71, PyPI 0.92 to 0.82. The test numbers are the result.
- **Missed targets:** PyPI false alarms 0.05 (target 0.03); SecBench.js code
  injection unchanged (10/17).
- The free tools ran on their defaults; Penthera was tuned on the dev half.
  CredData's values are look-alikes, which favours pattern rules over tools
  that verify keys. GuardDog helped build the malware dataset. CredData's
  labels lean on other scanners' output. A benchmark is not your code:
  accuracy on real projects is experiment E1.

## E11b dev baseline (dev half only; the test half is sealed)

Amendment: [E11b-improvement-study.md](../../docs/research/prereg/E11b-improvement-study.md)
(draft, for the maintainer's approval). The split was committed in `72d3149`
before either half was scored; only the dev half was scored. The scanner is
unchanged from E11. `npm run bench:public -- --split dev`, 2026-10-24, 0
blocked connections.

*Note added 29 Oct 2026: the maintainer approved E11b on 24 Oct 2026, and
it was completed on 25 Oct. This section is kept as it was written.*

### CredData, dev (5,515 labelled files; 9,108 `T`, 24,032 `F`, 2,043 `X` rows)

| Run | Precision, labelled hit lines | Recall, row (one credential) | Recall, line | Recall, file (hit on a T row) | Recall, file (any hit) | File precision |
|---|---|---|---|---|---|---|
| Primary: files the scan reads | 0.58 [0.55, 0.61] (613/1,053) | 0.27 [0.25, 0.29] (610/2,239) | 0.08 [0.07, 0.08] (610/7,884) | 0.32 [0.29, 0.35] (268/848) | 0.32 [0.29, 0.35] (271/848) | 0.69 [0.65, 0.74] (297/428) |
| Rules on every file | 0.64 [0.62, 0.67] (1,064/1,651) | 0.47 [0.45, 0.50] (1,062/2,239) | 0.13 [0.13, 0.14] | 0.56 [0.53, 0.60] (477/848) | 0.58 [0.55, 0.61] | 0.72 [0.68, 0.75] |
| As the CLI reports it | 0.61 [0.56, 0.65] (265/436) | 0.12 [0.10, 0.13] (258/2,239) | 0.03 [0.03, 0.04] | 0.29 [0.26, 0.32] (245/848) | 0.32 [0.29, 0.35] (271/848) | 0.69 [0.65, 0.74] |

By family (primary run; last column the CLI view):

| Family | Row | Line | File, hit on a T row | File, any hit (CLI) |
|---|---|---|---|---|
| provider | 0.43 [0.35, 0.51] (60/140) | 0.36 [0.29, 0.43] (60/168) | 0.47 [0.31, 0.63] (16/34) | 0.47 [0.31, 0.63] (16/34) |
| private-key | 0.12 [0.09, 0.15] (65/557) | 0.01 [0.01, 0.01] (65/6,174) | 0.24 [0.18, 0.31] (42/173) | 0.24 [0.18, 0.31] (42/173) |
| password | 0.33 [0.31, 0.35] (469/1,424) | 0.33 (same: one-line rows) | 0.34 [0.31, 0.38] (205/596) | 0.36 [0.32, 0.39] (212/596) |
| api-key | 0.14 [0.09, 0.21] (16/118) | 0.14 (same) | 0.16 [0.09, 0.27] (10/62) | 0.16 [0.09, 0.27] (10/62) |

**Private keys were not a counting effect at the row level.** CredData
already labels each PEM block as one row with a line range (1,154 of 1,193
true private-key rows span several lines), and E11 counted a row found when
any hit fell in its range. Counting lines instead would drop recall to 0.01.
Per file, recall doubles to 0.24: misses concentrate in a few files that
hold many keys, and in file types the scan does not read (`.txt`, `.key`,
`.pem`). The gap is coverage, not counting.

### SecBench.js, dev (71 vulnerabilities)

| Class | Scanned | Strict recall (sink file) | Lenient recall | Capability at sink file |
|---|---:|---|---|---|
| Command injection | 49 of 51 | 0.00 [0.00, 0.07] (0/49) | 0.00 [0.00, 0.07] | 0.92 [0.81, 0.97] (45/49) |
| Code injection | 20 of 20 | 0.44 [0.23, 0.67] (7/16) | 0.50 [0.30, 0.70] (10/20) | 0.56 [0.33, 0.77] (9/16) |
| **Pooled** | 69 | 0.11 [0.05, 0.21] (7/65) | 0.14 [0.08, 0.25] (10/69) | 0.83 [0.72, 0.90] (54/65) |

### DataDog and benign, dev (`code-medium`, the primary rule)

| Group | n | Flagged |
|---|---:|---|
| Malicious npm, `malicious_intent` | 150 | 0.46 [0.38, 0.54] (69) |
| Malicious npm, `compromised_lib` | 25 | 0.88 [0.70, 0.96] (22) |
| Malicious PyPI, `malicious_intent` | 149 | 0.76 [0.68, 0.82] (113) |
| Malicious PyPI, `compromised_lib` | 9 | 0.11 [0.02, 0.43] (1) |
| Benign npm | 150 | 0.00 [0.00, 0.02] (0) |
| Benign PyPI | 150 | 0.07 [0.04, 0.13] (11) |

The npm rows by payload (E11b § 7, registered after this baseline was
first scored; the kind comes from each sample's files, by the written
criteria in `payloadKind()` in `malware.mjs`, never from Penthera's result):

| Group | n | Flagged |
|---|---:|---|
| Malicious npm, `malicious_intent`, payload | 105 | 0.66 [0.56, 0.74] (69) |
| Malicious npm, `malicious_intent`, no payload | 45 | 0.00 [0.00, 0.08] (0) |
| Malicious npm, `compromised_lib`, payload | 25 | 0.88 [0.70, 0.96] (22) |

No payload, by kind: self-publishing spam 28, empty package 13, harmless
proof of concept 3, security placeholder 1. Two packages the B1 taxonomy
counts as spam fit no written criterion and count as payload, against
Penthera.

One dev PyPI sample had no package root and is excluded. 10 of the 11
benign PyPI flags are risky `setup.py` install scripts; the other is an
agent tool that writes AI config.

### Reference tools on dev (not part of E11's hypotheses)

Pinned, run locally with the network denied (E11b § 5), scored with the same
code. They have other scopes: gitleaks and detect-secrets have rules for
many categories Penthera leaves out of scope.

| Tool | Hit lines | Precision, labelled | Recall, in scope (row) | Recall, all `T` rows | Recall, file (hit on a T row) |
|---|---:|---|---|---|---|
| Penthera (primary) | 1,085 | 0.58 [0.55, 0.61] | 0.27 [0.25, 0.29] | n/a (scope) | 0.32 [0.29, 0.35] |
| gitleaks 8.30.1 | 5,687 | 0.85 [0.84, 0.86] (4,708/5,526) | 0.33 [0.31, 0.35] (747/2,239) | 0.52 [0.51, 0.53] (4,777/9,108) | 0.31 [0.28, 0.34] (265/848) |
| detect-secrets 1.5.0 | 7,965 | 0.53 [0.51, 0.54] (2,167/4,121) | 0.56 [0.53, 0.58] (1,243/2,239) | 0.23 [0.23, 0.24] (2,133/9,108) | 0.75 [0.71, 0.77] (632/848) |

| Tool | provider | private-key | password | api-key |
|---|---|---|---|---|
| Penthera | 0.43 (60/140) | 0.12 (65/557) | 0.33 (469/1,424) | 0.14 (16/118) |
| gitleaks | 0.56 [0.48, 0.64] (79/140) | 1.00 [0.99, 1.00] (557/557) | 0.05 [0.04, 0.07] (78/1,424) | 0.28 [0.21, 0.37] (33/118) |
| detect-secrets | 0.74 [0.66, 0.80] (103/140) | 0.33 [0.29, 0.37] (182/557) | 0.65 [0.62, 0.67] (919/1,424) | 0.33 [0.25, 0.42] (39/118) |

A caution on these: CredData's labelled lines came from running several
open-source scanners and reviewing their output (CredData README), so a tool
whose hits were part of that frame has more of its hits labelled. That
favours older, widely used tools in the "labelled" precision; strict
precision is the fairer column (gitleaks 0.83, detect-secrets 0.27,
Penthera 0.56).

#### More secret scanners on CredData dev

Eight more free, open-source scanners, run the same way on 2026-10-24
(`competitors.mjs`): each pinned to its newest release at least four days
old, installed only under the bench cache, run from the split's file tree
with the network denied by `sandbox-exec`, default rules, and only network
verification and update checks turned off. Scored with the same
`scoreHits`. "Variant" rows are another output mode of the same scan: they
list every location of a secret the default output groups or dedups.

| Tool | Hits | Strict precision | Recall, in scope (row) | Recall, file (hit on a T row) | Seconds |
|---|---:|---|---|---|---:|
| gitleaks 8.30.1 | 5,704 | 0.83 [0.82, 0.84] (4,708/5,687) | 0.33 [0.31, 0.35] (747/2,239) | 0.31 [0.28, 0.34] (265/848) | 13 |
| detect-secrets 1.5.0 | 8,383 | 0.27 [0.26, 0.28] (2,167/7,965) | 0.56 [0.53, 0.58] (1,243/2,239) | 0.75 [0.71, 0.77] (632/848) | 266 |
| deepsecrets 2.2.0 | 3,291 | 0.80 [0.78, 0.81] (2,547/3,199) | 0.75 [0.73, 0.77] (1,685/2,239) | 0.76 [0.73, 0.79] (646/848) | 29 |
| noseyparker 0.24.0 | 2,504 | 0.75 [0.73, 0.77] (1,874/2,499) | 0.58 [0.56, 0.60] (1,309/2,239) | 0.61 [0.57, 0.64] (514/848) | 2 |
| noseyparker, every match (variant) | 2,856 | 0.66 [0.64, 0.68] (1,881/2,851) | 0.59 [0.57, 0.61] (1,314/2,239) | 0.61 [0.57, 0.64] (514/848) | |
| ripsecrets 0.1.11 | 6,455 | 0.71 [0.70, 0.72] (4,580/6,455) | 0.31 [0.29, 0.33] (700/2,239) | 0.28 [0.25, 0.31] (237/848) | 21 |
| kingfisher 2.14.0 | 771 | 0.96 [0.94, 0.97] (735/767) | 0.26 [0.24, 0.28] (579/2,239) | 0.22 [0.20, 0.25] (189/848) | 4 |
| kingfisher, every occurrence (variant) | 797 | 0.94 [0.92, 0.96] (748/793) | 0.26 [0.25, 0.28] (592/2,239) | 0.23 [0.20, 0.26] (192/848) | |
| secretlint 13.0.7, preset-recommend | 386 | 0.86 [0.82, 0.89] (331/386) | 0.12 [0.11, 0.14] (276/2,239) | 0.18 [0.16, 0.21] (155/848) | 8 |
| whispers 2.4.0 | 884 | 0.48 [0.45, 0.52] (329/680) | 0.08 [0.07, 0.09] (176/2,239) | 0.12 [0.10, 0.14] (99/848) | 82 |
| trufflehog 3.99.3 | 397 | 0.45 [0.40, 0.50] (157/351) | 0.03 [0.03, 0.04] (77/2,239) | 0.03 [0.02, 0.05] (28/848) | 99 |
| trufflehog, all results (variant) | 518 | 0.35 [0.30, 0.39] (159/459) | 0.03 [0.03, 0.04] (78/2,239) | 0.03 [0.02, 0.05] (29/848) | |
| credsweeper 1.19.4 (not comparable) | 15,938 | 1.00 [0.99, 1.00] (14,359/14,427) | 0.99 [0.98, 0.99] (2,215/2,239) | 0.99 [0.98, 0.99] (839/848) | 290 |

Limits on reading this table:

- CredSweeper is made by the CredData authors, and its ML model was trained
  with CredData. Its row measures fit to its own training data. Leave it out
  of any ranking.
- CredData replaces each real secret with random characters of the same
  shape. A tool that checks structure (a parsable private key, a token
  checksum) can drop those values, as TruffleHog and Kingfisher do in part.
  That likely explains some of their low recall here; we did not measure how
  much.
- Whispers reads structured files (YAML, JSON, config) and reports line 0
  for some file-level findings, which never match a labelled line.
- secretlint ran on the glob `data/**/*`, which skips dotfiles. Its `json`
  output failed on the whole tree, so the runner reads its `unix` output.
- CredSweeper and deepsecrets need Unix-domain sockets for Python
  multiprocessing. Their sandbox allows those sockets and still denies every
  IP connection.
- Semgrep with the public `p/secrets` ruleset was not run: it downloads its
  rules at scan time.

Exact command lines, per-family recall and labelled precision are in
`competitors-creddata.dev.md` in the results directory.

GuardDog 3.2.0 on the same dev packages (static, its own kernel sandbox
with the network blocked, samples deleted afterwards). GuardDog reports
every rule match as an issue and also gives a risk label; three ways to
call a package flagged:

| Group | n | Penthera `code-medium` | GuardDog: any issue | GuardDog: label `suspicious` or `high_risk` | GuardDog: any label above none |
|---|---:|---|---|---|---|
| Malicious npm, `malicious_intent` | 150 | 0.46 [0.38, 0.54] | 0.78 [0.71, 0.84] (117) | 0.59 [0.51, 0.66] (88) | 0.66 [0.58, 0.73] (99) |
| Malicious npm, `compromised_lib` | 25 | 0.88 [0.70, 0.96] | 1.00 [0.87, 1.00] (25) | 0.84 [0.65, 0.94] (21) | 0.96 [0.80, 0.99] (24) |
| Malicious PyPI, `malicious_intent` | 149 | 0.76 [0.68, 0.82] | 0.97 [0.92, 0.99] (144) | 0.89 [0.82, 0.93] (132) | 0.89 [0.82, 0.93] (132) |
| Malicious PyPI, `compromised_lib` | 9 | 0.11 [0.02, 0.43] | 1.00 [0.70, 1.00] (9) | 0.67 [0.35, 0.88] (6) | 0.78 [0.45, 0.94] (7) |
| Benign npm | 150 | 0.00 [0.00, 0.02] | 0.52 [0.44, 0.60] (78) | 0.01 [0.00, 0.04] (1) | 0.09 [0.05, 0.14] (13) |
| Benign PyPI | 150 | 0.07 [0.04, 0.13] | 0.74 [0.66, 0.80] (111) | 0.09 [0.06, 0.15] (14) | 0.22 [0.16, 0.29] (33) |

GuardDog found most of this dataset in the first place (E11 § 9), so its
detection rates here are inflated by construction. At its
`suspicious`-or-`high_risk` cut, it flags more malicious npm packages than
Penthera (0.59 against 0.46) at about the same benign npm rate (0.01
against 0.00), and slightly more benign PyPI packages (0.09 against 0.07).
Its most frequent rules on malicious npm packages are process spawn,
outbound network and download capabilities (61, 56 and 46 of 150), which
points the same way as follow-up 9 (code that runs on load). Its "any issue"
count is not usable as a verdict: it marks half the benign npm packages.

## Reproduce, licenses and what is not shared (added 29 Oct 2026)

| Run | Commit | Command |
|---|---|---|
| E11 | `58ae9d7` scanner; results `a043516` | `npm run bench:public` |
| E11b dev baseline | split sealed in `72d3149` | `npm run bench:public -- --split dev`, and `--competitors --split dev` for the other tools |
| E11b final | main `219b73a` | `npm run bench:public -- --split test --final`; tables by `node bench/public/publish.mjs` |
| E14 step 1 | main `1f70835` | `node bench/public/giants.mjs --split dev --collect` |
| E14 step 2 | `8bcdd68` (Penthera from `efbe8c8`) | `node bench/public/giants.mjs --split test --final --collect --spot-check 50` |
| Figures 1 to 4 | this commit | `node bench/public/figures.mjs` (`--check` fails if a committed SVG is stale) |

The [README](README.md#reproduce) has every flag. Dataset pins and the
reasons for each sample size are in E11 § 2 and § 7.1.

**Licenses.** Penthera, the runners, the split manifests, this file,
[published.json](published.json) and the figures are MIT, as the
repository. CredData's code is Apache-2.0 and each of its data files keeps
its source project's license. DataDog's dataset is Apache-2.0. SecBench.js
packages are fetched from npm, each under its own license.

**Not shared, and why.**

- Malware samples, and any snippet or IOC taken from them: safety (E11 § 10).
- CredData's materialized files: their own licenses; `download_data.py`
  rebuilds them from the pin.
- Per-item outputs (E14 hashes `4d5880e1…` and `e89fe650…`) and the E11b
  lab notebook: they quote dataset lines and file paths. Every count the
  hypotheses use is in this file.
