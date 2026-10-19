# How Socket positions itself: notes for Penthera's docs

*Read on 2026-10-19. Everything below is paraphrased; the few quoted words are
marked. Socket's pages change often, so treat numbers as a snapshot.*

[Socket](https://socket.dev) is a well-funded supply-chain security company and
one of the clearest communicators in the field. These notes look at how it
explains itself, so Penthera can learn from the craft without copying the claims
or picking a fight. Penthera is a complement to Socket, not a rival: Socket
watches the registries from the cloud; Penthera checks your app and your machine
offline.

## 1. The headline promise

- The hero line is about securing software at "AI speed", with a sub-line that
  promises to stop malicious packages before they reach your code
  ([home](https://socket.dev/)). The tab title frames it as blocking zero-day
  supply-chain attacks.
- The core argument is one contrast, repeated on nearly every page: a CVE
  database lists accidental vulnerabilities after disclosure, while a malicious
  package is intentional and has to be stopped before install. Socket claims the
  second half that CVE scanners miss
  ([features](https://socket.dev/features),
  [supply-chain attack prevention](https://socket.dev/use-case/supply-chain-attack-prevention)).
- AI is the urgency: coding agents pull in dependencies faster than people can
  review them, so the attack surface grows
  ([features](https://socket.dev/features), [Series C post](https://socket.dev/blog/series-c)).
- A speed claim backs the promise: malicious packages flagged within minutes of
  publication ([home](https://socket.dev/)).

**Takeaway.** One sentence of promise, one contrast that explains why existing
tools are not enough, and one reason it matters now. Penthera's equivalent: one
promise (check, vet, keep watching, on your machine), one contrast (rules you can
read versus a verdict from a service), and the same "now" (AI writes the code and
picks the packages).

## 2. Who they sell to

- **Buyers are security leaders.** The case-study quotes come from a CISO
  (Anthropic), a head of security (Vercel), senior security engineers (MetaMask,
  Drata) ([customers](https://socket.dev/customers)).
- **Developers are the way in.** The free GitHub app, the CLI and the `sfw`
  firewall are the self-serve entry points, and comparison pages carry a wall of
  developer tweets ([vs Snyk](https://socket.dev/compare/socket-vs-snyk)).
- **AI-native companies** are named prominently: Anthropic, Cursor, Replit,
  Vercel and others ([Series C post](https://socket.dev/blog/series-c)).
- **Credibility from the team**: the founders present themselves as open-source
  maintainers whose packages are downloaded at very large scale
  ([FAQ](https://socket.dev/faq)).
- **Pricing** is per developer seat ([pricing](https://socket.dev/pricing)):
  a free plan for one seat with 1,000 scans a month and a lot included (GitHub
  app, AI analysis, MCP server, install firewall); Team at $25 a seat a month
  with a 5-seat minimum (adds reachability); Business at $50 with a 20-seat
  minimum (adds SBOM, SSO, AI-model and Actions scanning); Enterprise on quote
  (adds self-hosting options, other SCMs, and SAST, secrets and container scanning
  under "Socket Basics").
- **Open source**: public OSI-licensed projects can get the Business plan free
  as of August 2026
  ([announcement](https://socket.dev/blog/free-business-plan-upgrades-for-open-source)).
  The pricing page still mentions the older free Team offer.

**Takeaway.** Socket speaks to the person who signs off and lets the developer
install it. Penthera has no buyer. Its audiences are people doing the work with
no security team behind them: a founder before launch, a team adopting coding
agents, a maintainer, a small EU company, an agency. So Penthera's use-case pages
are organised by situation, not by job title.

## 3. How use cases and comparisons are structured

**Comparison pages** ([Snyk](https://socket.dev/compare/socket-vs-snyk),
[Dependabot](https://socket.dev/compare/socket-vs-dependabot),
[Semgrep](https://socket.dev/compare/socket-vs-semgrep)) share one template:

1. "Socket vs X" with a benefit subtitle.
2. Two paragraphs placing the competitor in the "known vulnerabilities only" box.
3. Install and contact-sales buttons.
4. A feature table of 8 or 9 rows with checks and dashes.
5. A second row of buttons, then a tweet wall, then a footer call to action.

They concede little. Snyk gets checks for known vulnerabilities, licence
enforcement and an API; Dependabot only for known vulnerabilities. Categories
where the competitor is stronger (SAST depth, containers, IaC, DAST) do not
appear. There are no prices, benchmarks or third-party sources in the tables.

**Use-case pages** ([open source](https://socket.dev/use-case/open-source-security),
[SCA](https://socket.dev/use-case/sca),
[supply-chain attack prevention](https://socket.dev/use-case/supply-chain-attack-prevention))
mix an SEO definition ("what is SCA"), a problem framing, a feature checklist and
a live feed of recently blocked packages. The feed is the most persuasive
element: it shows the product working today.

There is no standalone "Why Socket" page; it is a menu that groups the case
studies and comparisons. The closest page is
[features](https://socket.dev/features).

**Takeaway.** Copy the shape (one page per audience, one per alternative, a
table that is quick to scan), not the tone. Penthera's comparison pages say
"use together", name where the other tool goes further, link every claim to the
vendor's own docs, and carry a last-checked date. That honesty is the
differentiator Penthera can afford and a funded vendor often cannot.

## 4. How they use proof

- **Big numbers** on the home page: about 11.6 million commits secured a month, 1.5 million repositories, 27,000
  organisations, 10,000 attacks blocked a week ([home](https://socket.dev/)).
  The same metric differs across pages (risk signals: 70, 80 or 85; unique threat
  detections: 26,000 on [features](https://socket.dev/features) versus 300,000 on
  the home page).
- **Logos and case studies.** The strongest one, Anthropic, gives an outcome:
  most dependency reviews automated and hours saved each week per engineer
  ([Anthropic](https://socket.dev/case-study/anthropic)). Vercel and Drata
  describe workflow and hygiene rather than numbers
  ([Vercel](https://socket.dev/case-study/vercel), [Drata](https://socket.dev/case-study/drata)).
  MetaMask's engineer says openly that some false positives are an acceptable
  price for early warning ([MetaMask](https://socket.dev/case-study/metamask)).
  The Replit story was not retrievable (HTTP 403); its index card is about
  reducing false positives.
- **Funding and badges**: total raised, a $1 billion valuation, SOC 2 Type 2, a
  Fortune list, and an OpenAI early-access programme
  ([home](https://socket.dev/), [Series C post](https://socket.dev/blog/series-c)).
- **Research as proof**: threat write-ups with timestamps showing when the AI
  scanner flagged an attack, plus downloadable indicators
  ([Rust crates post](https://socket.dev/blog/popular-rust-crates-compromised)).
- **No accuracy numbers.** No false-positive rate for malware verdicts is
  published; false-positive language appears only for reachability cutting CVE
  noise.

**Takeaway.** Penthera has no logos, no funding and no usage telemetry (by
design, it has no way to count users). What it can show is what a reader can
check: benchmark precision and recall with every miss listed, rule and test
counts generated from the code, a cited methodology, an OpenSSF Scorecard, and
2FA-approved releases with provenance. That is the "By the numbers" block in the
README, refreshed by `npm run docs:numbers`.

## 5. Calls to action

- Every page pairs a free self-serve action (install the GitHub app) with a sales
  action (book a demo or contact sales) ([home](https://socket.dev/), compare and
  use-case pages).
- Product pages lead with the install command
  ([CLI](https://socket.dev/features/cli),
  [firewall](https://socket.dev/features/firewall)); every blog post ends with a
  free firewall card.
- An urgency line: a phone number for teams under active attack.

**Takeaway.** Penthera has no sales step, so its call to action is the command
itself. The README opens with three `npx` commands that each take under a
minute and need no account.

## 6. What they leave unsaid

| Topic | What Socket's pages say | Room for Penthera |
|---|---|---|
| Offline use | No offline or air-gapped mode documented. Even self-hosted firewall modes check packages against Socket's API ([firewall free](https://docs.socket.dev/docs/socket-firewall-free), [pricing](https://socket.dev/pricing)). Only manifests and lockfiles are sent, not source ([FAQ](https://socket.dev/faq)) | Everything runs locally; `--offline` limits traffic to the named target |
| Deterministic verdicts | Static analysis first, then an LLM stage, then human review before a package is labelled known malware ([AI alert](https://socket.dev/alerts/gptMalware)). No claim of reproducible results | Same input, same output, with the rule and `file:line` for each finding |
| App and runtime security | No DAST or live-URL testing; first-party SAST and secrets only on Enterprise | URL and repo scans, fix recipes, verification |
| AI tooling | Covers it as packages: an MCP server for package lookups ([MCP guide](https://docs.socket.dev/docs/guide-to-socket-mcp)), firewall ecosystems that include agent skills and models ([firewall](https://socket.dev/features/firewall)), research on malicious MCP servers ([labs](https://socket.dev/labs)). Nothing found that audits a repo's own agent config | `penthera agents`: CLAUDE.md, `.mcp.json`, hooks, permissions, plugins, rule files |
| EU compliance | SBOM export (CycloneDX, SPDX, OpenVEX) on Business and up; no NIS2 or CRA page found; compliance messaging is SOC 2 and Vanta-style integrations | NIS2 readiness, CRA Article 14 drafts, SBOM and AI-BOM, signable evidence, free |

Two cautions. Socket does cover parts of AI tooling, and says so; Penthera's docs
should not claim it does not. And the AI-versus-rules point should be made
calmly: Socket's AI scanner once flagged Penthera itself as malware because the
repository contains real test payloads. That is a fair example of the trade-off,
not a gotcha. AI stages catch novel attacks that no rule anticipated; rules
explain themselves and do not misread intent. Running both is reasonable.

## 7. What Penthera's docs take from this

1. **A three-command "Try it in 60 seconds" block** near the top of the README,
   as the call to action.
2. **Use-case pages by situation**, each with the problem, what to run, real
   example output, and what Penthera does not do
   ([docs/use-cases/](../use-cases/README.md)).
3. **Comparison pages framed as "use together"**, with factual tables, where the
   other tool goes further, links to the vendor's docs, and a last-checked date
   ([docs/compare/](../compare/README.md)).
4. **Proof without logos**: a short "By the numbers" block in the README, every
   number checkable and refreshable.
5. **A shorter README** that points to per-command pages instead of carrying
   every flag.

Things deliberately not copied: inflated or inconsistent numbers, tweet walls,
competitor tables that only list the author's strengths, and urgency language.
