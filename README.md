<div align="center">

<img src="site/media/social/og.png" alt="Penthera. Is your site/app safe? Check it with a free cyber security quick scan: the scan field and a report of penthera.org, 95 out of 100, with Prompt to fix" width="840">

<br/><br/>

**Penthera: your open-source cyber security agent**

The security review you never had time for. Offline, rule-based, and you can verify every finding yourself.

**[penthera.org](https://penthera.org)**: check your live site in a few seconds. Passive, nothing stored.

**132** readable rules · **6** read-only MCP tools · **1** runtime dependency · **0** requests past loopback in the benchmark · **MIT**, no telemetry

<br/>

[![npm](https://img.shields.io/npm/v/penthera?color=0000ed)](https://www.npmjs.com/package/penthera)
[![npm downloads](https://img.shields.io/npm/dm/penthera?color=0000ed&label=downloads)](https://www.npmjs.com/package/penthera)
[![GitHub stars](https://img.shields.io/github/stars/danoszz/penthera?color=0000ed)](https://github.com/danoszz/penthera/stargazers)
![node](https://img.shields.io/badge/node-%E2%89%A522-0000ed)
![license](https://img.shields.io/badge/license-MIT-0000ed)
[![CI](https://github.com/danoszz/penthera/actions/workflows/ci.yml/badge.svg)](https://github.com/danoszz/penthera/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/danoszz/penthera/badge)](https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera)

<br/>

<img src="assets/demo.gif" alt="A 12-second loop: npx penthera sets up a project, an offline scan runs in the terminal, the dashboard shows the verdict in Simple mode and the triage matrix in Advanced mode, and a fix is approved" width="760">

<br/><br/>

| `penthera ui`, Simple, dark | `penthera ui`, Advanced, light |
|---|---|
| ![The dashboard in Simple mode, dark: the verdict, problems in plain words and one problem open](assets/dashboard/ui-dark.jpg) | ![The dashboard in Advanced mode, light: a project's tabs, the triage matrix and a finding open](assets/dashboard/ui-light.jpg) |

<a href="assets/walkthrough.mp4"><img src="assets/walkthrough-poster.jpg" alt="Walkthrough video: setup, a scan, the dashboard in Simple and Advanced mode, one fix approved, the report" width="760"></a>

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
Cursor, Codex, VS Code and Windsurf, new in 1.9.0. Pin the version:

```bash
claude mcp add penthera -- npx -y penthera@1.9.0 mcp
```

**In Claude Code, as a plugin.** From Claude Code's prompt:

```
/plugin marketplace add danoszz/penthera
/plugin install penthera@penthera
```

**In Gemini CLI, as an extension.** With the same pinned MCP server:

```bash
gemini extensions install https://github.com/danoszz/penthera
```

Other clients: [docs/commands/mcp.md](docs/commands/mcp.md). Other skill install
routes: [docs/commands/skill.md](docs/commands/skill.md).

To run it in a container:
`docker build -t penthera . && docker run --rm penthera https://your-app.example`.

## What it does

```mermaid
flowchart LR
    U["You or your AI agent"] --> P(("Penthera<br/>on your machine"))

    P --> APP["Your app<br/>URL scan, repo scan<br/>runtime advisories"]
    P --> DEP["Your dependencies<br/>capabilities, install firewall<br/>typosquats, upgrade diff"]
    P --> AI["Your AI tooling<br/>skills, MCP, hooks<br/>plugins, rule files"]

    APP --> F[["Findings<br/>severity, confidence<br/>evidence at file:line"]]
    DEP --> F
    AI --> F

    F --> FIX["Fix loop<br/>asks first, local branch<br/>cannot edit its own tests"]
    FIX -. "re-scan proves it" .-> F
    F --> R["Reports and dashboard<br/>terminal, Markdown, SARIF<br/>penthera ui, MCP tools"]
    F --> E["Evidence<br/>signed bundle<br/>NIS2 and CRA drafts"]

    classDef core fill:#0000ed,stroke:#0000ed,color:#ffffff
    classDef box fill:#ffffff,stroke:#000000,color:#000000
    class P core
    class U,APP,DEP,AI,F,FIX,R,E box
```

### Before you deploy

| Job | What Penthera does | Command |
|---|---|---|
| Test the app | Scans your localhost or preview URL (TLS, headers, CORS, cookies, auth, JWT, IDOR, OAuth, OpenAPI; injection and fuzzing only when you ask, after a confirmation) and your repository (routes, trust boundaries, code-execution sinks, secrets including AI keys) | [`penthera <url> --repo .`](docs/commands/scan.md) |
| Check your runtimes | Whether the PHP, nginx, Apache, Node.js, Python, OpenSSL or MongoDB version you run is affected by a known advisory, from the signed advisories pack | [Runtime advisories](docs/runtime-advisories.md) |
| Fix and verify | Applies deterministic fix recipes on a local branch, re-scans to prove they worked, and remembers the result. Never pushes | [`penthera agent --loop`](docs/commands/fix.md) |
| Block it at commit time | Stops secrets, risky agent config and dependency changes before they are committed | [`penthera hook install`](docs/commands/hook.md) |

### What you build with

| Job | What Penthera does | Command |
|---|---|---|
| Vet dependencies | Shows what every npm and Python package can do (install scripts, shell, network, env, obfuscation), what an upgrade added, lookalike names and licenses | [`penthera deps --base main`](docs/commands/deps.md) |
| Guard installs | Shows what a new package brings before any install script runs, and stops it under your policy | [`penthera install <pkg>`](docs/commands/install.md) |
| Review pull requests | Comments the dependency capability diff on every PR that touches the lockfile | [GitHub Action](docs/commands/action.md) |
| Audit your AI tooling | Checks skills, MCP servers, hooks, plugins and rule files for hidden instructions, unpinned servers, over-broad permissions and silent updates | [`penthera agents --home`](docs/commands/agents.md) |
| Work from your agent | Six read-only MCP tools: scan the repo, check dependencies, audit AI tooling, runtime advisories, explain a finding, a passive URL scan | [`penthera mcp`](docs/commands/mcp.md) |

### After you ship

| Job | What Penthera does | Command |
|---|---|---|
| Report and prove | Writes reports for developers, owners and auditors; a hashed, signable evidence bundle; NIS2 and CRA readiness reports and drafts | [`penthera <url> --audience auditor --evidence out/`](docs/evidence.md) |
| See it all | A local dashboard on 127.0.0.1. Simple mode for non-programmers: a one-sentence verdict, problems in plain words, and a check-and-fix mode with Apply, Skip and Stop per change. Advanced adds dependencies, AI tooling, history and evidence | [`penthera ui`](docs/dashboard.md) |
| Keep watching | Scheduled checks of production for drift: certificates, headers, new endpoints, keys in bundles, new CVEs in your SBOM | on the [roadmap](ROADMAP.md) |

Every finding carries a severity, a confidence label (`confirmed`, `likely`,
`potential`, `needs-human-review`), its evidence and the research behind it.
Reports come out as Markdown, JSON and SARIF for GitHub code scanning. Exit
code `1` means critical or high findings. Every command and flag is in
[docs/commands/](docs/commands/README.md). Compliance output is readiness
tooling, not a certification and not legal advice.

**AI mode (opt-in, new in 1.9.0).** `penthera --repo . --ai` lets a local model
propose problems no rule describes. Penthera checks each proposal with its
rules, and anything unconfirmed is labelled "model-proposed, unverified" and
never fails CI. Whether it finds more than the rules alone is not measured yet
([AI mode](docs/ai-mode.md)).

### How far each part has been taken

| Part | Status |
|---|---|
| Scans: URL, repo, dependencies, AI tooling, installs, pre-commit hook | **Stable**: in every release since 1.x, covered by the tests and the release gate |
| Fix loop and local dashboard (`penthera ui`) | **Stable**; the dashboard was redesigned in 1.9.0 |
| MCP server, Agent Skill, Claude Code plugin, Gemini CLI extension | **Stable**, new in 1.9.0 (the Gemini extension after 1.9.0) |
| Evidence bundles, NIS2 and CRA drafts | **Stable** as readiness tooling, not a certification |
| AI mode (`--ai`) | **Experimental**: whether it finds more than the rules alone is not measured yet ([AI mode](docs/ai-mode.md)) |
| Live check on [penthera.org](https://penthera.org) | **Beta**: passive only, [terms](docs/live-check-terms.md) |

## How it is measured

Each feature goes through the same path: **method → evidence → tool.**

- **Method.** The [methodology](docs/METHODOLOGY.md) states the threat model,
  what black-box (HTTP) and white-box (source) analysis can and cannot see, the
  confidence model, and the false-positive controls on each probe. Each design
  choice cites the research or standard it rests on: 95 verified references, in
  APA style, in [docs/references.md](docs/references.md).
- **Evidence.** A benchmark runs on every release, and the release gate fails
  if precision or recall drops by more than 0.02. Experiments that decide what
  ships next are pre-registered in [docs/research/prereg/](docs/research/prereg/)
  before any data is collected, and the results are published either way.
- **Tool.** What holds up ships in a reviewed, signed release. What does not
  hold up is dropped, and the rules stay.

| Measure | Result | Sample |
|---|---|---|
| Precision, bundled benchmark | 0.88, 95% CI 0.69 to 0.96 | 21 true and 3 false positives |
| Recall, bundled benchmark | 0.91, 95% CI 0.73 to 0.98 | 2 misses, [each explained](bench/RESULTS.md) |
| Requests past loopback during the benchmark | 0 | Enforced by a network guard |
| E10 pilot, known-vulnerable apps | Precision 0.88, 95% CI 0.78 to 0.93. Recall 0.07 before fixes, 0.71 (CI 0.45 to 0.88) after | 14 root causes in Juice Shop and DVNA ([results](bench/known-vuln/RESULTS-after-fixes.md)) |
| Detection rules, all readable | 132 in this release: 16 URL scan templates, 21 secret and AI-key patterns, 15 dependency capabilities, 39 AI-tooling rules, 5 fix recipes, and the signed rule packs | [Rule packs](docs/rule-packs.md) |

The bundled benchmark is 24 findings in small labs we wrote ourselves. It
catches regressions; it does not measure real-world accuracy. The E10 pilot
used one labeller and is not independent: the fixes were written after seeing
the misses on the same two apps. On WebGoat, held out, recall stayed at 2 of 9.
Accuracy on real projects is experiment E1, pre-registered and not yet run.
Intervals are Wilson. What Penthera cannot see is listed under
[Known limitations](docs/METHODOLOGY.md#known-limitations). Refresh the counts
with `npm run docs:numbers` and `npm run bench`.

**Cite this repository** with the button on GitHub or
[CITATION.cff](CITATION.cff). APA and BibTeX forms are in the
[methodology](docs/METHODOLOGY.md#how-to-cite).

## Why you can trust it

- **Local and offline.** No account, no telemetry, no cloud. `--offline` limits
  network traffic to the target you named, and every report lists the hosts it
  contacted ([network use](docs/privacy.md)).
- **Deterministic.** Rules you can read, with `file:line` evidence. A model may
  propose a fix or a lead; a deterministic re-scan and your tests decide.
- **Non-destructive by default.** Default scans send no attack payloads.
  Payload testing (`--deep`, `--fuzz`, `--all`) is opt-in, asks for a
  confirmation bound to the target, and is rate-limited.
- **Asks before it changes anything.** The fix loop works on a local branch,
  asks before every change by default, and never pushes or opens pull requests.
- **No update channel to hijack.** Detection rules ship inside reviewed
  releases as signed, versioned [rule packs](docs/rule-packs.md). You can add
  your own by path (`--rules <dir>`). Nothing is downloaded and run at run time.
- **Releases you can verify.** npm provenance through trusted publishing, a
  maintainer approval with 2FA for every version, SHA-pinned CI, CodeQL and
  OpenSSF Scorecard. Every release passes an
  [internal audit](docs/internal-audit.md) of eight gates
  ([latest report](audit/REPORT.md)).

**Verify it yourself.** In an empty folder:

```bash
npm install penthera@1.9.0 && npm audit signatures
npx penthera@1.9.0 rules list
```

The first checks npm's registry signature and the build provenance of the
package you got. The second lists every bundled rule pack and the key that
signed it; a pack whose signature does not verify is refused unless you pass
`--allow-unsigned-rules`.

Penthera finds known classes of problems, not novel ones, and it does not
replace a human pentester or incident response. The decisions behind it, its
limits, and how to challenge them are in the [manifesto and FAQ](docs/MANIFESTO.md).

## How it fits with other tools

Penthera works next to the tools you already use; its SARIF output goes
straight into GitHub code scanning, for example. Each comparison page says where
the other tool goes further and how to run the two together.

| | Focus | Where it runs | How it decides |
|---|---|---|---|
| **Penthera** | Your app, dependencies and AI tooling; fixes; EU evidence | Your machine or CI, offline | Readable deterministic rules, with evidence |
| [Socket](docs/compare/socket.md) | Supply-chain risk across package registries | Cloud service, GitHub App, CLI | Registry-scale package analysis, including AI review |
| [Snyk](docs/compare/snyk.md) | Known vulnerabilities in dependencies, code, containers, IaC | Cloud service, IDE, CLI | Curated vulnerability database plus static analysis |
| [GitHub Dependabot and code scanning](docs/compare/github.md) | Known-CVE alerts, update PRs, CodeQL | GitHub | Advisory database, CodeQL queries |
| [OWASP ZAP](docs/compare/zap.md) | Dynamic testing of web apps | Your machine or CI | Active and passive scan rules |
| [Semgrep](docs/compare/semgrep.md) | Static analysis of your own code | Your machine, CI, cloud platform | Pattern rules, plus a paid cross-file engine |

All comparisons, including Cloudflare's security-audit skill: [docs/compare/](docs/compare/README.md).

## Start here

| You want to know | Read |
|---|---|
| Is my app safe to ship? | [I'm new](docs/index.md#1-im-new), then [scan](docs/commands/scan.md) |
| Is this package or MCP server safe? | [deps](docs/commands/deps.md), [install](docs/commands/install.md), [agents](docs/commands/agents.md) |
| How do I use it from my coding agent? | [MCP server](docs/commands/mcp.md), [skill](docs/commands/skill.md), [agents safely](docs/agents-safely.md) |
| How do I put it in CI? | [The GitHub Action](docs/commands/action.md), [scan in CI](docs/commands/scan.md#ci-integration) |
| What do I give my auditor? | [Evidence bundles](docs/evidence.md), [NIS2](docs/compliance-nis2.md), [CRA](docs/compliance-cra.md) |
| How do I run the fix loop? | [Fix and verify](docs/commands/fix.md), [the local loop](docs/local-loop.md) |

The full map, by situation and from first scan to research, is in
[docs/index.md](docs/index.md).

## Ethics and authorization

Penthera sends HTTP requests to the targets you give it, and some modes
(`--deep`, `--fuzz`, `--all`) send attack payloads, after a confirmation.
Scan only what you own, what you have written authorization to test, or local
environments you control. Do not use it to probe third-party systems,
exfiltrate data, disrupt services, or harm anyone. Unauthorized testing may
break computer-misuse laws such as the US CFAA, the UK Computer Misuse Act, and
their EU equivalents. When in doubt, do not scan.

The software is provided "as is", without warranty. The author accepts no
liability for misuse, and you are responsible for making sure every scan you
run is lawful. The live check on penthera.org has its own
[terms](docs/live-check-terms.md).

## Building in public

What changed, what we are measuring, and what comes next, in one place.

| | Where it stands | Read more |
|---|---|---|
| **Latest release** | 1.9.0 (2026-10-23) on npm `latest`: `penthera mcp`, opt-in AI mode, new detection rules, no attack payloads in default scans, a refreshed dashboard | [CHANGELOG](CHANGELOG.md), [roadmap](ROADMAP.md#now-190) |
| **Research** | E10 pilot published: precision 0.88, recall 0.07 to 0.71 on two known-vulnerable apps after fixes (one labeller, not independent; a re-run is pending because default scans no longer send login checks). E1 on real code is pre-registered; E8 (agent guardrails) is a draft | [E10 results](bench/known-vuln/RESULTS.md), [E1 pre-registration](docs/research/prereg/E1-real-world-accuracy.md), [agents safely](docs/agents-safely.md) |
| **Next** | Real-world precision and recall with intervals (E1), published whatever the result | [Roadmap: next](ROADMAP.md#next), [research plan](docs/vision-2.0.md) |

[![Star history](https://api.star-history.com/svg?repos=danoszz/penthera&type=Date)](https://star-history.com/#danoszz/penthera&Date)

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

## Contributing and support

Clone the repository and run `npm install`, then `npm test` for the suite and
`npm run bench` for precision and recall.
[CONTRIBUTING.md](CONTRIBUTING.md) covers the project layout, the release
cadence and the release checklist; [AGENTS.md](AGENTS.md) is the short version
for coding agents. The [roadmap](ROADMAP.md) shows what ships next, and the
[research plan](docs/vision-2.0.md) what we measure. Issues and pull requests
are welcome.

Penthera is free. If it caught something before you shipped it, you can
[sponsor its maintenance](https://github.com/sponsors/danoszz). Sponsorship pays
for maintainer time and buys no influence over findings
([tiers](docs/funding/sponsor-tiers.md)).

## License

MIT. See [LICENSE](LICENSE). Report vulnerabilities in Penthera itself through
[SECURITY.md](SECURITY.md).
