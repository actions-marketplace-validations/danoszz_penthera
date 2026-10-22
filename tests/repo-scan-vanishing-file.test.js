/**
 * A file that disappears between the directory listing and the stat (a SQLite
 * -wal file, an editor swap file) must be skipped, not stop the scan. So must
 * one that changes type after the walk saw a regular file: a FIFO must not
 * block the read and a symlink must not be followed.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal();
  const lstatSync = (p, ...rest) => {
    if (String(p).endsWith(".env.swp") || String(p).endsWith("gone.py")) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, lstat '${p}'`), { code: "ENOENT" });
    }
    // Stand-ins for an entry swapped after the walk stat'ed it: the walk sees
    // a regular file, the read finds a FIFO or a symlink.
    if (String(p).endsWith("swapped-fifo.env") || String(p).endsWith("swapped-link.py")) {
      return fs.statSync(fs.realpathSync(__filename));
    }
    return fs.lstatSync(p, ...rest);
  };
  return { ...fs, lstatSync, default: { ...fs, lstatSync } };
});

const { scanSecrets } = await import("../lib/whitebox/secrets.js");

describe("scanSecrets: files that vanish mid-scan", () => {
  it("skips the vanished entry and scans the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-vanish-"));
    try {
      const secret = "Zq8" + "Wd7R" + "K2mP9vL4";
      writeFileSync(join(dir, "gone.py"), `api_key = "${secret}"\n`);
      writeFileSync(join(dir, ".env.swp"), "x");
      writeFileSync(join(dir, "data.db-wal"), "x");
      writeFileSync(join(dir, "app.py"), `api_key = "${secret}"\n`);
      expect(scanSecrets(dir).map((f) => f.url)).toEqual(["app.py"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scanSecrets: files that change type after the walk", () => {
  const secret = "Zq8" + "Wd7R" + "K2mP9vL4";

  it.skipIf(process.platform === "win32")("does not block on a FIFO or follow a symlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-swap-"));
    const outside = mkdtempSync(join(tmpdir(), "penthera-outside-"));
    try {
      execFileSync("mkfifo", [join(dir, "swapped-fifo.env")]);
      writeFileSync(join(outside, "target.py"), `api_key = "${secret}"\n`);
      symlinkSync(join(outside, "target.py"), join(dir, "swapped-link.py"));
      writeFileSync(join(dir, "app.py"), `api_key = "${secret}"\n`);
      expect(scanSecrets(dir).map((f) => f.url)).toEqual(["app.py"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
