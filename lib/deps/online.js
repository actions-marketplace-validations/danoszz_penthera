/**
 * `penthera deps --online`: registry metadata checks.
 *
 * THE ONLY NETWORK USE IN `penthera deps`, and it is off by default. When the
 * flag is set it makes plain GET requests to the public npm registry
 * (registry.npmjs.org, or npm_config_registry) for package metadata, and, in
 * diff mode, for old tarballs that are not in the local npm cache. Nothing
 * about your project is sent: the requests name public packages only.
 *
 * Signals:
 *   - version published under 30 days ago (fresh releases are where hijacks land),
 *   - package created under 30 days ago (slopsquat / brand-new name),
 *   - publisher changed from the previous version to someone who was not a maintainer,
 *   - version deprecated.
 */
import { sourceFromTarball } from "./source.js";
import { readBody, readJson, request } from "../../src/utils/http.js";

// Packuments of popular packages run to tens of MB; tarballs are capped by the
// unpacked-size limit in source.js anyway.
const MAX_PACKUMENT_BYTES = 128 * 1024 * 1024;
const MAX_TARBALL_BYTES = 256 * 1024 * 1024;

// Registry calls go through the shared client: same User-Agent, same egress
// accounting (and refusal under --offline) as every other request.
const registryFetch = (url, opts) => request(url, { ...opts, redirect: "follow", probe: "deps-online" });

const DAY_MS = 24 * 3600 * 1000;
export const FRESH_DAYS = 30;

export function registryUrl(env = process.env) {
  return String(env.npm_config_registry || env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org/").replace(/\/?$/, "/");
}

/** Fetch a packument. Returns parsed JSON or null. */
export async function fetchPackument(name, { fetchImpl = registryFetch, registry = registryUrl(), timeout = 15000 } = {}) {
  // Registry form: "@scope%2fname". Encoding the whole name also keeps a hostile
  // lockfile entry from adding path segments or a query to the request.
  const url = registry + encodeURIComponent(name).replace(/^%40/, "@");
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await readJson(res, { maxBytes: MAX_PACKUMENT_BYTES, timeout });
  } catch {
    return null;
  }
}

/** Version published right before `version`, by publish time. */
function previousVersion(doc, version) {
  const times = Object.entries(doc.time || {})
    .filter(([v]) => v !== "created" && v !== "modified" && doc.versions?.[v])
    .sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]));
  const i = times.findIndex(([v]) => v === version);
  return i > 0 ? times[i - 1][0] : null;
}

const publisher = (v) => v?._npmUser?.name || null;
const maintainers = (v) => (v?.maintainers || []).map((m) => (typeof m === "string" ? m : m.name)).filter(Boolean);

/**
 * Metadata signals for one name@version.
 * @param {object} doc packument
 * @param {string} version
 * @param {{ previous?: string, now?: number }} opts previous = version this one replaces (diff mode)
 */
export function registrySignals(doc, version, { previous = null, now = Date.now() } = {}) {
  const signals = [];
  if (!doc || !doc.versions) return signals;
  const v = doc.versions[version];
  if (!v) {
    signals.push({ id: "missing-version", severity: "high", text: `${version} is not on the registry (unpublished or never published)` });
    return signals;
  }
  if (v.deprecated) signals.push({ id: "deprecated", severity: "low", text: `deprecated: ${String(v.deprecated).slice(0, 160)}` });

  const published = Date.parse(doc.time?.[version] || "");
  if (published && now - published < FRESH_DAYS * DAY_MS) {
    const days = Math.max(0, Math.floor((now - published) / DAY_MS));
    signals.push({ id: "fresh-version", severity: "low", text: `published ${days} day(s) ago` });
  }
  const created = Date.parse(doc.time?.created || "");
  if (created && now - created < FRESH_DAYS * DAY_MS) {
    const days = Math.max(0, Math.floor((now - created) / DAY_MS));
    signals.push({ id: "new-package", severity: "medium", text: `package created ${days} day(s) ago` });
  }

  const prev = previous && doc.versions[previous] ? previous : previousVersion(doc, version);
  if (prev) {
    const before = doc.versions[prev];
    const was = publisher(before);
    const now_ = publisher(v);
    if (was && now_ && was !== now_ && !maintainers(before).includes(now_)) {
      signals.push({ id: "publisher-change", severity: "medium", text: `published by ${now_}; ${prev} was published by ${was}, and ${now_} was not a maintainer then` });
    }
  }
  return signals;
}

/**
 * Look up registry signals for a set of packages.
 * @param {{ name, version, previous? }[]} items
 * @returns {Promise<Map<string, { signals, doc }>>} keyed by name@version
 */
export async function checkRegistry(items, opts = {}) {
  const concurrency = opts.concurrency || 8;
  const docs = new Map();
  const names = [...new Set(items.map((i) => i.name))].sort();
  for (let i = 0; i < names.length; i += concurrency) {
    const batch = names.slice(i, i + concurrency);
    const got = await Promise.all(batch.map((n) => fetchPackument(n, opts)));
    batch.forEach((n, k) => docs.set(n, got[k]));
  }
  const out = new Map();
  for (const it of items) {
    const doc = docs.get(it.name);
    out.set(`${it.name}@${it.version}`, {
      reachable: !!doc,
      signals: doc ? registrySignals(doc, it.version, { previous: it.previous, now: opts.now }) : [],
      tarball: doc?.versions?.[it.version]?.dist?.tarball || null,
    });
  }
  return out;
}

/** Download a tarball and verify it against the lockfile integrity. */
export async function fetchTarballSource(url, integrity, { fetchImpl = registryFetch, timeout = 30000 } = {}) {
  if (!url || !/^https:\/\//.test(url) || !integrity) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const buf = await readBody(res, { maxBytes: MAX_TARBALL_BYTES, timeout, binary: true });
    return sourceFromTarball(buf, integrity, "registry");
  } catch {
    return null;
  }
}
