# E10 pilot misses: verification

> Pilot follow-up, one provisional labeller. Each miss in the standard run of the pilot ([RESULTS.md](RESULTS.md)) was checked before any code was written: against the pinned app (image digest and source commit as in the pilot, started on 127.0.0.1), against Penthera's code, and against the answer key. Verdicts: **gap** (a real detection gap), **artefact** (a scoring or matching problem in the pilot), **out of scope** (on reflection, not something Penthera should find).

None of the 13 is an artefact: each answer-key entry is right, the scorer would have matched a correct finding, and Penthera made none. The task list named 12; DVNA's `dom-xss-users-source` is the 13th miss of the standard run.

| App | Miss | Verdict | Evidence | Fix | After |
|---|---|---|---|---|---|
| dvna | `x-powered-by` | gap | `GET /login` answers `X-Powered-By: Express`. The header audit only looked for missing headers, and mentioned `X-Powered-By` (as info) only for uvicorn, gunicorn or Werkzeug. | #107 | found |
| juice-shop | `metrics` | gap | `GET /metrics` returns 200, `text/plain; version=0.0.4`, Prometheus `# HELP`/`# TYPE` lines. No template requested `/metrics`. | #108 | found |
| juice-shop | `ftp-listing` | gap | `GET /ftp` is a serve-index page (`<title>listing directory /ftp</title>`); `robots.txt` says `Disallow: /ftp`. The only listing template checked `/api/`, and nothing read robots.txt paths. | #108 | found |
| juice-shop | `error-handling` | gap | `GET /api/<unknown>` and `/rest/<unknown>` return 500 with an Express stack trace (`at /juice-shop/build/routes/angular.js:18:18`). Endpoint discovery's own calibration requests got this page; nothing looked at it. | #108 | found |
| juice-shop | `logs-listing` | gap, deliberately left | `/support/logs` is a serve-index listing of access logs, and the listing check from #108 recognizes it. But no link, robots.txt entry or common wordlist names `/support/logs`; adding it would fit the scanner to this app. A listing found elsewhere does not lead to it. | none | miss |
| juice-shop | `iac-listing` | gap, deliberately left | Same as `logs-listing`: `/infrastructure` is a listing nothing on the site points to. | none | miss |
| juice-shop | `iac-private-key` | gap | `infrastructure/terraform/networking.tf` holds an RSA private key inline. `.tf` was not among the secret scan's file types, so the file was never read; the existing "Private key block" rule matches it once read. | #110 | found |
| dvna | `session-secret` | gap | `server.js`: `session({ secret: 'keyboard cat', ... })`, express-session's documented example. The only session rule needed a key named `session_secret`/`jwt_secret`. | #110 | found |
| juice-shop | `b2b-eval` | gap | `routes/b2bOrder.ts` puts `body.orderLinesData` (destructured from the request) into a `vm` context and runs `safeEval` on it. The repo scan took Express's `routes/` folder for a Next.js API root, found no `route.ts` files and returned before any code-pattern check. | #111 | found |
| juice-shop | `profile-eval` | gap | `routes/userProfile.ts` line 65: `eval(code)` on part of the stored username. Same early return as `b2b-eval`. | #111 | found |
| dvna | `cmdi-ping` (source) | gap | `core/appHandler.js` line 39: `exec('ping -c 2 ' + req.body.address)`. Same early return; the file is also a helper module that no route check reads. (The URL half of this root cause needs a login and payloads, so it is outside the standard run.) | #111 | found |
| juice-shop | `mongo-image` | gap, needs a decision | `infrastructure/docker-compose.yml` pins `mongo:4.4.29`; MongoDB 4.4 reached end of life in February 2024. The runtime-advisory engine knows PHP, Apache, nginx, Node.js, Python and OpenSSL, not MongoDB. Adding it means a new product in `lib/advisories/products.js` and end-of-life rows in the **signed** advisories pack, which only the maintainer can sign. | none yet | miss |
| dvna | `dom-xss-users-source` | gap, deferred | `views/app/adminusers.ejs` assigns API data to `innerHTML` in a script block. The repo scan does not read `.ejs` templates, and an `innerHTML` rule without data-flow would fire on most front-end code. A useful rule needs taint from a fetch or XHR response to the sink; not attempted here. | none | miss |

## Also seen, not fixed here

- `lib/templates.js`: the `.env.local` template's regex starts with `(?m)`, which JavaScript rejects, so that template can never match. (Noted in #108.)
- The repo scan still takes an Express `routes/` folder for a Next.js API root and returns early. #111 runs the code-sink pass before that point, so sinks are found anyway, but the route and trust-boundary analysis still never runs for such repos. Fixing route detection changes `src/scan-repo.js` around the code #96 edits, so it waits for #96.
- Deep-run misses (`search-sqli`, `login-sqli`, `open-redirect` on both apps) were outside this round: the task covered the standard run. The pilot notes that deep probes never run on DVNA because every route redirects to the login page.
