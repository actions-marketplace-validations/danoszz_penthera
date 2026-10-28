# How Penthera is built: use of generative AI

> **Project page.** For "how much of it did AI write?"

We build Penthera with a lot of help from generative AI. This page says how, so
that users, contributors, reviewers and funders can judge the work with the full
picture. It follows the spirit and the disclosure requirements of the
[NLnet generative AI policy](https://nlnet.nl/foundation/policies/generativeAI/).

Last updated 2026-10-20.

## What was generated, and with what

- **Models.** Anthropic Claude, used through Claude Code: Claude Opus 4.8 for
  the August 2026 work, Claude Opus 5.5 for the October 2026 work.
- **Scale.** Of the 117 non-merge commits up to the v1.7.0 tag, 107 (91%)
  were written with Claude and carry a `Co-Authored-By: Claude …` trailer naming
  the model. Most of v1.2 to v1.7, released on 2026-10-19, was implemented by
  Claude Code sessions that the maintainer directed, often several in parallel.
  Since v1.7.0, all 57 non-merge commits up to 2026-10-20 name Claude as
  co-author; 12 of them lack the `AI-Assisted` summary line, 6 of those
  written before that rule existed. Commit history is not rewritten; CI now
  enforces the rule on every pull request (see below).
- **What the maintainer did.** Set the direction and requirements, made the
  design and security decisions, reviewed and approved changes, handled
  everything that needs a human account (npm 2FA approvals, signing keys,
  repository settings), and decided what to merge and release.
- **Documentation.** Most docs, including the README, the methodology and this
  page, were drafted with Claude and edited by the maintainer.
- **Outside contributions.** Contributions from other people (for example
  [#20](https://github.com/danoszz/penthera/pull/20) by Nurana Aliyeva) are their
  own; check each pull request for its own disclosure.

## How generated work is checked

We treat generated code as untrusted until it passes the same gates as any
other change:

- the full test suite, plus CodeQL and OpenSSF Scorecard on every pull request;
- the [internal audit](internal-audit.md) before every release: benchmark drift,
  a self-scan, packaging, offline egress, supply chain and docs links;
- an independent review pass. For example, a read-only review on 2026-10-19
  found three high-severity bugs. We reproduced each one and fixed it with a
  regression test before release (see the 1.6.0 changelog);
- maintainer approval of every release with 2FA. Rule packs are signed with the
  maintainer's own key, which never leaves his machine.

The maintainer is accountable for the code and must be able to explain any part
of it. If you find something nobody can explain, that is a bug: please open an
issue.

## Licensing and copyright

Penthera is MIT-licensed. Under current EU interpretation, purely AI-generated
output may not be protected by copyright. Treat the generated parts of
Penthera as freely usable. This does not restrict
anyone's use of the project. We check that generated code does not reproduce
third-party code under incompatible terms. Penthera has one runtime
dependency.

## How the agents that build Penthera are contained

Penthera is built by AI coding agents, so it follows its own
[advice for running agents](agents-safely.md):

- **No release rights.** Agent sessions cannot publish to npm or sign rule
  packs: publishing needs the maintainer's 2FA approval, and the signing key
  never leaves his machine. Tagging and version bumps are the maintainer's
  call, a standing rule for every session.
- **Changes go through review.** Agents work on branches and open pull
  requests. Every pull request passes the same checks as human work, and the
  maintainer decides what merges and what ships.
- **Judges are reviewed like code.** CI, CodeQL and the release checks run on
  GitHub. A change to a test or a workflow is a pull request like any other,
  and is called out in review.
- **Private findings stay private.** Security review reports of unreleased
  fixes are kept outside the repository until a fix ships.

## Rules from now on

Every AI-assisted commit names the model and version in its trailer and
summarizes how AI was used. Commits that are entirely human-written carry no AI
trailer. See [CONTRIBUTING.md](https://github.com/danoszz/penthera/blob/main/CONTRIBUTING.md#use-of-generative-ai) for the
exact format, which applies to the maintainer and to all contributors. CI
checks it on every pull request with `scripts/ci/provenance.mjs`: a commit
that names an AI co-author without an `AI-Assisted` line, or the other way
round, fails the check.

Work *on* generative AI inside Penthera (for example, the local-model fix
proposals in the [research plan](vision-2.0.md)) is described openly in the
roadmap. In Penthera, models only propose; deterministic checks decide.

## Prompt and session logs

For grant-funded milestones, we log the prompts and outputs behind generated
code and publish them in a stable place, as NLnet's policy requires. The default
place is `docs/genai-logs/` in this repository, or the commit message itself for
short exchanges. For work done before any grant (up to v1.7.0), the commit
trailers and this page are the record. We did not keep public session logs for
it.
