---
title: "Penthera and OWASP ZAP"
sidebarTitle: "vs ZAP"
description: "Where OWASP ZAP and Penthera overlap on live scans, and where they differ."
---

> **Pro.** For "how does Penthera compare to OWASP ZAP, and how do I run both?"

*Last checked: 2026-10-19 against zaproxy.org and the ZAP GitHub repositories.*

## Use them together

[ZAP](https://www.zaproxy.org) is the long-standing open-source dynamic scanner
for web apps: a proxy, spiders, passive and active scan rules, scripting, and an
automation framework. Since September 2024 it is branded ZAP by Checkmarx and
remains Apache 2.0 ([announcement](https://www.zaproxy.org/blog/2024-09-24-zap-has-joined-forces-with-checkmarx/)).
Penthera's URL scan covers a smaller, opinionated set of checks, and pairs them
with the source code, your dependencies and your AI tooling.

A reasonable setup: Penthera as the quick first pass on every preview URL,
with source context and fixes. ZAP for deeper dynamic testing, manual
exploration through its proxy, and anything that needs a logged-in browser crawl.

## Side by side

| | Penthera | ZAP |
|---|---|---|
| Dynamic testing | Headers, TLS, CORS, cookies, auth hardening, JWT, IDOR, OAuth, OpenAPI probes; injection and fuzzing are opt-in | Passive and active scan rules, spider and AJAX spider ([features](https://www.zaproxy.org/docs/desktop/start/features/), [AJAX spider](https://www.zaproxy.org/docs/desktop/addons/ajax-spider/)) |
| API definitions | OpenAPI and FastAPI | OpenAPI, SOAP and GraphQL ([API scan](https://www.zaproxy.org/docs/docker/api-scan/)) |
| Manual testing | No | Intercepting proxy and desktop UI |
| Source code | Repo scan in the same run (`--repo .`) maps routes and finds secrets | No |
| Dependencies, AI tooling | Yes | No |
| Fixes | Framework-aware fix recipes, re-scanned to verify | Reports alerts |
| Automation | CLI, GitHub Action, SARIF | YAML Automation Framework, Docker packaged scans, the ZAP Baseline Scan action ([automate](https://www.zaproxy.org/docs/automate/)) |
| Runtime | Node.js 22+ | Java 17+, or Docker ([download](https://www.zaproxy.org/download/)) |
| License | MIT | Apache 2.0 |

## Where ZAP goes further

- **Depth of dynamic testing**: many more active scan rules, a mature crawler
  for JavaScript-heavy apps, and years of tuning.
- **Manual work**: the intercepting proxy lets a person explore and replay.
- **Authentication**: browser-based, scripted and OAuth2 logins in the
  automation framework ([automation framework](https://www.zaproxy.org/docs/automate/automation-framework/)).
  Penthera takes a cookie or bearer token.
- **Community**: a large add-on ecosystem and documentation.

## Where Penthera adds something

- **Black box and white box together.** A URL finding can point at the route
  handler in your repo, and the repo scan finds routes the crawler never saw.
- **Fixes**, applied as diffs on a local branch and re-scanned.
- **Beyond the app**: dependency capabilities, AI-tooling audit, NIS2 and CRA
  evidence.
- **A confidence label on every finding**, so a heuristic match never reads as a
  confirmed vulnerability.

## Run both

```bash
npx penthera http://localhost:3000 --repo . --sarif penthera.sarif
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:3000
```

[All comparisons](https://github.com/danoszz/penthera/blob/main/docs/compare/README.md) · [Back to the README](https://github.com/danoszz/penthera/blob/main/README.md)
