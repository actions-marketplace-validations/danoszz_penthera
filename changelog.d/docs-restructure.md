section: Docs

- **Docs reorganized around five journeys.** [docs/index.md](../docs/index.md)
  now starts from who you are: I'm new, I use AI coding tools, I run it in CI,
  I need evidence for an auditor, I'm a researcher. The five `docs/use-cases/`
  pages are folded into the command pages that answer the same question, and
  `docs/archive/` is removed (git history keeps it).
- **A shorter README.** What it is, a 30-second start (CLI, skill, MCP), what
  it checks, and how far to trust it, with the benchmark and E10 caveats next
  to the numbers.
- **`AGENTS.md`** for coding agents working on or with Penthera: commands,
  layout, the rules CI enforces, and pinned versions.
- **Correct version pins.** MCP examples pin `penthera@1.9.0-rc.1` (npm `next`)
  until 1.9.0 ships; CI examples pin 1.8.1 instead of 1.7.0. CONTRIBUTING,
  ROADMAP and SECURITY describe the 1.9 release candidate.
