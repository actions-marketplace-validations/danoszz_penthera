# Launch posts

> **Project page.** For the maintainer asking "what do we post on Hacker News, Product Hunt, Lobsters, dev.to and Reddit, under each one's rules?"

Drafts. Nothing has been posted. Post after 1.9.0 is on npm `latest`, one
community at a time, and stay to answer questions the same day. Every scan
shown is of Daan's own app or of penthera.org.

Three communities forbid generated text: Hacker News ("Don't post generated
text or AI-edited text"), dev.to (AI-assisted posts must be disclosed and may
not promote the author's own product) and r/cursor ("No slop"). For those, this
page gives a fact sheet and an outline, and **Daan writes the post himself**.
The others have a full draft for him to edit.

Rules were read on 23 October 2026. Reddit blocked our reads, so its rules come
from a third-party mirror and must be checked on each sub's live sidebar.

## Fact sheet

Every number below comes from the repo on 23 October 2026. Check them against
the page and `bench/` on the day you post.

- What it is: an open-source (MIT) security agent. CLI `npx penthera`, an MCP
  server with six read-only tools, an Agent Skill, and a free passive check on
  penthera.org. Node.js 22 or later, one runtime dependency.
- How it decides: deterministic rules decide every finding. A model may only
  propose; AI mode is opt-in and its findings are checked by the rules.
- Rule counts: 16 URL templates, 21 secret and AI-key patterns, 15 dependency
  capabilities, 39 agent-config rules, 41 rules in signed packs.
- Typosquat list: 15,765 popular npm and PyPI names.
- Benchmark in labs we wrote: precision 0.88 (95% CI 0.69 to 0.96) and recall
  0.91 (95% CI 0.73 to 0.98) on 24 findings. These catch regressions; they do
  not measure real-world accuracy.
- Known-vulnerable apps (E10 pilot, OWASP Juice Shop and DVNA): recall 10 of
  14 (0.71, 95% CI 0.45 to 0.88), precision 0.88 (95% CI 0.78 to 0.93) on 74
  labelled findings. Held-out WebGoat: 2 of 9. Say the WebGoat number too.
- The live check: passive, at most 20 requests in about 8 seconds, nothing
  stored, a site can opt out in `robots.txt`. Score out of 100, evidence per
  check, "Prompt to fix" for a coding agent.
- What it does not do: it finds known classes of problems, not novel ones. No
  business-logic or authorization bugs. Not a penetration test.
- Who: Daan van der Zwaag, part-time, in the open, alongside a PhD in AI and
  architecture. Not a company; nothing for sale.
- Links: https://penthera.org, https://github.com/danoszz/penthera,
  https://www.npmjs.com/package/penthera

## Show HN

Rules: [showhn.html](https://news.ycombinator.com/showhn.html) and the
[guidelines](https://news.ycombinator.com/newsguidelines.html). Something
people can try without signing up (both the CLI and the live check qualify).
Title starts with `Show HN:`. No asking for upvotes, no deleting and reposting.
**Daan writes the title and the first comment himself.**

Title notes (pick one shape, write it in your own words, no superlatives):

- `Show HN: Penthera, an offline rule-based security check for repos and AI agent config`
- `Show HN: Penthera, check your site's security headers, TLS and leaked keys passively`

Link: `https://github.com/danoszz/penthera` (the code is what HN readers want
to read; the live check is linked from the README and the comment).

Outline for the first comment:

1. Why it exists, in a sentence or two: the checks you ran before shipping
   apps for 15 years, collected into one tool, now that AI coding tools let
   more people ship.
2. What it does: the four areas (app, code, dependencies, agent config), one
   command, offline by default.
3. How it decides: rules, not a model, and why (verifiable, the same answer
   twice). AI mode exists, opt-in, and cannot add a finding on its own.
4. The numbers and their samples, including the weak one (WebGoat 2 of 9).
5. The limits, plainly.
6. The live check on penthera.org: passive, what it requests, nothing stored,
   your own site only.
7. What you want feedback on: false positives, rules people want, the MCP
   server in their agent.

- [ ] Daan's text written
- [ ] Posted: date, link

## Product Hunt

Rules: [Launch guide](https://www.producthunt.com/launch) and
[how to post](https://help.producthunt.com/en/articles/479557-how-to-post-a-product).
Daan hunts it from his personal account and lists himself as maker. Launches
go live at 00:01 PT; schedule it. You may share the link, not ask for upvotes.

Assets to make before scheduling:

- Thumbnail 240 × 240 (the square logo the Cline listing also needs).
- Gallery 1270 × 760, at least 2 images: the live check's report on
  penthera.org (95/100), the terminal scan of Daan's own app, the dashboard,
  the MCP tools in Claude Code. `site/media/social/og.png` can be re-rendered
  at that size with a new entry in `CARDS`.
- Optional video: a public YouTube link to the 64 → 100 recording
  ([social-plan.md](social-plan.md#1-64-to-100-in-3-minutes)).

Fields:

- **Name:** `Penthera`
- **Tagline** (60 characters at most; the form's limit, not an official one):
  `Free, offline security checks for your app and AI tools` (55)
- **Description** (260 characters at most):
  `Open-source security agent. Check your site passively on penthera.org, or run npx penthera on your machine: secrets, dependencies, AI agent config (MCP, hooks, skills) and your running app. Rules decide every finding; your code stays on your machine.` (250)
- **Topics** (up to 3): Developer Tools, Security, Open Source
- **Links:** https://penthera.org, https://github.com/danoszz/penthera
- **Pricing:** Free

Maker comment:

> Hi, I'm Daan. I build Penthera in the open, part-time, alongside a PhD in AI and architecture. For 15 years I ran my own set of checks before anything I built shipped. Penthera is that set, for everyone who now ships with AI coding tools.
>
> Two ways to try it. On penthera.org, check a site you own: it loads what one browser visit loads (at most 20 requests), stores nothing, and gives a score out of 100 with the evidence and a prompt to fix it with your coding agent. On your machine, `npx penthera` checks your code, your dependencies and your AI agent config, offline.
>
> Every finding comes from a rule you can read. On labs we wrote ourselves, precision is 0.88 (95% CI 0.69 to 0.96) on 24 findings; on two known-vulnerable apps, recall is 10 of 14. It finds known classes of problems, not novel ones, and it is not a penetration test.
>
> MIT licensed, no account, no telemetry. I'd like to hear what it gets wrong.

- [ ] Approved
- [ ] Scheduled: date
- [ ] Live: link

## Lobsters

Rules: [about](https://lobste.rs/about). Invite-only. For the first 70 days an
account cannot post self-promotion or use the `show` tag. Self-promotion
should stay under a quarter of your stories and comments over the past year.
Tick "I am the author of the story at this URL".

**Precondition:** Daan has a Lobsters account older than 70 days with real
participation. If not, skip Lobsters for now; do not ask someone else to post it.

- **Title:** `Penthera: offline, rule-based security checks for repos, dependencies and agent config`
- **URL:** `https://github.com/danoszz/penthera`
- **Tags:** `show`, `security`
- **Author box:** ticked
- **Text:** none; answer in the comments.

- [ ] Account eligible
- [ ] Approved
- [ ] Posted: date, link

## dev.to

Rules: [editor guide](https://dev.to/p/editor_guide) and
[AI-assisted articles](https://dev.to/guidelines-for-ai-assisted-articles-on-dev).
At most 4 tags. An AI-assisted article must say so and may not promote the
author's own product. So: **Daan writes it**, as a how-to that teaches
something, with Penthera as the tool he used.

Front matter:

```yaml
---
title: <Daan's title>
published: false
tags: security, webdev, javascript, opensource
canonical_url: <if it is first published elsewhere>
cover_image: <1000 × 420>
---
```

Outline, "What a passive security check can and cannot tell you about your site":

1. What one browser visit reveals: headers, TLS, cookies, scripts.
2. The five fixes that move a score most, from the weights in
   `api/_lib/grade.mjs`: HTTPS, HSTS, CSP, framing, nosniff.
3. Keys in JavaScript bundles: why `VITE_` and `NEXT_PUBLIC_` variables are public.
4. SPF and DMARC in two DNS records.
5. What it cannot see: authorization, database rules, other pages.
6. Doing it on your own machine with `npx penthera`, and on your own site with
   the live check.

- [ ] Daan's text written
- [ ] Posted: date, link

## Reddit

Read each sub's sidebar and pinned posts on the day; the rules below come from
a third-party mirror. Post from Daan's account, answer comments, and do not
cross-post the same text to all four on one day.

### r/webdev

Rules (mirror, read 26 September 2026): sharing projects is limited to
**Showoff Saturday**; no commercial promotion; "Think project, not product."
Unverified: whether that is a flaired post on Saturday or a weekly thread.

- **Day:** a Saturday.
- **Title:** `[Showoff Saturday] I made a passive security check for your own site: headers, TLS, cookies, leaked keys, SPF/DMARC`
- **Body:**

> It loads what one browser visit loads (at most 20 requests, about 8 seconds), scores the site out of 100, and shows the evidence, a fix and a curl command to verify each check. Nothing is stored. Only check your own site; you can opt out in robots.txt.
>
> penthera.org has the check. The same rules run offline in an MIT CLI, `npx penthera`, which also reads your code and dependencies.
>
> What it cannot see: anything behind a login, your API's authorization, your database rules. It is not a pentest.
>
> I'd like to know which findings are wrong or unclear on your sites.

- [ ] Rules checked on the day
- [ ] Approved
- [ ] Posted: date, link

### r/ClaudeAI

Rules (mirror, read 26 September 2026): Rule 7 allows a project you built with
or for Claude if it is free to try and has no referral links, with little
promotional language. Feed posts need more than 100 karma; below that, use the
showcase thread. Use the post flair (probably "Built with Claude"; check).

- **Title:** `I built an MCP server that audits your Claude Code setup (skills, MCP servers, hooks) with plain rules, offline`
- **Body:**

> Penthera is a free, MIT-licensed MCP server with six read-only tools. `audit_ai_tooling` checks the project's skills, MCP servers, hooks and permissions for hidden instructions, curl-pipe-shell, unpinned packages and inline secrets, and grades them A to F. The other tools check secrets in the code, what each dependency can do, runtime advisories, and a passive scan of a local app.
>
> Findings come from rules, not a model, so the same project gives the same answer twice. The tools read only inside your workspace, never write, never run a shell.
>
> `claude mcp add penthera -- npx -y penthera@1.9.0 mcp`
>
> I built it with Claude Code; the repo's AGENTS.md has the rules the agents follow. Feedback on false positives is the most useful thing you can send.

- [ ] Rules and flair checked on the day
- [ ] Approved
- [ ] Posted: date, link

### r/cursor

Rules (mirror, read 11 October 2026): self-promotion at most 10% of your
activity, context in a text post, a flair on every post, and **"No slop"**:
AI-generated content is removed. **Daan writes this post.** Points to cover:
the MCP config for Cursor (`docs/mcp-clients/`), what `audit_ai_tooling` checks
in `.cursor/` and `.mcp.json`, read-only guarantees, and one real finding from
his own project.

- [ ] Daan's text written
- [ ] Posted: date, link

### r/vibecoding

Rules (mirror, read 4 October 2026): dev tools **must be approved by the mods
first**, through their community on X. Posts must explain how you built it.
Keep AI use in posts and comments to a minimum.

1. Ask for approval in the r/vibecoding X community first (Daan's words).
2. After approval, a post that shows the 64 → 100 fix on Daan's own app, how
   the check works, and how Penthera itself was built, in Daan's words.

- [ ] Mod approval: date
- [ ] Posted: date, link
