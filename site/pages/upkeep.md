---
title: Penthera Upkeep: security upkeep for the apps you ship
description: Run Penthera yourself for free, or let us run it: weekly checks, fixes you approve and a monthly report. In validation. Nothing to buy yet.
eyebrow: Upkeep
cta: waitlist
layout: upkeep
---
# Security upkeep, done for you

> In validation. Nothing to buy yet.

You shipped it. Keeping it safe after launch is the part nobody has time for. Penthera checks your app every week, opens fixes you approve and writes the report your clients ask for. Same open-source rules: run it yourself for free, or let us run it.

{{CTA}}

## What goes wrong after launch

1. **A package you trust ships malware overnight.** Every dependency is checked each week, with the rules that rank 1st of the free tools on npm and PyPI malware in our [public benchmarks](/benchmarks).
2. **A redesign quietly drops a security header.** Your live site is checked from the outside on a schedule, and you hear what changed.
3. **An API key slips into a commit.** Secrets are checked on every push, in your own CI.
4. **Your coding agent picks up a new MCP server.** Agent setup is checked: MCP servers, skills, hooks and permissions.
5. **A client asks: is our app secure?** A monthly report says what was checked, what was found and what got fixed.
6. **A supplier questionnaire stalls a deal.** Answers are drafted from that evidence. For software you ship in the EU, it helps collect the evidence the Cyber Resilience Act asks for.

## Two ways, same rules

**Run it yourself.** Free, MIT, forever. `npx penthera@{{VERSION}} init --yes` sets up the checks, the GitHub Action runs them on a schedule in your own CI, and everything stays on your machine.

**We run it for you.** We schedule and run the checks and keep the infrastructure running. Passive checks of your live site every week; active tests only on hosts you have shown you own, and only when you ask. History over time, fix pull requests you approve, and the monthly report. Somewhere between $100 and $300 a month, per team or agency, while we test.

## What it is not, and never will be

- **Nothing is taken out of the free tool.** Every check Upkeep runs is in the MIT command-line tool first.
- **Your source code is never uploaded.** Code checks run in your own CI; Upkeep only reads their results.
- **Not a certification and not a pentest.** It shows what was checked and what was found, with the evidence.

## How the waitlist works

The button opens an email to Daan, who builds Penthera, at daan@penthera.org, with three lines to fill in: who you are, your team size and what worries you most. Nothing is stored on penthera.org. He replies to every message, and only writes again when there is something to try.
