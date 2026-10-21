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

- One-liner: "Penthera: an open-source cyber security agent you can use today,
  and verify yourself."
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

1. Hero: one-liner, short line, `npx penthera`, the 12-second loop.
2. The check: drop or paste five kinds of file, Penthera's own rules run in
   the tab. What it cannot do, next to it.
3. Get it: `npx penthera`, GitHub, npm, prompts for Claude Code, Cursor and
   Codex.
4. The walkthrough video.
5. Honest limits, one line to the methodology.
6. Vision: open R&D, measured in public, results published good or bad.

## Anti-references

- Security-vendor pages: dark gradients, shields, padlocks, "threat
  landscape" copy, a "Book a demo" button.
- AI-startup pages: glowing orbs, logos-of-trust walls, testimonials.
- Anything that implies a hosted scanner. Nothing is scanned on a server.

## Constraints

- No third-party scripts, analytics, trackers or cookies. All assets are
  served from the same origin.
- CSP `connect-src 'none'`: the page cannot make a network request after it
  loads, which is what "nothing leaves your browser" rests on.
- The check bundles `lib/` at build time (`site/build.mjs`). The site and the
  CLI run the same rule code.
- No URL scans and no server functions.
