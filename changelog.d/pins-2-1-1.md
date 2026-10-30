section: Docs

- Every command, MCP config and workflow example pins `penthera@2.1.1`, the
  new `latest`, and the action examples pin the v2.1.1 commit. The roadmap and
  README show 2.1.1 as the current release, and the upgrade test in the install
  matrix starts from 2.1.1. `penthera init` still writes the v2.1.0 pin until
  the next release.
- Pages that said the 2.1.0 agent rules ship in the next release now say they
  shipped. `AGENTS.md` and the integrations page name the redirect that
  `scan_url` allows within the target's registrable domain.
