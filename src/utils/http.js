/**
 * The one HTTP client every Penthera probe uses.
 *
 * It owns three things so no module has to:
 *   - timeouts (one AbortController per request),
 *   - the User-Agent (`penthera/<version> (+repo url)`, overridable),
 *   - egress policy: which hosts a scan may talk to.
 *
 * A scan runs inside an egress context (see `runWithEgress`). The context
 * names the scan target and records every host contacted, every request it
 * refused, and every probe request that failed. Under `offline: true` the
 * client refuses any host (or port) other than the target's; a redirect may
 * only move to a host on the target's registrable domain. Outside a context
 * (unit tests, library use) requests are unrestricted and nothing is recorded.
 *
 * Response bodies are read through `readBody`, which caps the decoded size
 * and keeps the request's timeout running until the last byte, so a server
 * that drips, floods or sends a decompression bomb cannot stall or exhaust a
 * scan.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { registrableDomain } from "./url.js";

const DEFAULT_TIMEOUT = 8_000;
const MAX_REDIRECTS = 10;
/** Default cap on a decoded response body (bytes). */
export const DEFAULT_MAX_BODY = 5 * 1024 * 1024;
// Set on every Response `request` returns: when its timeout expires, and how
// to stop that timer once the body has been read.
const BODY_DEADLINE = Symbol("penthera.bodyDeadline");
// Request headers that carry credentials; never forwarded to another origin.
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];
const REPO_URL = "https://github.com/danoszz/penthera";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"));

export const DEFAULT_USER_AGENT = `penthera/${pkg.version} (+${REPO_URL})`;

const store = new AsyncLocalStorage();

/** Thrown (and recorded) when the egress policy refuses a request. */
export class EgressBlockedError extends Error {
  constructor(url, reason) {
    super(`blocked by --offline: ${reason}`);
    this.name = "EgressBlockedError";
    this.code = "EGRESS_BLOCKED";
    this.url = url;
  }
}

/**
 * Create the per-scan egress context.
 *
 * @param {object} opts
 * @param {string} opts.target - scan target URL; its host is always allowed
 * @param {boolean} [opts.offline] - refuse every host except the target
 * @param {string} [opts.userAgent] - override the default User-Agent
 * @param {string[]} [opts.allowHosts] - extra hosts to allow under offline
 */
export function createEgressContext(opts = {}) {
  const target = opts.target ? new URL(opts.target) : null;
  const targetHost = target ? target.hostname.toLowerCase() : null;
  return {
    targetHost,
    targetPort: target ? effectivePort(target) : null,
    targetDomain: targetHost ? registrableDomain(targetHost) : null,
    offline: opts.offline === true,
    userAgent: opts.userAgent || DEFAULT_USER_AGENT,
    allowHosts: new Set((opts.allowHosts || []).map((h) => h.toLowerCase())),
    contacted: new Map(), // host -> request count
    blocked: new Map(),   // host -> refused request count
    errors: new Map(),    // `${probe}\0${message}` -> { probe, url, message, count }
  };
}

/** Run `fn` with `ctx` as the active egress context (propagates across awaits). */
export function runWithEgress(ctx, fn) {
  return store.run(ctx, fn);
}

/** The active egress context, or null outside a scan. */
export function currentEgress() {
  return store.getStore() ?? null;
}

function isThirdParty(ctx, host) {
  if (!ctx.targetHost) return false;
  if (host === ctx.targetHost) return false;
  return registrableDomain(host) !== ctx.targetDomain;
}

/**
 * Decide whether `url` may be requested under the active policy.
 *
 * @param {string|URL} url
 * @param {{ redirect?: boolean }} [opts] - true when following a redirect hop
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkEgress(url, opts = {}, ctx = currentEgress()) {
  if (!ctx || !ctx.offline) return { allowed: true };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "unparseable URL" };
  }
  const host = parsed.hostname.toLowerCase();
  if (ctx.allowHosts.has(host)) return { allowed: true };
  const sameHost = host === ctx.targetHost;
  // A redirect may move within the target's registrable domain (apex -> www).
  const sameSite = opts.redirect && ctx.targetDomain && !isIpLike(host) && registrableDomain(host) === ctx.targetDomain;
  if (!sameHost && !sameSite) {
    return { allowed: false, reason: `${host} is not the scan target (${ctx.targetHost})` };
  }
  // Same host is not enough: another port is another service. The one
  // exception is the scheme's default port on both sides (http -> https).
  const port = effectivePort(parsed);
  if (ctx.targetPort == null || port === ctx.targetPort || (isDefaultPort(port) && isDefaultPort(ctx.targetPort))) {
    return { allowed: true };
  }
  return { allowed: false, reason: `${host}:${port} is not the scan target (${ctx.targetHost}:${ctx.targetPort})` };
}

function effectivePort(u) {
  if (u.port) return Number(u.port);
  return u.protocol === "https:" ? 443 : u.protocol === "http:" ? 80 : null;
}

function isDefaultPort(port) {
  return port === 80 || port === 443;
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function isIpLike(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function recordError(ctx, probe, url, message) {
  if (!ctx || probe === false) return;
  const key = `${probe}\0${message}`;
  const existing = ctx.errors.get(key);
  if (existing) existing.count++;
  else ctx.errors.set(key, { probe, url: String(url), message, count: 1 });
}

function withUserAgent(headers, userAgent) {
  const h = new Headers(headers || {});
  if (!h.has("user-agent")) h.set("user-agent", userAgent);
  return h;
}

function describeError(err, timeoutMs) {
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return `timeout after ${timeoutMs}ms`;
  const cause = err?.cause?.code || err?.cause?.message;
  return cause ? `${err.message} (${cause})` : String(err?.message || err);
}

/**
 * Issue one request through the egress policy.
 *
 * Resolves to the `Response` (3xx included when `redirect` is "manual", the
 * default) and throws on refusal, timeout or network error. Failures are
 * recorded on the active context under `opts.probe`.
 *
 * @param {string|URL} url
 * @param {object} [opts] - fetch options plus `timeout` (ms) and `probe` (name
 *   for result.errors; `false` to not record failures, e.g. when a fallback exists)
 */
export async function request(url, opts = {}) {
  const ctx = currentEgress();
  const { timeout = DEFAULT_TIMEOUT, probe = "http", redirect = "manual", signal, ...fetchOpts } = opts;
  const userAgent = ctx?.userAgent || DEFAULT_USER_AGENT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const deadline = Date.now() + timeout;
  // The timer keeps running after the headers arrive so the body is covered
  // too; it is cleared here on failure or by readBody once the body is read.
  let handedOff = false;
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  let current = String(url);
  let init = { ...fetchOpts, headers: withUserAgent(fetchOpts.headers, userAgent) };

  try {
    for (let hop = 0; ; hop++) {
      const verdict = checkEgress(current, { redirect: hop > 0 }, ctx);
      if (!verdict.allowed) {
        const blockedHost = safeHost(current);
        if (ctx && blockedHost) bump(ctx.blocked, blockedHost);
        throw new EgressBlockedError(current, verdict.reason);
      }

      const res = await globalThis.fetch(current, { ...init, signal: combined, redirect: "manual" });
      if (ctx) bump(ctx.contacted, new URL(current).hostname.toLowerCase());

      const location = res.headers.get("location");
      const isRedirect = res.status >= 300 && res.status < 400 && location;
      const next = isRedirect ? new URL(location, current).toString() : null;
      const crossOrigin = next && !sameOrigin(current, next);
      // A 307/308 replays the method and body; never replay a body to
      // another origin, hand the redirect back to the caller instead.
      const replaysBody = (res.status === 307 || res.status === 308) && init.body != null;
      if (redirect !== "follow" || !isRedirect || (crossOrigin && replaysBody)) {
        handedOff = true;
        timer.unref?.();
        res[BODY_DEADLINE] = { at: deadline, release: () => clearTimeout(timer) };
        return res;
      }
      if (hop >= MAX_REDIRECTS) throw new Error(`too many redirects (${MAX_REDIRECTS})`);

      // Follow by hand so every hop passes the egress check.
      await res.body?.cancel().catch(() => {});
      current = next;
      const method = (init.method || "GET").toUpperCase();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        init = { ...init, method: "GET", body: undefined };
      }
      if (crossOrigin) {
        // Credentials belong to the origin they were set for.
        const headers = new Headers(init.headers);
        for (const name of CREDENTIAL_HEADERS) headers.delete(name);
        init = { ...init, headers };
      }
    }
  } catch (err) {
    recordError(ctx, probe, current, err instanceof EgressBlockedError ? err.message : describeError(err, timeout));
    throw err;
  } finally {
    if (!handedOff) clearTimeout(timer);
  }
}

/** Thrown by readBody when a body is too large or too slow. */
export class BodyLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "BodyLimitError";
    this.code = "BODY_LIMIT";
  }
}

/**
 * Read a response body as text with a size cap and a deadline.
 *
 * Counts decoded bytes (after Content-Encoding), so a small compressed body
 * that inflates past the cap is stopped as soon as it crosses it. The
 * deadline defaults to the one `request` set from its `timeout`, so headers
 * and body share one budget. Rejects with BodyLimitError on either limit and
 * cancels the stream.
 *
 * @param {Response} res
 * @param {{ maxBytes?: number, deadline?: number, timeout?: number }} [opts]
 *   deadline: absolute epoch ms; timeout: ms from now. The earliest wins.
 * @returns {Promise<string>}
 */
export async function readBody(res, opts = {}) {
  const { maxBytes = DEFAULT_MAX_BODY } = opts;
  const attached = res?.[BODY_DEADLINE];
  let at = Infinity;
  if (attached) at = attached.at;
  if (opts.deadline != null) at = Math.min(at, opts.deadline);
  if (opts.timeout != null) at = Math.min(at, Date.now() + opts.timeout);

  let timer;
  let reader;
  try {
    if (!res?.body) return "";
    const declared = Number(res.headers?.get("content-length"));
    if (!res.headers?.get("content-encoding") && declared > maxBytes) {
      throw new BodyLimitError(`response body exceeds ${maxBytes} bytes`);
    }
    reader = res.body.getReader();
    const expired = new Promise((_, reject) => {
      if (at === Infinity) return;
      timer = setTimeout(() => reject(new BodyLimitError("response body timed out")), Math.max(0, at - Date.now()));
    });
    expired.catch(() => {});

    const decoder = new TextDecoder();
    const parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new BodyLimitError(`response body exceeds ${maxBytes} bytes`);
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } catch (err) {
    if (reader) reader.cancel().catch(() => {});
    else res?.body?.cancel?.().catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
    attached?.release();
  }
}

/** readBody, then JSON.parse. */
export async function readJson(res, opts) {
  return JSON.parse(await readBody(res, opts));
}

function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Fetch with timeout and graceful failure (returns null on any error).
 */
export async function safeFetch(url, opts = {}) {
  try {
    return await request(url, opts);
  } catch {
    return null;
  }
}

/**
 * Fetch helper that always returns status, body text, and headers
 * (null on failure).
 */
export async function probeFetch(url, opts = {}) {
  const res = await safeFetch(url, opts);
  if (!res) return null;

  const body = await readBody(res).catch(() => "");
  const headers = Object.fromEntries(res.headers.entries());

  return {
    status: res.status,
    body,
    headers,
    ok: res.ok,
  };
}

/**
 * Fetch and read the body, never throwing. Timing covers headers and body.
 * Failures come back as `{ status: 0, ok: false, error }`.
 *
 * @returns {Promise<{ status, body, size, headers, elapsed, ok, error? }>}
 */
export async function fetchText(url, opts = {}) {
  const start = Date.now();
  try {
    const res = await request(url, opts);
    const body = await readBody(res).catch(() => "");
    return {
      status: res.status,
      body,
      size: body.length,
      headers: Object.fromEntries(res.headers.entries()),
      elapsed: Date.now() - start,
      ok: true,
    };
  } catch (err) {
    return {
      status: 0,
      body: "",
      size: 0,
      headers: {},
      elapsed: Date.now() - start,
      ok: false,
      error: err instanceof EgressBlockedError ? err.message : describeError(err, opts.timeout ?? DEFAULT_TIMEOUT),
    };
  }
}

/**
 * Summarise what the active (or given) context saw, for the scan result.
 */
export function egressSummary(ctx = currentEgress()) {
  if (!ctx) return null;
  const sortHosts = (map) => [...map.entries()]
    .map(([host, requests]) => ({ host, requests }))
    .sort((a, b) => a.host.localeCompare(b.host));
  const contacted = sortHosts(ctx.contacted);
  return {
    offline: ctx.offline,
    userAgent: ctx.userAgent,
    target: ctx.targetHost,
    hosts: contacted,
    thirdPartyHosts: contacted.filter((h) => isThirdParty(ctx, h.host)),
    blocked: sortHosts(ctx.blocked),
  };
}

/** Probe failures recorded on the context, as `result.errors[]`. */
export function probeErrors(ctx = currentEgress()) {
  if (!ctx) return [];
  return [...ctx.errors.values()].map((e) => ({ ...e }));
}
