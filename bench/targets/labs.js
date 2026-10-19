/**
 * Benchmark targets: two small local HTTP servers with hand-labelled behaviour.
 *
 *   injection-lab  deliberately vulnerable endpoints (one flaw per endpoint),
 *                  every one of them listed in bench/ground-truth.json.
 *   decoy-lab      hardened server whose endpoints look suspicious to a naive
 *                  scanner but are not vulnerable. Any finding here is a false
 *                  positive by construction.
 *
 * Both bind to 127.0.0.1 only and make no outbound requests. Nothing here
 * executes input: the "vulnerable" responses are simulated with string checks.
 */
import http from "node:http";

const HARDENED_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { "Content-Type": type, ...extra });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(data));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function listen(handler, port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch(() => send(res, 500, "text/plain", "error"));
    });
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address();
      resolve({
        server,
        port: p,
        url: `http://127.0.0.1:${p}`,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

// ── injection-lab ────────────────────────────────────────────────────────

async function injectionLab(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const q = url.searchParams;
  const h = { ...HARDENED_HEADERS };

  switch (url.pathname) {
    case "/":
      return send(res, 200, "text/html", "<html><body>injection lab</body></html>", h);

    // GT injection-lab/cmdi: POST {input} is (simulated) passed to a shell, so
    // ";id" returns the output of id(1).
    case "/api/ping": {
      if (req.method !== "POST") return send(res, 200, "application/json", JSON.stringify({ pong: true }), h);
      let input = "";
      try { input = JSON.parse(await readBody(req)).input || ""; } catch { /* ignore */ }
      const out = /[;|]\s*id\b/.test(input) ? "uid=1000(app) gid=1000(app) groups=1000(app)" : "PING ok";
      return send(res, 200, "text/plain", out, h);
    }

    // GT injection-lab/sqli-error: a quote in ?id= breaks the (simulated) query.
    case "/api/search": {
      const id = q.get("id");
      if (id && /['"]/.test(id)) {
        return send(res, 500, "text/html",
          "<b>Error</b>: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version", h);
      }
      return send(res, 200, "application/json", JSON.stringify({ results: [] }), h);
    }

    // GT injection-lab/xss-reflected: ?q= reflected into HTML without encoding.
    case "/api/products": {
      const term = q.get("q") || "";
      return send(res, 200, "text/html", `<html><body><h1>Results for ${term}</h1></body></html>`, h);
    }

    // GT injection-lab/ssti: ?name={{a*b}} is "evaluated" like a template engine would.
    case "/api/generate": {
      let name = q.get("name") || "";
      if (req.method === "POST") {
        try { name = JSON.parse(await readBody(req)).name || ""; } catch { /* ignore */ }
      }
      // String() matters: the fuzzer sends non-string JSON values, and an
      // earlier version of this lab crashed with a 500 on them (reported by
      // Penthera's fuzzer, correctly).
      const out = String(name).replace(/\{\{\s*(\d+)\s*\*\s*(\d+)\s*\}\}/g, (_, a, b) => String(Number(a) * Number(b)));
      return send(res, 200, "text/plain", `Hello ${out}`, h);
    }

    // GT injection-lab/open-redirect: ?next= used as Location with no allow-list.
    case "/api/connect": {
      const next = q.get("next");
      if (next) {
        res.writeHead(302, { Location: next, ...h });
        return res.end();
      }
      return send(res, 200, "application/json", JSON.stringify({ ok: true }), h);
    }

    default:
      return send(res, 404, "application/json", JSON.stringify({ error: "not found" }), h);
  }
}

// ── decoy-lab ────────────────────────────────────────────────────────────

function decoyLab() {
  let slowServed = false;
  let loginAttempts = 0;

  return async function handler(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    const q = url.searchParams;
    const h = { ...HARDENED_HEADERS };

    switch (url.pathname) {
      case "/":
        return send(res, 200, "text/html", "<html><body>decoy lab</body></html>",
          { ...h, "Set-Cookie": "sid=abc123; HttpOnly; SameSite=Lax; Path=/" });

      // Decoy: input is reflected, but HTML-encoded. Not XSS.
      case "/api/items": {
        const term = q.get("q") || q.get("search") || "";
        return send(res, 200, "text/html", `<html><body><p>No items match ${escapeHtml(term)}</p></body></html>`, h);
      }

      // Decoy: echoes input verbatim and always contains "49", the classic
      // fixed SSTI canary. Not evaluated, so not SSTI.
      case "/api/posts": {
        const name = q.get("name") || "";
        return send(res, 200, "text/plain", `49 posts. You searched for: ${name}`, h);
      }

      // Decoy: documentation page that always mentions a MySQL syntax error,
      // with or without injected input. Error text alone is not SQLi.
      case "/api/messages":
        return send(res, 200, "text/html",
          "<p>Troubleshooting: if you see 'You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version', contact support.</p>", h);

      // Decoy: the first request that carries a sleep payload is slow (a cold
      // start), every later one is fast. One slow response is not blind SQLi.
      case "/api/events": {
        const id = q.get("id") || "";
        if (!slowServed && /sleep/i.test(id)) {
          slowServed = true;
          await new Promise((r) => setTimeout(r, 3_300));
        }
        return send(res, 200, "application/json", JSON.stringify({ events: [] }), h);
      }

      // Decoy: honours ?next= only for same-site relative paths. Not an open
      // redirect. Browsers treat "\" like "/", so "/\evil.com" is rejected
      // too (an earlier version of this decoy missed that, and Penthera
      // correctly reported it).
      case "/api/download": {
        const next = q.get("next") || q.get("redirect") || q.get("url") || "";
        if (/^\/(?![\/\\])/.test(next)) {
          res.writeHead(302, { Location: next, ...h });
          return res.end();
        }
        return send(res, 200, "application/json", JSON.stringify({ ok: true }), h);
      }

      // Login with rate limiting: 429 after three attempts.
      case "/api/login": {
        if (req.method !== "POST") return send(res, 404, "application/json", "{}", h);
        await readBody(req);
        loginAttempts++;
        if (loginAttempts > 3) return send(res, 429, "application/json", JSON.stringify({ error: "too many requests" }), h);
        return send(res, 401, "application/json", JSON.stringify({ error: "invalid credentials" }), h);
      }

      default:
        return send(res, 404, "application/json", JSON.stringify({ error: "not found" }), h);
    }
  };
}

export function startInjectionLab(port = 0) {
  return listen(injectionLab, port);
}

export function startDecoyLab(port = 0) {
  return listen(decoyLab(), port);
}
