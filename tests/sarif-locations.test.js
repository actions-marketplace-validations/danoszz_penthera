/**
 * GitHub code scanning requires a location on every SARIF result. Found in
 * the 2026-10-22 end-to-end test: a URL scan's "No SPF record" and
 * "No DMARC record" came out with `"locations": []`.
 */
import { describe, it, expect } from "vitest";
import { formatSarif } from "../src/reporter.js";

const results = (scan) => formatSarif(scan).runs[0].results;

describe("SARIF locations", () => {
  it("gives a finding with no URL the scanned host as its location", () => {
    const [spf, header] = results({
      target: "https://www.example.com",
      findings: [
        { severity: "medium", title: "No SPF record", category: "email-auth" },
        { severity: "medium", title: "Missing Content-Security-Policy", category: "headers", url: "https://www.example.com/" },
      ],
    });
    expect(spf.locations).toEqual([{ physicalLocation: { artifactLocation: { uri: "www.example.com" } } }]);
    expect(header.locations[0].physicalLocation.artifactLocation.uri).toBe("www.example.com");
  });

  it("points a repo-wide finding at the repository root, and keeps file:line for the rest", () => {
    const [routes, secret] = results({
      target: "/home/me/app",
      findings: [
        { severity: "info", title: "No API routes directory found", category: "routes" },
        { severity: "high", title: "Generic API key assignment in source", category: "secrets", url: "src/server.js", line: 11 },
      ],
    });
    expect(routes.locations[0].physicalLocation.artifactLocation.uri).toBe(".");
    expect(secret.locations[0].physicalLocation).toEqual({ artifactLocation: { uri: "src/server.js" }, region: { startLine: 11 } });
  });

  it("never emits an empty locations array", () => {
    const sarif = formatSarif({ target: "https://x.example", findings: [{ severity: "low", title: "a" }, { severity: "info", title: "b", category: "c" }] });
    for (const r of sarif.runs[0].results) expect(r.locations.length).toBeGreaterThan(0);
  });
});
