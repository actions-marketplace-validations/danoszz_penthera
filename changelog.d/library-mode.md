section: Added

- **Library mode for `--repo`: the parameters of exported functions count as
  untrusted.** A shell command built from one is reported as
  `command-injection` at `potential` confidence and severity high; a function
  that only runs its argument is reported at medium, with the note that callers
  must not pass untrusted input. It turns on by itself for a publishable
  `package.json` (an entry point, not private, no app framework), or with
  `--library`; `--no-library` turns it off. On the SecBench.js dev half,
  command-injection recall went from 0 of 49 to 40 of 49 (0.82, 95% CI 0.69 to
  0.90); it flagged none of 150 benign npm packages and nothing new in 16 app
  repositories ([scan.md](../docs/commands/scan.md#library-mode-scanning-a-package)).
- **More shell and eval shapes in every repo scan.** `exec` under any binding
  of `child_process` (`cp.exec`, `child_process_1.exec`, `{ exec: run }`,
  `promisify(exec)`, Babel's `(0, _cp.exec)`), shelljs `exec`, `spawn`,
  `execFile` and execa with a `shell` option or `sh -c`, indirect
  `(0, eval)(x)`, and `new Function` with a dynamic body in any argument. A
  regex literal that contains a quote no longer hides the code after it from
  the sink check.
