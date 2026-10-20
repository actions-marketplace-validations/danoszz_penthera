# How Penthera is built: use of generative AI

Penthera is developed with substantial help from generative AI. This page says
how, so that users, contributors, reviewers, and funders can judge the work with
the full picture. It follows the spirit and the disclosure requirements of the
[NLnet generative AI policy](https://nlnet.nl/foundation/policies/generativeAI/).

Last updated 2026-10-20.

## What was generated, and with what

- **Models.** Anthropic Claude, used through Claude Code: Claude Opus 4.8 for
  the August 2026 work, Claude Opus 5.5 for the October 2026 work.
- **Scale.** Of the 117 non-merge commits up to the v1.7.0 tag, 107 (91%)
  were written with Claude and carry a `Co-Authored-By: Claude …` trailer naming
  the model. Most of v1.2 to v1.7, released on 2026-10-19, was implemented by
  Claude Code sessions directed by the maintainer, often several in parallel.
- **What the maintainer did.** Set the direction and requirements, made the
  design and security decisions, reviewed and approved changes, handled
  everything that needs a human account (npm 2FA approvals, signing keys,
  repository settings), and decided what to merge and release.
- **Documentation.** Most docs, including the README, the methodology, and this
  page, were drafted with Claude and edited by the maintainer.
- **Outside contributions.** Contributions from other people (for example
  [#20](https://github.com/danoszz/penthera/pull/20) by Nurana Aliyeva) are their
  own; check each pull request for its own disclosure.

## How generated work is checked

Generated code is treated as untrusted until it passes the same gates as any
other change:

- the full test suite, plus CodeQL and OpenSSF Scorecard on every pull request;
- the [internal audit](internal-audit.md) before every release: benchmark drift,
  a self-scan, packaging, offline egress, supply chain, and docs links;
- an independent review pass. For example, a read-only review on 2026-10-19
  found three high-severity bugs, which were reproduced and fixed with
  regression tests before release (see the 1.6.0 changelog);
- maintainer approval of every release with 2FA. Rule packs are signed with the
  maintainer's own key, which never leaves his machine.

The maintainer is accountable for the code and must be able to explain any part
of it. If you find something nobody can explain, that is a bug: please open an
issue.

## Licensing and copyright

Penthera is MIT-licensed. Under current EU interpretation, purely AI-generated
output may not be protected by copyright. The parts of Penthera that are
generated are therefore best treated as freely usable. This does not restrict
anyone's use of the project. We check that generated code does not reproduce
third-party code under incompatible terms, and the dependency tree is kept
minimal (one runtime dependency).

## Rules from now on

Every AI-assisted commit names the model and version in its trailer and
summarises how AI was used. Commits that are entirely human-written carry no AI
trailer. See [CONTRIBUTING.md](../CONTRIBUTING.md#use-of-generative-ai) for the
exact format, which applies to the maintainer and to all contributors.

Work *on* generative AI inside Penthera (for example, the local-model fix
proposals in the [2.0 vision](vision-2.0.md)) is described openly in the
roadmap. In Penthera, models only propose; deterministic checks decide.

## Prompt and session logs

For grant-funded milestones, the prompts and outputs behind generated code are
logged and published in a stable place, as NLnet's policy requires. The default
place is `docs/genai-logs/` in this repository, or the commit message itself for
short exchanges. Work done before any grant (up to v1.7.0) is covered by the
commit trailers and this description; full session logs for it were not kept
in public form.
