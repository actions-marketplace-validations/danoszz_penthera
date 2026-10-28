section: Docs

- **The docs build as a Mintlify site.** `docs/docs.json` gives them the same
  five journeys as the docs index (new, AI coding tools, CI, auditors,
  research), in Penthera's colours. Mintlify's checker passes: three pages
  that MDX couldn't parse are fixed, and links that leave the docs folder now
  point to GitHub, so they work on GitHub and on the docs site alike.
  `references.md` now writes plain links instead of `<url>` autolinks.
