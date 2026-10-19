/**
 * Local learning store (lib/memory): hash chain integrity, views, ranking,
 * suppression, the repo suppress file, and concurrent appends.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import {
  openMemory, projectIdFor, buildViews, rankFindings, isSuppressed, findingId,
  withRepoSuppressions, loadRepoSuppressions, applyMemoryToScan, views,
} from "../lib/memory/index.js";
import { canonicalJson, sha256, readGitRemote } from "../lib/memory/store.js";
import { formatMarkdownReport } from "../src/report/markdown.js";
import { printReport } from "../src/reporter.js";

const tmpRoots = [];
function tmp(prefix = "penthera-mem-") {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}
afterAll(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

const PID = sha256("test-project");
let root;
let clock;
const now = () => new Date(Date.UTC(2026, 9, 1) + (clock++) * 3_600_000).toISOString();
beforeEach(() => { root = tmp(); clock = 0; });

function seeded(n = 5) {
  const mem = openMemory(PID, { root, now });
  for (let i = 0; i < n; i++) mem.append({ type: "probe_yield", data: { probe: `p${i}`, stack: "next.js", findings: i } });
  return mem;
}
const lines = (mem) => readFileSync(mem.file, "utf-8").trimEnd().split("\n");
const writeLines = (mem, ls) => writeFileSync(mem.file, ls.join("\n") + "\n");

describe("canonical JSON", () => {
  it("sorts keys at every depth and rejects non-JSON values", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }))
      .toBe('{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
    expect(() => canonicalJson({ n: NaN })).toThrow();
    expect(() => canonicalJson({ d: new Date() })).toThrow();
  });
});

describe("hash chain", () => {
  it("an untouched log verifies", () => {
    const mem = seeded();
    const r = mem.verify();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(5);
    const ev = JSON.parse(lines(mem)[1]);
    expect(Object.keys(ev).sort()).toEqual(["data", "hash", "prev", "ts", "type", "v"]);
    expect(ev.prev).toBe(JSON.parse(lines(mem)[0]).hash);
  });

  it("an empty / never-written project verifies and leaves no files", () => {
    const mem = openMemory(PID, { root });
    expect(mem.verify().ok).toBe(true);
    expect(existsSync(mem.dir)).toBe(false);
  });

  it.each([0, 2, 4])("editing line %i fails verify at that line", (i) => {
    const mem = seeded();
    const ls = lines(mem);
    const ev = JSON.parse(ls[i]);
    ev.data.findings = 999;
    ls[i] = JSON.stringify(ev);
    writeLines(mem, ls);
    const r = mem.verify();
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(i + 1);
    expect(r.reason).toMatch(/hash mismatch/);
  });

  it("re-hashing an edited line still fails (the next line's prev no longer matches)", () => {
    const mem = seeded();
    const ls = lines(mem);
    const ev = JSON.parse(ls[1]);
    ev.data.findings = 999;
    const body = { v: ev.v, ts: ev.ts, type: ev.type, data: ev.data };
    ev.hash = sha256(ev.prev + canonicalJson(body));
    ls[1] = JSON.stringify(ev);
    writeLines(mem, ls);
    expect(mem.verify()).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it("reordering lines fails verify", () => {
    const mem = seeded();
    const ls = lines(mem);
    [ls[1], ls[2]] = [ls[2], ls[1]];
    writeLines(mem, ls);
    expect(mem.verify()).toMatchObject({ ok: false, brokenAt: 2 });
  });

  it.each([["first", 0], ["middle", 2]])("deleting the %s line fails verify", (_, i) => {
    const mem = seeded();
    const ls = lines(mem);
    ls.splice(i, 1);
    writeLines(mem, ls);
    expect(mem.verify()).toMatchObject({ ok: false, brokenAt: i + 1 });
  });

  it("deleting the last line fails verify (head.json catches truncation)", () => {
    const mem = seeded();
    writeLines(mem, lines(mem).slice(0, -1));
    const r = mem.verify();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/deleted from the end/);
  });

  it("emptying the log fails verify", () => {
    const mem = seeded();
    writeFileSync(mem.file, "");
    expect(mem.verify().ok).toBe(false);
  });

  it("a log copied from another project does not verify", () => {
    const mem = seeded();
    const other = openMemory(sha256("other"), { root, now });
    other.append({ type: "scan", data: {} });
    writeFileSync(other.file, readFileSync(mem.file));
    writeFileSync(join(other.dir, "head.json"), readFileSync(join(mem.dir, "head.json")));
    expect(other.verify()).toMatchObject({ ok: false, brokenAt: 1 });
  });

  it("a garbage line fails verify", () => {
    const mem = seeded(2);
    writeFileSync(mem.file, readFileSync(mem.file, "utf-8") + "{not json\n");
    expect(mem.verify()).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it("rejects unknown event types and non-plain data", () => {
    const mem = openMemory(PID, { root, now });
    expect(() => mem.append({ type: "exec", data: { cmd: "rm -rf /" } })).toThrow(/unknown event type/);
    expect(() => mem.append({ type: "scan", data: [] })).toThrow(/plain object/);
    expect(() => mem.append({ type: "scan", data: { when: new Date() } })).toThrow();
    expect(() => openMemory("../../etc", { root })).toThrow(/sha256/);
  });

  it("views() returns null on a broken chain (fail closed)", () => {
    const mem = seeded();
    writeLines(mem, lines(mem).reverse());
    expect(views(mem)).toBeNull();
  });
});

describe("concurrent appends", () => {
  it("parallel processes neither corrupt the file nor fork the chain", async () => {
    const script = join(tmp("penthera-mem-script-"), "append.mjs");
    const mod = resolve("lib/memory/store.js");
    writeFileSync(script, `
      import { openMemory } from ${JSON.stringify(mod)};
      const [root, pid, worker, n] = process.argv.slice(2);
      const mem = openMemory(pid, { root });
      for (let i = 0; i < Number(n); i++) {
        mem.append({ type: "probe_yield", data: { probe: "w" + worker, stack: "x", findings: i, pad: "x".repeat(2000) } });
      }
    `);
    const WORKERS = 6;
    const EACH = 25;
    await Promise.all(Array.from({ length: WORKERS }, (_, w) => new Promise((ok, fail) => {
      const p = spawn(process.execPath, [script, root, PID, String(w), String(EACH)], { stdio: "inherit" });
      p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`worker ${w} exited ${code}`))));
    })));
    const mem = openMemory(PID, { root });
    const r = mem.verify();
    expect(r).toMatchObject({ ok: true, count: WORKERS * EACH });
    const v = buildViews(mem.events());
    expect(v.probeRanking.x).toHaveLength(WORKERS);
    for (const p of v.probeRanking.x) expect(p.runs).toBe(EACH);
  });
});

const F = {
  xss: { source: "xss", category: "injection", title: "Reflected XSS in q", url: "https://a.test/search", severity: "high" },
  csp: { source: "security-headers", category: "headers", title: "Missing CSP", url: "https://a.test/", severity: "medium" },
  hsts: { source: "security-headers", category: "headers", title: "Missing HSTS", url: "https://a.test/", severity: "medium" },
  cookie: { source: "cookie", category: "cookies", title: "Cookie without Secure", url: "https://a.test/", severity: "medium" },
  sqli: { source: "sqli", category: "injection", title: "SQL injection in id", url: "https://a.test/item", severity: "critical" },
  info: { source: "fingerprint", category: "info", title: "Server header", url: "https://a.test/", severity: "info" },
};

describe("views", () => {
  it("recipe success per framework, active suppressions, probe ranking, median time to fix", () => {
    const mem = openMemory(PID, { root, now });
    const id = findingId(F.csp);
    mem.append({ type: "scan", ts: "2026-10-01T00:00:00Z", data: { ids: [id, findingId(F.cookie)] } });
    mem.append({ type: "fix_applied", ts: "2026-10-02T00:00:00Z", data: { id, recipe: "next-csp", framework: "Next.js", category: "headers", diff_sha256: "ab" } });
    mem.append({ type: "fix_verified", ts: "2026-10-03T00:00:00Z", data: { id } });
    mem.append({ type: "fix_applied", ts: "2026-10-03T00:00:00Z", data: { id: findingId(F.cookie), recipe: "cookie-secure", framework: "next.js", category: "cookies" } });
    mem.append({ type: "fix_failed", ts: "2026-10-03T01:00:00Z", data: { id: findingId(F.cookie) } });
    mem.append({ type: "fix_applied", ts: "2026-10-04T00:00:00Z", data: { id: "x", recipe: "next-csp", framework: "express" } });
    mem.append({ type: "fp_suppressed", ts: "2026-10-04T00:00:00Z", data: { id: findingId(F.hsts), reason: "behind a proxy that sets it", actor: "user" } });
    mem.append({ type: "fp_suppressed", ts: "2026-10-04T00:00:00Z", data: { id: findingId(F.xss), reason: "old", actor: "user", expires: "2026-10-05T00:00:00Z" } });
    mem.append({ type: "fp_suppressed", ts: "2026-10-04T00:00:00Z", data: { id: findingId(F.info), actor: "agent" } }); // no reason: ignored
    mem.append({ type: "probe_yield", data: { probe: "xss", stack: "next.js", findings: 3 } });
    mem.append({ type: "probe_yield", data: { probe: "xss", stack: "next.js", findings: 1 } });
    mem.append({ type: "probe_yield", data: { probe: "cors", stack: "next.js", findings: 0 } });
    mem.append({ type: "probe_yield", data: { probe: "sqli", stack: "django", findings: 5 } });

    const v = buildViews(mem.events(), { now: "2026-10-10T00:00:00Z" });
    const nextCsp = v.recipeSuccess.find((r) => r.framework === "next.js" && r.recipe === "next-csp");
    expect(nextCsp).toMatchObject({ applied: 1, verified: 1, failed: 0, rate: 1 });
    expect(v.recipeSuccess.find((r) => r.recipe === "cookie-secure")).toMatchObject({ rate: 0, failed: 1 });
    expect(v.recipeSuccess.find((r) => r.framework === "express")).toMatchObject({ applied: 1, rate: null });
    expect(v.suppressions.map((s) => s.id)).toEqual([findingId(F.hsts)]); // expired + reasonless dropped
    expect(v.probeRanking["next.js"].map((p) => p.probe)).toEqual(["xss", "cors"]);
    expect(v.probeRanking["next.js"][0]).toMatchObject({ runs: 2, findings: 4, yield: 2 });
    expect(v.probeRanking.django[0].probe).toBe("sqli");
    expect(v.medianTimeToFixDays).toBe(2);
  });

  it("ignores hostile or malformed event fields instead of acting on them", () => {
    const v = buildViews([
      { type: "probe_yield", data: { probe: { toString: "evil" }, findings: 1 } },
      { type: "probe_yield", data: { probe: "x", findings: -3 } },
      { type: "fix_applied", data: { recipe: "x".repeat(10_000) } },
      { type: "fp_suppressed", data: { id: "abc", reason: 42 } },
      { type: "__proto__", data: {} },
      null,
    ]);
    expect(v.probeRanking).toEqual({});
    expect(v.recipeSuccess).toEqual([]);
    expect(v.suppressions).toEqual([]);
  });
});

describe("rankFindings / isSuppressed", () => {
  const findings = [F.cookie, F.info, F.csp, F.xss, F.hsts, F.sqli];

  it("only re-orders: same findings, severity tiers intact", () => {
    const ranked = rankFindings(findings, {});
    expect(ranked).toHaveLength(findings.length);
    expect(new Set(ranked)).toEqual(new Set(findings));
    expect(ranked.map((f) => f.severity)).toEqual(["critical", "high", "medium", "medium", "medium", "info"]);
    expect(findings[0]).toBe(F.cookie); // input untouched
  });

  it("within a severity, proven-fix categories come first, then persistent findings", () => {
    const v = {
      recipeSuccess: [{ framework: "next.js", recipe: "next-csp", rate: 0.9, categories: ["headers"] }],
      seen: { [findingId(F.hsts)]: 5, [findingId(F.csp)]: 1 },
    };
    const medium = rankFindings(findings, v, { framework: "next.js" }).filter((f) => f.severity === "medium");
    expect(medium).toEqual([F.hsts, F.csp, F.cookie]);
    // A recipe proven on another framework does not count here.
    const other = rankFindings(findings, { ...v, seen: {} }, { framework: "django" }).filter((f) => f.severity === "medium");
    expect(other).toEqual([F.cookie, F.csp, F.hsts]);
  });

  it("never lets ranking bump a lower severity above a higher one", () => {
    const v = { recipeSuccess: [{ framework: "unknown", recipe: "r", rate: 1, categories: ["cookies"] }], seen: { [findingId(F.cookie)]: 100 } };
    expect(rankFindings([F.cookie, F.xss], v)[0]).toBe(F.xss);
  });

  it("matches suppressions by id or full fingerprint", () => {
    const v = withRepoSuppressions(
      { suppressions: [{ id: findingId(F.csp), reason: "r1", actor: "user", source: "memory" }] },
      [{ id: null, fingerprint: "security-headers|headers|https://a.test/|missing hsts", reason: "r2", actor: "repo" }],
    );
    expect(isSuppressed(F.csp, v)).toMatchObject({ source: "memory", reason: "r1" });
    expect(isSuppressed(F.hsts, v)).toMatchObject({ source: "repo-file", reason: "r2" });
    expect(isSuppressed(F.xss, v)).toBeNull();
    expect(isSuppressed(F.xss, {})).toBeNull();
  });

  it("a local-memory suppression wins over the repo file for the same id", () => {
    const id = findingId(F.csp);
    const v = withRepoSuppressions({ suppressions: [{ id, reason: "mine", source: "memory" }] }, [{ id, reason: "theirs" }]);
    expect(v.suppressions).toHaveLength(1);
    expect(isSuppressed(F.csp, v).reason).toBe("mine");
  });
});

describe("repo file penthera.suppress.json", () => {
  function repoWith(doc) {
    const repo = tmp("penthera-repo-");
    if (doc !== undefined) writeFileSync(join(repo, "penthera.suppress.json"), typeof doc === "string" ? doc : JSON.stringify(doc));
    return repo;
  }

  it("validates entries and drops bad ones with warnings", () => {
    const repo = repoWith({
      version: 1,
      suppress: [
        { id: findingId(F.csp), reason: "set by CDN" },
        { id: "nothex", reason: "x" },
        { id: findingId(F.xss) },
        { id: findingId(F.hsts), reason: "x", expires: "2020-01-01" },
        { fingerprint: "a|b|c|d", reason: "ok", expires: "2099-01-01" },
      ],
    });
    const { entries, warnings } = loadRepoSuppressions(repo, { now: "2026-10-19T00:00:00Z" });
    expect(entries.map((e) => e.reason)).toEqual(["set by CDN", "ok"]);
    expect(warnings).toHaveLength(3);
  });

  it("ignores a malformed file", () => {
    expect(loadRepoSuppressions(repoWith("{oops")).entries).toEqual([]);
    expect(loadRepoSuppressions(repoWith({ suppress: [] })).warnings[0]).toMatch(/version/);
    expect(loadRepoSuppressions(repoWith()).entries).toEqual([]);
  });

  it("is labelled 'suppressed by repo file' in Markdown and terminal output", () => {
    const repo = repoWith({ version: 1, suppress: [{ id: findingId(F.csp), reason: "CSP is set by the CDN" }] });
    const merged = { target: repo, mode: "repo", findings: [F.csp, F.xss], executedProbes: ["xss"] };
    applyMemoryToScan(merged, { repo, root, now: "2026-10-19T00:00:00Z" });

    expect(merged.findings.map((f) => f.title)).toEqual([F.xss.title]);
    expect(merged.suppressed).toHaveLength(1);
    expect(merged.suppressed[0].suppression).toMatchObject({ source: "repo-file", reason: "CSP is set by the CDN" });

    const md = formatMarkdownReport(merged, { version: "test" });
    expect(md).toContain("## Suppressed findings");
    expect(md).toMatch(/Missing CSP.*suppressed by repo file.*CSP is set by the CDN/);

    const out = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    try { printReport(merged); } finally { spy.mockRestore(); }
    const text = out.join("").replace(/\x1b\[[0-9;]*m/g, "");
    expect(text).toContain("Suppressed");
    expect(text).toMatch(/suppressed by repo file \(penthera\.suppress\.json\): CSP is set by the CDN/);
  });

  it("strips terminal control characters from reasons", () => {
    const repo = repoWith({ version: 1, suppress: [{ id: findingId(F.csp), reason: "ok\u001b[2J\u001b]0;pwned\u0007" }] });
    const merged = { target: repo, mode: "repo", findings: [F.csp] };
    applyMemoryToScan(merged, { repo, root, now: "2026-10-19T00:00:00Z" });
    const out = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((s) => { out.push(String(s)); return true; });
    try { printReport(merged); } finally { spy.mockRestore(); }
    const reasonLine = out.join("").split("\n").find((l) => l.includes("suppressed by repo file"));
    expect(reasonLine).not.toMatch(/\u001b\[2J|\u0007/);
  });
});

describe("scan hook (--memory)", () => {
  it("records scan + probe_yield events and applies memory suppressions next time", () => {
    const repo = tmp("penthera-repo-");
    const scan = () => ({ target: repo, mode: "repo", findings: [F.csp, F.cookie, F.info], executedProbes: ["cookie", "security-headers", "cors"] });

    const first = scan();
    const { projectId } = applyMemoryToScan(first, { repo, root, now: "2026-10-01T00:00:00Z" });
    expect(first.memory.chain).toBe("ok");
    expect(first.suppressed).toEqual([]);
    const mem = openMemory(projectId, { root });
    const evs = mem.events();
    expect(evs[0].type).toBe("scan");
    expect(evs[0].data.ids).toEqual([findingId(F.csp), findingId(F.cookie)]); // info not tracked
    expect(evs.filter((e) => e.type === "probe_yield").map((e) => [e.data.probe, e.data.findings]))
      .toEqual(expect.arrayContaining([["cookie", 1], ["security-headers", 1], ["cors", 0], ["fingerprint", 1]]));

    mem.append({ type: "fp_suppressed", data: { id: first.findings.find((f) => f.title === F.cookie.title).fid, reason: "dev only", actor: "user" } });

    const second = scan();
    applyMemoryToScan(second, { repo, root, now: "2026-10-02T00:00:00Z" });
    expect(second.suppressed.map((f) => [f.title, f.suppression.source])).toEqual([[F.cookie.title, "memory"]]);
    expect(formatMarkdownReport(second, {})).toMatch(/Cookie without Secure.*suppressed by local memory.*dev only/);
    expect(mem.verify().ok).toBe(true);
  });

  it("fails closed on a tampered log: no memory suppressions, no new events", () => {
    const repo = tmp("penthera-repo-");
    const merged = { target: repo, mode: "repo", findings: [F.csp] };
    const { projectId } = applyMemoryToScan(merged, { repo, root, now: "2026-10-01T00:00:00Z" });
    const mem = openMemory(projectId, { root, now });
    mem.append({ type: "fp_suppressed", data: { id: findingId(F.csp), reason: "x", actor: "user" } });
    const ls = lines(mem);
    writeLines(mem, [ls[0], ls[2], ls[1], ...ls.slice(3)]);
    const before = readFileSync(mem.file, "utf-8");

    const again = { target: repo, mode: "repo", findings: [F.csp] };
    const { warnings } = applyMemoryToScan(again, { repo, root, now: "2026-10-02T00:00:00Z" });
    expect(warnings[0]).toMatch(/chain broken/);
    expect(again.findings).toHaveLength(1);
    expect(again.suppressed).toEqual([]);
    expect(again.memory.chain).toBe("broken");
    expect(readFileSync(mem.file, "utf-8")).toBe(before);
  });

  it("never reads memory from the scanned repo", () => {
    const repo = tmp("penthera-repo-");
    const id = projectIdFor({ repo }).id;
    // A repo that ships its own "memory" with a suppression has no effect.
    const planted = openMemory(id, { root: join(repo, ".penthera", "memory"), now });
    planted.append({ type: "fp_suppressed", data: { id: findingId(F.csp), reason: "planted", actor: "attacker" } });
    mkdirSync(join(repo, "memory"), { recursive: true });
    const merged = { target: repo, mode: "repo", findings: [F.csp] };
    applyMemoryToScan(merged, { repo, root, now: "2026-10-01T00:00:00Z" });
    expect(merged.suppressed).toEqual([]);
  });
});

describe("project id", () => {
  it("hashes the absolute repo path plus the git remote, without running git", () => {
    const a = tmp("penthera-repo-");
    mkdirSync(join(a, ".git"));
    writeFileSync(join(a, ".git", "config"), '[core]\n\tfsmonitor = touch /tmp/pwned\n[remote "origin"]\n\turl = https://user:secret@github.com/o/r.git\n');
    expect(readGitRemote(a)).toBe("https://github.com/o/r.git");
    const p1 = projectIdFor({ repo: a });
    expect(p1.id).toMatch(/^[0-9a-f]{64}$/);
    expect(p1.label).not.toContain("secret");
    writeFileSync(join(a, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/o/other.git\n');
    expect(projectIdFor({ repo: a }).id).not.toBe(p1.id);
    expect(projectIdFor({ url: "https://x.test/a?b" }).id).toBe(projectIdFor({ url: "https://x.test/other" }).id);
  });
});

describe("penthera memory CLI", () => {
  const BIN = resolve("bin/penthera.js");
  function cli(args, home) {
    try {
      const stdout = execFileSync(process.execPath, [BIN, "memory", ...args], {
        encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", PENTHERA_NO_ONBOARDING: "1", PENTHERA_HOME: home },
      });
      return { code: 0, stdout };
    } catch (e) {
      return { code: e.status, stdout: String(e.stdout) + String(e.stderr) };
    }
  }

  it("verify, suppress, show, forget", () => {
    const home = tmp("penthera-home-");
    const repo = tmp("penthera-repo-");
    expect(cli(["verify", "--repo", repo], home)).toMatchObject({ code: 0 });
    expect(cli(["suppress", findingId(F.csp), "--repo", repo], home).code).toBe(2); // reason required
    expect(cli(["suppress", findingId(F.csp), "--reason", "set by CDN", "--repo", repo], home).code).toBe(0);
    const show = cli(["show", "--repo", repo], home);
    expect(show.stdout).toContain("set by CDN");
    expect(cli(["verify", "--repo", repo], home).stdout).toMatch(/OK\s+1 event/);

    const mem = openMemory(projectIdFor({ repo }).id, { root: join(home, "memory") });
    writeFileSync(mem.file, readFileSync(mem.file, "utf-8").replace("set by CDN", "set by me"));
    const bad = cli(["verify", "--repo", repo], home);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toMatch(/BROKEN\s+line 1/);

    expect(cli(["forget", "--repo", repo], home).code).toBe(0);
    expect(existsSync(mem.dir)).toBe(false);
    cli(["suppress", findingId(F.csp), "--reason", "x", "--repo", repo], home);
    expect(cli(["forget", "--all"], home).code).toBe(0);
    expect(existsSync(join(home, "memory"))).toBe(false);
    expect(existsSync(home)).toBe(true);
  });
});
