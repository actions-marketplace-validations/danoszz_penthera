---
title: How we benchmarked Penthera against {{fact:tools}} free tools, losses included
description: We tuned on one half of four public datasets and scored once on the other, sealed half. What that method is, what it found, and how far to trust it.
date: 2026-10-28
approved: 2026-10-28
sources: bench/public/published.json, bench/public/RESULTS.md, docs/research/prereg/E11b-improvement-study.md
keywords: preregistered benchmark, security tool benchmark, benchmark leakage, sealed test set
---
> How do you benchmark your own security tool against other tools without fooling yourself?

On {{fact:date}} we published four rankings. Each puts Penthera next to every free, open-source tool we could run offline on one public dataset, scored the same way, on a half of the dataset we sealed before any tuning. Penthera ranked {{fact:npm.penthera.place}} of {{fact:npm.of}} on malicious npm packages and {{fact:pypi.penthera.place}} of {{fact:pypi.of}} on malicious PyPI packages. On injection bugs in JavaScript libraries it ranked {{fact:library.penthera.place}} of {{fact:library.of}}, within the margin of error of ODGen. On leaked secrets it ranked {{fact:secrets.penthera.place}} of {{fact:secrets.of}}, behind deepsecrets.

This post is about how we got those numbers and how far you should trust them. Every tool, interval and limit is on [the benchmark pages](/benchmarks).

## Why a sealed half

The easy way to improve a scanner on a benchmark is to look at what it misses and write rules for those cases. The score goes up. It also means less, because the rules now know the answers.

So we split each dataset in half before anyone looked at a single error. The split is seeded (seed 20261024), stratified and 50/50. It was committed as a list of ids and hashes before either half was scored. We tuned on the dev half only. The test half was scored once, at the end, and only its numbers are published. The runner refuses to score the test half without a flag that says it is the final run.

## Rules written before the run

Before the test half was read, we registered how each benchmark ranks:

- Secrets by F1, the balance of precision and recall.
- Malware by Youden's J: the share of malicious packages caught minus the share of benign packages flagged.
- SecBench.js by the share of bugs found in the right file.

A rank needs at least five other free tools measured on the same half. A tool trained on the dataset is shown and not ranked. That rule took out CredSweeper, which scored F1 {{fact:secrets.credsweeper.score}}: it is made by the CredData authors, and its model was trained on CredData. A lookup of already-reported packages is shown and not ranked too, so osv-scanner is not in the malware ranks.

## What a change could be based on

Every improvement had to be a general pattern, stated in words, such as "YAML values are unquoted". Never a file name, a package name or a value from a dataset. Each change got unit tests from our own fixtures, not from dataset content. After tuning, a reviewer who did not write the rules checked every rule and test added since 1.9.0. They found no dataset identifiers, values or package names, and no added indicator of compromise.

## What we found

- **Malicious npm packages.** Penthera caught {{fact:npm.penthera.detect}} packages with a payload ({{fact:npm.penthera.r}}, 95% CI {{fact:npm.penthera.detectCI}}) and flagged {{fact:npm.penthera.benign}} benign packages. Score {{fact:npm.penthera.score}}; next, malcontent with {{fact:npm.malcontent.score}}.
- **Malicious PyPI packages.** Score {{fact:pypi.penthera.score}}; next, GuardDog with {{fact:pypi.guarddog.score}}. Penthera's false-alarm rate was {{fact:pypi.penthera.fa}} (95% CI {{fact:pypi.penthera.benignCI}}). We had set a target of 0.03 and missed it.
- **Injection bugs in JavaScript libraries.** Penthera found {{fact:library.penthera.pooled}} ({{fact:library.penthera.score}}, 95% CI {{fact:library.penthera.pooledCI}}); ODGen found {{fact:library.odgen.pooled}} ({{fact:library.odgen.score}}, 95% CI {{fact:library.odgen.pooledCI}}). The intervals overlap almost entirely. Read it as a tie.
- **Leaked secrets.** deepsecrets scored F1 {{fact:secrets.deepsecrets.score}} and Penthera {{fact:secrets.penthera.score}}. Penthera has higher precision ({{fact:secrets.penthera.p}} against {{fact:secrets.deepsecrets.p}}) and lower recall ({{fact:secrets.penthera.r}} against {{fact:secrets.deepsecrets.r}}).

For scale: Penthera 1.9.0, before the study, scored {{fact:secrets.penthera-before.score}} on secrets and {{fact:library.penthera-before.score}} on SecBench.js on the same test half.

## The drop from dev to test

On the dev half, after tuning, Penthera scored higher on every benchmark than it then did on the sealed half: secrets F1 0.81 to 0.74, SecBench.js 0.88 to 0.70, npm 0.83 to 0.71, PyPI 0.92 to 0.82. That gap is what tuning on the data you score looks like. It is the reason for the split.

## Two test runs, both reported

The first final run was stopped before anyone read it, when we decided on one more round of tuning. Its outputs were packed into one archive, its hash recorded and every readable copy deleted. After round two we opened it and published both runs, so neither was picked after the fact. Secrets and npm scored the same in both. PyPI went from 0.75 to 0.82 and SecBench.js from 0.63 to 0.70. Penthera 1.9.0 scored the same in both runs, so the harness is deterministic.

## The leaks the audit found

The same review found two leaks in the split itself:

- CredData is split by file, so 318 of 329 test repositories also have files on the dev side. Removing the one repository the reviewer flagged moves F1 from 0.742 to 0.738.
- SecBench.js had four packages on both halves. Without them, command injection is 0.77 instead of 0.74.

A clean measure needs new data: malware samples published after the freeze, and real projects.

## What this does not show

- The free tools ran on their defaults. Penthera was tuned on the other half of each dataset.
- CredData replaces real secrets with look-alikes. That favours pattern rules over tools that verify a key with its provider, and trufflehog ran with verification off.
- GuardDog's authors helped build the malware dataset, so its catch rate there is inflated by construction.
- Paid tools ({{fact:paid}}) publish no results on these datasets, and we cannot measure them.
- A benchmark is not your code. Accuracy on real projects is experiment E1, pre-registered and not yet run.

## Check it yourself

- Every number: [published.json](https://github.com/danoszz/penthera/blob/main/bench/public/published.json), shown with every tool on [penthera.org/benchmarks](/benchmarks).
- The protocol, written before the run: [E11b](https://github.com/danoszz/penthera/blob/main/docs/research/prereg/E11b-improvement-study.md).
- Try it on your own repo: `npx penthera@{{fact:secrets.penthera.version}} --repo .`
