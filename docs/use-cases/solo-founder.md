# Before launch: for solo founders and vibecoders

## The problem

You built the app in weeks, much of it with an AI assistant. It works. You have
not had time to check the things that tend to go wrong in AI-written apps: an
API route that returns any user's data if you change the id, an OpenAI key in a
client bundle, a missing security header, a CORS policy of `*`, a login with no
rate limit. Nobody on the team does security, because there is no team.

## What to run

Start the app locally, then:

```bash
npx penthera http://localhost:3000 --repo .   # the running app and its source, together
npx penthera fix --plan --repo .              # fixes for what it can fix, as diffs
npx penthera hook install                     # stop secrets at commit time from now on
```

Or ask your coding agent, with the [Agent Skill](../commands/skill.md)
installed: "scan my app on localhost:3000 and fix what you find".

Before you deploy, run the same scan against your preview URL. Only scan systems
you own.

## What you get

```
  Findings

  HIGH  IDOR/BOLA: GET /api/users/{user_id}
         http://localhost:3000/api/users/1 → 200
  HIGH  OAuth open redirect
         http://localhost:3000/api/oauth/callback?redirect_uri=... → 302
  MED   Missing Content-Security-Policy
  MED   No login rate limiting detected
         http://localhost:3000/api/login → 401
  LOW   Missing X-Frame-Options
  INFO  Missing Referrer-Policy

  ──────────────────────────────────────────────────────────
  2 high · 5 medium · 2 low · 2 info
```

`penthera fix --plan` then prints a unified diff per fix it knows (security
headers, cookie flags, a CORS allowlist, a login rate limit, moving a
hardcoded secret to an environment variable) for Next.js, Express, Fastify and
Hono. Nothing is written until you apply a plan by id, and the repo is
re-scanned afterwards to confirm the finding is gone.
[More on fixes](../commands/fix.md).

## What it does not do

- It is not a penetration test by a person. It checks known classes of problem;
  it will not find a flaw in your business logic, such as a coupon that can be
  applied twice.
- It does not fix IDOR or auth design for you. It points at the route; the fix
  is yours.
- It does not watch production yet. Scheduled checks are on the
  [roadmap](../../ROADMAP.md).
- A clean scan is not proof of safety. Every finding has a confidence label, and
  probes that could not run are listed as inconclusive rather than passed.

[All use cases](README.md) · [Back to the README](../../README.md)
