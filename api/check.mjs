/**
 * POST /api/check
 *
 * penthera.org's live check, described in /openapi.json. Three actions:
 *
 *   {"url": "example.com"}                      the passive report, for any public site:
 *                                               only what a browser loads (api/_lib/tier1.mjs)
 *   {"url": "example.com", "action": "token"}   the proof-of-ownership token for the domain
 *   {"url": "example.com", "action": "deep"}    after the owner placed the token: the
 *                                               standard, payload-free URL scan (api/_lib/deep.mjs)
 *
 * Nothing is stored or logged; the URL travels in the body, so it never
 * appears in request logs. Every request to the target goes through the guard
 * in api/_lib/guard.mjs.
 *
 * Every report has the same shape, which the page renders:
 *   { url, tier: "passive"|"deep", score, verdict, redirects[], scope,
 *     categories: [{ id, label, passed, total }],
 *     checks: [{ id, category, passed, severity, title, evidence, fix, verify, weight }] }
 */
import { parseTarget, CheckError } from "./_lib/guard.mjs";
import { passiveReport } from "./_lib/tier1.mjs";
import { tokenFor, deepReport } from "./_lib/deep.mjs";

const LIMIT = 8;            // checks per address per minute, per instance
const WINDOW = 60_000;
const seen = new Map();

function limited(ip, now = Date.now()) {
  const hits = (seen.get(ip) || []).filter((t) => now - t < WINDOW);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 5000) seen.clear();
  return hits.length > LIMIT;
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

const fail = (res, e) => send(res, e.status, { error: { code: e.code, message: e.message, hint: e.hint } });

async function readBody(req) {
  // Vercel hands over a parsed body; plain Node (the local preview) a stream.
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new CheckError("too_large", "The request body is too large.", 413, "Send only {\"url\": \"…\"}.");
  }
  return JSON.parse(raw || "{}");
}

/** @param {{lookup?: Function, allowPrivate?: boolean, anyPort?: boolean, now?: number, secret?: string}} opts  For tests only. */
export function createHandler(opts = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST");
      return fail(res, new CheckError("method_not_allowed", "Use POST with a JSON body.", 405, "POST /api/check with {\"url\": \"example.com\"}. See /openapi.json."));
    }
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) return fail(res, new CheckError("rate_limited", "Too many checks in a minute.", 429, "Wait a minute, or run npx penthera <url> on your own machine."));

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, e instanceof CheckError ? e : new CheckError("invalid_json", "The body is not JSON.", 400, "Send {\"url\": \"example.com\"}."));
    }

    try {
      const typed = String(body?.url ?? "");
      const target = parseTarget(typed);
      const action = body?.action ?? "passive";
      if (action === "token") return send(res, 200, tokenFor(target, opts));
      if (action === "deep") return send(res, 200, await deepReport(target, opts));
      if (action !== "passive") throw new CheckError("invalid_action", `Unknown action "${String(action).slice(0, 20)}".`, 400, "Use passive, token or deep.");
      return send(res, 200, await passiveReport(target, { ...opts, typed }));
    } catch (e) {
      if (e instanceof CheckError) return fail(res, e);
      return fail(res, new CheckError("internal", "The check failed on our side.", 500, "Try again, or run npx penthera <url> on your own machine."));
    }
  };
}

export default createHandler();
