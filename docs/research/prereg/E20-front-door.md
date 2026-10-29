# E20: How safe is the web's front door? (pre-registration)

| | |
|---|---|
| Experiment | E20, with a second cohort E20b (recent startups) |
| Related | [E17](E17-offline-and-determinism.md) (format), the live check's passive report (`api/_lib/tier1.mjs`), [live check terms](../../live-check-terms.md) |
| Status | **Draft, not registered.** Registration is the maintainer's written acceptance of this protocol plus the commit that merges the accepted version to `main`. Until then the runner refuses every non-loopback target |
| Date written | 2026-10-29 |
| Authors | Daan van der Zwaag (PI). Drafted with Claude (AI-assisted) |
| Approach approved | 29 Oct 2026, by the maintainer: a passive check of the Tranco top 1000, aggregates only. E20b added the same day |
| Data collected before registration | None. The runner was tested on loopback only (§ 9) |
| Tranco list ID | `pending` (§ 3.1) |
| Tranco list date | `pending` |
| Tranco list SHA-256 | `pending` |
| YC list source | `pending` (§ 3.2) |
| YC list batches and date | `pending` |
| YC list SHA-256 | `pending` |
| Cost | $0. One laptop or one small server, about 30 minutes per cohort |

## 1. Why

Penthera's live check grades one site's front door: transport, browser
protections, cookies, and the DNS records that stop mail spoofing. We know
what one site looks like. We do not know what normal looks like.

Two numbers would help readers judge their own result:

1. how the most visited sites on the web score on the same checks;
2. how recent startups, which ship fast and often with AI coding tools, score
   next to them.

Earlier work measured parts of this (§ 7). E20 measures it with the exact
rules the live check uses, so a reader can compare a site's score to the
distribution directly.

## 2. Questions and hypotheses

All shares are of sites where the check could be judged (§ 6.1). Each comes
with a 95% Wilson interval. The thresholds are our guesses from the prior
work in § 7, written down now so the result can prove them wrong.

| | Question | Hypothesis | Check IDs |
|---|---|---|---|
| Q1 | How many top sites serve the homepage over HTTPS with HSTS of at least 180 days? | Between 50% and 80% | `https+hsts` |
| Q2 | How many send a Content-Security-Policy? | Under 40% | `csp` |
| Q3 | How many protect against framing (X-Frame-Options or CSP `frame-ancestors`)? | Between 40% and 75% | `framing` |
| Q4 | Of sites that set cookies on the first response, how many flag all of them Secure, HttpOnly and SameSite? | Under 30% | `cookies` |
| Q5 | How many have a CAA record? | Under 40% | `caa` |
| Q6 | How many have SPF ending in `-all` or `~all` and DMARC at `quarantine` or `reject`? | Between 40% and 70% | `spf+dmarc`, `spf`, `dmarc` |
| Q7 | What does the live-check score look like across the top 1000? | Median between 50 and 75 | `score` |
| Q8 (E20b) | Do recent startups differ from the top 1000 on Q1 to Q7? | Startups do better on HTTPS+HSTS (modern hosting sets it) and worse on CSP, CAA and DMARC | difference per check |

Secondary, reported without a hypothesis: `nosniff`, `referrer`,
`permissions`, `csp-scripts`, `cors`, `disclosure`, `tls`, `cert`,
`mixed-content`, `sri`, `libraries`, `generator`, `runtime`, `security-txt`.

**What "HTTPS-only" means here.** The runner visits `https://<domain>/` first.
It does not also visit `http://` to check the redirect, because that is a
second homepage visit. HSTS is the check that keeps browsers off `http://`,
so Q1 uses HTTPS with HSTS. The limit is stated next to every Q1 number.

## 3. Targets

### 3.1 E20: Tranco top 1000

- **Source.** The Tranco list (Le Pochat et al., NDSS 2019), standard
  configuration, without subdomains. The list ID and its date go in the table
  above before registration.
- **Who fetches it.** The maintainer downloads the published list file from
  tranco-list.eu, by its permanent list ID. The runner never downloads a list.
- **Stored before the run.** The first 1000 rows, unchanged, as
  `bench/front-door/lists/tranco-<ID>-top1000.csv`. Its SHA-256 goes in the
  table above. The runner refuses to run when the file's hash differs.
- **Rows.** `rank,domain`. One visit per domain. Duplicates are dropped.

### 3.2 E20b: recent startups

- **Source.** The public websites of about 100 companies from the most recent
  Y Combinator batches, taken from YC's public company directory
  (`https://www.ycombinator.com/companies`). The source URL, the batch names
  and the date the list was taken go in the table above.
- **Who builds it.** The maintainer, by hand or with a script run once. The
  runner never reads the directory.
- **Stored before the run.** `bench/front-door/lists/yc-<batches>-<date>.csv`
  with the header `batch,company,domain`, hashed like the Tranco list.
- **Selection.** All companies in the named batches that list a website, in
  directory order, up to 100. If the batches hold more than 100, the
  maintainer names the batches so the total is about 100 and records them. No
  company is added or dropped by hand after the hash is recorded.

**Out of scope for E20b, by design.** Logged-in apps, app subdomains behind a
login, checkout and payment pages or flows, APIs, mobile apps, and anything
beyond the public homepage. Testing those needs each company's permission.
The runner enforces part of this: a host that starts with `app.`,
`dashboard.`, `console.`, `portal.`, `admin.`, `login.`, `auth.`, `api.`,
`checkout.`, `pay.`, `billing.`, `shop.` or similar is excluded and never
visited. Only the hostname of a listed URL is kept; its path is dropped.

## 4. What is sent, per site

Through the live check's own passive report (`passiveReport` in
`api/_lib/tier1.mjs`), with its guard (`api/_lib/guard.mjs`). E20 sets two
options that make it send less than the live check:

| Step | Request | Limit |
|---|---|---|
| 1 | `GET /robots.txt` | 4 s, 64 KB, 2 redirects. An opt-out stops here (§ 5) |
| 2 | `GET /` on `https://<domain>`, with the TLS handshake | 6 s, 1.5 MB, at most 4 redirects, each one checked by the guard |
| 2b | Only if https does not connect: `GET /` on `http://<domain>` | Same |
| 2c | Only if the domain does not resolve: steps 1 and 2 once on `www.<domain>` | Same |
| 3 | `GET /.well-known/security.txt` (a file meant to be fetched, RFC 9116) | 4 s, 32 KB |
| 4 | Public DNS: TXT for SPF and `_dmarc`, CAA walking up to the registrable domain | 2.5 s per lookup |

Not sent: the scripts and stylesheets the page references (the live check
reads up to 14; E20 sets `assets: false`), any guessed path, any query string
of our own, any payload, any form, any login. The secret rules do not run
(`secrets: false`): a key found on a stranger's homepage would need a
disclosure process this study does not have.

- **One visit per site.** One pass through the steps above, no retries.
- **Budget.** At most 20 requests and 8 seconds per site, as the live check;
  a hard stop at 20 seconds.
- **Rate.** 4 sites at a time (the runner caps it at 8), and each worker
  waits 1 second between sites. That is at most about 4 sites a second
  overall and never more than one visit to any site.
- **User-Agent.** `Penthera-Research/E20 (+https://penthera.org/research/e20;
  one passive homepage visit for an aggregate study; opt out: robots.txt
  User-agent: Penthera-Research Disallow: /)`. The page at that URL must be
  live before the run and say what E20 is, what it sends and how to opt out.
- **Source address.** One fixed address, written in the results, so a site
  owner can match it to their logs.

## 5. Exclusions

| Reason | Rule | Reported as |
|---|---|---|
| Opt-out | The live check's rule (`optedOut` in `api/_lib/page.mjs`): a robots.txt group naming `Penthera-Research` or `Penthera-QuickCheck` with `Disallow: /`. A `*` group does not count (see § 10, decision 4) | `opted_out` |
| Not a homepage | Host starts with `app.`, `api.`, `checkout.` and the others in § 3.2 | `excluded:not_a_homepage` |
| Exclusion list | Domains on a list the maintainer writes before the run (§ 10, decision 5), hashed with the target list | `excluded:exclusion_list` |
| Error | No address, no connection, invalid certificate, timeout, too many redirects | `error:<code>` |

Every count goes in the results. Errors are not retried, and they are
described, not imputed. Many Tranco entries are not websites (CDN and API
domains); the error count shows how many.

## 6. Analysis (fixed before any run)

### 6.1 Per check

For each check: `n` (sites where it was judged), `passed`, the share and its
95% Wilson interval. A check with weight 0 is "could not check" (DNS did not
answer, security.txt timed out). It counts as unknown, never as a fail, and
the unknown count is reported. A check that only applies sometimes (`cookies`
when cookies are set, `csp-scripts` when a CSP exists, `cors` when CORS
headers are sent) is reported over the sites where it applies, and the
denominator is named.

### 6.2 Score

The score is the live check's score (`grade.mjs`) under E20's options. It
leaves out the referenced scripts and the secret rules, so for some sites it
differs from what penthera.org shows. Reported: mean, minimum, 10th, 25th,
50th, 75th and 90th percentiles, maximum, and a histogram in bins of 10.

### 6.3 Groups

- E20: per country-code TLD, from the domain. Groups with fewer than 20
  visited sites are not reported, and their count is.
- E20b: per batch, under the same rule.
- Per category only if a public, free category source is chosen before
  registration (§ 10, decision 5). Otherwise none.

### 6.4 Startups against the top 1000 (Q8)

Per check, the difference in shares (E20b minus E20) with Newcombe's hybrid
score interval (method 10). The score medians are compared descriptively. No
p-values, no correction: this is a description of two samples, and every
number comes with its interval.

### 6.5 What we publish

Aggregates only: the tables above and the score distribution. **No site is
named.** Neither a top site nor a startup is named in any publication, chart,
thread or talk, and there is no ranking. The one exception, and it is
optional: a list of sites that scored 100 and whose owners said yes in
writing to being named.

## 7. Prior work

These are the comparisons a reader will ask about. Each URL was read on
29 Oct 2026.

- **HTTP Archive, Web Almanac 2024, Security chapter** (Franken and
  Vanderlinden). Crawls millions of pages. Reports header adoption across
  requests and hosts, for example a Content-Security-Policy on 19% of hosts.
  https://almanac.httparchive.org/en/2024/security
- **Scott Helme, Top 1 Million Analysis, June 2022.** Daily crawls of the top
  1 million sites (Crawler.Ninja): HTTPS, HSTS, certificates, TLS versions,
  CAA and security headers.
  https://scotthelme.co.uk/top-1-million-analysis-june-2022/
- **MDN HTTP Observatory** (formerly Mozilla Observatory). Grades one site's
  HTTP security headers and redirects; it says an A+ does not mean a site is
  secure. https://developer.mozilla.org/en-US/observatory/docs/faq
- **Tranco** (Le Pochat, Van Goethem, Tajalizadehkhoob, Korczyński, Joosen),
  "A Research-Oriented Top Sites Ranking Hardened Against Manipulation".
  https://tranco-list.eu/

E20 differs from these in one way that matters for Penthera: it uses the live
check's own rules and score, so the distribution is the one a reader's site
is graded against. It is smaller than all of them and adds nothing they could
not measure.

## 8. Ethics, legal and data

- **Passive.** Each site gets what one browser visit to its homepage sends,
  minus the scripts: robots.txt, the page, security.txt, public DNS. No
  probing, no payloads, no login. This is the scope of the live check's terms,
  made smaller.
- **Authorized targets (AGENTS.md rule 6).** The maintainer named these hosts
  by approving this study. The runner refuses every non-loopback host unless
  run with `--registered E20`, the status line above says Registered, and the
  list file matches the recorded hash.
- **Opt-out honored before the visit,** and on request after it: a site owner
  who asks is removed from the raw data and the aggregates are recomputed if
  they are not yet published.
- **Identified traffic.** An honest User-Agent with a contact URL, and one
  fixed source address.
- **Data.** Raw per-site results (`raw.jsonl`) stay private: written to a
  git-ignored folder, never committed, never shared, deleted 12 months after
  publication. Raw records hold check outcomes and short evidence (header
  values), never page bodies. The aggregate JSON holds no site names and is
  published.
- **Startups (E20b).** Two optional paths, both outreach and separate from
  the study, both decided by the maintainer. A founder may ask for a private
  report on their own site; it goes only to someone who shows they control
  the domain. And the maintainer may send a short private note, by hand, to
  an E20b company with a real finding (for example no HSTS, no CSP), only to
  its published security contact (security.txt or `security@`), once, with
  no follow-up. Neither path ever applies to the Tranco cohort, and neither
  feeds back into the publication.
- **Law.** Fetching public homepages at a low rate with an honest
  User-Agent is what search engines and archives do. This is not legal
  advice; if in doubt about a specific site or jurisdiction, the site is
  dropped through the exclusion list before the run.

## 9. Pilot

Loopback only. `node bench/front-door/run.mjs --self-test` starts
`tests/fixtures/mock-server.js` on 127.0.0.1 and visits three names that all
resolve to it, with DNS stubbed. It checks that each site got exactly
`/robots.txt`, `/` and `/.well-known/security.txt`, once, and that the
aggregate names no site. `tests/front-door.test.js` tests the guard, the
opt-out, the User-Agent and the statistics. No third-party host was contacted
before registration.

## 10. Open decisions, for registration

1. **List source and date.** The Tranco list ID and date, and the YC batches
   and date. The hashes follow from them.
2. **User-Agent and its page.** The string in § 4, and a live page at
   `https://penthera.org/research/e20` before the run.
3. **Rate.** 4 at a time with a 1 s pause per worker, or slower.
4. **The `*` group in robots.txt.** The live check ignores `User-agent: *` with
   `Disallow: /`, because it is not a crawler. A survey of 1100 sites is
   closer to one. Honoring it too is the cautious choice and costs some
   sample.
5. **Categories to exclude.** Tranco has no categories. Options: no
   exclusions; a hand-written exclusion list (adult, gambling, health,
   government, sites of people at risk); or a free public category source.
   The list is hashed with the target list.
6. **security.txt.** Keep step 3 (one more request per site, and a useful
   number), or drop it for a strict "homepage only".

## 11. What the result decides

- The live check may show "your score against the top 1000" and "against
  recent startups", using the published percentiles only.
- A check with a share under 20% in both cohorts becomes a candidate for a
  plainer explanation in the live check's report, because most sites miss it.
- If Q8 shows startups ahead or behind on a check, the next blog post says so,
  with the interval. If the intervals overlap, it says that instead.
- E20 does not change any rule, weight or the score. A change to them would
  need its own experiment.

## 12. Deviations

Any change after registration is listed here with its date and reason.

**After registration:** none yet.
