section: Docs

- **E20 draft protocol: how safe is the web's front door?** A passive check
  of the Tranco top 1000 and of the companies in the two most recent Y
  Combinator batches (E20b), with the live check's own rules, published as
  aggregates only. The maintainer's decisions of 29 Oct are in: lists fetched
  and hashed on registration day, a fixed rate of 4 sites at a time with a
  1 second pause, `User-agent: *` with `Disallow: /` honored as an opt-out,
  and a hand-written exclusion list (adult, gambling, health, government,
  sites of people at risk) hashed with the lists. Not registered yet, and
  nothing has been sent to any site. The runner, `bench/front-door/run.mjs`,
  works on loopback only until the protocol is registered and both the list
  and the exclusion list match the hashes recorded in it
  (`docs/research/prereg/E20-front-door.md`).
- **The live check's passive report takes study options:** skip referenced
  files, skip the secret rules, its own User-Agent and robots.txt name, and
  (for the study only) honor a robots.txt `*` group. The live check itself is
  unchanged.
