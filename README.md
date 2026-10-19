<div align="center">

<img src="assets/penthera-social.jpg" alt="Penthera, a security scanner for Claude, Cursor and CLI" width="840">

<br/><br/>

[![npm](https://img.shields.io/npm/v/penthera?color=0000ed)](https://www.npmjs.com/package/penthera)
![node](https://img.shields.io/badge/node-%E2%89%A522-0000ed)
![license](https://img.shields.io/badge/license-MIT-0000ed)
[![CI](https://github.com/danoszz/penthera/actions/workflows/ci.yml/badge.svg)](https://github.com/danoszz/penthera/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/danoszz/penthera/badge)](https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera)

<br/>

<img src="assets/demo.gif" alt="Penthera running an interactive security scan in the terminal" width="760">

</div>

---

## Two ways to use it

**As an Agent Skill (recommended).** Most people start here. Let Cursor or Claude
Code drive it: [install once](#run-it), then ask it to "scan my app for security
issues." The agent picks the scan, runs it, and gives you the fixes.

**As a CLI.** Prefer the terminal? Run `penthera https://myapp.com`, or just
`penthera` for the guided wizard. See the [quick start](#quick-start).

---

## Why Penthera

You shipped something fast: vibecoded, AI-assisted, already live. The same models
that helped you build it also make it easy for someone to probe it. Exposed API
routes, missing security headers, weak auth, a hardcoded key in the repo. These
are the common mistakes that get apps broken into. An AI provider key in the
frontend bundle is the newest and most expensive of them.

Penthera is the check you run before you launch. Ask your agent to "scan my app
for security issues" and it runs an authorized, non-destructive scan, then lists
the top fixes in priority order. You do not need a DAST suite or a security
background to use it.

Penthera is for hardening systems you own. It is powerful, so please use it
carefully. See [Ethical use](#ethical-use--authorization) and the [Disclaimer](#disclaimer).

Shipping in the EU? Penthera also generates your
[NIS2 readiness report, policy pack, incident-report drafts, SBOM, and prefilled
customer security questionnaires](#compliance-nis2-and-the-cyberwetgeving).
Offline, no accounts. Readiness tooling, not a certification.

### What you get

```
  Findings

  HIGH  IDOR/BOLA: GET /api/users/{user_id}
         http://localhost:3000/api/users/1 → 200
  HIGH  OAuth open redirect
         http://localhost:3000/api/oauth/callback?redirect_uri=... → 302
  MED   Missing Content-Security-Policy
  MED   No login rate limiting detected
         http://localhost:3000/api/login → 401
  LOW   Missing X-Frame-Options
  INFO  Missing Referrer-Policy

  ──────────────────────────────────────────────────────────
  2 high · 5 medium · 2 low · 2 info
```

Every finding carries a confidence label (`confirmed`, `likely`, `potential`,
`needs-human-review`), so a heuristic never poses as a certainty. Reports come
out as Markdown, JSON, and SARIF, with the fixes in priority order.

---

## Run it

**One-line install** (clones the repo, links the CLI, and installs the skill into
Cursor and Claude Code if it finds them):

```bash
curl -fsSL https://raw.githubusercontent.com/danoszz/penthera/main/install.sh | bash
```

**Or via the Agent Skills CLI** (Cursor, Claude Code, and [40+ agents](https://agentskills.io/clients)):

```bash
npx skills add danoszz/penthera
```

Then talk to your agent:

```
"Scan my localhost:3000 for security issues"
"Run a pre-deploy security audit on staging.myapp.com"
"Find hardcoded secrets in this repo before I push"
```

**Or try it with no install at all:**

```bash
npx penthera https://your-app.example
```

Prefer the terminal? Run `penthera` with no arguments for a guided wizard.

> The skill adds an authorization gate: it instructs your agent to refuse targets
> you do not own or are not authorized to test.

---

## What it does

| Mode | Command | Coverage |
|------|---------|----------|
| **URL scan** | `penthera https://example.com` | TLS, fingerprinting, endpoint discovery, templates, CORS, cookies, JS CVEs, param discovery, OpenAPI/FastAPI probes, security headers, auth hardening |
| **Repo scan** | `penthera --repo ./my-app` | API route discovery (Next.js, Express, Hono, Fastify), trust-boundary mapping, hardcoded-secret scanning (including Anthropic, OpenAI, Gemini, Groq, Hugging Face and other AI provider keys) |
| **Combined** | `penthera https://staging.app --repo .` | Black-box and white-box in one run |
| **Interactive** | `penthera` *(no args)* | Guided wizard (URL plus optional repo scan, Markdown report) |
| **Machine audit** | `penthera --machine` | macOS checks (keyloggers, persistence, rootkits) |

Pick a profile, or add individual flags for more depth:

| Profile | Command | What runs |
|---------|---------|-----------|
| **quick** | `--profile quick` | Headers, OpenAPI, auth smoke tests (about 10s) |
| **standard** | *(default)* | Full non-destructive scan |
| **deep** | `--profile deep` | recon, injection probes, and API fuzzing |

Individual flags: `--recon`, `--deep`, `--fuzz`, `--adaptive`, `--nuclei <path>`, `--templates <dirs>`, `--all`

---

## How it works

```mermaid
flowchart LR
    U["You / your AI agent"] -->|scan request| P((Penthera))

    P --> BB["Black-box<br/>TLS, headers, CORS<br/>endpoint + OpenAPI discovery<br/>JWT, auth, IDOR/OAuth<br/>injection, fuzzing"]
    P --> WB["White-box<br/>API routes<br/>secret scanning<br/>trust boundaries"]
    P --> MA["Machine audit<br/>(macOS)"]

    BB --> F[["Findings<br/>scored by severity"]]
    WB --> F
    MA --> F

    F --> T["Terminal summary<br/>+ top 3 fixes"]
    F --> MD["Markdown report"]
    F --> J["JSON"]
    F --> S["SARIF to GitHub Security"]
```

Findings map to the [OWASP Web Security Testing Guide](docs/owasp-wstg-coverage.md)
(WSTG v4.2). The default scan is non-destructive. Payload-based testing is opt-in
(`--deep`, `--fuzz`, `--all`) and gated behind explicit confirmation.

---

## Quick start

```bash
# First time? Run with no args for guided setup
penthera

# Safe default scan (non-destructive)
penthera https://myapp.com

# Staging plus source code, full report set
penthera https://staging.myapp.com --repo . --all -o reports/scan.json --sarif reports/scan.sarif

# Baseline diff: show only new findings since the last scan
penthera https://myapp.com -o reports/scan.json --baseline reports/previous.json

# Authenticated scan (session cookie or bearer token)
PENTHERA_BEARER=eyJ... penthera https://myapp.com --profile standard
penthera https://myapp.com --auth-cookie "session=abc123"
```

Writing to `-o reports/scan.json` also drops a human-readable `reports/scan.md`
next to it. Reports are gitignored by default.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No critical or high findings |
| `1` | Critical or high findings detected |
| `2` | Scan failed (unreachable target, bad config) |

---

## Output

| Format | Flag | Use |
|--------|------|-----|
| Terminal | *(default)* | Colored summary plus top 3 fixes |
| **Markdown** | `--markdown file.md` or `-o file.json` | Human-readable report (exec summary, findings tables, fixes). Written next to `-o` automatically |
| JSON | `--json` or `-o file.json` | CI pipelines, baseline diffs, custom tooling |
| SARIF | `--sarif file.sarif` | GitHub Security / Code Scanning tab |

---

## For your AI coding agent

Penthera ships as an [Agent Skill](https://agentskills.io), the open format used
by Cursor, Claude Code, Claude.ai, and [40+ agent tools](https://agentskills.io/clients).
The skill teaches an agent to run authorized scans, pick the right profile, and
summarize findings, so you can just describe what you want.

**Install** (any of these):

```bash
# Cross-agent, frictionless
npx skills add danoszz/penthera

# Or the one-line installer (also links the CLI)
curl -fsSL https://raw.githubusercontent.com/danoszz/penthera/main/install.sh | bash

# Or copy into a single project for team sharing
cp -r skills/penthera .cursor/skills/penthera     # Cursor
cp -r skills/penthera .claude/skills/penthera     # Claude Code
```

Or as a Claude Code plugin (installs the skill):

```bash
/plugin marketplace add danoszz/penthera
/plugin install penthera@penthera
```

For Claude.ai (web), zip and upload the skill:

```bash
npm run package:skill   # produces penthera-skill.zip; upload in Settings > Capabilities > Skills
```

**Prompts that trigger it:**

- "Scan my localhost app on port 3000 for security issues"
- "Run a pre-deploy audit on staging.myapp.com and summarize critical findings"
- "Scan this repo for hardcoded secrets and exposed API routes"
- "Compare today's scan to last week's baseline and show only new findings"
- "Generate a SARIF report for GitHub code scanning"

The skill adds an authorization gate: it instructs the agent to refuse targets you
do not own or are not authorized to test, and the wizard asks you to confirm before
scanning a remote host. It is an agent-level and interactive safeguard, not something
the raw CLI enforces. You are responsible for every target you pass it. Run preflight
before the first scan:

```bash
bash skills/penthera/scripts/preflight.sh http://localhost:3000
```

Skill source and workflows live in [`skills/penthera/SKILL.md`](skills/penthera/SKILL.md).

---

## Scan and fix

Penthera does not just report problems. It closes the loop: ask your agent to fix what it finds, and it detects the issue, applies a framework-aware fix to your code (shown as a diff for you to approve), and re-scans to prove it is resolved.

```
"Scan my app and fix what you find"
"Fix the security headers on my Next.js app and re-scan to confirm"
"Find and fix hardcoded secrets in this repo"
```

Fixes come from a [remediation playbook](skills/penthera/references/remediation.md) covering Next.js, Express, Fastify, Hono, and FastAPI. They are always shown as diffs for your approval and verified by a re-scan; nothing is applied blindly, and nothing touches production. To build secure-by-default in the first place, see [secure defaults](skills/penthera/references/secure-defaults.md).

---

## Compliance: NIS2 and the cyberwetgeving

Shipping in the EU? NIS2 (the Cyberbeveiligingswet in the Netherlands, the
NIS2-wet in Belgium) puts a duty of care on in-scope organisations. Penthera
turns the technical, testable part of that duty into repeatable evidence, and
helps with the paperwork around it. Offline, no accounts.

| Command | What you get |
|---------|--------------|
| `--framework nis2` | Per-run Article 21(2) coverage table in every report |
| `--readiness --assessment a.json` | Full readiness report: every measure marked met / partial / gap |
| `--questionnaire questions.txt` | Customer security questionnaire drafted from your evidence |
| `--policy-pack ./policies` | Proportionate policy templates, prefilled from your gaps |
| `--incident incident.json` | 24h / 72h / 1-month incident report drafts and deadlines |
| `--sbom sbom.cdx.json` | CycloneDX software bill of materials |
| `--history history.json` | Time-to-fix, ageing, and drift across scans |
| `--suppliers suppliers.txt` | Passive red/amber/green rating of your suppliers |

**Full guide, the measure-by-measure coverage table, and the limits:**
[docs/compliance-nis2.md](docs/compliance-nis2.md).

> Readiness tooling, not a certification and not legal advice.

---

## CI integration

```yaml
# Scan a staging URL on a schedule and upload results to GitHub Security.
- run: npx penthera@1.2.0 "$PENTEST_URL" --profile standard --sarif reports/scan.sarif
- uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: reports/scan.sarif
```

Copy the full workflow from
[`docs/examples/github-actions-scan.yml`](docs/examples/github-actions-scan.yml)
into your app's repo. Pin the Penthera version so a scheduled run never picks up
code you have not reviewed.

Penthera's own CI runs the full test suite on Node 22 and 24, self-scans a mock
vulnerable API on every push, and runs CodeQL and OpenSSF Scorecard.

---

## Ethical use & authorization

Penthera sends HTTP requests to the targets you give it. Some modes (`--deep`,
`--fuzz`, `--all`) send attack payloads designed to find vulnerabilities. Use it
responsibly.

**You may use Penthera when:**

- You **own** the target (your app, your server, your project).
- You have **written authorization** from the system owner (email, ticket, signed scope).
- You scan **localhost** or private lab environments you control.
- You use it for **defensive security**: research, coursework, CI hardening, pre-release audits.

**You must not use Penthera to:**

- Scan systems you do not own or lack explicit permission to test.
- Probe government, healthcare, financial, or third-party production systems without authorization.
- Exfiltrate data, disrupt services, or bypass access controls.
- Use findings to attack, extort, or harm anyone.

> Before scanning any URL that is not localhost, confirm you have permission.
> **When in doubt, do not scan.**

Unauthorized security testing may violate computer-misuse laws (for example the US
CFAA, the UK Computer Misuse Act, and EU national equivalents) and can result in
criminal prosecution, civil liability, IP blocking, account termination, and
academic or professional penalties.

---

## Install

The [one-line installer](#run-it) is the fastest path. To set it up manually:

```bash
git clone https://github.com/danoszz/penthera.git
cd penthera
npm install
npm link            # exposes `penthera` and `penthera-scan` globally
penthera --version
```

Requirements: Node.js 22+ and npm. Optional: nuclei-templates for `--nuclei`, and
Docker. To run it in a container:

```bash
docker build -t penthera .
docker run --rm penthera https://your-app.example
```

---

## Configuration

For live integration tests against your own routes:

```bash
cp pentest.config.example.js pentest.config.js   # gitignored
```

Edit the route groups, then run `npm run pentest:live`. Set `PENTEST_BASE_URL` to
point at staging without editing the file.

---

## Testing & contributing

```bash
npm test                 # full suite (live integration tests skip without a running target)
npm run pentest:mock     # offline tests against a local mock vuln API
npm run mock-server      # start the mock API on port 8765
```

See the [roadmap](ROADMAP.md) for what is next, including auditing the skills,
MCP servers, and plugins in your AI toolchain, and what is deliberately not
planned.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout, how to add a probe
or template, the test matrix, and the release and publishing checklist.

---

## Methodology and accuracy

How Penthera decides what is a finding, how sure it is, and what it cannot
see is written up in [docs/METHODOLOGY.md](docs/METHODOLOGY.md), with every
design choice tied to published research or a standard
([references](docs/references.md)). Reports carry the same citations: each
finding gets a "Why this matters / Sources" line, and SARIF rules link to their
source.

Accuracy is measured, not claimed. `npm run bench` scans local labelled
targets offline and scores precision and recall; the current run is 19 true
positives, 3 false positives and 2 false negatives (precision 0.86, recall
0.90). The [results](bench/RESULTS.md) list every miss and false alarm, and
the [benchmark README](bench/README.md) explains the method and its limits.

To cite Penthera, use the "Cite this repository" button on GitHub
([CITATION.cff](CITATION.cff)).

---

## Status

**v1.2, production-ready.** URL, repo, and machine scanning, NIS2 readiness tooling, scan profiles,
Markdown, JSON, and SARIF reports, session-aware auth, JWT, IDOR, OAuth, and
header probes, adaptive knowledge-graph probing, a plugins and templates API,
Docker, CI, and the Agent Skill are all shipped. See the [CHANGELOG](CHANGELOG.md)
for the full history.

Penthera is actively maintained. Issues and PRs welcome.

---

## Support Penthera

Penthera is free and MIT-licensed. If it caught something before you shipped it,
you can help keep it maintained:

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub-db61a2?logo=githubsponsors)](https://github.com/sponsors/danoszz)

Sponsorship funds new probes, broader framework coverage, and keeping the suite
current with new attack patterns. Thank you.

---

## Privacy

Penthera has no telemetry. It does not collect, store, or transmit any usage data, analytics, or personal information to the author or any third party. It does not phone home.

- **Scan traffic goes only to the target you specify.** Auth tokens passed via `--auth-bearer`, `--auth-cookie`, or `PENTHERA_*` env vars are sent only to that target.
- **Reports stay local.** Output is written to `reports/` (gitignored) on your machine.
- **JS vulnerability checks** download a public database (Retire.js) from GitHub to compare your app's libraries against known CVEs locally. No details about your target are sent.
- **Recon mode** (`--recon`) queries public OSINT sources (crt.sh, web.archive.org, AlienVault OTX) with the target domain to find subdomains and historical URLs. This shares the target domain with those third-party services. Omit `--recon` to avoid it.

You are responsible for ensuring you are authorized to scan any target. See [Ethical use](#ethical-use--authorization).

---

## Disclaimer

Penthera is provided for legitimate security research and defensive testing of
systems you own or are authorized to test, and for that purpose only.

- It is a research and self-assessment tool. Scan your own apps to find and fix
  weaknesses before attackers do.
- The same capabilities that harden a system can cause harm if pointed at someone
  else's. Use it carefully and lawfully.
- The author does not condone unauthorized or malicious use, and accepts no
  liability for any damage, loss, or legal consequence arising from use or misuse
  of this software.
- The software is provided "as is", without warranty of any kind. See [LICENSE](LICENSE) (MIT).
- You are solely responsible for ensuring every scan you run is authorized and
  legal in your jurisdiction.

By using Penthera you accept these terms.

---

## License & disclosure

MIT. See [LICENSE](LICENSE). Report vulnerabilities in Penthera itself via
[SECURITY.md](SECURITY.md). Only scan systems you own or are authorized to test.
