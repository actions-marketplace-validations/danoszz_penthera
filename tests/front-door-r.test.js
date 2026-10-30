/**
 * E20-R (bench/front-door/replicate.mjs, classify.mjs, analyze-r.mjs): the
 * guard, the response classifier, the fixed order, and the analysis on
 * synthetic records. Loopback only; nothing leaves the machine.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, cookieNames, evidenceOf, EXCERPT_BYTES } from "../bench/front-door/classify.mjs";
import { authorizeR, mergeCohorts, shuffled, seeded, dnsProviders, selfTestR, aggregateR, R_COHORTS, ipv4Lookup, PREREG_R } from "../bench/front-door/replicate.mjs";
import { kappa, decide, combine, clusterDiff, pass, claims, CLAIMS_R, LEVEL } from "../bench/front-door/analyze-r.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "e20r-"));
const HASH = "a".repeat(64);
const prereg = (status = "**Registered.** Accepted") => `| Status | ${status} |\n` + Object.keys(R_COHORTS).map((c) => `| ${c} list SHA-256 | \`${HASH}\` |`).join("\n") + `\n| E20-R exclusion list SHA-256 | \`${HASH}\` |\n`;
const allHashes = Object.fromEntries(Object.keys(R_COHORTS).map((c) => [c, HASH]));
const good = { registered: "E20R", pass: 1, listHashes: allHashes, excludeHash: HASH, preregText: prereg() };

describe("E20-R guard", () => {
  it("allows loopback, and a registered pass whose hashes all match", () => {
    expect(authorizeR({ loopback: true }).mode).toBe("loopback");
    expect(authorizeR(good).mode).toBe("registered");
  });
  it("refuses without --registered E20R, or with another study's flag", () => {
    expect(() => authorizeR({ ...good, registered: undefined })).toThrow(/Refused/);
    expect(() => authorizeR({ ...good, registered: "E20" })).toThrow(/Refused/);
  });
  it("refuses a draft protocol, a third pass, a changed list or exclusion list", () => {
    expect(() => authorizeR({ ...good, preregText: prereg("**Draft**") })).toThrow(/not Registered/);
    expect(() => authorizeR({ ...good, pass: 3 })).toThrow(/--pass/);
    expect(() => authorizeR({ ...good, listHashes: { ...allHashes, EU: "b".repeat(64) } })).toThrow(/EU list/);
    expect(() => authorizeR({ ...good, excludeHash: "b".repeat(64) })).toThrow(/exclusion/);
  });
  it("has no registered protocol in the repository yet", () => {
    expect(existsSync(PREREG_R) && /\*\*Registered\./.test(readFileSync(PREREG_R, "utf8"))).toBe(false);
  });
  it("resolves IPv4 only", async () => {
    const answers = await ipv4Lookup("localhost", { all: true });
    expect(answers.every((a) => a.family === 4)).toBe(true);
  });
});

describe("E20-R classifier", () => {
  it("trusts a header marker before the status code", () => {
    expect(classify({ status: 200, headers: { "CF-Mitigated": "challenge" } })).toMatchObject({ label: "challenge", vendor: "cloudflare", rule: "header:cf-mitigated" });
    expect(classify({ status: 202, headers: { "x-amzn-waf-action": "captcha" } }).label).toBe("challenge");
    expect(classify({ status: 403, headers: { "x-vercel-mitigated": "challenge" } }).vendor).toBe("vercel");
  });
  it("finds a challenge in a 2xx body, the gap in E20's status filter", () => {
    expect(classify({ status: 200, body: "<title>Just a moment...</title>" }).label).toBe("challenge");
    expect(classify({ status: 403, body: '<script src="https://geo.captcha-delivery.com/x"></script>' }).vendor).toBe("datadome");
  });
  it("separates a block from an origin error and a page", () => {
    expect(classify({ status: 403, body: "Sorry, you have been blocked" })).toMatchObject({ label: "block", vendor: "cloudflare" });
    expect(classify({ status: 403, body: "<H1>Access Denied</H1>" })).toMatchObject({ label: "block", vendor: "akamai" });
    expect(classify({ status: 404, body: "not here" }).label).toBe("origin-error");
    expect(classify({ status: 200, body: "<h1>Welcome</h1>" }).label).toBe("page");
  });
  it("keeps cookie names, never values", () => {
    expect(cookieNames({ "set-cookie": ["__cf_bm=SECRET; Path=/", "sid=abc"] })).toEqual(["__cf_bm", "sid"]);
    expect(JSON.stringify(evidenceOf({ status: 200, headers: { "set-cookie": ["sid=SECRET"] }, body: "x" }))).not.toContain("SECRET");
  });
  it("never stores the body of a 2xx page, and caps other bodies with emails redacted", () => {
    const ok = evidenceOf({ status: 200, headers: {}, body: "private page" });
    expect(ok.excerpt).toBeUndefined();
    expect(JSON.stringify(ok)).not.toContain("private page");
    const denied = evidenceOf({ status: 403, headers: {}, body: `mail ops@example.com ${"x".repeat(9000)}` });
    expect(denied.excerpt.length).toBeLessThanOrEqual(EXCERPT_BYTES);
    expect(denied.excerpt).not.toContain("ops@example.com");
  });
  it("keeps only header names for robots.txt and security.txt", () => {
    const e = evidenceOf({ status: 200, headers: {}, body: "" }, [{ kind: "robots", res: { status: 200, headers: { "strict-transport-security": "max-age=1" }, body: "User-agent: *" } }]);
    expect(e.others[0]).toMatchObject({ kind: "robots", headerNames: ["strict-transport-security"] });
    expect(JSON.stringify(e.others)).not.toContain("User-agent");
  });
});

describe("E20-R order and cohorts", () => {
  const rows = ["c.com", "a.com", "b.com", "d.com", "e.com"].map((host) => ({ host }));
  it("gives the same order for the same seed, whatever the file order", () => {
    expect(shuffled(rows, 2020)).toEqual(shuffled([...rows].reverse(), 2020));
    expect(shuffled(rows, 2020).map((r) => r.host)).not.toEqual(shuffled(rows, 2021).map((r) => r.host));
  });
  it("is a reproducible generator in [0, 1)", () => {
    const a = seeded(1), b = seeded(1);
    for (let i = 0; i < 100; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it("visits a host on two lists once and counts it in both", () => {
    const merged = mergeCohorts({ T1k: [{ host: "x.com", rank: 1, group: "com" }], EU: [{ host: "x.com", rank: 9, group: "DAX" }, { host: "y.de", rank: 2, group: "DAX" }] });
    expect(merged).toHaveLength(2);
    expect(Object.keys(merged[0].cohorts)).toEqual(["T1k", "EU"]);
  });
  it("labels MX and NS providers without keeping the hostnames", async () => {
    const p = await dnsProviders("example.com", { mx: async () => [{ exchange: "aspmx.l.google.com." }], ns: async () => ["a.ns.cloudflare.com."] });
    expect(p).toEqual({ mx: "google", ns: "cloudflare" });
    const none = Object.assign(new Error("x"), { code: "ENODATA" }), bad = Object.assign(new Error("x"), { code: "ETIMEOUT" });
    expect(await dnsProviders("example.com", { mx: () => Promise.reject(none), ns: () => Promise.reject(bad) })).toEqual({ mx: "none", ns: "unknown" });
  });
  it("runs a loopback pass, once per host, with no site in the aggregate", async () => {
    const r = await selfTestR({ out: tmp() });
    expect(r.problems).toEqual([]);
    expect(Object.keys(r.aggregate.cohorts).sort()).toEqual(["T1k", "YC-new"]);
    expect(r.aggregate.cohorts.T1k.labels).toBeDefined();
  });
  it("folds small provider groups into other", () => {
    const records = Array.from({ length: 21 }, (_, i) => ({ host: `s${i}.example`, status: "ok", score: 50, checks: [], cohorts: { T1k: { rank: i, group: "example" } }, dnsProviders: { mx: i === 0 ? "rare" : "google", ns: "other" } }));
    const a = aggregateR(records);
    expect(a.cohorts.T1k.mailProviders.google).toBe(20);
    expect(a.cohorts.T1k.mailProviders.rare).toBeUndefined();
    expect(a.cohorts.T1k.mailProviders.other).toBe(1);
  });
});

describe("E20-R analysis", () => {
  it("fixes the family at fifteen claims", () => {
    expect(CLAIMS_R).toBe(15);
    expect(LEVEL).toBeCloseTo(0.99667, 4);
  });
  it("computes Cohen's kappa", () => {
    expect(kappa([1, 1, 0, 0], [1, 1, 0, 0])).toBe(1);
    expect(kappa([1, 0, 1, 0], [1, 1, 0, 0])).toBeCloseTo(0);
    expect(kappa(["a", "a"], ["a", "a"])).toBe(1);
  });
  it("decides on the interval and the predicted sign", () => {
    expect(decide([0.02, 0.2], +1)).toBe("supported");
    expect(decide([-0.2, -0.02], +1)).toBe("refuted");
    expect(decide([-0.05, 0.05], +1)).toBe("no meaningful difference");
    expect(decide([-0.05, 0.3], +1)).toBe("inconclusive");
  });
  it("calls a disagreement between S and R view-dependent", () => {
    expect(combine("supported", "supported")).toBe("supported");
    expect(combine("supported", "inconclusive")).toBe("view-dependent");
    expect(combine("refuted", "supported")).toBe("view-dependent");
    expect(combine("inconclusive", "inconclusive")).toBe("inconclusive");
  });
  const site = (host, csp, extra = {}) => ({ host, finalHost: host, status: "ok", checks: [{ id: "csp", passed: csp, weight: 14 }], evidence: { class: { label: "page" } }, ...extra });
  it("reads derived checks and treats weight 0 as unknown", () => {
    const r = { checks: [{ id: "https", passed: true, weight: 22 }, { id: "hsts", passed: false, weight: 12 }, { id: "spf", passed: true, weight: 3 }, { id: "dmarc", passed: false, weight: 0 }] };
    expect(pass(r, "https+hsts")).toBe(false);
    expect(pass(r, "spf+dmarc")).toBeUndefined();
  });
  it("widens the interval when one organization owns many sites", () => {
    const opts = { resamples: 800, level: 0.95 };
    const a = Array.from({ length: 200 }, (_, i) => site(`a${i}.org`, i % 2 === 0));
    const groupsOf10 = Array.from({ length: 200 }, (_, i) => site(`s${i}.o${Math.floor(i / 10)}.org`, Math.floor(i / 10) % 2 === 0));
    const b = Array.from({ length: 200 }, (_, i) => site(`b${i}.net`, i % 2 === 0));
    const free = clusterDiff(a, b, "csp", opts), tied = clusterDiff(groupsOf10, b, "csp", opts);
    expect(tied.ci[1] - tied.ci[0]).toBeGreaterThan(free.ci[1] - free.ci[0]);
  });
  it("is deterministic for a seed", () => {
    const a = Array.from({ length: 50 }, (_, i) => site(`a${i}.org`, i % 3 === 0)), b = Array.from({ length: 50 }, (_, i) => site(`b${i}.org`, i % 2 === 0));
    expect(clusterDiff(a, b, "csp", { resamples: 200 })).toEqual(clusterDiff(a, b, "csp", { resamples: 200 }));
  });
  it("returns the fifteen claims on synthetic records and names no site", () => {
    const mk = (cohort, n, rate, offset = 0) => Array.from({ length: n }, (_, i) => site(`${cohort.toLowerCase()}${i}.org`, i % rate === 0, { cohorts: { [cohort]: { rank: i + offset, group: "x" } }, platform: { edge: i % 2 ? "cloudflare" : "vercel" } }));
    const p1 = [...mk("T1k", 60, 2), ...mk("YC-new", 60, 5), ...mk("YC-25", 30, 5), ...mk("YC-old", 40, 3), ...mk("T100k", 60, 4)];
    const out = claims(p1, p1, new Map(p1.map((r) => [r.host, { httpStatus: 200 }])), { resamples: 100 });
    expect(out.map((c) => c.id)).toEqual(Array.from({ length: 15 }, (_, i) => `C${i + 1}`));
    expect(out.find((c) => c.id === "C14").kappa).toBe(1);
    expect(JSON.stringify(out)).not.toContain(".org");
  });
});
