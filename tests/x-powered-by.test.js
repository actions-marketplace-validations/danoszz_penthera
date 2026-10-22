/**
 * X-Powered-By disclosure (E10 pilot miss `x-powered-by` on DVNA): the header
 * audit reports the header when a response carries it, and stays quiet when
 * it is absent. The server is built at runtime and listens on 127.0.0.1.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { auditSecurityHeaders } from "../lib/blackbox/headers.js";
import { fingerprint } from "../lib/crawler.js";

let server;
let base;

beforeAll(async () => {
  // Express's default: every response says X-Powered-By: Express.
  server = createServer((req, res) => {
    const headers = { "Content-Type": "text/html" };
    if (req.url !== "/quiet") headers["X-Powered-By"] = "Express";
    res.writeHead(200, headers);
    res.end("<html><body>ok</body></html>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

const poweredBy = (findings) => findings.filter((f) => /X-Powered-By/.test(f.title));

describe("header audit: X-Powered-By", () => {
  it("reports the framework a live response names", async () => {
    const fp = await fingerprint(base);
    const hits = poweredBy(auditSecurityHeaders(fp.headers, base, { local: true }));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      title: "X-Powered-By header discloses Express",
      severity: "low",
      category: "headers",
      confidence: "confirmed",
    });
    expect(hits[0].evidence).toBe("x-powered-by: Express");
  });

  it("is silent when the header is absent", async () => {
    const fp = await fingerprint(`${base}/quiet`);
    expect(poweredBy(auditSecurityHeaders(fp.headers, base, { local: true }))).toHaveLength(0);
  });

  it("matches the header name in any case and ignores an empty value", () => {
    expect(poweredBy(auditSecurityHeaders({ "X-Powered-By": "PHP/8.3.6" }, base))).toHaveLength(1);
    expect(poweredBy(auditSecurityHeaders({ "x-powered-by": "  " }, base))).toHaveLength(0);
  });
});
