# Social plan: TikTok, Instagram, LinkedIn and X

> **Project page.** For the maintainer asking "what do we film and post, and what may be on screen?"

Drafts. Nothing has been posted or recorded. Daan records and posts each one
from his own accounts after approving it.

## The rule for every post

**Only scan your own apps, or apps whose owners consent on camera.** Not a
competitor, not a famous site, not a "let's see how X does", not blurred. If an
owner takes part, record their consent at the start of the clip (name, the
app, "yes, you may check it and post the result") and keep the raw file.

Also:

- Show real numbers from the real run. If the score is not 64 on the day, the
  post uses the number you got. Never re-run until the number looks better.
- Never show a live secret. Use a fake key in a throwaway demo app, or revoke
  the key before you record. The check shows keys redacted, but the code
  editor does not.
- Say the limit in the post: "passive", "your own site only", "not a pentest".
- One link per post: `penthera.org`. Pinned install lines (`npx penthera`).

Formats:

| Platform | Format | Card |
|---|---|---|
| TikTok, Instagram Reels and Stories | 9:16, 1080 × 1920, 20 to 45 s, burned-in captions | `site/media/social/story.png` as the cover or end frame |
| Instagram feed | 1:1 or 4:5 | `site/media/social/square.png` |
| LinkedIn | native video (1:1 or 9:16) or the square card, text up to about 1,300 characters | `square.png` |
| X | video or `og.png` (the link card), 280 characters | `og.png` |

Keep the top 220 px and the bottom 360 px of a 9:16 frame free of text: the
apps put their own buttons and captions there. `story.png` already does.

Order: post 1 first, then one post every three or four days. Post 4 fixes
penthera.org's own gap, so record it when you actually fix SPF and DMARC.

## 1. 64 to 100 in 3 minutes

The live check on Daan's own app, Prompt to fix into his coding agent, deploy,
check again.

Before recording: pick one of Daan's own deployed apps with a mid score. Run
the check once off camera to know what it finds, then reset nothing: the real
first run is the one you film.

| Time | Picture | On-screen text | Voice (or caption) |
|---|---|---|---|
| 0 to 2 s | The score "64/100" filling in | `64 → 100 in 3 minutes` | "This is my own app. 64 out of 100." |
| 2 to 8 s | The report: the failed checks open, one finding's evidence | `my own app · passive check` | "No HSTS, no CSP, a cookie without HttpOnly." (read what it actually says) |
| 8 to 14 s | Click "Prompt to fix", pick all, copy | `Prompt to fix` | "One prompt for my coding agent, with the fix and a command to verify each one." |
| 14 to 24 s | Paste into Claude Code or Cursor; the diff to the hosting config (sped up, timer on screen) | `real time: 2:41` (the real time) | "It changes the headers in my hosting config. I read the diff, I deploy." |
| 24 to 30 s | "Check again", the score climbs to 100 | `100/100` | "A hundred. Every fix verified." |
| 30 to 35 s | End card `story.png` | `penthera.org · free · your own site only` | "Check your own site. Free, passive, nothing stored." |

Captions:

- **TikTok / Reels:** `My own app went from 64 to 100 in 3 minutes. Free passive security check, then one prompt for my coding agent. Your own site only. penthera.org`
- **LinkedIn:**

  > I checked one of my own apps with Penthera's live check: 64 out of 100. Missing HSTS and a Content-Security-Policy, and a cookie without HttpOnly.
  >
  > "Prompt to fix" turned the failed checks into one prompt for my coding agent, with the evidence, the fix and a curl command to verify each. It changed my hosting config; I read the diff and deployed. The second check: 100. Real time, 3 minutes.
  >
  > The check is passive: it loads what one browser visit loads, at most 20 requests, and stores nothing. A good score means the outside is in order; it is not a penetration test, and it cannot see your database rules or your API's authorization.
  >
  > It is free and open source. Check your own site: penthera.org

- **X:** `My own app: 64/100 → 100/100 in 3 minutes. A passive check (20 requests, nothing stored), one prompt for my coding agent, deploy, check again. Free and open source. Your own site only: penthera.org`

Replace 64, the findings and the time with what actually happened.

- [ ] Approved
- [ ] Recorded on: <app>, date
- [ ] Posted: links

## 2. What your JavaScript bundle gives away

A throwaway demo app of Daan's, built with an AI app builder, with a **fake**
OpenAI-shaped key in a `VITE_` variable.

| Time | Picture | On-screen text | Voice |
|---|---|---|---|
| 0 to 3 s | The browser's dev tools, the bundle, a search for `sk-` | `Everything in your bundle is public` | "Anything the browser downloads, anyone can read." |
| 3 to 10 s | The live check on the demo app: "A secret key is in what the page sends", redacted | `demo app · fake key` | "Penthera finds the key, shows it redacted, and says where." |
| 10 to 18 s | The fix text: revoke, move the call to a server function | `VITE_ · NEXT_PUBLIC_ · REACT_APP_ = public` | "Variables with these prefixes are copied into the bundle. Revoke the key, call the API from your server." |
| 18 to 25 s | End card | `penthera.org/lovable-bolt-app-security` | "Check your own app." |

Caption (all platforms, shortened for X): `Your VITE_ and NEXT_PUBLIC_ variables end up in the JavaScript anyone can download. A free passive check finds keys in your own app's bundle and shows them redacted. Demo app, fake key. penthera.org`

- [ ] Approved
- [ ] Posted: links

## 3. Your agent's config is code

`npx penthera agents` on the malicious fixture in Penthera's own tests
(`tests/fixtures/agents/malicious`), the same files as "Load an example" on
penthera.org. No real project, no third party.

| Time | Picture | On-screen text | Voice |
|---|---|---|---|
| 0 to 3 s | A `.mcp.json` and a hook that pipes `curl` into `sh` | `Would you run this?` | "Your coding agent runs this every session." |
| 3 to 15 s | `npx penthera agents` in the terminal: the grade and the findings | `offline · read-only` | "Penthera reads skills, MCP servers, hooks and permissions, and grades them. Hidden instructions, curl into a shell, unpinned packages, secrets inline." |
| 15 to 22 s | `npx penthera agents --pin` writing `penthera.lock` | `pin it` | "Pin what you checked, so a change shows up next time." |
| 22 to 28 s | End card | `npx penthera agents` | "Free, MIT, offline." |

Caption: `MCP servers, hooks and skills run with your permissions. npx penthera agents checks them offline: hidden instructions, curl into a shell, unpinned packages, inline secrets. Test fixture, not a real project.`

- [ ] Approved
- [ ] Posted: links

## 4. Two DNS records: penthera.org from 95 to 100

penthera.org's own report shows 95/100 with one gap: no SPF or DMARC record.
Record the real fix when Daan makes it.

| Time | Picture | On-screen text | Voice |
|---|---|---|---|
| 0 to 3 s | penthera.org's report: 95, "No SPF or DMARC record" | `our own site: 95/100` | "Our own site. 95. One gap." |
| 3 to 12 s | The DNS panel: an SPF record for a domain that sends no mail, and a DMARC record | `v=spf1 -all` · `v=DMARC1; p=reject` | "This domain sends no mail, so: nobody may send as us." |
| 12 to 18 s | Check again: 100 | `100/100` | "A hundred." |
| 18 to 24 s | End card | `penthera.org` | "Without these two records, anyone can send mail that claims to be you." |

Only use `v=spf1 -all` and `p=reject` if penthera.org really sends no mail. If
it does, show the records that fit, and say why.

- [ ] Approved
- [ ] Posted: links

## 5. What a passive check cannot see

The honest one. A talking head or text on screen, no scan of anyone's site.

| Time | On-screen text | Voice |
|---|---|---|
| 0 to 3 s | `100/100 does not mean safe` | "A score of 100 does not mean your app is safe." |
| 3 to 12 s | `can't see: login · database rules · API authorization` | "A passive check sees what a browser sees. Not what is behind your login, not your database rules, not who may read whose data." |
| 12 to 20 s | `npx penthera --repo .` | "For the code, run Penthera on your own machine. Your code stays there." |
| 20 to 26 s | `known problems, not novel ones` | "It finds known classes of problems. It is not a pentest. The evidence is there so you can check every finding." |
| 26 to 30 s | End card | "penthera.org" |

Caption: `What a free passive security check can't see: anything behind your login, your database rules, your API's authorization. For the code, npx penthera --repo . on your own machine. penthera.org`

- [ ] Approved
- [ ] Posted: links
