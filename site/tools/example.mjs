#!/usr/bin/env node
/**
 * The before/after example on the page is a real scan, not a mock-up:
 *
 *   node site/tools/example.mjs
 *
 * runs a standard URL scan (what `npx penthera <url>` runs) against the test
 * server in tests/fixtures/mock-server.js and writes site/example.json. The
 * random port is replaced with 8765, the port the hero loop shows. The output
 * is committed; tests/site.test.js runs the scan again and fails when the file
 * no longer matches what Penthera reports.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer } from "../../tests/fixtures/mock-server.js";
import { scanUrl } from "../../src/scan-url.js";
import { mergeResults } from "../../src/cli/merge-results.js";
import { resolveScanOptions } from "../../src/cli/profiles.js";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8765;
const SEVERITIES = ["critical", "high", "medium", "low", "info"];

/** Scan the test server and keep what the page shows. */
export async function scanExample() {
  const server = await startMockServer(0);
  try {
    const r = await scanUrl(server.url, {
      ...resolveScanOptions({ profile: "standard" }),
      recon: false, skipRetireJs: true, timeout: 5_000, onPhase: () => {},
    });
    const local = (s) => String(s).replaceAll(`127.0.0.1:${server.port}`, `127.0.0.1:${PORT}`);
    const findings = mergeResults([r]).findings;
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
    const f = findings.find((x) => x.title === "OAuth open redirect");
    if (!f) throw new Error("example: the scan no longer reports the OAuth open redirect");
    return {
      command: `npx penthera http://127.0.0.1:${PORT}`,
      counts,
      checks: r.executedProbes.length,
      requests: r.egress.hosts.reduce((n, h) => n + h.requests, 0),
      thirdParty: r.egress.thirdPartyHosts.length,
      finding: {
        severity: f.severity, title: f.title, description: f.description,
        confidence: f.confidence ?? null, url: local(f.url), status: f.status,
      },
    };
  } finally {
    await server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const e = await scanExample();
  writeFileSync(join(SITE, "example.json"), JSON.stringify(e, null, 2) + "\n");
  console.log(`site/example.json: ${Object.entries(e.counts).map(([k, v]) => `${v} ${k}`).join(", ")}; ${e.checks} checks, ${e.requests} requests`);
}
