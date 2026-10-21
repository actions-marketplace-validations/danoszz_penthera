# What Penthera is, what it is not, and why

> **Project page.** For "why was it built this way?"

This page states plainly what Penthera does today, the decisions behind it, and
the questions people ask. It is written to be argued with. If you think a
decision is wrong, [open a discussion](https://github.com/danoszz/penthera/discussions)
with the label "challenge": say which decision, what you would do instead, and
what evidence would settle it. Decisions here change when the evidence does.

Written 2026-10-19, for v1.7.0. What we plan to measure next is in the
[research plan](vision-2.0.md).

## What Penthera is today

Penthera is an open R&D project with two parts. One is a security agent you
can run today, offline, on your own machine. The other is a set of public,
pre-registered experiments that measure how well its checks work (Penthera
Bench, E1 to E6 in the [research plan](vision-2.0.md)).

The agent does the routine, repeatable checks a security engineer would do:

- **Before you deploy:** scans your running app (localhost or a preview URL) and
  your source for common weaknesses, fixes what it can on a local branch, and
  re-scans to prove each fix.
- **What you build with:** shows what each dependency can do (shell, network,
  install scripts), stops risky installs before they run, and audits your AI
  tooling: skills, MCP servers, hooks, and agent instruction files.
- **After you ship:** writes reports for developers, owners, and auditors, a
  signed evidence bundle, and NIS2 and CRA readiness drafts.

### The honest limits

- **It finds known classes of problems, not novel ones.** Misconfigured
  headers, leaked keys, risky dependency behavior, unsafe agent setups, common
  injection patterns. It does not find business-logic flaws, complex
  authorization bugs, or zero-days. It is not a replacement for a human
  penetration test.
- **Its accuracy is measured, but on a small sample.** The benchmark reports
  precision 0.88 and recall 0.91, but on 24 scored findings in labs we built
  ourselves. The 95% confidence intervals are wide: precision 0.69 to 0.96,
  recall 0.73 to 0.98 (Wilson). Real-world accuracy on other people's code is
  not yet measured. Closing that gap is the first goal of the
  [research plan](vision-2.0.md) (experiment E1).
- **"Agent" means a loop with guard rails, not an autonomous AI.**
  `penthera agent --loop` scans, plans a fix, applies it on a local branch,
  verifies it, and records the outcome. It asks before every change by
  default, never pushes, and only talks to the target you named. It cannot
  edit the tests, CI or settings that judge its fixes, and "could not fix" is
  an accepted outcome, not a failure to work around. See
  [what the 2026 agent incidents mean for Penthera](research/agent-incidents-2026.md).
- **"Learning" means bookkeeping, not machine learning.** The local memory
  counts which fix recipes worked for which framework, which findings you marked
  as false positives, and which probes found things. It re-orders and
  suppresses. It does not train a model.
- **AI is optional and never the judge.** A local model (through Ollama) can
  propose a fix when no built-in recipe exists. The fix is accepted only if the
  deterministic re-scan and your tests agree. No model decides whether
  something is malicious or safe.

## Design decisions

Each decision lists what we chose, why, what it costs, and what would change our
mind.

### 1. Local first, offline by default
- **Choice.** Everything runs on your machine. `--offline` limits traffic to
  the target you named, and every report lists the hosts that were contacted.
  No account, no telemetry.
- **Why.** A security tool reads your code, your keys, and your agent setup. The
  safest place for that is where it already is.
- **Cost.** No cross-customer intelligence, no instant threat feed, and slower
  improvement because we cannot see how it is used.
- **What would change our mind.** Evidence that users are measurably less safe
  without an online feature, and a design for it that is opt-in and leaks
  nothing about their code.

### 2. Deterministic rules decide; models may only propose
- **Choice.** Findings come from readable rules with evidence at `file:line`.
  Models can suggest fixes and, in future, rank or score, but a deterministic
  check has the final word.
- **Why.** Rules can be read, tested, and reproduced. Published research shows
  scanners built on LLM judges can be talked out of a finding, and one such
  judge labeled Penthera itself as malware because it contains test payloads.
- **Cost.** Rules miss what nobody wrote a rule for. Models generalize better.
- **What would change our mind.** A pre-registered experiment where a model-based
  verdict beats rules on precision and recall, *and* stays robust under
  adversarial inputs (see experiment E5 in the research plan).

### 3. No runtime update channel
- **Choice.** Detection rules ship inside reviewed, signed releases. Penthera
  never downloads rules or code while it runs.
- **Why.** An update channel is a way into every machine that runs the tool.
  The release path is already signed, provenance-checked, and approved with
  2FA.
- **Cost.** A new indicator of compromise reaches you when you upgrade, not
  within the hour.
- **What would change our mind.** A channel with the same guarantees (signed
  metadata, key rotation, freshness) that users can audit and switch off.

### 4. Ask before changing anything
- **Choice.** Every fix is a diff you approve, on a local branch. Penthera never
  pushes or opens pull requests.
- **Why.** Code changes have consequences a scanner cannot see. Trust is earned
  per change.
- **Cost.** Slower than fully autonomous fixing.
- **What would change our mind.** A recipe that has been verified many times in
  your own memory can already apply itself (`--auto low`). Wider autonomy needs
  the same track record.

### 5. Authorized targets only, non-destructive by default
- **Choice.** The default scan sends no attack payloads. Payload testing is
  opt-in. Anything that touches a third party is passive.
- **Why.** The same tool that hardens a system can harm someone else's.
- **Cost.** A shallower default scan.
- **What would change our mind.** Nothing. This one is not up for a trade.

### 6. Free and complete on one machine
- **Choice.** The single-machine tool is MIT-licensed and complete. Anything
  paid in future (a team server, faster signed rule packs) is additive and never
  removes a local feature.
- **Why.** The people most exposed (solo builders, small teams, students) are
  the ones least able to pay.
- **Cost.** Slower funding, a part-time maintainer.

### 7. Honest about confidence
- **Choice.** Every finding carries a confidence label (confirmed, likely,
  potential, needs human review) and its provenance. Benchmarks report
  intervals, not just point estimates.
- **Why.** A heuristic dressed as certainty causes alert fatigue and false
  comfort.

## FAQ

**Is Penthera an AI security agent?**
It is an agent in the engineering sense: a loop that acts, checks its own work,
and remembers outcomes, inside strict limits. It is not an AI that decides on
its own. AI models are optional helpers for proposing fixes.

**Does it use machine learning, reinforcement learning, or deep learning?**
Not yet. The memory is counting, not training. The [research plan](vision-2.0.md)
adds light reinforcement learning (bandits) for choosing what to try first, a
classical classifier for suspicious packages, and model-proposed fixes checked
by the scanner. Each one has to beat the current rules in a pre-registered
experiment before it ships.

**Can it run fully autonomously?**
It can run unattended in read-only mode (scans, reports, evidence) in CI. It
does not change code unattended, except recipes with a proven record in your own
memory, and only when you allow it.

**Which models can it use?**
Today, any local model served by [Ollama](https://ollama.com) on `127.0.0.1`,
and only for fix proposals. Planned: other local runtimes (llama.cpp, MLX on
Apple silicon) and small open-weight models for embeddings and fixes. Hosted
models, including fast structured-decision models such as Typesafe's Jev, are
interesting for calibrated triage, but they send data off your machine. They
would only ever be opt-in, clearly labeled, and evaluated against the local
baseline first.

**Why not use an LLM to judge whether code is malicious?**
Because a judge that can be persuaded is a judge an attacker will persuade.
Models are useful to *propose*; something deterministic has to *verify*.

**How accurate is it?**
On our own benchmark: precision 0.88, recall 0.91, on a small sample with wide
intervals (see above). Measuring accuracy on real-world code is the first
experiment in the research plan (E1).

**Is it a replacement for a penetration test or a security team?**
No. It covers the routine checks so people can spend their time on the work
that needs judgment.

**Why open source?**
Security tools should be open to inspection. Outside reviewers find mistakes
faster than one maintainer does. And the people who need it most cannot always
pay.

**Will there be a hosted version?**
Maybe, for teams, later. If it exists, it will not remove anything from the
local tool. See [ROADMAP.md](../ROADMAP.md).

**How do I challenge a decision?**
Open a [discussion](https://github.com/danoszz/penthera/discussions) labeled
"challenge". The best challenges come with a proposed experiment: what you
would measure and what result would prove you right.
