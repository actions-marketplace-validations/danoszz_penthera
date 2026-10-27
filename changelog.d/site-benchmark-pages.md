section: Site

- **The public benchmarks have their own pages.** [penthera.org/benchmarks](https://penthera.org/benchmarks)
  and one page each for secrets, npm malware, PyPI malware and JavaScript
  injection bugs, built from `bench/public/published.json` when the site is
  built. Each page shows every tool with its rank, score, 95% interval and
  counts, the tools that were not ranked and why, where another tool does
  better than Penthera, and the limits first. Each carries schema.org Dataset
  markup, a Markdown copy for agents and its own share card.
- **The homepage says what Penthera is in its title and description**, and its
  benchmark cards link to the pages. The sitemap dates every URL.
- **`llms.txt`, `llms-full.txt` and `/index.md` lead with the four public
  rankings.** The bundled lab numbers are labelled as regression checks.
- **`docs/compare/README.md` no longer says no page compares detection.** It
  points to the public benchmark and says which of the compared tools are in it.
