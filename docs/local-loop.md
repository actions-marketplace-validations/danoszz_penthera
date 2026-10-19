# The local loop

Penthera v1.4 adds a loop that runs entirely on your machine: scan, fix on a
local branch, verify, learn, repeat. Nothing in it talks to a Penthera server,
because there isn't one. This page covers the part that makes the loop improve
over time: the local learning store.

## The learning store

Scans run with `--memory` record what happened, and the next scan uses that
record to rank and suppress findings.

```bash
penthera --repo . --memory            # scan, apply memory, record this scan
penthera memory show                  # what memory knows about this project
penthera memory verify                # check the hash chain
penthera memory suppress <id> --reason "set by the CDN" [--expires 2027-01-01]
penthera memory forget                # delete this project's memory
penthera memory forget --all          # delete all memory
```

`<id>` is the 16-character `fid` shown next to each finding in a `--memory`
report.

### Where it lives

```
~/.penthera/memory/<project-id>/events.jsonl   the event log
~/.penthera/memory/<project-id>/head.json      count and hash of the last event
~/.penthera/memory/<project-id>/meta.json      the project's path or origin, for `memory show`
```

`<project-id>` is a SHA-256 of the repo's absolute path plus its git remote URL,
or of the target origin for URL-only scans. Set `PENTHERA_HOME` to move the
root (the tests do). Penthera reads the remote from `.git/config` itself rather
than running `git`, because running git inside an untrusted repo can execute
that repo's hooks or `core.fsmonitor` command.

### What it records

One JSON event per line, append-only:

```json
{ "v": 1, "ts": "...", "type": "scan", "data": { ... }, "prev": "<hash of previous line>", "hash": "..." }
```

`hash = sha256(prev + canonical JSON of { v, ts, type, data })`, with object
keys sorted. The first line's `prev` is derived from the project id.

| Type | Data |
| --- | --- |
| `scan` | stack, modes, counts by severity, ids of the actionable findings |
| `probe_yield` | probe id, stack, findings count |
| `fix_applied` | finding id, recipe id, framework, category, diff SHA-256 |
| `fix_verified` / `fix_failed` | finding id (recipe and framework are joined from `fix_applied`) |
| `fp_suppressed` | finding id, reason, actor, optional expiry |

From these, `penthera memory show` derives four views: recipe success rate per
framework, active suppressions, probe ranking by yield per stack, and median
time to fix (first seen in a scan to `fix_verified`).

### How a scan uses it

Memory can do two things to a report, and nothing else:

1. **Suppress** a finding the user (or the loop, on the user's behalf) marked as
   a false positive, with a reason. Suppressed findings move to a separate
   "Suppressed" section in the terminal and Markdown reports, each with who
   suppressed it and why. They do not count toward the exit code.
2. **Re-order** findings within a severity: categories with a fix recipe that
   has worked on this framework come first, then findings that have shown up in
   more past scans. Severity is never changed and no finding is dropped.

## Threat model

The learning store is an attack surface. An agent loop that learns from its own
past is open to memory poisoning (OWASP Agentic Security Initiative, ASI06): if
an attacker can write to what the loop remembers, they can steer what it does
next. In Penthera's case the obvious targets are hiding a real finding and
getting the loop to run something. The store is designed so neither works
quietly.

### Why it never executes

Memory is data. No value read from it is ever executed, evaluated, imported,
used as a file path, or passed to a shell. A recipe id in memory is only a
string that gets counted; the recipe code lives in Penthera's own source
(`lib/fix/`) and is chosen by Penthera, not by the log. Every field a view reads
is type- and length-checked, and an event that fails a check is ignored rather
than interpreted. Strings shown in the terminal have control characters stripped,
so a stored reason cannot inject ANSI escape sequences.

The worst a fully poisoned memory can do is hide findings, and hidden findings
are listed, with their reason, in every report.

### Why it is hash-chained

The chain makes tampering visible. Editing a line, reordering lines, deleting a
line from the start or middle, or splicing in another project's log all break
the chain, and `penthera memory verify` names the first broken line. `head.json`
records the count and hash of the last event, so cutting lines off the end is
caught too.

When the chain is broken, scans **fail closed**: memory suppressions and
ranking are not applied, nothing new is appended, and the scan prints a warning
telling you to run `penthera memory verify`. You can then inspect the log or
start over with `penthera memory forget`.

What the chain does not do: it is tamper-evident, not tamper-proof. Anyone who
can write to your home directory can rewrite the whole log and recompute every
hash. Keying the chain would not help, since the key would sit in the same home
directory. The chain is there to catch a partial edit, an accidental truncation,
or a tool that writes where it should not; it is not a defence against malware
already running as you.

### Why it lives in your home directory

Memory is never read from the scanned repo. If it were, a repo could ship
pre-poisoned memory, for example a suppression for the secret it is about to
leak. Keeping memory under `~/.penthera` means only runs on your machine, as
you, write to it.

### The one thing a repo can say: `penthera.suppress.json`

Teams do need to share decisions like "this key is a revoked test fixture". For
that a repo may contain `penthera.suppress.json`:

```json
{
  "version": 1,
  "suppress": [
    { "id": "16e06eb3fd94664b", "reason": "test fixture, revoked", "expires": "2027-01-01" }
  ]
}
```

It is held to a stricter standard than memory:

- Every entry needs a reason. Entries without one, with a malformed id or date,
  or past their expiry are dropped with a warning.
- Every finding it hides is listed in the report as **suppressed by repo file**
  with the reason, so a reviewer sees both the file change in the PR and its
  effect in the report.
- It only applies with `--memory`, and a local suppression for the same finding
  takes precedence.

Treat a change to `penthera.suppress.json` in a pull request like a change to
CI config: it decides what the scanner reports.

### Concurrency

Two scans of the same project can run at once. Each append takes an exclusive
lock file (`events.lock`, created with `O_EXCL`), reads the tip, and writes one
line with a single `O_APPEND` write. Lines never interleave and the chain never
forks. A lock older than 30 seconds is treated as stale and removed.
