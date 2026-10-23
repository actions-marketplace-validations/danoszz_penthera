#!/usr/bin/env node
/**
 * Tell Bing, Yandex, Seznam, Naver and the other IndexNow engines that
 * penthera.org changed. Run it by hand after a deploy:
 *
 *   node scripts/indexnow.mjs [--dry-run] [--sitemap <file|url>] [--origin https://penthera.org]
 *
 * It reads the URLs from the live sitemap (or the file you name), checks that
 * the key file is live at <origin>/<key>.txt with the right content, and sends
 * one POST to api.indexnow.org. The key is the name of the one
 * site/<32 hex>.txt file; the build copies it to the site root. Google does
 * not use IndexNow; it reads the sitemap that robots.txt names.
 *
 * Fetchers are injected for tests (tests/indexnow.test.js), which stay offline.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const KEY_FILE = /^[0-9a-f]{32}\.txt$/;
/** IndexNow accepts up to 10,000 URLs in one POST. */
const MAX_URLS = 10_000;

/** The key: the name of the one site/<32 hex>.txt, checked against its content. */
export function readKey(site = join(ROOT, "site")) {
  const files = readdirSync(site).filter((f) => KEY_FILE.test(f));
  if (files.length !== 1) throw new Error(`site/: expected one IndexNow key file (<32 hex>.txt), found ${files.length}`);
  const key = files[0].slice(0, -4);
  if (readFileSync(join(site, files[0]), "utf8").trim() !== key) throw new Error(`site/${files[0]}: the file must contain its own name, without .txt`);
  return key;
}

/** Every <loc> in a sitemap, on `origin` only. */
export function sitemapUrls(xml, origin) {
  const host = new URL(origin).host;
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(urls.filter((u) => new URL(u).host === host))];
}

/** The POST body IndexNow expects. */
export function payload({ origin, key, urls }) {
  return { host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls.slice(0, MAX_URLS) };
}

/**
 * Read the sitemap, check the key file is live, and submit.
 * @param {{ origin: string, key: string, sitemap: string, dryRun?: boolean, fetch?: typeof fetch, readFile?: (p: string) => string }} o
 * @returns {Promise<{ status: number | null, body: object }>}
 */
export async function submit({ origin, key, sitemap, dryRun = false, fetch: get = fetch, readFile = (p) => readFileSync(p, "utf8") }) {
  const xml = /^https:\/\//.test(sitemap) ? await (await get(sitemap, { signal: AbortSignal.timeout(10_000) })).text() : readFile(sitemap);
  const urls = sitemapUrls(xml, origin);
  if (!urls.length) throw new Error(`${sitemap}: no URLs on ${origin}`);
  const body = payload({ origin, key, urls });
  if (dryRun) return { status: null, body };

  const live = await get(body.keyLocation, { signal: AbortSignal.timeout(10_000) });
  const text = live.ok ? (await live.text()).trim() : "";
  if (text !== key) throw new Error(`${body.keyLocation} answered ${live.status}${live.ok ? " without the key" : ""}; deploy first, then run this again`);

  const res = await get(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  // 200 and 202 both mean accepted; 202 means the key is still being checked.
  if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status: res.status, body };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values: args } = parseArgs({ options: {
    "dry-run": { type: "boolean" }, sitemap: { type: "string" }, origin: { type: "string" },
  } });
  const origin = (args.origin || JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).homepage).replace(/\/+$/, "");
  try {
    const { status, body } = await submit({ origin, key: readKey(), sitemap: args.sitemap || `${origin}/sitemap.xml`, dryRun: args["dry-run"] });
    if (status === null) console.log(JSON.stringify(body, null, 2));
    else console.log(`IndexNow: ${status}, ${body.urlList.length} URLs on ${body.host}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
