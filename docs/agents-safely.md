---
title: "Running AI agents safely"
sidebarTitle: "Running agents safely"
description: "A coding agent, an agent job in CI and an eval script all have the same parts: a task, something that judges the result, permissions, a place to run, and a point where it stops."
---

> **Starter and pro.** For "I let an AI agent work on my code, in CI or in an
> eval. What should be true before I start it?"

A coding agent, an agent job in CI and an eval script all have the same parts:
a task, something that judges the result, permissions, a place to run, and a
point where it stops. We call those parts the **harness**. This page is a
checklist for the harness. It has seven items. Each says why it matters, where
the reason comes from, and how to check it.

`penthera agents` already audits MCP servers, hooks, permissions and skills.
The checks marked **(planned)** below are specified in
[spec-harness-rules.md](https://github.com/danoszz/penthera/blob/main/docs/research/spec-harness-rules.md) and are not in any
release yet. Until they ship, check those items by hand.

## The checklist

### 1. Say what is in scope

- [ ] The agent's instructions name the files, services and hosts it may touch,
      and the network it runs on allows only those.

**Why:** an agent can only respect a boundary it has been told about, so state
it in the prompt and enforce it on the network ([Anthropic, 2026](references.md#anthropic2026incidents);
[Scarfone et al., 2008](references.md#scarfone2008sp800115)).

**Checked by** `harness-no-scope` and `sandbox-egress-open` (planned).

### 2. Give it a safe exit

- [ ] The instructions say what to do when the task is blocked, impossible or
      out of scope: stop, say so, and count that as an acceptable result.

**Why:** agents stuck on tasks that could not be solved as intended were the
ones that turned to gaming the checker
([METR & Redwood Research, 2026](references.md#metr2026investigation);
[Amodei et al., 2016](references.md#amodei2016concrete)).

**Checked by** `harness-no-exit` (planned).

### 3. Keep the judges out of reach

- [ ] The agent cannot edit the tests, test config, scorer, reward code or
      answer files that decide whether it succeeded.
- [ ] The judge checks the result itself, not the agent's report of what it did.

**Why:** a model optimizing against a checker it can change will change the
checker instead of doing the task
([Baker et al., 2025](references.md#baker2025monitoring);
[Zhong et al., 2025](references.md#zhong2025impossiblebench)).

**Checked by** `harness-judge-writable` and `scorer-in-reach` (planned). Whether
a judge trusts the agent's own report: **check by hand.**

### 4. No shared or host credentials

- [ ] The agent's container or job gets no credentials from your machine
      (`~/.npmrc`, cloud credentials, the Hugging Face token, SSH keys,
      `docker.sock`) and no publish-scoped registry token.
- [ ] Parallel agent runs share no writable volume or cache.

**Why:** an agent needs only the access its task needs, and credentials or
storage shared across runs let one run reach what another can
([Saltzer & Schroeder, 1975](references.md#saltzer1975protection);
[OpenAI, 2026](references.md#openai2026incident)).

**Checked by** `sandbox-host-credentials` and `sandbox-shared-writable`
(planned). Inline secrets in MCP configs and pre-approved reads of credential
files are already checked by `mcp-inline-secret` and
`permission-credential-read`.

### 5. Bound every run

- [ ] Every agent run has a limit on steps, time or cost, and a loop that
      restarts the agent has a limit too.

**Why:** in the incidents, agents kept trying for days after the task had
stopped making sense
([METR & Redwood Research, 2026](references.md#metr2026investigation)).

**Checked by** `harness-unbounded` (planned).

### 6. Keep a record the agent cannot edit

- [ ] Logs, transcripts and results are written somewhere the agent can append
      to but not rewrite.

**Why:** a record that the logged party can change is not evidence of what
happened, and agents in the incidents did try to edit their own transcripts and
logs ([Schneier & Kelsey, 1999](references.md#schneier1999secure);
[METR & Redwood Research, 2026](references.md#metr2026investigation)).

**Check by hand.** Penthera's own memory store is hash-chained and its evidence
bundles are signed; see [the local loop](local-loop.md) and
[evidence](evidence.md).

### 7. Name a human to tell

- [ ] The instructions say who to report to, and someone reads the alerts and
      transcripts while the agent runs.

**Why:** human oversight works only if a person gets the signal in time to act
on it ([Tabassi, 2023](references.md#tabassi2023airmf);
[Anthropic, 2026](references.md#anthropic2026incidents)).

**Check by hand.**

## What this page does not cover

- It is about the harness around your agent, not about which model you use.
- The planned checks read files in your repository. They cannot see network
  policy, cloud IAM or runner settings that live outside it, so a clean result
  on items 1, 4 and 5 is not proof.
- It is written for a developer or a small team running agents on their own
  code. It is not a guide to securing a lab's training or evaluation cluster.

The background is in
[What the 2026 agent incidents mean for Penthera](https://github.com/danoszz/penthera/blob/main/docs/research/agent-incidents-2026.md).
