# E20-R2 known limits

For an outside reviewer. These are the gaps that remain in the runner and its gate after four reviews. The protocol is `docs/research/prereg/E20r-front-door-replication.md`, Amendment 2.

## The gate proves what a run recorded, not what a person did

- **Local files are unsigned.** Manifests, seals, reports and the rounds log are plain files on the server, and their hashes aren't keyed. Anyone with the account can rewrite a raw file, its manifest, seal and report together, and every check will pass.
- **A determined operator can get past every lock.** The locks stop mistakes, not intent. Someone can edit the runner, change the deps seam, delete the rounds log, or run from a fresh clone. The honest record of a run is the public commit plus what the maintainer reports.
- **The rounds log is one file.** Deleting a round's folder and its log line together leaves no trace.
- **The repeat lock lives on one machine.** A fresh clone has no `e20r-pass2` folder, so a second start from there would revisit sites.
- **The commit check trusts GitHub and a clean tree.** It proves the checkout is the tip of `main` at the start, not what the Node process loaded afterwards.

## The address check reads local interfaces

It can't see NAT, a proxy or a VPN. Proving the egress address would take a request to an echo service, which the study doesn't send.

## Scrub forms it can't catch

The scrub removes patterns. These get through, and neither it nor its detector will flag them:

- Names, street addresses and postal codes in page text. These are why unsampled text is deleted.
- Addresses written in words with no bracket and no dot, such as `john at example`. They read like "Meet me at home".
- Addresses split over markup or across lines beyond the small gaps it allows.
- Addresses in images, in scripts built at run time, or in encodings it doesn't decode, such as base64.
- Phone numbers under 9 digits, national ID numbers and similar identifiers.
- Short tokens: under 16 characters, or under 3 digits, unless a key name such as `token=` stands next to them.
- Decimal IPv4 such as `35491250`.

It also over-scrubs on purpose. `(AT) Wien`, `Look at example.com`, `We are at home. Today` and `pkg@1.2.3` all lose text. That costs excerpt text, not labels, because labels run on the unscrubbed body before anything is stored.

The detector shares no pattern with the scrub, but it was written by the same author against the same list of forms. A form missing from both is invisible to both.

## What a clean run still can't show

- What a browser would have received. Only one declared client from one address was tested.
- Why a site refused. Identity, fingerprint and address can't be told apart.
- That a `candidate-page` is a page. The audit samples 150 of them, with one human.
- The rule changes on data they haven't seen, until the audit of pass 2.
- SPF semantics: includes, redirects and lookup limits aren't followed.

## Data that leaves the machine

The audit sheet goes to one labeler and to a hosted model. The 12-month deletion can't reach what either keeps. Sheets are blinded by field, but page text can still name a site.

## Other

- DNS traffic isn't in the byte counters.
- A site hard-capped mid-response keeps only the bytes reported up to its last tick.
- A compressed page body reads as empty.
- The 50% floor, 20% ceilings, the 30 and 20 site floors and the 5% removal cap are judgment calls, not derived values.
