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

## Summary

| | Hypothesis | Estimate | Verdict |
|---|---|---|---|
| H1 | Secret precision above 0.70 | 0.58 [0.55, 0.60], n = 2,099 labelled hit lines | Not supported |
| H2 | Secret recall above 0.50 in scope | 0.27 [0.26, 0.29], n = 4,459 true credentials | Not supported |
| H3 | SecBench.js recall at the sink above 0.50 | 0.13 [0.08, 0.20], n = 129 | Not supported |
| H4 | Malware flagged above 0.70, each ecosystem | npm 0.44 [0.39, 0.50], n = 300; PyPI 0.80 [0.75, 0.84], n = 299 | Not supported (npm fails; PyPI alone would pass) |
| H5 | Benign flagged below 0.10, each ecosystem | npm 0.00 [0.00, 0.01], n = 300; PyPI 0.08 [0.06, 0.12], n = 300 | Not supported (PyPI's upper bound is 0.12; npm alone would pass) |

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
