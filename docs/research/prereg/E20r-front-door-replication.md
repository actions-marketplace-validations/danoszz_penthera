# E20-R: Is the front-door gap real, and what do bot challenges hide? (pre-registration)

| | |
|---|---|
| Experiment | E20-R, a follow-up to [E20](E20-front-door.md) |
| Status | **Registered.** By the maintainer, through the commit that merges this version to `main`. The runs start no earlier than 12 hours after the study page is live |
| Date written | 2026-10-30 |
| Authors | Daan van der Zwaag (PI). Drafted with Claude (AI-assisted) |
| Conflict of interest | The PI maintains Penthera, and the instrument is its live check. The study serves Penthera's interest in showing why such checks matter. See § 8 |
| Data collected before registration | The E20 results of 30 Oct 2026 are known, and every prediction below was written after seeing them. The new cohorts are unseen. The new instrument is tested on loopback only |
| Independent review | AI review of the E20 draft (figures, statistics), 30 Oct 2026. No human review |
| Vantage point | Rented server: Hetzner Cloud, Falkenstein, `research.penthera.org`, 2.31.141.178, IPv4 only. The address is published. The maintainer's home connection is not used |
| Runs | Pass 1 no earlier than 12 hours after the updated study page is live, pass 2 seven days later |
| Registration commit | The commit that merges this file to `main` |
| T1k list SHA-256 | `d670a3c1910fe7baa4883dcb8320b1ec99d7d29f9d22954b9288ae678540674e` (`tranco-ZJ8PG-top1000.csv`) |
| YC-new list SHA-256 | `13df01eb681993205e89c00322db972e5137d3c4a95ec982d40a2552f415dd7f` (`yc-fall2026-summer2026-2026-10-29.csv`) |
| YC-25 list SHA-256 | `f3fed354eb7bf0e016e682a348c345401d94c27cfa72ad01bab36d935e2ffa5a` (`yc-2025.csv`) |
| YC-old list SHA-256 | `e90c52ba0c09e04613944c34c20329c77eb064cda63de0dc2c413e827a57f761` (`yc-old.csv`) |
| YC-scale list SHA-256 | `654211e16c92e99cad006a5e35b05198f2bb35a7072afa18d19047c40520568c` (`yc-scale.csv`) |
| T10k list SHA-256 | `21c63bd12c68dac11df79bc2f67a09ea8cf8c778640611ad1b170fcae4ecfb3f` (`tranco-ZJ8PG-1k-10k-sample.csv`) |
| T100k list SHA-256 | `bb6d767786a53337ade7e9cb76304d62a4f0adae0518b5aa2c7210f1b3901002` (`tranco-ZJ8PG-10k-100k-sample.csv`) |
| Europe list SHA-256 | `057dcd65db61bdbd246c3910b3be2f40d468c3bff2036e236357935584663234` (`europe-indexes.csv`) |
| SP500 list SHA-256 | `e788b76c67f77fb498951a83833b96b6195138e4f8e6f1cc266ee3a45feb1dc9` (`sp500.csv`) |
| ShowHN list SHA-256 | `050521c6aabc95975320cd1dea143d410e382987ab7377b7c7756925eded1d10` (`showhn-sample.csv`) |
| NL-Cbw list SHA-256 | `0349db735b483b0786bc7a51e687639c8385fee04e467f5ef688bcca3a8dbb1c` (`nl-cbw.csv`) |
| E20-R exclusion list SHA-256 | `b636ab5e761e7266bf6dea56383a1db84610a91884f34d8dcf3e5f978aa712c5` (`exclusions-e20r.txt`, 245 entries) |
| E20-R homepage-only list SHA-256 | `111fde7e8b59af7fe197a10cde7f2954396f76703c2e839d8393741bb2f2f6e4` (`health-homepage-only.txt`, 331 hosts) |
| Dataset | Confirmed by the maintainer, 30 Oct 2026: 7,031 unique sites on eleven lists |
| Cost | About €2 of server time |

## Abstract

**Question.** E20 found that recent startups less often send a CSP and publish
an enforcing mail policy than the most popular sites. It also found that about
a third of homepages answered with HTTP 403, which we could only interpret as
bot challenges. E20-R asks whether those gaps replicate, whether they reflect
company age or popularity, how many responses are really challenges, and how
stable the measurements are.

**Method.** Two passes, seven days apart, from one published server address over
eleven fixed lists: the Tranco top 1,000, the newest YC batches (both as in E20),
the two 2025 YC batches, older YC batches, seeded random samples of 1,000 from
Tranco ranks 1,001 to 10,000 and 10,001 to 100,000, large listed companies from fifteen European stock indexes
and the S&P 500, larger YC companies, a sample of public Show HN launches,
and Dutch organizations in sectors of the Cyberbeveiligingswet (all secondary only).
The grader is unchanged. The instrument now also stores header names and a body
hash, and a fixed rule set classifies each response. Fifteen confirmatory claims
use organization-level bootstrap intervals with a Bonferroni correction.

**Result.** None yet.

**Limits.** A datacenter address may be treated differently from a home
connection, and the comparison with E20 is not concurrent. Older YC batches keep
only companies still listed as active, so they carry survivorship bias. Passive
checks at the front door say nothing about a company's application security.

## 1. Why, and what the E20 review changed

The independent review of the E20 paper found five weaknesses that more data can
address. Each maps to a part of this design.

| Weakness in E20 | Design answer in E20-R |
|---|---|
| "403 means challenge" was assumed | A fixed classifier with stored evidence (§ 4.2) |
| HTTP-layer gaps depended on the edge mix | Two named estimands and stratified claims (§ 6) |
| Cohorts differ in age, popularity and era at once | Older YC batches and a less popular Tranco sample (§ 3) |
| One moment, cohorts run one after the other | Two passes, seven days apart, in one shuffled order (§ 5) |
| One home connection | One published datacenter address, compared with E20 (§ 7) |

More sites alone would not fix the first two, because a narrower interval around
a confounded difference is still confounded.

## 2. Estimands

We name two, and neither is "the site's true configuration".

- **Served (S).** What a declared, non-browser research client receives at the
  listed homepage, for every graded site.
- **Real page (R).** The same, among sites whose response the classifier in § 4.2
  labels `page`. This is a selected subset, because it drops sites that challenge us.

DNS checks do not depend on the response, so they use S alone. An HTTP claim is
**supported** only when both S and R support it. When they disagree, it is reported
as **view-dependent**, a fourth outcome next to refuted and inconclusive.

## 3. Targets

Each list is hashed before any run, and the hashes are in the table above. The new list files stay off the repository until the results, because they hold the health domains that § 8.1 redacts; the redacted versions are published with the results. Each cohort uses the E20 rules:
hostname only, one record per listed domain, and `NOT_A_HOMEPAGE` hosts skipped.

| Cohort | Source | Rule | Listed |
|---|---|---|---|
| **T1k** | E20 list `ZJ8PG` | Same 1,000 rows | 1,000 |
| **YC-new** | E20 list | Same 416 rows | 416 |
| **YC-25** | `yc-oss/api` at the E20 commit `5a217b8` | Summer 2025 and Winter 2025: every company with status `Active` and a website | 159 + 158 = 317 |
| **YC-old** | `yc-oss/api` at the E20 commit `5a217b8` | Summer 2024, 2022, 2020 and 2018: every company with status `Active` and a website | 233 + 180 + 121 + 77 = 611 |
| **Europe** | Public constituent lists of 15 indexes (Germany, France, UK, Netherlands, Spain, Italy, Switzerland, Sweden, Finland, Denmark, Norway, Portugal, Belgium, Austria, Ireland), with each company's main corporate domain | One record per company. **Secondary only**: no claim uses it | 490 |
| **YC-scale** | `yc-oss/api` at the E20 commit | `Active` or `Public`, a website, at least 50 staff, not on another YC list. A stand-in for real revenue: **MRR is not known**. **Secondary only** | 530 |
| **SP500** | Public S&P 500 constituent list, with each company's main corporate domain | One record per company. **Secondary only** | 496 |
| **ShowHN** | Public Hacker News Show HN posts, 1 Jan 2025 to 1 Oct 2026, at least 20 points | Launches on their own main domain with no subdomain, shared platforms removed, YC sites removed, 1,000 drawn with seed 2020. A non-YC group of small products; many are individuals' projects, and it reports aggregates only. **Secondary only** | 1,000 |
| **NL-Cbw** | Public member and index lists per sector (§ 3.1) | Energy, drinking water, telecom, digital infrastructure, banking, transport, and listed firms in the law's annex sectors. No government, no health. **Secondary only**, homepage only | 268 |
| **T10k** | Tranco `ZJ8PG` full list | 1,000 ranks drawn from 1,001 to 10,000 without replacement, seed 2020. **Secondary only** | 1,000 |
| **T100k** | Tranco `ZJ8PG` full list | 1,000 ranks drawn from 10,001 to 100,000 without replacement, seed 2020 | 1,000 |

7,031 unique sites in all; example.com and www.example.com count as one site. A host on two lists is visited once per pass and counted in both. We expect about 650 graded in T1k and in T100k, about 400
in YC-new, about 300 in YC-25 and about 560 in YC-old. **YC-recent** below means
YC-new and YC-25 together.

**Why these older batches.** One summer batch every two years gives a spread of
company ages while keeping the season fixed, and YC-25 fills the gap between the
newest batches and the two-year-old ones. Only `Active` companies count, because a
closed company's domain says nothing about a company of that age. That choice is
a survivorship bias, which we state next to every age result.

### 3.1 NL-Cbw

The Cyberbeveiligingswet and the Wet weerbaarheid kritieke entiteiten took effect
on 15 August 2026, and cover about 8,000 organizations in 18 sectors, of which about
500 are critical entities. The register of covered organizations is not public, and
we make no attempt to reconstruct it. Companies decide for themselves whether they
are covered, so this cohort is **organizations in Cbw sectors**, never "covered by
the law". One snapshot after the law took effect shows nothing about its effect,
because no earlier measurement exists.

Extra limits apply to this cohort:

- homepage only: the runner never follows an app or login link for these hosts, also
  when a host is on another list;
- every member of a public list goes in, with no hand-picking;
- results by sector only for groups of at least 20 sites;
- only the list's hash and method are published, not the file.

If a passive check ever shows a real security risk at a site in the study, the
maintainer reports it privately following the NCSC's coordinated vulnerability
disclosure rules: the owner first, through security.txt or a published contact,
and the NCSC as intermediary if that fails, or directly for Dutch central
government systems. Findings stay private until fixed, and we do no more than the
check already did. We send no other notice to the NCSC, by the maintainer's
decision. The NCSC's own rules say that missing HTTP headers and version numbers
usually do not qualify, so we expect no reports from this study.

**Same rows for T1k and YC-new.** A site that opted out or asked for removal since
E20 is dropped. None has so far.

## 4. What is sent, and what changes in the instrument

The requests are those of E20 § 4: robots.txt, one homepage, security.txt, public
DNS, and one same-site app or login page where linked. Two public DNS lookups are
new, MX and NS, stored only as a provider label. The rate is the same: 4
workers with a 1-second pause, enforced in code. The user agent stays
`Penthera-Research/E20` with the study URL, and the robots.txt opt-outs apply.

**Unchanged:** every check and every weight in the grader. Scores stay comparable
with E20.

### 4.1 New evidence stored

For each homepage, robots.txt and security.txt response, the runner also stores:

- response header names, plus the values of a fixed list of edge and challenge
  headers;
- cookie **names** only, never values;
- the SHA-256 of the body;
- for a response outside 2xx only, the first 4 KB of the body, kept privately for
  the classifier and the labeling in § 4.3, and deleted with the raw data.

Bodies of 2xx pages are never stored. This is a change from E20 § 8.7, which is why
the study page must say so before the run.

### 4.2 Response classifier (deterministic, frozen before the run)

Each homepage response gets one label from fixed rules in code, tested on fixtures:

| Label | Meaning | Evidence, in order |
|---|---|---|
| `challenge` | An edge network tests the client | `cf-mitigated: challenge`, `x-amzn-waf-action: challenge`, `x-vercel-mitigated: challenge`, or a known challenge body signature |
| `block` | An edge network or firewall refuses the client | A known block body signature or edge error page, without a challenge marker |
| `origin-error` | The site itself answers with an error | Status 400 or above, no edge marker |
| `page` | A normal page | Status under 400, no challenge or block marker |

A 2xx response with a challenge marker counts as `challenge`. This is the known
gap in E20's status-code filter. The signature list is fixed at registration and
published. Cloudflare's own documentation says the status code alone is unreliable,
so the marker comes first.

**No model decides a label** (AGENTS.md rule 4). A model acts only as a second
labeler in § 4.3, and its labels never change a finding.

### 4.3 Validation sample

150 responses from pass 1, drawn with seed 2020 and stratified by label and edge,
with `challenge` and `block` oversampled. Two labelers work independently from the
stored evidence alone, with no new visits: the maintainer, and an AI agent as
second labeler, disclosed as such. They label the response class, and whether the
grader's outcome on three header checks matches the stored headers.

We report Cohen's kappa and the classifier's precision and recall against the
adjudicated labels. A human and a model are a weaker pair than two people, and the
results say so.

## 5. Procedure

- **Order.** One shuffled order across all cohorts, seed 2020, so that time is not
  confounded with cohort. Pass 2 uses a new shuffle, seed 2021.
- **Passes.** Pass 1 no earlier than 12 hours after the updated study page is live, as
  in E20, and pass 2 seven days later at the same hour of the day. Running close to
  E20 keeps the comparison with E20 (C12, C13) as free of time as it can be. One pass takes about 2 to 3 hours.
- **No retries.** A failure is recorded by code.
- **IPv4 only**, so that one published address accounts for every request.

## 6. Hypotheses

Fifteen confirmatory claims, written after seeing E20 and based on the sources
named. Each is a claim about new data. T1k and YC-new were seen in E20, so C1 to C4
are replications. Directions come from E20 or from the literature.

| # | Claim | Check | Prediction | Basis |
|---|---|---|---|---|
| C1 | YC-new minus T1k | `csp` | Lower | E20: −24.2 |
| C2 | YC-new minus T1k | `spf+dmarc` | Lower | E20: −34.9 |
| C3 | YC-new minus T1k, Cloudflare and Akamai sites | `https+hsts` | Lower | E20 post hoc: −18.0 |
| C4 | YC-new minus T1k, all other sites | `https+hsts` | Higher | E20 post hoc: +33.1 |
| C5 | T100k minus T1k | `csp` | Lower | Popularity gradient (Van Goethem et al., 2014; Lavrenovs and Melon, 2018) |
| C6 | T100k minus T1k | `spf+dmarc` | Lower | Hu and Wang (2018): falls with rank |
| C7 | YC-recent minus T100k | `spf+dmarc` | **Higher** | Länge et al. (2026): about 55% valid DMARC on the top 100,000, 47% of those enforcing, so about a quarter enforcing against 39.7% for startups in E20 |
| C8 | YC-recent minus T100k | `https+hsts` | Higher | Gray-literature data: about 31% across the top million (Helme, 2026) |
| C9 | YC-recent minus T100k | `csp` | Lower | Gray-literature data: about 21% across the top million |
| C10 | YC-old minus YC-new | `spf+dmarc` | Higher | Mail set-up matures with a company |
| C11 | YC-old minus YC-new | `csp` | Higher | Same reasoning |
| C12 | `challenge` + `block` share, server against the E20 403 share, T1k, same sites | Paired | Higher | Datacenter addresses carry less trust (secondary sources only) |
| C13 | Same, YC-new | Paired | Higher | Same reasoning |
| C14 | Agreement between passes on `https+hsts`, `csp`, `framing`, `nosniff`, `referrer`, `permissions`, `spf+dmarc`, `caa` and `security-txt`: median Cohen's kappa | Kappa | Lower bound ≥ 0.80 | Deterministic checks on stable sites |
| C15 | Agreement between passes on the response label | Kappa | Lower bound ≥ 0.60 | Bot decisions vary more than headers |

**The claim that matters most is C7.** If startups beat the less popular sample on
mail authentication, then E20's gap against the top 1,000 says more about the top
1,000 than about startups, and the paper's framing changes.

**Secondary (reported, not decided).** The T10k, Europe, SP500, YC-scale, ShowHN and NL-Cbw cohorts against YC-recent and T1k on every check. Every check by site trait (login link, payment provider, shop, a public security or trust page), read by fixed rules from the homepage already fetched, for groups of at least 20 sites. Mail and DNS providers (MX and NS) as a possible explanation of the DMARC and CAA gaps. The challenge share by edge. Origin headers
seen on robots.txt and security.txt responses of challenged sites. Whether cookies
on challenge pages are edge bot cookies. The trend across all YC batches. CAA
in every comparison. Sub-measure B on all cohorts.

## 7. Analysis

The analysis code is committed and tested on synthetic data before registration. Anything else is
post hoc and labeled so.

- **By industry (secondary).** Every check by industry, from YC's directory, GICS sectors, the NL-Cbw sectors and the health list, for groups of at least 20 sites. The host-to-industry map stays private.
- **Replication with E20's exclusions.** Because the health sites E20 excluded are now included, claims C1 to C4 are also reported without them, so the comparison with E20 is like for like.
- **Primary pass.** Claims C1 to C13 use pass 1. Pass 2 feeds C14, C15 and a stated
  replication table.
- **Intervals.** A cluster bootstrap over organizations (registrable domain from `src/utils/url.js`), 20,000 resamples, seed 2020, stratified by
  cohort. Newcombe intervals are reported next to them for comparison with E20.
- **Decision level.** Bonferroni over 15 claims: 99.67% two-sided (z = 2.9352 for
  normal-based intervals). Each decision tail then rests on about 33 resamples.
- **Rules.** As E20 § 6.5: supported when the interval excludes zero on the predicted
  side, refuted when it excludes zero on the other side, otherwise inconclusive.
  An interval wholly within ±10 points is reported as no meaningful difference.
  HTTP claims also use the S and R rule of § 2. Claims C3 and C4 use S and R within
  the named stratum.
- **Standardization.** Every HTTP difference is also reported standardized to the
  pooled edge mix, and with worst-case bounds that treat non-`page` responses as
  unknown. These are reported, not decided.
- **C12 and C13.** Paired on sites graded in both E20 and pass 1. The E20 side uses
  HTTP 403, the only measure E20 stored, so the comparison is approximate. The
  pass 1 to pass 2 drift gives the size of change that time alone produces. A
  vantage effect is claimed only when the difference exceeds that drift.
- **Exact tests** for any secondary check with a 100% cell.
- **Precision.** With a design effect of 1.3, the decision half-widths are about ±9
  points for C1 and C2, about ±9 for C7 to C9, ±11 for C10 and C11, and ±12 on the R view
  of T1k against YC-new. Gaps under 10 points may stay inconclusive.
- **Groups under 20 sites** are never shown.
- **Not in E20-R.** The logistic model and the clustering. The E20 review found the
  model uninformative.

## 8. Ethics, law and data

E20 § 8 applies in full, with these changes.

- **A second and third visit.** E20 § 8.1 promised no second pass *in E20*, and
  § 8.3 requires a new registration for a repeat. This is that registration. T1k
  and YC-new get two more visits, and new cohorts get two. The study page says so
  before any run.
- **Provider notified.** E20 § 8.3 requires telling the hosting provider in advance.
  The maintainer tells Hetzner about the run, its rate and the study page, by
  support ticket, before pass 1.
- **Source signalled.** Reverse DNS on `research.penthera.org`, a short notice page
  at that name, and the address on the study page. This meets the ZMap practice
  that E20 could not follow.
- **Exclusions.** An agent read the new non-YC lists and marked candidates, and the
  maintainer accepted them with this registration. When unsure, a domain is listed.
  The list holds 245 entries: the E20 list without its health entries, plus 215 new
  ones.
- **YC cohorts.** Every YC company stays in, except NSFW sites; none was found
  (maintainer, 30 Oct 2026).
- **Health is included.** The maintainer decided on 30 Oct 2026 to include health
  sites, patient-facing ones too, because knowing which industries are exposed is the
  point of the study. This reverses E20, which excluded them. In return, health sites
  are homepage only (a hashed list; never a link to a login or patient portal), they
  are reported only as an industry total of at least 20 sites, and their domains are
  left out of the public lists (hash and method only). Adult, gambling, government and
  at-risk sites stay excluded.
- **Founder notes.** The product line in E20 § 8.8 is removed, which reconciles the
  notes with § 8.1(5). A note gives one finding and a free fix, without a pitch.
  Only YC-new may get notes, and only once.
- **New data.** Header names and values, cookie names and short error-page excerpts
  (§ 4.1). All private, deleted 12 months after publication, never published per site.
- **Conflict of interest.** Stated in the report's first page, as for E20.
- **No ethics board or outside reader** reviewed this study (decided by the
  maintainer, 30 Oct 2026), and the results say so.

### 8.1 What is published, and removal

- **Downloadable at the study page:** every target list except NL-Cbw and health sites, which are redacted, the exclusion
  categories, the classifier rules, all code, every aggregate and analysis file, and
  the figures, under CC BY 4.0. NL-Cbw and the health list are published as a hash and a method only.
- **Never published:** per-site results, stored evidence, or anything that ranks,
  names or scores a site.
- **Removal.** Anyone who controls a domain can ask to be removed, by email or through
  robots.txt. The domain goes on a removal list that the runner reads before each
  pass, its records are deleted from the raw data, the aggregates are recomputed, and
  the published list drops it. The count of removals is reported. This is the one list
  that may change after registration, and it can only take sites out.

## 9. Limits

- A single datacenter address is not "the web's view", and neither was one home
  connection.
- E20 and pass 1 differ in time as well as vantage, so C12 and C13 are weak evidence.
- Older YC batches suffer survivorship. YC companies are not all startups. Tranco
  ranks domains, and its sample is drawn from the list, not the web.
- The classifier knows only the signatures we listed. New vendors fall into
  `origin-error` or `page`, and the validation sample estimates how often.
- The predictions were written after seeing E20 for two of four cohorts.
- Presence is not protection: a CSP can be weak, and an SPF record can be unsafe.
- The DMARC check reads `p` alone. `sp` and `pct` are added as a secondary measure.

## 10. Decisions

Taken by the maintainer on 30 Oct 2026.

1. **Vantage.** Server only, compared with E20. No run from the home connection.
2. **Cohorts.** All four older YC batches (Summer 2024, 2022, 2020, 2018), Summer and Winter 2025 as YC-25, and T10k, Europe, SP500, YC-scale, ShowHN and NL-Cbw as secondary cohorts. No accelerator portfolio pages: none grants permission and several forbid collection. Governments stay excluded, as in E20. Software vendors are left out, because no neutral list exists.
3. **Error pages.** First 4 KB of non-2xx bodies kept privately, as in § 4.1.
4. **Ethics read.** None. No outside reader before the run.
5. **Timing.** Pass 1 as soon as the study page has been live 12 hours, pass 2 seven days later.
6. **NCSC.** No notice before the run. The CVD form only if something serious turns up.
