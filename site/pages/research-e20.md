---
title: Penthera-Research/E20: what it requested from your site, and how to opt out
description: E20 is a one-time passive study of public homepages, published as aggregates only. What it requests, how to opt out with robots.txt, and who to contact.
eyebrow: Research
cta: contact
subject: Penthera-Research/E20
---
# Penthera-Research/E20

> For "why did Penthera-Research/E20 visit my site, and how do I stop it?"

If you saw `Penthera-Research/E20` in your logs, it was one visit to your homepage for a study. The study is E20. It asks how the most visited sites on the web, and recent startups, score on the same passive checks as Penthera's live check. Results are published as totals and shares only. No site is named.

{{CTA}}

## Who visits

Two lists, fixed before the run and recorded with their SHA-256 hashes in the [pre-registration](https://github.com/danoszz/penthera/blob/main/docs/research/prereg/E20-front-door.md):

1. the top 1000 sites of the [Tranco list](https://tranco-list.eu/), a research ranking of popular domains;
2. the public websites of companies in the two most recent Y Combinator batches, from YC's public company directory.

Each site is visited once. Nothing is retried. Adult, gambling, health and government sites, and sites of people at risk, are on an exclusion list and are not visited.

## What it requests

Per site, in this order, and nothing else:

1. `GET /robots.txt`. If you opted out (below), the visit stops here.
2. `GET /` over HTTPS, following at most 4 redirects. Only if HTTPS does not connect, `GET /` over HTTP.
3. `GET /.well-known/security.txt`, the file [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) asks sites to publish.
4. Public DNS records: SPF and DMARC (TXT) and CAA.

It does not load your scripts, stylesheets or images. It guesses no paths, sends no query strings, forms, payloads or logins, and reads no keys. At most 4 sites are visited at a time, and each worker waits 1 second between sites.

The request carries this User-Agent:

```
Penthera-Research/E20 (+https://penthera.org/research/e20; opt out: robots.txt User-agent: Penthera-Research)
```

The results name the one source address the visits come from, so you can match it to your logs.

## How to opt out

Add this group to `/robots.txt`:

```
User-agent: Penthera-Research
Disallow: /
```

E20 also stops for `User-agent: *` with `Disallow: /`. A site that opted out is counted as excluded and nothing else is requested from it.

If the visit already happened, email us. We delete your site's record from the raw data, and if the totals are not yet published, we recompute them without it.

## What we keep and publish

The raw per-site results stay private. They hold check outcomes and short evidence such as header values, never page bodies. They are never committed or shared, and are deleted 12 months after publication. What we publish is the share of sites that pass each check, with a 95% interval, and the score distribution. There is no ranking, and no site is named.

## What it is not

It is not a security test of your site. It does not look for your subdomains, staging hosts, app or API, and it does not crawl other pages: only the homepage you put forward. It sends nothing a browser visit to your homepage would not send, minus the scripts. A good or bad result for one site is never published, and it is not a guarantee of anything. To check your own site, use the [live check](/#scan).

## Contact

Email daan@penthera.org with "Penthera-Research/E20" in the subject. Daan van der Zwaag runs the study. For a security issue in Penthera itself, use [GitHub security advisories](https://github.com/danoszz/penthera/security/advisories/new).
