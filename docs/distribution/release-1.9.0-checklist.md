# Release checklist: 1.9.0-rc.1 to 1.9.0, then the MCP Registry

> **Project page.** For the maintainer asking "what are the exact steps to put 1.9.0 on npm `latest` and list the MCP server?"

This follows [Cutting a release](../../CONTRIBUTING.md#cutting-a-release) and
the [release cadence](../../CONTRIBUTING.md#release-cadence-and-freeze). Daan
gives the go, pushes the tag and approves the npm version with 2FA. A coding
agent may prepare the release branch and the PR; it does not bump, tag or
publish on its own.

Where things stand on 23 October 2026: `latest` is 1.8.1, `next` is
1.9.0-rc.1 (since 22 October), and the Official MCP Registry has no entry for
`io.github.danoszz/penthera`.

## 1. Decide that rc.1 is ready

- [ ] rc.1 has run on real projects without a blocking issue. Write down which
      projects and what broke, if anything.
- [ ] No open issue is labelled as blocking 1.9.
- [ ] The feature freeze held: since rc.1, only fixes and docs went in. If a
      fix changed behavior, cut `1.9.0-rc.2` first and repeat this section.
- [ ] Daan's go, in writing (the PR or an issue), with the date.

## 2. Prepare the release branch (a PR, no tag yet)

- [ ] Branch from `main`: `release/1.9.0`.
- [ ] Bump every version string. CI fails if one drifts:
  - `package.json` and `package-lock.json`: `npm version 1.9.0 --no-git-tag-version`
  - `skills/penthera/SKILL.md` (`metadata.version`)
  - `.claude-plugin/plugin.json` (`version`)
  - `.claude-plugin/marketplace.json` (`metadata.version`)
  - `CITATION.cff` (`version`)
  - `docs/METHODOLOGY.md` (the "How to cite" block)
  - `server.json`: both `version` and `packages[0].version` to `1.9.0`, and
    the pins in `docs/mcp-clients/` (a test keeps them equal)
- [ ] Fold the changelog: `npm run changelog -- --release 1.9.0 YYYY-MM-DD`.
- [ ] Refresh the typosquat list: `npm run refresh:popular`; commit
      `lib/deps/popular-packages.json.gz` if it changed.
- [ ] `npm test` and `npm run lint` pass.
- [ ] `npm run audit:internal` passes. Commit `audit/REPORT.md` and read
      "Changes since the previous report". A new self-scan finding is fixed or
      accepted in `audit/baseline.json` with a reason; no threshold is loosened.
- [ ] Open the PR. It needs a green "install matrix result" as well as CI.
- [ ] Merge to `main` once both are green.

## 3. Tag and publish (Daan)

- [ ] Tag the merge commit: `git tag v1.9.0 && git push origin v1.9.0`.
      Never tag a commit whose audit failed.
- [ ] `publish.yml` tests, checks the tag against `package.json`, stages the
      package with provenance and creates the GitHub Release. Wait for it.
- [ ] Check the staged package: the file list, the provenance, and that
      `package.json` in it has `"mcpName": "io.github.danoszz/penthera"`.
- [ ] Approve with 2FA: npmjs.com → penthera → Staged Packages → Approve, or
      `npm stage list penthera` and `npm stage approve <stage-id>`.
- [ ] Confirm: `npm view penthera dist-tags` shows `latest: 1.9.0`. Move `next`
      too if it should no longer point at rc.1: `npm dist-tag add penthera@1.9.0 next`.
- [ ] Try it from a clean folder: `npx -y penthera@1.9.0 --version`, then
      `claude mcp add penthera -- npx -y penthera@1.9.0 mcp` and list the tools.

## 4. After the version is live

- [ ] Update the pins users copy: `README.md`, `AGENTS.md` (the "Using
      Penthera from an agent" table), `docs/commands/mcp.md`, the Building in
      public table in the README.
- [ ] Move `FROM_VERSION` in `.github/workflows/install-matrix.yml` to 1.9.0.
- [ ] Redeploy penthera.org so the site and `llms.txt` say 1.9.0. While the
      version is a release candidate, the site says the MCP server is on
      `next`; that note disappears on its own with a stable version.
- [ ] Optional: `npm run package:skill` and attach the zip to the release.

## 5. Publish `server.json` to the Official MCP Registry (Daan)

The registry is in preview: its docs say data may be reset before general
availability. It stores metadata only; the npm package must already be live
with a matching `mcpName`. A version can be published once and never changed.

```bash
brew install mcp-publisher
mcp-publisher validate
mcp-publisher login github
mcp-publisher publish
```

- [ ] Run these from the repo root on the `v1.9.0` commit, so `server.json`
      says 1.9.0.
- [ ] `login github` is a device flow: open https://github.com/login/device,
      enter the code, sign in as `danoszz`. The `io.github.danoszz/` namespace
      only works for that account.
- [ ] Check the listing:
      `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.danoszz/penthera"`
- [ ] If publish fails with "Registry validation failed for package", the
      npm version has no `mcpName`. "You do not have permission" means the
      GitHub account does not match the namespace.

Do not publish `1.9.0-rc.1` to the registry. The registry orders versions by
semver, so an rc would be the listed "latest" until 1.9.0 arrives, and the
listings that copy from the registry (PulseMCP among them) would pick it up.

## 6. Then

- [ ] The MCP directories in [registries.md](registries.md), in the order given there.
- [ ] Update `docs/mcp-listing.md` and this folder's status table with the dates and links.
