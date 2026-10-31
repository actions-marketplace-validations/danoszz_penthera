# E20-R2 run sheet

The order of work on the study server, from the tip of `main`. The protocol is `docs/research/prereg/E20r-front-door-replication.md`, Amendment 2. The maintainer starts every step that reaches another host.

Set these first. `LISTS` holds the cohort lists, and the other paths are the frozen lists:

```bash
export LISTS=/srv/e20/lists EXCLUDE=/srv/e20/exclusions.txt HOMEPAGE=/srv/e20/homepage-only.txt REMOVALS=/srv/e20/removals.txt PRIOR=/srv/e20/prior-optouts.txt
```

```bash
export COMMON="--registered E20R --lists $LISTS --exclude $EXCLUDE --homepage-only $HOMEPAGE --removals $REMOVALS --prior-optouts $PRIOR"
```

## 1. Before anything leaves the machine

```bash
npm ci
```

```bash
npm test
```

```bash
npm run e20r:acceptance
```

```bash
node bench/front-door/replicate.mjs --self-test
```

All must pass. Acceptance and the self-test stay on loopback.

## 2. Pilot

One live round, or two at most. Each round takes exactly 50 sites.

```bash
node bench/front-door/replicate.mjs --pilot 50 --pilot-round 1 $COMMON
```

A second round adds `--pilot-round 2 --pilot-dropped bench/front-door/results/e20r-pilot-1/pilot-sites.txt`.

Seal the round, then delete its text:

```bash
node bench/front-door/pilot-report.mjs bench/front-door/results/e20r-pilot-1/raw.jsonl --exclude $EXCLUDE --skip $REMOVALS --skip $PRIOR --seal
```

```bash
node bench/front-door/validation-sample.mjs prune bench/front-door/results/e20r-pilot-1
```

A round that fails stays sealed as failed. The next round needs changed code, a changed protocol, or a `pilot-explanation.txt` in the failed round's folder.

## 3. Pass 2

`--pilot-dropped` holds exactly the sites of every round.

```bash
node bench/front-door/replicate.mjs --pass 2 --pilot-dropped /srv/e20/pilot-sites-all.txt $COMMON
```

To stop it between sites, for a complaint or anything else that can't wait:

```bash
touch ~/.penthera-e20r2-stop
```

## 4. After a whole pass 2

The order matters: the privacy report reads text the draw deletes.

```bash
node bench/front-door/pilot-report.mjs --privacy bench/front-door/results/e20r-pass2
```

```bash
node bench/front-door/validation-sample.mjs draw bench/front-door/results/e20r-pass2
```

```bash
node bench/front-door/analyze-r.mjs --pass1 bench/front-door/results/e20r-pass2/raw.jsonl --pass2 <pass 1 raw.jsonl> --e20 <tranco raw.jsonl> <yc raw.jsonl> --out analysis.json
```

`--pass1` takes pass 2, under Amendment 2. Only `raw.jsonl` is accepted.

## Failure recovery

Every exit other than 0 ends in a prune, except 2 and 3, where nothing ran. The prune reads the file back and prints `"verified":true`. If it doesn't, the run isn't closed.

| What happened | Exit | Do this |
|---|---|---|
| Usage error | 2 | Fix the command. Nothing ran. |
| Refused by the gate | 3 | Read the reason. Nothing ran. |
| Something changed during the run | 4 | Prune. The run decides nothing. |
| Stopped: scrub miss, resolver failures, stop file, source address, signal | 5 | Prune. Report what ran as partial. |
| Killed, crashed or out of disk | none | Prune. The manifest has no end, and the run counts as interrupted. |
| Privacy report not clean | 1 | Stop. Prune, and report the run as partial. |

```bash
node bench/front-door/validation-sample.mjs prune bench/front-door/results/e20r-pass2
```

- A stopped pilot round needs no seal. Prune it and run the next round, within the two-round cap, with its sites in `--pilot-dropped`.
- Pass 2 is never resumed or restarted. A new run needs a new registration.
- A complaint: `touch ~/.penthera-e20r2-stop`, prune, reply. Remove the stop file only once the reason is settled.
- A first SIGINT or SIGTERM ends the run after the visits in flight, up to 30 seconds. A second one kills it.
