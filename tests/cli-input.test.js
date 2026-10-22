/**
 * What a user types: the scan's first argument, and Ctrl-D at a prompt.
 * Found in the 2026-10-22 end-to-end test (docs/research/e2e-test-2026-10-22.md).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { targetFromArg } from "../src/utils/url.js";

describe("targetFromArg", () => {
  it("keeps a full http(s) URL", () => {
    expect(targetFromArg("https://www.example.com/app/")).toEqual({ url: "https://www.example.com/app" });
    expect(targetFromArg("http://[::1]:8080")).toEqual({ url: "http://[::1]:8080" });
  });

  it("adds https:// to a bare public host and http:// to a local one", () => {
    expect(targetFromArg("www.example.com")).toEqual({ url: "https://www.example.com" });
    expect(targetFromArg("localhost:3000")).toEqual({ url: "http://localhost:3000" });
    expect(targetFromArg("127.0.0.1:8765/api")).toEqual({ url: "http://127.0.0.1:8765/api" });
    expect(targetFromArg("192.168.1.20")).toEqual({ url: "http://192.168.1.20" });
  });

  it("reports a word that is neither a command nor a host instead of throwing", () => {
    // `penthera mcp` on a version without the mcp command, or a typo like `penthera dep`.
    for (const word of ["mcp", "dep", "scan"]) {
      const r = targetFromArg(word);
      expect(r.error).toMatch(/not a penthera command or a URL/);
      expect(r.error).toMatch(/penthera --help/);
    }
  });

  it("refuses schemes it cannot scan", () => {
    expect(targetFromArg("ftp://example.com").error).toMatch(/http:\/\/ and https:\/\//);
    expect(targetFromArg("file:///etc/passwd").error).toMatch(/http:\/\/ and https:\/\//);
  });
});

describe("prompt: Ctrl-D at a terminal", () => {
  beforeEach(() => vi.resetModules());

  function tty() {
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => input;
    return { input, output: new PassThrough() };
  }

  it("calls the end handler instead of throwing ERR_USE_AFTER_CLOSE on the next question", async () => {
    const { initPrompt, ask } = await import("../src/cli/prompt.js");
    const { input, output } = tty();
    const onEnd = vi.fn();
    await initPrompt({ input, output, onEnd });
    const first = ask("first? ");
    input.write("yes\n");
    await expect(first).resolves.toBe("yes");
    input.end();
    await new Promise((r) => setImmediate(r));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(() => ask("second? ")).not.toThrow();
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it("does not treat closePrompt() as Ctrl-D", async () => {
    const { initPrompt, closePrompt } = await import("../src/cli/prompt.js");
    const { input, output } = tty();
    const onEnd = vi.fn();
    await initPrompt({ input, output, onEnd });
    closePrompt();
    await new Promise((r) => setImmediate(r));
    expect(onEnd).not.toHaveBeenCalled();
  });
});
