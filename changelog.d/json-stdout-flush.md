section: Fixed

- **`--json` to a pipe no longer cuts the report off.** The CLI exited right
  after writing, so on a pipe (`penthera --json | jq`) any report over 64 KiB
  arrived truncated and was not valid JSON. It now exits once stdout has drained.
