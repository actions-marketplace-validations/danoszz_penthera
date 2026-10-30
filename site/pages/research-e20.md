---
nav: E20 study
title: Penthera-Research/E20: what it requested from your site, and how to opt out
description: E20 and E20-R are passive studies of public homepages, published as aggregates only. What they request, how to opt out or be removed, and who to contact.
eyebrow: Research
cta: contact
subject: Penthera-Research/E20
---
# Penthera-Research/E20

> For "why did Penthera-Research/E20 visit my site, and how do I stop it?"

If you saw `Penthera-Research/E20` in your logs, it was a visit to your homepage for a study. E20 asks how the most visited sites on the web, and recent startups, score on the same passive checks as Penthera's live check. A follow-up, E20-R, repeats and widens it. Results are published as totals and shares only. No site is named.

{{CTA}}

## Who visits

**E20** used two lists, fixed before the run and recorded with their SHA-256 hashes in the [pre-registration](https://github.com/danoszz/penthera/blob/main/docs/research/prereg/E20-front-door.md):

1. the top 1000 sites of the [Tranco list](https://tranco-list.eu/), a research ranking of popular domains;
2. the public websites of companies in the two most recent Y Combinator batches, from YC's public company directory.

**E20-R** runs two passes, a week apart, from 31 October 2026, over about 7,000 sites: the two lists above, more Tranco sites, older Y Combinator companies, large listed companies in Europe and the US, public Show HN launches, and Dutch organizations in sectors of the Cyberbeveiligingswet. Each site is visited once per pass. Nothing is retried. Adult, gambling and government sites, and sites of people at risk, are on an exclusion list and are not visited. E20 also excluded health sites. E20-R includes them, so results can show which industries are exposed, but for a health site it requests the homepage only and never follows a link to a login or patient portal. Y Combinator companies stay in whatever their sector, except adult sites.

## What it requests

Per site, in this order, and nothing else:

1. `GET /robots.txt`. If you opted out (below), the visit stops here.
2. `GET /` over HTTPS, following at most 4 redirects. Only if HTTPS does not connect, `GET /` over HTTP.
3. `GET /.well-known/security.txt`, the file [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) asks sites to publish.
4. Public DNS records: SPF and DMARC (TXT) and CAA. E20-R also reads MX and NS, and keeps only the provider's name.
5. If your homepage links to a login or app page on your own domain (a link named "Log in", "Sign in", "App" or "Dashboard", or a path like `/login`), one `GET` of that page, after checking that page's host's robots.txt. Headers only: no form is filled, nobody logs in, and links to another domain are never followed.

It does not load your scripts, stylesheets or images. It guesses no paths, follows no other links, sends no query strings, forms, payloads or logins, and reads no keys. At most 4 sites are visited at a time, and each worker waits 1 second between sites.

The request carries this User-Agent:

```
Penthera-Research/E20 (+https://penthera.org/research/e20; opt out: robots.txt User-agent: Penthera-Research)
```

Every request carries the User-Agent above. E20-R runs only from `research.penthera.org` (2.31.141.178, a rented server in Germany). For E20 we do not publish the address the visits came from, because it was a personal connection. If you want to know whether a request in your logs was ours, email us the address and time you saw, and we will confirm or deny privately.

## How to opt out

Add this group to `/robots.txt`:

```
User-agent: Penthera-Research
Disallow: /
```

E20 and E20-R also stop for `User-agent: *` with `Disallow: /`. A site that opted out is counted as excluded and nothing else is requested from it.

You can also ask to be removed at any time. Email us from your domain, or from a contact listed for it. We skip your site in every later pass, delete its record from the raw data, recompute the totals, and take it off the published list.

## What we keep and publish

The raw per-site results stay private. They hold check outcomes and short evidence such as header values, never page bodies of normal pages, never IP addresses, and no email addresses: the part before the @ is removed before anything is written. E20-R also keeps header names, cookie names (never values), a hash of the page, and, for an error or block page only, its first 4 KB. All of it is never committed or shared, and is deleted 12 months after publication.

What we publish is the share of sites that pass each check, with a 95% interval, and the score distribution. There is no ranking, and no site is named. For anyone who wants to check the work, the code, the target lists and the aggregates can be downloaded with the results. Health sites and the Dutch sector list are published as a hash and a method only, and appear in the results as industry totals.

## What it is not

It is not a security test of your site. It does not look for your subdomains, staging hosts, app or API, and it does not crawl other pages: only the homepage you put forward. It sends nothing a browser visit to your homepage would not send, minus the scripts. A good or bad result for one site is never published, and it is not a guarantee of anything. We never claim a site is vulnerable, and we do not probe further than the requests above. To check your own site, use the [live check](/#scan).

## Contact

Email daan@penthera.org with "Penthera-Research/E20" in the subject. Daan van der Zwaag runs the study, and maintains Penthera, whose live check is the instrument. For a security issue in Penthera itself, use [GitHub security advisories](https://github.com/danoszz/penthera/security/advisories/new).
