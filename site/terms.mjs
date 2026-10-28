/**
 * /terms: docs/live-check-terms.md as a page, so the repository holds the one
 * source and the site shows it. A small Markdown renderer for the subset that
 * file uses (headings, paragraphs, lists, fenced code, links, code, bold), with
 * every piece of text escaped. No dependency.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const REPO = "https://github.com/danoszz/penthera/blob/main/docs/";

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      // Anchors, site paths and https links stay; a relative path is a file in docs/.
      const url = /^(#|\/(?!\/)|https:\/\/)/.test(href) ? href : new URL(href, REPO).href;
      return `<a href="${url}">${label}</a>`;
    });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Markdown (the subset above) to HTML. */
export function renderMarkdown(md) {
  const out = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para = [], list = null, code = null;
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; };
  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; }
      else code.push(line.replace(/^ {2}/, ""));
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushPara();
      // A fence inside a list item belongs to that item.
      code = [];
      if (list) { const prev = list.items.pop(); list.items.push(prev); list.fenceIn = true; }
      continue;
    }
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) { flushPara(); flushList(); const n = h[1].length; out.push(`<h${n} id="${slug(h[2])}">${inline(h[2])}</h${n}>`); continue; }
    if (/^> /.test(line)) { flushPara(); flushList(); out.push(`<p class="terms-for">${inline(line.slice(2))}</p>`); continue; }
    const li = /^(\s*)(?:[-*]|(\d+)\.) (.+)$/.exec(line);
    if (li && !li[1]) {
      flushPara();
      const tag = li[2] ? "ol" : "ul";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(inline(li[3]));
      continue;
    }
    if (/^\s+\S/.test(line) && list) { list.items[list.items.length - 1] += " " + inline(line.trim()); continue; }
    if (!line.trim()) { flushPara(); if (list && !list.fenceIn) flushList(); continue; }
    para.push(line.trim());
  }
  flushPara(); flushList();
  // Code fenced inside a list item was emitted after the list; keep it there.
  return out.join("\n");
}

/** The /terms page, in the site's own frame. */
/**
 * A page from one Markdown file in docs/: the repository holds the one source
 * and the site shows it. Used for /terms and /trust.
 */
export function docPage(root, { file, slug, eyebrow, description, styles = "/styles.css", theme = "/theme.js" }) {
  const md = readFileSync(join(root, "docs", file), "utf8");
  const title = /^# (.+)$/m.exec(md)[1];
  const body = renderMarkdown(md.replace(/^# .+\n/m, ""));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · Penthera</title>
  <meta name="description" content="${esc(description)}">
  <meta name="color-scheme" content="dark light">
  <link rel="canonical" href="https://penthera.org/${slug}">
  <link rel="alternate" type="text/markdown" href="/docs/${file}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${styles}">
  <script src="${theme}"></script>
</head>
<body>
  <main class="terms" id="main">
    <p class="eyebrow"><a href="/">Penthera</a> · ${esc(eyebrow)}</p>
    <h1>${esc(title)}</h1>
${body}
  </main>
</body>
</html>
`;
}

/** /terms: the live check's terms, from docs/live-check-terms.md. */
export function termsPage(root, opts = {}) {
  return docPage(root, {
    file: "live-check-terms.md", slug: "terms", eyebrow: "Terms",
    description: "What you may do with penthera.org's live check, what it requests, and what it stores: nothing.", ...opts,
  });
}
