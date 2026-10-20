import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { safeFetch, probeFetch, DEFAULT_USER_AGENT } from "../src/utils/http.js";

let server;
let baseUrl;
let lastUserAgent;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastUserAgent = req.headers["user-agent"];
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
});

describe("User-Agent header", () => {
  it("has the penthera/<version> format", () => {
    expect(DEFAULT_USER_AGENT).toMatch(
      /^penthera\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)? \(\+https:\/\/github\.com\/danoszz\/penthera\)$/,
    );
  });

  it("safeFetch sends the identifying User-Agent", async () => {
    await safeFetch(baseUrl);
    expect(lastUserAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("probeFetch sends the identifying User-Agent", async () => {
    await probeFetch(baseUrl);
    expect(lastUserAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("lets the caller override the User-Agent", async () => {
    await safeFetch(baseUrl, { headers: { "User-Agent": "custom/1.0" } });
    expect(lastUserAgent).toBe("custom/1.0");
  });
});