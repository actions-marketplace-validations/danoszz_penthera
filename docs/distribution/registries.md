# MCP registries and directories

> **Project page.** For the maintainer asking "how do we list the MCP server and the skill, and what do we paste where?"

Drafts. Nothing has been submitted. The listing text itself (name, one line,
description, install block) is in [docs/mcp-listing.md](../mcp-listing.md);
this page adds the exact route for each place, what it needs from the repo,
and the order. All of them wait for 1.9.0 on npm `latest`
([checklist](release-1.9.0-checklist.md)), except skills.sh, which already
lists the skill.

Read on 23 October 2026. Check each page again before submitting.

## Order

| # | Where | Route | Needs from the repo |
|---|---|---|---|
| 1 | Official MCP Registry | `mcp-publisher publish` | nothing: `server.json` is ready |
| 2 | PulseMCP | nothing: it reads the Official MCP Registry | nothing |
| 3 | Glama | "Add MCP Server" on glama.ai | optional `glama.json` |
| 4 | mcp.so | an issue on chatmcp/mcp-directory | nothing |
| 5 | cursor.directory | the web form | a root `.mcp.json` for the server to be detected |
| 6 | Cline MCP Marketplace | an issue form | a 400 × 400 PNG logo; optional `llms-install.md` |
| 7 | Docker MCP Catalog | a PR to docker/mcp-registry | Dockerfile changes, a pinned commit |
| 8 | Smithery | `smithery mcp publish` with an MCPB bundle | an MCPB bundle (a new release artifact) |
| - | skills.sh | automatic | nothing: [already listed](https://www.skills.sh/danoszz/penthera/penthera) |

Items 5 to 8 need repo changes that are not in this PR. Each is a small PR of
its own with a changelog fragment, and none needs a version bump; the bundle
for Smithery would be built and attached at release time.

## 1. Official MCP Registry

The steps are in [release-1.9.0-checklist.md](release-1.9.0-checklist.md#5-publish-serverjson-to-the-official-mcp-registry-daan).
Source: [registry quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx)
and [versioning](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/versioning.mdx).

- [ ] Approved
- [ ] Live: date, link

## 2. PulseMCP

[pulsemcp.com/submit](https://www.pulsemcp.com/submit) says submissions are
paused (page updated 3 September 2026) and that servers published to the
Official MCP Registry are picked up automatically once they reopen. Nothing to
send. Check the listing a few weeks after step 1.

## 3. Glama

Glama indexes GitHub repositories and runs a license check, a security scan
and a health test that starts the server. Its score badge is what
punkpeye/awesome-mcp-servers asks for, so list here before that PR.

Steps (Daan, signed in with GitHub):

1. Open [glama.ai/mcp/servers](https://glama.ai/mcp/servers) and click "Add MCP Server".
2. Repository: `https://github.com/danoszz/penthera`
3. Name: `Penthera`
4. Description: the one line from [mcp-listing.md](../mcp-listing.md#fields).
5. After indexing, use "Claim with GitHub" (the repo is on a personal account).
6. Open the server's page and check the install command is pinned
   (`npx -y penthera@1.9.0 mcp`), not `npx penthera`.

Optional, in a small PR before step 1: `glama.json` at the repo root, so the
claim is tied to the maintainer:

```json
{
  "$schema": "https://glama.ai/mcp/schemas/server.json",
  "maintainers": ["danoszz"]
}
```

Unverified: what Glama's health test needs to start a stdio server from npm.
If it uses the repo's `Dockerfile`, the default `CMD ["--help"]` exits; see
the Docker section for the change that fixes both.

- [ ] Approved
- [ ] Live: date, link

## 4. mcp.so

The form at [mcp.so/submit](https://mcp.so/submit) asks for a repository URL
and a name. The only button that was visible on 23 October was a paid one
("Pay and submit automatically", $39). Do not pay. The free route in use is an
issue on [chatmcp/mcp-directory](https://github.com/chatmcp/mcp-directory/issues);
recent ones are closed as completed within days.

Title:

```
[Submit] MCP Server: Penthera (io.github.danoszz/penthera)
```

Body:

````markdown
- **Name:** Penthera
- **Type:** MCP Server (local, stdio)
- **Repository:** https://github.com/danoszz/penthera
- **Website:** https://penthera.org
- **Docs:** https://github.com/danoszz/penthera/blob/main/docs/commands/mcp.md
- **Official MCP Registry:** io.github.danoszz/penthera
- **License:** MIT
- **Authentication:** none
- **Description:** Offline, rule-based security checks for your repo, dependencies, AI agent config and local app. Every finding comes from a deterministic rule, with a confidence label and the evidence. The tools are read-only: they read only inside your workspace, never apply fixes, never run a shell, and send no attack payloads.

**Server config**

```json
{
  "mcpServers": {
    "penthera": {
      "command": "npx",
      "args": ["-y", "penthera@1.9.0", "mcp"]
    }
  }
}
```

**Tools**

- `scan_repo`: hardcoded secrets, code-execution sinks, API routes and runtime version pins, with evidence at file:line
- `check_dependencies`: what each npm or Python package can do, known-malicious packages and typosquats, offline from the lockfile
- `audit_ai_tooling`: skills, MCP servers, hooks and permissions, checked for hidden instructions, curl-pipe-shell, unpinned packages and inline secrets
- `runtime_advisories`: advisories and end of life for the PHP, nginx, Apache, Node.js, Python or OpenSSL an app runs
- `explain_finding`: why a rule matters and how to fix it
- `scan_url`: a passive scan of a running app on loopback or hosts you list with `--allow-host`
````

- [ ] Approved
- [ ] Live: date, link

## 5. cursor.directory

Submitted through the website only, at
[cursor.directory/plugins/new](https://cursor.directory/plugins/new): sign in
with GitHub, paste `https://github.com/danoszz/penthera`, submit. The site
detects components by path and a Cursor agent reviews the submission.

- `skills/penthera/SKILL.md` is detected as a skill already.
- The MCP server is detected only from a root `.mcp.json`. Adding one is a
  small PR, but it also configures the server for anyone who opens this repo
  in an agent, so it needs Daan's decision. If yes:

  ```json
  {
    "mcpServers": {
      "penthera": { "command": "npx", "args": ["-y", "penthera@1.9.0", "mcp"] }
    }
  }
  ```

  The new file's pin would join the version bump list in CONTRIBUTING.md.

Source: [cursor/community-plugins](https://github.com/cursor/community-plugins)
README. cursor.directory itself answered 429 to our reads, so the live form
was not seen.

- [ ] Approved
- [ ] Live: date, link

## 6. Cline MCP Marketplace

An issue from the template at
[cline/mcp-marketplace](https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml),
title prefix `[Server Submission]: `. The repo has about 2,865 open issues and
its last commit is from June 2025, so expect a long wait.

Needs first: a **400 × 400 PNG logo**. The repo only has
`assets/penthera-logo_white.png` (1233 × 278). A square mark on black, from
`src/ui/static/logo.svg`, is a five-minute job, but it is another session's
area (the dashboard refresh), so ask there.

Fields:

- **GitHub Repository URL:** `https://github.com/danoszz/penthera`
- **Logo Image:** the 400 × 400 PNG
- **Installation Testing:** tick both only after Daan has tried it: install in
  Cline from the README alone, run `scan_repo` on a project, done.
- **Additional Information:**

  > Penthera is an MIT-licensed, offline security agent. As an MCP server it gives Cline six read-only tools: secrets and risky code in the workspace, what each dependency can do, the project's AI agent config (skills, MCP servers, hooks), runtime advisories, explanations, and a passive scan of a loopback app. Findings come from deterministic rules with evidence and a confidence label. The tools read only inside the workspace, never apply fixes, never run a shell and send no attack payloads. Install: `npx -y penthera@1.9.0 mcp` (Node 22 or later). Docs: https://github.com/danoszz/penthera/blob/main/docs/commands/mcp.md

Optional, in the same small PR as the logo: an `llms-install.md` with the
`cline_mcp_settings.json` block, the Node 22 requirement and the read-only
guarantees.

- [ ] Approved
- [ ] Live: date, link

## 7. Docker MCP Catalog

A PR to [docker/mcp-registry](https://github.com/docker/mcp-registry) adding
`servers/penthera/server.yaml` (and a `tools.json`, which spares Docker's CI
from starting the server to list tools). Docker builds the image from
Penthera's own `Dockerfile` at a pinned 40-character commit and publishes it
as `mcp/penthera`. Every update later is a new PR that moves the commit.

Prerequisites on Daan's machine: Go 1.24 or later, Docker Desktop, Task.

```bash
task create -- --category security https://github.com/danoszz/penthera
task validate -- --name penthera
task build -- --tools penthera
```

Do not use the repo's `add_mcp_server.md` with an agent: it tells the agent to
push to the source repo and open PRs on its own.

Repo changes first, in a small PR:

- The `Dockerfile` label still reads "security scanner for web apps"; make it
  the approved one-liner.
- The image's default command is `--help`. The catalog entry sets the command
  instead (below), so the Dockerfile can stay as it is.
- In a container, the client's MCP roots are host paths that do not exist
  inside it, and roots sent by the client override `--root`. Check how the
  server behaves when every root is missing before submitting: it should fall
  back to `--root /src` or say clearly that it cannot read the root.

Draft `servers/penthera/server.yaml`:

```yaml
name: penthera
image: mcp/penthera
type: server
meta:
  category: security
  tags:
    - security
    - secrets
    - supply-chain
    - devsecops
about:
  title: Penthera
  description: Offline, rule-based security checks for your repo, dependencies and AI agent config. Read-only; no attack payloads.
  icon: https://raw.githubusercontent.com/danoszz/penthera/main/<400x400 logo path>
source:
  project: https://github.com/danoszz/penthera
  commit: <40-character SHA of the v1.9.0 commit>
run:
  command:
    - mcp
    - --root
    - /src
  volumes:
    - '{{penthera.path|volume-target}}:/src'
  disableNetwork: true
config:
  description: The folder Penthera may read. It reads only inside it and never writes.
  parameters:
    type: object
    properties:
      path:
        type: string
        default: /Users/you/projects/your-app
    required:
      - path
```

`disableNetwork: true` matches the offline design and turns `scan_url` into a
tool with nothing to reach. Say so in the PR. PR template answers: open
source (MIT), MCP compliant, active development, Dockerfile in the repo,
documentation at `docs/commands/mcp.md`, security contact
`https://github.com/danoszz/penthera/security/advisories/new`.

- [ ] Approved
- [ ] Live: date, link

## 8. Smithery

Smithery now lists local stdio servers as an MCPB bundle:
`smithery mcp publish ./penthera.mcpb -n danoszz/penthera`. Its publish docs
no longer mention `smithery.yaml` or npm packages. Penthera has no bundle yet.
A bundle is a zip with a `manifest.json` (`server.type: node`, the entry point,
`mcp_config` arguments `["mcp"]`). Building it at release time and attaching
it to the GitHub Release fits the rules: it is a static artifact, nothing is
downloaded at run time.

Recommendation: wait until the other listings are live, then decide whether a
bundle is worth a release artifact. Unverified: the Smithery CLI's install and
login commands.

- [ ] Approved
- [ ] Live: date, link

## skills.sh

Listing is automatic: skills.sh counts anonymous install telemetry from
`npx skills add` for public repos. Penthera is at
[skills.sh/danoszz/penthera/penthera](https://www.skills.sh/danoszz/penthera/penthera).
Nothing to submit. A badge exists at `https://skills.sh/b/danoszz/penthera`;
check that it renders before adding it to the README.
