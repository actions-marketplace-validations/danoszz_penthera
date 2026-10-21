/** Node globals lib/ touches. Imported before anything from lib/. */
import { Buffer } from "./buffer.js";

globalThis.Buffer ??= Buffer;
globalThis.process ??= { platform: "browser", env: {}, cwd: () => "/repo", versions: {} };
