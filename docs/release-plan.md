# Release plan: v1.2.0 → v1.4.0

The engineering plan behind the [roadmap](../ROADMAP.md): what ships in each
release, in what order, what each piece depends on, and how we know it is done.
Dates are targets, not promises. Building is fast; review, real-world testing,
and the 2FA release approval set the pace.

Written 2026-10-19.

## The bet

Two releases that move Penthera from "a good scanner" to a system that competes
with commercial supply-chain and AppSec platforms on their core value, while
keeping what they cannot copy: local, deterministic, explainable, no telemetry.

| Commercial platforms sell | Penthera answers with | Release |
|---------------------------|-----------------------|---------|
| Dependency capability alerts and upgrade diffs | `penthera deps` and `deps --diff` | v1.3.0 |
| Skill, extension, and MCP scanning | `penthera agents` and `penthera.lock` | v1.3.0 |
| PR comments on dependency changes | GitHub Action that comments the capability diff | v1.4.0 |
| An install firewall | `penthera install`: check before install scripts run | v1.4.0 |
| Auto-fix PRs | A local scan → fix → verify → learn loop that never pushes | v1.4.0 |
| Proof that it works | Published methodology, verified citations, a benchmark | v1.3.0 |

## Timeline at a glance

| When | Milestone |
|------|-----------|
| Oct 19–20 | v1.2.0 live on npm (2FA approval), old npm token deleted |
| Oct 20–22 | v1.3.0 PRs merged in order, release staged |
| Oct 23 | v1.3.0 live, launch write-up published |
| Oct 23–30 | v1.4.0 wave 1: HTTP client and egress guard, learning store, fix recipes, install firewall |
| Oct 30–Nov 6 | v1.4.0 wave 2: agent loop, custom reports, PR-comment Action |
| Nov 6–10 | Release gate: real-app test, benchmark diff, security review |
| Nov 10 | v1.4.0 live |
| From Nov 16 | Internal testing audit, landing page (see "Scheduled for later") |
| December | v1.5.0 (staged on the roadmap) |

---

## v1.2.0: finish the release

| Step | Owner | Done when |
|------|-------|-----------|
| Approve the staged version on npmjs.com (Staged Packages, 2FA) | Maintainer | `npm view penthera version` is 1.2.0 with provenance |
| Delete the `NPM_TOKEN` repository secret | Maintainer | Secret gone; publishing is OIDC-only |
| Decide Dependabot #11 (`setup-node` v6 → v7) | Maintainer + CI | v7 changes how `NODE_AUTH_TOKEN` is handled. With no token left this is likely safe, but merge it only with a dry-run of `publish.yml` (`npm stage publish --dry-run`) on a branch first |

## v1.3.0 "AI toolchain": target Oct 22, live Oct 23

All four pieces are already built or in progress. The work is review and merge
order, because three of them touch `src/cli.js`, the README, and the CHANGELOG.

**Merge order:**

1. **#12 `penthera agents`.** Offline audit of `.mcp.json`, `~/.claude`,
   `~/.cursor`, hooks, plugins, skills, and rule files. Includes the
   hidden-content engine, `penthera.lock`, an A–F grade, and OWASP MCP / Agentic
   mapping. Rebase on main, review, merge.
2. **Research and methodology.** `docs/METHODOLOGY.md`, verified
   `references.bib`, per-finding citations in Markdown and SARIF,
   `CITATION.cff`, an offline benchmark with precision and recall. Rebase
   after #12 (both touch the reporters).
3. **`penthera deps`.** Static capability detection on `node_modules`,
   `--diff` between lockfiles, typosquat check against a vendored list, and an
   opt-in `--online` registry check. Rebase after the research PR.
4. **Funding pack.** Docs only, any order.

**Also in v1.3.0:**

| Item | Why | Size |
|------|-----|------|
| Bump to 1.3.0 everywhere, CHANGELOG, tag, approve | Release | S |
| Launch write-up: an offline audit of popular public skills and MCP servers with `penthera agents` | The post that earns attention. Read-only analysis of public repos, findings reported to authors privately first | M |

**Release gate:** `npm test` green, benchmark numbers in `bench/RESULTS.md` no
worse than v1.2.0, `penthera agents` and `penthera deps` run cleanly on this
repo, every citation verified.

## v1.4.0 "Local loop + competitive": target Nov 10

### Wave 1 (parallel, Oct 23–30)

Each workstream owns different files, so they can be built side by side.

**W1. One HTTP client, `--offline` egress guard, User-Agent, inconclusive probes**
- Every network call goes through `src/utils/http.js`. Today `crawler`,
  `injections`, `fuzzer`, `templates`, `recon`, `params`, `retirejs`, and
  `adaptive-probes` each build their own fetch wrapper.
- `--offline`: the client refuses any host other than the scan target. Recon
  sources (crt.sh, Wayback, OTX) become explicit opt-ins.
- Vendor a Retire.js database snapshot, refreshed by a release script, so JS
  CVE checks work offline.
- Send `penthera/<version> (+repo url)` as the User-Agent (closes #7).
- Probe errors are recorded and reported as "inconclusive" instead of passing
  silently (closes #8).
- While rewriting `lib/injections.js` and `lib/fuzzer.js`: an honest header,
  and payload strings moved into a clearly named data file. Socket's AI judge
  flagged Penthera as malware for containing test payloads; this gives any
  reviewer the context a snippet lacks. Then ask Socket to review the alert.
- **Done when:** a test that blocks all egress except the target passes for
  every profile, and the vendored database matches upstream at release time.

**W2. Local learning store**
- `~/.penthera/memory/<project-hash>/events.jsonl`: append-only; each event
  carries the hash of the previous one.
- Events: scan summary, fix applied (recipe, diff hash), fix verified or
  failed, false positive suppressed (fingerprint, reason), probe yield per
  stack.
- Derived views: recipe success rate per framework, active suppressions,
  probe ranking. Used only to re-rank and suppress; never executes anything.
- `penthera memory show | verify | forget`. `verify` detects any edit to the
  chain.
- Never read from the scanned repo. A suppression committed to a repo is shown
  in the report as "suppressed by repo file" so a reviewer sees it.
- **Done when:** tampering with any line fails `verify`, and suppressions and
  re-ranking are covered by tests.

**W3. Fix recipes**
- `lib/fix/`: deterministic codemods that produce a unified diff for the most
  common findings:
  - security headers for Next.js, Express (helmet), Fastify, and Hono;
  - cookie flags;
  - a CORS allowlist;
  - a rate-limit stub on auth routes;
  - moving a hardcoded secret to an environment variable, with "rotate it" as
    an owner action.
- Framework detection reuses `lib/whitebox/frameworks.js`.
- Optional local model adapter (Ollama on localhost, enforced by W1) for
  findings without a recipe. Its output is labelled "model-suggested,
  needs-human-review".
- **Done when:** each recipe has before/after fixtures, and every produced diff
  applies cleanly and makes its finding disappear on re-scan in the fixture app.

**W4. Install firewall**
- `penthera install [pkg...]`: resolve the dependency tree with scripts
  disabled, run the `deps` capability diff against the current lockfile, show
  what is new (install scripts, network, shell, env), and only then run the
  real install, either after a prompt or under a policy file
  (`penthera.policy.json`).
- **Done when:** a fixture package that gains an install script is stopped
  before its script runs.

### Wave 2 (Oct 30–Nov 6)

**W5. Agent loop: `penthera agent --loop`** (depends on W1, W2, W3)
- State machine: scan → triage (ranked by memory) → plan (recipe or model
  suggestion) → patch on a local branch `penthera/fix-<date>` → verify
  (re-scan, plus the project's tests if present) → learn → repeat.
- Stops when nothing fixable remains or `--max-iterations` is reached.
- Every diff needs approval by default. `--auto low` auto-applies only
  recipes with a verified success history in memory.
- Hard guarantees, each with a test:
  - never pushes, never opens pull requests, never calls a remote;
  - egress is limited to the target;
  - the working tree must be clean before it starts.
- **Done when:** on the fixture app the loop takes the findings to zero in a
  bounded number of iterations, and a second run is faster because memory
  re-ranked the recipes.

**W6. Custom reports and evidence bundle** (depends on W2)
- Audience templates: developer, owner, auditor. User templates via
  `--report-template file.md` with a small placeholder syntax that evaluates
  no code.
- Loop timeline: found → fixed → verified, with time-to-fix from memory.
- `--evidence <dir>`: reports plus a `manifest.json` with the SHA-256 of
  every artifact. Optional signing with a local SSH key
  (`ssh-keygen -Y sign`), no new dependency.
- **Done when:** an auditor can verify a bundle with one documented command.

**W7. PR-comment GitHub Action** (depends on `deps` from v1.3.0)
- A composite action published from this repo: on PRs that change a lockfile
  it runs `penthera deps --diff` against the base branch, posts or updates a
  single comment ("2 packages gained network access, 1 new install script"),
  and uploads SARIF.
- Pinned by SHA in the docs; no secrets needed beyond the default token.
- **Done when:** it runs on a test PR in this repo and the comment updates in
  place on a new push.

**W8. Skill and docs**
- SKILL.md workflow "scan and fix" uses `penthera agent`.
- `docs/local-loop.md` explains the threat model: why nothing leaves the
  machine, why the store is hash-chained, why rules never update at runtime.

### Release gate (Nov 6–10)

- Run the loop on one real app the maintainer owns, not only fixtures.
- Benchmark: precision and recall no worse than v1.3.0.
- Self-scan with `penthera --repo .`, `penthera agents`, and `penthera deps`:
  no new high findings.
- Security review of the diff since v1.3.0, focused on the loop and the
  firewall (they run commands and write code).
- Then bump to 1.4.0, tag, approve.

## Risks

| Risk | Mitigation |
|------|------------|
| Three PRs conflict in `src/cli.js` | Strict merge order, rebase each after the previous one lands. Consider splitting subcommands into `src/commands/` early in v1.4.0 |
| Fix recipes break someone's app | Diffs only, approval by default, verify by re-scan and tests, a local branch only |
| The learning store becomes an attack surface | Home directory only, hash chain, re-rank and suppress only, nothing executable |
| Install firewall false positives annoy users | Show the capability diff, not a verdict; a policy file to allow known packages |
| Another AI-judge false positive on new modules | Honest headers, payloads in data files, Socket review requested |

---

## Scheduled for later (from Nov 16)

**Internal testing audit.** A standing quality gate run before every release:
- Penthera against itself and a fixed set of deliberately vulnerable apps
  (mock server, OWASP Juice Shop, crAPI).
- `agents` and `deps` against fixture configs.
- A diff of results against the previous release, with false positives and
  false negatives triaged into issues.
- A scheduled weekly run, so drift shows up between releases.
- The results feed `bench/RESULTS.md`.

**Landing page.** A one-page site: what it does, the 30-second install, the
trust story (offline, staged releases, methodology, benchmark), and links to
the docs. Static, hosted on GitHub Pages, with no tracking scripts, in keeping
with the no-telemetry principle.

## v1.5.0 and beyond

Staged on the [roadmap](../ROADMAP.md): LLM endpoint probes, OWASP LLM
mapping, the CRA Article 14 helper, the AI-BOM, a pre-commit hook, license
policy, and signed rule packs. After that: the local dashboard (`penthera ui`)
and a team pack.
