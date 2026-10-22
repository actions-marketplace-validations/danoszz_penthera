/**
 * A minimal in-process MCP client for tests: drives serve() over a stream,
 * collects every line it writes, and resolves requests by id.
 */
import { PassThrough } from "node:stream";
import { serve } from "../../src/mcp/server.js";

export const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

export function startServer(opts = {}) {
  const input = new PassThrough();
  const lines = [];
  const waiters = new Map();
  const onClientRequest = opts.onClientRequest || (() => null);
  const write = (line) => {
    if (line.includes("\n")) throw new Error("server wrote an embedded newline");
    lines.push(line);
    const msg = JSON.parse(line);
    if ("method" in msg && "id" in msg) {
      // The server asked us something (roots/list): answer like a client would.
      const result = onClientRequest(msg);
      if (result !== undefined) input.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
      return;
    }
    const w = waiters.get(msg.id ?? null);
    if (w) { waiters.delete(msg.id ?? null); w(msg); }
  };
  const done = serve({
    input, write,
    serverRoots: opts.roots || [process.cwd()],
    allowHosts: opts.allowHosts || [],
    offline: opts.offline ?? true,
    version: "0.0.0-test",
    log: () => {},
  });
  let n = 0;
  const raw = (text, id) => new Promise((resolve) => { waiters.set(id, resolve); input.write(text + "\n"); });
  const request = (method, params, id = ++n) => raw(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params !== undefined && { params }) }), id);
  const notify = (method, params) => input.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params && { params }) }) + "\n");
  const modern = (method, params = {}) => request(method, { ...params, _meta: MODERN_META });
  const close = async () => { input.end(); await done; };
  return { input, lines, raw, request, notify, modern, close };
}

/** A legacy session: initialize + initialized. */
export async function startLegacy(opts = {}, version = "2025-11-25", capabilities = {}) {
  const c = startServer(opts);
  const init = await c.request("initialize", { protocolVersion: version, capabilities, clientInfo: { name: "test", version: "1" } });
  c.notify("notifications/initialized");
  return { ...c, init };
}

/** The structured result of a tools/call response. */
export const structured = (res) => res.result.structuredContent;
