<div align="center">

<img src="assets/penthera-social.jpg" alt="Penthera: your open-source cyber security agent" width="840">

<br/><br/>

**Penthera: your open-source cyber security agent**

The security review you never had time for. Offline, rule-based, and you can verify every finding yourself.

**[penthera.org](https://penthera.org)**: try the check in your browser. Nothing you paste leaves the page.

<br/>

[![npm](https://img.shields.io/npm/v/penthera?color=0000ed)](https://www.npmjs.com/package/penthera)
![node](https://img.shields.io/badge/node-%E2%89%A522-0000ed)
![license](https://img.shields.io/badge/license-MIT-0000ed)
[![CI](https://github.com/danoszz/penthera/actions/workflows/ci.yml/badge.svg)](https://github.com/danoszz/penthera/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/danoszz/penthera/badge)](https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera)

<br/>

<img src="assets/demo.gif" alt="A 12-second loop: npx penthera sets up a project, an offline scan runs in the terminal, the dashboard shows the verdict in Simple mode and the triage matrix in Advanced mode, and a fix is approved" width="760">

[Watch the 80-second walkthrough](assets/walkthrough.mp4): setup, a scan, the dashboard, a fix approved, the report. Demo data, no sound, captions in the video.

</div>

---

## What it is

Penthera checks your app, its dependencies and your AI coding tools on your own
machine. It fixes what it can, with your approval. Every finding comes from a
rule you can read, with its evidence at `file:line`. A model may propose; a rule
decides.

It is also an open R&D project. We measure every check in public and publish
the results, good or bad, so you can see how far to trust it.

It finds known classes of problems, not novel ones. It does not replace a human
pentester.

## Start in 30 seconds

You need Node.js 22 or later. No install, no account.

**In your terminal.** Run this in your project folder:

```bash
npx penthera
```

It detects your setup offline, asks what to check, and gives you a grade per
area and the three things to fix first. It scans your running app only after
you confirm the app is yours. Nothing is committed or pushed
([guided start](docs/commands/init.md)).

**In your coding agent, as a skill.** Then ask "scan my app for security
issues":

```bash
npx skills add danoszz/penthera
```

**In your coding agent, as an MCP server.** Six read-only tools for Claude Code,
Cursor, Codex, VS Code and Windsurf. The MCP server is new in 1.9 and is on
npm's `next` tag until 1.9.0 ships, so pin the release candidate:

```bash
claude mcp add penthera -- npx -y penthera@1.9.0-rc.1 mcp
```

Other clients: [docs/commands/mcp.md](docs/commands/mcp.md). Other skill install
routes: [docs/commands/skill.md](docs/commands/skill.md).

`npx penthera` runs the `latest` release (1.8.1). Use `npx penthera@next` for
the 1.9 release candidate.

## What it checks

| Area | What Penthera does | Start with |
|---|---|---|
| Your running app | TLS, headers, CORS, cookies, auth, JWT, IDOR, OAuth and OpenAPI on your localhost or preview URL. Injection probes and fuzzing only when you ask | [`penthera <url>`](docs/commands/scan.md) |
| Your source | Routes, trust boundaries, code-execution sinks, and secrets including AI provider keys | [`penthera --repo .`](docs/commands/scan.md) |
| Your dependencies | What each npm and Python package can do (install scripts, shell, network, env), what an upgrade added, lookalike names, licenses | [`penthera deps`](docs/commands/deps.md) |
| New installs | What a package brings before any install script runs | [`penthera install <pkg>`](docs/commands/install.md) |
| Your AI tooling | Skills, MCP servers, hooks, plugins and rule files: hidden instructions, unpinned servers, broad permissions | [`penthera agents --home`](docs/commands/agents.md) |
| Your runtimes | Whether the PHP, nginx, Apache, Node.js, Python, OpenSSL or MongoDB version you run is affected by a known advisory | [Runtime advisories](docs/runtime-advisories.md) |
| Fixes | Deterministic fix recipes on a local branch, then a re-scan to prove each one. Never pushes | [`penthera agent --loop`](docs/commands/fix.md) |
| Evidence | Reports for developers, owners and auditors, a signable evidence bundle, NIS2 and CRA readiness drafts | [Evidence](docs/evidence.md) |

Every finding has a severity, a confidence label (`confirmed`, `likely`,
`potential`, `needs-human-review`) and its evidence. Reports come out as
Markdown, JSON and SARIF. `penthera ui` shows it all in a local dashboard on
127.0.0.1. Compliance output is readiness tooling, not a certification and not
legal advice.

**AI mode (opt-in, 1.9 release candidate).** `penthera --repo . --ai` lets a
local model propose problems no rule describes. Penthera checks each proposal
with its rules, and anything unconfirmed is labelled "model-proposed,
unverified" and never fails CI. Whether it finds more than the rules alone is
not measured yet ([AI mode](docs/ai-mode.md)).

## How far to trust it

| Measure | Result | Sample |
|---|---|---|
| Precision, bundled benchmark | 0.88, 95% CI 0.69 to 0.96 | 21 true and 3 false positives |
| Recall, bundled benchmark | 0.91, 95% CI 0.73 to 0.98 | 2 misses, [each explained](bench/RESULTS.md) |
| Requests past loopback during the benchmark | 0 | Enforced by a network guard |
| E10 pilot, known-vulnerable apps | Precision 0.88, 95% CI 0.78 to 0.93. Recall 0.07 before fixes, 0.71 (CI 0.45 to 0.88) after | 14 root causes in Juice Shop and DVNA ([results](bench/known-vuln/RESULTS-after-fixes.md)) |

The bundled benchmark is 24 findings in small labs we wrote ourselves. It
catches regressions; it does not measure real-world accuracy. The E10 pilot
used one labeller and is not independent: the fixes were written after seeing
the misses on the same two apps. On WebGoat, held out, recall stayed at 2 of 9.
Accuracy on real projects is experiment E1, pre-registered and not yet run.
Intervals are Wilson.

What makes it safe to run:

- **Offline.** No account, no telemetry. `--offline` limits traffic to the
  target you named, and every report lists the hosts it contacted
  ([network use](docs/privacy.md)).
- **Non-destructive by default.** Default scans send no attack payloads.
  `--deep`, `--fuzz` and `--all` are opt-in and ask first.
- **Asks before it changes anything.** The fix loop works on a local branch and
  never pushes or opens pull requests.
- **No rule downloads at run time.** Rules ship inside reviewed releases as
  signed [rule packs](docs/rule-packs.md).
- **Verifiable releases.** npm provenance, a 2FA approval per version, and an
  [internal audit](docs/internal-audit.md) of eight gates before each release.

How it decides, and what it cannot see: [methodology](docs/METHODOLOGY.md) and
its [known limitations](docs/METHODOLOGY.md#known-limitations).

## Ethics and authorization

Scan only systems you own, systems you have written authorization to test, or
local environments you control. Some modes send attack payloads. Unauthorized
testing may break computer-misuse laws such as the US CFAA and the UK Computer
Misuse Act. The software is provided "as is", without warranty, and you are
responsible for making sure every scan is lawful.

## Building in public

What changed, what we are measuring, and what comes next, in one place.

| | Where it stands | Read more |
|---|---|---|
| **Latest release** | 1.8.1 (2026-10-22) on npm `latest`: more careful runtime advisories, on top of 1.8.0's advisories, security-review fixes and redesigned dashboard | [CHANGELOG](CHANGELOG.md) |
| **Release candidate** | 1.9.0-rc.1 on npm `next`: `penthera mcp`, opt-in AI mode, new detection rules, no attack payloads in default scans | [Roadmap](ROADMAP.md#now-190-release-candidate) |
| **Research** | E10 pilot published: precision 0.88, recall 0.07 to 0.71 on two known-vulnerable apps after fixes (one labeller, not independent; a re-run is pending because default scans no longer send login checks). E1 on real code is pre-registered; E8 (agent guardrails) is a draft | [E10 results](bench/known-vuln/RESULTS.md), [E1 pre-registration](docs/research/prereg/E1-real-world-accuracy.md), [agents safely](docs/agents-safely.md) |
| **Next** | 1.9.0 once the release candidate holds up, then real-world precision and recall with intervals, published whatever the result | [Roadmap: next](ROADMAP.md#next), [research plan](docs/vision-2.0.md) |

Releases are deliberately slow: a feature freeze, an independent review, the
release checks, and a release candidate before any new minor version. Watch the
repository for releases or join the
[Discussions](https://github.com/danoszz/penthera/discussions).

## How Penthera is built

Penthera is developed with substantial help from generative AI: 91% of the
commits up to v1.7.0 were written with Claude (Anthropic) through Claude Code,
directed and reviewed by the maintainer, and marked with a co-author trailer.
Generated code passes the same gates as any change: tests, CodeQL, an
independent review, the internal audit, and a 2FA-approved release. Inside the
product, models only ever propose; deterministic checks decide. The full
disclosure, and the rules for AI-assisted contributions, are in
[docs/genai.md](docs/genai.md).

## Read more

| You want | Read |
|---|---|
| Every guide, ordered from first scan to research | [docs/index.md](docs/index.md) |
| Every command and flag | [docs/commands/](docs/commands/README.md) |
| How it compares to Socket, Snyk, GitHub, ZAP and Semgrep | [Comparisons](docs/compare/README.md) |
| Why it was built this way | [Manifesto and FAQ](docs/MANIFESTO.md) |
| To contribute, or to point a coding agent at this repo | [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) |
| What ships next | [ROADMAP.md](ROADMAP.md) |
| To cite it | [CITATION.cff](CITATION.cff), or [how to cite](docs/METHODOLOGY.md#how-to-cite) |

Penthera is free. If it caught something before you shipped it, you can
[sponsor its maintenance](https://github.com/sponsors/danoszz). Sponsorship pays
for maintainer time and buys no influence over findings
([tiers](docs/funding/sponsor-tiers.md)).

## License

MIT. See [LICENSE](LICENSE). Report vulnerabilities in Penthera itself through
[SECURITY.md](SECURITY.md).
