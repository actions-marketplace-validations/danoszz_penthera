section: Detection

- **Library mode follows one helper call.** When an exported function passes a
  parameter to a named function in the same file, that function's parameter is
  followed too, one call deep. The finding names the helper. On the SecBench.js
  dev half, command-injection recall went from 40 to 44 of 49 (0.90, 95% CI
  0.78 to 0.96), with no new finding in 150 benign npm packages or 16 app
  repositories ([scan.md](../docs/commands/scan.md#library-mode-scanning-a-package)).
