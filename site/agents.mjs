/**
 * The site's files for agents and crawlers, built from the repo so they
 * cannot drift from it:
 *
 *   /llms.txt                    site/llms.txt with the build's placeholders filled in
 *   /llms-full.txt               README.md and the docs below, as one Markdown file
 *   /README.md, /docs/**.md      the same pages one by one, links made absolute
 *   /sitemap.xml                 the page, the landing pages and every file above
 *   /robots.txt                  everyone allowed, pointing at the sitemap
 *   /.well-known/security.txt    RFC 9116, pointing at SECURITY.md
 *   /index.md, /openapi.json     the homepage as Markdown and the live check's spec
 *                                (site/agent-ready.mjs)
 *
 * Every npm pin in a mirrored page (`penthera@1.2.3`) is rewritten to the
 * package's own version, so an agent that copies a command gets a version
 * that is published under the build's version. Links between mirrored pages
 * point at their mirrors; every other link points at the file on GitHub.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { agentReadyFiles, whenToUse } from "./agent-ready.mjs";
import { landingPages } from "./landing.mjs";

export const REPO = "https://github.com/danoszz/penthera";

/** Docs pages that are about running the project, not about using Penthera. */
const SKIP = new Set(["docs/voice.md", "docs/marketing.md", "docs/internal-audit.md", "docs/mcp-listing.md"]);
const DIRS = ["docs", "docs/commands", "docs/use-cases", "docs/compare", "docs/mcp-clients"];
const MEDIA = /\.(png|jpe?g|gif|svg|mp4|webm|vtt)$/i;

/**
 * The pages to mirror, in reading order: README.md, docs/index.md, then the
 * pages in the order docs/index.md first links them, then the rest by path.
 * @returns {string[]} repo-relative paths
 */
export function docPages(root) {
  const all = new Set();
  for (const d of DIRS) {
    if (!existsSync(join(root, d))) continue;
    for (const f of readdirSync(join(root, d))) {
      const p = `${d}/${f}`;
      if (f.endsWith(".md") && statSync(join(root, p)).isFile() && !SKIP.has(p)) all.add(p);
    }
  }
  const order = ["README.md", "docs/index.md"];
  const index = readFileSync(join(root, "docs", "index.md"), "utf8");
  for (const m of index.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) order.push(posix.normalize(posix.join("docs", m[1])));
  const seen = new Set();
  return [...order, ...[...all].sort()].filter((p) => (p === "README.md" || all.has(p)) && !seen.has(p) && seen.add(p));
}

/** Make a page's relative links absolute: to a mirror when there is one, else to GitHub. */
export function absoluteLinks(md, from, { root, origin, mirrored }) {
  const resolve = (target) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return target;
    const [path, hash = ""] = target.split(/(?=#)/);
    const abs = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, "");
    if (abs.startsWith("..")) return target;
    if (mirrored.has(abs)) return `${origin}/${abs}${hash}`;
    if (MEDIA.test(abs)) return `${REPO}/raw/main/${abs}`;
    const dir = existsSync(join(root, abs)) && statSync(join(root, abs)).isDirectory();
    return `${REPO}/${dir ? "tree" : "blob"}/main/${abs}${hash}`;
  };
  return md
    .replace(/(\]\()([^)\s]+)(\))/g, (m, open, target, close) => open + resolve(target) + close)
    .replace(/(<(?:img|a|source|video)\b[^>]*?\b(?:src|href|poster)=")([^"]+)(")/g, (m, open, target, close) => open + resolve(target) + close);
}

/** Rewrite npm pins (`penthera@1.2.3`, not `owner/penthera@...`) to `version`. */
export const pinTo = (text, version) => text.replace(/(?<![\w/-])penthera@\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/g, `penthera@${version}`);

/**
 * Every file for agents and crawlers.
 * @param {{ root: string, site: string, version: string, origin: string, values: Record<string,string>, now?: Date }} o
 * @returns {Record<string, string>} site path (no leading slash) to content
 */
export function agentFiles({ root, site, version, origin, values, now = new Date() }) {
  const pages = docPages(root);
  const mirrored = new Set(pages);
  const out = {};
  const mirror = (p) => pinTo(absoluteLinks(readFileSync(join(root, p), "utf8"), p, { root, origin, mirrored }), version).trimEnd() + "\n";

  for (const p of pages) {
    out[p] = `<!-- ${origin}/${p}: a copy of ${REPO}/blob/main/${p}, built from Penthera ${version}. -->\n\n${mirror(p)}`;
  }

  out["llms-full.txt"] = [
    "# Penthera: the full documentation",
    "",
    `> Penthera ${version}. README.md and the user documentation from ${REPO}, as one Markdown file. Each page is also at its own URL, listed in ${origin}/llms.txt. Only scan targets you own or are authorized to test.`,
    "",
    ...pages.flatMap((p) => ["", "---", "", `<!-- Source: ${REPO}/blob/main/${p} · ${origin}/${p} -->`, "", mirror(p)]),
  ].join("\n").replace(/\n{3,}/g, "\n\n");

  // llms.txt: the template, plus when to reach for Penthera (before the docs),
  // the landing pages (after them) and the live check's spec (with the other
  // machine-readable files).
  const landing = landingPages(site);
  const questions = landing.length ? `## Questions the live check answers\n\n${landing.map((p) => `- [${p.h1}](${origin}/${p.slug}.md): ${p.description}`).join("\n")}\n\n` : "";
  out["llms.txt"] = fill(readFileSync(join(site, "llms.txt"), "utf8"), { ...values, ORIGIN: origin }, "llms.txt")
    .replace(/^## Docs$/m, (m) => `${whenToUse({ version, origin })}\n${m}`)
    .replace(/^## Trust$/m, (m) => `${questions}${m}`)
    .replace(/^## Machine-readable\n\n/m, (m) => `${m}- [OpenAPI for the live check](${origin}/openapi.json): POST /api/check, a public site's passive security report\n`);
  Object.assign(out, agentReadyFiles({ root, version, origin, values }));

  // /terms, the live check's terms: build.mjs renders it from this file.
  const terms = existsSync(join(root, "docs", "live-check-terms.md")) ? ["terms"] : [];
  const urls = ["", "index.md", ...terms, ...landing.map((p) => p.slug), "llms.txt", "llms-full.txt", "openapi.json", ...pages];
  out["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${origin}/${u}</loc></url>`).join("\n")}\n</urlset>\n`;

  out["robots.txt"] = [
    "# penthera.org is a static page and the files listed in the sitemap. All of it is public;",
    "# crawlers, search engines and AI agents are welcome. For agents: /llms.txt.",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  // RFC 9116: Expires must be less than a year away; a deploy refreshes it.
  const expires = new Date(now.getTime() + 300 * 86_400_000);
  expires.setUTCHours(0, 0, 0, 0);
  out[".well-known/security.txt"] = [
    "# Report a vulnerability in Penthera itself (not a finding Penthera reported) privately,",
    "# through a GitHub security advisory. The policy says what to expect.",
    `Contact: ${REPO}/security/advisories/new`,
    `Expires: ${expires.toISOString().replace(".000", "")}`,
    `Policy: ${REPO}/blob/main/SECURITY.md`,
    "Preferred-Languages: en",
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
  return out;
}

/** Fill {{NAME}} placeholders; an unknown one is a build error. */
export function fill(text, values, file) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in values)) throw new Error(`${file}: unknown placeholder ${m}`);
    return values[k];
  });
}
