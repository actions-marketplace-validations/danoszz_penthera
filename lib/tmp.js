/** Temporary folders that are always removed. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Run `fn` with a fresh private folder (mkdtemp, real path) and remove it
 * afterwards, whether `fn` returns or throws.
 * @template T
 * @param {string} prefix e.g. "penthera-hook-"
 * @param {(dir: string) => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function withTempDir(prefix, fn) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
