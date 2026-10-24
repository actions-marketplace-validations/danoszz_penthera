section: Detection

- **Library mode follows one helper call and values kept on `this`.** When an
  exported function passes a parameter to a named function in the same file,
  that function's parameter is followed too, one call deep, and the finding
  names the helper. A parameter a constructor or setter stores on `this` is
  followed into the other methods of the same class or prototype, and so is an
  instance an exported factory returns (`return new Stat(dir)`). On the SecBench.js
  dev half, command-injection recall went from 40 to 45 of 49 (0.92, 95% CI
  0.81 to 0.97), with no new finding in 150 benign npm packages or 16 app
  repositories ([scan.md](../docs/commands/scan.md#library-mode-scanning-a-package)).
