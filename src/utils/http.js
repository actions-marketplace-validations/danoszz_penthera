import { readFileSync } from "node:fs";

const DEFAULT_TIMEOUT = 8_000;

function readVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Identifying User-Agent so target owners can see and filter scanner traffic.
 */
export const DEFAULT_USER_AGENT = `penthera/${readVersion()} (+https://github.com/danoszz/penthera)`;

/**
 * Fetch with timeout and graceful failure (returns null on network error).
 */
export async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || DEFAULT_TIMEOUT);
  try {
    const headers = new Headers(opts.headers);
    if (!headers.has("user-agent")) {
      headers.set("user-agent", DEFAULT_USER_AGENT);
    }
    return await fetch(url, {
      ...opts,
      headers,
      signal: controller.signal,
      redirect: opts.redirect ?? "manual",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch helper that always returns status, body text, and headers.
 */
export async function probeFetch(url, opts = {}) {
  const res = await safeFetch(url, opts);
  if (!res) return null;

  const body = await res.text().catch(() => "");
  const headers = Object.fromEntries(res.headers.entries());

  return {
    status: res.status,
    body,
    headers,
    ok: res.ok,
  };
}