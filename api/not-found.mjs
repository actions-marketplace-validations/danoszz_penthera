/**
 * The 404 for agents. vercel.json rewrites a request that matched no file to
 * here only when its Accept header names text/markdown; a browser still gets
 * Vercel's HTML 404. The status stays 404, and the body says where to look.
 */
const ORIGIN = "https://penthera.org";

export const NOT_FOUND_MD = `# Not found

There is no page at this address on ${ORIGIN}.

- [${ORIGIN}/llms.txt](${ORIGIN}/llms.txt): what Penthera is, the pinned commands, and where each doc is
- [${ORIGIN}/sitemap.xml](${ORIGIN}/sitemap.xml): every URL on this site
- [${ORIGIN}/docs/index.md](${ORIGIN}/docs/index.md): the documentation, as Markdown
- [${ORIGIN}/index.md](${ORIGIN}/index.md): the homepage, as Markdown
- [${ORIGIN}/openapi.json](${ORIGIN}/openapi.json): the live check API
`;

export default function handler(req, res) {
  res.writeHead(404, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Accept",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(req.method === "HEAD" ? undefined : NOT_FOUND_MD);
}
