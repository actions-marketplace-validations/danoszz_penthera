/**
 * `penthera mcp` protocol layer: JSON-RPC 2.0 framing and errors, the modern
 * (2026-07-28, stateless) and legacy (initialize) eras, and every response
 * checked against the official MCP JSON schemas (tests/fixtures/mcp-spec/).
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { startServer, startLegacy, MODERN_META, structured } from "./helpers/mcp-client.js";
import { MAX_LINE_BYTES, SUPPORTED_VERSIONS } from "../src/mcp/server.js";
import { listTools } from "../src/mcp/tools.js";
import { validate } from "../src/mcp/validate.js";
import { parseMcpArgs } from "../src/cli/mcp.js";

const SPEC = join(import.meta.dirname, "fixtures", "mcp-spec");
const spec = (f) => JSON.parse(readFileSync(join(SPEC, f), "utf8"));
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
ajv.addSchema(spec("schema-2026-07-28.json"), "modern");
ajv.addSchema(spec("schema-2025-11-25.json"), "legacy");

function conforms(era, def, value) {
  const v = ajv.getSchema(`${era}#/$defs/${def}`);
  expect(v, `${era} ${def} exists`).toBeTypeOf("function");
  const ok = v(value);
  expect(ok, JSON.stringify(v.errors?.slice(0, 3))).toBe(true);
}

let client;
afterEach(async () => { await client?.close(); client = null; });

describe("modern era (2026-07-28)", () => {
  it("answers the spec's server/discover example", async () => {
    client = startServer();
    const ex = spec("server-discover-request.json");
    const res = await client.raw(JSON.stringify(ex), ex.id);
    conforms("modern", "DiscoverResultResponse", res);
    expect(res.result.supportedVersions).toEqual(SUPPORTED_VERSIONS);
    expect(res.result.resultType).toBe("complete");
    expect(res.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("penthera");
    expect(res.result.capabilities).toEqual({ tools: {} });
  });

  it("answers the spec's tools/list example with ttlMs, cacheScope and a stable order", async () => {
    client = startServer();
    const ex = spec("list-tools-request.json");
    const res = await client.raw(JSON.stringify(ex), ex.id);
    conforms("modern", "ListToolsResultResponse", res);
    expect(res.result.tools.map((t) => t.name)).toEqual(["scan_repo", "scan_url", "check_dependencies", "audit_ai_tooling", "explain_finding", "runtime_advisories"]);
    expect(res.result.ttlMs).toBeGreaterThan(0);
    expect(res.result.cacheScope).toBe("public");
    for (const t of res.result.tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
    }
  });

  it("returns a tool error result for the spec's tools/call example (unknown tool is a protocol error)", async () => {
    client = startServer();
    const ex = spec("call-tool-request.json");
    const res = await client.raw(JSON.stringify(ex), ex.id);
    conforms("modern", "JSONRPCErrorResponse", res);
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toMatch(/Unknown tool: get_weather/);
  });

  it("serves tools/call statelessly and the result conforms to CallToolResultResponse", async () => {
    client = startServer();
    const res = await client.modern("tools/call", { name: "explain_finding", arguments: { id: "agents/mcp-unpinned" } });
    conforms("modern", "CallToolResultResponse", res);
    expect(res.result.resultType).toBe("complete");
    expect(res.result.isError).toBeUndefined();
    expect(structured(res).owasp.map((o) => o.id)).toEqual(["MCP04", "ASI04"]);
  });

  it("rejects an unknown protocol version with -32022 and the supported list, like the spec's example", async () => {
    client = startServer();
    const ex = spec("unsupported-version.json");
    const res = await client.request("tools/list", { _meta: { ...MODERN_META, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } }, ex.id);
    conforms("modern", "UnsupportedProtocolVersionError", res);
    expect(res.error.code).toBe(ex.error.code);
    expect(res.error.data).toEqual({ supported: SUPPORTED_VERSIONS, requested: "1900-01-01" });
  });

  it("rejects a modern request without clientCapabilities with -32602", async () => {
    client = startServer();
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28" };
    const res = await client.request("tools/list", { _meta: meta });
    expect(res.error.code).toBe(-32602);
  });

  it("refuses a request with no version and no initialize, naming both ways in", async () => {
    client = startServer();
    const res = await client.request("tools/list", {});
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toMatch(/initialize/);
    expect(res.error.message).toMatch(/2026-07-28/);
  });
});

describe("legacy era (initialize)", () => {
  it("negotiates a supported version and conforms to the 2025-11-25 schema", async () => {
    client = await startLegacy({}, "2025-06-18");
    conforms("legacy", "JSONRPCResultResponse", client.init);
    conforms("legacy", "InitializeResult", client.init.result);
    expect(client.init.result.protocolVersion).toBe("2025-06-18");
    expect(client.init.result.serverInfo.name).toBe("penthera");
    const tools = await client.request("tools/list");
    conforms("legacy", "ListToolsResult", tools.result);
    expect(tools.result.ttlMs).toBeUndefined();
    const call = await client.request("tools/call", { name: "explain_finding", arguments: { id: "secrets" } });
    conforms("legacy", "CallToolResult", call.result);
  });

  it("answers an unknown requested version with its latest legacy version", async () => {
    client = await startLegacy({}, "2099-01-01");
    expect(client.init.result.protocolVersion).toBe("2025-11-25");
  });

  it("answers ping", async () => {
    client = await startLegacy();
    expect((await client.request("ping")).result).toEqual({});
  });

  it("asks a client that declares roots for them, and confines paths to those roots", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "penthera-mcp-roots-")));
    const granted = join(base, "granted");
    const other = join(base, "other");
    mkdirSync(granted);
    mkdirSync(other);
    try {
      const asked = [];
      client = await startLegacy({
        roots: [other],
        onClientRequest: (m) => { asked.push(m.method); return { roots: [{ uri: pathToFileURL(granted).href, name: "granted" }] }; },
      }, "2025-11-25", { roots: { listChanged: true } });
      const inGranted = await client.request("tools/call", { name: "audit_ai_tooling", arguments: {} });
      expect(asked).toEqual(["roots/list"]);
      expect(inGranted.result.isError).toBeUndefined();
      // The server's own root no longer applies once the client sent roots.
      const res = await client.request("tools/call", { name: "audit_ai_tooling", arguments: { path: other } });
      expect(res.result.isError).toBe(true);
      expect(res.result.content[0].text).toMatch(/outside the workspace/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("falls back to --root when every client root is missing (host paths in a container)", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "penthera-mcp-container-")));
    const src = join(base, "src");
    mkdirSync(src);
    try {
      client = await startLegacy({
        roots: [src],
        onClientRequest: () => ({ roots: [{ uri: pathToFileURL(join(base, "Users", "me", "project")).href, name: "host" }] }),
      }, "2025-11-25", { roots: {} });
      const res = await client.request("tools/call", { name: "audit_ai_tooling", arguments: {} });
      expect(res.result.isError).toBeUndefined();
      const outside = await client.request("tools/call", { name: "audit_ai_tooling", arguments: { path: base } });
      expect(outside.result.content[0].text).toMatch(new RegExp(`outside the workspace this server may read \\(${src}\\)`));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("refuses to start when no --root exists, and names it", () => {
    const missing = join(tmpdir(), "penthera-mcp-no-such-root", "src");
    expect(() => parseMcpArgs(["--root", missing])).toThrow(`No usable --root: ${missing} (each must be an existing folder)`);
  });

  it("keeps the server's roots when the client declares no roots capability", async () => {
    const asked = [];
    client = await startLegacy({ onClientRequest: (m) => { asked.push(m.method); return { roots: [] }; } });
    const res = await client.request("tools/call", { name: "explain_finding", arguments: { id: "headers" } });
    expect(res.result.isError).toBeUndefined();
    expect(asked).toEqual([]);
  });
});

describe("JSON-RPC framing and errors", () => {
  it("answers bad JSON with -32700 and id null, and keeps serving", async () => {
    client = startServer();
    const res = await client.raw("{not json", null);
    expect(res).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    expect((await client.modern("tools/list")).result.tools).toHaveLength(6);
  });

  it("refuses batches and envelopes that are not JSON-RPC 2.0", async () => {
    client = startServer();
    expect((await client.raw("[]", null)).error.code).toBe(-32600);
    expect((await client.raw(JSON.stringify({ jsonrpc: "1.0", id: 7, method: "ping" }), 7)).error.code).toBe(-32600);
    expect((await client.raw(JSON.stringify({ jsonrpc: "2.0", id: null, method: "ping" }), null)).error.code).toBe(-32600);
    expect((await client.raw(JSON.stringify({ jsonrpc: "2.0", id: 1.5, method: "ping" }), null)).error.code).toBe(-32600);
  });

  it("answers an unknown method with -32601", async () => {
    client = startServer();
    expect((await client.modern("resources/list")).error.code).toBe(-32601);
  });

  it("ignores notifications, including unknown ones, without replying", async () => {
    client = startServer();
    client.notify("notifications/whatever", {});
    client.notify("notifications/cancelled", { requestId: 99 });
    await client.modern("tools/list");
    expect(client.lines).toHaveLength(1);
  });

  it("rejects a line over the size cap and recovers", async () => {
    client = startServer();
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(MAX_LINE_BYTES) } });
    const res = await client.raw(big, null);
    expect(res.error.code).toBe(-32700);
    expect(res.error.message).toMatch(/over/);
    expect((await client.modern("tools/list")).result.tools).toHaveLength(6);
  });

  it("drops the response of a cancelled request", async () => {
    client = startServer();
    const id = "slow-1";
    client.input.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { _meta: MODERN_META, name: "audit_ai_tooling", arguments: {} } }) + "\n");
    client.notify("notifications/cancelled", { requestId: id, reason: "test" });
    await client.modern("tools/list");
    // close() waits for in-flight calls, so the cancelled one has finished by now.
    await client.close();
    const ids = client.lines.map((l) => JSON.parse(l).id);
    client = null;
    expect(ids).not.toContain(id);
    expect(ids).toHaveLength(1);
  });

  it("writes one JSON message per line and nothing else", async () => {
    client = startServer();
    await client.modern("server/discover");
    await client.modern("tools/list");
    for (const l of client.lines) expect(() => JSON.parse(l)).not.toThrow();
  });
});

describe("tool argument validation", () => {
  it("reports invalid arguments as a tool error the model can read", async () => {
    client = startServer();
    const cases = [
      [{ name: "scan_repo", arguments: { path: 42 } }, /path must be a string/],
      [{ name: "scan_repo", arguments: { cmd: "rm -rf /" } }, /cmd is not a known argument/],
      [{ name: "scan_repo", arguments: { path: "a\u0000b" } }, /path has characters/],
      [{ name: "scan_url", arguments: {} }, /url is required/],
      [{ name: "scan_url", arguments: { url: "http://localhost", profile: "deep" } }, /profile must be one of quick, standard/],
      [{ name: "scan_repo", arguments: { max_findings: 1000 } }, /at most 200/],
      [{ name: "explain_finding", arguments: { id: "$(id)" } }, /id has characters/],
      [{ name: "runtime_advisories", arguments: { headers: { "bad header": "x" } } }, /property name/],
    ];
    for (const [params, why] of cases) {
      const res = await client.modern("tools/call", params);
      expect(res.result.isError, JSON.stringify(params)).toBe(true);
      expect(res.result.content[0].text).toMatch(why);
    }
  });

  it("every published inputSchema uses only keywords the validator implements", () => {
    // validate() throws on a keyword it does not implement, so a schema it can't fully check fails here.
    const sample = { path: ".", url: "http://localhost:3000", id: "secrets", headers: { server: "nginx" }, max_findings: 5, prod: true, profile: "quick" };
    for (const t of listTools()) {
      const args = Object.fromEntries(Object.keys(t.inputSchema.properties).map((k) => [k, sample[k]]));
      if (t.name === "runtime_advisories") delete args.path;
      expect(validate(t.inputSchema, args), t.name).toEqual([]);
    }
  });
});
