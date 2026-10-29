# Blog posts

> **Project page.** For anyone writing a post for penthera.org/blog, asking "how does a post get published?"

One Markdown file per post, built by `site/blog.mjs`. The front matter and the
rules are in that file's header. In short:

- `approved: false` is a draft. The build checks it and publishes nothing:
  no page, no index entry, no feed entry, no sitemap or llms.txt line. Only
  Daan sets `approved:` to a date, and that publishes the post.
- Preview drafts locally with `PENTHERA_BLOG_DRAFTS=1 node site/build.mjs`,
  then `node site/serve.mjs`. Drafts render with noindex and stay unlisted.
- Numbers from the public benchmark are placeholders, `{{fact:secrets.penthera.f1}}`,
  filled from `bench/public/published.json`. Any other number must appear
  verbatim in a file listed in `sources:`. `npm test` checks both.
- Follow the [voice guide](../docs/voice.md): one question per post in the
  quote line, numbers with their sample and interval, limits next to claims.
- Figures are SVGs in `figures/`, drawn by `figures/make.mjs`. Show one inline
  as a paragraph that starts with `![alt text](figures/<name>.svg)`, with the
  caption on the next lines. The alt text says what the figure shows; the
  build serves the file at `/blog/figures/` and fails on a missing file or a
  missing alt text.
