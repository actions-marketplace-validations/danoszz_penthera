import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readKey, sitemapUrls, payload, submit, ENDPOINT } from "../scripts/indexnow.mjs";

const ORIGIN = "https://penthera.org";
const KEY = "0123456789abcdef0123456789abcdef";
const XML = `<?xml version="1.0"?><urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/terms</loc></url><url><loc>https://elsewhere.example/x</loc></url><url><loc>${ORIGIN}/terms</loc></url></urlset>`;

/** A fetch that answers from a table and records every call; never the network. */
function fakeFetch(table) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    const [status, text] = table[`${init.method || "GET"} ${url}`] ?? [404, ""];
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  f.calls = calls;
  return f;
}

describe("scripts/indexnow.mjs", () => {
  it("reads the key from the one site/<32 hex>.txt that contains its own name", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-indexnow-"));
    try {
      expect(() => readKey(dir)).toThrow(/expected one IndexNow key file/);
      writeFileSync(join(dir, `${KEY}.txt`), "wrong");
      expect(() => readKey(dir)).toThrow(/must contain its own name/);
      writeFileSync(join(dir, `${KEY}.txt`), `${KEY}\n`);
      expect(readKey(dir)).toBe(KEY);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the repo has exactly one valid key file", () => {
    expect(readKey()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("takes each sitemap URL once, on the site's own host only", () => {
    expect(sitemapUrls(XML, ORIGIN)).toEqual([`${ORIGIN}/`, `${ORIGIN}/terms`]);
    expect(payload({ origin: ORIGIN, key: KEY, urls: ["a"] })).toEqual({ host: "penthera.org", key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList: ["a"] });
  });

  it("a dry run reads the sitemap and sends nothing", async () => {
    const f = fakeFetch({ [`GET ${ORIGIN}/sitemap.xml`]: [200, XML] });
    const r = await submit({ origin: ORIGIN, key: KEY, sitemap: `${ORIGIN}/sitemap.xml`, dryRun: true, fetch: f });
    expect(r.status).toBeNull();
    expect(r.body.urlList).toHaveLength(2);
    expect(f.calls.map((c) => c.url)).toEqual([`${ORIGIN}/sitemap.xml`]);
  });

  it("refuses to submit until the key file is live", async () => {
    const f = fakeFetch({});
    await expect(submit({ origin: ORIGIN, key: KEY, sitemap: "local.xml", readFile: () => XML, fetch: f })).rejects.toThrow(/deploy first/);
    expect(f.calls.some((c) => c.url === ENDPOINT)).toBe(false);
  });

  it("posts the payload once the key file answers with the key", async () => {
    const f = fakeFetch({ [`GET ${ORIGIN}/${KEY}.txt`]: [200, KEY], [`POST ${ENDPOINT}`]: [202, ""] });
    const r = await submit({ origin: ORIGIN, key: KEY, sitemap: "local.xml", readFile: () => XML, fetch: f });
    expect(r.status).toBe(202);
    const post = f.calls.find((c) => c.url === ENDPOINT);
    expect(JSON.parse(post.init.body)).toEqual(payload({ origin: ORIGIN, key: KEY, urls: [`${ORIGIN}/`, `${ORIGIN}/terms`] }));
  });

  it("reports a rejected submission", async () => {
    const f = fakeFetch({ [`GET ${ORIGIN}/${KEY}.txt`]: [200, KEY], [`POST ${ENDPOINT}`]: [403, "Key not valid"] });
    await expect(submit({ origin: ORIGIN, key: KEY, sitemap: "local.xml", readFile: () => XML, fetch: f })).rejects.toThrow(/403: Key not valid/);
  });
});
