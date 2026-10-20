# Fixing what it finds: `penthera fix` and `penthera agent --loop`

> **Pro.** For "how do I run the fix loop?"

## Scan and fix

Ask your agent to fix what Penthera finds. It detects the issue, applies a framework-aware fix to your code (shown as a diff for you to approve), and re-scans to prove it is resolved.

```
"Scan my app and fix what you find"
"Fix the security headers on my Next.js app and re-scan to confirm"
"Find and fix hardcoded secrets in this repo"
```

Fixes come from a [remediation playbook](../../skills/penthera/references/remediation.md) covering Next.js, Express, Fastify, Hono, and FastAPI. They are always shown as diffs for your approval and verified by a re-scan, and nothing touches production. To build secure-by-default in the first place, see [secure defaults](../../skills/penthera/references/secure-defaults.md).

### Fix recipes

For the most common findings you don't need an agent at all. `penthera fix` plans deterministic, local fixes and prints each one as a unified diff:

```bash
penthera fix --plan --repo .                  # fresh repo scan, one diff per fix
penthera fix --plan --repo . -o report.json   # or use the findings from an earlier scan
penthera fix --apply <id> --repo .            # apply one diff after you approve it
```

| Recipe | What it changes | Frameworks |
|--------|-----------------|------------|
| `security-headers` | Adds a starter CSP (with `frame-ancestors`), HSTS, X-Frame-Options, Referrer-Policy and X-Content-Type-Options | Next.js (`headers()` in `next.config.*`), Express (`helmet` if installed, otherwise a small middleware), Fastify (`@fastify/helmet` if installed, otherwise an `onSend` hook), Hono (`secureHeaders`) |
| `cookie-flags` | Adds `httpOnly`, `secure` and `sameSite` to cookies set in code | `res.cookie`, `reply.setCookie`, Hono `setCookie`, Next.js `cookies().set` |
| `cors-allowlist` | Replaces `cors()`, `origin: "*"`, `origin: true` and `origin \|\| "*"` with an allowlist from `CORS_ALLOWED_ORIGINS` | Express, Fastify, Hono, Next.js route handlers |
| `auth-rate-limit` | Puts a rate-limit stub (in memory, 10 attempts per 15 minutes) on login and auth routes | Express (`express-rate-limit` if installed), Fastify, Hono, Next.js App Router |
| `secret-to-env` | Moves a hardcoded secret in JS/TS to `process.env.NAME` and adds `NAME=` to `.env.example` | Any |

How it stays safe:

- **Planning never writes.** Applying is a separate step: it needs a plan id plus a `y/N` confirmation (or `--yes`), refuses a dirty git tree unless you pass `--allow-dirty`, refuses any path outside the repo, and writes nothing unless every hunk applies. It never commits or pushes.
- **Conservative edits.** No AST rewriting: each recipe edits at an anchor it recognizes exactly (`const app = express()`, the exported Next.js config object, a one-line `res.cookie(...)`). If the anchor isn't there, or the code already does something custom (an existing `headers()`, cookie options in a variable), the recipe returns no plan instead of a risky diff.
- **Owner actions are listed, not done.** A recipe can move a secret out of the code but can never rotate it, so every secret fix says "rotate this secret". Other recipes flag what is still on you, such as tightening the starter CSP or setting `CORS_ALLOWED_ORIGINS`.
- **Secrets stay masked.** The secret's value is masked in printed and `--json` plans.
- **Verified.** After `--apply`, Penthera re-scans the repo and says whether each finding is gone. Headers, cookies, CORS and rate limits are checked statically from source, so re-run your URL scan to confirm against the live app.

No recipe for a finding? `--fix-model <name>` can ask a model running in [Ollama](https://ollama.com) on `127.0.0.1:11434`, and nowhere else. It is off by default and only used when no recipe matches. Its diffs are labeled `needs-human-review`.

### The local loop: `penthera agent --loop`

`penthera agent --loop` runs scan → fix → verify → learn on your machine until nothing fixable is left (or `--max-iterations`, default 5):

```bash
penthera agent --loop --repo . --url http://localhost:3000 -o reports/loop.json
```

It shows each diff and asks `y/n/skip/quit`, applies it on a local branch `penthera/fix-<yyyymmdd-hhmm>`, re-scans (plus your tests with `--run-tests`), commits the fix if it verified and reverts it if not, and records the outcome in [local memory](../local-loop.md). It refuses a dirty tree or a detached HEAD, runs only an allow-list of local git commands with your repo's hooks disabled, contacts only the `--url` host, and never pushes or opens a pull request. `--auto low` applies without asking only recipes that memory shows verified 3+ times with no failures on your framework. Details and the `loopRun` JSON: [docs/local-loop.md](../local-loop.md#the-agent-loop).

[Back to the README](../../README.md) · [All commands](README.md)
