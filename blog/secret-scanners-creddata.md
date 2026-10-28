---
title: We benchmarked {{fact:secrets.of}} free secret scanners on {{fact:secrets.n}} labelled secrets. We came {{fact:secrets.penthera.place}}.
description: gitleaks, trufflehog, deepsecrets, Nosey Parker and five more on Samsung CredData's sealed half, with intervals, the limits, and where Penthera loses.
date: 2026-10-28
approved: 2026-10-28
sources: bench/public/published.json, bench/public/RESULTS.md, docs/research/prereg/E11b-improvement-study.md
keywords: secret scanner benchmark, gitleaks vs trufflehog, open source secret scanner, CredData
---
> Which free secret scanner finds the most leaked secrets, on data none of them wrote?

On the sealed test half of Samsung CredData ({{fact:secrets.n}} labelled secrets), deepsecrets ranked first of {{fact:secrets.of}} free tools with F1 {{fact:secrets.deepsecrets.score}}. Penthera {{fact:secrets.penthera.version}} ranked {{fact:secrets.penthera.place}} with {{fact:secrets.penthera.score}}. Nosey Parker was close behind with {{fact:secrets.noseyparker.score}}. Read the limits below before you use any of these numbers. Every tool, with its counts, is on [the secrets benchmark page](/benchmarks/secrets).

## The ranking

F1 balances precision (how many reported secrets were real) and recall (how many real secrets were reported). Intervals are 95% Wilson.

- deepsecrets: F1 {{fact:secrets.deepsecrets.score}}. Precision {{fact:secrets.deepsecrets.p}} ({{fact:secrets.deepsecrets.precisionCI}}), recall {{fact:secrets.deepsecrets.r}} ({{fact:secrets.deepsecrets.recallCI}}).
- Penthera: F1 {{fact:secrets.penthera.score}}. Precision {{fact:secrets.penthera.p}} ({{fact:secrets.penthera.precisionCI}}), recall {{fact:secrets.penthera.r}} ({{fact:secrets.penthera.recallCI}}).
- Nosey Parker: F1 {{fact:secrets.noseyparker.score}}. Precision {{fact:secrets.noseyparker.p}}, recall {{fact:secrets.noseyparker.r}}.
- gitleaks: F1 {{fact:secrets.gitleaks.score}}. Precision {{fact:secrets.gitleaks.p}}, recall {{fact:secrets.gitleaks.r}}.
- ripsecrets {{fact:secrets.ripsecrets.score}}, kingfisher {{fact:secrets.kingfisher.score}}, detect-secrets {{fact:secrets.detect-secrets.score}}, secretlint {{fact:secrets.secretlint.score}}, whispers {{fact:secrets.whispers.score}}, trufflehog {{fact:secrets.trufflehog.score}}.

The median F1 of the other free tools was {{fact:secrets.median.f1}}.

## Where Penthera loses

deepsecrets finds more. Its recall is {{fact:secrets.deepsecrets.r}} against Penthera's {{fact:secrets.penthera.r}}, and the intervals do not overlap. Penthera reports fewer false hits: precision {{fact:secrets.penthera.p}} against {{fact:secrets.deepsecrets.p}}. If missing a secret costs you more than reading a false alarm, that trade goes the wrong way for you.

kingfisher has the highest precision of the ranked tools, {{fact:secrets.kingfisher.p}}, at a recall of {{fact:secrets.kingfisher.r}}.

## gitleaks and trufflehog

These two are what most teams run, and the comparison pages people search for have no measurements. Here, gitleaks scored F1 {{fact:secrets.gitleaks.score}} and trufflehog {{fact:secrets.trufflehog.score}}. That gap undersells trufflehog, for two reasons:

- trufflehog's main feature is verifying a key with its provider. Every tool ran offline, so verification was off.
- CredData replaces every real secret with random characters of the same shape. A verified-secrets tool has nothing real to verify, and a pattern tool loses nothing.

So read this as "gitleaks finds more look-alike secrets in source files than trufflehog does without verification", not as "gitleaks is the better tool".

## Not ranked

CredSweeper scored F1 {{fact:secrets.credsweeper.score}}. It is made by the CredData authors, and its model was trained with CredData, so it is shown and not ranked. Semgrep's secrets rules were skipped: they download from the Semgrep registry at scan time and cannot run offline.

## The limits

- CredData's labels lean partly on other scanners' output.
- CredData is split by file, so most repositories have files on both halves. The leakage audit found that removing the one repository it flagged moves Penthera's F1 from 0.742 to 0.738.
- Penthera was tuned on the dev half; the other tools ran on their defaults.
- Paid scanners ({{fact:paid}}) publish no results on CredData, and we cannot measure them.
- CredData is not your code.

## Check it yourself

- Every number: [published.json](https://github.com/danoszz/penthera/blob/main/bench/public/published.json) and [the secrets page](/benchmarks/secrets).
- The method and the protocol: [how we benchmarked against the free tools](/blog/sealed-half-benchmark), and [E11b](https://github.com/danoszz/penthera/blob/main/docs/research/prereg/E11b-improvement-study.md).
- Scan your own repo for secrets: `npx penthera@{{fact:secrets.penthera.version}} --repo .`
