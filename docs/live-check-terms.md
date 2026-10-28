---
title: "Terms for the live check on penthera.org"
sidebarTitle: "Live check terms"
description: "What you may do with penthera.org's live check, what it requests, and what it stores: nothing."
---

> **Project page.** For "what may I do with the live check, and what does penthera.org do with it?"

Last updated: 23 October 2026.

These terms cover the quick check on [penthera.org](https://penthera.org/#scan) and its API, `POST https://penthera.org/api/check`. The Penthera command-line tool itself is covered by its [MIT license](https://github.com/danoszz/penthera/blob/main/LICENSE).

## In short

- Check only a site you own, or one you have written permission to test.
- The check is passive: it loads what one visit with a browser loads. It sends no attacks.
- It is a research-backed, educational tool. A good score is not a guarantee, and it is not a penetration test.
- Nothing about you or the site you check is stored.
- Deeper testing happens only with `npx penthera` on your own machine, under your own responsibility.

## What the check does

When you check a site, penthera.org makes these requests to it, and nothing else:

1. `GET /robots.txt`, to see whether the owner opted out (see [For site owners](#for-site-owners)).
2. `GET` the address you entered, following redirects.
3. `GET` up to 14 scripts and stylesheets that page itself references.
4. `GET /.well-known/security.txt`.
5. Public DNS lookups: SPF, DMARC and CAA records.

That is at most 20 requests, within about 8 seconds, from penthera.org's server. They identify themselves with the User-Agent `Penthera-QuickCheck/1`. It does not guess paths, look for hidden files, log in, submit forms, or send payloads of any kind. It refuses private, internal and local addresses.

## Acceptable use: zero abuse

By sliding to scan, or by sending `"consent": true` to the API, you confirm that:

- you own the site, or you are authorized by its owner to test it;
- you will not use the check, its results or the prompt it writes to harm anyone, to break into a system, or to help someone else do that;
- you will not try to get around the limits, the address checks or the consent step, or use penthera.org to send traffic to sites that are not yours.

We do not support anyone who tests a site that is not theirs to test, and we have nothing to do with people who lie about having permission. Checks that look like abuse are blocked, and we may report them to the hosting provider involved.

## No guarantee

The check and its results are provided "as is", without warranty of any kind. A clean result does not mean a site is safe: it finds known classes of problems from the outside, not business-logic flaws, authorization bugs or zero-days, and it does not replace a human penetration test. A finding may be wrong; every finding shows its evidence so you can check it yourself.

## Responsibility

You are responsible for what you check and for what you do with the results, including any change you make to a site because of them, by hand or through a coding agent. To the extent the law allows, Penthera's maintainer is not liable for any damage that results from using the check, from its results, or from a site being checked by someone who was not authorized to do so.

## Privacy

- penthera.org stores nothing about a check: not the address, not the results, not who ran it. The address travels in the request body, so it does not appear in request logs.
- To enforce the limits, the server keeps a short-lived count of requests per visitor address and per checked site, in memory only, for at most a day.
- The site is hosted on Vercel, which processes your IP address to deliver the page and the check. The page counts anonymous page views and load times with Vercel's cookieless analytics; it does not record that you ran a check or what you checked.
- The results are shown only in your browser tab. Copying the prompt puts it on your clipboard; nothing is sent anywhere.

## For site owners

If your site was checked and you did not ask for it:

- **Opt out:** add this to your `robots.txt`, and penthera.org will refuse to check your site:

  ```
  User-agent: Penthera-QuickCheck
  Disallow: /
  ```

- **Report abuse:** open an issue on [GitHub](https://github.com/danoszz/penthera/issues), or use the contact in [security.txt](https://penthera.org/.well-known/security.txt). We do not know who ran a check, because we do not store it, but we can block a pattern of abuse.

## About Penthera

Penthera is an open-source project maintained by Daan van der Zwaag, part-time and in the open. It is not a company and does not sell anything. Questions: [GitHub Discussions](https://github.com/danoszz/penthera/discussions).

## Changes

These terms may change as the check changes. The date at the top says when, and the history is in the [repository](https://github.com/danoszz/penthera/commits/main/docs/live-check-terms.md).
