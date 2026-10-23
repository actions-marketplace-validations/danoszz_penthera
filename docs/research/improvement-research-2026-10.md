# Research: closing the gap with paid tools, provider hardening, and a public rule catalog

Written 2026-10-22. Status: **research input, not a plan.** Nothing here is
scheduled or tied to a version; the maintainer decides what, if anything,
moves to the [roadmap](../../ROADMAP.md).

Scope: what Penthera could add to test your own apps more deeply, how it could
give provider-specific advice, how it compares with paid tools, and how to
publish the rules it checks. Every proposal stays inside Penthera's rules:
detection is deterministic, an LLM never decides a finding, and active
checks run only against targets the user owns or is authorized to test.

Sources are listed per section. Items marked **[verify]** came from secondary
sources only and need a primary source before they become a rule.

---

## 1. Where Penthera stands today (v1.8.0)

About 150 discrete checks, counted from `scripts/docs-numbers.mjs` and the code:

| Surface | Today | Assessment |
|---|---|---|
| Live URL | 24 probe families, 14 built-in templates, 14 sensitive paths, 5 header checks, TLS, CORS, cookies, JWT, IDOR, OAuth, OpenAPI; opt-in injection and fuzzing | Broad, shallow on authenticated surfaces |
| Repo | 20 secret patterns, 6 regex code patterns, route and trust-boundary map, SBOM/AI-BOM | Code analysis is thin |
| Dependencies | 15 capabilities, capability diff, typosquats, licenses, IOC pack (1,596 versions), npm + Python | Strong; no CVE matching beyond Retire.js |
| AI tooling | 39 agent rules mapped to OWASP MCP Top 10 and Agentic ASI | Strongest and most distinctive area |
| Infra / DNS / cloud | SPF, DMARC, MX; `--suppliers`; macOS `--machine`; runtime EOL pack | No IaC, containers, subdomain takeover, or provider rules beyond Firebase |

### Two things to fix before adding any active check

1. **The docs promise a gate the code does not have.**
   [METHODOLOGY.md](../METHODOLOGY.md) says payload modes are "gated behind a
   confirmation prompt". In the CLI, `--deep` only prints a warning
   (`src/cli.js:481-487`). There is no scope file, no host allowlist and no
   ownership check, and no request-rate limit beyond `--concurrency`. The
   docs and the code need to agree, and the honest fix is to make the code
   match the docs.
2. **There is no rule identity.** SARIF `ruleId` is `templateId || category`
   (`src/reporter.js:525`), so many findings share an ID, and CWE is not mapped
   anywhere in code. A public catalog (section 5) needs stable IDs first.

A smaller mismatch: the site's CSP in `vercel.json` allows Vercel analytics,
while `site/README.md` says `connect-src 'none'`.

---

## 2. What paid tools sell, and which parts can be built deterministically

| Capability | Who sells it | Deterministic and local? | Notes |
|---|---|---|---|
| Scripted login and authenticated crawling | Burp Pro/DAST, Invicti, Escape | **Yes** | Replay a login script (Playwright or JSON steps) with a session-check URL; TOTP from a test seed. Only *recording* the script is AI-assisted in Burp |
| Multi-identity authorization testing (IDOR/BOLA) | Escape, Burp (Autorize pattern) | **Yes** | Replay each request as user A, user B and anonymous, then diff the responses. Stateful sequences from OpenAPI/GraphQL schemas (REST-ler style). Already on the roadmap as "authorized vs unauthorized IDOR baseline" |
| Out-of-band detection (OAST) | Burp Collaborator, interactsh | **Yes, for local targets** | A callback listener inside Penthera on 127.0.0.1 covers localhost and preview targets. Public targets would need a public callback host, which breaks the offline promise; leave that out |
| Proof-based confirmation | Invicti, XBOW | **Yes** | XBOW credits its low false-positive rate to *deterministic validators*, not to LLM judgement. That supports Penthera's model: a finding becomes `confirmed` only when a benign, exactly checkable oracle fires |
| Reachability | Snyk, Aikido, Semgrep | **Yes, costly** | Import/call graph from the repo joined to vulnerable symbols in an offline OSV snapshot. Start with JS/TS |
| Cross-file taint | Semgrep Pro, CodeQL | **Yes, very costly** | The largest build. Not recommended until the measurement work (E1) lands |
| Attack-path graph ("toxic combinations") | Wiz, Orca, NodeZero | **Yes, locally** | Chain Penthera's own findings: public route + missing auth + secret in scope + MCP tool with shell access. Rule-based edges, no inference |
| API discovery from source | StackHawk | **Yes** | Partly there via the route map; feed it into the URL scan as seed endpoints |
| Continuous monitoring and new-CVE scans | Intruder, Detectify | **Partly** | Local scheduling (`penthera watch`, roadmap) plus signed offline advisory snapshots |
| Behavioural package analysis | Socket | **Yes, already there** | Socket now also alerts on GitHub Actions, VS Code extensions and Agent Skills, which overlaps directly with `penthera agents` |
| Autonomous exploration, AD/lateral movement, external attack surface | XBOW, Pentera, NodeZero, Detectify | **No** | Needs AI planning, internet-wide data or enterprise-network scope. Out of scope by design |

**Conclusion.** The capabilities that justify paid DAST prices for small
teams are mainly authenticated scanning, multi-user authorization diffing,
local OAST and proof-based confirmation. All four can be built
deterministically and run on the user's own machine. The things Penthera
should not chase are the AI-led and SaaS-led ones.

Price context (third-party figures, approximate): Burp Pro ~$499/user/yr;
StackHawk ~$39-59/contributor/mo; Aikido paid from ~$350/mo; Snyk Team
$25/dev/mo; NodeZero $25k+/yr; Orca ~$36-60k/yr.

Sources: portswigger.net/burp/documentation/scanner/authenticated-scanning,
escape.tech/blog/escape-proprietary-algorithm, docs.socket.dev/docs/issues-list,
semgrep.dev/docs/semgrep-code/semgrep-pro-engine-data-flow,
wiz.io/blog/the-anatomy-of-a-toxic-combination-of-risk, snyk.io/pricing,
aws.amazon.com/marketplace/pp/prodview-l4tou5vhpvarm.

---

## 3. New checks worth adding

Ranked by impact × how common the issue is among indie and startup stacks ×
how easily it can be detected safely. **P** = passive or static. **A** =
active but non-destructive, opt-in, own targets only.

### 3.1 Static and passive (low risk, high yield; do these first)

| Check | How | Source |
|---|---|---|
| Next.js/React advisory ranges (CVE-2025-55182 "React2Shell", CISA KEV; CVE-2025-29927; CVE-2025-49826) | P: lockfile versions against advisory ranges, plus detection that the app serves RSC. No exploit payloads | wiz.io/blog/critical-vulnerability-in-react-cve-2025-55182, nvd.nist.gov |
| Supabase tables without row-level security | P: parse `supabase/migrations/*.sql` for `public` tables with no `ENABLE ROW LEVEL SECURITY`; flag `USING (true)`; reuse the lint list from Supabase's open-source Splinter linter. Context: CVE-2025-48757 | supabase.com/blog/supabase-security-2025-retro |
| Supabase `service_role` key in client code | P: a JWT with `role: service_role` in client bundles or `NEXT_PUBLIC_*`. Critical. The anon key is public by design and must not be flagged | same |
| Firebase open rules | P: `firestore.rules`, `storage.rules`, `database.rules.json` with `if true`, timestamp-gated test mode, or auth-only rules over the whole database | firebase.google.com/docs/rules/insecure-rules |
| Clerk development keys in production | P: `pk_test_` in a production bundle (high confidence); any `sk_` key in client code (critical) | clerk.com/docs/guides/development/deployment/production |
| Platform config hygiene | P: secrets in `wrangler.toml [vars]`, `fly.toml [env]`, or `render.yaml` `value:`; `force_https = false`; Terraform S3 with public-access blocks off or `acl = "public-read"` | provider docs |
| GitHub Actions workflow risks | P: `pull_request_target` that checks out PR code, untrusted `${{ github.event.* }}` in `run:`, unpinned third-party actions (tj-actions CVE-2025-30066 and reviewdog CVE-2025-30154 are in CISA KEV), shared caches written by untrusted triggers. The TanStack compromise of 2026-05-11 chained these and still published valid provenance | tanstack.com/blog/npm-supply-chain-compromise-postmortem |
| Shai-Hulud worm markers | P: add `setup_bun.js`/`bun_environment.js` in `preinstall` and a `SHA1HULUD` runner to the IOC pack | public incident write-ups |
| MCP SDK versions with DNS-rebinding protection off | P: Python SDK < 1.23.0 and TypeScript SDK < 1.24.0 running HTTP servers on localhost (CVE-2025-66416, CVE-2025-66414); MCP Inspector < 0.14.1 (CVE-2025-49596). This fits the existing `mcp-*` rule family | github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w |
| Hallucinated packages ("slopsquatting") | P: dependencies that are very new, very low-download, or absent from the popular-name list, introduced in AI-authored commits. ~19.7% of model-suggested packages did not exist (Spracklen et al., USENIX Sec 2025) **[verify]** | — |
| ORM filter pass-through | P: route handlers that pass `req.query`/`req.body` straight into `findMany({ where })` and similar | PortSwigger Top 10 2025 |
| Source maps and public preview URLs | P/A: `.map` files served in production; preview aliases (`*.vercel.app`, `deploy-preview-*--*.netlify.app`, `*.pages.dev`) that answer 200 instead of an auth redirect | vercel.com/docs/deployment-protection |
| ML artifact loading | P: `pickle.load`, `torch.load` without `weights_only`, `trust_remote_code=True`. Already listed as gap D in [agent-incidents-2026.md](agent-incidents-2026.md) | — |
| Dockerfile / compose / IaC basics | P: root user, `latest` tags, mounted Docker socket, `privileged: true`, services bound to `0.0.0.0`. Use Checkov/Trivy as the reference set; don't re-implement all of them | checkov.io policy index |

### 3.2 Active, opt-in, own targets (after the gate in section 1 exists)

| Check | Safe design |
|---|---|
| Middleware auth bypass differential | Compare a protected route's response with and without the bypass header. Read-only GET. Already exists as a template; extend it to routes found in the repo |
| Web cache deception oracle | With the user's own test session, request an authenticated page with a static-looking suffix, then again without auth; report only if the authenticated body comes back with a cache HIT. Use a unique random key every time |
| Cache poisoning hygiene | Probe with a unique cache key only, so no real visitor is ever affected |
| SSRF on URL-fetching parameters | Point parameters at Penthera's own local canary listener; report callbacks and whether redirects to private addresses are followed. Test with a second local canary port, never a real metadata endpoint |
| Multi-identity authorization diff | Section 2. Seed accounts come from the project's fixtures, as the roadmap already plans |
| Local dev-service exposure | On the user's own machine only: Docker API, Redis, Ollama (11434, no auth by default), databases and debug ports bound to all interfaces. This fits `--machine`; detect by bind address and banner, never by authenticating |

The PortSwigger Top 10 (2024, 2025) and the Black Hat 2025 desync research also
describe parser-discrepancy and normalization issues. Those are mostly
relevant to self-hosted nginx/HAProxy. The recommended first step is passive
only: read the proxy config in the repo (for example `proxy_http_version`
to an upstream on HTTP/1.1).

### 3.3 DNS and email (deterministic, network-dependent)

Align rule IDs and pass criteria with **internet.nl** (Apache-2.0, NCSC-NL
aligned), which gives EU users a benchmark they already recognize.

- SPF: `+all`/`?all`, more than 10 lookups, multiple records, `ptr`.
- DMARC: `p=none`, `pct<100`, missing `rua`, weaker `sp=`. internet.nl now requires quarantine or reject.
- DKIM: check a list of known provider selectors (Google, Microsoft 365, Resend, SendGrid, Mailchimp, Postmark) and report "found among N common selectors", never "missing"; flag RSA keys ≤1024 bits.
- MTA-STS, TLS-RPT, DNSSEC, CAA (including a conflict with the host's CA), DANE for MX.
- Dangling CNAMEs: resolve every CNAME the repo or config reveals; NXDOMAIN or a provider "not found" fingerprint means it can be taken over. Ship a dated, vendored copy of the can-i-take-over-xyz fingerprints in a signed pack. Discovery is limited to what the repo and the user supply; say so in the finding.

Sources: internet.nl/article/internetnl-checks-strictness-anti-mail-spoofing-standards,
github.com/EdOverflow/can-i-take-over-xyz,
cheatsheetseries.owasp.org/cheatsheets/Subdomain_Takeover_Prevention_Cheat_Sheet.html.

---

## 4. Providers: detect, harden, and maybe compare

### 4.1 Detection (a new signed pack kind: `providers`)

Penthera already fingerprints Vercel, Cloudflare and CloudFront in
`lib/crawler.js:134-200`. Extend this into a versioned offline table where
each entry has `provider`, `signal`, `confidence`, `source_url` and
`verified_on`.

| Provider | Live signal | Repo signal |
|---|---|---|
| Vercel | `x-vercel-id`, `server: Vercel`, CNAME `cname.vercel-dns.com` | `vercel.json`, `.vercel/project.json` |
| Netlify | `server: Netlify`, `x-nf-request-id` | `netlify.toml`, `_headers`, `_redirects` |
| Cloudflare | `server: cloudflare`, `cf-ray` | `wrangler.toml`/`.jsonc`, `_routes.json` |
| Supabase | `*.supabase.co` in bundles | `supabase/` |
| Firebase | `firebaseConfig` in bundles | `firebase.json`, `.firebaserc`, `*.rules` |
| AWS | `server: AmazonS3`, `x-amz-request-id`, `x-amz-cf-id` | `amplify.yml`, CDK/SAM/Terraform |
| Fly.io / Railway / Render / Heroku | `fly-request-id`; `x-railway-request-id`; Render header **[verify]**; `via: 1.1 vegur` **[verify]** | `fly.toml`, `railway.json`, `render.yaml`, `Procfile` |
| GitHub Pages | `x-github-request-id`, 185.199.108-111.153 | `CNAME`, `actions/deploy-pages` |
| Clerk / Auth0 | key prefixes; `*.auth0.com` | SDK imports |
| Resend / SendGrid / Postmark | DKIM selectors in DNS | env-var names, key formats (`re_`, `SG.`) |
| Hetzner / Scaleway / OVH | ASN lookup from a bundled table **[verify ASNs]** | Terraform `hcloud`, `scaleway`, `ovh` |

### 4.2 Provider-specific hardening advice

Each provider rule ends in a concrete fix written for that provider. Examples:

- **Vercel:** set Deployment Protection scope to cover previews (Standard) or
  everything; check that old production deployment URLs don't still serve
  pre-fix builds; gate source maps.
- **Cloudflare:** the default is now "Automatic SSL/TLS", but older zones can
  still be on Flexible or Full. This can't be seen from outside, so report
  "verify in dashboard" as `needs-human-review`, not as a finding. Watch for
  the origin IP leaking through DNS history (WAF bypass).
- **Supabase:** turn on RLS in every migration; add an event trigger that
  enforces it; run Security Advisor.
- **Firebase:** replace test-mode rules before the 30-day expiry instead of
  extending the date **[verify duration]**.
- **AWS S3:** buckets created before April 2023 don't get Block Public Access
  by default; serve through CloudFront with OAC.
- **GitHub Pages:** verify the custom domain (TXT at
  `_github-pages-challenge-<org>`) to prevent takeover.
- **Netlify:** the current default for preview visibility is unclear
  **[verify]**, so probe the live preview rather than assert.

This plugs straight into the existing remediation layer
(`lib/remediation/index.js`) and fix recipes (`lib/fix/recipes/`).

### 4.3 A neutral provider-defaults matrix (optional, higher risk)

No neutral public scorecard of provider security *defaults* appears to exist.
Trust centers are self-published, CSA STAR Level 1 is a self-assessment, and
internet.nl and the MDN HTTP Observatory test your domain rather than the
provider's defaults. Penthera could fill this gap, and it fits the "measured
in public" identity. Ground rules if it is done:

1. Score **defaults**: what a fresh free-tier project gets with no configuration.
2. Evidence only: a dated test project per provider, captured headers and DNS
   records, doc URLs, and the published scripts.
3. Binary, published criteria (previews protected by default, HTTPS enforced,
   HSTS, MFA on free tier, SSO tier, audit-log tier, EU region, DPA, SOC 2 or
   ISO, `security.txt`, VDP).
4. A **matrix, not a ranking**; no aggregate score.
5. A right-of-reply window before publishing, plus a corrections log; no
   affiliate links; conflicts disclosed.
6. Never probe provider infrastructure beyond normal use.
7. A short legal review before naming providers. Comparisons must be factual,
   dated and verifiable; EU comparative-advertising rules (2006/114/EC) matter
   more if Penthera is ever monetized.

For NIS2/CRA readers: neither law mandates EU hosting, but NIS2 Art. 21 asks
for supply-chain risk assessment of providers. Penthera can **report facts**
(provider jurisdiction, region detected, DPA and sub-processor URLs) inside
the existing NIS2 evidence output without making a recommendation, which
keeps it neutral.

---

## 5. A public rule catalog

### 5.1 What good catalogs look like

| Catalog | Worth copying |
|---|---|
| ZAP alerts (zaproxy.org/docs/alerts/) | Stable numeric ID; status (alpha/beta/release); risk; passive or active; CWE, WASC, OWASP, WSTG tags; link to the rule's source. **The best model** |
| CodeQL query help | Security-severity score, a **precision** label, CWE tags, vulnerable and fixed examples |
| Burp issue definitions | Stable type index, CWE and CAPEC |
| Semgrep Registry | Required metadata (cwe, owasp, confidence, likelihood, impact) and **mandatory true-positive and true-negative test files per rule** |
| Socket alerts | "Why it matters", "how to fix", real example packages |
| Checkov policy index | One flat searchable table |

**No vendor publishes measured per-rule precision or recall.** CodeQL's
"precision" and Semgrep's "confidence" are hand-assigned labels. Penthera
already measures precision per confidence label in `bench/RESULTS.md`, so
publishing *measured* per-rule true-positive and false-positive counts from
its fixtures would make it the only tool that does. That fits the
[manifesto](../MANIFESTO.md) better than anything else in this document.

### 5.2 Proposed design

**Rule schema** (one JSON or YAML file per rule, alongside the existing packs):

```yaml
id: PEN-WEB-0012            # stable, never reused; old category kept as alias
title: Supabase table without row-level security
surface: repo               # url | repo | deps | agents | infra
kind: passive               # passive | active-safe | active-opt-in
status: stable              # experimental | beta | stable | deprecated
severity: high
confidence_default: likely
maps:
  cwe: [CWE-862]
  owasp_top10_2025: [A01]
  asvs_5: ["8.2.1"]          # verify exact IDs
  wstg: []
  owasp_agentic_2026: []
  cra_annex_i: []
detects: What exactly is matched or probed, in plain words.
why: Why it matters, one paragraph.
fix: Provider-specific steps.
false_positives: Known limitations.
fixtures: { tp: tests/rules/PEN-WEB-0012/tp/, tn: tests/rules/PEN-WEB-0012/tn/ }
measured: { tp: 0, fp: 0, fn: 0, corpus: bench@<commit> }   # generated
references: [ ... ]          # from references.bib keys
added_in: 1.x
changed: [ ... ]
source: lib/...#L..
```

**Build:**

1. Assign IDs to everything that exists today: the 39 agent rules, 15
   capabilities, templates, secret patterns, probes and code patterns. Map
   `templateId || category` to the new ID in `src/reporter.js` and keep the
   old IDs as SARIF aliases so existing baselines don't break.
2. Generate the catalog from code in a script next to
   `scripts/docs-numbers.mjs`, so the published count and the published list
   can't drift. Reuse `lib/references.json`, `PROBE_WSTG` and
   `lib/agents/owasp.js` for the mappings.
3. CI check: every rule has an ID, a TP and a TN fixture, a CWE (or an
   explicit "n/a"), and a source link.
4. Publish on penthera.org as `/rules` (a searchable index) and
   `/rules/<id>` (one static page per rule), built by `site/build.mjs` with
   the same CSP. Also publish `rules.json` so other tools can consume it.
5. Use OpenSSF Scorecard's coverage vocabulary (COVERED, PARTIAL, GAP,
   NOT_OBSERVABLE) for a standards coverage page covering ASVS 5.0, OWASP Top
   10:2025, API Top 10 2023, LLM Top 10 2025, Agentic Top 10 2026, CWE Top 25
   2025 and CRA Annex I. Publishing the gaps is part of the point.

### 5.3 Standards to map to (latest versions as of 2026-10)

- OWASP ASVS **5.0.0** (May 2025), about 350 requirements.
- OWASP Top 10 **2025**: A03 Software Supply Chain Failures is new; SSRF is folded into A01.
- OWASP WSTG **4.2** is still the latest stable release; keep the WSTG IDs already in use.
- OWASP API Security Top 10 **2023**.
- OWASP LLM Top 10 **2025**; OWASP Top 10 for Agentic Applications **2026** (ASI01-ASI10, Dec 2025).
- CWE Top 25 **2025** (CWE-862 Missing Authorization rose five places).
- MITRE ATT&CK v18 (Oct 2025), mainly for the CI/CD and supply-chain techniques.
- CRA (EU 2024/2847): reporting duties applied from 2026-09-11; Annex I requirements apply from 2027-12-11.
- OpenSSF OSPS Baseline v2026.02.19.

---

## 6. Suggested order

This is research input; sequencing and versions are the maintainer's call.

1. **Trust fixes:** the active-mode gate (scope file, explicit confirmation,
   rate limit) so the code matches METHODOLOGY.md; the CSP doc mismatch.
2. **Rule identity and catalog:** stable IDs, schema, generator, TP/TN
   fixtures, `/rules` on the site. This also improves SARIF, and it makes
   every later rule cheaper to ship and to measure.
3. **Static high-yield rules** (3.1): Next/React advisory ranges,
   Supabase/Firebase/Clerk, platform config secrets, GitHub Actions workflows,
   MCP SDK versions, IOC updates.
4. **Provider pack and hardening advice** (4.1, 4.2).
5. **DNS/email aligned with internet.nl**, plus dangling-CNAME checks (3.3).
6. **Paid-tool parity, deterministic:** scripted login, multi-identity
   authorization diff, local OAST listener, proof-based `confirmed` oracles,
   attack-path chaining of existing findings.
7. **Later or optional:** JS/TS reachability, IaC/container rules, the
   provider-defaults matrix (after a legal review).

Each new rule family should get a pre-registered experiment in line with
[METHODOLOGY.md](../METHODOLOGY.md) before it is claimed as accurate.

## Open verification items

The 2026 Next.js CVEs (CVE-2026-75604, CVE-2026-44578, GHSA-2xp9-vwfh-vxw4);
Netlify's default preview visibility; Render's and Heroku's current headers;
Firebase test-mode duration; whether internet.nl tests MTA-STS; EU provider
ASNs; exact ASVS 5.0 requirement IDs per rule; slopsquatting figure; Wiz
acquisition status.
