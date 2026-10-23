# Site brief

> **Project page.** For "what is the Penthera site for, and what was decided?"

The source of truth for the landing page in `site/`. Decisions made with the
maintainer on 2026-10-21; change them here first, then in the page.

## Reader and job

One reader: a developer who ships with AI coding tools (Claude Code, Cursor,
Codex) and has never heard of Penthera. They arrive from a README, a post or
a star. The page has one job: get them to run `npx penthera`, or to try the
check in the page first.

## Positioning (approved, used verbatim)

- Title (2026-10-21, the hero and README headline): "Penthera: your
  open-source cyber security agent"
- Subline: "The security review you never had time for. Offline, rule-based,
  and you can verify every finding yourself."
- One-liner, still approved for other copy: "Penthera: an open-source cyber
  security agent you can use today, and verify yourself."
- Short line: "Offline cyber security agent for your apps and AI coding tools.
  Open R&D: measured in public, improved every release."

## Direction: Poster

typesafe.ai in spirit, in Penthera's own 1-bit look (`penthera ui` after #63):

- Ground `#000` / `#fdfdfa`, ink, and `#0000ed` as the only colour. Greys are
  dither patterns, never flat.
- One assertion per screen, a lot of empty paper, a dithered field cut from
  the walkthrough frames.
- Display type: Helvetica Neue, tight. It is a system font, so nothing is
  downloaded; Arial is the fallback where it is missing. Departure Mono
  (self-hosted, OFL) for commands, labels and numbers, as in the dashboard.
- **The one bold move:** the browser check is the only window on the page,
  drawn like a `penthera ui` window. Everything else is poster.
- Theme follows the system on the first visit; a toggle overrides it and is
  remembered in localStorage (no cookie).

## Structure

A story in ten chapters (2026-10-22, restructured after caveman.so's
structure, not its voice). Each chapter opens with a numbered eyebrow and one
assertion; sections that repeated each other were merged.

1. Hero: the problem ("AI coding tools ship faster than anyone can check"),
   then the title, subline, `npx penthera` and the 12-second loop.
2. The answer: "yo, is my app safe?" before and after (a real scan), then a
   spec table: For, Runs, Works with, Price.
3. What it checks: one window with four panes (your app, dependencies, AI
   tooling, a live URL), each with a count read from the rules, bold lead-ins
   and its command. Then the browser check, the one window you can use.
4. How to trust it: three principles (rules decide, offline, measured in
   public), then the E10 benchmark with its caveats first.
5. Current limitations, on its own dithered grey band: what it does not
   do, what ROADMAP.md plans for each limit, and the planned integrations
   (AI app builders such as Base44, preview deployments), each marked
   planned. Links to the methodology, the FAQ and the roadmap.
6. The tour, numbered 01 to 04: the CLI (the walkthrough), the dashboard,
   the MCP server, the fix loop.
7. How it compares: where each tool goes further, in one line each; the
   full sourced table folds out below it.
8. Get started: the CLI, the Agent Skill and the MCP server, each with a copy
   button; prompts and per-client MCP configs below.
9. Before you install: the FAQ. The EU-rules section and Open R&D are answers
   here now.
10. For agents: `llms.txt`, `llms-full.txt`, the Markdown docs, `server.json`,
   the skill, `AGENTS.md` (once it exists), the sitemap and `security.txt`.

Decided with the maintainer, 2026-10-22: the problem line is a kicker above
the title (the title stays the h1); the browser check stays under "What it
checks"; chapters keep a numbered eyebrow and an assertive h2; the
per-client MCP configs are collapsed in a `<details>`.

Decided with the maintainer, 2026-10-23: the limits leave the trust band
for a grey band of their own (a 2 px checker, so still a dither, not a flat
grey), with a roadmap line per limit; the comparison shows its summary and
folds the table; the hero pills are blue highlighter marks.

Decided with the maintainer, 2026-10-23, later: tighter and more varied.
The style is "futuristic yet brutalist and typographic". Square corners and
hard type stay; a few surfaces now catch light: brushed-metal plates in
the old Apple manner, lit by one light from above that follows the pointer
on a mouse (mixed from each palette's ground and ink) for the trust
principles, benchmark counts, roadmap lines, ways in and prompts; polished
gradient type for the price and the counts; light falling on the blue band;
soft blue gradients on the primary buttons. This replaces "greys are dither
patterns, never flat" for those plates. The bottom blur stays as it is.
Secondary detail folds away: the benchmark chart and the agent prompts sit
behind toggles, like the MCP configs and the comparison table.

## Anti-references

- Security-vendor pages: dark gradients, shields, padlocks, "threat
  landscape" copy, a "Book a demo" button.
- AI-startup pages: glowing orbs, logos-of-trust walls, testimonials.
- A scanner that keeps what it finds. The live check stores nothing and
  publishes no per-site pages.

## Constraints

- No third-party scripts, trackers or cookies; only Vercel's cookieless Web
  Analytics and Speed Insights, served from the same origin. All assets are
  served from the same origin.
- CSP `connect-src` lists the two Vercel counters and `/api/check` on
  penthera.org, nothing else. The page sends only the address you type, to
  penthera.org's own function.
- The live check (decided with the maintainer, 2026-10-23): one function,
  `api/check.mjs`, described in `/openapi.json`. Anyone can run the passive
  report on any public site: only what a browser loads (the page, the files
  it references, `/.well-known/security.txt`, public DNS). The owner-verified
  scan (a DNS TXT record or a file, HMAC token, no storage) adds the CLI's
  payload-free fixed paths, on the verified host only. Never payloads, never
  `--deep` online. Every request goes through the guard in `api/_lib/guard.mjs`:
  public addresses only, pinned, redirects re-checked. Nothing is stored or
  logged; a count of scans may come later, never the results.
- The rule code is the CLI's (`lib/`), so the site and `npx penthera` agree.
