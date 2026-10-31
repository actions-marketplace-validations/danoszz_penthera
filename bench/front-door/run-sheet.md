# E20-R2 run sheet

The order of work on the study server, from the tip of `main`. The protocol is `docs/research/prereg/E20r-front-door-replication.md`, Amendment 2. The maintainer starts every step that reaches another host.

Set these first. `/srv/e20` is an example: use the server's real paths. `LISTS` holds the cohort lists, and the other files are the frozen lists:

```bash
export LISTS=/srv/e20/lists EXCLUDE=/srv/e20/exclusions.txt HOMEPAGE=/srv/e20/homepage-only.txt REMOVALS=/srv/e20/removals.txt PRIOR=/srv/e20/prior-optouts.txt
```

```bash
export COMMON="--registered E20R --lists $LISTS --exclude $EXCLUDE --homepage-only $HOMEPAGE --removals $REMOVALS --prior-optouts $PRIOR"
```

```bash
export R=bench/front-door/results
```

## 1. Preflight

```bash
npm ci
```

```bash
npm run e20r:preflight
```

This runs the tests, `npm run e20r:acceptance` and the self-test on this checkout, on loopback. All must pass.

## 2. Pilot

One live round, or two at most. Each round takes exactly 50 sites.

Round 1:

```bash
node bench/front-door/replicate.mjs --pilot 50 --pilot-round 1 $COMMON
```

If its manifest has `finishedAt`, stopped or not, seal it, then prune it. Exit 1 from the seal means it failed; prune it anyway:

```bash
node bench/front-door/pilot-report.mjs $R/e20r-pilot-1/raw.jsonl --exclude $EXCLUDE --skip $REMOVALS --skip $PRIOR --seal
```

```bash
node bench/front-door/validation-sample.mjs prune $R/e20r-pilot-1
```

After a hard kill the manifest has no `finishedAt`: prune only. Its sites go on the dropped list either way.

A person reads `pilot-report.json` and records go or no-go. It gives selected, eligible, graded, 2xx, DNS-complete and each class per claim cohort. A claim cohort with no graded site or no complete DNS read means no-go.

Round 2, only if needed. A failed round needs changed code, a changed protocol, or a `pilot-explanation.txt` in its folder.

```bash
sort -u $R/e20r-pilot-1/pilot-sites.txt > /srv/e20/pilot-sites-all.txt
```

```bash
node bench/front-door/replicate.mjs --pilot 50 --pilot-round 2 --pilot-dropped /srv/e20/pilot-sites-all.txt $COMMON
```

```bash
node bench/front-door/pilot-report.mjs $R/e20r-pilot-2/raw.jsonl --exclude $EXCLUDE --skip $REMOVALS --skip $PRIOR --skip /srv/e20/pilot-sites-all.txt --seal
```

```bash
node bench/front-door/validation-sample.mjs prune $R/e20r-pilot-2
```

## 3. The dropped list for pass 2

Build it from every round that started. With one round, use only that round's file.

```bash
cat $R/e20r-pilot-1/pilot-sites.txt $R/e20r-pilot-2/pilot-sites.txt | sort -u > /srv/e20/pilot-sites-all.txt
```

Check that no site ran twice. This must print 0:

```bash
cat $R/e20r-pilot-1/pilot-sites.txt $R/e20r-pilot-2/pilot-sites.txt | sort | uniq -d | wc -l
```

## 4. Pass 2

```bash
node bench/front-door/replicate.mjs --pass 2 --pilot-dropped /srv/e20/pilot-sites-all.txt $COMMON
```

To stop it between sites, for a complaint or anything else that can't wait:

```bash
touch ~/.penthera-e20r2-stop
```

## 5. After a whole pass 2

The order matters: the privacy report reads text the draw deletes.

```bash
node bench/front-door/pilot-report.mjs --privacy $R/e20r-pass2
```

```bash
node bench/front-door/validation-sample.mjs draw $R/e20r-pass2
```

The analysis takes pass 2 as `--pass1`, under Amendment 2. Its other inputs are private files whose hashes are frozen in the protocol:

```bash
node bench/front-door/analyze-r.mjs --pass1 $R/e20r-pass2/raw.jsonl --pass2 /srv/e20/pass1/raw.jsonl --e20 /srv/e20/e20/tranco/raw.jsonl /srv/e20/e20/yc/raw.jsonl --industries /srv/e20/industries.csv --e20-excluded /srv/e20/e20-health-excluded.txt --out analysis.json
```

## Failure recovery

Every failed run ends in a prune or a purge. A prune reads the file back and prints `"verified":true`. If it doesn't, the run isn't closed.

| What happened | Exit | Do this |
|---|---|---|
| Usage error | 2 | Fix the command. Nothing ran. |
| Refused by the gate | 3 | Read the reason. Nothing ran. |
| Something changed during the run | 4 | Pilot: seal, then prune. Pass 2: prune. The run decides nothing. |
| Stopped: scrub miss, resolver failures, stop file, source address, signal | 5 | Pilot: seal, then prune. Pass 2: prune, and report what ran as partial. |
| Hard kill, crash or full disk | none | Prune only. The run counts as interrupted. |
| Privacy report not clean | 1 | Stop. A person reviews the flagged fields first (below). |

```bash
node bench/front-door/validation-sample.mjs prune $R/e20r-pass2
```

### A failed privacy report on pass 2

A false fire must not cost the run, so nobody purges yet.

1. A person reads `flaggedFields` in `$R/e20r-pass2/privacy-report.json`. It names fields and counts, never text.
2. That person opens the flagged records on the server only. Nothing goes to a chat, a ticket, a shared log, the terminal scrollback of a shared session, or a hosted model.
3. A confirmed false fire: write what was checked in a private note, with no flagged text in it, then record it. The analysis reports it as a deviation.

```bash
node bench/front-door/pilot-report.mjs --privacy $R/e20r-pass2 --false-fire /srv/e20/false-fire-note.txt
```

4. A real miss: purge, with the `purgeConfirm` code the report printed, and report the run as partial.

```bash
node bench/front-door/validation-sample.mjs purge $R/e20r-pass2 --confirm <purgeConfirm>
```

- `purge` refuses without that code, the first 12 characters of the raw file's hash. The report's code holds until the file changes. After a prune, or for a crashed run with no report, take it from the file:

```bash
sha256sum $R/e20r-pass2/raw.jsonl | cut -c1-12
```

- `purge` deletes the whole per-site raw file and writes `purge-manifest.json` with the original hash and the disposition. It works on finished, partial, crashed and privacy-failed runs, and it can't be undone. The run can't be analyzed afterward. There is no field-level cleaning.
- A pruned or purged round's sites stay on the dropped list, and `pilot-sites.txt` stays in its folder.
- Pass 2 is never resumed or restarted. A new run needs a new registration.
- A complaint: `touch ~/.penthera-e20r2-stop`, prune, reply. Remove the stop file only once the reason is settled.
- A first SIGINT or SIGTERM ends the run after the visits in flight, up to 30 seconds. A second one kills it.
