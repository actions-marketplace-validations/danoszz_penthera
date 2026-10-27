# --giants fixtures

> **Project page.** For "where does the recorded tool output in the --giants tests come from?"

One folder per tool and version: `<tool>/<version>/output.txt` is what the
tool wrote, `meta.json` the command line, exit code, network mode, the root or
URL it scanned, the number of findings Penthera read, and the date.

They were recorded on 2026-10-26 with `scripts/giants/record.mjs`, which runs
each installed tool through Penthera's own runner (the same command,
sandbox and parser as `--giants`) on:

- **repo tools**: the project `target.mjs` writes to a temp folder. It has one
  hit per area. Its secrets are made-up values built from parts, so this
  repository holds none.
- **live tools**: the mock server (`tests/fixtures/mock-server.js`) on
  127.0.0.1, with the two templates in `nuclei-templates/`. ZAP ran in its
  container through a local `zap-baseline.py` wrapper, so its URLs read
  `host.docker.internal`.

The output is kept as Penthera keeps it for an evidence bundle: secrets
masked (TruffleHog prints them in full), and the recording machine's home
folder (where the tools live) reads `/home/user`. Everything else is byte for
byte.

| Tool | Version | Rules or database |
|---|---|---|
| gitleaks | 8.30.1 | built-in rules |
| TruffleHog | 3.99.3 | built-in detectors, `--no-verification` |
| Semgrep | 1.180.0 | semgrep-rules @ 9bbf021 (2026-10-08), `javascript/` |
| CodeQL | 2.27.2 | the bundle's `javascript` default suite |
| osv-scanner | 2.6.0 | offline database of 2026-10-26 |
| pip-audit | 2.10.1 | PyPI, 2026-10-26 (`--giants-online`) |
| Trivy | 0.76.1 | database of 2026-10-26, built-in checks |
| Checkov | 3.3.30 | built-in checks |
| nuclei | 3.11.1 | `nuclei-templates/` here |
| ZAP | 2.17.0 | `ghcr.io/zaproxy/zaproxy:stable` |

To record a new version, install it, then:

```bash
node scripts/giants/record.mjs --only trivy
```

and add the version to the adapter's `tested` list in
`lib/giants/adapters/<tool>.js`. `tests/giants-adapters.test.js` checks that
the two match.
