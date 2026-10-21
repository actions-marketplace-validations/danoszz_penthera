/**
 * Mounts what lib/ reads from its own install at /penthera: the bundled rule
 * packs (hash-checked again by lib/rules/pack.js when it loads them), the
 * gzipped popular-package lists, and the version from package.json.
 * site/build.mjs supplies the bytes as virtual:assets.
 */
import { mount } from "./shims/fs.js";
import { Buffer } from "./shims/buffer.js";
import { FILES, BUILD } from "virtual:assets";

export const GZ_PATHS = [];
for (const [path, f] of Object.entries(FILES)) {
  mount(path, "b64" in f ? Buffer.from(f.b64, "base64") : f.text);
  if (path.endsWith(".gz")) GZ_PATHS.push(path);
}

export { BUILD };
