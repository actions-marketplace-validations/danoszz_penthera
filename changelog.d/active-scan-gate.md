section: Security

- **Active modes ask before they start, and are rate-limited.** `--deep`,
  `--fuzz`, `--adaptive`, `--all` and `--profile deep` now need a
  confirmation bound to the target, as METHODOLOGY.md already promised;
  before, `--deep` only printed a warning. In a terminal Penthera asks (a yes
  for a target on this machine, the hostname typed back for any other).
  Without a terminal, pass `--confirm-target <host>`; a missing or mismatched
  host stops the run with exit code 2 before any request. This also covers
  the login burst and SQL error check that now run only under `--deep`. The
  wizard's deep and custom scans go through the same gate. Scripts that run
  active modes in CI need the new flag.
- New `--rate <n>`: one requests-per-second cap per scan, shared by all
  concurrent probes. Active scans default to 10; other scans have no limit
  unless set; `--rate 0` removes it. Waiting for a slot does not count toward
  a request's timeout or its measured duration, so timing-based checks are
  unaffected. The report records the cap as `egress.rateLimit`.
