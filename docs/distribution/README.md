# Distribution drafts

> **Project page.** For the maintainer asking "where do we list and post Penthera, and what exactly do we send?"

Everything in this folder is a **draft**. Nothing here has been submitted,
posted or opened. Each item goes out only after Daan approves that item, and
Daan sends it from his own accounts. Tick the box next to an item when it is
approved, and add the date and link when it is live.

The rules that hold for every item:

- **Only your own apps.** Every scan in a post, a video or a screenshot is of an
  app Daan owns, or of an app whose owner consents on camera. No third-party
  sites, not even blurred.
- **Numbers with their sample.** "Precision 0.88, 95% CI 0.69 to 0.96, on 24
  findings in labs we wrote ourselves", never "highly accurate". The
  [voice guide](../voice.md) applies to every line.
- **Pinned versions.** Every install line names a version. Until 1.9.0 is on
  npm `latest`, the MCP server is `penthera@1.9.0-rc.1` on the `next` tag.
- **Human-written where the community requires it.** Hacker News, dev.to and
  some subreddits do not allow generated text. For those, the draft is a fact
  sheet and an outline; Daan writes the post himself.

## Order of work

1. **Fix the host first.** penthera.org redirects to www.penthera.org (308),
   while the sitemap, `robots.txt`, `security.txt`, `server.json` and every
   listing below name `https://penthera.org`. A sitemap whose URLs all redirect
   is reported as an error in Google Search Console and Bing Webmaster Tools.
   In Vercel, under Project → Settings → Domains, make `penthera.org` the
   primary domain and redirect `www.penthera.org` to it. The homepage's
   canonical URL follows Vercel's production domain, so after a redeploy it
   says `https://penthera.org/` too. (Setting `SITE_URL=https://penthera.org`
   in Vercel does the same for the canonical, but leaves the redirect.)
2. Add the site in Google Search Console and Bing Webmaster Tools, submit
   `https://penthera.org/sitemap.xml`, then run `node scripts/indexnow.mjs`
   (see [site/README.md](../../site/README.md#after-a-deploy)).
3. Promote 1.9.0 when it is ready: [release-1.9.0-checklist.md](release-1.9.0-checklist.md).
   The MCP listings wait for it.
4. Registries and directories: [registries.md](registries.md).
5. Awesome lists: [awesome-lists.md](awesome-lists.md).
6. Launch posts: [launch-posts.md](launch-posts.md).
7. Social: [social-plan.md](social-plan.md).

## Status

| Item | Waits for | Approved | Live |
|---|---|---|---|
| Vercel primary domain to penthera.org | Daan, in Vercel | [ ] | |
| Search Console, Bing Webmaster Tools, IndexNow | the domain change | [ ] | |
| npm `latest` to 1.9.0 | real use of rc.1, Daan's go | [ ] | |
| Official MCP Registry | 1.9.0 on `latest` | [ ] | |
| Glama | 1.9.0 | [ ] | |
| Docker MCP Catalog | 1.9.0, the repo changes listed there | [ ] | |
| Smithery | an MCPB bundle (not built) | [ ] | |
| PulseMCP | submissions are paused; it reads the Official MCP Registry | [ ] | |
| mcp.so | 1.9.0 | [ ] | |
| Cline MCP Marketplace | a 400 × 400 logo | [ ] | |
| cursor.directory | 1.9.0, a root `.mcp.json` for the server | [ ] | |
| skills.sh | nothing: already listed | n/a | [skills.sh](https://www.skills.sh/danoszz/penthera/penthera) |
| punkpeye/awesome-mcp-servers | Glama listing | [ ] | |
| hesreallyhim/awesome-claude-code | Daan, by hand in the issue form | [ ] | |
| VoltAgent/awesome-agent-skills | nothing | [ ] | |
| analysis-tools-dev/static-analysis | the repo being 6 months public (about 30 Dec 2026) | [ ] | |
| sottlmarek/DevSecOps | nothing | [ ] | |
| Show HN | 1.9.0, Daan's own text | [ ] | |
| Product Hunt | 1.9.0, gallery images | [ ] | |
| Lobsters | an account older than 70 days | [ ] | |
| dev.to | Daan's own text | [ ] | |
| Reddit: r/webdev, r/ClaudeAI, r/cursor, r/vibecoding | each sub's live rules, read again | [ ] | |
| Social posts 1 to 5 | recording on Daan's own app | [ ] | |

The share cards are in `site/media/social/`: `og.png` (1200 × 630, links),
`square.png` (1080 × 1080) and `story.png` (1080 × 1920, TikTok, Reels and
Stories). `node site/tools/social.mjs` renders them again.

Sources were read on 23 October 2026. Directories change their forms often;
open each one's current page before pasting.
