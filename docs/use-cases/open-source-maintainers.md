# For open-source maintainers

## The problem

Your project is someone else's dependency. A compromised maintainer account, a
malicious contributor pull request that bumps a lockfile, or a leaked publish
token can turn it into the attack. Most maintainers do this unpaid, without a
security budget, and many cannot send their dependency list or code to a vendor
service, or would rather not sign up for one.

## What to run

On every pull request that touches the lockfile, comment what the change lets
code do:

```yaml
- uses: danoszz/penthera@<release-commit-sha> # pin to a release commit
  with:
    mode: deps
    fail-on: none
```

The full workflow, with permissions and a paths filter, is in
[`docs/examples/pr-dependency-review.yml`](../examples/pr-dependency-review.yml).
The action runs Penthera from its own checkout: no install from npm and no
registry lookups. On pull requests from forks the token is read-only, so the
diff goes to the job summary instead of a comment.

Locally, before you cut a release:

```bash
npx penthera deps --base origin/main   # what changed in the tree since main
npx penthera --repo .                  # secrets, including AI provider keys
npx penthera agents                    # the agent config you ship (CLAUDE.md, .mcp.json, skills/)
npx penthera hook install              # block secrets and risky config at commit time
```

## What you get

```
  ▲ net-helper 1.0.0 → 1.1.0  + network, whole environment
      node_modules/net-helper/index.js:3  const https = require('https');
      node_modules/net-helper/index.js:5  const body = JSON.stringify(process.env);
```

A patch release that starts reading the whole environment next to a network call
is the shape of most credential-stealing packages. The diff shows it with
`file:line` evidence, whether or not an advisory exists yet.
[More on `penthera deps`](../commands/deps.md) and [the action](../commands/action.md).

If your project ships agent skills or MCP configuration, `penthera agents` on
your own repo is a reasonable release check too: it is what your users' tools
will load.

## How Penthera handles its own releases

The same practices are worth copying. Penthera releases are published with npm
provenance through trusted publishing and are staged: each version waits on npm
until a maintainer approves it with 2FA. CI actions are pinned by SHA, CodeQL
runs on every push, and the
[OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera)
is public. See [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml).

## What it does not do

- Dependency analysis covers npm and Python. The install firewall and the
  `--online` registry checks are npm only for now.
- It does not track CVEs in your dependencies. Keep Dependabot or a similar
  service on for that ([how they fit](../compare/github.md)).
- It does not watch the registry for your package being republished by someone
  else. Enable 2FA and trusted publishing on npm for that.
- A capability is what code *can* do, not proof of intent. Many good packages
  use the network; the diff is there so a person can look.

[All use cases](README.md) · [Back to the README](../../README.md)
