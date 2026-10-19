# A repeatable handover check: for agencies shipping client apps

## The problem

An agency ships many similar apps for clients who assume security was handled.
Each project has a different team, a different deadline and a launch date that
does not move. A security review by a person for every launch is too expensive,
and "we followed best practice" does not survive a client's procurement
questionnaire or an incident.

## What to run

The same three steps on every project, in CI or before handover:

```bash
npx penthera https://preview.client.example --repo . --profile standard \
  --sarif reports/scan.sarif -o reports/scan.json
npx penthera deps --license-policy permissive     # dependency capabilities and licences
npx penthera agents                               # the agent config left in the repo
```

At handover, give the client a report written for them and a bundle they can
keep:

```bash
npx penthera https://client.example --repo . --audience owner > security-summary.md
npx penthera https://client.example --repo . --audience auditor \
  --evidence handover/2026-10-19 --sign-key ~/.ssh/agency_ed25519
```

Pin the Penthera version in CI so every project is checked by the same rules,
and use `--baseline` to show only what is new since the last scan.

## What you get

The owner report is in plain language. From Penthera's own mock target:

```markdown
# Security summary

## In short

Penthera checked http://localhost:8765 and found **2 serious problems** to fix
this week, 5 moderate, 2 minor, 2 notes. The serious ones are things an attacker
could use today.

## What to do first

1. **Harden authentication and access control** (involved, a developer can do this). ...
2. **Remove the exposed file or interface from production** (quick, a developer can do this). ...
3. **Add a Content-Security-Policy header** (moderate, a developer can do this). ...
```

The auditor version covers scope and method, every finding with its evidence and
confidence, the hosts contacted, and the probes that could not run. The evidence bundle hashes every file in a
signed manifest, so the client can check later that nothing was edited.
`--report-template` puts the same data into your own Markdown template.
[More on reports and evidence](../evidence.md).

## What it does not do

- It does not replace a penetration test where a contract or a regulator asks for
  one. It makes that test cheaper, because the routine findings are already gone.
- It only scans what you point it at, with the client's permission. Get the scope
  in writing.
- Fix recipes cover common JavaScript and TypeScript frameworks. Other stacks get
  findings and guidance, not diffs.
- It does not monitor client production after handover yet. That is on the
  [roadmap](../../ROADMAP.md).

[All use cases](README.md) · [Back to the README](../../README.md)
