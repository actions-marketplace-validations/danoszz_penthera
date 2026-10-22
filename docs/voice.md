# Voice guide

> **Project page.** For anyone writing Penthera's docs, CLI messages, reports
> or release notes, asking "how should this sound?"

Penthera speaks as a capable, calm security agent working for the reader. It
says what it checked, what it found, how sure it is, and what to do next. It
does not sell, and it does not alarm.

## The rules

1. **One question per page.** Every user-facing page answers one real question
   and says so in its first line, as a quote block: `> **Starter.** For "is my
   app safe to ship?"`, `> **Pro.** For "how do I put it in CI?"`, or
   `> **Project page.**` for pages about the project itself.
2. **Plain words.** "Use", not "leverage". "Check", not "assess the posture of".
   Explain a term the first time a starter meets it.
3. **Short sentences.** One idea each, usually under 20 words. Split a sentence
   that needs a semicolon to survive.
4. **Active voice.** The reader is "you". The tool is "Penthera" or "it". The
   people who build it are "we".
5. **Concrete.** Name the command, the flag, the file and the result.
6. **Numbers over adjectives.** Give the count, the rate and its interval, and
   say what the sample was. Never "highly accurate" or "comprehensive".
7. **Honest about limits.** Put the limit next to the claim, not on another
   page.
8. **Method, evidence, tool.** When you describe a feature, say how it works,
   how we know it works, and then how to use it.
9. **No hype and no AI-writing tells.** No em dashes. No "the best", "perfect",
   "seamless", "robust", "powerful", "cutting-edge", "game-changing". No
   "not X, but Y" flourishes, no groups of three for rhythm, no closing
   summaries that repeat the page.
10. **Calm about risk.** State severity and confidence. Leave out "critical
    threat landscape" and "attackers are everywhere".

US spelling (authorize, license, prioritize). Product names as their owners
write them: npm, GitHub, Claude Code, MCP.

## Do and don't, from our own docs

| Don't | Do |
|---|---|
| "Penthera 2.0: the plan to become the best" | "Penthera 2.0: research plan" |
| "What 'perfect' means, concretely" | "Quality gates" |
| "That is our advantage, not a limitation." | "Verifiable feedback is what makes model output reliable enough to use." |
| "Penthera is the open-source security team for teams that don't have one" | "It checks your app, its dependencies and your AI tooling, and fixes what it can with your approval." |
| "a system that competes with commercial supply-chain and AppSec platforms on their core value" | "Each comparison page says where the other tool goes further and how to run the two together." |
| "Live playbooks — opt-in: needs `pentest.config.js` + a running server" | "Live playbooks, opt-in: needs `pentest.config.js` and a running server" |
| "Precision 0.88" | "Precision 0.88, 95% CI 0.69 to 0.96, on 24 findings in labs we wrote ourselves" |
| "The loop does not get smarter in a principled way" | "The local memory counts which fix recipes worked for which framework. It re-orders and suppresses. It does not train a model." |
| "Easy to start" | "One command, useful in under two minutes." |

Good sentences to copy the tone of:

- "It finds known classes of problems, not novel ones."
- "It asks before every change by default, never pushes, and only talks to the
  target you named."
- "These numbers catch regressions; they do not measure real-world accuracy."

## Starter and pro

A **starter** wants to know whether something is safe: their app before launch,
a package, an MCP server. Lead with the one command and what the result means.
Keep flags for later.

A **pro** wants to wire Penthera into a process: CI, rule tuning, evidence for
an auditor, the fix loop. Lead with the exact command or config, then the
options, then the limits.

The [docs index](index.md) groups pages into five journeys: I'm new, I use AI
coding tools, I run it in CI, I need evidence for an auditor, and I'm a
researcher. A new page goes into one of them, or extends a page that already
answers its question.

## CLI messages and reports

- An error says what happened and what to do next. No stack trace for an
  expected failure.
- A finding says what is wrong, how sure Penthera is, and what to do.
- A clean result says what was checked, so "nothing found" is never read as
  "safe".

## Checking a page

Before you merge a docs change:

- [ ] The first line names the reader's question.
- [ ] No sentence needs a second read.
- [ ] Every claim of quality has a number, or is removed.
- [ ] The limits are on the same page.
- [ ] `grep -n "—" <your page>` finds nothing.
- [ ] `npm run audit:internal` reports no broken links.
