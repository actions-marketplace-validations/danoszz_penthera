# Penthera and Socket

> **Pro.** For "how does Penthera compare to Socket, and how do I run both?"

*Last checked: 2026-10-19 against Socket's public docs and pricing page.*

## Use them together

[Socket](https://socket.dev) watches the open-source registries for malicious and
risky packages and tells you about them in pull requests, in your editor and at
install time. Penthera runs on your machine and checks the app you built, the
packages already in your lockfile, and the AI tooling you build it with.

A reasonable setup: Socket's GitHub app or firewall on every dependency change,
because it watches new releases across the registries and Penthera does
not. Penthera before each deploy, for the app scan, the agent-config audit
and the evidence, and anywhere a network call or an account is not an option.

## Side by side

| | Penthera | Socket |
|---|---|---|
| Main question | Is the thing I am about to ship safe, and can I prove it? | Is this package safe to depend on? |
| Scope | Your running app (URL scan), your source (repo scan), your dependencies, your AI tooling (skills, MCP, hooks), fixes, NIS2 and CRA evidence | Packages across many ecosystems, plus browser extensions and AI models ([language support](https://docs.socket.dev/docs/language-support)) |
| Ecosystems for dependencies | npm and Python | JS/TS, Python, Go, Java, Ruby, .NET, Rust and more ([language support](https://docs.socket.dev/docs/language-support)) |
| How it decides | Deterministic rules in the repo, with `file:line` evidence and a confidence label | Static analysis followed by an LLM stage, with researchers confirming detections ([AI alert](https://socket.dev/alerts/gptMalware)) |
| Threat intelligence | None beyond what ships in a release | Registry-wide and continuously updated |
| Network | None needed; `--offline` limits traffic to the target you named | The CLI and firewall query Socket's API ([CLI](https://github.com/SocketDev/socket-cli), [firewall](https://docs.socket.dev/docs/socket-firewall-overview)) |
| Account | None | API token for the CLI; the firewall's free wrapper mode needs no key ([firewall](https://docs.socket.dev/docs/socket-firewall-overview)) |
| Install-time guard | `penthera install`: reviews capabilities and install scripts before any script runs (npm) | Socket Firewall (`sfw`): blocks known-malicious packages for npm, yarn, pnpm, pip, uv and cargo in free mode |
| Pull requests | GitHub Action that comments the capability diff | GitHub app that comments on risky dependency changes ([docs](https://docs.socket.dev/docs/socket-for-github)) |
| AI tooling | Audits the skills, MCP servers, hooks, permissions and plugins already on disk | An MCP server agents can use to look up package scores ([MCP guide](https://docs.socket.dev/docs/guide-to-socket-mcp)); firewall coverage for agent skills and AI models as downloads ([firewall](https://socket.dev/features/firewall)) |
| App security | URL and repo scans, fix recipes | Not its focus; SAST and secrets are on the Enterprise plan ([pricing](https://socket.dev/pricing)) |
| SBOM | CycloneDX SBOM and AI-BOM, free | Business plan and up ([pricing](https://socket.dev/pricing)) |
| License | MIT | `socket` CLI and MCP server MIT; `sfw` under PolyForm Shield 1.0.0 (source-available) ([sfw-free](https://github.com/SocketDev/sfw-free)) |
| Cost | Free | Free plan (1 seat, 1,000 scans a month); free Business plan for OSI-licensed public projects ([announcement](https://socket.dev/blog/free-business-plan-upgrades-for-open-source)); paid seats from $25 a month ([pricing](https://socket.dev/pricing)) |

## Where Socket goes further

- **It sees the whole registry.** A freshly published package with a
  credential stealer in it can be flagged by Socket before you install it.
  Penthera only sees what is in front of it, with rules from its last release.
- **More ecosystems.** Penthera's dependency checks cover npm and Python today,
  and its install firewall covers npm only.
- **Human research.** Socket's researchers confirm and publish malware
  findings. Penthera has no threat-research team.
- **Reachability** on paid plans, which narrows a long CVE list to the code paths
  you call.

## Where Penthera adds something

- **Your app, not only its packages.** Headers, auth, IDOR, OAuth, OpenAPI,
  secrets in source, and fixes that are re-scanned to prove they worked.
- **The AI tooling on your machine.** `penthera agents --home` reads your Claude
  Code, Cursor and MCP config and flags hidden instructions, unpinned servers and
  over-broad permissions.
- **Offline and account-free**, which matters on air-gapped machines, in some
  public-sector work, and for anyone who cannot send a dependency list to a
  vendor.
- **Readable verdicts.** Every finding points at a rule in this repository.

## A note on AI verdicts

Socket's AI scanner once flagged Penthera itself as malware. That is an
understandable call: Penthera's test suite contains real attack payloads,
because a security scanner has to be tested against them. It is also a fair
illustration of the trade-off. An AI stage catches novel malware that no rule
anticipated, and it can misread intent. Deterministic rules miss what they were
not written for, and they always tell you exactly why they fired. The two
approaches cover each other's gaps, which is a good reason to run both.

## Run both

```bash
sfw npm install            # Socket Firewall: block known-bad packages at install
npx penthera deps --base origin/main   # what the new packages can do, offline
npx penthera agents --home             # your AI tooling
```

[All comparisons](https://github.com/danoszz/penthera/blob/main/docs/compare/README.md) · [Back to the README](https://github.com/danoszz/penthera/blob/main/README.md)
