section: Fixed

- **A clean single-page app no longer gets a false critical.** The
  CVE-2025-29927 check fired on a 200 alone, and a single-page app answers 200
  on every path. Two of the three places that run it now report only when the
  header steadily changes the answer: the status, or a stable body. The third,
  the `--adaptive` check, already compared. The Next.js debug endpoint check now
  needs a Next.js home page, the Next.js source map check needs a JSON body, and
  the `/docs` check needs the page to name Swagger, OpenAPI, ReDoc or RapiDoc.
  `--profile quick` and MCP `scan_url` use the same checks.
- **Exit 0 now says what it means.** The terminal report ends with "No critical
  or high rule fired. This run does not prove login, access rules or payments
  are right."
  The agent brief lists the same limit under Not checked. `docs/before-you-publish.md`
  no longer says "Publish" for exit 0, and its checklist adds `npm audit`.
