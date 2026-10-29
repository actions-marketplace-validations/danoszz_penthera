/**
 * /research (site/research.mjs): the page builds, every entry links to a page
 * that exists, the featured benchmark gives each rank with its interval, and
 * a study that is not registered is never labelled Registered.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSite } from "../site/build.mjs";
import { benchmarkViews, ord, tiedPhrase } from "../site/benchmarks.mjs";
import { readPosts } from "../site/blog.mjs";
import { PURPOSE, STATUSES, TYPES, parsePrereg, researchEntries, studyStatus } from "../site/research.mjs";

const ROOT = join(import.meta.dirname, "..");
const ORIGIN = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).homepage.replace(/\/+$/, "");
const pub = JSON.parse(readFileSync(join(ROOT, "bench", "public", "published.json"), "utf8"));
const BLOB = "https://github.com/danoszz/penthera/blob/main/";
const PREREG = join(ROOT, "docs", "research", "prereg");

let dir, out, entries;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "penthera-research-"));
  out = join(dir, "dist");
  const prev = process.env.PENTHERA_SITE_STARS;
  process.env.PENTHERA_SITE_STARS = "off";
  try {
    await buildSite({ out });
  } finally {
    if (prev === undefined) delete process.env.PENTHERA_SITE_STARS;
    else process.env.PENTHERA_SITE_STARS = prev;
  }
  entries = researchEntries({ root: ROOT, pub, posts: readPosts(join(ROOT, "blog"), pub).published });
}, 180_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const read = (f) => readFileSync(join(out, f), "utf8");
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
/** Visible text with inline tags removed in place, so "<span>1st</span> of 6" reads "1st of 6". */
const inline = (html) => unesc((html.includes("<body>") ? html.slice(html.indexOf("<body>")) : html).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
/** GitHub's heading anchor for a Markdown heading. */
const slug = (h) => h.trim().toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");
/** The <li> of each entry on the page. */
const items = (html) => [...html.matchAll(/<li class="rs-item"[\s\S]*?<\/li>/g)].map((m) => m[0]);

describe("/research", () => {
  it("builds as HTML and Markdown, with one h1, the purpose line, and is in the sitemap, llms.txt and the footer", () => {
    const html = read("research.html");
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/research">`);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(inline(html)).toContain(PURPOSE);
    expect(read("research.md")).toMatch(/^# Penthera research/);
    expect(read("sitemap.xml")).toContain(`<loc>${ORIGIN}/research</loc>`);
    expect(read("llms.txt")).toContain(`(${ORIGIN}/research.md)`);
    for (const f of ["index.html", "benchmarks.html", "research.html"]) expect(read(f), f).toContain('<a href="/research">Research</a>');
    // No script but the theme, no inline style, no tracking.
    expect(html).not.toMatch(/\{\{| style=|track\.js|insights/);
    const scripts = [...html.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g)].map((m) => m[0]);
    expect(scripts).toEqual(['<script src="/theme.js">']);
    const d = unesc(html.match(/<meta name="description" content="([^"]+)">/)[1]);
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it("lists every entry newest first, each with a known type, and a status only on studies", () => {
    const html = read("research.html");
    expect(items(html)).toHaveLength(entries.length);
    const dates = entries.map((e) => e.date).filter(Boolean);
    expect(dates).toEqual([...dates].sort().reverse());
    for (const e of entries) {
      expect(TYPES, e.title).toContain(e.type);
      if (e.type === "Study") expect(STATUSES, e.title).toContain(e.status);
      else expect(e.status, e.title).toBeUndefined();
      expect(e.summary.length, e.title).toBeGreaterThan(0);
    }
    for (const t of ["Study", "Result", "Case study", "Post"]) expect(entries.some((e) => e.type === t), t).toBe(true);
  });

  it("links every entry to a page that exists: a built page, or a file (and heading) in the repo", () => {
    const html = read("research.html");
    const hrefs = [...html.matchAll(/<(?:h2|h3)[^>]*><a href="([^"]+)"/g), ...html.matchAll(/class="rs-more" href="([^"]+)"/g)].map((m) => unesc(m[1]));
    expect(hrefs.length).toBeGreaterThan(entries.length);
    for (const h of hrefs) {
      if (h.startsWith("/")) {
        const p = h.slice(1);
        expect(existsSync(join(out, `${p}.html`)) || existsSync(join(out, p, "index.html")), h).toBe(true);
      } else {
        expect(h.startsWith(BLOB), h).toBe(true);
        const [file, anchor] = h.slice(BLOB.length).split("#");
        expect(existsSync(join(ROOT, file)), h).toBe(true);
        if (anchor) {
          const heads = [...readFileSync(join(ROOT, file), "utf8").matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1]));
          expect(heads, h).toContain(anchor);
        }
      }
    }
  });

  it("gives each benchmark rank with its interval, in the words of site/benchmarks.mjs", () => {
    const html = read("research.html");
    const text = inline(html.slice(html.indexOf('class="rs-feature'), html.indexOf("rs-list-title")));
    expect(html).toMatch(/<section class="rs-feature[^"]*"[\s\S]*?href="\/benchmarks"/);
    const views = benchmarkViews(pub);
    expect(views.some((v) => tiedPhrase(v.iv))).toBe(true);
    for (const v of views) {
      expect(text, v.key).toContain(`${ord(v.us.rank)} of ${v.b.of}${tiedPhrase(v.iv)}`);
      // A rank whose interval spans more than one place never appears without it.
      if (tiedPhrase(v.iv)) expect(text.replace(`${ord(v.us.rank)} of ${v.b.of}${tiedPhrase(v.iv)}`, ""), v.key).not.toContain(`${ord(v.us.rank)} of ${v.b.of} `);
    }
    const md = read("research.md");
    for (const v of views) expect(md, v.key).toContain(`${ord(v.us.rank)} of ${v.b.of}${tiedPhrase(v.iv)}`);
  });

  it("never labels an unregistered study Registered, or shows a result for it", async () => {
    // The real protocols: a status that says it is not registered is Draft on the page.
    const html = read("research.html");
    const { readdirSync } = await import("node:fs");
    const drafts = readdirSync(PREREG).filter((f) => /^E\d/.test(f)).map((f) => parsePrereg(readFileSync(join(PREREG, f), "utf8"), f)).filter((p) => /not registered|\bdraft\b/i.test(p.status));
    expect(drafts.length).toBeGreaterThan(0);
    for (const p of drafts) {
      const e = entries.find((x) => x.type === "Study" && x.id === p.id);
      expect(e.status, p.id).toBe("Draft");
      expect(e.headline, p.id).toBeUndefined();
      const li = items(html).find((l) => l.includes(`/prereg/`) && l.includes(`>${p.id}<`));
      expect(li, p.id).toBeTruthy();
      expect(li, p.id).toContain('data-status="Draft"');
      expect(li, p.id).not.toMatch(/is-registered|is-result|>Registered<|>Result</);
    }
    // The rule itself, on wordings the protocols use.
    for (const s of ["Draft, not registered. Registration is the maintainer's written acceptance", "draft for review, not registered. It is registered by the commit that merges it", "Registered draft", ""]) {
      expect(studyStatus(s, true), s).toBe("Draft");
    }
    expect(studyStatus("Registered. Accepted by the maintainer on 28 Oct 2026")).toBe("Registered");
    expect(studyStatus("Registered. The commit that merges this file to main is the registration timestamp.", true)).toBe("Result");
    expect(studyStatus("Completed 2026-10-25. Approved by Daan")).toBe("Registered");
  });

  it("reads a new protocol's status from its own file: a draft lands as Draft", () => {
    const d = join(dir, "prereg");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "E99-test.md"), "# E99: A test study (pre-registration)\n\n| | |\n|---|---|\n| Status | **Draft, not registered.** Nothing binds yet |\n| Date written | 2026-11-01 |\n");
    writeFileSync(join(d, "E98-test.md"), "# E98: Another (pre-registration)\n\n| | |\n|---|---|\n| Status | **Registered.** The merge commit is the timestamp |\n| Date written | 2026-11-02 |\n");
    const got = researchEntries({ root: ROOT, preregDir: d });
    expect(got.filter((e) => e.type === "Study").map((e) => [e.id, e.status, e.date])).toEqual([["E98", "Registered", "2026-11-02"], ["E99", "Draft", "2026-11-01"]]);
  });
});
