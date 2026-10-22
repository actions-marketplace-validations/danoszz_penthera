/**
 * Exposure templates for three E10 pilot misses on Juice Shop: a public
 * Prometheus /metrics endpoint, a browsable directory listing (found through
 * robots.txt), and a stack trace in an error page. Each fires on the thing's
 * format, not on an SPA index page or a plain error page. Servers are built at
 * runtime on 127.0.0.1.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import {
  BUILT_IN_TEMPLATES, executeTemplate, runBuiltInTemplates, directoryListingTemplate, robotsDisallowedPaths,
} from "../lib/templates.js";

const template = BUILT_IN_TEMPLATES.find((t) => t.id === "prometheus-metrics-exposed");

const EXPOSITION = [
  "# HELP http_requests_total Number of HTTP requests",
  "# TYPE http_requests_total counter",
  'http_requests_total{method="get",code="200"} 1027',
  "# HELP process_resident_memory_bytes Resident memory size in bytes.",
  "# TYPE process_resident_memory_bytes gauge",
  "process_resident_memory_bytes 7.5e+07",
  "",
].join("\n");

let server;
afterEach(() => new Promise((r) => (server ? server.close(r) : r())));

async function serve(status, type, body) {
  server = createServer((req, res) => {
    res.writeHead(req.url === "/metrics" ? status : 404, { "Content-Type": type });
    res.end(req.url === "/metrics" ? body : "");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${server.address().port}`;
}

describe("prometheus-metrics-exposed template", () => {
  it("reports a public Prometheus endpoint", async () => {
    const base = await serve(200, "text/plain; version=0.0.4; charset=utf-8", EXPOSITION);
    const findings = await executeTemplate(base, template);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ name: "Prometheus metrics endpoint exposed", severity: "medium", status: 200 });
    expect(new URL(findings[0].matchedUrl).pathname).toBe("/metrics");
    expect(findings[0].tags[0]).toBe("exposure");
  });

  it("ignores an SPA index page served at /metrics, even one that quotes the format", async () => {
    const html = `<!DOCTYPE html><html><body><pre>\n${EXPOSITION}</pre></body></html>`;
    const base = await serve(200, "text/html", html);
    expect(await executeTemplate(base, template)).toHaveLength(0);
  });

  it("ignores text that has HELP lines but no TYPE line", async () => {
    const base = await serve(200, "text/plain", "# HELP me please\nnot metrics\n");
    expect(await executeTemplate(base, template)).toHaveLength(0);
  });

  it("ignores a protected endpoint", async () => {
    const base = await serve(401, "text/plain", EXPOSITION);
    expect(await executeTemplate(base, template)).toHaveLength(0);
  });
});

// A server from a path -> [status, content-type, body] map; anything else is 404.
async function serveRoutes(routes) {
  server = createServer((req, res) => {
    const [status, type, body] = routes[req.url] || [404, "text/plain", "Not Found"];
    res.writeHead(status, { "Content-Type": type });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${server.address().port}`;
}

const SERVE_INDEX = '<!DOCTYPE html><html><head><title>listing directory /ftp</title></head><body><ul id="files"><li><a href="/ftp/legal.md">legal.md</a></li></ul></body></html>';
const AUTOINDEX = "<html><head><title>Index of /uploads/</title></head><body><h1>Index of /uploads/</h1><pre><a href=\"../\">../</a>\n</pre></body></html>";
const SPA = "<!DOCTYPE html><html><head><title>Shop</title></head><body><app-root></app-root><p>Index of / products</p></body></html>";

describe("directory listings", () => {
  it("reads plain folder paths from robots.txt and skips wildcards", () => {
    const robots = "User-agent: *\nDisallow: /ftp\nDisallow: /\nDisallow: /*.pdf$\nDisallow: /search?q=\nDisallow: /ftp\nAllow: /public\n  disallow : /private/  \n";
    expect(robotsDisallowedPaths(robots)).toEqual(["/ftp", "/private/"]);
    expect(robotsDisallowedPaths("")).toEqual([]);
  });

  it("finds a listing in a folder that robots.txt disallows", async () => {
    const base = await serveRoutes({
      "/robots.txt": [200, "text/plain", "User-agent: *\nDisallow: /ftp\n"],
      "/ftp": [200, "text/html", SERVE_INDEX],
    });
    const hits = (await runBuiltInTemplates(base)).filter((f) => f.templateId.startsWith("directory-listing:"));
    expect(hits.map((f) => new URL(f.matchedUrl).pathname)).toEqual(["/ftp"]);
    expect(hits[0]).toMatchObject({ name: "Browsable directory listing", severity: "medium", status: 200 });
    expect(hits[0].tags[0]).toBe("exposure");
  });

  it("finds a listing in a common folder without robots.txt", async () => {
    const base = await serveRoutes({ "/uploads/": [200, "text/html", AUTOINDEX] });
    const findings = await executeTemplate(base, directoryListingTemplate("/uploads/"));
    expect(findings).toHaveLength(1);
  });

  it("ignores an SPA page that mentions 'Index of' and a 403 listing", async () => {
    const base = await serveRoutes({
      "/files/": [200, "text/html", SPA],
      "/backup/": [403, "text/html", AUTOINDEX],
    });
    expect(await executeTemplate(base, directoryListingTemplate("/files/"))).toHaveLength(0);
    expect(await executeTemplate(base, directoryListingTemplate("/backup/"))).toHaveLength(0);
  });

  it("ignores an HTML robots.txt (an SPA fallback)", async () => {
    const base = await serveRoutes({
      "/robots.txt": [200, "text/html", "<html>Disallow: /ftp</html>"],
      "/ftp": [200, "text/html", SERVE_INDEX],
    });
    const hits = (await runBuiltInTemplates(base)).filter((f) => f.templateId.startsWith("directory-listing:"));
    expect(hits).toHaveLength(0);
  });
});

describe("stack trace in error responses", () => {
  const stackTemplate = BUILT_IN_TEMPLATES.find((t) => t.id === "error-stack-trace");
  const page = (trace) => `<html><body><h1>500 Error: Unexpected path</h1><ul id="stacktrace">${trace}</ul></body></html>`;
  const TRACES = {
    node: "<li> &nbsp; &nbsp;at /app/build/routes/angular.js:18:18</li><li>at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)</li>",
    python: "Traceback (most recent call last):\n  File \"/app/main.py\", line 4, in <module>",
    java: "java.lang.IllegalStateException: boom\n\tat com.example.web.Controller.show(Controller.java:42)",
    php: "Fatal error: Uncaught Exception in /var/www/index.php:3\nStack trace:\n#0 {main}",
    dotnet: "System.Exception: boom\n   at Shop.Web.Controllers.HomeController.Index() in C:\\src\\Shop\\HomeController.cs:line 42",
  };

  for (const [runtime, trace] of Object.entries(TRACES)) {
    it(`reports a ${runtime} stack trace on a not-found API path`, async () => {
      const base = await serveRoutes({ "/api/penthera-not-found": [500, "text/html", page(trace)] });
      const findings = await executeTemplate(base, stackTemplate);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ name: "Stack trace in error response", severity: "low", status: 500 });
      expect(new URL(findings[0].matchedUrl).pathname).toBe("/api/penthera-not-found");
      expect(findings[0].tags[0]).toBe("info-leak");
    });
  }

  it("ignores plain error pages and pages that only mention line numbers", async () => {
    const base = await serveRoutes({
      "/api/penthera-not-found": [404, "text/html", "<pre>Cannot GET /api/penthera-not-found</pre>"],
      "/penthera-not-found": [404, "text/html", "<p>Look at https://example.com/a.js:1:2 or chapter 3, line 4.</p>"],
    });
    expect(await executeTemplate(base, stackTemplate)).toHaveLength(0);
  });

  it("sends no payload: only GETs of a path that does not exist", () => {
    for (const req of stackTemplate.http) {
      expect(req.method).toBe("GET");
      expect(req.path).toMatch(/^\/(?:api\/)?penthera-not-found$/);
      expect(req.body).toBeUndefined();
    }
  });
});
