# Spec: harness, sandbox and scorer rules for `penthera agents`

> **Project page.** For "what exactly would the planned harness checks read,
> match and report, and can each one be deterministic?"

| | |
|---|---|
| Status | **Draft for review. No rule code until the maintainer approves this spec.** |
| Date written | 2026-10-20 |
| Source | [agent-incidents-2026.md](agent-incidents-2026.md), "Harness audit" |
| Checklist it backs | [agents-safely.md](../agents-safely.md) |
| Release | Not 1.8.0 (feature freeze). Earliest 1.9 |

## Summary

Ten rules were proposed. This spec keeps **eight**, merges **one** into
another, and proposes **dropping one** as a rule:

| Rule | Verdict | Severity | Confidence |
|---|---|---|---|
| `harness-judge-writable` | Keep | medium | likely |
| `harness-no-exit` | Keep | low | needs-human-review |
| `harness-no-scope` | Keep | low | needs-human-review |
| `harness-unbounded` | Keep | medium | likely |
| `sandbox-egress-open` | Keep, confidence lowered to `potential` | medium (low in CI) | potential |
| `sandbox-host-credentials` | Keep | high | confirmed |
| `sandbox-shared-writable` | Keep, Compose only | medium | likely |
| `scorer-in-reach` | Keep, needs a declared harness | high | confirmed (declared) |
| `scorer-guessable-answer` | **Merge** into `scorer-in-reach` | | |
| `scorer-trusts-agent` | **Drop as a rule**; "check by hand" item | | |

Reasons for the merge and the drop are in their sections. Every kept rule is a
pure function over parsed files: same files in, same findings out, no network,
no model, nothing executed.

## Where the code would live

Today, [`lib/agents/discover.js`](../../lib/agents/discover.js) builds an
inventory of instruction files, settings and permissions, hooks, MCP servers,
skills and plugins. [`lib/agents/rules.js`](../../lib/agents/rules.js) holds pure
check functions over that inventory, and
[`lib/agents/index.js`](../../lib/agents/index.js) runs them and turns hits into
findings with `toFinding`, which already accepts a per-hit `confidence`.

What the inventory does **not** read today, and these rules need:

| New inventory field | Files | Parser |
|---|---|---|
| `devcontainers` | `.devcontainer.json`, `.devcontainer/devcontainer.json`, `.devcontainer/*/devcontainer.json` | `parseJsonc` (exists) |
| `composeFiles` | `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`, `docker-compose.*.yml` at the root and in `.devcontainer/` | `yaml` (already a dependency) |
| `workflows` | `.github/workflows/*.yml`, `.github/workflows/*.yaml` | `yaml` |
| `harness` | the `harness` block of `penthera.policy.json` (below) | JSON |

Proposed layout:

- `lib/agents/discover.js`: the four fields above, bounded by the existing
  `MAX_FILE_BYTES` and `walk` limits.
- `lib/agents/agent-runs.js` (new, about 80 lines): decide which devcontainers,
  Compose services and workflow steps **run an agent**. Every sandbox rule
  depends on this, so it is one shared, tested function (see
  [Detecting an agent run](#detecting-an-agent-run)).
- `lib/agents/harness.js` (new): `harness-*` and `scorer-*` checks.
- `lib/agents/sandbox.js` (new): `sandbox-*` checks.
- `lib/agents/index.js`: call the new checks inside `eachChecked`, so one bad
  file is reported as `config-unparsed` and does not stop the audit.
- `lib/agents/owasp.js`: mappings, proposed below, checked against the
  published OWASP lists at implementation time.
- `lib/install/policy.js`: `normalizePolicy` rejects unknown fields today, so
  the `harness` key must be added to its `known` list and validated there.

Fixtures go in `tests/fixtures/agents/harness/<rule>/{pos-1,pos-2,neg-1,neg-2}/`,
next to the existing `clean` and `malicious` fixtures, with one test per
fixture in `tests/agents.test.js`.

## Shared definitions

### Detecting an agent run

A **known agent CLI** is a command whose first token (after `npx`, `bunx`,
`pnpm dlx` or `uvx`, reusing `runnerPackage` from `rules.js`) is one of a fixed
list kept in `agent-runs.js`, for example `claude`, `codex`, `gemini`,
`aider`, `opencode`, `cursor-agent`, `goose`, and `penthera agent`. A **known
agent action** is a GitHub Action whose `uses:` owner/name is on a second fixed
list (for example `anthropics/claude-code-action`). Both lists are data, not
patterns; each entry is checked against the vendor's docs when it is added.

| Where | Counts as an agent run when |
|---|---|
| Workflow step | `uses:` is a known agent action, or `run:` contains a known agent CLI as a command (start of a line or after `&&`, `;`, `\|`) |
| Workflow job | It contains at least one agent step |
| Compose service | `command`, `entrypoint` or `image` names a known agent CLI or image, or the service has the label `penthera.agent: "true"` |
| Devcontainer | `features` includes a known agent feature, or `postCreateCommand` / `postStartCommand` installs or runs a known agent CLI, **or** the repo has any agent config that `discover.js` already finds |

The last devcontainer clause is deliberate: a repository with `AGENTS.md` or
`.claude/settings.json` and a devcontainer is one where an agent will most
likely run in that container. It is also the main source of false positives
for the sandbox rules, and the finding text says which clause matched.

### Judge paths

The **judge paths** of a repository are the files that decide whether an
agent succeeded. Without a declared harness they are, by convention:

- test files: `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/spec/**`,
  `**/*.test.*`, `**/*.spec.*`, `**/*_test.go`, `**/test_*.py`, `**/*_test.py`,
  `**/conftest.py`;
- test config: `jest.config.*`, `vitest.config.*`, `playwright.config.*`,
  `pytest.ini`, `tox.ini`, `setup.cfg` (`[tool:pytest]`), `pyproject.toml`
  (`[tool.pytest.*]`), `.mocharc.*`, `karma.conf.*`;
- the `scripts.test` entry of `package.json` (the file is a judge path only for
  that key; see `harness-judge-writable`);
- CI: `.github/workflows/**`;
- Penthera's own: `penthera.policy.json`, `penthera.lock`, the baseline and
  suppressions.

A declared harness (next section) replaces the conventions with its own list.

### Declared harness

Eval and RL harnesses have no common layout, so two rules (`scorer-in-reach`
and, optionally, `harness-judge-writable`) read an explicit declaration in
`penthera.policy.json`:

```json
{
  "harness": {
    "workspace": ["tasks/*/workspace"],
    "judges": ["graders/**", "tasks/*/tests/**"],
    "answers": ["tasks/*/answer.txt", "tasks/*/flag"],
    "agentServices": ["agent"]
  }
}
```

All four keys are optional arrays of repo-relative globs or Compose service
names. Without a declaration the scorer rules stay silent and the audit says
"no harness declared" once, at `info`.

## The rules

Each rule below gives its inputs, match logic, severity and confidence, two
positive and two negative fixture sketches, and the expected false-positive
risk. Fixture sketches are minimal; the real fixtures add one unrelated file
each so a rule that matches "anything" fails its negative test.

### `harness-judge-writable`

**Question.** Is the agent told to make a check pass while being allowed to
edit that check without asking?

**Inputs.**

- Instruction files from `inv.instructionFiles` (repo scope only).
- `inv.settings[].defaultMode` and `inv.permissions` (`allow`, `deny`) from
  `.claude/settings.json` and `.claude/settings.local.json`.
- Agent steps in `workflows`: the step's `with.allowed_tools`,
  `with.claude_args` or CLI flags (`--allowedTools`,
  `--dangerously-skip-permissions`, `--permission-mode`), and the later steps
  of the same job.

**Match.** Two paths, either one fires.

1. *Local agent.* An instruction file contains a **pass goal**: a line matching
   `\b(make|get|keep)\b.{0,40}\b(tests?|checks?|ci|build)\b.{0,20}\b(pass|green)\b`
   or `\buntil\b.{0,30}\b(tests?|checks?)\b.{0,10}\bpass`, case-insensitive.
   **And** edits to judge paths are pre-approved: `defaultMode` is
   `acceptEdits` or `bypassPermissions`, or an `allow` rule is `Edit`, `Write`,
   `MultiEdit`, `Edit(*)`, `Edit(**)` or a glob that covers a judge path.
   **And** no `deny` rule covers the judge paths (`Edit(tests/**)`,
   `Write(**/*.test.*)` and similar; glob coverage reuses `globToRegExp` from
   `lib/hook/policy.js`).
2. *CI agent.* In one workflow job, an agent step that may edit files (no
   read-only tool list) is followed by a step that runs the test command, from
   the same checkout, with no `git checkout <ref> -- <judge path>` or
   `actions/checkout` step in between.

A pass goal plus an instruction such as "do not edit the tests" still fires,
at `low`: an instruction is not a control.

**Severity and confidence.** `medium`, `likely`. `low` when the instructions
forbid editing tests.

**Fixtures.**

- *pos-1:* `AGENTS.md` says "Fix the bug and make the tests pass.";
  `.claude/settings.json` has `"defaultMode": "acceptEdits"`, no deny.
- *pos-2:* a workflow job runs `anthropics/claude-code-action` with
  `claude_args: --dangerously-skip-permissions`, then `run: npm test`.
- *neg-1:* same as pos-1 plus `"deny": ["Edit(tests/**)", "Write(tests/**)"]`
  and tests only under `tests/`.
- *neg-2:* same as pos-2, but a step between them runs
  `git checkout "$GITHUB_SHA" -- tests/` before `npm test`.

**False-positive risk: medium.** Tasks where writing new tests is the job
("add tests for X and make them pass") match the pass goal. The finding text
says so and suggests a deny rule on the *existing* tests. Judge paths by
convention miss unusual layouts (false negatives), which a declared harness
fixes.

### `harness-no-exit`

**Question.** Do the agent's instructions say what to do when it is blocked?

**Inputs.** Repo-scope instruction files; the `prompt` input of agent action
steps; the argument of `-p` / `--print` for agent CLI steps.

**Match.** At least one of those inputs exists, and **none** of them contains a
**stop phrase**, case-insensitive:

- the marker `<!-- penthera:agents-block` (the block below; exact match);
- `\b(stop|halt|pause)\b.{0,60}\b(report|ask|tell|explain|escalate|say so)\b`;
- `\bif (you are|you're|you get) (blocked|stuck|unable)\b`;
- `\bif you (cannot|can't|can not)\b`;
- `\b(ask|tell|notify) (a|the) (human|user|maintainer|owner)\b`.

One finding per repository, anchored on the first instruction file in
`INSTRUCTION_FILES` order (`AGENTS.md` first), listing every input that was
read.

**Severity and confidence.** `low`, `needs-human-review`. This judges an
absence of wording, so it can only point a person at the file.

**Fixtures.**

- *pos-1:* `AGENTS.md` with build and style instructions only.
- *pos-2:* a workflow agent step with `prompt: "Fix the failing CI job."` and
  no instruction files.
- *neg-1:* `CLAUDE.md` containing "If you are blocked, stop and tell the
  maintainer what you tried."
- *neg-2:* `AGENTS.md` containing the Penthera block (marker included).

**False-positive risk: high,** by design of the confidence label. Paraphrases
outside the phrase list are missed and produce a finding; the fix is one line,
and the finding says which phrases count. It never raises the grade above
`low`.

### `harness-no-scope`

**Question.** Do the instructions say which systems the agent may touch?

**Inputs.** Same as `harness-no-exit`.

**Match.** Inputs exist, and none contains a **scope phrase**:

- the Penthera block marker;
- `\b(in|out of)[ -]scope\b`;
- `\bonly\b.{0,20}\b(touch|modify|edit|change|work (in|on)|access|contact)\b`;
- `\b(do not|don't|never)\b.{0,30}\b(access|contact|touch|modify|connect to)\b.{0,40}\b(outside|other|external|production)\b`;
- `\b(allowed|permitted) (hosts|domains|urls|services|directories)\b`.

**Severity and confidence.** `low`, `needs-human-review`.

**Fixtures.**

- *pos-1:* `AGENTS.md` that describes the stack and commands, nothing about
  limits.
- *pos-2:* `.cursorrules` with style rules only.
- *neg-1:* `AGENTS.md` with "Only change files under `src/` and `tests/`. The
  staging and production hosts are out of scope."
- *neg-2:* `AGENTS.md` with the Penthera block.

**False-positive risk: high,** as for `harness-no-exit`. If reviewers find two
findings noisy, both can be reported as one `harness-missing-guardrails`
finding that lists which lines of the block are missing. That is a reporting
choice and does not change the match logic.

### `harness-unbounded`

**Question.** Can an agent run go on without a step, time or cost limit?

**Inputs.**

- Agent jobs and steps in `workflows`: `timeout-minutes` at job and step level;
  `with.max_turns`, or `--max-turns` inside `with.claude_args`; CLI flags of
  agent commands in `run:` (`--max-turns` and the equivalents on the CLI
  list).
- `run:` blocks and `package.json` `scripts` that restart an agent: an agent
  CLI inside `while true`, `while :`, `until false` or `for ((;;))`.

**Match.**

1. An agent job where **neither** a turn limit is set on the agent step **nor**
   `timeout-minutes` is set at or below the threshold (default 60) on the job
   or step. GitHub's own default of 360 minutes is not counted, because a
   six-hour loop of model calls is the case this rule is for. The threshold is
   a field of the `harness` block (`maxMinutes`).
2. Any restart loop around an agent CLI with no counter, `timeout` wrapper or
   `--max-turns` inside the loop.

**Severity and confidence.** `medium`, `likely`.

**Fixtures.**

- *pos-1:* agent job, no `timeout-minutes`, no turn limit.
- *pos-2:* `package.json` script `"agent:loop": "while true; do claude -p \"$(cat TASK.md)\"; done"`.
- *neg-1:* agent job with `timeout-minutes: 30`.
- *neg-2:* agent job with `claude_args: --max-turns 25` and no timeout.

**False-positive risk: medium.** Jobs bounded by an organization-level runner
policy or a cost cap at the provider look unbounded from the repository. The
finding says that it can see only the repository.

### `sandbox-egress-open`

**Question.** Does an agent run where the network is open to any host?

**Inputs.** Agent devcontainers (`runArgs`, `postCreateCommand`,
`postStartCommand`, `initializeCommand`); agent Compose services (`network_mode`,
`networks` and the top-level `networks.<name>.internal`, `environment`
`HTTP_PROXY` / `HTTPS_PROXY`); agent jobs (steps using
`step-security/harden-runner` and its `egress-policy`).

**Match.** An agent run with **no recognized egress restriction**. Recognized:

- Compose: `network_mode: none`; or every network of the service has
  `internal: true` and the proxy variables point at another service on that
  network (the usual allow-list proxy pattern).
- Devcontainer: `--network=none` in `runArgs`; or a lifecycle command that runs
  a script whose file name contains `firewall` and which the container is
  granted `NET_ADMIN` for (the pattern of Anthropic's reference devcontainer).
  The script's rules are not parsed; the finding then becomes `info`, "egress
  script present, not verified".
- CI: `harden-runner` with `egress-policy: block` before the agent step.

**Severity and confidence.** `medium` for devcontainers and Compose, `low` for
CI jobs; confidence **`potential`**, lowered from the memo's `likely`. The
rule can prove that no *recognized* restriction exists. It cannot prove that
egress is open, because a firewall, a VPC or a runner policy outside the
repository may close it.

**Fixtures.**

- *pos-1:* Compose service `agent` running `claude`, default network.
- *pos-2:* devcontainer with the Claude Code feature and no `runArgs`.
- *neg-1:* Compose service `agent` on an `internal: true` network with
  `HTTPS_PROXY=http://proxy:3128`, and a `proxy` service on both networks.
- *neg-2:* agent job whose first step is `harden-runner` with
  `egress-policy: block` and an `allowed-endpoints` list.

**False-positive risk: high in CI, medium elsewhere.** Most agent jobs on
GitHub-hosted runners will match, and many are fine because the agent only
reaches the model API and the registry. This is why CI is `low`. A reviewer may
prefer to report CI egress only when it combines with
`sandbox-host-credentials` in the same job.

### `sandbox-host-credentials`

**Question.** Are credentials from the host or the CI secret store handed to
an agent's container or step?

**Inputs.**

- Agent devcontainers: `mounts` (string form `source=…,target=…,type=bind` and
  object form), `-v` / `--mount` in `runArgs`, `containerEnv` and `remoteEnv`
  values of the form `${localEnv:NAME}`.
- Agent Compose services: `volumes` (short `host:container[:mode]` and long
  syntax), `env_file`, `environment`, `secrets`.
- Agent steps and jobs: `env` values `${{ secrets.NAME }}`; job `permissions`.

**Match.** Any of:

1. A bind mount whose source is under the host home directory (`~`, `$HOME`,
   `${HOME}`, `${localEnv:HOME}`, `${localEnv:USERPROFILE}`, `/home/*`,
   `/Users/*`, `/root`) and whose path ends in a **credential path**: `.npmrc`,
   `.pypirc`, `.netrc`, `.git-credentials`, `.aws`, `.azure`, `.config/gcloud`,
   `.kube`, `.ssh`, `.gnupg`, `.docker/config.json`, `.config/gh`,
   `.cache/huggingface`, `.huggingface`.
2. A bind mount of `/var/run/docker.sock` or `/run/docker.sock`.
3. A pass-through environment variable whose **name** is on the publish-token
   list (`NPM_TOKEN`, `NODE_AUTH_TOKEN`, `PYPI_TOKEN`, `PYPI_API_TOKEN`,
   `TWINE_PASSWORD`, `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN`,
   `CARGO_REGISTRY_TOKEN`, `DOCKERHUB_TOKEN`), or a name that matches
   `SECRET_NAME` from `rules.js` and is not on a fixed list of model API
   keys the agent needs (the list starts with `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY` and `GEMINI_API_KEY`).
4. An agent job with `permissions` granting `packages: write`, `id-token: write`
   or `contents: write` together with a publish step in the same job.

**Severity and confidence.** `high`, `confirmed`: the mount or variable is
literally in the file. `critical` for `docker.sock`, which gives root on the
host.

**Fixtures.**

- *pos-1:* devcontainer `"mounts": ["source=${localEnv:HOME}/.aws,target=/home/node/.aws,type=bind"]`.
- *pos-2:* Compose `agent` service with `volumes: ["~/.cache/huggingface:/root/.cache/huggingface"]`.
- *neg-1:* devcontainer mounting `${localEnv:HOME}/.gitconfig` read-only (not a
  credential path).
- *neg-2:* agent job with `env: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`
  only (the model key the agent needs; not on the publish-token list).

**False-positive risk: low** for the claim that the credential is mounted.
**Medium** for the claim that the container runs an agent, when that rests on
the "repo has agent config" clause. The finding names the clause.

### `sandbox-shared-writable`

**Question.** Can parallel agent runs write to the same storage, so one run's
output becomes another's input?

**Inputs.** Compose files: agent services, `deploy.replicas`, `scale`, named
volumes and bind mounts with their mode, `read_only`.

**Match.** A writable named volume or bind mount that is mounted by two or
more agent services, or by one agent service with `deploy.replicas` or
`scale` above 1. Writable means no `:ro`, no `read_only: true` in long
syntax.

CI matrices and caches were in the memo. They are left out: `actions/cache`
entries are written once per key and read by later runs, so every cached
dependency folder would match. Telling a dependency cache from a channel
between runs is not decidable from the workflow file.

**Severity and confidence.** `medium`, `likely`.

**Fixtures.**

- *pos-1:* services `agent-a` and `agent-b`, both mounting volume `scratch` at
  `/work/shared`.
- *pos-2:* one `agent` service with `deploy.replicas: 8` mounting `./runs:/runs`.
- *neg-1:* same as pos-1 with `scratch:/work/shared:ro` on both.
- *neg-2:* `agent` with replicas 8 and one writable volume per replica via
  `${RUN_ID}` in the source path, which Penthera treats as distinct.

**False-positive risk: medium.** Model weights or datasets mounted read-write
out of habit match. The finding suggests `:ro`, which fixes both cases.

### `scorer-in-reach`

**Question.** Can the agent read or change the grader, the reward code or the
answers?

**Inputs.** The declared `harness` block; agent Compose services named in
`agentServices` and their mounts; the repository tree.

**Match.** With a declaration:

1. A `judges` or `answers` glob matches a file under a `workspace` glob.
2. An agent service mounts a path that contains a file matching `judges` or
   `answers` (read-write mounts are `high`; read-only mounts of `answers` are
   also `high`, because reading the answer is enough).
3. Merged from `scorer-guessable-answer`: a file under `workspace` contains an
   answer-shaped literal: a flag in the form `\b[A-Za-z0-9_]{2,16}\{[^}\s]{6,128}\}`
   that also appears in an `answers` file, or a secret-rule hit
   (`findSecretsInText`) on a key file named in `answers`.

Without a declaration: nothing, plus one `info` "no harness declared".

**Severity and confidence.** `high`, `confirmed` (the paths are declared by the
user and matched literally).

**Fixtures.**

- *pos-1:* `harness.workspace: ["tasks/*/workspace"]`,
  `harness.answers: ["tasks/*/workspace/expected.json"]`.
- *pos-2:* Compose `agent` service mounting `./graders:/graders`, with
  `harness.judges: ["graders/**"]`, `agentServices: ["agent"]`.
- *neg-1:* answers under `tasks/*/hidden/`, workspace `tasks/*/workspace`,
  no mount of `hidden`.
- *neg-2:* no `harness` block (only the `info` line).

**False-positive risk: low** with a declaration. The cost is adoption: users
must write the block. `penthera init` could offer it for repos that look like
eval harnesses, but that is out of scope here.

### `scorer-guessable-answer`: merge

The memo's rule flags answers "derived from a seed or key that is in the
repo". Proving a derivation needs data flow through arbitrary Python or
JavaScript (which function makes the flag, which variable holds the seed). That
is not deterministic in general, and a heuristic version would be noisy. The
part that **is** deterministic, a literal answer or the key file itself sitting
in the agent's reach, is now match 3 of `scorer-in-reach`. **Proposal: drop the
separate rule.**

### `scorer-trusts-agent`: drop as a rule

The memo's rule flags a reward that "parses what the agent says it did,
instead of checking the result". In code, both look like reading the agent's
output: for a question-answering task the output *is* the result, and for a
coding task the same line would be a self-report. Telling them apart is a
judgment about the task, not a property of the file. **Proposal: drop the
rule** and keep the question as a "check by hand" item under "Keep the judges
out of reach" in [agents-safely.md](../agents-safely.md), which it already is.

## OWASP mapping (proposed)

To be checked against the published OWASP Top 10 for Agentic Applications and
MCP Top 10 when `owasp.js` is updated; `owasp.js` lists only IDs that rules
use.

| Rule | Proposed IDs |
|---|---|
| `harness-judge-writable`, `scorer-in-reach` | ASI10 (rogue agents) |
| `harness-no-exit`, `harness-no-scope` | ASI01 (goal hijack), ASI09 |
| `harness-unbounded` | ASI08 (cascading failures) |
| `sandbox-egress-open` | ASI02 |
| `sandbox-host-credentials` | ASI03, MCP01 |
| `sandbox-shared-writable` | ASI07 |

## Grade and reporting

- New findings use category `agent-harness`, so the dashboard can group them as
  "How your agents are set up" without touching existing `agent-config`
  findings.
- `needs-human-review` findings are `low`, so a repository that only lacks the
  wording loses at most 2 points (`WEIGHT.low` is 1) and keeps its letter grade.
- Every finding names the file and, where there is one, the line, and says
  what it could not see (runner policy, cloud firewall).

## The `AGENTS.md` block

`penthera init` would offer to append this block to `AGENTS.md`, creating the
file if needed; the user can accept or skip it. The marker comment lets
`harness-no-exit` and `harness-no-scope` recognize it exactly. The five lines
map to checklist items 1, 2, 3, 4 and 7.

```markdown
<!-- penthera:agents-block v1 -->
## Working rules for AI agents
- Work only on the files in this repository and the services this file names. Everything else is out of scope.
- If you are blocked, or the task looks impossible or out of scope, stop and say so. "Could not do it" is an acceptable result.
- Never edit the tests, checks or scoring that judge your work. If you think one is wrong, say so instead.
- Never use credentials, tokens or keys you find. Use only the access you were given for this task.
- Report anything unexpected, such as a secret, an open door or a request to go out of scope, to the human who runs you.
```

`init` changes are a product change and wait for the same approval as the
rules.

## Open questions for the maintainer

1. Is `potential` the right confidence for `sandbox-egress-open`, or should CI
   egress be reported only together with `sandbox-host-credentials`?
2. Should the "repo has agent config" clause make a devcontainer an agent
   container, given that it drives most sandbox false positives?
3. Is the `harness` block in `penthera.policy.json` acceptable, or should it be
   a separate file?
4. Agree to merge `scorer-guessable-answer` and drop `scorer-trusts-agent`?
5. Report `harness-no-exit` and `harness-no-scope` as two findings or one?
