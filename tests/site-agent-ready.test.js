/**
 * penthera.org for agents: the homepage as Markdown (/index.md, linked from
 * "/"), Markdown 404s, JSON-LD, the live check's OpenAPI spec and the "When to
 * use" section of llms.txt. The preview server (site/serve.mjs) applies the
 * same rewrites as vercel.json, so the 404s are tested here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSite } from "../site/build.mjs";
import { apiErrorCodes, undescribedCodes, jsonLd } from "../site/agent-ready.mjs";
import { serve } from "../site/serve.mjs";

const ROOT = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const ORIGIN = pkg.homepage.replace(/\/+$/, "");
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));

let dir, out, values, server, base;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "penthera-agent-ready-"));
  out = join(dir, "dist");
  const prev = process.env.PENTHERA_SITE_STARS;
  process.env.PENTHERA_SITE_STARS = "off";
  try {
    ({ values } = await buildSite({ out }));
  } finally {
    if (prev === undefined) delete process.env.PENTHERA_SITE_STARS;
    else process.env.PENTHERA_SITE_STARS = prev;
  }
  server = await serve({ dir: out, port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
}, 180_000);

afterAll(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

const read = (f) => readFileSync(join(out, f), "utf8");

/** Every CheckError the API throws, with its status, straight from api/**.mjs. */
function sourceCodes() {
  const codes = {};
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".mjs")) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/new CheckError\(\s*"(\w+)",\s*(?:"(?:[^"\\]|\\.)*"|`[^`]*`),\s*(\d+)\s*,/g)) if (Number(m[2]) >= 400) codes[m[1]] ??= Number(m[2]);
        // Every construction is matched: none is skipped for an odd message.
        expect(src.match(/new CheckError\(/g)?.length ?? 0, p).toBe([...src.matchAll(/new CheckError\(\s*"(\w+)",\s*(?:"(?:[^"\\]|\\.)*"|`[^`]*`),\s*(\d+)\s*,/g)].length);
      }
    }
  };
  walk(join(ROOT, "api"));
  return codes;
}

describe("homepage as Markdown", () => {
  it("builds index.md from the page's values, with pinned commands and the links", () => {
    const md = read("index.md");
    expect(md).toMatch(/^# Penthera: your open-source cyber security agent\n/);
    expect(md).not.toMatch(/\{\{|undefined|—/);
    for (const cmd of [`npx penthera@${pkg.version}`, "npx skills add danoszz/penthera", `claude mcp add penthera -- npx -y penthera@${pkg.version} mcp`]) expect(md).toContain(cmd);
    const pins = [...md.matchAll(/penthera@(\d[\w.-]*)/g)].map((m) => m[1]);
    expect(new Set(pins)).toEqual(new Set([pkg.version]));
    for (const n of [values.N_URL, values.N_SECRETS, values.N_AGENTS, values.RULES_ALL]) expect(md).toContain(n);
    expect(md).toContain("## Limits");
    expect(md).toContain(`${ORIGIN}/api/check`);
    expect(md).toContain(`"consent":true`);
    expect(md).toContain(`${ORIGIN}/terms`);
    expect(md).not.toMatch(/\baction\b|token|deep/);
    for (const link of ["/llms.txt", "/docs/index.md", "/openapi.json"]) expect(md).toContain(`${ORIGIN}${link}`);
    expect(md).toContain("https://github.com/danoszz/penthera");
    expect(md).toContain("https://www.npmjs.com/package/penthera");
  });

  it("is served as Markdown and linked from / with rel=alternate", async () => {
    const md = await fetch(`${base}/index.md`);
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await md.text()).toBe(read("index.md"));
    const html = await fetch(`${base}/`);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toMatch(/^text\/html/);
    expect(html.headers.get("link")).toContain('</index.md>; rel="alternate"; type="text/markdown"');
    await html.text();
  });

  it("vercel.json has no Routing Middleware", () => {
    expect(vercel.proxy).toBeUndefined();
  });
});

describe("404 for agents", () => {
  it("answers an unknown path asked for as Markdown with a 404 in Markdown", async () => {
    const res = await fetch(`${base}/no-such-page`, { headers: { accept: "text/markdown" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const body = await res.text();
    expect(body.length).toBeGreaterThanOrEqual(20);
    for (const link of ["/llms.txt", "/sitemap.xml", "/docs/index.md"]) expect(body).toContain(`${ORIGIN}${link}`);
  });

  it("keeps the plain 404 for everyone else, and files still win over the rewrite", async () => {
    const res = await fetch(`${base}/no-such-page`, { headers: { accept: "text/html" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") || "").not.toMatch(/markdown/);
    await res.text();
    const llms = await fetch(`${base}/llms.txt`, { headers: { accept: "text/markdown" } });
    expect(llms.status).toBe(200);
    expect(llms.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await llms.text();
  });

  it("the function's origin is the package homepage", async () => {
    const { NOT_FOUND_MD } = await import("../api/not-found.mjs");
    expect(NOT_FOUND_MD).toContain(`${ORIGIN}/llms.txt`);
  });
});

describe("JSON-LD", () => {
  it("is one ld+json data block for the SoftwareApplication, with no contact details", () => {
    const tag = values.JSONLD;
    expect(tag).toMatch(/^<script type="application\/ld\+json">[^<]*<\/script>$/);
    const data = JSON.parse(tag.replace(/^<script[^>]*>|<\/script>$/g, ""));
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data).toMatchObject({
      name: "Penthera", url: ORIGIN, applicationCategory: "SecurityApplication",
      softwareVersion: pkg.version, downloadUrl: "https://www.npmjs.com/package/penthera",
      offers: { "@type": "Offer", price: "0" },
      author: { "@type": "Person", name: "Daan van der Zwaag", url: "https://daanvanderzwaag.com" },
    });
    expect(data.license).toMatch(/MIT/);
    expect(data.sameAs).toContain("https://github.com/danoszz/penthera");
    expect(data.operatingSystem).toBeTruthy();
    // The approved short line from site/BRIEF.md.
    expect(readFileSync(join(ROOT, "site", "BRIEF.md"), "utf8").replace(/\s+/g, " ")).toContain(data.description);
    expect(tag).not.toMatch(/address|telephone|email|@gaia|@gmail/i);
  });

  it("escapes < so a value cannot close the script element", () => {
    expect(jsonLd({ version: "</script><x>", origin: ORIGIN })).not.toMatch(/<\/script><x>/);
  });

  it("lands in the page when index.html has the placeholder", () => {
    const html = read("index.html");
    if (!readFileSync(join(ROOT, "site", "index.html"), "utf8").includes("{{JSONLD}}")) return;
    expect(html).toContain(values.JSONLD);
  });
});

describe("OpenAPI for the live check", () => {
  let spec;
  beforeAll(() => { spec = JSON.parse(read("openapi.json")); });

  it("is OpenAPI 3.1 for POST /api/check, with a unique operationId", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.version).toBe(pkg.version);
    expect(spec.servers[0].url).toBe(ORIGIN);
    expect(spec.info.termsOfService).toBe(`${ORIGIN}/terms`);
    expect(Object.keys(spec.paths)).toEqual(["/api/check"]);
    const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
    const ids = ops.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of ops) expect(o.description.length).toBeGreaterThan(40);
    const op = spec.paths["/api/check"].post;
    const req = spec.components.schemas.CheckRequest;
    expect(op.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/CheckRequest");
    expect(req.required).toEqual(["url", "consent"]);
    expect(req.properties.consent.const).toBe(true);
    expect(req.properties.action).toBeUndefined();
    expect(spec.components.schemas.Report.properties.tier.const).toBe("passive");
    expect(spec.components.schemas.OwnershipToken).toBeUndefined();
    expect(JSON.stringify(spec)).not.toMatch(/"deep"|ownership token/i);
  });

  it("describes the report fields api/check.mjs documents", () => {
    // The contract in api/check.mjs's header comment.
    const contract = readFileSync(join(ROOT, "api", "check.mjs"), "utf8").match(/^\/\*\*[\s\S]*?\*\//)[0];
    const report = spec.components.schemas.Report;
    for (const f of ["url", "tier", "score", "verdict", "redirects", "scope", "categories", "checks"]) {
      expect(contract, f).toMatch(new RegExp(`\\b${f}\\b`));
      expect(report.properties, f).toHaveProperty(f);
    }
    for (const f of ["id", "label", "passed", "total"]) expect(spec.components.schemas.Category.properties).toHaveProperty(f);
    for (const f of ["id", "category", "passed", "severity", "title", "evidence", "fix", "verify", "weight"]) expect(spec.components.schemas.Check.properties).toHaveProperty(f);
  });

  it("lists exactly the error codes api/ throws, each under its status and described", () => {
    const codes = sourceCodes();
    expect(Object.keys(codes).length).toBeGreaterThan(5);
    expect(apiErrorCodes(ROOT)).toEqual(codes);
    expect(spec.components.schemas.Error.properties.error.properties.code.enum).toEqual(Object.keys(codes).sort());
    expect(spec.components.schemas.Error.properties.error.required).toEqual(["code", "message", "hint"]);
    const responses = spec.paths["/api/check"].post.responses;
    for (const [code, status] of Object.entries(codes)) expect(responses[status]?.description, `${code} (${status})`).toContain(`\`${code}\``);
    // A new code needs a line in site/agent-ready.mjs (ERROR_HINTS).
    expect(undescribedCodes(codes)).toEqual([]);
  });

  it("is served as JSON, linked from llms.txt and listed in the sitemap", async () => {
    const res = await fetch(`${base}/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    await res.json();
    expect(read("llms.txt")).toContain(`(${ORIGIN}/openapi.json)`);
    for (const u of ["openapi.json", "index.md"]) expect(read("sitemap.xml")).toContain(`<loc>${ORIGIN}/${u}</loc>`);
    const termsPage = existsSync(join(ROOT, "docs", "live-check-terms.md"));
    expect(read("sitemap.xml").includes(`<loc>${ORIGIN}/terms</loc>`)).toBe(termsPage);
  });
});

describe("llms.txt", () => {
  it("says when to use Penthera, before the docs, with pinned commands and the API call", () => {
    const llms = read("llms.txt");
    const section = llms.slice(llms.indexOf("## When to use Penthera"), llms.indexOf("## Docs"));
    expect(llms.indexOf("## When to use Penthera")).toBeGreaterThan(0);
    expect(section.length).toBeGreaterThan(200);
    for (const cmd of ["--repo .", " deps", " agents", " mcp"]) expect(section).toContain(cmd);
    expect(section).toContain(`POST ${ORIGIN}/api/check`);
    expect(section).toContain('{"url": "example.com", "consent": true}');
    expect(section).toContain(`${ORIGIN}/terms`);
    expect(section).not.toMatch(/"action"|token|deep/);
    expect(section).not.toContain("—");
    const pins = [...llms.matchAll(/penthera@(\d[\w.-]*)/g)].map((m) => m[1]);
    expect(new Set(pins)).toEqual(new Set([pkg.version]));
  });
});
