# The GitHub Action

> **Pro.** For "how do I put it in CI?"

### Use as a GitHub Action

```yaml
- uses: danoszz/penthera@<release-commit-sha> # v1.4.0
  with:
    mode: deps        # deps | agents | scan (scan also needs url:)
    fail-on: none     # none | high | critical
```

On every pull request it posts one comment with the capability diff against
the PR base and edits that same comment on each push. It also uploads SARIF to
code scanning. Penthera runs from the action's own checkout: no npx, no install
from npm, no registry lookups. On fork PRs the token is read-only, so the diff
goes to the job summary instead. Inputs: `mode`, `path`, `base-ref`, `url`,
`fail-on`, `comment`, `sarif`, `penthera-version`. Copy the full workflow, with
permissions and a lockfile paths filter, from
[`docs/examples/pr-dependency-review.yml`](../examples/pr-dependency-review.yml).

[Back to the README](../../README.md) · [All commands](README.md)
