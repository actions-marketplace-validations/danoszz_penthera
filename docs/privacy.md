# Privacy and network use

Penthera has no telemetry. It does not collect, store, or transmit any usage data, analytics, or personal information to the author or any third party. It does not phone home.

- **Scan traffic goes to the target you specify.** Auth tokens passed via `--auth-bearer`, `--auth-cookie`, or `PENTHERA_*` env vars are sent only to that target.
- **Every request identifies itself** as `penthera/<version> (+https://github.com/danoszz/penthera)`, so a target's operator can tell where the traffic comes from. Override it with `--user-agent`.
- **Reports stay local.** Output is written to `reports/` (gitignored) on your machine.
- **Every scan lists the third-party hosts it contacted** besides the target, in the terminal summary and in the report's "Network egress" section.

Without `--offline`, a scan may contact these third parties:

| Host | When | What it learns |
|---|---|---|
| `raw.githubusercontent.com`, `cdn.jsdelivr.net` | Retire.js check (standard and deep profiles) | That someone downloaded the public database. Nothing about your target. |
| `crt.sh`, `web.archive.org`, `otx.alienvault.com` | `--recon` only | The target domain. |
| CDN hosts serving your page's `<script src>` | Retire.js check, when a script's version can only be read from its contents | That someone fetched that public script. |

### Fully local: `--offline`

```bash
penthera http://localhost:3000 --offline
```

With `--offline`, the HTTP client refuses every host except the scan target. A redirect may only move to a host on the target's registrable domain (`example.com` to `www.example.com`). In practice:

- **Recon is skipped.** No queries go to crt.sh, the Wayback Machine or OTX.
- **The Retire.js database comes from the snapshot vendored in the package** (`lib/data/retire-jsrepository.json.gz`), refreshed at each release by `scripts/refresh-retire-db.mjs`. The source URL, fetch date and SHA-256 sit next to it in `retire-jsrepository.meta.json`, so you can check it against upstream. Online scans fall back to the snapshot too when the live download fails.
- **Third-party scripts are not fetched.** A refused request is listed in the report as an inconclusive probe, not passed over silently.
- **`--suppliers` is refused**, because it rates third-party domains.
- **DNS:** reaching a remote target needs DNS. For non-local targets, the email-authentication check also looks up the target domain's SPF/DMARC/MX records through your system resolver. A `localhost` or IP target needs no DNS at all.

Penthera never fetches rules or code at runtime: templates, wordlists and the vulnerability database ship in the package.

### Inconclusive probes

When a probe's requests time out, fail, or are refused by `--offline`, the scan records `{ probe, url, message }` in `result.errors`. The terminal summary shows "N probes inconclusive", and the Markdown report lists each one. A probe that could not run is not a clean result.

You are responsible for ensuring you are authorized to scan any target. See [Ethical use](../README.md#ethical-use--authorization).
