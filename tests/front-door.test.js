/**
 * E20 runner (bench/front-door/run.mjs): the guard that keeps it on loopback
 * until the protocol is registered, and a loopback-only visit. Every name is
 * pinned to 127.0.0.1 and DNS is stubbed, so nothing leaves the machine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authorize, recordedHash, isRegistered, readList, wilson, newcombe, aggregate, runStudy, selfTest, visit,
  USER_AGENT, sha256,
} from "../bench/front-door/run.mjs";
import { optedOut } from "../api/_lib/page.mjs";

const HASH = sha256("1,example.com\n");
const OTHER = "0".repeat(64);
const prereg = ({ status = "**Registered.** Accepted", tranco = HASH, yc = "pending" } = {}) => `
| | |
|---|---|
| Status | ${status} |
| Tranco list SHA-256 | \`${tranco}\` |
| YC list SHA-256 | \`${yc}\` |
`;

describe("E20 guard", () => {
  it("allows a loopback run without registration", () => {
    expect(authorize({ loopback: true, preregText: "" })).toEqual({ mode: "loopback" });
  });

  it("refuses a non-loopback run without --registered E20", () => {
    expect(() => authorize({ loopback: false, cohort: "tranco", listHash: HASH, preregText: prereg() })).toThrow(/--registered E20/);
    expect(() => authorize({ loopback: false, registered: "E19", cohort: "tranco", listHash: HASH, preregText: prereg() })).toThrow(/--registered E20/);
  });

  it("refuses when the list file's hash does not match the prereg", () => {
    expect(() => authorize({ loopback: false, registered: "E20", cohort: "tranco", listHash: OTHER, preregText: prereg() })).toThrow(/does not match/);
  });

  it("refuses while the prereg is a draft or records no hash for the cohort", () => {
    expect(() => authorize({ loopback: false, registered: "E20", cohort: "tranco", listHash: HASH, preregText: prereg({ status: "**Draft, not registered.**" }) })).toThrow(/not Registered/);
    expect(() => authorize({ loopback: false, registered: "E20", cohort: "yc", listHash: HASH, preregText: prereg() })).toThrow(/no YC list SHA-256/);
  });

  it("allows a registered run only when flag, status and hash all match", () => {
    expect(authorize({ loopback: false, registered: "E20", cohort: "tranco", listHash: HASH, preregText: prereg() })).toEqual({ mode: "registered" });
  });

  it("the draft prereg in the repo refuses every non-loopback run", () => {
    const text = readFileSync(join(__dirname, "..", "docs", "research", "prereg", "E20-front-door.md"), "utf8");
    expect(isRegistered(text)).toBe(false);
    expect(recordedHash(text, "tranco")).toBe(null);
    expect(recordedHash(text, "yc")).toBe(null);
    expect(() => authorize({ loopback: false, registered: "E20", cohort: "tranco", listHash: HASH, preregText: text })).toThrow(/Refused/);
  });
});

describe("E20 list and statistics", () => {
  it("reads Tranco and YC lists, one row per host", () => {
    expect(readList("1,google.com\n2,Example.co.uk\n3,google.com\n", "tranco")).toEqual([
      { rank: 1, host: "google.com", group: "com" },
      { rank: 2, host: "example.co.uk", group: "uk" },
    ]);
    expect(readList("batch,company,domain\nF26,Acme,https://acme.ai/about\nS26,Beta,beta.dev\n", "yc")).toEqual([
      { rank: 1, host: "acme.ai", group: "F26" },
      { rank: 2, host: "beta.dev", group: "S26" },
    ]);
  });

  it("computes Wilson and Newcombe intervals", () => {
    const w = wilson(81, 263);
    expect(w.lo).toBeCloseTo(0.2553, 3);
    expect(w.hi).toBeCloseTo(0.3662, 3);
    expect(wilson(0, 0).p).toBe(null);
    const d = newcombe(56, 70, 48, 80);
    expect(d.diff).toBeCloseTo(0.2, 6);
    expect(d.ci95[0]).toBeCloseTo(0.0524, 3);
    expect(d.ci95[1]).toBeCloseTo(0.3339, 3);
  });

  it("aggregates without site names and suppresses small groups", () => {
    const rec = (host, passed) => ({ host, group: "xx", status: "ok", score: passed ? 90 : 30, checks: [
      { id: "https", passed: true, weight: 22 }, { id: "hsts", passed, weight: 12 }, { id: "spf", passed: false, weight: 0 },
    ] });
    const agg = aggregate([rec("secret-name-a.xx", true), rec("secret-name-b.xx", false), { host: "c.xx", status: "opted_out" }]);
    expect(JSON.stringify(agg)).not.toMatch(/secret-name/);
    expect(agg.checks["https+hsts"]).toMatchObject({ n: 2, passed: 1 });
    expect(agg.checks.spf).toMatchObject({ n: 0, unknown: 2 });
    expect(agg.sites).toMatchObject({ listed: 3, visited: 2, opted_out: 1 });
    expect(agg.byGroup).toEqual({});
    expect(agg.groupsSuppressed).toBe(1);
  });
});

describe("E20 visit, loopback only", () => {
  let server, port;
  const seen = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      const host = String(req.headers.host).split(":")[0];
      seen.push({ host, url: req.url, ua: req.headers["user-agent"] });
      if (req.url === "/robots.txt" && host === "optout.e20-test.example.com") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("User-agent: Penthera-Research\nDisallow: /\n");
      }
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html", "Strict-Transport-Security": "max-age=63072000" });
        return res.end('<!doctype html><script src="/app.js"></script>');
      }
      res.writeHead(404); res.end();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    port = server.address().port;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it("honors a robots.txt group naming Penthera-Research, and the live check's token", () => {
    expect(optedOut("User-agent: Penthera-Research\nDisallow: /\n", ["penthera-research", "penthera-quickcheck"])).toBe(true);
    expect(optedOut("User-agent: Penthera-QuickCheck\nDisallow: /\n", ["penthera-research", "penthera-quickcheck"])).toBe(true);
    expect(optedOut("User-agent: Penthera-Research\nDisallow: /\n")).toBe(false);   // the live check keeps its own token
  });

  it("stops at an opt-out and fetches no scripts, with the study's User-Agent", async () => {
    seen.length = 0;
    const out = await visit({ rank: 1, host: "optout.e20-test.example.com", group: "com" }, { loopbackPort: port });
    expect(out.status).toBe("opted_out");
    expect(seen.map((s) => s.url)).toEqual(["/robots.txt"]);

    seen.length = 0;
    const ok = await visit({ rank: 2, host: "fine.e20-test.example.com", group: "com" }, { loopbackPort: port });
    expect(ok.status).toBe("ok");
    expect(seen.map((s) => s.url).sort()).toEqual(["/", "/.well-known/security.txt", "/robots.txt"]);
    expect(seen.every((s) => s.ua === USER_AGENT)).toBe(true);
    expect(ok.checks.some((c) => c.id === "secrets")).toBe(false);
  });

  it("runs the self-test against the mock server and writes results outside git", async () => {
    const dir = mkdtempSync(join(tmpdir(), "e20-"));
    const r = await selfTest({ out: dir });
    expect(r.problems).toEqual([]);
    expect(existsSync(join(dir, "raw.jsonl"))).toBe(true);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("*\n");
  });

  it("caps concurrency and keeps one visit per listed host", async () => {
    seen.length = 0;
    const dir = mkdtempSync(join(tmpdir(), "e20-"));
    const rows = readList("1,a.e20-test.example.com\n2,a.e20-test.example.com\n3,b.e20-test.example.com\n", "tranco");
    const { records, aggregate: agg } = await runStudy(rows, { cohort: "tranco", out: dir, loopbackPort: port, concurrency: 50, delayMs: 0, exclude: new Set(["b.e20-test.example.com"]) });
    expect(records.map((r) => r.status)).toEqual(["ok", "excluded"]);
    expect(seen.filter((s) => s.url === "/").length).toBe(1);
    expect(agg.concurrency).toBe(8);
  });
});
