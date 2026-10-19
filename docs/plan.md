# Plan to v2.0

How Penthera gets from "many features, shipped fast" to a tool a team can rely
on without thinking about it. Written 2026-10-19. The [roadmap](../ROADMAP.md)
says *what* ships; this says *how well*, and in what order.

Penthera is maintained part-time alongside a PhD, so the plan is built around
small, finishable pieces and automation that keeps quality from depending on
anyone's free evenings.

## The problem we solve

Teams ship apps and AI agents faster than anyone can secure them. Penthera is
the open-source security team for teams that don't have one, in three moments:

1. **Before you deploy.** Test the app on localhost or a preview URL, fix what
   it finds on a local branch, and prove the fix.
2. **What you build with.** Vet dependencies, installs, and AI tooling (skills,
   MCP servers, hooks) before they get access to your machine and credentials.
3. **After you ship.** Keep watching your own production for drift, and produce
   the reports and evidence that customers and regulators ask for.

All of it local, deterministic, and free. Anything that doesn't serve one of
these three moments is out of scope.

## Milestones

| Release | Theme | Done when |
|---------|-------|-----------|
| v1.5.0 | AI apps and compliance | Tagged with the pre-commit hook, license policy, CRA helper and AI-BOM; held back from npm and shipped inside 1.6.0 |
| v1.6.0 | Hardening and the rest of AI apps | Released with the 360 security review fixes, Python `deps`, the internal audit gate and the dashboard. Signed rule packs follow once the maintainer's key is set up |
| v1.7.0 | One view, one command | The single-view dashboard, the `npx penthera` setup wizard, and an APA-cited methodology. Released |
| Next | Before you deploy | `penthera ship` and preview-deployment scanning work on a real Vercel and Netlify project |
| After that | After you ship | `penthera watch` runs weekly on three real production apps for a month without a false alarm anyone complained about |
| v2.0.0 | Stable | Public interfaces frozen (CLI flags, JSON report schema, policy file, rule-pack format), documented, and covered by compatibility tests |

## What "perfect" means, concretely

Quality is measured, not felt. Each item below has a gate that the internal
audit (`npm run audit:internal`) or CI checks automatically.

### 1. Accuracy
- Benchmark precision and recall never drop between releases (the audit fails
  on a drop of more than 0.02).
- Expand the benchmark beyond the mock server: OWASP Juice Shop, crAPI, a
  deliberately vulnerable Next.js app, and fixture sets for `agents` and `deps`.
- Every false positive reported by a user becomes a regression test before it
  is fixed.

### 2. First-run experience
- From `npx penthera` to a useful result in under two minutes on a fresh Next.js
  or Express app, measured on a clean machine each release.
- Every error message says what happened and what to do next. No stack traces
  for expected failures.
- Works on macOS, Linux, and Windows (add a Windows CI job; the symlinked Cursor
  skill and path handling are the known risks).

### 3. Documentation
- The README stays a front page: problem, what it does, install, trust. Feature
  detail moves into a docs site (`docs/`), one page per command, each with a
  copy-paste example and its real output.
- Every command's `--help` and its docs page are generated from or tested
  against the same source, so they never drift.

### 4. Stability of interfaces
- A versioned JSON schema for reports, the policy file, and rule packs, checked
  in CI.
- A deprecation policy: one minor release of warnings before anything breaks.

### 5. Security of Penthera itself
- Self-scan clean on every release (`--repo`, `agents`, `deps`, the dashboard).
- Anything that parses untrusted input (packages, configs, scan responses, rule
  packs) has a fuzz or hostile-input test. The ReDoS fixed in `deps` is the
  reason why.
- An external review before v2.0: ask an academic security group or a volunteer
  from the OWASP community to look at the fix loop, the install firewall, and
  the dashboard, the three parts that write files or run commands.

### 6. Real-world proof
- Three pilot projects (friendly teams, a student project, one of the
  maintainer's own) run Penthera before each deploy for a month. Their feedback
  sets the priorities for the next release.
- Publish what Penthera found and fixed, with permission, as short case studies.

## Working rhythm

- One release every two to three weeks, each with a single theme.
- The internal audit runs weekly and before every tag; a red audit blocks the
  release.
- Issues labelled `good first issue` are kept stocked (three to five open at a
  time), so contributors can help without needing the maintainer's time.
- Anything that needs judgement (a new probe that sends payloads, anything
  touching third parties) gets a short design note in `docs/` before code.

## Explicitly not doing

- A hosted service, telemetry, or an update channel that fetches rules at run
  time.
- Offensive tooling for targets the user does not own, and attack-payload
  generation for AI systems.
- An LLM as the judge of what is malicious. Models may help write fixes,
  locally, and always labelled as such.
