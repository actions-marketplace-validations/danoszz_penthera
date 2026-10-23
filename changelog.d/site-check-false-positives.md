section: Fixed

- **The `.env.local` template matches again.** Its regex used an inline
  `(?m)` flag, which JavaScript rejects, and an unbounded repeat the regex
  guard refuses, so a served `.env.local` was never reported. The multiline
  flag now goes in the matcher's `flags`, and a test checks that every
  built-in template regex compiles and passes the guard.
- **A single-page app no longer reads as a leaked file.** The URL scan's
  sensitive-file check reported `/.env.production`, `/actuator/env` and
  others as "contains sensitive data" when an app served its index.html for
  every path and that page named `API_KEY` or similar. HTML pages no longer
  count for that check; `/phpinfo.php` and `/server-status` are recognised by
  their own page text instead.
- **No more critical "command-injection" for a Map lookup and a regex.** In a
  repo scan, `results.get("/robots.txt")` counted as a route and
  `/re/.exec(s)` as a shell exec. A route now needs a handler after its path,
  and `.exec(` counts only on `child_process`, `cp` or `shell`, or as a bare
  `exec(`. A route that passes request input to `child_process` still fires.
