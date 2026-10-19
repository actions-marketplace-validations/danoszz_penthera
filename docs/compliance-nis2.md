# Compliance: NIS2 and the cyberwetgeving

Back to the [README](../README.md). Shipping a product? The Cyber Resilience
Act's Article 14 reporting helper and the AI-BOM are in
[compliance-cra.md](compliance-cra.md).

The EU NIS2 directive and its national transpositions (the Cyberbeveiligingswet
in the Netherlands, the NIS2-wet in Belgium) put a duty of care, the *zorgplicht*,
on in-scope organisations. That duty is the set of risk-management measures in
Article 21(2) of the directive. Most of them are organisational. Some are
technical and testable, and that is the part Penthera helps with.

Penthera does not make you compliant and does not certify anything. What it gives
you is automated, repeatable technical evidence for the measures a scanner can
honestly verify: the kind of artefact you can attach to a risk file, show an
auditor, or run in CI so a regression shows up before it ships.

| Art. 21(2) measure | What Penthera does | Coverage |
|--------------------|--------------------|----------|
| **(a)** Risk analysis & information-security policy | Findings, severity, and baseline history feed your risk analysis | Evidence |
| **(b)** Incident handling | `--incident` drafts the 24h / 72h / 1-month reports against your authority's required content | Partial |
| **(c)** Business continuity, backup, crisis management | Organisational; outside a scanner's reach | Out of scope |
| **(d)** Supply-chain security | Known-CVE checks on JS dependencies, leaked credentials, a CycloneDX SBOM (`--sbom`), and passive supplier rating (`--suppliers`) | Partial |
| **(e)** Security in acquisition, development & maintenance; **vulnerability handling** | The core: black- + white-box scanning mapped to OWASP WSTG, SARIF → GitHub, baseline regression, scan-and-fix loop | **Strong** |
| **(f)** Assessing the effectiveness of measures | Baseline diff, re-scan-to-verify, and `--history` tracking of time-to-fix, ageing, and drift | Partial |
| **(g)** Cyber hygiene & training | Remediation playbook + secure-defaults guidance (guidance, not a training programme) | Partial |
| **(h)** Cryptography & encryption | TLS protocol/cipher/certificate audit, HSTS, cookie `Secure` (transport layer only) | Partial |
| **(i)** HR security, **access control**, asset management | Access control tested: JWT, IDOR/BOLA, OAuth redirect, client-side-auth, trust-boundary mapping | Partial |
| **(j)** Multi-factor authentication & secure communications | MFA probe (on the roadmap) | Planned |

**Coverage key:** *Strong* = automated technical testing · *Partial* = part of the
measure · *Evidence* = output feeds the measure, no direct test · *Planned* = on the
roadmap · *Out of scope* = organisational or physical.

In practice, Penthera today gives you solid automated evidence for the
secure-development and vulnerability-handling duty (e), which is the technical
heart of the zorgplicht, plus meaningful coverage of supply chain (d),
cryptography in transit (h), access control (i), and effectiveness testing (f).
That is not the whole duty of care, but it is a real, defensible start you can run
today and re-run on every deploy.

> **Not legal advice, not a certification, not a guarantee of compliance.**
> Penthera automates the technical-testing part of the duty of care. The
> directive's organisational duties (governance, risk-management policy,
> incident-notification processes, supply-chain contracts, staff training) need
> human process and, where it matters, review by a qualified advisor. For an
> authoritative reading, consult your national authority (the NCSC in the
> Netherlands, the CCB and its CyFun framework in Belgium) or a specialised jurist.

Generate this mapping for your own scan with `--framework nis2`. It adds a
per-run coverage table (which measures *this* scan actually exercised, driven by
the probes that ran) to the terminal, Markdown, and JSON reports:

```bash
penthera https://myapp.com --framework nis2 -o reports/scan.json
```

### Readiness report (clone → report in two commands)

Go further than the mapping: combine the scan with a short offline
self-assessment (the organisational measures a scanner can't test, like policies,
backups, training, and MFA) into a full NIS2 readiness report. Every Article 21
measure is marked `met / partial / gap / n-a`, with proportionality notes, your
incident-reporting deadlines, and provenance on every piece of evidence.

```bash
# 1. Create your self-assessment (offline, one-time). Fill in yes | partial | no | na.
penthera --assessment-init assessment.json

# 2. Scan + self-assessment → readiness report (writes reports/scan-readiness.md)
penthera https://myapp.com --repo . --readiness --assessment assessment.json -o reports/scan.json
```

The readiness report is **evidence and self-assessment tooling, not a
certification**. It is provenance-linked (`source, method, collected_at,
confidence`) and reproducible, and it lists exactly what only you can attest to.
Jurisdiction specifics live in [`lib/jurisdictions/nl.json`](../lib/jurisdictions/nl.json) (NL today; BE and
others are just added config).

### Answer a customer's security questionnaire

The questionnaire blocking your deal, drafted from evidence you already have:

```bash
# one question per line, pasted from the customer's form
penthera https://myapp.com --readiness --assessment assessment.json --questionnaire questions.txt
```

Each question is mapped to the Article 21 measure it belongs to and answered
from the scan and your self-assessment, with the backing evidence cited.
Anything Penthera can't map is marked `NEEDS HUMAN INPUT` instead of guessed.
Review every answer before you send it.

### Policy pack

Generate the proportionate written policies NIS2 expects, pre-filled from your
readiness gaps and the NL incident deadlines:

```bash
penthera --policy-pack ./policies --org "Your Company" --readiness --assessment assessment.json
```

Writes editable Markdown starting points: information security, access control,
incident response, backup/continuity, acceptable use, supplier security, and
vulnerability management. **Templates, not legal advice.** Keep them short and
used. A two-page policy that genuinely exists is what "proportionate" means.

### Incident-report helper

NIS2 has hard reporting deadlines (24h early warning, 72h notification, 1-month
final report). If something happens, get the timeline and draft reports:

```bash
penthera --incident-init incident.json   # fill in what happened (set aware_at)
penthera --incident incident.json        # writes incident-reports.md
```

It computes your three deadlines from when you became aware, flags anything
overdue, and drafts the early-warning, notification, and final report against
the required content, with `NEEDS INPUT` where you still have to fill in facts.
**These are drafts to help you meet the deadlines, not a substitute for your
authority's official form.**

### Software bill of materials (SBOM)

Emit a standard CycloneDX SBOM of your dependencies. It's what enterprises
increasingly require of suppliers, and direct evidence for supply-chain security
(measure d):

```bash
penthera --repo . --sbom sbom.cdx.json
```

Parses `package-lock.json` / `package.json` / `requirements.txt` offline (no
network), with resolved versions and package URLs (purls).

### Remediation tracking (the audit loop)

Closing findings matters more than finding them. Track them over time:
time-to-fix, ageing of open items, and what changed since the last scan (evidence
for measure f, effectiveness):

```bash
penthera https://myapp.com --history reports/history.json -o reports/scan.json
```

Each run folds the current findings into a small history keyed by a **stable
fingerprint** (so a re-worded or re-counted finding isn't mistaken for a new
one), then reports open vs resolved, median time-to-fix, and ageing buckets.
Re-run on a cadence to watch the trend.

### Supplier rating (passive)

Assess your suppliers' public security posture for supply-chain risk (measure d):

```bash
printf 'supplier1.com\nsupplier2.com\n' > suppliers.txt
penthera --suppliers suppliers.txt
```

**Strictly passive and public-data-only.** One homepage GET (security headers),
a TLS handshake (certificate), and public DNS lookups (SPF/DMARC/MX) per domain.
No endpoint discovery, no auth probes, no intrusive testing. You get a
red/amber/green rating per supplier. It's a screening aid for your own vendor
risk assessment, **not** an authorised penetration test of the supplier.

Because the mapping targets the NIS2 directive itself, it applies across the
national transpositions; jurisdiction-specific profiles (NL, BE) are on the roadmap.
