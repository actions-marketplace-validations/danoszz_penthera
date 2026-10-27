/**
 * Landing pages: one search question each, answered once, with the live check
 * as the call to action. Each is a Markdown file in site/pages/ with a
 * title and description for search in a small front matter block:
 *
 *   ---
 *   title: Free website security check: headers, TLS, cookies and leaked keys
 *   description: One or two sentences, under 160 characters.
 *   ---
 *   # The question, as the reader asks it
 *
 * `{{CTA}}` places the button to /#scan; other `{{NAME}}` placeholders are the
 * build's measured numbers. The build writes /<slug>.html (served at /<slug>)
 * and the Markdown at /<slug>.md; agents.mjs lists both.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "./terms.mjs";
import { fill } from "./agents.mjs";
import { ldScript, siteFoot } from "./frame.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CTA_HTML = '<p class="land-cta"><a class="btn" data-variant="default" href="/#scan">Check your site</a><span>Free, passive, nothing stored. Your own site only.</span></p>';

/** Parse one page: front matter, the H1 and the body. Throws on a missing field. */
export function parsePage(md, file) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md.replace(/\r\n/g, "\n"));
  if (!m) throw new Error(`${file}: no front matter`);
  const meta = Object.fromEntries(m[1].split("\n").map((l) => /^(\w+):\s*(.+)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].trim()]));
  for (const k of ["title", "description"]) if (!meta[k]) throw new Error(`${file}: front matter has no ${k}`);
  if (meta.description.length > 160) throw new Error(`${file}: description is ${meta.description.length} characters; search engines cut it at about 160`);
  const body = md.replace(/\r\n/g, "\n").slice(m[0].length);
  const h1 = /^# (.+)$/m.exec(body)?.[1];
  if (!h1) throw new Error(`${file}: no # heading`);
  if (!body.includes("{{CTA}}")) throw new Error(`${file}: no {{CTA}}`);
  return { ...meta, h1, body };
}

/** The pages in site/pages/, by slug. */
export function landingPages(site) {
  const dir = join(site, "pages");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({
    slug: f.slice(0, -3),
    ...parsePage(readFileSync(join(dir, f), "utf8"), `site/pages/${f}`),
  }));
}

/** One page as Markdown, for agents: the CTA as a link, numbers filled in. */
export function landingMarkdown(p, { origin, values }) {
  const body = p.body.replaceAll("{{CTA}}", `[Check your site on penthera.org](${origin}/#scan)`)
    .replace(/\]\(\/(?!\/)/g, `](${origin}/`);
  return `${fill(body, values, `site/pages/${p.slug}.md`).trimEnd()}\n`;
}

/** One page as HTML, in the site's own frame (the frame /terms uses). */
export function landingHtml(p, { origin, values, styles = "/styles.css", theme = "/theme.js", blog = false }) {
  const md = fill(p.body.replace(/^# .+\n/m, "").replaceAll("{{CTA}}", "\u0000CTA\u0000"), values, `site/pages/${p.slug}.md`);
  const body = renderMarkdown(md).replace(/<p>\u0000CTA\u0000<\/p>/g, CTA_HTML);
  const url = `${origin}/${p.slug}`;
  // WebPage and BreadcrumbList, part of the site; the homepage carries the SoftwareApplication.
  const ld = ldScript([
    { "@type": "WebPage", "@id": url, url, name: p.title, description: p.description, isPartOf: { "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: "Penthera" }, about: { "@type": "SoftwareApplication", name: "Penthera", url: `${origin}/` } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Penthera", item: `${origin}/` }, { "@type": "ListItem", position: 2, name: p.h1, item: url }] },
  ]);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.title)} · Penthera</title>
  <meta name="description" content="${esc(p.description)}">
  <meta name="color-scheme" content="dark light">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="text/markdown" href="/${p.slug}.md">
  <meta property="og:site_name" content="Penthera">
  <meta property="og:title" content="${esc(p.h1)}">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${origin}/media/social/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${origin}/media/social/og.png">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${styles}">
  <script src="${theme}"></script>
  ${ld}
</head>
<body>
  <main class="terms land" id="main">
    <p class="eyebrow"><a href="/">Penthera</a> · Live check</p>
    <h1>${esc(p.h1)}</h1>
${body}
    ${siteFoot({ blog })}
  </main>
</body>
</html>
`;
}
