# Penthera documentation

The routine work of a security team, on your own machine: app scanning, dependency and install checks, an AI-tooling audit, a local fix loop, and auditor-grade reports. Offline, deterministic, free.

## Getting started

| Guide | Description |
|-------|-------------|
| [README](../README.md) | Install, quick start, ethical use |
| [Run it](../README.md#run-it) | Install + first-time wizard (`penthera` with no args) |
| [CHANGELOG](../CHANGELOG.md) | Version history |
| [Roadmap](../ROADMAP.md) and [release plan](./release-plan.md) | What ships next, in what order |

## Scanning

| Topic | Link |
|-------|------|
| Scan profiles | `quick` · `standard` · `deep`, see `--profile` in `penthera --help` |
| Authenticated scans | `--auth-cookie`, `--auth-bearer`, `PENTHERA_BEARER` env |
| Adaptive probes | `--adaptive`, knowledge-graph-driven escalation on live routes |
| Custom templates | `--templates ./my-templates`, Nuclei-compatible YAML dirs |
| Rule packs | `--rules ./pack`, signed detection data; no runtime fetching. See [rule-packs.md](./rule-packs.md) |
| Baseline diff | `--baseline reports/previous.json` |

## Reports

| Format | Flag |
|--------|------|
| Markdown | `-o report.json` (auto `.md`) or `--markdown report.md` |
| JSON | `-o report.json` or `--json` |
| SARIF | `--sarif results.sarif`, GitHub Security tab |

## Standards & CI

| Topic | Link |
|-------|------|
| OWASP WSTG mapping | [owasp-wstg-coverage.md](./owasp-wstg-coverage.md) |
| NIS2 compliance guide | [compliance-nis2.md](./compliance-nis2.md) |
| Local loop and learning store | [local-loop.md](./local-loop.md) |
| Scan your app in GitHub Actions | [examples/github-actions-scan.yml](./examples/github-actions-scan.yml), set `PENTEST_STAGING_URL` |
| Penthera's own CI | `.github/workflows/ci.yml` (full tests + mock scan), `codeql.yml`, `scorecard.yml` |
| Docker | `docker build -t penthera . && docker run penthera https://localhost:3000` |

## Methodology & research

| Topic | Link |
|-------|------|
| How detection works, confidence model, limits | [METHODOLOGY.md](./METHODOLOGY.md) |
| Cited research and standards | [references.md](./references.md) ([BibTeX](./references.bib)) |
| Accuracy benchmark (`npm run bench`) | [bench/README.md](../bench/README.md), latest [results](../bench/RESULTS.md) |
| Citing Penthera | [CITATION.cff](../CITATION.cff) |

## Agent skill

| Topic | Location |
|-------|----------|
| Skill files | `skills/penthera/SKILL.md` |
| Preflight | `bash skills/penthera/scripts/preflight.sh [URL]` |
| Validate report | `npm run validate:report -- reports/scan.json` |
| Release zip | `npm run package:skill` |

## Programmatic API

```javascript
import { loadTemplatesFromPaths, runTemplateScan } from "penthera/plugins";
import { runAdaptiveProbes } from "penthera/adaptive";
```

See `lib/plugins.js` and `lib/blackbox/adaptive-scan.js` for exports shipped in the npm package.

## Security

Report vulnerabilities in Penthera via [SECURITY.md](../SECURITY.md). Only scan systems you own or have authorization to test.
