# NLnet application draft: Penthera

Status: draft for the maintainer to edit. Nothing has been submitted.

## Call status, checked on 2026-10-19

The task asked for an NGI Zero application. NGI Zero is no longer taking
proposals, so this draft targets its successor instead.

| Item | What nlnet.nl says | Source |
|------|--------------------|--------|
| NGI Zero Commons Fund | Closed. "The thirteenth and final call of NGI Zero Commons Fund closed on June 1st 2026." | https://nlnet.nl/commonsfund/ |
| NGI Zero Core | Closed. Final call closed on October 1st 2024. | https://nlnet.nl/core/ |
| Transition | News item of 2026-06-12: "Transitioning from NGI to Open Internet Stack, open calls temporarily paused." | https://nlnet.nl/news/ |
| Open now | Restack and CodeSupply, both part of the Open Internet Stack initiative (Horizon Europe, DG CNECT). | https://nlnet.nl/funding.html |
| Deadline | **3 November 2026, 12:00 CET** (noon). NLnet now runs deadlines on the 3rd of every odd month. | https://nlnet.nl/propose/ , https://nlnet.nl/restack/ |
| Amount | EUR 5,000 to 50,000 for a first grant. Above 50k needs a completed earlier grant. | https://nlnet.nl/propose/ , https://nlnet.nl/restack/guideforapplicants/ |
| Scoring | Technical excellence and feasibility 30%, relevance and impact 40%, cost effectiveness 30%. Weighted score must exceed 5.0 of 7 to reach round two. | https://nlnet.nl/restack/guideforapplicants/ |

### Which fund

**Recommended: Restack.** Its scope explicitly lists "full stack security" and
"software supply chain management", and it asks for tools that make the stack
trustworthy. See https://nlnet.nl/restack/.

**Risk to manage: Restack's AI exclusion.** The Restack page says
"AI-related projects are not within scope", with an exception only for AI
already used by more than 1 million active users. Penthera does not build or
train AI. The relevant work audits configuration files and packages
(skills, MCP servers, hooks, rule files) that developer tools install, using
deterministic rules. This draft frames that work as software supply chain
security, which is what it is, and leaves out the optional local-model part of
the agent loop and the LLM endpoint probes. If the maintainer wants those in,
the proposal is more likely to be ruled out of scope.

**Alternative: CodeSupply.** A pilot on software supply chain metadata with
about EUR 400,000 reserved for open calls. Its three objectives are about
publishing software metadata and data sets. Penthera fits only if the proposal
centres on publishing a data set (for example signed scan results for popular
skills and MCP servers), which ROADMAP.md lists as "under consideration" and
outside the offline core. Not recommended for a first proposal. See
https://nlnet.nl/codesupply/.

### Form fields (from https://nlnet.nl/propose/)

| Field | Limit |
|-------|-------|
| Which fund (Restack / CodeSupply / Other, open call) | dropdown |
| Proposal title | none stated |
| Website(s) / repositories | none stated |
| Abstract: summary of the project and expected results | 1000 characters |
| Requested amount (EUR) | none stated |
| Budget breakdown: tasks, effort, rate used, expenses | 4000 characters |
| Comparison with other efforts, and whether you considered contributing to them | 4000 characters |
| Expected technical challenges | 4000 characters |
| Ecosystem, dependencies, main users | 2000 characters |
| Why you are the right person(s), relevant experience | 2000 characters |
| Other funding sources | 1000 characters |
| Attachments | optional, 50 MB total |
| Generative AI use: yes/no, model, purpose, prompts | 8000 characters, plus file upload |
| Contact: name, email, optional OpenPGP key, phone, applicant type, organisation, country, European dimension | short fields |

### Generative AI disclosure: this matters

NLnet's GenAI policy (v1.1, effective 26 January 2026) allows AI help in
writing a proposal but requires disclosure and a prompt provenance log: model,
dates and times, the prompts, and the unedited output. Non-compliance can lead
to rejection. See https://nlnet.nl/foundation/policies/generativeAI/.

This draft was written with Claude (Anthropic, model Claude Opus 5.5) in
Claude Code. If any of its text ends up in the submission, answer **Yes** on
the form and attach the session transcript. The same policy also asks funded
projects to mark AI-generated code contributions. Penthera already records
this with `Co-Authored-By:` trailers in commit messages, which the policy
names as one acceptable method. Say so in the proposal.

---

## Draft answers

Edit before submitting. Character counts are approximate and include spaces.

### Fund

Restack

### Proposal title

Penthera: offline security and supply chain checks for small EU teams and their developer tooling

### Website / repository

https://github.com/danoszz/penthera
https://www.npmjs.com/package/penthera

### Abstract (limit 1000, draft about 950)

Small organisations in the EU now face NIS2 and the Cyber Resilience Act, but
most security tooling assumes a security team, a SaaS account, and sending
code or findings to a vendor cloud. Penthera is an MIT-licensed scanner that
runs entirely on the user's machine: it checks live web apps and APIs, scans
repositories for secrets and risky routes, and produces NIS2 readiness evidence
without claiming certification. It has no telemetry. This project extends it in
three directions: (1) a deterministic audit of the software that developer
tools install, such as plugins, MCP servers, hooks and rule files, including
hidden-content detection, hash pinning and install-time package checks; (2) a
local scan, fix and verify loop with a strict egress guard so the tool can only
reach the target the user named; (3) CRA vulnerability reporting support and
improved evidence output for auditors. All results ship as open source with
tests and documentation.

### Requested amount

EUR 47,850 (placeholder, see budget)

### Budget breakdown (limit 4000)

Rate used: EUR 55 per hour (placeholder; the maintainer should set this to a
rate they can justify for part-time work in the Netherlands). No other
expenses. Work done before the grant, including `penthera agents` (pull
request #12), is not charged.

Milestone 1: Supply chain audit for developer tooling (290 h, EUR 15,950)
- 1a Hidden-content engine: Unicode tag, zero-width and bidi characters,
  whitespace padding, embedded `.pyc` files and archives, `curl | sh`,
  auto-approve hooks, unpinned `npx -y` servers. Tests per pattern. 80 h
- 1b `penthera.lock`: hash-pin installed skills, MCP tool definitions and
  hooks; a CI check that fails on silent changes. 80 h
- 1c Install-time package checks: non-existent or very new packages,
  risky `postinstall` scripts, offline IOC packs for known npm worm
  campaigns. 100 h
- 1d Detect provider keys exposed in browser JavaScript bundles through
  public build variables. 30 h

Milestone 2: Local scan, fix and verify loop (300 h, EUR 16,500)
- 2a `--offline` egress guard: one HTTP client that can only reach the named
  target; recon sources and the CVE database become explicit opt-ins with a
  vendored fallback. 80 h
- 2b Deterministic fixes for common findings (headers, cookies, CORS), applied
  on a local branch after human approval, then re-scanned to prove the fix.
  No language model involved. 140 h
- 2c Audience-specific reports (developer, owner, auditor), a found, fixed and
  verified timeline, and a hashed evidence bundle. 80 h

Milestone 3: Compliance support for small organisations (220 h, EUR 12,100)
- 3a CRA Article 14 reporting helper, reusing the existing NIS2 incident
  helper. 40 h
- 3b Map checks for developer tooling to the OWASP MCP Top 10, with a per-run
  coverage table. 50 h
- 3c Extend the CycloneDX SBOM with installed plugins, MCP servers and skills.
  70 h
- 3d MFA probe, the last NIS2 Article 21 measure still marked as planned. 60 h

Milestone 4: Release, documentation and outreach (60 h, EUR 3,300)
- Documentation for each feature, a Dutch-language NIS2 guide for small
  organisations, release engineering with staged npm publishing and
  provenance, and two feedback sessions with small organisations. 60 h

Total: 870 h, EUR 47,850.

### Comparison with other efforts (limit 4000)

Commercial platforms such as Snyk, Aikido, Socket, GitGuardian and Semgrep
cover parts of this space, mostly as hosted services that need an account. Two
are close to milestone 1:

- Snyk Agent Scan (formerly Invariant Labs mcp-scan, Apache-2.0) scans MCP
  servers, skills and agent configurations. It sends tool names, descriptions,
  server configurations and skill content to a remote API for analysis, needs a
  Snyk token, and starts stdio MCP servers from the config to read their tools.
  Source: https://github.com/snyk/agent-scan
- GitGuardian added AI hooks and an inventory of agents and MCP servers per
  endpoint (September 2026), focused on secrets in prompts and tool calls. It is
  part of a licensed product. Source:
  https://docs.gitguardian.com/releases/saas/2026/09/07/changelog

Penthera differs in three ways. It is offline and deterministic: rules, not a
remote model, decide findings, so results are reproducible and nothing about
the user's setup leaves the machine. It reads configuration files without
executing the servers they describe. And it ties the result to evidence a
small organisation can use for NIS2 and CRA, without claiming certification.

On contributing instead: Snyk Agent Scan is open source, but its design
depends on the remote analysis API, so offline operation would mean a different
architecture rather than a patch. For web app checks, Penthera already accepts
Nuclei-compatible templates, so it builds on that ecosystem rather than
replacing it. SARIF output lets results flow into GitHub code scanning and
other tools.

### Expected technical challenges (limit 4000)

- False positives from hidden-content rules. Many legitimate files contain
  zero-width joiners or non-Latin text. Each rule needs a fixture corpus of
  both malicious and benign samples, and a confidence label on every finding.
- Hash pinning across tools that store configuration differently and update
  without notice. `penthera.lock` must normalise formats so it flags real
  changes, not reformatting.
- Package checks without network access. Registry age and existence need a
  network call, so the offline mode needs a vendored snapshot and a clear
  label when data is stale.
- A strict egress guard in Node.js. Every HTTP path, including dependencies,
  must go through one client. This needs tests that fail if any other path
  opens a socket.
- Safe automated fixes. A fix must apply to a local branch only, never push,
  and be proven by a re-scan. Framework detection must be conservative.
- Keeping compliance output honest. NIS2 and CRA texts are interpreted
  differently per member state. Jurisdiction data lives in config, and the
  output says "readiness" and "evidence", never "compliant".

### Ecosystem, dependencies, main users (limit 2000)

Penthera is a Node.js (22+) CLI published on npm, and an Agent Skill installed
through skills.sh and plugin marketplaces. Runtime dependencies are minimal:
one (`yaml`). It reads OpenAPI, Nuclei-compatible templates and writes SARIF,
JSON, Markdown and CycloneDX.

Main users are developers and small teams who build web apps, often with AI
coding assistants, and small organisations that need NIS2 evidence without a
security department. Public adoption on 2026-10-19: 46 GitHub stars, 11 forks,
59 installs on skills.sh, and 46 npm downloads in the 30 days to 2026-10-16
(api.npmjs.org). The project is four months old.

Outreach: the README and docs, the skills.sh listing, Dutch-language material
for NIS2 (the Dutch Cyberbeveiligingswet entered into force on 15 August
2026),
and SARIF output that drops into existing CI.

### Why you (limit 2000)

Placeholder for the maintainer to write in their own words. Suggested points:
background and years of experience; built and released Penthera v1.0 to v1.2
in 2026; the release pipeline uses SHA-pinned actions, least-privilege
workflows, CodeQL, OpenSSF Scorecard, npm trusted publishing with provenance,
and staged releases approved with 2FA; based in the Netherlands, close to the
NIS2 and CRA context of the target users.

### Other funding sources (limit 1000)

None. Penthera is maintained part-time without funding. A GitHub Sponsors
profile has been requested; any sponsorship income will be reported here if it
exists at submission time.

### Applicant type and country

Individual (or SME, if the maintainer applies through a company). Country:
the Netherlands.

---

## Sources

- NLnet funding overview: https://nlnet.nl/funding.html
- Proposal form and deadline: https://nlnet.nl/propose/
- Restack: https://nlnet.nl/restack/
- Restack guide for applicants: https://nlnet.nl/restack/guideforapplicants/
- CodeSupply: https://nlnet.nl/codesupply/
- NGI Zero Commons Fund (closed): https://nlnet.nl/commonsfund/
- NGI Zero Core (closed): https://nlnet.nl/core/
- NLnet GenAI policy: https://nlnet.nl/foundation/policies/generativeAI/
- CRA reporting from 11 September 2026: https://digital-strategy.ec.europa.eu/en/policies/cra-reporting
- Dutch Cyberbeveiligingswet in force 15 August 2026: https://www.nldigitalgovernment.nl/nis2-directive-cyberbeveiligingswet-cbw/
- Snyk Agent Scan: https://github.com/snyk/agent-scan
- GitGuardian changelog, 2026-09-07: https://docs.gitguardian.com/releases/saas/2026/09/07/changelog
- npm downloads: https://api.npmjs.org/downloads/point/last-month/penthera

## Before submitting

- [ ] Set a real hourly rate and recompute the budget.
- [ ] Decide whether to keep AI-adjacent wording given the Restack scope note.
- [ ] Write "Why you" in your own words.
- [ ] Refresh the adoption numbers on the day you submit.
- [ ] Answer the generative AI question honestly and attach the log.
- [ ] Re-check the deadline on https://nlnet.nl/propose/ (3 November 2026, 12:00 CET at time of writing).
