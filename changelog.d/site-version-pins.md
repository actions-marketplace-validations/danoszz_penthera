section: Site

- **Every version pin on penthera.org comes from `package.json`.** The MCP
  configs and `llms.txt` pinned `penthera@1.9.0`, which is not on npm, so an
  agent that followed them failed. The build now fills in the package version
  (1.9.0-rc.1 today) everywhere, notes that the MCP server is on npm's `next`
  tag while the version is a release candidate, and a test fails if a pin is
  written into the page by hand.
