#!/usr/bin/env node
/**
 * Interactive scan — delegates to PostHog-style onboarding wizard.
 * Alias: penthera-scan
 */
import { readFileSync } from "node:fs";
import { runScanWizard } from "../src/cli/onboarding.js";

const arg = process.argv[2];
if (arg === "--help" || arg === "-h") {
  process.stdout.write(`
  penthera-scan — interactive scan wizard (asks for a URL, then scans)

  Usage
    $ penthera-scan

  For flags and non-interactive scans, see: penthera --help
`);
  process.exit(0);
}
if (arg === "--version") {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
  console.log(pkg.version);
  process.exit(0);
}

runScanWizard().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
