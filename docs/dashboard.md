# The local dashboard: `penthera ui`

`penthera ui` starts a dashboard in your browser for what Penthera already
knows about your projects: posture, findings, dependency changes, your AI
tooling, evidence bundles, and a live view of the agent loop that you can
drive from the page. It runs on `127.0.0.1` only, reads only the folders you
give it and `~/.penthera`, and never contacts the network.

![Overview: posture per project, severity mix, findings over time](../assets/dashboard/overview.jpg)

## Start it

```bash
penthera ui --open                       # current folder, reports in ./reports
penthera ui --project ~/code/shop --project ~/code/api --reports ~/code/shop/reports
penthera ui --demo                       # fake data, nothing read from disk
```

| Option | Default | What it does |
|--------|---------|--------------|
| `--port <n>` | `0` (random free port) | Port on 127.0.0.1 |
| `--open` | off | Open the one-time URL in your browser |
| `--project <dir>` | the current folder | A folder the dashboard may read and run the agent loop in. Repeat for more |
| `--reports <dir>` | `<first project>/reports` | Where report JSON files are read from (and where runs started here write theirs) |
| `--demo` | off | Realistic fake data, a scripted agent loop. For a first look, screenshots and docs |

It prints a URL with a one-time token:

```
  penthera ui
  http://127.0.0.1:53817/?token=Xq…
  one-time link: it signs this browser in once, then stops working
```

Open it once. The token is swapped for a session cookie and stops working; a
second browser (or a link that leaked into history) gets a 403. Restart
`penthera ui` for a new link. Ctrl-C stops the server.

## Where the data comes from

| Screen | Source |
|--------|--------|
| Overview | The latest scan report per target in the reports folder (`penthera <url> -o reports/x.json`, `--repo`), plus the trend and time to fix from local memory |
| Findings | The same reports. The fix preview runs the fix recipes against the project folder, read-only |
| Agent | Live runs started from this page; past `loopRun` files (`penthera agent --loop -o reports/loop.json`); memory stats |
| Dependencies | `penthera deps --base main -o reports/deps.json` and `penthera install <pkg> --dry-run --json > reports/install.json` |
| AI tooling | `penthera agents . --home -o reports/agents.json` |
| Evidence | Bundles written with `--evidence reports/evidence/<name>` |
| Settings | This session's egress mode; memory chain status for every project in `~/.penthera/memory` |

The reports folder is read one level deep for `*.json` (anything that is not a
Penthera report is ignored) and two levels deep for evidence bundles. Symlinks
are skipped. A memory chain that does not verify is shown as broken and its
contents are not used, the same rule scans follow.

## The screens

**Overview.** Posture per project as an A to F grade (100 minus 30 per critical,
15 per high, 5 per medium, 1 per low; any critical is an F), the severity mix,
open findings over time, open against fixed, time to fix, the hosts scans
contacted (and the ones offline mode blocked), the last scans and recent loop
runs.

**Findings.** Every finding in the latest report per project. Filter by text
(`/`), project and severity, move with `j`/`k`. The detail panel shows the
evidence, the sources Penthera cites for that class of issue, how to fix it,
and, when a fix recipe matches, the exact diff the agent loop would propose.

![Findings with the detail panel and a fix diff](../assets/dashboard/findings.jpg)

**Agent.** "Run as agent" starts `penthera agent --loop` against a project
folder (and optionally the running app's URL). Output streams in as it
happens. Every diff stops the loop and shows an approval card: **Approve**
(`y`), **Skip** (`n`, not proposed again this run) or **Stop** (`q`). The
iteration timeline marks each fix as verified, failed and reverted, or
skipped. "Scan only" runs a plain scan and writes the report into the reports
folder instead.

![The agent loop waiting for a decision on a diff](../assets/dashboard/agent.jpg)

**Dependencies.** What the packages in your tree can do, the capability diff
against the base you compared with (added, upgraded with gained capabilities,
removed), typosquats, and every install firewall decision.

**AI tooling.** The agent-config grade and its history, the inventory, hidden
content hits (Unicode tag characters, zero-width text, instructions in HTML
comments and the rest), and drift against `penthera.lock`.

**Evidence.** Every bundle, with a Verify button that recomputes each SHA-256
against `manifest.json` and checks the SSH signature, exactly like
`penthera evidence verify`.

**Settings.** Egress mode for scans started from this page (offline is on by
default), where data is read from, and the state of every memory chain.

## Running the agent from the page

The page calls the same `runLoop` as `penthera agent --loop`, with the same
guarantees: the loop needs a clean git tree on a branch, works on a local
`penthera/fix-<yyyymmdd-hhmm>` branch, runs only allow-listed local git
commands with hooks off, is always offline with egress limited to the URL's
host, and never pushes. On top of that:

- The project folder must be inside one of the `--project` folders.
- A URL that is not on this machine (anything but `localhost`, `127.x.x.x`,
  `[::1]` and `*.localhost`) needs its hostname typed back before the run
  starts. That is the authorization gate: only scan what you own or have
  written permission to test.
- One run at a time. Closing the tab does not stop a run; come back to the
  Agent screen and it reattaches. **Stop** stops after the current step, and the
  fix branch holds only verified commits.
- The finished `loopRun` is written to the reports folder as
  `loop-<timestamp>.json`.

## Security model

The dashboard is a web server on your machine, so any page open in the same
browser can send it requests. Every request passes, in this order:

1. **Host check.** The `Host` header must be exactly `127.0.0.1:<port>` or
   `localhost:<port>`. This blocks DNS rebinding, where `attacker.example`
   re-resolves to 127.0.0.1 so the attacker's page can read the response.
   It runs before the token check, so a rebinding page cannot even redeem the
   link.
2. **Path check.** No dot segments, encoded dots or slashes, backslashes or NUL
   bytes in the path. Static files come from an allowlist built at startup;
   no part of a request path is ever joined onto a filesystem path.
3. **Session.** The one-time URL token is exchanged for an `HttpOnly;
   SameSite=Strict` cookie and a redirect to `/`, so the token leaves the
   address bar. Every request, static files included, needs the cookie.
   Requests without it are rate-limited (429 with `Retry-After`).
4. **Origin.** Every `POST` needs an `Origin` equal to the server's own (and
   `Sec-Fetch-Site: same-origin` when the browser sends it) and a JSON body, so
   a cross-site form or `fetch` cannot change anything.

Every response carries:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self';
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'; require-trusted-types-for 'script'
X-Frame-Options: DENY            X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer     Cache-Control: no-store
Cross-Origin-Opener-Policy / -Resource-Policy / -Embedder-Policy
```

There are no CORS headers, and `OPTIONS` gets a 405. The page has no inline
script or style, loads nothing from another host (no CDN, fonts, analytics or
chart library: the charts are hand-written SVG and block characters), and
never turns data into HTML: finding titles and evidence come from the sites and
repos you scanned, so they are only ever set as text.

Penthera scans its own dashboard clean with `--profile standard`, signed in and
not; `tests/ui.test.js` runs that scan on every test run, alongside tests for
the Host check, the token and cookie, Origin, the headers, the rate limit and
path traversal.

## Design notes

Black canvas, monospace throughout, box-drawing frames, faint scanlines, a
blinking block cursor, output that types itself out. One phosphor green for
identity and "this is fine", one electric blue for anything you can act on;
severity colours appear only next to a word or a number, never alone. All text
meets WCAG AA on black (body text 13.9:1, muted 7.8:1, the dimmest 5.0:1).

With `prefers-reduced-motion`, the typing, the cursor blink and the logo
flicker are off and output appears whole. Screens switch with `1`-`7` and have
no transition. Every control is a real button or link, the approval card takes
focus when a diff arrives, and screen readers get each log line whole (never
letter by letter) while approvals and run status are announced.

It also works at phone width:

<img src="../assets/dashboard/narrow.jpg" alt="The overview at 390px wide" width="300">

## Screenshots

All screenshots are of `penthera ui --demo`.

| | |
|---|---|
| ![Dependencies](../assets/dashboard/dependencies.jpg) | ![AI tooling](../assets/dashboard/ai-tooling.jpg) |
| ![Evidence verification](../assets/dashboard/evidence.jpg) | ![Agent](../assets/dashboard/agent.jpg) |
