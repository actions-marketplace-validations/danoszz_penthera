# E20: How safe is the web's front door? (pre-registration)

| | |
|---|---|
| Experiment | E20, with a second cohort E20b (recent startups) |
| Related | [E17](E17-offline-and-determinism.md) (format), the live check's passive report (`api/_lib/tier1.mjs`), [live check terms](../../live-check-terms.md), [results-file checklist](../results-checklist.md) |
| Status | **Registered.** 29 Oct 2026: accepted in writing by the maintainer (exclusions approved, self-review in § 13 confirmed in full), and registered by the commit that merges this version to `main`. The runs start no earlier than the morning of 30 Oct 2026 |
| Date written | 2026-10-29 (first draft and revision 2, same day; § 17) |
| Authors | Daan van der Zwaag (PI). Drafted with Claude (AI-assisted) |
| Approach approved | 29 Oct 2026, by the maintainer: a passive check of the Tranco top 1000, aggregates only. E20b added the same day |
| Data collected before registration | None. The runner was tested on loopback only (§ 9) |
| Decisions | Taken 29 Oct 2026 by the maintainer (§ 10). Open ones are in § 10.2 |
| Sub-measure B (app page) | **Adopted** for both cohorts, 29 Oct 2026, by the maintainer (§ 4.2) |
| Independent review | **None.** Decided by the maintainer on 29 Oct 2026: no outside review. A self-review checklist is worked through on registration day instead (§ 13) |
| Timeline | Registered 29 Oct 2026; runs from the morning of 30 Oct 2026, so the study page has been live at least 12 hours; results internal until the maintainer's own check, publication planned around 11 Nov 2026 |
| Tranco list ID | `ZJ8PG` (https://tranco-list.eu/list/ZJ8PG), downloaded from https://tranco-list.eu/download/ZJ8PG/full on 29 Oct 2026 |
| Tranco list date | Generated 28 October 2026; covers 29 September 2026 to 28 October 2026 (30 days); pay-level domains only, as the list page states |
| Tranco list SHA-256 | `d670a3c1910fe7baa4883dcb8320b1ec99d7d29f9d22954b9288ae678540674e` (`bench/front-door/lists/tranco-ZJ8PG-top1000.csv`) |
| YC list source | yc-oss/api, a public daily mirror of YC's company directory, at commit `5a217b81de16262f104ecfd121fa866c6917e15d` (29 Oct 2026 03:35 UTC): `batches/fall-2026.json` and `batches/summer-2026.json` (§ 3.2) |
| YC list batches and date | Fall 2026 (189 companies, 187 with a website, 2 skipped) and Summer 2026 (229, all with a website); 416 rows; built 29 Oct 2026 |
| YC list SHA-256 | `13df01eb681993205e89c00322db972e5137d3c4a95ec982d40a2552f415dd7f` (`bench/front-door/lists/yc-fall2026-summer2026-2026-10-29.csv`) |
| Exclusion list SHA-256 | `8864d275cc116af77807c3c07021fe2767f035c40339318705464b1927995215` (§ 5.1) |
| Study page live | Since 29 Oct 2026, about 16:00 CET; updated the same evening (no source address, app page listed). Checked: https://penthera.org/research/e20 redirects to the page (§ 4) |
| Source address | **Not published**, decided 29 Oct 2026 by the maintainer for privacy (§ 4). Confirmed privately on request |
| Cost | $0. One laptop or one small server, about 30 minutes per cohort |

## Abstract

**Question.** How do the most visited sites on the web, and companies from
the two newest Y Combinator batches, score on the passive checks of
Penthera's live check: HTTPS and HSTS, security headers, cookie flags,
security.txt, and the DNS records SPF, DMARC and CAA?

**Method.** A cross-sectional measurement, run once per cohort from one
source address. Each site gets robots.txt, one homepage request, one
security.txt request and public DNS lookups, at a fixed low rate, with an
honest User-Agent and opt-outs honored. The Tranco top 1000 (E20) and every
company with a website in the two newest YC batches with at least 100 companies, at most 420 (E20b).
Shares with 95% Wilson intervals; cohort differences with Newcombe
intervals; 11 confirmatory claims decided on Bonferroni-adjusted intervals.

**Result.** None yet. The results file will give each share as k of n with
its interval, the decision for each hypothesis, and every exclusion and
error count.

**Limits.** The front door only: the homepage, not the app, API or other
hosts. One snapshot from one vantage point. Tranco is a popularity list with
known biases, and YC is one accelerator. A good front door does not mean a
secure company. No independent review took place before registration.
§ 12 lists every known threat to validity.

## 1. Why

Penthera's live check grades one site's front door: transport, browser
protections, cookies, and the DNS records that stop mail spoofing. We know
what one site looks like. We do not know what normal looks like.

Two numbers would help readers judge their own result:

1. how the most visited sites on the web score on the same checks;
2. how recent startups, which ship fast and often with AI coding tools, score
   next to them.

Earlier work measured most single checks at larger scale (§ 7). E20 adds the
comparison of a startup cohort with the established web, measured by the
same released instrument, under a fixed protocol. § 7.7 says which parts are
new and which are not.

## 2. Questions and hypotheses

All shares are of sites where the check could be judged (§ 6.1). Each comes
with a 95% Wilson interval for reporting. The **decision** on each
confirmatory hypothesis uses a wider interval, corrected for 11 claims
(§ 6.5). The bands are our predictions from the prior work in § 7, written
down now so the result can prove them wrong.

### 2.1 Confirmatory hypotheses

| | Question | Measure (check ID) | Hypothesis | Basis |
|---|---|---|---|---|
| Q1 | How many top sites serve the homepage over HTTPS with HSTS of at least 180 days? | `https+hsts`: final URL is https and `max-age` ≥ 15,552,000 | Between 45% and 75% | HSTS of any length on 60% of the CrUX top 1000 in 2024 ([Web Almanac 2024](../../references.md#almanac2024security)); the 180-day floor and Tranco's non-website entries pull it down |
| Q2 | How many send a Content-Security-Policy? | `csp`: header present | Under 40% | 19% of all hosts in 2024, 21.9% in 2025 ([2025](../../references.md#almanac2025security)); top sites higher, but not double |
| Q3 | How many protect against framing? | `framing`: X-Frame-Options, or CSP `frame-ancestors` | Between 55% and 85% | X-Frame-Options alone on 64% (2024) and 67% (2025) of the top 1000 |
| Q4 | Of sites that set cookies on the first response, how many flag all of them Secure, HttpOnly and SameSite? | `cookies`, over sites that set cookies | Under 30% | 42% of first-party cookies HttpOnly in 2024; "all of them, all three flags" is much stricter |
| Q5 | How many have a CAA record? | `caa`: a CAA record on the domain or a parent | Under 40% | Few DNS operators supported CAA in [Scheitle et al. (2018)](../../references.md#scheitle2018caa); about 35,500 of the top million in [Helme (2022)](../../references.md#helme2022top1m) |
| Q6 | How many have SPF ending in `-all` or `~all` and DMARC at `quarantine` or `reject`? | `spf+dmarc` | Between 40% and 70% | Our guess; no verified recent figure for an enforcing policy at the top was found |
| Q7 | What does the live-check score look like across the top 1000? | Median score (§ 6.2) | Median between 50 and 75 | Our guess from the bands above and the score weights |
| Q8 | Do recent startups differ from the top 1000? | Difference in share, E20b minus E20 (§ 6.4) | Startups **higher** on `https+hsts`; **lower** on `csp`, `caa` and `spf+dmarc` | Modern hosts set HTTPS and often HSTS by default; CSP, CAA and DMARC need a decision by the team |

Q8 is four claims, one per check, so the confirmatory family has 11 claims
(Q1 to Q7, plus four for Q8).

### 2.2 What would prove each claim wrong

A claim is **supported** when its decision interval lies inside the
predicted band (Q1 to Q7) or excludes zero on the predicted side (Q8). It is
**refuted** when the interval lies wholly outside the band, or excludes zero
on the other side. Anything else is **inconclusive**, and is reported as
such, not as support.

| Claim | Refuted by |
|---|---|
| Q1 | Decision interval wholly under 45% or wholly over 75% |
| Q2 | Decision interval lower bound at or over 40% |
| Q3 | Decision interval wholly under 55% or wholly over 85% |
| Q4 | Decision interval lower bound at or over 30% |
| Q5 | Decision interval lower bound at or over 40% |
| Q6 | Decision interval wholly under 40% or wholly over 70% |
| Q7 | Bootstrap decision interval of the median wholly under 50 or wholly over 75 |
| Q8, `https+hsts` | Difference interval wholly under 0 (startups lower) |
| Q8, `csp`, `caa`, `spf+dmarc` | Difference interval wholly over 0 (startups higher) |
| Q8, any | "No meaningful difference" when the interval lies within ±10 percentage points (§ 6.4). That does not refute the direction, but it says the difference is too small to matter |

The decision rules are code (`bandDecision`, `directionDecision` in
`bench/front-door/run.mjs`), tested in `tests/front-door.test.js`, so the
results file reports what the code decided.

### 2.3 Secondary and exploratory

Secondary, reported with 95% intervals, no hypothesis: `nosniff`,
`referrer`, `permissions`, `csp-scripts`, `cors`, `disclosure`, `tls`,
`cert`, `mixed-content`, `sri`, `libraries`, `generator`, `runtime`,
`security-txt`, and the separate `spf` and `dmarc` checks. Their Q8
differences get a p-value and a Benjamini–Hochberg q-value (§ 6.4).

Exploratory, labelled so in every place they appear: the hosting platform
(§ 6.7), the clustering and model (§ 6.8), and the Web Almanac comparison
(§ 6.9). Sub-measure B has its own two hypotheses, HB1 and HB2, outside the
confirmatory family, so removing B changes nothing else (§ 4.2, § 6.6).

**What "HTTPS-only" means here.** The runner visits `https://<domain>/`
first. It does not also visit `http://` to check the redirect, because that
is a second homepage visit. HSTS is the check that keeps browsers off
`http://`, so Q1 uses HTTPS with HSTS. The limit is stated next to every Q1
number.

### 2.4 Changes in this revision (before any data)

Written 29 Oct 2026, before any list was fetched or any study site
contacted, after reading the prior work in § 7:

| | Before | After | Why |
|---|---|---|---|
| Q1 | 50% to 80% | **45% to 75%** | The Almanac counts HSTS of any length; Q1 needs 180 days |
| Q3 | 40% to 75% | **55% to 85%** | X-Frame-Options alone is on 64% to 67% of the top 1000 |
| Q8 | "worse on CSP, CAA and DMARC" | Four named checks, `spf+dmarc` in place of DMARC alone | Matches Q6, and each direction is now one claim |
| Decisions | Interval reported, no rule | Supported, refuted or inconclusive, on Bonferroni-adjusted intervals | A claim needs a stated way to fail |
| Q7 | Median, no interval | Seeded bootstrap interval | The median needs an interval to be decided |

## 3. Targets

### 3.1 E20: Tranco top 1000

- **Source.** The Tranco list ([Le Pochat et al., 2019](../../references.md#lepochat2019tranco)):
  the **default daily list** that tranco-list.eu publishes, not a custom
  list. Its default configuration combines several providers' rankings over
  30 days and holds registrable (pay-level) domains, without subdomains. No
  custom list is generated, so no choice of providers or filters is ours.
- **Who fetches it, and when.** The maintainer, by hand, on registration day.
  The runner never downloads a list.
- **Procedure.**
  1. Open `https://tranco-list.eu/` and follow the link to the latest list.
     Note the **list ID** the page shows (a short code; the list's permanent
     page is `https://tranco-list.eu/list/<ID>`), the **date** it was
     generated and the date range it covers, exactly as the page states them.
  2. Download the full list as CSV from that list page (the page's own
     download link for that ID, so the file is the one the ID names). Record
     the exact download URL used.
  3. Keep the first 1000 rows unchanged, line endings included:
     `head -n 1000 <download>.csv > bench/front-door/lists/tranco-<ID>-top1000.csv`.
  4. `shasum -a 256 bench/front-door/lists/tranco-<ID>-top1000.csv`.
  5. In the table above, replace `pending` with the list ID, the date and
     date range from step 1, and the SHA-256 from step 4.
- **Rows.** `rank,domain`, no header. One visit per domain. Duplicates are
  dropped. The runner refuses to run when the file's hash differs from the
  table.

### 3.2 E20b: recent startups

- **Source.** The public websites of the companies in the **two newest
  Y Combinator batches with at least 100 companies each**, as YC's public
  company directory lists them. YC lists a few companies in a batch months
  before it starts (on 29 Oct 2026, Summer 2027 had 1 and Winter 2027 had 6),
  so "newest" alone would give a handful of sites; the 100-company rule
  picks the newest real cohorts. On registration day these were **Fall 2026**
  and **Summer 2026**.
- **How it is read.** YC's directory loads its companies with JavaScript,
  and the study's browser could not open it. The list is read from
  **yc-oss/api** (https://github.com/yc-oss/api), a public mirror of the same
  directory that is updated daily, at the commit recorded in the table above.
  Pinning a commit makes the list exactly reproducible by anyone. The mirror
  is not YC's own publication; a difference between the mirror and the live
  directory on that day is a limit (§ 12).
- **Procedure.**
  1. Read `batches/fall-2026.json` and `batches/summer-2026.json` at the
     pinned commit.
  2. For each company, in file order, keep the `website` field. Skip
     companies without one, and record how many were skipped.
  3. Write `bench/front-door/lists/yc-fall2026-summer2026-2026-10-29.csv`
     with the header `batch,company,domain`, one row per company. Commas are
     dropped from company names. The runner keeps only the hostname.
  4. `shasum -a 256` the file, and record the source, batches, counts, date
     and hash in the table above.
- **Selection.** Every company in the two batches that lists a website. There
  is no sampling and no cap below 420 (the runner's limit for this cohort,
  well above two batches). No company is added or dropped by hand after the
  hash is recorded; the exclusion list (§ 5.1) is the only way a listed
  company is not visited.

**Out of scope for E20b, by design.** Logged-in apps, checkout and payment
pages or flows, APIs, mobile apps, and anything beyond the public homepage
(and, only if B is adopted, the one page in § 4.2). Testing those needs each
company's permission. The runner enforces part of this: a listed host that
starts with `app.`, `dashboard.`, `console.`, `portal.`, `admin.`, `login.`,
`auth.`, `api.`, `checkout.`, `pay.`, `billing.`, `shop.` or similar is not
a homepage and is never visited as one. Only the hostname of a listed URL is
kept; its path is dropped.

### 3.3 Sample size and precision

There is no sampling: each cohort is a census of its list. The sizes are
fixed by the lists, so this section says what they can detect, not how many
to draw. Expected judged sites: 600 to 800 of the Tranco 1000 (many entries
are CDN or API domains that serve no homepage, and some are excluded), and
150 to 300 for E20b.

| Judged sites | 95% Wilson half-width at 50% | Decision half-width at 50% (z = 2.84) |
|---|---|---|
| 150 | ±8.0 points | ±11.6 points |
| 300 | ±5.7 points | ±8.2 points |
| 600 | ±4.0 points | ±5.8 points |
| 800 | ±3.5 points | ±5.0 points |

For Q8, the smallest difference detected with 80% power at the decision
level (normal approximation):

| E20 judged | E20b judged | At a 20% share | At a 50% share |
|---|---|---|---|
| 600 | 150 | 13.4 points | 16.8 points |
| 600 | 300 | 10.4 points | 13.0 points |
| 800 | 300 | 10.0 points | 12.5 points |

So E20 can show a startup gap of about 10 to 17 percentage points, and not a
smaller one. A smaller true gap will read as "inconclusive", and the results
say that. "No meaningful difference" (§ 6.4) is reachable only for checks
with low or high shares, because near 50% the decision interval is wider
than ±10 points. Adding more YC batches would narrow it; that is a decision
for the maintainer (§ 10.2), not something changed after seeing data.

## 4. What is sent, per site

Through the live check's own passive report (`passiveReport` in
`api/_lib/tier1.mjs`), with its guard (`api/_lib/guard.mjs`). E20 sets
options that make it send less than the live check:

| Step | Request | Limit |
|---|---|---|
| 1 | `GET /robots.txt` | 4 s, 64 KB, 2 redirects. An opt-out stops here (§ 5) |
| 2 | `GET /` on `https://<domain>`, with the TLS handshake | 6 s, 1.5 MB, at most 4 redirects, each one checked by the guard |
| 2b | Only if https does not connect: `GET /` on `http://<domain>` | Same |
| 2c | Only if the domain does not resolve: steps 1 and 2 once on `www.<domain>` | Same |
| 3 | `GET /.well-known/security.txt` (a file meant to be fetched, [RFC 9116](../../references.md#foudil2022rfc9116)) | 4 s, 32 KB |
| 4 | Public DNS: TXT for SPF and `_dmarc`, CAA walking up to the registrable domain | 2.5 s per lookup |
| B | **Only if § 4.2 is adopted:** `GET /robots.txt` and `GET <one linked page>` on the same registrable domain | 4 requests, 6 s, 2 redirects, same site only |

Not sent: the scripts and stylesheets the page references (the live check
reads up to 14; E20 sets `assets: false`), any guessed path, any query string
of our own, any payload, any form, any login. The secret rules do not run
(`secrets: false`): a key found on a stranger's homepage would need a
disclosure process this study does not have.

- **One visit per site.** One pass through the steps above, no retries.
- **Budget.** At most 20 requests and 8 seconds per site, as the live check;
  a hard stop at 20 seconds.
- **Rate, fixed.** 4 sites at a time, and each worker waits 1 second
  between sites. That is at most about 4 sites a second overall and never
  more than one visit to any site. A registered run cannot change this: the
  runner refuses `--concurrency`, `--delay`, `--limit` and `--app-page` with
  `--registered E20`, and uses the fixed values whenever it leaves loopback.
- **User-Agent.** `Penthera-Research/E20 (+https://penthera.org/research/e20;
  opt out: robots.txt User-agent: Penthera-Research)`.
- **Study page.** `https://penthera.org/research/e20` (source:
  `site/pages/research-e20.md`, served at `/research-e20`, with a redirect
  from `/research/e20` in `vercel.json`). It says what E20 is, what it
  requests, how to opt out, what is kept, and who to contact. **It must be
  live before any run.** The maintainer opens the URL on registration day and
  records the date in the table above.
- **Source address: not published.** Decided by the maintainer on 29 Oct
  2026. The study runs from the maintainer's own connection, whose address
  is personal data; publishing it would contradict the privacy Penthera asks
  of others. Nothing that identifies a maintainer's location, network or
  machine is published anywhere in E20. The User-Agent identifies every
  request. An owner who wants to know whether a request was ours emails the
  address and time they saw, and we confirm or deny privately. The address
  is kept only in the private run log, for those confirmations, and deleted
  with the raw data. If someone asks for a published, named address, a
  later run can use a rented server whose address is not personal data;
  that would be a logged deviation.

### 4.1 What E20 could look at, and does not

E20 measures the **front door**: the page a company puts forward at its main
domain. More of a company's surface is reachable without logging in, and
two ways to see more were considered and left out on purpose.

- **Subdomain discovery from certificate transparency logs.** Every TLS
  certificate is logged publicly, so the names of a company's subdomains
  (`staging.`, `admin.`, `api.`, `old.`) can be read without touching the
  company at all, and each name could then be checked like the homepage.
  E20 does not do this, for four reasons:
  - It is the first step of an attack (reconnaissance). Doing it to
    hundreds of companies who did not ask would contradict the reason
    Penthera exists, and the project rule that scans touch only hosts the
    maintainer named.
  - The hosts it finds were not put forward to visitors. Many are staging,
    internal or forgotten systems. Requests to them are less expected,
    more likely to set off alarms, and harder to justify than a homepage
    visit.
  - A finding on a forgotten host is a vulnerability report, not a
    statistic. It would need a disclosure process per company, which this
    study does not have (§ 8).
  - It multiplies the requests per company by tens or hundreds, against the
    budget in § 4.
- **Crawling other pages** (pricing, docs, blog). These are usually served
  by the same host with the same headers, so they add load and little
  information.

**What this means for the results.** E20 says nothing about a company's
API, staging hosts or other subdomains, and, unless B is adopted, nothing
about its app. A company with a strong homepage can run a weak app, and a
weak homepage can sit in front of a well-built app. Every result is stated
as a result about the front door only. A study of the wider surface would
need consent from the companies, or a bug-bounty program that invites it,
and would be a separate, separately registered study.

### 4.2 Sub-measure B: one app or login page (adopted)

**Status.** Adopted for both cohorts by the maintainer on 29 Oct 2026. The
runner turns B on for a registered run because the table row above says
**Adopted**.

**Why consider it.** For a startup, the homepage is often a marketing site
on a site builder or a static host, and its headers are mostly that host's
defaults. The product lives behind "Log in". Without B, Q8 compares hosting
defaults as much as engineering choices (§ 12). B measures the one page a
company itself links as the way into its product.

**What B sends.** From the homepage already fetched in step 2, nothing new
is read. The runner looks for the **first link** whose text is one of "Log
in", "Login", "Sign in", "App", "Open app", "Go to app", "Launch app", "Web
app", "Dashboard", "Go to dashboard", "Console" or "My account", or whose
path is `/login`, `/log-in`, `/signin`, `/sign-in`, `/app`, `/dashboard` or
`/console` (`APP_LINK_TEXT`, `APP_LINK_PATH`). Then:

1. The link must be on the **same registrable domain** as the homepage
   (`app.example.com` for `example.com` is; `accounts.google.com` or an
   outside sign-in provider is not). Its query string and fragment are
   dropped.
2. The linked host is checked against the exclusion list (§ 5.1).
3. `GET /robots.txt` on the linked host. B honors an opt-out naming us, and
   also any `Disallow` rule that matches the linked path, in our group or in
   `*` ([RFC 9309](../../references.md#koster2022rfc9309) longest match). This
   is stricter than step 1, on purpose: a login path is more sensitive than a
   homepage.
4. One `GET` of the linked page, at most 2 redirects, each one required to
   stay on the same registrable domain. A redirect to another site (an
   outside sign-in provider) is **not followed**, and B is recorded as
   `off_site`.
5. Only the response headers are graded, with the homepage's header checks
   (`APP_CHECKS`). The body is not parsed, no form is read or submitted, no
   script is loaded, no credential is sent.

**Limits for B.** At most 4 requests and 6 seconds per site, inside the
site's 20-second hard stop. One link per site. English link text only. No
second try.

**What B is not.** It is not a login attempt, a test of authentication, or a
look at anything behind the login. A login page that any visitor reaches with
one click from the homepage is still the front door, by the company's own
choice. Pages it links onward are not followed.

## 5. Exclusions

| Reason | Rule | Reported as |
|---|---|---|
| Opt-out | The live check's rule (`optedOut` in `api/_lib/page.mjs`): a robots.txt group naming `Penthera-Research` or `Penthera-QuickCheck` with `Disallow: /` | `opted_out` |
| Opt-out for everyone | A robots.txt `User-agent: *` group with `Disallow: /` (§ 10, decision 4). E20 only: the passive report's `optOutAll` option, which the live check never sets. The visit stops after robots.txt. It counts even when a later group names us, the cautious reading | `excluded:robots_disallow_all` |
| Not a homepage | Host starts with `app.`, `api.`, `checkout.` and the others in § 3.2 | `excluded:not_a_homepage` |
| Exclusion list | A host on the exclusion list (§ 5.1), or a subdomain of one | `excluded:exclusion_list`, and a count per category in `exclusionCategories` |
| Error | No address, no connection, invalid certificate, timeout, too many redirects | `error:<code>` |
| B only: path disallowed | The linked page's robots.txt disallows its path for us or for `*` | `app: excluded:robots_disallow_path` |
| B only: no link | No link on the homepage matches § 4.2 | `app: no_link` |
| B only: off site | The linked page redirects to another registrable domain | `app: error:off_site` |

Every count goes in the results. Errors are not retried, and they are
described, not imputed. Many Tranco entries are not websites (CDN and API
domains); the error count shows how many.

### 5.1 The exclusion list

`bench/front-door/lists/exclusions.txt`, one list for both cohorts, written by
hand by the maintainer and hashed on registration day with the target lists.
A registered run needs it (`--exclude`), and the runner refuses it when its
SHA-256 differs from the table above.

- **Format.** One `<domain> <category>` per line, `#` comments. A domain also
  covers its subdomains, so `gov` excludes every `.gov` host. The runner
  refuses an unknown category or a malformed line.
- **Categories.** `adult` (pornography and sexual services), `gambling`
  (betting, casinos, lotteries), `health` (hospitals, clinics, pharmacies,
  telehealth, health information and mental-health services; a startup
  whose users are patients counts, a B2B tool for clinics does not unless
  unsure), `government` (public bodies of any country and intergovernmental
  organizations), `at-risk` (sites whose visitors or owners could be harmed
  by being studied: domestic-violence and abuse support, LGBTQ+ support,
  refugee and migrant aid, human-rights, press-freedom and whistleblowing
  sites).
- **How it is built.** Before the target lists were read, the government
  section was written as public-sector suffixes (`gov`, `mil`, `gov.uk`,
  `gouv.fr` and the others in the file). On registration day, after both
  target lists are stored, the maintainer reads every domain in both files
  once, in order, and adds each one that falls in a category. Where the name
  alone does not say, the maintainer may open the site's homepage in a normal
  browser, which is a visit any reader could make. **When unsure, the domain
  is listed.** No free category source is used: none was found that is
  public, free and stable enough to hash.
- **Frozen.** After the hash is recorded, the file does not change. A site
  that should have been listed and was not is reported as a deviation
  (§ 16), and its record is removed from the raw data before the aggregate
  is computed.

## 6. Analysis (fixed before any run)

Everything in this section is code in `bench/front-door/run.mjs`, unless it
says otherwise, so the aggregate is produced by the registered commit, not
by hand.

### 6.1 Per check

For each check: `n` (sites where it was judged), `passed`, the share, its
95% Wilson interval ([Wilson, 1927](../../references.md#wilson1927probable))
and its decision interval (§ 6.5). A check with weight 0 is "could not
check" (DNS did not answer, security.txt timed out). It counts as unknown,
never as a fail, and the unknown count is reported. A check that only
applies sometimes (`cookies` when cookies are set, `csp-scripts` when a CSP
exists, `cors` when CORS headers are sent) is reported over the sites where
it applies, and the denominator is named.

### 6.2 Score

The score is the live check's score (`grade.mjs`) under E20's options. It
leaves out the referenced scripts and the secret rules, so for some sites it
differs from what penthera.org shows. Reported: mean, minimum, 10th, 25th,
50th, 75th and 90th percentiles, maximum, and a histogram in bins of 10.
The median gets a percentile bootstrap interval: 10,000 resamples, seed
2020, at 95% and at the decision level. The seed is fixed so a re-run on the
same raw data gives the same interval.

### 6.3 Groups and sensitivity

- E20: per country-code TLD, from the domain. Groups with fewer than 20
  visited sites are not reported, and their count is.
- E20b: per batch, under the same rule.
- No per-category groups: no category source was chosen (§ 5.1). Excluded
  sites are counted per exclusion category.
- **Sensitivity, one per site.** The Tranco list holds several domains of
  one organization, and some redirect to the same place. The aggregate
  repeats every share over one record per registrable domain the homepage
  ended on, keeping the highest-ranked. If a confirmatory decision changes
  under this view, the results say so next to the decision.

### 6.4 Startups against the top 1000 (Q8)

Per check, the difference in shares, **E20b minus E20**, with Newcombe's
hybrid score interval, method 10
([Newcombe, 1998](../../references.md#newcombe1998interval)).

- **Confirmatory (Q8, four checks).** Decided on the decision interval
  (§ 6.5) by `directionDecision`. The smallest difference that matters is
  **10 percentage points**: a difference whose whole decision interval lies
  within ±10 points is reported as "no meaningful difference". We chose 10
  points because a smaller gap would not change what we tell a founder.
- **Secondary (every other check).** A 95% Newcombe interval, a two-sided
  pooled two-proportion z-test p-value, and a Benjamini–Hochberg q-value
  over the secondary family
  ([Benjamini and Hochberg, 1995](../../references.md#benjamini1995fdr)).
  A q-value under 0.10 is reported as "worth a follow-up", never as a
  finding.
- **Score.** The difference in median score, with a seeded bootstrap
  interval (§ 6.2) from the two raw files. Descriptive.

`node bench/front-door/run.mjs --compare <E20>/aggregate.json <E20b>/aggregate.json`
prints all of this. It reads the private `raw.jsonl` next to each aggregate
only for the bootstrap, and prints only the interval.

### 6.5 Decision rules and multiple claims

- **Family.** The 11 confirmatory claims (Q1 to Q7, and Q8's four checks).
- **Correction.** Bonferroni: each decision interval is at
  1 − 0.05/11 (z = 2.8376 for Wilson and Newcombe intervals; the 99.55%
  percentile interval for the bootstrap). This keeps the chance of one or
  more wrong "supported" or "refuted" calls in the family at or under 5%.
  Bonferroni is conservative; we chose it because it works with intervals
  and needs no p-values.
- **Rules.** `bandDecision` for Q1 to Q7 and `directionDecision` for Q8,
  as in § 2.2.
- **Reporting.** The 95% interval is the one shown next to every number.
  The decision interval is shown next to each decision.

### 6.6 Sub-measure B (adopted)

Reported apart from everything above, and only if B is adopted.

- Counts: homepages visited, links found, B visits, and each B exclusion
  and error.
- The share passing each `APP_CHECKS` check on the app page, with 95%
  Wilson intervals.
- **Paired comparison**, for `https+hsts`, `csp`, `framing`, `nosniff`,
  `referrer` and `cookies`: for each site with both pages judged, both pass,
  only the homepage passes, only the app page passes, neither. The share of
  discordant sites where only the app page passes, with a Wilson interval.
- **HB1:** framing protection passes more often on the app page than on
  the homepage of the same site. **HB2:** the same for CSP. Each is
  supported when the discordant share's interval lies wholly above 0.5,
  refuted when wholly below. Their own family of two, at 1 − 0.05/2
  (z = 2.2414). Prediction basis: a login page is a clickjacking target, and
  app frameworks and sign-in libraries often set these headers.
- B never enters Q1 to Q8, the score, or the groups above.

### 6.7 Hosting platform (exploratory)

From the homepage response already fetched, with fixed rules
(`EDGE_RULES`, `BUILDER_RULES`): the **edge** (Vercel, Netlify, Cloudflare,
CloudFront, Fastly, Akamai, GitHub Pages, Google, other) from response
headers, and the **builder** (Webflow, Framer, WordPress, Wix, Squarespace,
HubSpot, Ghost, Shopify, other, none) from the generator tag. Per platform
with at least 20 sites: the median score and the share per check. The
question: how much of a front-door score is the platform's default? This is
exploratory, platform labels are heuristics, and a platform result says
nothing about a site that runs on it. Platforms are named in a publication
only for groups of at least 20 sites, framed as platform defaults (decided
by the maintainer, 29 Oct 2026); smaller groups go under "other".

### 6.8 Clustering and a simple model (exploratory, specified now)

Not implemented yet. The code lands, tested on synthetic data, before the
run; if it does not, this analysis is reported as post hoc.

- **Clustering.** Each judged site is a vector of 12 outcomes (`https+hsts`,
  `csp`, `framing`, `nosniff`, `referrer`, `permissions`, `cookies`, `spf`,
  `dmarc`, `caa`, `security-txt`, `tls`). Distance: share of disagreeing
  outcomes among those judged on both sites. Average-linkage hierarchical
  clustering, cut at k from 2 to 6, k chosen by the highest mean silhouette.
  Reported: cluster sizes, each cluster's pass share per check, and its mix
  of cohorts and platforms. Clusters under 20 sites are merged into
  "other". No site is named.
- **Model.** An L2-regularized logistic regression (penalty fixed at 1.0)
  predicting "score at least 70" (the live check's "A few quick fixes" line)
  from cohort, edge and builder platform, and TLD group. Ten-fold
  cross-validated area under the ROC curve, folds fixed by seed 2020, and
  odds ratios with bootstrap intervals.
- **Limits.** Observational, one snapshot, few features. Associations, not
  causes: "sites on platform X score higher" does not mean moving to X
  raises a score. Not used for any decision in § 11.

### 6.9 Against the Web Almanac (exploratory)

For checks the Web Almanac also reports, the results put the E20 share next
to the Almanac figure, with the Almanac's year, unit (hosts, pages, requests
or cookies), client (desktop or mobile) and ranking source (CrUX). The units
differ from ours (sites, judged once), so this is a sanity check, not a test.
A large gap is explained or listed as a limit, never tuned away.

### 6.10 What we publish

Aggregates only: the tables above, the decisions and the score
distribution. **No site is named.** Neither a top site nor a startup is
named in any publication, chart, thread or talk, and there is no ranking.
No group under 20 sites is shown. The one exception, and it is optional: a
list of sites that scored 100 and whose owners said yes in writing to being
named. Results stay internal until the maintainer approves publishing them.

## 7. Prior work

Each source below was checked on 29 Oct 2026 against its DOI, its
USENIX or NDSS page, or the Almanac itself.

### 7.1 Top lists

**Tranco** ([Le Pochat et al., 2019](../../references.md#lepochat2019tranco))
combines several popularity rankings over 30 days so that a single
provider's quirks, and manipulation, matter less. It is the default list for
web measurement research, which is why E20 uses it. [Ruth et al.
(2022)](../../references.md#ruth2022toppling) evaluated how accurately
popular top lists reflect real web traffic, and found that the lists differ. E20 uses only the
top 1000, where the lists agree most, and names the list ID so the cohort
is exact.

### 7.2 HTTPS and HSTS

[Felt et al. (2017)](../../references.md#felt2017measuring) measured HTTPS
adoption from the user side, with aggregate Chrome and Firefox metrics, and
from the server side, across top and long-tail websites. [Kranch and Bonneau
(2015)](../../references.md#kranch2015upgrading) studied HSTS and key
pinning and found that developers often misused both, and that many HSTS
domains leaked cookies. [Amann et al. (2017)](../../references.md#amann2017mission)
measured the adoption of HTTPS security mechanisms after the DigiNotar
compromise. Together with the Almanac (§ 7.3), they set the expectation that
HSTS is common but far from universal at the top. E20 does not improve on their scale. It measures HSTS with a 180-day
floor on the same sites as the other checks, so the share is joint.

### 7.3 Security headers

[Weichselbaum et al. (2016)](../../references.md#weichselbaum2016csp)
showed that most deployed CSPs did not stop script injection. [Lavrenovs and
Melón (2018)](../../references.md#lavrenovs2018http) measured security
headers across the top million sites. The **HTTP Archive Web Almanac**
security chapters
([2024](../../references.md#almanac2024security),
[2025](../../references.md#almanac2025security)) report headers across
millions of pages every year, with breakdowns by CrUX rank. In 2024 they
report CSP on 19% of hosts, and for the top 1000, HSTS on 60% and
X-Frame-Options on 64%. In 2025, CSP rose to 21.9% and X-Frame-Options was
on 67% of the top 1000. [Helme (2022)](../../references.md#helme2022top1m)
crawls the top million daily and reports HTTPS, HSTS, CSP and CAA trends.
For headers at the top of the web, **E20 adds nothing the Almanac could not
measure**. Its header numbers are a check on the instrument (§ 6.9).

### 7.4 Mail authentication and CAA

[Durumeric et al. (2015)](../../references.md#durumeric2015email) gave an
empirical analysis of email delivery security, including the sender
authentication that SPF and DMARC provide. The records follow
[RFC 7208](../../references.md#kitterman2014rfc7208) (SPF) and
[RFC 7489](../../references.md#kucherawy2015rfc7489) (DMARC). [Scheitle et
al. (2018)](../../references.md#scheitle2018caa) gave a first look at CAA
([RFC 8659](../../references.md#hallambaker2019rfc8659)): domain holders
configured it in "encouraging but error-prone ways", and only six of the 31
largest DNS operators let customers add CAA records. The Web Almanac security chapters do not report SPF, DMARC or
CAA, so a joint view of these with the HTTP checks on one site list is less
common.

### 7.5 security.txt

[Poteat and Li (2021)](../../references.md#poteat2021securitytxt)
monitored security.txt deployment on top websites over 15 months and the
issues in the data it provides, and [Findlay and Abdou
(2022)](../../references.md#findlay2022securitytxt) characterized its
adoption and its use for vulnerability notification. The Web Almanac 2025 reports security.txt on about 1.8% of
sites, and that at least a quarter of files are not fully valid. E20 adds a
startup cohort's share, nothing more.

### 7.6 Startups and AI-built apps

We found no peer-reviewed measurement of startup websites' passive security
posture against the established web (search on 29 Oct 2026 in Crossref and general web search; not a
systematic review, so we may have missed one). Grey
literature exists on apps built with AI coding platforms. Escape's research
team ([Hinniger-Foray et al., 2025](../../references.md#escape2025vibe))
reports scanning about 5,600 such apps, with subdomain enumeration, API path
discovery and dynamic testing in a non-destructive mode, and finding more
than 2,000 high-impact vulnerabilities and 400 exposed secrets. That work
goes much deeper than E20 and is active testing of systems whose owners did
not ask; E20 deliberately stays passive and at the front door (§ 4.1). The
two answer different questions. Per-company scan pages from commercial
"risk report" sites also exist; they are automated, unreviewed and name
companies, which is what E20 will not do.

The **MDN HTTP Observatory** grades one site's HTTP headers and says an A+
does not mean a site is secure. The live check makes the same point about
its own score.

### 7.7 What E20 adds, honestly

| Angle | New? | Why |
|---|---|---|
| Header and HTTPS adoption at the top of the web | **No** | The Web Almanac and others measure it at far larger scale, every year |
| A combined front-door score | **No** | The Observatory and others grade sites; ours is the live check's score, useful to Penthera's readers, not a research contribution |
| HTTP checks, mail authentication and CAA on the same sites, jointly | **Partly** | Each is measured elsewhere; the joint view and the joint score per site is less common |
| Recent startups against the established web, same instrument, same week | **Yes, as far as we found** | No peer-reviewed comparison found (§ 7.6) |
| Hosting-platform defaults as an explanation (§ 6.7) | **Partly** | The Almanac breaks down by technology for some metrics; not for this startup comparison |
| A preregistered, fixed, released instrument with a guard, hashed inputs and coded decision rules | **Method, not finding** | Reproducibility is the contribution; anyone can re-run it on the same lists (§ 14) |
| The app page against the homepage of the same site (B, adopted) | **Yes, as far as we found** | A paired, passive view of how far the front door reflects the product |
| A claim about AI-built apps | **No** | E20 does not know how a site was built. "Recent startups" is not "AI-built", and no result will say otherwise |

E20 is a small, careful study. Its value is the startup comparison and the
fact that it can be repeated exactly. It is not a census of the web.

## 8. Ethics, law and data

### 8.1 Our position

Penthera's mission is to make agentic security accessible. Rules decide,
not models, and every claim is one we can show. For E20 that means:

- We study the **web as a whole**, not any one site. The unit we publish is a
  share of many sites, never a site.
- We send what one visitor's browser would send to a homepage, minus the
  scripts, and less if the owner asks.
- We say who we are on every request, and we stop when asked.

**What we will never do in E20:**

1. Name a site, a company or a founder in any result, chart, post or talk
   (the only exception is § 6.10's opt-in list of perfect scores).
2. Publish or share a per-site result, a ranking, or a list of sites that
   failed a check.
3. Claim a third party is vulnerable. A missing header is a missing
   protection, not a vulnerability, and E20 never says otherwise.
4. Probe further: no follow-up visit, no second pass, no subdomain or path
   discovery, no login, no form, no payload.
5. Sell, trade or share the raw data, or use it for marketing to the sites
   in it.
6. Use a model to decide a finding. Every outcome is a deterministic rule.

### 8.2 The Menlo Report principles

The Menlo Report ([Dittrich and Kenneally, 2012](../../references.md#dittrich2012menlo);
[Bailey et al., 2012](../../references.md#bailey2012menlo)) adapts the
Belmont principles to ICT research and adds a fourth.

| Principle | What it asks | How E20 meets it | What is left |
|---|---|---|---|
| Respect for persons | Consent where possible; respect autonomy | Sites are organizations, not people. Consent from 1,300 sites is not practical, so E20 uses the web's own consent signals: robots.txt opt-out before the visit (our name, or `*` disallowing all), removal on request after, a study page, an honest User-Agent | Owners who do not read robots.txt or logs never learn of it; the study page, the User-Agent and private confirmation on request are the mitigation |
| Beneficence | Do no harm; maximize benefit | One visit, 3 to 4 requests, 4 sites a second overall; no assets, no payloads; sensitive categories excluded; no names published. Benefit: a public baseline that helps site owners judge their own front door | A few requests to a fragile server; a WAF alert someone has to read (§ 8.5) |
| Justice | Fair selection; fair spread of burdens and benefits | Cohorts chosen by public, fixed rules (a top list; every company in two batches), not by who looks weak. No cohort is singled out in reporting | Startups bear the comparison; results are framed as a baseline for them, and founders can get a private report (§ 8.8) |
| Respect for law and public interest | Comply with law; be transparent and accountable | Legal reasoning in § 8.4; protocol, code and decisions public before the run; an incident plan (§ 8.6); results reviewed before publishing | Not legal advice; untested jurisdictions are handled by exclusion |

### 8.3 Internet-measurement norms

[Partridge and Allman (2016)](../../references.md#partridge2016ethical)
argue that a measurement paper should state the ethical questions its work
raises and how it handled them, and that the most important one is how the
collection may affect a person's well-being. This
section and § 8.5 are that statement. [Durumeric et al.
(2013)](../../references.md#durumeric2013zmap) list seven practices for
Internet-wide scanning (their Table 5). E20 is far smaller than an
Internet-wide scan, but we apply each:

| ZMap practice | E20 |
|---|---|
| Coordinate with local network admins | The run is from one address we control; we tell the hosting provider in advance if it is a rented server |
| Verify the scan will not overwhelm the network or upstream | About 4 sites a second, 3 to 4 small requests each; trivial for any uplink |
| Signal the benign nature in web pages and DNS of the source | User-Agent with the study URL; study page live before the run; no reverse DNS of our own: the address is a maintainer's connection and is not published (§ 4); private confirmation on request instead |
| Explain purpose and scope in all communications | The study page, every reply to an owner, and the results say the same scope (§ 4) |
| Simple opt-out, honored promptly | robots.txt, before the visit; email removal after |
| No larger or more frequent than needed | One visit per site, once. No repeat run without a new registration |
| Spread traffic over time or addresses | A 1-second pause per worker, 4 workers. One source address, confirmed privately on request |

### 8.4 Law (our reasoning, not legal advice)

This is the maintainer's reasoning for a study run from the Netherlands. It
is not legal advice. If a lawyer reading this disagrees, the study waits.

- **Dutch criminal law, Art. 138ab Sr (computervredebreuk).** The offence is
  intentionally and unlawfully ("opzettelijk en wederrechtelijk")
  intruding into an automated system. The article says intrusion includes
  gaining access by breaking a security measure, a technical intervention,
  false signals or a false key, or a false identity
  ([Wetboek van Strafrecht, art. 138ab](../../references.md#nl2026sr138ab)).
  E20 requests a homepage, a robots.txt and a security.txt that the owner
  serves to anyone, without credentials, without passing any barrier,
  under its true name. In our reading, that is not intrusion. robots.txt
  opt-outs are honored, so an owner's stated wish is respected even where
  it is not a security measure. B (if adopted) loads a page the owner links
  from its homepage, with no credentials and no form.
- **Art. 138b Sr** covers intentionally hindering access to a system by
  sending it data. At 3 to 4 requests per site, once, there is no
  hindering.
- **GDPR** ([Regulation (EU) 2016/679](../../references.md#eu2016gdpr)).
  E20 collects data about websites of organizations. It does not store IP
  addresses of the sites (the runner keeps host names and check outcomes).
  The CJEU held in [Breyer (C-582/14)](../../references.md#cjeu2016breyer)
  that a visitor's dynamic IP address can be personal data for a website
  operator; that concerns people's addresses, not the servers of
  organizations, and we do not keep server addresses anyway. Some evidence
  could quote a person's email address (a security.txt Contact, a DMARC
  report address). The runner redacts the local part of every email address
  before a raw record is written (`redact`, tested), so the raw data holds
  no email address. A one-person company's domain name could be personal
  data; the raw data is therefore treated as if it were: private, minimal,
  deleted after 12 months, and removed on request.
- **Terms of service and robots.txt.** E20 does not log in or accept terms,
  so no site's terms bind it as a user. It honors robots.txt
  ([RFC 9309](../../references.md#koster2022rfc9309)) further than the
  standard asks for one page: a `*` group disallowing everything stops the
  visit (§ 5). A site whose public terms forbid automated access of any
  kind is excluded on request.
- **United States, CFAA, for US-hosted sites.** In [Van Buren v. United
  States (2021)](../../references.md#scotus2021vanburen), the Supreme Court
  read "exceeds authorized access" as a gates-up-or-down question: whether
  one may enter a system or an area of it. It left open whether only
  technical limits or also contract or policy limits count (footnote 8). In
  [hiQ Labs v. LinkedIn (2022)](../../references.md#ninthcir2022hiq), the
  Ninth Circuit, on remand, held at the preliminary-injunction stage that
  hiQ had raised serious questions whether accessing publicly available
  pages is "without authorization" under the CFAA. Later proceedings in that
  case went against hiQ on its breach of LinkedIn's user agreement, and the
  case settled; that turned on a contract hiQ had agreed to, which E20
  never accepts. E20 requests only public pages with no gate, under its own
  name. We read neither case as a license; we read both as consistent with
  a passive, identified, one-visit study.
- **Other countries.** Not analysed one by one. Any site whose
  jurisdiction worries the maintainer goes on the exclusion list before the
  run. A complaint from any country follows § 8.6.

### 8.5 Harms, mitigations and what is left

| Risk | Mitigation | Residual risk |
|---|---|---|
| Load on a site | 3 to 4 requests per site, once, with time and size limits; 4 sites a second overall | A very fragile server notices; negligible |
| Alarm: a WAF or SOC flags the traffic and someone spends time on it | Honest User-Agent, study page live before the run, private confirmation of our address on request, no payloads that look like attacks | Some security teams will still open a ticket. We answer every one (§ 8.6) |
| Being read as reconnaissance or an attack | No discovery, no guessed paths, no probing; scope stated in public before the run | A reader may still see "scan" and assume the worst; the study page is the answer |
| A site is named or identifiable from results | No names; groups under 20 suppressed; no ranking; per-site data never shared | Small country-TLD groups could narrow a guess; they are suppressed |
| Reputational harm to startups as a group ("startups are insecure") | Front-door-only framing next to every number; no AI-built claim; intervals and "inconclusive" reported honestly | Readers may over-generalize; the limits travel with each chart |
| Personal data in raw records | Emails redacted before writing; no IP addresses stored; raw data private, git-ignored, deleted after 12 months | A person's name inside a header value; unlikely, and the data stays private |
| Raw data leaks | Never committed (the results folder writes its own `.gitignore`), kept on one machine, deleted on schedule | A stolen laptop; disk encryption on the run machine |
| Sensitive sites studied | Exclusion list by category, "when unsure, list it"; `*` disallow honored | A miss in the hand-built list; reported as a deviation and removed (§ 5.1) |
| B touches a login surface | Pending; same-site only, robots path rules honored, no redirect off site, headers only, no form | A login page logs the visit as a failed or odd request; one request per site |
| Overclaiming in publicity | Results internal until the maintainer approves; review before publishing; voice guide | A third party misquotes a number; we correct in public |
| Legal complaint | § 8.4 reasoning, § 8.6 plan, stop on request | Cost of time to respond |

### 8.6 Incident plan

If a site owner complains, reports abuse to our host, or asks what happened:

1. **Answer within one working day**, from daan@penthera.org, in plain
   words: what E20 is, what was requested from their site (the steps in
   § 4), when, from which address, and the study page link.
2. **Stop if asked.** Put the domain on a stop list for any remaining part of
   the run, and remove its record from the raw data. If the aggregates are
   not yet published, recompute them without it, and note the count in § 16.
3. **Pause the run** if two or more complaints arrive within one hour, or
   any one alleges harm (an outage, an alert storm). Resume only after the
   maintainer reads the complaint and writes down why it is safe, as a
   deviation.
4. **Abuse report to our provider:** reply to the provider with the study
   page and this protocol, and stop the run until the provider is satisfied.
5. **Legal letter:** stop the run, keep the raw data unchanged as a record,
   do not argue in public, and get advice before replying.
6. **Log every contact** (date, domain, what was asked, what we did) in a
   private file next to the raw data, deleted with it. The results report
   only counts: complaints, removals, pauses.

### 8.7 Data

- Raw per-site results (`raw.jsonl`) stay private: written to a git-ignored
  folder, never committed, never shared, deleted 12 months after
  publication.
- Raw records hold check outcomes and short evidence (header values, at most
  300 characters, emails redacted), never page bodies and never IP
  addresses.
- The aggregate JSON holds no site names and is published.
- The target lists are public data (a public top list and a public
  directory) and are committed with the protocol, so anyone can re-run the
  study (§ 14).

### 8.8 E20b: founder notes (decided 29 Oct 2026)

Separate from the study and never part of the publication. The maintainer
chose disclosure-first notes:

- **Only where there is one concrete, fixable issue that anyone can see from
  outside**: a missing or non-enforcing DMARC record, missing SPF, no HTTPS
  redirect or HSTS, a missing Content-Security-Policy or framing protection.
  These are public by design (DNS answers and response headers), so stating
  one reveals nothing a visitor could not see.
- **Only to a published security contact**: the site's security.txt
  `Contact:`, or `security@` its domain. Never a founder's personal address,
  never social media, never a public reply. Never the Tranco cohort.
- **Drafted, then sent by hand.** Drafts are prepared from the study's own
  evidence as Gmail drafts; the maintainer reads each one and sends it
  personally. Nothing is sent automatically or in bulk, and at most 50 notes
  go out a day.
- **What a note says:** what was checked (passive, homepage only, once),
  the one issue, how to verify it themselves for free (a `dig` or `curl`
  command, or the live check), and the fix. No score, no ranking, no
  "you are insecure". One line about Penthera with the link, and one line
  to opt out.
- **Once, no follow-up** unless they reply. A reply never changes the
  aggregates, and a site's result is never revealed anywhere else.
- **Logged privately:** domain, date sent, issue named, reply yes/no. The log
  is deleted with the raw data after 12 months.

A draft note is in Appendix A.

## 9. Pilot

Loopback only. `node bench/front-door/run.mjs --self-test` starts
`tests/fixtures/mock-server.js` on 127.0.0.1 and lists four names that all
resolve to it, with DNS stubbed: two to visit, one `app.` host and one on an
exclusion list. It checks that each visited site got exactly `/robots.txt`,
`/` and `/.well-known/security.txt`, once, that the other two got nothing,
and that the aggregate names no site.

`tests/front-door.test.js` tests the guard (both hashes, the fixed rate, and
that `--app-page` is refused on a registered run), the opt-outs (including
`User-agent: *`), the exclusion list, the User-Agent, the email redaction,
the statistics (Wilson, Newcombe, the seeded bootstrap,
Benjamini–Hochberg), the decision rules, the platform rules, and, on
loopback, sub-measure B: that it sends nothing unless turned on, sends only
robots.txt and one GET when on, honors a path `Disallow`, does not follow a
redirect to another site, skips an excluded linked host, and aggregates
apart with no site names. No third-party host was contacted before
registration.

## 10. Decisions

### 10.1 Decided 29 Oct 2026

The maintainer decided six questions on 29 Oct 2026.

1. **List source and date.** Both target lists are fetched on registration
   day and hashed then: the Tranco default daily list, top 1000 rows (§ 3.1),
   and the two most recent YC batches from the public directory (§ 3.2). The
   hash rows stay `pending` until that day.
2. **User-Agent and its page.** `Penthera-Research/E20
   (+https://penthera.org/research/e20; opt out: robots.txt User-agent:
   Penthera-Research)`. The page (`site/pages/research-e20.md`) must be live
   before any run (§ 4).
3. **Rate.** 4 at a time, a 1 s pause per worker, one visit, no retries. Fixed
   for registered runs: the runner refuses flags that would change them (§ 4).
4. **The `*` group in robots.txt.** Honored for E20: `User-agent: *` with
   `Disallow: /` stops the visit, and the site is counted as
   `excluded:robots_disallow_all` (§ 5). The live check is unchanged: it still
   ignores the `*` group.
5. **Categories to exclude.** A hand-written exclusion list (adult, gambling,
   health, government, sites of people at risk), hashed with the target lists
   (§ 5.1). The runner skips listed hosts and their subdomains.
6. **security.txt.** Kept (step 3 in § 4).

### 10.2 Open, for the maintainer before registration

1. **Sub-measure B** (§ 4.2): adopted for both cohorts (29 Oct 2026).
2. **E20b size**: two batches, as decided, or more batches to narrow Q8's
   intervals (§ 3.3). Decide before any list is read.
3. **Platform names** (§ 6.7): named, groups of 20 or more only (29 Oct 2026).
4. **Founder notes** (§ 8.8): disclosure-first drafts, sent by hand (29 Oct 2026).
5. **Source address** (§ 4): the maintainer's own machine; the address is not published (29 Oct 2026).

### 10.3 Registration day

In this order. Nothing is sent to a study site before step 11.

1. Settle every point in § 10.2, work through the self-review in § 13,
   and record both in the table above and in § 17.
2. Merge the accepted protocol and the study page to `main`, and check that
   `https://penthera.org/research/e20` answers with the study page. Record
   the date in the table above.
3. Fetch the Tranco list and store the top 1000 (§ 3.1).
4. Build the YC list (§ 3.2).
5. Complete `bench/front-door/lists/exclusions.txt` by reading both lists
   (§ 5.1).
6. `shasum -a 256` the three files and fill in every `pending` row above.
7. Record privately (run log only) the source address and the run window, for confirmation requests.
8. Change the status line to `**Registered.**` with the date, and commit the
   three files and this prereg together. That commit, merged to `main`, is
   the registration.
9. Run `npm test` and `node bench/front-door/run.mjs --self-test` on the
   registered commit.
10. Check the study page answers again.
11. Run each cohort once:
    `node bench/front-door/run.mjs --registered E20 --cohort tranco --list bench/front-door/lists/tranco-<ID>-top1000.csv --exclude bench/front-door/lists/exclusions.txt`,
    then the same with `--cohort yc` and the YC file.

## 11. What the result decides

- The live check may show "your score against the top 1000" and "against
  recent startups", using the published percentiles only.
- A check with a share under 20% in both cohorts becomes a candidate for a
  plainer explanation in the live check's report, because most sites miss it.
- If Q8 shows startups ahead or behind on a check, the next blog post says so,
  with the interval. If the result is inconclusive, it says that instead.
- E20 does not change any rule, weight or the score. A change to them would
  need its own experiment.

## 12. Limits and threats to validity

**Construct validity: what "front door" measures.**

- A homepage is a marketing surface. Its headers often come from a host or
  site builder (§ 6.7), not from the team's engineering. A good front door
  does not mean a secure company, and a weak one does not mean an insecure
  product.
- The checks are hygiene signals. A CSP that is present can still be weak
  ([Weichselbaum et al., 2016](../../references.md#weichselbaum2016csp)); a
  missing header may be compensated elsewhere. Pass or fail is the live
  check's rule, nothing more.
- The score's weights are Penthera's choice. Q7 and the score comparison
  depend on them.
- HTTP to HTTPS redirection is not checked (§ 2.3).

**Selection.**

- **Tranco bias.** Popularity lists over-represent some regions and
  services and include infrastructure domains (CDNs, APIs, trackers) that
  serve no homepage ([Ruth et al., 2022](../../references.md#ruth2022toppling)).
  These become errors, not fails, and shrink the judged set unevenly.
- **Organizations repeat.** One company can hold many top-1000 domains, so
  sites are not independent. The one-per-site sensitivity (§ 6.3) handles
  only those that end on the same domain.
- **YC is one accelerator.** Its companies are selected, funded and
  advised, and skew to US software and AI products. They are not "startups"
  in general, and not "AI-built". The directory's listed website may be a
  placeholder for a company in stealth.
- **Exclusions are judgment.** The hand-built list may miss or over-include
  sites, and categories (health, at-risk) are not neutral. Both cohorts use
  the same list and the counts are reported.

**Measurement.**

- **Snapshot.** One run per cohort, in one week. Headers change with
  deploys; the two cohorts are measured days apart at most, but not at the
  same instant.
- **One vantage point.** One source address in one country. CDNs serve
  different responses by region, by user agent, and to suspected bots. A
  page served to our address may differ from what a user elsewhere sees.
- **Bot blocking.** Some sites answer an unknown client with a challenge
  page, a 403, or a stripped response. These are graded as served (a
  challenge page is often what a bot gets), or counted as errors when no
  usable response came. The share of 4xx responses and challenge pages is
  reported per cohort, so a reader can see how much this matters.
- **Redirects to other domains.** A homepage that redirects to another
  registrable domain (a parent brand, a country site) is graded at the final
  page; DNS checks run on the final host's domain. The count of sites whose
  final host differs from the listed one is reported.
- **No retries.** A transient failure is an error, not a second chance.
  This is cautious for the sites and costs some data.
- **The instrument.** HTML is parsed with regular expressions, DNS answers
  come from one resolver, and the TLS check reads one handshake. The checks
  are tested on fixtures, not validated against a hand-labelled sample of
  real sites; this is a gap (§ 15, item 8).
- **B (if adopted).** English link text only; the first matching link only;
  a login on another domain is not followed, so companies using an outside
  sign-in page have no B result. That is a selection effect in B and is
  reported as the `off_site` count.

**Inference.**

- The intervals treat sites as independent draws, which a census of a fixed
  list is not. They describe uncertainty as if the list were a sample of
  similar sites; we say so next to the first interval in the results.
- Power is limited (§ 3.3): gaps under about 10 to 17 points will not be
  shown.
- The exploratory analyses (§ 6.7 to § 6.9) are many looks at the same
  data; none of them is a finding.

**Review.**

- **No independent review.** No outside researcher read the protocol
  before registration (§ 13). The design, the code and the ethics reasoning
  were checked by the maintainer and an AI assistant only, so errors an
  outside measurement or ethics reviewer would catch may remain. The
  results say this next to the abstract.

## 13. Review before registration

**No independent review took place.** The maintainer decided on 29 Oct 2026
not to ask an outside researcher to read this protocol before registration.
The protocol, code and tests were drafted with an AI assistant and checked
by the maintainer alone. This is a limit (§ 12), stated next to the results.

Instead, the maintainer works through this self-review on registration day,
before step 2 of § 10.3, and records the date and any change in § 17. Each
item is answered yes, or fixed, or written down as a known gap:

- [x] The cohorts answer the question, and the selection rules leave us no
      choice after the lists are hashed.
- [x] The requests in § 4 are the least that answers the questions.
- [x] The opt-out, exclusion and incident rules are enough, and § 8.5 misses
      no harm I can think of.
- [x] Each hypothesis has a clear way to fail (§ 2.2), and the decision
      rules and correction are applied by the code, not by hand.
- [x] The power statement (§ 3.3) is honest, and the 10-point threshold is
      one I would defend to a founder.
- [x] § 7 is fair to prior work, and § 7.7 does not overclaim.
- [x] Sub-measure B (§ 4.2) is decided: adopted, adopted for E20b only, or
      removed.
- [x] The limits (§ 12) are complete enough to sit next to every number.
- [x] The study page is live, publishes nothing that identifies a maintainer's location, network or machine, and matches § 4.
- [x] Nothing here would make me uncomfortable if my own site were in the
      list.

Anyone may still send comments after registration, to the contact on the
study page. A comment that changes the protocol is a deviation (§ 16).

Confirmed in full by the maintainer on 29 Oct 2026, before registration.

## 14. Reproduce and open science

- **Code.** `bench/front-door/run.mjs` at the registration commit, MIT
  license. The aggregate and every decision come from it.
- **Inputs.** The Tranco top-1000 file and the YC list file, committed with
  their SHA-256 in the table above; the Tranco list ID, so anyone can
  download the same list; the exclusion list, committed and hashed.
- **Re-run.** Anyone can run the same command (§ 10.3, step 11) on the same
  hashed lists. They will get their own snapshot, not ours: sites change,
  and their vantage point differs. A re-run is a replication of the method,
  and its numbers are expected to differ within the limits in § 12.
- **Shared.** The protocol, the code, the input lists, the aggregate JSON
  and the results file. **Not shared:** `raw.jsonl`, because it holds
  per-site results (§ 8.7).
- **Archive.** Results live on GitHub only; there is no DOI archive yet
  (results-checklist known gap 17).

## 15. Results file plan

The results file will follow the [results-file
checklist](../results-checklist.md), with the four required headings
(Abstract, Data and code, Limits, Changes). E20 is a prevalence survey, not
an accuracy study, so some items read differently:

| Item | Where E20 answers it |
|---|---|
| 1 Abstract | The Abstract above, completed with results |
| 2 Protocol and registration commit | Status row; first line of the results |
| 3 Construct and what it cannot measure | § 1, § 4.1, § 12 |
| 4 Items: source, pin, eligibility | § 3, § 5, the hash rows |
| 5 Unit | A site (one registrable domain from a list), judged once |
| 6 Tool: version, commit, settings | Registration commit, the runner's fixed options (§ 4) |
| 7 Reference standard | Not applicable: E20 measures prevalence of deterministic checks, with no reference labels. Reported as such |
| 8 Labellers and agreement | Not applicable in the accuracy sense. Gap: the checks are not validated on a hand-labelled sample of real sites (§ 12) |
| 9 Flow | Listed, excluded by reason, errors by code, judged, per check unknown |
| 10 Indeterminate results | Weight-0 checks as unknown (§ 6.1); errors by code |
| 11 k of n | Every share |
| 12 Intervals and clustering | Wilson and Newcombe at 95%; decision intervals; the one-per-site sensitivity (§ 6.3) |
| 13 Tuning | Nothing is tuned on E20 data. Hypotheses were revised once, before data (§ 2.4) |
| 14 Comparison tools | None compared; the Web Almanac comparison is descriptive (§ 6.9) |
| 15 Deviations; exploratory marked | § 16; § 6.7 to § 6.9 labelled exploratory |
| 16 What the result does not show | § 12, next to the result |
| 17 Shared, license, archive | § 14 |
| 18 Dated additions | § 17 and dated headings |
| 19 Who did what, AI assistance | Authors row; `AI-Assisted` commit trailers |

## 16. Deviations

Any change after registration is listed here with its date and reason.

**After registration:** none yet.

## 17. Revision log

- **29 Oct 2026, first draft.** Questions, cohorts, requests, exclusions,
  the six decisions.
- **29 Oct 2026, revision 2 (before any list was fetched).** Added the
  abstract; verified prior work and a section on what is new (§ 7);
  decision rules, a Bonferroni-corrected family of 11 claims, a 10-point
  smallest difference that matters, a power statement, a seeded bootstrap
  for the median, Benjamini–Hochberg for secondary differences, and the
  one-per-site sensitivity; revised Q1 and Q3 bands from prior work (§ 2.4);
  exploratory platform, clustering and Almanac analyses; sub-measure B as a
  pending, removable option with runner support and tests; the ethics
  position, Menlo and ZMap tables, legal reasoning, a harm table and an
  incident plan; email redaction in raw records; the source address on the
  study page before the run (later replaced: the address is not published, § 4); a review section; a
  results-file plan; the limits section. Drafted with Claude; the
  maintainer has not yet accepted it.
- **29 Oct 2026, maintainer decision.** No independent review before
  registration. § 13 became a self-review checklist for registration day,
  the reviewer request was dropped, and the missing review is listed as a
  limit (§ 12). Timeline: registration 31 Oct, runs 1 Nov, publication
  planned around 11 Nov after the maintainer's own check.

## Appendix A. E20b founder note (draft)

Sent by hand, once, to the site's security.txt contact or `security@` its
domain, only where § 8.8 applies. The bracketed parts are filled from the
study's evidence for that one domain.

> Subject: [domain]: [issue in a few words], from a passive study
>
> Hi,
>
> On [date] your homepage was one of about 1,300 sites in a passive study of
> web front doors (https://penthera.org/research/e20). It loaded your
> homepage, robots.txt and security.txt once and read public DNS. We publish
> totals only and never name a site.
>
> One thing stood out that anyone can see from outside: [issue, one
> sentence]. You can check it yourself with `[command]`. The usual fix is
> [fix, one sentence].
>
> If it helps, Penthera is a free, offline, open-source security agent:
> https://github.com/danoszz/penthera. No reply needed, and you won't hear
> from us again unless you write back.
>
> Go get 'em,
> Daan, Penthera (@penthera_org)
