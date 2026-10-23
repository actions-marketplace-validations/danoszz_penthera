/**
 * Vercel Routing Middleware for penthera.org, on "/" only (vercel.json,
 * proxy.matcher). An agent that asks for Markdown (Accept: text/markdown)
 * gets /index.md, the homepage as Markdown; everyone else gets index.html,
 * untouched, because returning nothing lets the request continue.
 *
 * Middleware is needed because Vercel serves a file before it applies
 * vercel.json rewrites, so a rewrite on "/" never runs. Unknown paths need no
 * code here: they miss the filesystem, and a rewrite sends Markdown requests
 * to api/not-found.mjs.
 *
 * No dependencies: it returns a plain Response, so @vercel/functions is not
 * needed. site/serve.mjs runs this same function locally.
 */

/** q-value of each media range in an Accept header. */
function ranges(accept) {
  return String(accept || "").split(",").map((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(";").map((s) => s.trim());
    const q = params.find((p) => p.startsWith("q="));
    return { type, q: q ? Number(q.slice(2)) || 0 : 1 };
  });
}

/**
 * True when the client asked for Markdown at least as much as for HTML.
 * Wildcards do not count: a browser's * / * is not a request for Markdown.
 */
export function wantsMarkdown(accept) {
  const r = ranges(accept);
  const best = (types) => Math.max(0, ...r.filter((x) => types.includes(x.type)).map((x) => x.q));
  const md = best(["text/markdown", "text/x-markdown"]);
  return md > 0 && md >= best(["text/html", "application/xhtml+xml"]);
}

export default async function proxy(request) {
  if (!wantsMarkdown(request.headers.get("accept"))) return;
  const res = await fetch(new URL("/index.md", request.url));
  if (!res.ok) return;
  const body = request.method === "HEAD" ? null : await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Location": "/index.md",
      Vary: "Accept",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
