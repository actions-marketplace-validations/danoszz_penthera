# Site

> **Project page.** For "how is the website built, and how do I change it?"

The landing page, a static site for Vercel. The decisions behind it are in
[BRIEF.md](BRIEF.md). It is not part of the npm package.

```bash
node site/build.mjs     # writes site/dist
node site/serve.mjs     # http://127.0.0.1:4173/ with the production headers
```

## What is where

| Path | What it is |
|---|---|
| `index.html` | The page and all its copy. `{{NAME}}` placeholders are measured numbers the build fills in: rule counts, the popular-list size, the benchmark from `bench/RESULTS.md`, and the GitHub star count (the build's one request; `PENTHERA_SITE_STARS=<n>` or `off` to skip it). |
| `news.json` | The ticker at the top: dated, one-line items, each with an https source. The build renders it (and refuses an item without a source); edit it to change the news. |
| `styles.css` | System 1-bit, as in `penthera ui`. Tokens and contrast measurements are in its header. |
| `theme.js` | Sets the theme before paint. A choice is kept in localStorage, never a cookie. |
| `check/` | The browser check. `engine.js` calls `lib/`; `ui.js` is the page script; `copy.js` holds its strings; `field.js` is the hero's live field (a dithered cloud, a pointer lens with a soft glow, and a click shockwave on a canvas; off under reduced motion, where `media/field.png` stays). |
| `check/shims/` | The Node built-ins `lib/` uses, for the browser: an in-memory `fs`, POSIX `path`, a synchronous SHA-256, and `gunzipSync` fed by DecompressionStream. |
| `build.mjs` | Bundles `check/` with `lib/` (rolldown), embeds the rule packs and the popular-package list, verifies each pack's signature, and copies the media. |
| `serve.mjs` | A local preview that sends the headers from `vercel.json`. |
| `../vercel.json` | At the repo root, so Vercel needs no settings: install, build (`node site/build.mjs`), output (`site/dist`) and the security headers: CSP with `connect-src 'none'`, HSTS, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`. |
| `stars.json` | The last GitHub star count the build read, used when the API is rate-limited or offline. Set `GITHUB_TOKEN` in Vercel to avoid the anonymous limit. |
| `tools/social.mjs` | Renders `media/social/og.png` (1200 × 630, the share card for LinkedIn, X and Facebook) and `square.png` (1080 × 1080, Instagram) with a local Chrome. Re-run it when the headline changes. |
| `media/` | `field.png` (the hero's 1-bit cloud), `hero.mp4` and its poster, regenerated with `tools/media.sh`; `dvdzwaag.svg`, the maker's wordmark traced with potrace from Daan's own artwork, used as a mask so it takes the ink. |

## The browser check

`lib/` reads files with `node:fs`. In the page, the visitor's files are
mounted in an in-memory folder (`/repo`) and the rule packs and lists under
`/penthera`, and these functions run unchanged:

- `scanAgents` (lib/agents): MCP servers, hooks, permissions, instruction files
- `scanSecrets` (lib/whitebox/secrets.js)
- `scanPackage`, `findTyposquats`, `loadIocs` and the finding builders in
  `lib/deps/findings.js`, for `package.json`

`tests/site.test.js` builds the engine and compares its findings with the
CLI's on `tests/fixtures/agents/*` and the deps fixture. If a change to `lib/`
needs a Node built-in the shims do not have, the build fails and names it.

The rule packs' signatures are checked at build time with
`lib/rules/sshsig.js`; the build refuses a pack whose signature does not
verify. In the page, `lib/rules/pack.js` still checks every rule file against
the SHA-256 in its `pack.json`.

## Deploying

Import the repository in Vercel and deploy; leave the root directory at the
repository root and the framework preset on "Other". Everything else comes
from `vercel.json` at the root: it runs `npm ci` there (the build reads
`lib/` and uses `rolldown` from the root `package.json`), builds with
`node site/build.mjs` and serves `site/dist`.
