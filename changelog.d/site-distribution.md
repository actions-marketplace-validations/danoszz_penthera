section: Site

- **Two landing pages, one search question each.** `/website-security-check`
  lists every check the live check runs and every request it sends;
  `/lovable-bolt-app-security` says what it finds in an app built with
  Lovable, Bolt or Base44, and what it cannot see, such as Supabase row level
  security. Both lead to the live check, are in the sitemap and `llms.txt`, and
  are linked from the footer. They are Markdown files in `site/pages/`.
- **IndexNow.** The key file is served at the site root, and
  `node scripts/indexnow.mjs` submits the sitemap's URLs after a deploy. It is
  run by hand, never by the build.
- **A 9:16 share card** for TikTok, Reels and Stories:
  `site/media/social/story.png` (1080 × 1920).
- **More npm keywords** for search on npmjs.com: `mcp-server`,
  `model-context-protocol`, `agent-skill`, `security-scanner`, `vibe-coding`,
  `secrets`, `website-security`, `security-headers`.
