# Rule packs

A rule pack is a directory of detection data that Penthera verifies before it
uses a single rule. This is how new knowledge about attacks (a new key format,
a worm's package list, a fresh prompt-injection trick) reaches Penthera without
Penthera ever fetching anything at run time.

```bash
penthera rules list                         # packs in effect
penthera rules verify ./my-pack             # signature, hashes, schema, ReDoS guard
penthera deps --rules ./my-pack             # add a pack to a scan (repeatable)
penthera --repo . --rules ./my-pack
```

## Trust model

Packs reach Penthera in two ways only:

1. **Bundled in a release.** `lib/rules/<name>/` ships inside the npm package.
   Releases are staged on npm by CI and go live only when the maintainer
   approves them with 2FA (see `.github/workflows/publish.yml`). The publish
   workflow runs `npm run rules:check`, which refuses to stage a release with a
   bundled pack that is not signed by a key in `lib/rules/allowed_signers`. So a
   rule change has to pass through the maintainer's signing key, which never
   enters CI, as well as through the 2FA approval.
2. **By path, from you.** `--rules <dir>` loads a pack from a directory you
   name. It must be signed by a key in `lib/rules/allowed_signers` or in a file
   you pass with `--rules-signers <file>`.

There is no third way. Penthera has no rule server, no update command, no
background refresh and no URL it pulls rules from. The rule-pack code
(`lib/rules/`) has no network code at all, and a test asserts that.

### Why no runtime fetching

A rule feed is a path from somebody else's server into a tool that runs with
your network access, and often with your credentials and your source code. Rule
updates are exactly the kind of channel attackers go after: compromise the feed
and every scanner that trusts it runs your rules, or reports your malware as
clean. Securing such a channel properly takes signed metadata, key rotation,
freshness guarantees and trust delegation (TUF, in-toto) [samuel2010survivable,
torresarias2019intoto]. Penthera already has a channel with those properties
for its code: the release. Shipping rules through that same channel adds no new
way in, and the rules you ran are the rules in the version you installed.

The cost is latency: a new IOC reaches you when you upgrade, not within the
hour. For the campaigns these packs target, an IOC is most useful in the days
and weeks after disclosure, while compromised versions sit in lockfiles and
npm caches. If you need something faster, write a pack yourself, sign it with
your own key, and pass it with `--rules` and `--rules-signers`. Penthera never
decides on your behalf to trust a new source.

### What verification checks

In order, and a failure refuses the whole pack (there is no partial load):

1. **Signature.** `pack.json.sig` is an OpenSSH signature (`ssh-keygen -Y
   sign`, namespace `penthera-rules`) over the exact bytes of `pack.json`. The
   signing key must be in an allowed_signers file, with `namespaces`
   (if set) including `penthera-rules` and `valid-after`/`valid-before`
   respected. Penthera verifies it in Node (ed25519 or RSA ≥ 2048), so it needs
   no `ssh-keygen` at run time.
2. **File hashes.** Every rule file's SHA-256 must match `pack.json`. Rule files
   must be plain names in the pack directory: no paths, no `..`, no symlinks,
   size-capped.
3. **Schema.** Every rule is validated against its kind (below). Strings that
   reach your terminal or report may not contain control characters, ANSI
   escapes or bidi overrides. Template paths must stay on the scan target.
   `min_penthera` must not be newer than your Penthera.
4. **ReDoS guard.** Every regex must pass `lib/rules/regex-guard.js` (below).

An unsigned pack, or one whose signature does not verify against a trusted
key, is refused unless you pass `--allow-unsigned-rules`. That flag prints a
loud warning on every run. It skips the signature check only: hash, schema and
ReDoS failures are refused with or without it.

Bundled packs are hash-checked and schema-checked on every start. A failure
there means the installation is damaged, and Penthera stops rather than run
with half its rules.

## Format

```
my-pack/
  pack.json        index: name, version, created_at, min_penthera, rules[]
  pack.json.sig    ssh-keygen -Y sign -n penthera-rules
  secrets.json     rule files, one kind each
  packages.json
```

`pack.json` (written by `scripts/rules/build-pack.mjs`, never by hand):

```json
{
  "schema": 1,
  "name": "ioc-2025-2026",
  "version": "1.0.0",
  "created_at": "2026-10-19T14:45:12Z",
  "min_penthera": "1.2.0",
  "description": "…",
  "rules": [
    { "file": "packages.json", "kind": "ioc-package", "sha256": "…" }
  ]
}
```

A rule file is `{ "kind": "<kind>", "rules": [ … ] }`. Rules are data only:
regexes, string lists, IOC lists. A pack cannot contain code, and nothing in a
pack is ever evaluated.

Every rule carries:

| Field | Meaning |
|---|---|
| `id` | Unique within the pack, `[a-z0-9._-]` |
| `source` | `https` URL of the advisory, paper or write-up the rule comes from |
| `date` | `YYYY-MM-DD`, when that source published it |
| `confidence` | `confirmed`, `likely` or `potential`, as in findings |
| `references` | Optional keys into [references.bib](./references.bib) |
| `description` | Optional, shown in finding descriptions |

### Kinds

| Kind | Engine | Fields |
|---|---|---|
| `secret` | `lib/whitebox/secrets.js` (`--repo`, agents, fix) | `name`, `pattern`, `flags`, `severity`, `skip_placeholders` |
| `agent-instruction` | `lib/agents/hidden-content.js`: instructions hidden in comments and decoded blobs | `pattern`, `flags` |
| `agent-exec` | `lib/agents/`: remote-code-execution shapes in skills, hooks and MCP commands | `label`, `pattern`, `flags` |
| `ioc-package` | `penthera deps`: known-malicious versions, matched against the lockfile | `campaign`, `packages: [{ name, versions }]`, `severity` |
| `ioc-host` | `penthera deps`: exfiltration endpoints in package code | `campaign`, `hosts` (attacker domains), `urls` (exact endpoints on shared services) |
| `ioc-file` | `penthera deps`: files a campaign drops into packages | `campaign`, `files: [{ path, sha256? }]` |
| `typosquat-target` | `lib/deps/typosquat.js`: names to protect from look-alikes | `names` |
| `nuclei-template` | `lib/templates.js`: the Nuclei subset Penthera runs (status, word, regex matchers) | `template` |

Rules from packs run after the built-in rules, so a pack can add detections but
cannot shadow or reorder the built-in ones. IOC matching is literal (string
equality and `indexOf`), so IOC lists cannot be made slow. `ioc-package` matches
the lockfile, so it reports a bad version even when it is not installed.

## The ReDoS guard

Packs scan hostile input: dependency source, agent configs, HTTP responses. A
pack with a catastrophically backtracking regex could hang every scan that
loads it. V8's regex engine backtracks, and its linear-time mode refuses
ordinary bounded repeats like `{64}`, so `lib/rules/regex-guard.js` checks the
pattern's structure when the pack loads and refuses:

1. patterns longer than 512 characters, or with flags other than `imsu`;
2. backreferences and lookaround;
3. nested quantifiers: `(a+)+`, `(\w*\s?)*`;
4. alternation under an unbounded quantifier: `(a|aa)+`;
5. bounded repeats above 256;
6. an unbounded quantifier that every start position can reach and rescan
   (`\s*x`, `[a-z]+@`, `x[^\n]*\|` on `xxxx…`);
7. chains of quantifiers over overlapping characters (`.*b.*`, `\s+\S*\s*`),
   unless all of them are bounded and their product stays under 1,024.

It is deliberately conservative and refuses some safe patterns. Rewrite those
with a mandatory literal first, or with bounded windows such as
`[^\n]{0,80}`. Rule 6 took its current form after seeded fuzzing found
quadratic patterns that the narrower "no leading quantifier" version let
through. The fuzz test
(`tests/rule-packs.test.js`) generates random patterns and requires everything
the guard accepts to finish in under 250 ms on 10 KB of input built to make it
backtrack. In practice they finish in milliseconds; quadratic patterns take
seconds. Regexes from packs added with `--rules` also see at most 1 MB of input
per match.

The older, narrower check for `--templates` YAML (`NESTED_QUANTIFIER`, v1.1.1)
moved into the same module unchanged, so existing user templates keep working.

## Bundled packs

| Pack | Contents |
|---|---|
| `core` | Detections that were hardcoded before v1.5.0, moved here so the mechanism is used for real: 12 AI-provider key formats, the credential-path hidden-instruction pattern, two process-substitution exec patterns, and the `.env` exposure template. Engines splice them back in at their old positions; a test compares the result with a snapshot of the old built-ins. |
| `ioc-2025-2026` | Named npm campaigns: **s1ngularity** (nx and @nx/* versions, from GHSA-cxm3-wv7p-598c), **Shai-Hulud** (484 package versions from StepSecurity's table, the webhook.site exfil URL, and `bundle.js` by SHA-256), **Shai-Hulud 2.0** (1,089 package versions from Wiz Research's CSV, plus `setup_bun.js` and `bun_environment.js`), and **postmark-mcp** 1.0.16 to 1.0.18 with its exfil domain. Every rule cites the list it came from; entries that could not be checked against a primary source were dropped. |

## Writing and signing a pack

```bash
mkdir my-pack && $EDITOR my-pack/secrets.json   # { "kind": "secret", "rules": [ … ] }
npm run rules:build -- my-pack --name my-pack --version 1.0.0
ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n penthera-rules my-pack/pack.json
echo "me@example.com namespaces=\"penthera-rules\" $(cut -d' ' -f1,2 ~/.ssh/id_ed25519.pub)" > my-signers
penthera rules verify my-pack --rules-signers my-signers
penthera deps --rules my-pack --rules-signers my-signers
```

In a checkout of Penthera, `npm run rules:build` runs the script; from an
installed copy it is `node "$(npm root -g)/penthera/scripts/rules/build-pack.mjs"`.
`build-pack.mjs` hashes the rule files, writes `pack.json`, validates the
result with the loader's own code, and deletes a `pack.json.sig` that no longer
matches. `created_at` only changes when a rule file changed.

## Signing a release (maintainer)

Bundled packs must be signed before a release can be staged:

1. Review the change: `git diff lib/rules/`. The signature vouches for every
   rule in the pack.
2. Sign each changed pack locally, never in CI:
   `scripts/rules/sign-pack.sh lib/rules/<name> [~/.ssh/key]`. The script rebuilds
   `pack.json`, signs it with `ssh-keygen -Y sign -n penthera-rules`, and runs
   `penthera rules verify`.
3. `npm run rules:check` must pass. The publish workflow runs it before staging.
4. Commit `pack.json.sig` with the release.

The signing key's public half lives in `lib/rules/allowed_signers`. Changing
that file changes Penthera's trust root, and gets the same review as a change
to the verifier. To rotate keys, add the new key, re-sign the bundled packs, and
remove the old key in a later release. Packs other people signed with the old
key keep working until it is removed. A hardware-backed key (`sk-ssh-ed25519`)
is not supported by the verifier yet; use ed25519 or RSA.
