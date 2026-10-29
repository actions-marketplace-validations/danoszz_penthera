/**
 * Pieces every generated page shares: the JSON-LD data block and the footer.
 *
 * The footer is one piece for every page, the homepage included (2026-10-29).
 * Its map is built from what the build knows: the landing pages in
 * site/pages/, the benchmark pages, the approved blog posts and /research.
 * A new page appears in it without an edit here, and tests/site-footer.test.js
 * fails if a built page is missing from it. Drafts never appear, so no page
 * links an unapproved post or an empty /blog.
 */

const REPO = "https://github.com/danoszz/penthera";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A JSON-LD data block; "<" escaped so no value can close the element. */
export const ldScript = (graph) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;

/**
 * The footer's map, in four groups (and the blog's posts under Research).
 * @param {{ pages?: {slug: string, h1: string, nav?: string, eyebrow?: string}[],
 *   benchmarks?: {slug: string, label: string}[], posts?: {slug: string, title: string}[] }} known
 *   what the build rendered: landing pages, benchmark pages, approved posts
 * @returns {{ id: string, label: string, links: {href: string, text: string, sub?: boolean, rel?: string, track?: string}[] }[]}
 */
export function footGroups({ pages = [], benchmarks = [], posts = [] } = {}) {
  const page = (p) => ({ href: `/${p.slug}`, text: p.nav || p.h1 });
  const research = pages.filter((p) => p.eyebrow === "Research");
  const product = pages.filter((p) => p.eyebrow !== "Research");
  return [
    { id: "product", label: "Product", links: [
      { href: "/#scan", text: "Live check" },
      ...product.map(page),
      { href: "https://www.npmjs.com/package/penthera", text: "npm package" },
      { href: REPO, text: "GitHub" },
    ] },
    { id: "research", label: "Research", links: [
      { href: "/research", text: "Research" },
      ...research.map(page),
      { href: "/benchmarks", text: "Benchmarks" },
      ...benchmarks.map((b) => ({ href: `/benchmarks/${b.slug}`, text: b.label, sub: true })),
      ...(posts.length ? [{ href: "/blog", text: "Blog" }, ...posts.map((p) => ({ href: `/blog/${p.slug}`, text: p.title, sub: true }))] : []),
      { href: `${REPO}/blob/main/docs/METHODOLOGY.md`, text: "Methodology" },
      { href: `${REPO}/blob/main/docs/references.md`, text: "References" },
    ] },
    { id: "trust", label: "Trust", links: [
      { href: "/trust", text: "Trust" },
      { href: "/terms", text: "Terms" },
      { href: `${REPO}/blob/main/docs/privacy.md`, text: "Privacy and network use" },
      { href: "/.well-known/security.txt", text: "security.txt" },
      { href: "/llms.txt", text: "llms.txt" },
      { href: `${REPO}/tree/main/site`, text: "Source of this page" },
    ] },
    { id: "elsewhere", label: "Elsewhere", links: [
      { href: "https://x.com/penthera_org", text: "@penthera_org on X", rel: "me", track: "x-footer" },
      { href: `${REPO}/discussions`, text: "GitHub Discussions" },
      { href: `${REPO}/issues`, text: "Issues" },
    ] },
  ];
}

const STAR = '<svg class="star-glyph" viewBox="0 0 9 9" aria-hidden="true"><path d="M4 0h1v2h1v1h3v1H8v1H7v1h1v3H7V8H6V7H3v1H2v1H1V6h1V5H1V4H0V3h3V2h1z"/></svg>';
const DOWN = '<svg class="download-glyph" viewBox="0 0 9 10" aria-hidden="true"><path d="M4 0h1v6h1V5h1V4h1v1H7v1H6v1H5v1H4V7H3V6H2V5H1V4h1v1h1v1h1zM0 9h9v1H0z"/></svg>';

const link = (l) => `<li${l.sub ? ' class="foot-sub"' : ""}><a href="${esc(l.href)}"${l.rel ? ` rel="${l.rel}"` : ""}${l.track ? ` data-track="${l.track}"` : ""}>${esc(l.text)}</a></li>`;

/**
 * The footer of every page. Outside <main>, after it.
 * @param {{ groups?: ReturnType<typeof footGroups>, version?: string, stars?: string, home?: boolean }} opts
 *   home: on the homepage the Download button goes to #get on the same page
 */
export function siteFooter({ groups = footGroups(), version = "", stars = "", home = false } = {}) {
  const nav = groups.map((g, i) => `<div class="foot-group">
        <p class="foot-k" id="foot-${g.id}"><span>${String(i + 1).padStart(2, "0")}</span> ${esc(g.label)}</p>
        <ul aria-labelledby="foot-${g.id}">
          ${g.links.map(link).join("\n          ")}
        </ul>
      </div>`).join("\n      ");
  return `<footer class="foot">
    <div class="foot-head">
      <p class="foot-status"><span class="foot-led" aria-hidden="true"></span>Built from Penthera${version ? ` ${esc(version)}` : ""}. Runs offline. Rules decide.</p>
      <div class="foot-ctas">
        <button class="theme glass" type="button" role="switch" aria-checked="true" aria-label="Dark theme" data-theme-toggle hidden>
          <span class="theme-track" aria-hidden="true"><span class="theme-knob"></span></span>
        </button>
        <a class="star glass" href="${REPO}" data-track="github-star-bottom" aria-label="Star Penthera on GitHub${stars ? `, ${esc(stars)} stars` : ""}">
          ${STAR}
          <span class="star-word">Star</span><span class="star-count">${esc(stars)}</span>
        </a>
        <a class="download glass" href="${home ? "#get" : "/#get"}">
          ${DOWN}
          <span>Download</span>
        </a>
      </div>
    </div>
    <nav class="foot-nav" aria-label="Site map">
      ${nav}
    </nav>
    <div class="foot-field" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <a class="foot-mark" href="#main"><span class="foot-word" aria-hidden="true"></span><span class="sr">Penthera, back to the top</span></a>
    <p class="foot-facts"><span>MIT license</span><span>Scan only what you own or are authorized to test</span><span>No cookies, no third-party requests, anonymous page views only</span></p>
  </footer>`;
}
