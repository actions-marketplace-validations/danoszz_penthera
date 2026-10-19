#!/usr/bin/env node
/**
 * Refresh the vendored Retire.js vulnerability database.
 *
 * Run at release time (it is the only part of the release that goes online):
 *
 *   node scripts/refresh-retire-db.mjs           # download and write the snapshot
 *   node scripts/refresh-retire-db.mjs --check   # exit 1 if the snapshot is stale
 *
 * Writes:
 *   lib/data/retire-jsrepository.json.gz    the database, gzipped
 *   lib/data/retire-jsrepository.meta.json  source URL, fetch date, SHA-256
 *
 * The SHA-256 is over the uncompressed JSON, so anyone can verify the snapshot
 * against upstream with `curl -s <source> | shasum -a 256`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

const SOURCE = "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository.json";
const DB_PATH = new URL("../lib/data/retire-jsrepository.json.gz", import.meta.url);
const META_PATH = new URL("../lib/data/retire-jsrepository.meta.json", import.meta.url);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function download() {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${SOURCE} returned HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const db = JSON.parse(buf.toString("utf-8"));
  if (!db || typeof db !== "object" || Object.keys(db).length === 0) {
    throw new Error("downloaded database is empty");
  }
  return { buf, libraries: Object.keys(db).length };
}

async function main() {
  const { buf, libraries } = await download();
  const hash = sha256(buf);

  if (process.argv.includes("--check")) {
    const vendored = gunzipSync(readFileSync(DB_PATH));
    if (sha256(vendored) !== hash) {
      console.error("Vendored Retire.js database differs from upstream. Run: node scripts/refresh-retire-db.mjs");
      process.exit(1);
    }
    console.log(`Vendored Retire.js database matches upstream (sha256 ${hash}).`);
    return;
  }

  writeFileSync(DB_PATH, gzipSync(buf, { level: 9 }));
  const meta = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    sha256: hash,
    bytes: buf.length,
    libraries,
  };
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
  console.log(`Wrote ${libraries} libraries (${buf.length} bytes, sha256 ${hash}).`);
}

main().catch((err) => {
  console.error(`refresh-retire-db: ${err.message}`);
  process.exit(1);
});
