# Can Penthera tell, from outside, whether a GitLab is patched?

Status: **research note, 2026-10-22. Proposes a repo-evidence rule; no rule
shipped.**

## The trigger

On 21 October 2026 GitLab shipped a critical patch release, 19.5.1, 19.4.3,
19.3.6, 19.2.9, 19.1.9, 19.0.10 and 18.11.13
([GitLab, 2026](https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/)).
Its headline fix is CVE-2026-110264: an integer overflow in the regular
expression compiler that, "under certain conditions", lets an unauthenticated
user run code on the server (CVSS 3.1 10.0,
`AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`). Affected: 7.0 before 18.11.13, and
each 19.x line before the versions above. GitLab.com and GitLab Dedicated were
already patched; self-managed instances are the ones at risk.

Penthera's `runtime-advisory` engine answers "is the version you run
affected?" from version evidence: a banner on a URL scan, or a pin in the repo.
The question here is whether a self-managed GitLab gives that evidence to
someone who is not logged in, passively, without sending anything an
ordinary visitor would not.

## What an anonymous visitor sees

Checked against GitLab's documentation and gitlab.com (same code base) with
plain GET requests, on 2026-10-22:

| Place | Anonymous result | Version? |
|---|---|---|
| `GET /api/v4/version`, `/api/v4/metadata` | 401 Unauthorized | no |
| GraphQL `{ metadata { version } }` | `{"data":{"metadata":null}}` | no |
| `GET /help` | 200, names the edition ("GitLab Enterprise Edition") | no |
| Response headers | no version header (`Server` is the proxy) | no |
| `/assets/webpack/*.js` on public pages | file names carry a content hash | indirectly, see below |

GitLab treats an anonymous version leak as a vulnerability:
[CVE-2024-9596](https://nvd.nist.gov/vuln/detail/CVE-2024-9596) ("possible for
an unauthenticated attacker to determine the GitLab version number"), fixed in
17.2.9, 17.3.5 and 17.4.2. Earlier, the "What's new" panel under Help had the
same problem
([gitlab-org/gitlab#323492](https://gitlab.com/gitlab-org/gitlab/-/issues/323492)).
So on every line this advisory covers, a passive black-box scan does not get a
version, by design.

## Why asset fingerprinting is out

The one remaining signal is the frontend bundle. Webpack file names contain a
content hash, and community tools map those hashes to GitLab versions. Penthera
should not do this:

1. **It is not vendor data.** GitLab publishes no hash-to-version table. The
   mapping would be built by Penthera (or copied from a third party) by
   building or unpacking every release. Penthera's rule is that rules copy
   vendor data, with a vendor source per rule; this has none.
2. **It cannot always separate fixed from unfixed.** It only works when the
   patch touches frontend code. 19.5.0 → 19.5.1 happens to change 21 frontend
   files (the GitLab compare API, `v19.5.0-ee...v19.5.1-ee`), but a
   backend-only security release ships byte-identical bundles, and
   CVE-2026-110264 itself is in the regex compiler, not the frontend. "Same
   bundle as 19.5.0" would then mean "19.5.0 or 19.5.1", which is exactly the
   question.
3. **It would rely on a leak GitLab closes.** GitLab files version disclosure
   as a vulnerability (above). A rule that works until the next hardening
   release would turn from "affected" into silence without anyone noticing.
4. **Proxies and CDNs rewrite assets.** Self-managed GitLab behind a CDN or
   with a custom asset host changes or hides the paths, so absence of a match
   means nothing.

A wrong "patched" on a CVSS 10.0 pre-auth RCE is the worst outcome a scanner
can produce here. Penthera's runtime advisories never call a version clean
without seeing it.

## What is feasible

Two things, both passive and both from vendor data:

**1. Repo evidence (white box): reliable.** Many self-managed instances are
deployed from a pinned image, and the tag is the exact version:
`gitlab/gitlab-ce:19.5.1-ce.0`, `gitlab/gitlab-ee:19.5.0-ee.0` (Docker Hub
tags; [GitLab Docker install docs](https://docs.gitlab.com/install/docker/)).
Penthera already reads Dockerfiles and compose files for PHP, nginx, Node.js
and Python images. A `gitlab` product would need:

- `dockerImages: ["gitlab/gitlab-ce", "gitlab/gitlab-ee"]`, with the
  `-ce.0` / `-ee.0` suffix read as GitLab's package revision, not as a distro
  build (today any suffix makes a version "distro", which would turn every
  GitLab pin into "check on server");
- `branchOf: minorLine` (GitLab patches per minor: 19.5, 19.4, ...);
- `checkCommand: "sudo gitlab-rake gitlab:env:info"` (or `/help` while signed
  in as an admin).

The rule would be copied from the release post:

```json
{
  "id": "gitlab-cve-2026-110264",
  "product": "gitlab",
  "title": "GitLab remote code execution via integer overflow in the regex compiler",
  "severity": "critical",
  "cves": ["CVE-2026-110264"],
  "cvss": { "version": "3.1", "score": 10.0 },
  "fixed": [
    { "branch": "18.11", "version": "18.11.13" },
    { "branch": "19.0", "version": "19.0.10" },
    { "branch": "19.1", "version": "19.1.9" },
    { "branch": "19.2", "version": "19.2.9" },
    { "branch": "19.3", "version": "19.3.6" },
    { "branch": "19.4", "version": "19.4.3" },
    { "branch": "19.5", "version": "19.5.1" }
  ],
  "source": "https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/",
  "date": "2026-10-21",
  "confidence": "confirmed"
}
```

Lines older than 18.11 that the post does not list would need `runtime-eol`
data from GitLab's maintenance policy. Until that exists they fall into
"check", which is the honest answer.

**2. Presence (black box): "check on server", never "affected".** The way PHP
is handled when `X-Powered-By` hides the version: if a URL is clearly GitLab
(the `_gitlab_session` cookie, or the sign-in page), report "GitLab in use,
version not visible: check it is at or above the fixed version for its line",
at `needs-human-review`. This adds a prompt, not a verdict, and costs no extra
requests on a page Penthera already fetched.

## Recommendation

Add the `gitlab` product with the Docker-image evidence and the rule above, in
a pack the maintainer signs. Add the presence signal only if it can be done
without a request the scan does not already make. Do not fingerprint assets.
