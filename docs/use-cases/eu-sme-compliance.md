# Evidence for NIS2 and the CRA: for EU SMEs

## The problem

NIS2 puts a duty of care on in-scope organisations, written into national law
(the Cyberbeveiligingswet in the Netherlands, the NIS2-wet in Belgium). The
Cyber Resilience Act adds reporting duties for manufacturers of products with
digital elements, with deadlines measured in hours. Large customers now send
security questionnaires as part of procurement. A small company has to show
that it tests, fixes and records, without a compliance team or a budget for a
platform.

## What to run

```bash
penthera --assessment-init assessment.json          # once: the organisational measures a scanner cannot test
penthera https://staging.example.com --repo . \
  --framework nis2 --readiness --assessment assessment.json \
  --sbom sbom.cdx.json --evidence evidence/2026-10-19 --sign-key ~/.ssh/id_ed25519
```

That run writes the scan, an Article 21(2) coverage table, a readiness report
with every measure marked met, partial, gap or not applicable, a CycloneDX SBOM,
and a hashed, SSH-signed evidence bundle an auditor can verify with standard
tools.

Around it:

```bash
penthera --policy-pack ./policies --org "Your Company" --readiness --assessment assessment.json
penthera https://example.com --readiness --assessment assessment.json --questionnaire questions.txt
penthera --cra-init cra.json && penthera --cra cra.json   # CRA Article 14 timeline and drafts
penthera --repo . --aibom aibom.cdx.json                  # CycloneDX 1.6 AI-BOM
```

## What you get

The CRA helper prints the deadlines and writes draft reports, marking every fact
it still needs:

```
CRA Article 14 report drafts written to cra-reports.md
  Early warning (24 hours): n/a, set aware_at
  Vulnerability notification (72 hours): n/a, set aware_at
  Final report (14 days after a corrective or mitigating measure is available): ...
  ⚠️ No valid `aware_at` timestamp, so deadlines can't be computed. Set when you became aware (ISO 8601) and re-run.
```

The questionnaire helper answers each question from your scan and
self-assessment, cites the evidence, and marks anything it cannot map as
`NEEDS HUMAN INPUT` instead of guessing. Guides:
[NIS2](../compliance-nis2.md), [CRA](../compliance-cra.md),
[evidence bundles](../evidence.md).

## What it does not do

- It is readiness tooling, not a certification and not legal advice. Whether you
  are in scope, and what is proportionate for you, is for you and your advisers
  to decide.
- It covers the technical, testable part of the duty of care. Policies,
  training, backups and MFA come from your self-assessment; Penthera records
  what you attest, it cannot check it.
- It does not file anything. Reports to a CSIRT or ENISA are drafts for you to
  review and submit.
- Jurisdiction details ship for the Netherlands today; other member states are
  configuration still to be added.

[All use cases](README.md) · [Back to the README](../../README.md)
