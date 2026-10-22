/**
 * E10 known-vulnerable-apps benchmark: scoring rules and answer-key shape.
 * Pure and fast; the Docker runner itself (bench/known-vuln/run.mjs) is
 * never run by `npm test`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { classOf, locationOf, locMatches, entryMatches, applicable, wilson, scoreRun, fingerprint } from "../bench/known-vuln/score.mjs";

const truth = {
  vulnerabilities: [
    { id: "listing", class: "exposure", inScope: true, surface: "url", needsAuth: false, needsPayloads: false, locations: [{ path: "/ftp/" }], group: "ftp" },
    { id: "sqli", class: "injection", inScope: true, surface: "url", needsAuth: false, needsPayloads: true, locations: [{ path: "/rest/search" }], group: "sqli" },
    { id: "sqli-2", class: "injection", inScope: true, surface: "url", needsAuth: false, needsPayloads: true, locations: [{ path: "/rest/search" }], group: "sqli" },
    { id: "admin", class: "injection", inScope: true, surface: "url", needsAuth: true, needsPayloads: true, locations: [{ path: "/admin" }], group: "admin" },
    { id: "key", class: "secrets", inScope: true, surface: "repo", locations: [{ file: "src/key.ts" }], group: "key" },
    { id: "nosql", class: "injection", inScope: false, excludedBecause: "class-not-claimed", locations: [{ path: "/rest/reviews" }] },
  ],
};

describe("E10 classification", () => {
  it("maps Penthera categories and risky-pattern titles to E10 classes", () => {
    expect(classOf({ category: "headers" })).toBe("misconfig");
    expect(classOf({ category: "sqli" })).toBe("injection");
    expect(classOf({ category: "code-pattern", title: "eval in /api/x" })).toBe("code-sink");
    expect(classOf({ category: "code-pattern", title: "error-leak in /api/x" })).toBe("exposure");
    expect(classOf({ category: "machine" })).toBe("other");
  });

  it("locates url and repo findings, stripping the source prefix", () => {
    expect(locationOf({ url: "http://127.0.0.1:1/ftp/a.md?x=1" })).toEqual({ surface: "url", path: "/ftp/a.md", file: null });
    expect(locationOf({ file: "/src/app/src/key.ts" }, "/src/app/")).toMatchObject({ surface: "repo", file: "src/key.ts" });
    expect(locationOf({ url: "lib/insecurity.ts", category: "secrets", source: "secret-scan" })).toEqual({ surface: "repo", path: null, file: "lib/insecurity.ts" });
    expect(locationOf({ url: "/api/x", description: "Detected in routes/x.ts", source: "static-analysis" })).toMatchObject({ surface: "repo", file: "routes/x.ts" });
  });

  it("matches prefix, exact, wildcard and file locations", () => {
    const url = (path) => ({ surface: "url", path, file: null });
    expect(locMatches({ path: "/ftp/" }, url("/ftp"))).toBe(true);
    expect(locMatches({ path: "/ftp/" }, url("/ftp/x"))).toBe(true);
    expect(locMatches({ path: "/ftp/" }, url("/ftpx"))).toBe(false);
    expect(locMatches({ path: "/metrics" }, url("/metrics/x"))).toBe(false);
    expect(locMatches({ path: "*" }, url("/anything"))).toBe(true);
    expect(locMatches({ path: "*" }, { surface: "repo", path: null, file: "a.js" })).toBe(false);
    expect(locMatches({ file: "a.js" }, { surface: "repo", path: null, file: "a.js" })).toBe(true);
  });

  it("needs a keyword when the entry lists them, and the entry's own surface", () => {
    const xpb = { class: "misconfig", inScope: true, surface: "url", locations: [{ path: "*" }, { file: "server.js" }], keywords: ["x-powered-by"] };
    const csp = { severity: "low", category: "headers", title: "Missing Content-Security-Policy", url: "http://127.0.0.1:1/" };
    const powered = { severity: "low", category: "headers", title: "Server discloses X-Powered-By: Express", url: "http://127.0.0.1:1/" };
    expect(entryMatches(xpb, csp, locationOf(csp))).toBe(false);
    expect(entryMatches(xpb, powered, locationOf(powered))).toBe(true);
    const listing = { class: "exposure", inScope: true, surface: "url", locations: [{ path: "/ftp/" }, { file: "server.ts" }] };
    const leak = { severity: "low", category: "code-pattern", title: "error-leak in /x", url: "/x", description: "Detected in server.ts", source: "static-analysis" };
    expect(entryMatches(listing, leak, locationOf(leak))).toBe(false);
  });

  it("keeps auth and payload entries out of runs that lack them", () => {
    const [listing, sqli, , admin, key, nosql] = truth.vulnerabilities;
    const std = { payloads: false, auth: false };
    const deep = { payloads: true, auth: false };
    expect([listing, sqli, admin, key, nosql].map((e) => applicable(e, std))).toEqual([true, false, false, true, false]);
    expect([listing, sqli, admin, key, nosql].map((e) => applicable(e, deep))).toEqual([true, true, false, true, false]);
  });
});

describe("E10 scoring", () => {
  const findings = [
    { severity: "medium", category: "exposure", title: "Directory listing", url: "http://127.0.0.1:1/ftp" },
    { severity: "high", category: "sqli", title: "SQL injection", url: "http://127.0.0.1:1/rest/search" },
    { severity: "low", category: "headers", title: "Missing CSP", url: "http://127.0.0.1:1/" },
    { severity: "low", category: "headers", title: "Missing CSP", url: "http://127.0.0.1:1/" },
    { severity: "medium", category: "injection", title: "NoSQL thing", url: "http://127.0.0.1:1/rest/reviews" },
    { severity: "info", category: "config", title: "inventory" },
  ];

  it("scores matches, labels and root-cause recall", () => {
    const csp = findings[2];
    const labels = { [fingerprint(csp, locationOf(csp))]: { verdict: "correct", reason: "no CSP header" } };
    const s = scoreRun(findings, truth, { payloads: true, auth: false }, labels);
    expect(s.info).toBe(1);
    expect(s.units).toHaveLength(4); // the duplicate CSP finding collapses
    expect(s.total).toMatchObject({ findings: 4, matched: 2, correct: 3, incorrect: 0, unlabelled: 1, groups: 3, groupsHit: 2 });
    expect(s.units.find((u) => u.title === "NoSQL thing").near).toEqual({ id: "nosql", inScope: false });
    expect(s.groups.find((g) => g.group === "key").hitBy).toBeNull();
  });

  it("does not credit a payload-only entry in a standard run", () => {
    const s = scoreRun(findings, truth, { payloads: false, auth: false });
    expect(s.total.groups).toBe(2);
    expect(s.units.find((u) => u.title === "SQL injection").match).toBeNull();
  });

  it("counts cannot-tell as incorrect", () => {
    const f = findings[2];
    const s = scoreRun([f], truth, { payloads: false, auth: false }, { [fingerprint(f, locationOf(f))]: { verdict: "cannot-tell" } });
    expect(s.total).toMatchObject({ correct: 0, incorrect: 1 });
  });

  it("computes Wilson intervals", () => {
    expect(wilson(0, 0)).toBeNull();
    const w = wilson(21, 24);
    expect(w.p).toBeCloseTo(0.875, 3);
    expect(w.lo).toBeCloseTo(0.690, 2);
    expect(w.hi).toBeCloseTo(0.957, 2);
  });
});

describe("E10 answer keys", () => {
  const dir = join(import.meta.dirname, "..", "bench", "known-vuln");
  const apps = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "truth.json"))).map((d) => d.name);
  const CODES = new Set(["business-logic", "access-control-logic", "needs-browser", "stored-or-multistep", "class-not-claimed", "dependency-cve", "weak-credentials", "osint-or-social", "llm", "not-a-vulnerability", "out-of-band", "not-in-answer-key", "other"]);

  it("has the pilot apps", () => {
    expect(apps).toEqual(expect.arrayContaining(["juice-shop", "dvna"]));
  });

  for (const app of apps) {
    it(`${app}: entries are complete and pinned`, () => {
      const t = JSON.parse(readFileSync(join(dir, app, "truth.json"), "utf-8"));
      expect(t.schema).toBe("penthera-known-vuln-truth/1");
      expect(t.source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(t.frozenBeforeScan).toBe(true);
      const ids = new Set();
      for (const e of t.vulnerabilities) {
        expect(ids.has(e.id), e.id).toBe(false);
        ids.add(e.id);
        expect(e.source, e.id).toMatch(/^https:\/\//);
        if (e.inScope) {
          expect(["url", "repo"], e.id).toContain(e.surface);
          expect(e.locations.length, e.id).toBeGreaterThan(0);
          expect(e.group, e.id).toBeTruthy();
          expect(["secrets", "code-sink", "exposure", "misconfig", "auth", "vulnerable-component", "injection"], e.id).toContain(e.class);
        } else {
          expect(CODES.has(e.excludedBecause), `${e.id}: ${e.excludedBecause}`).toBe(true);
        }
      }
    });
  }
});
