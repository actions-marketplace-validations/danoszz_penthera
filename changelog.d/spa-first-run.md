section: Fixed

- **A clean single-page app no longer gets a false critical.** The
  CVE-2025-29927 check fired on a 200 alone, and a single-page app answers 200
  on every path. Both places that run it now send the request a second time
  without the header, and report only if that request is refused or redirected.
  The Next.js debug endpoint check now needs a Next.js home page, the Next.js
  source map check skips HTML, and the `/docs` check needs the page to name
  Swagger, OpenAPI, ReDoc or RapiDoc. `--profile quick` and MCP `scan_url` use
  the same checks.
- **Exit 0 now says what it means.** The terminal report ends with "No critical
  or high rule fired. This run does not check login, access rules or payments."
  The agent brief lists the same limit under Not checked. `docs/before-you-publish.md`
  no longer says "Publish" for exit 0, and its checklist adds `npm audit`.
