/**
 * The site's footer (site/frame.mjs) is one piece on every page and maps
 * every page the build renders, so a new landing page, benchmark or approved
 * post cannot ship without a way to reach it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSite } from "../site/build.mjs";
import { footGroups, siteFooter } from "../site/frame.mjs";

let dir, out, pages;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "penthera-foot-"));
  out = join(dir, "dist");
  // No network: the star count is not read.
  const stars = process.env.PENTHERA_SITE_STARS;
  process.env.PENTHERA_SITE_STARS = "off";
  try { await buildSite({ out, drafts: false }); } finally {
    if (stars === undefined) delete process.env.PENTHERA_SITE_STARS; else process.env.PENTHERA_SITE_STARS = stars;
  }
  pages = readdirSync(out, { recursive: true }).map(String).filter((f) => f.endsWith(".html"));
}, 180_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The URL a built file is served at (cleanUrls; folder index files share their folder's URL). */
const urlOf = (f) => "/" + f.replace(/\\/g, "/").replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "");
const footerOf = (html) => /<footer class="foot">[\s\S]*?<\/footer>/.exec(html)?.[0];
const hrefs = (html) => new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/#.*$/, "") || "/"));

describe("site footer", () => {
  it("is on every built page, once, outside <main>", () => {
    expect(pages.length).toBeGreaterThan(10);
    for (const f of pages) {
      const html = readFileSync(join(out, f), "utf8");
      expect(html.match(/<footer class="foot">/g), f).toHaveLength(1);
      expect(html.indexOf('<footer class="foot">'), f).toBeGreaterThan(html.indexOf("</main>"));
    }
  });

  it("links every built page from every page's footer", () => {
    const urls = [...new Set(pages.map(urlOf))].map((u) => (u === "/" ? "/" : u.replace(/\/$/, "")));
    for (const f of pages) {
      const links = hrefs(footerOf(readFileSync(join(out, f), "utf8")));
      // The homepage is linked as the live check (/#scan) and by the wordmark.
      for (const u of urls) expect(links.has(u), `${f} footer misses ${u}`).toBe(true);
    }
  });

  it("is a labelled nav landmark with grouped lists", () => {
    const foot = footerOf(readFileSync(join(out, "index.html"), "utf8"));
    expect(foot).toMatch(/<nav class="foot-nav" aria-label="Site map">/);
    for (const g of ["product", "research", "trust", "elsewhere"]) expect(foot).toContain(`<ul aria-labelledby="foot-${g}">`);
  });

  it("keeps the facts, the controls and no dither behind the wordmark", () => {
    const foot = siteFooter({ version: "9.9.9", stars: "12" });
    for (const s of ["MIT license", "Scan only what you own", "No cookies, no third-party requests", "Penthera 9.9.9", "data-theme-toggle", "Star Penthera on GitHub, 12 stars", 'href="/#get"']) expect(foot).toContain(s);
    expect(siteFooter({ home: true })).toContain('href="#get"');
    // The dither ramp is its own row, never the wordmark's parent.
    expect(foot).toMatch(/<div class="foot-field" aria-hidden="true">(<i><\/i>)+<\/div>\s*<a class="foot-mark"/);
  });

  it("lists only what it is given: no blog without an approved post", () => {
    const none = footGroups({ pages: [], benchmarks: [], posts: [] }).flatMap((g) => g.links.map((l) => l.href));
    expect(none).not.toContain("/blog");
    const one = footGroups({ posts: [{ slug: "a", title: "A" }] }).flatMap((g) => g.links.map((l) => l.href));
    expect(one).toEqual(expect.arrayContaining(["/blog", "/blog/a"]));
  });
});
