<div align="center">

<img src="assets/penthera-social.jpg" alt="Penthera: Cyber Security Agent" width="840">

<br/><br/>

**Penthera: Cyber Security Agent. Open-source security for the apps and AI systems you ship.**

<br/>

[![npm](https://img.shields.io/npm/v/penthera?color=0000ed)](https://www.npmjs.com/package/penthera)
![node](https://img.shields.io/badge/node-%E2%89%A522-0000ed)
![license](https://img.shields.io/badge/license-MIT-0000ed)
[![CI](https://github.com/danoszz/penthera/actions/workflows/ci.yml/badge.svg)](https://github.com/danoszz/penthera/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/danoszz/penthera/badge)](https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera)

<br/>

<img src="assets/demo.gif" alt="Penthera running an interactive security scan in the terminal" width="760">

<br/><br/>

| `penthera ui`, dark | `penthera ui`, light |
|---|---|
| ![The dashboard in the dark theme: projects, findings, and a finding's detail](assets/dashboard/ui-dark.jpg) | ![The dashboard in the light theme: all projects and the side cards](assets/dashboard/ui-light.jpg) |

</div>

---

## The problem

Teams now ship apps and AI agents faster than anyone can secure them. AI writes
much of the code and pulls in the packages, MCP servers, and skills, and on most
teams nobody works on security full time. Attackers have adapted: 2025 and 2026
brought self-spreading npm worms that hijacked AI coding tools, malicious MCP
servers, poisoned agent skills, and leaked AI provider keys. Penthera does the
repeatable security work on your own machine, with rules you can read, so the
people you have can spend their time on judgement.

## Get started

One command in your project folder, no install, no account:

```bash
npx penthera
```

This is the guided start (`penthera init`). Penthera detects your setup
offline, asks what to check, and runs the code, dependency, and AI-tooling
checks. It scans your running app only after you confirm the app is yours. You
get a grade per area, the three things to fix first, and one report folder.
Then it offers, one yes or no at a time, the pre-commit hook, a CI workflow, and
the dashboard. Nothing is committed or pushed. Details are in
[docs/commands/init.md](docs/commands/init.md).

When you know what you want, run it directly:

```bash
npx penthera http://localhost:3000 --repo .   # scan the app you are about to ship, and its source
npx penthera deps                             # what can the packages in this project actually do?
npx penthera agents --home                    # audit your Claude Code, Cursor and MCP setup
npx penthera ui                               # open the local dashboard on 127.0.0.1
```

To let your coding agent drive it, add the Agent Skill, then ask "scan my app
for security issues" or "is this package safe to add?":

```bash
npx skills add danoszz/penthera
```

The skill tells your agent to refuse targets you do not own or are not
authorized to test. Other install routes (the one-line installer, the Claude
Code plugin, a per-project copy) are in [docs/commands/skill.md](docs/commands/skill.md).
Penthera needs Node.js 22 or later. To run it in a container:
`docker build -t penthera . && docker run --rm penthera https://your-app.example`.


## What it does

### Before you deploy

| Job | What Penthera does | Command |
|---|---|---|
| Test the app | Scans your localhost or preview URL (TLS, headers, CORS, auth, JWT, IDOR, OAuth, OpenAPI; injection and fuzzing on request) and your repository (routes, trust boundaries, secrets including AI keys) | [`penthera <url> --repo .`](docs/commands/scan.md) |
| Fix and verify | Applies deterministic fixes on a local branch, re-scans to prove they worked, and remembers the result. Never pushes | [`penthera agent --loop`](docs/commands/fix.md) |
| Block it at commit time | Stops secrets, risky agent config, and dependency changes before they are committed | [`penthera hook install`](docs/commands/hook.md) |

### What you build with

| Job | What Penthera does | Command |
|---|---|---|
| Vet dependencies | Shows what every npm and Python package can do (install scripts, shell, network, env, obfuscation), what an upgrade added, lookalike names, and licenses | [`penthera deps --base main`](docs/commands/deps.md) |
| Guard installs | Shows what a new package brings before any install script runs, and stops it under your policy | [`penthera install <pkg>`](docs/commands/install.md) |
| Review pull requests | Comments the dependency capability diff on every PR that touches the lockfile | [GitHub Action](docs/commands/action.md) |
| Audit your AI tooling | Checks skills, MCP servers, hooks, plugins, and rule files for hidden instructions, unpinned servers, over-broad permissions, and silent updates | [`penthera agents --home`](docs/commands/agents.md) |

### After you ship

| Job | What Penthera does | Command |
|---|---|---|
| Report and prove | Writes reports for developers, owners, and auditors; a hashed, signable evidence bundle; NIS2 and CRA readiness reports and drafts | [`penthera <url> --audience auditor --evidence out/`](docs/evidence.md) |
| See it all | A local dashboard on 127.0.0.1: one view with your projects, findings in plain words, history, side panels for dependencies, AI tooling and evidence, and the fix loop with Apply, Skip, and Stop per diff | [`penthera ui`](docs/dashboard.md) |
| Keep watching | Scheduled checks of your production for drift: certificates, headers, new endpoints, keys in bundles, new CVEs in your SBOM | on the [roadmap](ROADMAP.md) |

Every finding carries a severity, a confidence label (`confirmed`, `likely`,
`potential`, `needs-human-review`), its evidence, and the research behind it.
Reports come out as Markdown, JSON, and SARIF for GitHub code scanning. Exit
code `1` means critical or high findings. Every command and flag is in
[docs/commands/](docs/commands/README.md).

Penthera is not a human pentester, a 24/7 SOC, or incident response. It does
the checks that can be automated reliably and says plainly which ones need a
person.

## Why you can trust it

- **Local and offline.** No account, no telemetry, no cloud. `--offline` limits
  network traffic to the target you named, and every report lists the hosts it
  contacted.
- **Deterministic.** Rules you can read, with `file:line` evidence. No model
  decides what is malicious.
- **Non-destructive by default.** The default scan sends only requests a
  browser would send. Payload testing (`--deep`, `--fuzz`, `--all`) is opt-in
  and asks for confirmation.
- **Never acts behind your back.** The fix loop works on a local branch, asks
  before every change by default, and never pushes or opens pull requests.
- **No update channel to hijack.** Detection rules ship inside reviewed
  releases. Nothing is downloaded and executed at run time.
- **Releases you can verify.** npm provenance through trusted publishing, a
  maintainer approval with 2FA for every version, SHA-pinned CI, CodeQL, and
  OpenSSF Scorecard. Every release passes an
  [internal audit](docs/internal-audit.md) of eight gates
  ([latest report](audit/REPORT.md)).

## Research and methodology

Penthera's method is written down and tied to the literature. The
[methodology](docs/METHODOLOGY.md) states the threat model, separates what
black-box (HTTP) and white-box (source) analysis can and cannot observe, and
defines a confidence model that keeps heuristics from posing as facts. Each
probe has explicit false-positive controls, such as randomized canaries and
repeated timing measurement, and each design choice cites the research or
standard it rests on: 49 verified references, listed in APA style in
[docs/references.md](docs/references.md).

| Measure | Result |
|---|---|
| Precision on the bundled benchmark | 0.86 (19 true positives, 3 false positives) |
| Recall on the bundled benchmark | 0.90 (2 misses, [each one explained](bench/RESULTS.md)) |
| Requests to non-loopback hosts during the benchmark | 0 |
| Detection rules, all readable | 14 URL scan templates, 20 secret and AI-key patterns, 15 dependency capabilities, 39 AI-tooling rules, 5 fix recipes |

The benchmark targets are small and were written by the same people as the
scanner, so the numbers catch regressions rather than measure real-world
accuracy ([limits](bench/RESULTS.md#limits-of-these-numbers)). Counts as of
2026-10-19; refresh them with `npm run docs:numbers` and `npm run bench`.

**Cite this repository.** Use the button on GitHub, or the metadata in
[CITATION.cff](CITATION.cff). The APA and BibTeX forms are in the
[methodology](docs/METHODOLOGY.md#how-to-cite).

## How it fits with other tools

Penthera works next to the tools you already use. Its SARIF output goes
straight into GitHub code scanning, for example. Each comparison page says where
the other tool goes further and how to run the two together.

| | Focus | Where it runs | How it decides |
|---|---|---|---|
| **Penthera** | Your app, dependencies, and AI tooling; fixes; EU evidence | Your machine or CI, offline | Readable deterministic rules, with evidence |
| [Socket](docs/compare/socket.md) | Supply-chain risk across package registries | Cloud service, GitHub App, CLI | Registry-scale package analysis, including AI review |
| [Snyk](docs/compare/snyk.md) | Known vulnerabilities in dependencies, code, containers, IaC | Cloud service, IDE, CLI | Curated vulnerability database plus static analysis |
| [GitHub Dependabot and code scanning](docs/compare/github.md) | Known-CVE alerts, update PRs, CodeQL | GitHub | Advisory database, CodeQL queries |
| [OWASP ZAP](docs/compare/zap.md) | Dynamic testing of web apps | Your machine or CI | Active and passive scan rules |
| [Semgrep](docs/compare/semgrep.md) | Static analysis of your own code | Your machine, CI, cloud platform | Pattern rules, plus a paid cross-file engine |

All comparisons: [docs/compare/](docs/compare/README.md). Corrections are
welcome by pull request.

## Use cases

| You are | Start here |
|---|---|
| A solo founder or vibecoder about to launch | [Before launch](docs/use-cases/solo-founder.md) |
| A team adopting Claude Code or Cursor | [The AI-tooling supply chain](docs/use-cases/ai-coding-teams.md) |
| An open-source maintainer | [For maintainers](docs/use-cases/open-source-maintainers.md) |
| An EU SME with NIS2 or CRA duties | [Evidence for NIS2 and the CRA](docs/use-cases/eu-sme-compliance.md) ([NIS2 guide](docs/compliance-nis2.md), [CRA guide](docs/compliance-cra.md)) |
| An agency shipping client apps | [A repeatable handover check](docs/use-cases/agencies.md) |

Compliance output is readiness tooling. It is not a certification and not
legal advice.

## Privacy

Penthera has no telemetry and does not phone home. Scan traffic goes to the
target you name, reports stay on your machine, and every scan lists any
third-party host it contacted. With `--offline`, the HTTP client refuses every
host except the target. Which hosts a normal scan may contact, and why, is in
[docs/privacy.md](docs/privacy.md).

## Ethics and authorization

Penthera sends HTTP requests to the targets you give it, and some modes
(`--deep`, `--fuzz`, `--all`) send attack payloads. Scan only what you own, what
you have written authorization to test, or local environments you control.
Do not use it to probe third-party systems, exfiltrate data, disrupt services,
or harm anyone. Unauthorized testing may break computer-misuse laws such as the
US CFAA, the UK Computer Misuse Act, and their EU equivalents. When in doubt, do
not scan.

The software is provided "as is", without warranty, for defensive testing of
systems you own or are authorized to test. The author accepts no liability for
misuse, and you are responsible for making sure every scan you run is lawful.

## Contributing and support

Clone the repository and run `npm install`, then `npm test` for the suite and
`npm run bench` for precision and recall.
[CONTRIBUTING.md](CONTRIBUTING.md) covers the project layout and the release
checklist, and the [roadmap](ROADMAP.md) shows what is next. Issues and pull
requests are welcome.

Penthera is free. If it caught something before you shipped it, you can
[sponsor its maintenance](https://github.com/sponsors/danoszz). Sponsorship pays
for maintainer time and buys no influence over findings
([tiers](docs/funding/sponsor-tiers.md)).

## License

MIT. See [LICENSE](LICENSE). Report vulnerabilities in Penthera itself through
[SECURITY.md](SECURITY.md).
