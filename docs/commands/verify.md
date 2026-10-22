# Checking a model's findings: `penthera verify`

> **Pro.** For "an AI audit gave me a list of vulnerabilities. Which ones can I
> trust?"

AI security audits, such as Cloudflare's
[security-audit skill](https://github.com/cloudflare/security-audit-skill)
running in your coding agent, find things rules can't. They also make things
up, and their own validation is done by more models. `penthera verify` checks
each finding against Penthera's deterministic rules on your checkout, and
labels the rest honestly.

```bash
penthera verify <findings.json> --repo .
```

Penthera runs no model, runs none of your code, and sends nothing anywhere. It
reads one file and your checkout. The model ran in your own agent, under that
agent's terms.

## What each finding becomes

| Result | Means | Shown as |
|---|---|---|
| **Confirmed by rule** | A Penthera rule flags the same kind of issue in the same file | Penthera's own finding, marked "also proposed by" the model |
| **Model-proposed, unverified** | No rule could confirm it: Penthera has no rule for that class, or the rule did not fire there | A finding with confidence `needs-human-review`, kept apart from rule findings |
| **Location not found** | The file or line it points at is not in this checkout | Listed, not a finding |
| **Out of scope** | The path leads outside the repository | Listed, not a finding |

A rule that ran and did not fire is **not** evidence that a finding is wrong:
rules miss things. Such findings stay unverified, never rejected.

The producer's own verdict is kept and shown, but it does not set Penthera's
confidence: a `confirmed` from the skill was confirmed by a model. Findings
the skill itself `rejected` are counted and not imported.

## Which classes a rule can confirm

The skill's `findings.json` has no class field, so Penthera infers the class
from each finding's title, description and root cause with a fixed table
(`lib/llm-audit/classes.js`): same text, same class, no model.

| Class | Confirmed by |
|---|---|
| Hardcoded secret | The secret scan, same file |
| Command injection, code injection (`eval`), XSS (`innerHTML`), permissive CORS, error details disclosed | The risky-pattern checks over discovered routes, same file and pattern |
| AI agent configuration (MCP, hooks, skills) | `penthera agents`, same file |
| SQL injection, path traversal, SSRF, open redirect, prototype pollution, deserialization, access control, authentication, CSRF, race conditions, resource exhaustion, anything else | No rule: always unverified for now |

Sandboxed reproduction of the classes without rules is planned; see the
AI-mode spec in `docs/research/`.

## The file it reads

Cloudflare security-audit-skill `findings.json`, checked against that skill's
`report-schema.json` at commit `c1c8a8c` (vendored unchanged, MIT), plus unique
fingerprints and safe repository-relative paths. A file that does not match is
refused whole, with the first errors, and nothing is imported. Limits: 8 MB and
2,000 findings. Reproduction payloads and fixed code from the file are not
copied into Penthera's output.

## Options

| Flag | Use |
|---|---|
| `--repo <path>` | The checkout the findings are about (default: the current folder) |
| `--json` | Print the result as JSON (`schema: penthera.verify/1`) |
| `-o, --output <file>` | Write the JSON result to a file |
| `--sarif <file>` | SARIF with two runs: `penthera` for rule-confirmed findings, `penthera-ai` for model findings, all at level `note` |
| `--markdown <file>` | A Markdown report, grouped by result |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | The file was read and every finding checked, whatever the results |
| `2` | Usage error, unreadable file, or a file that does not match the schema |

Unverified model findings never change the exit code.
