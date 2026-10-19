# Set up in one command: `penthera init`

## Start here

New to Penthera? Run it with no arguments in your project folder:

```bash
npx penthera          # in a terminal, with no arguments: the setup wizard
penthera init         # the same wizard, by name (also works with piped answers)
penthera init --yes   # accept every safe default, ask nothing
penthera init --dry-run   # show what would run and be written, change nothing
```

The wizard finds what your project has, asks one question about what to check,
runs those checks offline, shows one summary, and then offers to set up the
hook, the CI workflow and the rest, one yes/no at a time. Press Enter to accept
a default.

## What it does

**1. Detect.** Offline, read-only:

- whether this is a git repository (and which branch);
- the web framework, from `package.json`, `requirements.txt` or `pyproject.toml`;
- lockfiles: `package-lock.json`, `npm-shrinkwrap.json`, `uv.lock`,
  `poetry.lock`, `pdm.lock`, `Pipfile.lock`, `requirements.txt`;
- agent config: `.mcp.json`, `.claude/`, `.cursor/`, `CLAUDE.md`, `AGENTS.md`, `skills/`;
- a dev server on localhost ports 3000, 5173, 8000 or 8080 (a TCP connect to
  127.0.0.1 and ::1, nothing else);
- whether the Penthera pre-commit hook or a Penthera GitHub workflow is already there.

**2. Ask what to check.** One checklist, with defaults from what was found.
Type numbers to toggle items (`2,4`), or press Enter:

```
  What should Penthera check?
    1. [x] Code: secrets and risky API routes in ./                 penthera --repo .
    2. [x] Dependencies: what your npm and Python packages can do   penthera deps
    3. [x] AI tooling: skills, MCP servers, hooks, agent instructions  penthera agents
    4. [ ] The running app at http://localhost:3000                 only if it is yours
    5. [x] Offline mode: nothing leaves this machine                recommended
```

- AI tooling then asks whether to include `~/.claude` and `~/.cursor` too (default no).
- The running app is only listed when a dev server answered, is never
  preselected, and is only scanned after you confirm it is yours (default no).
  It runs the standard safe checks: no attack payloads.
- With offline mode off, `deps` also reads npm registry metadata and the URL
  scan may download the Retire.js database. Nothing else changes.

**3. Run and summarize.** One line per check, then the grade per area (A to F,
the same scale as `penthera agents`), the three things to fix first in plain
language, and the report folder:

```
  Running 3 checks  (offline)
    ✓ Code          B  1 high  0.1s
    ✓ Dependencies  A  no issues  0.0s
    ✓ AI tooling    A  1 medium  0.0s
```

Every report lands in `reports/penthera-<date>/`: `code`, `deps`, `agents` and
`app` as JSON and Markdown, plus `summary.md` and `summary.json`.

**4. Set up.** Each step is a yes/no:

| Step | Default | What it does |
|---|---|---|
| Pre-commit hook | yes | `penthera hook install`: blocks staged secrets, risky agent config and lockfile changes ([hook.md](hook.md)). Git repos only |
| GitHub workflow | yes | Writes `.github/workflows/penthera.yml` from [the PR dependency review example](../examples/pr-dependency-review.yml), with the action pinned to the release commit SHA. Shown as a diff first. Needs a git repo and `package-lock.json` |
| `.gitignore` | yes | Appends `reports/` so scan output is never committed |
| Fix loop | no | `penthera agent --loop` on a local `penthera/fix-<date>` branch; every diff asks first ([fix.md](fix.md)) |
| Dashboard | yes | `penthera ui --open` on this run's reports ([dashboard.md](../dashboard.md)). Runs until Ctrl-C |

Steps that are already done (a hook or workflow that exists, `reports/` already
ignored) are skipped and say so.

**5. What next.** The commands to rerun each check, check staged changes, run
the fix loop or open the dashboard.

## `--yes` and `--dry-run`

`--yes` answers every question with its safe default: the code, dependency and
AI tooling checks that apply, offline, then the hook, the workflow and
`.gitignore`. It never scans a URL, never runs the fix loop and never opens the
dashboard, even when a dev server is running.

`--dry-run` runs detection and asks the questions, then prints what it would
run and write instead of doing it. Combine them for a plan with no prompts:

```bash
penthera init --yes --dry-run
```

`penthera --yes` and `penthera --dry-run` (no other arguments) are the same as
`penthera init --yes` and `penthera init --dry-run`.

## What it never does

- Commit, push, open a pull request, or touch a remote. The workflow file is
  written for you to review and commit yourself.
- Write outside the project: reports, `.gitignore` and the workflow go under
  the project root (the git top level when there is one), the hook into the
  repository's hooks folder.
- Contact anything but localhost, unless you turn offline mode off or confirm
  the running app.

Exit code: 0 when the wizard finishes (whatever the grades), 2 for a bad flag.
For a gate in CI, use the commands themselves (`penthera --repo .`, `penthera deps`):
they exit 1 on high or critical findings.

The pinned SHA is the last release tagged before this version
(`ACTION_PIN` in `src/cli/onboarding.js`); Dependabot's `github-actions`
updates keep it current in your repo.
