# Dependency risk: `penthera deps`

## Dependency risk: what can your packages do?

A lockfile change is code you did not write, about to run with your app's access
to files, network, environment and CI secrets. `penthera deps` reads
`package-lock.json`, statically scans every installed package, and tells you
what each one *can do*, and which packages are new or gained capabilities in an
upgrade.

```bash
penthera deps                          # every package in node_modules
penthera deps --base origin/main       # capability diff vs the lockfile on main
penthera deps --diff ../base-checkout  # diff vs another installed tree (or an old package-lock.json)
penthera deps --pr-comment deps.md     # short Markdown diff for a PR comment
```

```
  ▲ net-helper 1.0.0 → 1.1.0  + network, whole environment
      node_modules/net-helper/index.js:3  const https = require('https');
      node_modules/net-helper/index.js:5  const body = JSON.stringify(process.env);
```

| Capability | Detected from |
|---|---|
| Install scripts | `preinstall` / `install` / `postinstall`, and `binding.gyp` (npm runs `node-gyp` implicitly). Flagged as risky when the hook pipes a download to a shell or runs a file with network or decoding code |
| Shell, network, dynamic code | `child_process`; `http`/`https`/`net`/`dgram`/`tls`/`http2`, `fetch`, `WebSocket`; `eval`, `new Function`, `vm` |
| Environment | `process.env` reads, and bulk access (`JSON.stringify(process.env)`, enumeration). Serialising the environment next to network code is reported as likely exfiltration |
| Files, modules, native | Writes near home-directory or system paths; computed `require()`/`import()`; `.node` addons and `binding.gyp` |
| Obfuscation | Obfuscator identifiers (`_0x…`), `\x`-escape density, encoded blobs that are decoded and run (embedded WebAssembly and ANSI colour codes are recognised and ignored) |
| Attack indicators | Writes to `~/.claude`, `~/.cursor`, `.mcp.json` or the Claude Desktop config; running the `claude`, `gemini` or `q` CLIs (the s1ngularity pattern); GitHub token harvesting |
| Typosquats | Edit distance, separator and suffix tricks against ~7,800 popular npm names, vendored in the package and refreshed at release time |
| Known-bad versions | Package versions, exfil endpoints and dropped files from named campaigns (s1ngularity, Shai-Hulud, Shai-Hulud 2.0, postmark-mcp), from the signed [rule packs](../rule-packs.md) that ship with each release. Matched against the lockfile, so a bad version is reported even when it is not installed |

Every capability carries `file:line` evidence. It is a regex-and-tokenizer pass,
not a full parser: deterministic, never executes package code, and fast enough
for every PR (0.4 s for Penthera's own 61 packages, 5 to 16 s for real app
trees of 500 to 1,700 packages). A capability is what code
*can* do, not proof that it is malicious; the findings carry honest confidence
labels (`potential` for obfuscation and typosquats).

**Offline by default.** Old versions for the diff come from the base tree's
`node_modules` or from npm's local cache (`~/.npm/_cacache`), looked up by the
lockfile's integrity hash and verified byte for byte. `--online` is the only
network use: it asks the npm registry for publish dates, publisher changes and
deprecations, and fetches old tarballs the cache does not have (verified the
same way). To comment the capability diff on every PR that changes the
lockfile, use the GitHub Action below.

### npm and Python

The same command reads Python projects: `uv.lock`, `poetry.lock`, `pdm.lock`,
`Pipfile.lock` or `requirements*.txt` (pinned and `--hash` lines), and the
installed `.venv` / `venv` (or `--venv <path>`) through
`site-packages/*.dist-info` `RECORD` files, without running pip or Python. A
repo with both a `package-lock.json` and Python inputs gets one combined report.

```bash
penthera deps                          # uv.lock + .venv
penthera deps --venv ~/.venvs/app      # a virtualenv somewhere else (no lockfile needed)
penthera deps --base origin/main       # capability diff vs the Python lockfile on main
```

Capabilities and evidence are the same as for npm (`subprocess`/`os.system`,
`socket`/`requests`/`httpx`/`aiohttp`, `os.environ` bulk access,
`eval`/`exec`/`compile`, computed `__import__`, native `.so`/`.pyd`, AI-agent
indicators), plus what is specific to Python: `setup.py` custom commands
(install-time code), `.pth` files with `import` lines (they run on every
interpreter start, a known persistence trick), unpickling, `exec` of a
base64/zlib-decoded payload, installed files that no longer match their
`RECORD` hash, and `.pth` files no distribution owns. Old versions for the diff
come from pip's HTTP cache (matched by the lockfile's sha256) or uv's cache
(by recorded hash), otherwise they are marked "not compared". Typosquats are
checked against the top 8,000 PyPI projects, PEP 503 normalised.
`--online` registry checks are npm-only for now.

### License policy

```bash
penthera deps --license-policy permissive        # or weak-copyleft-ok, no-agpl
penthera deps --license-policy legal/policy.json # a file with a "licenses" section
```

Without the flag, `penthera deps` applies the `licenses` section of
`penthera.policy.json` when there is one:

```json
{
  "licenses": {
    "preset": "permissive",
    "allow": ["Python-2.0"],
    "deny": ["WTFPL"],
    "allowPackages": ["@acme/*", "sharp@0.33.5"],
    "unknown": "warn"
  }
}
```

| Preset | Allows |
|---|---|
| `permissive` | MIT, ISC, BSD, Apache-2.0, 0BSD, Unlicense, CC0, Zlib, BlueOak and similar. Everything else breaches |
| `weak-copyleft-ok` | `permissive` plus LGPL, MPL, EPL, CDDL and Artistic-2.0 |
| `no-agpl` | Anything except AGPL and SSPL (network copyleft) |

Licenses come from the lockfile (npm records them in v2 and v3), else from
the installed `package.json`. Expressions are parsed as SPDX:
`MIT OR GPL-3.0-only` passes `permissive` because one branch is enough, while
`MIT AND GPL-3.0-only` does not. Deprecated ids (`GPL-3.0`, `GPL-2.0+`) are
matched to their current form, so a deny of `AGPL-3.0-only` also catches a
package that says `AGPL-3.0`. A breach and `UNLICENSED` (no rights granted)
are high. A missing, custom (`SEE LICENSE IN ...`) or non-SPDX license is
medium, or high with `"unknown": "block"`. `allowPackages` exempts packages your
legal review has cleared. Findings use category `license` and appear in every
output format, and `--sbom` now records each component's license.

[Back to the README](../../README.md) · [All commands](README.md)
