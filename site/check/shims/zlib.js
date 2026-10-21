/**
 * node:zlib's gunzipSync, for the gzipped popular-package lists. Browsers only
 * gunzip asynchronously (DecompressionStream), so the engine inflates each
 * mounted .gz file before a check (prewarm) and this returns the result for
 * the same bytes.
 */
import { Buffer } from "./buffer.js";

const inflated = new WeakMap(); // the mounted .gz Buffer -> its contents

export async function prewarm(gz) {
  if (inflated.has(gz)) return;
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
  inflated.set(gz, Buffer.from(await new Response(stream).arrayBuffer()));
}

export function gunzipSync(gz) {
  const out = inflated.get(gz);
  if (!out) throw new Error("gunzipSync: these bytes were not prewarmed with DecompressionStream");
  return out;
}

export default { gunzipSync };
