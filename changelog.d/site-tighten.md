section: Site

- **A live security check on penthera.org.** Type an address, confirm it
  is your site and slide to scan. You get a score, the failures first with
  evidence, a fix and a command to verify it, and a prompt for your coding
  agent built from the checks you pick. The check is passive, only what one
  browser visit loads: headers, TLS, cookies, secrets and vulnerable
  libraries in the page and its scripts, SRI, mixed content, SPF, DMARC, CAA
  and security.txt. Nothing is stored, site owners can opt out in
  robots.txt, and the terms are at `/terms`. Deeper testing stays on your own
  machine: `npx penthera <url>`. The API is described in `/openapi.json`.
- **A clearer page.** Eight chapters, each answering one question once, and
  an About chapter. The drag-and-drop file check is gone. Brushed-metal
  plates lit by one light that follows the pointer, gradient numbers, a lit
  blue band and soft gradient buttons.
- **Ready for agents.** A Markdown version of the homepage at `/index.md`,
  Markdown 404s for agents that ask for it, JSON-LD, and a When to use
  section in llms.txt.
