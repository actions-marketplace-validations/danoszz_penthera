### Leaked secrets (Samsung CredData)

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

### Malicious npm packages (DataDog)

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

### Malicious PyPI packages (DataDog)

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

### Injection bugs in JavaScript libraries (SecBench.js)

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

A rank is shown only where at least 5 other free tools were measured; otherwise "–".

Paid tools (GitGuardian, Socket, Snyk, Phylum, Semgrep Pro) publish no results on these benchmarks, so they are not in the tables.

Published elsewhere, on other datasets (context, not comparable):

- [A comparative study of software secrets reporting by secret detection tools (2023): nine tools on SecretBench, ggshield included](https://arxiv.org/abs/2307.00714)
- [How effective are npm malicious package detectors? (2026): eleven detectors on their own benchmark](https://arxiv.org/abs/2603.27549)
- [Cutting the Gordian knot: detecting malicious PyPI packages (USENIX Security 2026): GuardDog, Bandit4Mal and OSSGadget on PyPI](https://arxiv.org/abs/2601.16463)
- [Study of JavaScript static analysis tools for vulnerability detection in Node.js packages (2023): nine tools incl. CodeQL, NodeJsScan, ODGen](https://www.researchgate.net/publication/367088656)

¹ Not ranked: trained on this dataset by its authors. ² Found most samples in this dataset, so its rate is inflated by construction. ³ Not ranked: a lookup of already-reported packages, not detection.
