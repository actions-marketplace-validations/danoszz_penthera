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
| Decisions | Taken 29 Oct 2026 by the maintainer (§ 10) |
| Tranco list ID | `pending` (fetched and hashed on registration day, § 3.1) |
| Tranco list date | `pending` |
| Tranco list SHA-256 | `pending` |
| YC list source | `pending` (§ 3.2) |
| YC list batches and date | `pending` |
| YC list SHA-256 | `pending` |
| Exclusion list SHA-256 | `pending` (§ 5.1) |
| Study page live | `pending`: https://penthera.org/research/e20 must answer before any run (§ 4) |
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

- **Source.** The Tranco list (Le Pochat et al., NDSS 2019): the **default
  daily list** that tranco-list.eu publishes, not a custom list. Its default
  configuration combines several providers' rankings over 30 days and holds
  registrable (pay-level) domains, without subdomains. No custom list is
  generated, so no choice of providers or filters is ours.
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

- **Source.** The public websites of the companies in the **two most recent
  Y Combinator batches**, from YC's public company directory,
  `https://www.ycombinator.com/companies`. "Most recent" means the two newest
  batches the directory's Batch filter offers on registration day (at the
  time of writing, likely Fall 2026 and Summer 2026; the day decides).
- **Who builds it, and when.** The maintainer, by hand, on registration day,
  from the directory pages in a browser. The runner never reads the
  directory.
- **Procedure.**
  1. Open the directory, and in its Batch filter select the newest batch,
     then the second newest. Record the two batch names as the directory
     writes them, the URL from the address bar with both filters applied, and
     the company count it shows.
  2. For each company in the filtered list, in the order shown, open its
     company page and copy the website it lists. Skip companies that list
     none, and record how many were skipped.
  3. Write `bench/front-door/lists/yc-<batch1>-<batch2>-<YYYY-MM-DD>.csv`
     with the header `batch,company,domain`, one row per company. Keep the
     URL as listed; the runner keeps only its hostname. The file is plain
     comma-separated with no quoting, so drop any comma from a company name.
  4. `shasum -a 256` the file, and fill in the source URL, the batches, the
     date and the hash in the table above.
- **Selection.** Every company in the two batches that lists a website. There
  is no sampling and no cap below 400 (the runner's limit for this cohort,
  well above two batches). No company is added or dropped by hand after the
  hash is recorded; the exclusion list (§ 5.1) is the only way a listed
  company is not visited.

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
- **Rate, fixed.** 4 sites at a time, and each worker waits 1 second
  between sites. That is at most about 4 sites a second overall and never
  more than one visit to any site. A registered run cannot change this: the
  runner refuses `--concurrency`, `--delay` and `--limit` with
  `--registered E20`, and uses the fixed values whenever it leaves loopback.
- **User-Agent.** `Penthera-Research/E20 (+https://penthera.org/research/e20;
  opt out: robots.txt User-agent: Penthera-Research)`.
- **Study page.** `https://penthera.org/research/e20` (source:
  `site/pages/research-e20.md`, served at `/research-e20`, with a redirect
  from `/research/e20` in `vercel.json`). It says what E20 is, what it
  requests, how to opt out, what is kept, and who to contact. **It must be
  live before any run.** The maintainer opens the URL on registration day and
  records the date in the table above.
- **Source address.** One fixed address, written in the results, so a site
  owner can match it to their logs.

## 5. Exclusions

| Reason | Rule | Reported as |
|---|---|---|
| Opt-out | The live check's rule (`optedOut` in `api/_lib/page.mjs`): a robots.txt group naming `Penthera-Research` or `Penthera-QuickCheck` with `Disallow: /` | `opted_out` |
| Opt-out for everyone | A robots.txt `User-agent: *` group with `Disallow: /` (§ 10, decision 4). E20 only: the passive report's `optOutAll` option, which the live check never sets. The visit stops after robots.txt. It counts even when a later group names us, the cautious reading | `excluded:robots_disallow_all` |
| Not a homepage | Host starts with `app.`, `api.`, `checkout.` and the others in § 3.2 | `excluded:not_a_homepage` |
| Exclusion list | A host on the exclusion list (§ 5.1), or a subdomain of one | `excluded:exclusion_list`, and a count per category in `exclusionCategories` |
| Error | No address, no connection, invalid certificate, timeout, too many redirects | `error:<code>` |

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
  that should have been listed and was not is reported as a deviation (§ 12),
  and its record is removed from the raw data before the aggregate is
  computed.

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
- No per-category groups: no category source was chosen (§ 5.1). Excluded
  sites are counted per exclusion category.

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
- **Identified traffic.** An honest User-Agent with a contact URL, a study page
  at that URL that is live before the run (§ 4), and one fixed source
  address.
- **Sensitive sites are not visited.** Adult, gambling, health, government
  and at-risk sites are on the exclusion list (§ 5.1), and a robots.txt that
  disallows every user agent is honored (§ 5).
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
`tests/fixtures/mock-server.js` on 127.0.0.1 and lists four names that all
resolve to it, with DNS stubbed: two to visit, one `app.` host and one on an
exclusion list. It checks that each visited site got exactly `/robots.txt`,
`/` and `/.well-known/security.txt`, once, that the other two got nothing,
and that the aggregate names no site. `tests/front-door.test.js` tests the
guard (both hashes, the fixed rate), the opt-outs (including `User-agent: *`),
the exclusion list, the User-Agent and the statistics. No third-party host was
contacted before registration.

## 10. Decisions (decided 29 Oct 2026)

The maintainer decided the six open questions on 29 Oct 2026.

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

### 10.1 Registration day

In this order. Nothing is sent to a study site before step 9.

1. Merge the accepted protocol and the study page to `main`, and check that
   `https://penthera.org/research/e20` answers with the study page. Record
   the date in the table above.
2. Fetch the Tranco list and store the top 1000 (§ 3.1).
3. Build the YC list (§ 3.2).
4. Complete `bench/front-door/lists/exclusions.txt` by reading both lists
   (§ 5.1).
5. `shasum -a 256` the three files and fill in every `pending` row above.
6. Change the status line to `**Registered.**` with the date, and commit the
   three files and this prereg together. That commit, merged to `main`, is the
   registration.
7. Run `npm test` and `node bench/front-door/run.mjs --self-test` on the
   registered commit.
8. Write down the machine's public source address for the results.
9. Run each cohort once:
   `node bench/front-door/run.mjs --registered E20 --cohort tranco --list bench/front-door/lists/tranco-<ID>-top1000.csv --exclude bench/front-door/lists/exclusions.txt`,
   then the same with `--cohort yc` and the YC file.

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
