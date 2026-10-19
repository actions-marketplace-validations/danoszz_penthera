/**
 * Rule-pack verification: how new detection knowledge reaches Penthera without a runtime
 * fetch or an update channel. See docs/rule-packs.md for the trust model.
 *
 * A pack is a directory:
 *   pack.json       name, version, created_at, min_penthera, rules[] index
 *                   ({ file, kind, sha256 } per rule file)
 *   pack.json.sig   `ssh-keygen -Y sign -n penthera-rules` over pack.json
 *   *.json          rule files, one kind each. Data only: regexes, string
 *                   lists, IOC lists. Never code.
 *
 * Loading verifies, in order: the signature over pack.json against
 * allowed_signers, every rule file's SHA-256 against pack.json, the schema of
 * every rule, and every regex against the ReDoS guard. Anything that fails is
 * refused whole; there is no partial load.
 *
 * Packs arrive two ways only: bundled in lib/rules/ (they ship inside the npm
 * release, staged and approved with 2FA), or by path with `--rules <dir>`.
 * Nothing in this module touches the network.
 */
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { checkRegex } from "./regex-guard.js";
import { parseAllowedSigners, verifyWithSigners } from "./sshsig.js";

export const NAMESPACE = "penthera-rules";
export const RULES_DIR = dirname(fileURLToPath(import.meta.url));
export const BUILTIN_SIGNERS = join(RULES_DIR, "allowed_signers");
const PKG_VERSION = JSON.parse(readFileSync(join(RULES_DIR, "..", "..", "package.json"), "utf-8")).version;

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_RULE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_RULES_PER_FILE = 5000;
// Pack regexes run on at most this much input per call. Bundled packs are
// part of the release and keep the engines' own behaviour (no cap).
export const PACK_INPUT_CAP = 1024 * 1024;

// ── Schema ────────────────────────────────────────────────────────────────

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PACK_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REF_KEY = /^[A-Za-z0-9_:.-]{1,64}$/;
// Control characters, DEL, C1 and bidi overrides: a pack's strings reach the
// terminal, Markdown and SARIF, so none of them may carry escapes.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const CONFIDENCE = new Set(["confirmed", "likely", "potential"]);
const SEVERITY = new Set(["critical", "high", "medium", "low", "info"]);
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const VERSION_OR_STAR = /^(?:\*|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const REL_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@/-]{1,200}$/;
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

class PackError extends Error {}
const fail = (msg) => { throw new PackError(msg); };

function text(v, where, { max = 300, optional = false } = {}) {
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string" || v.length === 0) fail(`${where}: expected a non-empty string`);
  if (v.length > max) fail(`${where}: longer than ${max} characters`);
  if (UNSAFE_TEXT.test(v)) fail(`${where}: contains control or bidi characters`);
  return v;
}

function list(v, where, { max = 5000, item }) {
  if (!Array.isArray(v) || v.length === 0) fail(`${where}: expected a non-empty array`);
  if (v.length > max) fail(`${where}: more than ${max} entries`);
  return v.map((x, i) => item(x, `${where}[${i}]`));
}

function regex(pattern, flags, where) {
  text(pattern, `${where}.pattern`, { max: 512 });
  if (flags !== undefined && typeof flags !== "string") fail(`${where}.flags: expected a string`);
  const r = checkRegex(pattern, flags || "");
  if (!r.ok) fail(`${where}.pattern rejected by the ReDoS guard: ${r.reason}`);
  return new RegExp(pattern, flags || "");
}

/** Fields every rule carries: where the knowledge came from, and how sure it is. */
function provenance(r, where) {
  text(r.id, `${where}.id`);
  if (!ID.test(r.id)) fail(`${where}.id: must match ${ID}`);
  text(r.source, `${where}.source`, { max: 500 });
  let url;
  try { url = new URL(r.source); } catch { fail(`${where}.source: not a URL`); }
  if (url.protocol !== "https:") fail(`${where}.source: must be an https URL`);
  if (typeof r.date !== "string" || !DATE.test(r.date) || Number.isNaN(Date.parse(r.date))) fail(`${where}.date: expected YYYY-MM-DD`);
  if (!CONFIDENCE.has(r.confidence)) fail(`${where}.confidence: one of ${[...CONFIDENCE].join(", ")}`);
  const references = r.references === undefined ? [] : list(r.references, `${where}.references`, {
    max: 20,
    item: (k, w) => { if (typeof k !== "string" || !REF_KEY.test(k)) fail(`${w}: not a references.bib key`); return k; },
  });
  return {
    id: r.id,
    source: r.source,
    date: r.date,
    confidence: r.confidence,
    references,
    description: text(r.description, `${where}.description`, { max: 1000, optional: true }),
  };
}

function severity(v, where, dflt) {
  if (v === undefined && dflt) return dflt;
  if (!SEVERITY.has(v)) fail(`${where}: one of ${[...SEVERITY].join(", ")}`);
  return v;
}

/** Nuclei-compatible template, the subset lib/templates.js executes. */
function template(t, where) {
  if (!t || typeof t !== "object" || Array.isArray(t)) fail(`${where}: expected an object`);
  text(t.id, `${where}.id`, { max: 100 });
  const info = t.info || fail(`${where}.info: required`);
  const out = {
    id: t.id,
    info: {
      name: text(info.name, `${where}.info.name`),
      severity: severity(info.severity, `${where}.info.severity`),
      tags: info.tags === undefined ? [] : list(info.tags, `${where}.info.tags`, { max: 20, item: (x, w) => text(x, w, { max: 40 }) }),
      ...(info.description !== undefined ? { description: text(info.description, `${where}.info.description`, { max: 1000 }) } : {}),
    },
    http: list(t.http, `${where}.http`, {
      max: 10,
      item: (req, w) => {
        const method = req.method === undefined ? "GET" : req.method;
        if (!HTTP_METHODS.has(method)) fail(`${w}.method: not an allowed HTTP method`);
        text(req.path, `${w}.path`, { max: 500 });
        // Only paths on the scan target: a pack can never point the scanner at another host.
        const p = req.path.replace(/^\{\{BaseURL\}\}/, "");
        if (!p.startsWith("/") || p.startsWith("//") || /[\s\\]/.test(p)) fail(`${w}.path: must be a path on the target ("/x" or "{{BaseURL}}/x")`);
        const matchers = list(req.matchers, `${w}.matchers`, {
          max: 10,
          item: (m, mw) => {
            const type = m.type;
            if (type === "status") return { type, status: list(m.status, `${mw}.status`, { max: 20, item: (s, sw) => { if (!Number.isInteger(s) || s < 100 || s > 599) fail(`${sw}: HTTP status`); return s; } }) };
            if (type === "word" || type === "negative-word") {
              return { type, words: list(m.words, `${mw}.words`, { max: 50, item: (x, xw) => text(x, xw, { max: 200 }) }), ...(m.condition ? { condition: m.condition === "and" ? "and" : "or" } : {}), ...(m.part === "header" ? { part: "header" } : {}) };
            }
            if (type === "regex" || type === "negative-regex") {
              const pats = list(m.regex, `${mw}.regex`, { max: 10, item: (x, xw) => { regex(x, m.flags, xw); return x; } });
              return { type, regex: pats, ...(m.flags ? { flags: m.flags } : {}), ...(m.condition ? { condition: m.condition === "and" ? "and" : "or" } : {}), ...(m.part === "header" ? { part: "header" } : {}) };
            }
            return fail(`${mw}.type: one of status, word, negative-word, regex, negative-regex`);
          },
        });
        const cond = req["matchers-condition"];
        if (cond !== undefined && cond !== "and" && cond !== "or") fail(`${w}.matchers-condition: "and" or "or"`);
        return { method, path: req.path, matchers, ...(cond ? { "matchers-condition": cond } : {}) };
      },
    }),
  };
  return out;
}

/**
 * Rule kinds and the engine each one plugs into. `compile` validates one rule
 * and returns what the engine consumes.
 */
export const KINDS = {
  // lib/whitebox/secrets.js
  secret: (r, w) => ({
    ...provenance(r, w),
    name: text(r.name, `${w}.name`, { max: 100 }),
    pattern: regex(r.pattern, r.flags, w),
    severity: severity(r.severity, `${w}.severity`),
    skipPlaceholders: r.skip_placeholders === true,
  }),
  // lib/agents/hidden-content.js: instructions hidden in comments, decoded blobs
  "agent-instruction": (r, w) => ({ ...provenance(r, w), pattern: regex(r.pattern, r.flags, w) }),
  // lib/agents/hidden-content.js + rules.js: remote-code-execution shapes in skills, hooks, MCP commands
  "agent-exec": (r, w) => ({ ...provenance(r, w), label: text(r.label, `${w}.label`, { max: 100 }), pattern: regex(r.pattern, r.flags, w) }),
  // lib/deps: known-malicious package versions (lockfile names)
  "ioc-package": (r, w) => ({
    ...provenance(r, w),
    campaign: text(r.campaign, `${w}.campaign`, { max: 100 }),
    severity: severity(r.severity, `${w}.severity`, "critical"),
    packages: list(r.packages, `${w}.packages`, {
      item: (p, pw) => {
        if (!p || typeof p.name !== "string" || p.name.length > 214 || !NPM_NAME.test(p.name)) fail(`${pw}.name: not an npm package name`);
        const versions = list(p.versions, `${pw}.versions`, { max: 200, item: (v, vw) => { if (typeof v !== "string" || !VERSION_OR_STAR.test(v)) fail(`${vw}: exact version or "*"`); return v; } });
        return { name: p.name, versions };
      },
    }),
  }),
  // lib/deps: exfiltration endpoints found in package code. `hosts` are
  // attacker-owned domains; `urls` pin an endpoint on a shared service
  // (webhook.site) where the bare host would be a false positive.
  "ioc-host": (r, w) => {
    if (r.hosts === undefined && r.urls === undefined) fail(`${w}: needs hosts or urls`);
    return {
      ...provenance(r, w),
      campaign: text(r.campaign, `${w}.campaign`, { max: 100 }),
      severity: severity(r.severity, `${w}.severity`, "critical"),
      hosts: r.hosts === undefined ? [] : list(r.hosts, `${w}.hosts`, { max: 500, item: (h, hw) => { if (typeof h !== "string" || !HOSTNAME.test(h)) fail(`${hw}: lowercase hostname`); return h; } }),
      urls: r.urls === undefined ? [] : list(r.urls, `${w}.urls`, {
        max: 500,
        item: (u, uw) => {
          text(u, uw, { max: 300 });
          let url;
          try { url = new URL(u); } catch { fail(`${uw}: not a URL`); }
          if (!/^https?:$/.test(url.protocol) || url.pathname.length < 2) fail(`${uw}: http(s) URL with a path`);
          return u;
        },
      }),
    };
  },
  // lib/deps: files a campaign drops into packages (by path, optionally pinned by hash)
  "ioc-file": (r, w) => ({
    ...provenance(r, w),
    campaign: text(r.campaign, `${w}.campaign`, { max: 100 }),
    severity: severity(r.severity, `${w}.severity`, "critical"),
    files: list(r.files, `${w}.files`, {
      max: 500,
      item: (f, fw) => {
        if (!f || typeof f.path !== "string" || !REL_PATH.test(f.path)) fail(`${fw}.path: relative path inside a package`);
        if (f.sha256 !== undefined && (typeof f.sha256 !== "string" || !SHA256.test(f.sha256))) fail(`${fw}.sha256: hex SHA-256`);
        return { path: f.path, ...(f.sha256 ? { sha256: f.sha256 } : {}) };
      },
    }),
  }),
  // lib/deps/typosquat.js: extra names worth protecting from look-alikes
  "typosquat-target": (r, w) => ({
    ...provenance(r, w),
    names: list(r.names, `${w}.names`, { max: 5000, item: (n, nw) => { if (typeof n !== "string" || n.length > 214 || !NPM_NAME.test(n)) fail(`${nw}: npm package name`); return n; } }),
  }),
  // lib/templates.js
  "nuclei-template": (r, w) => ({ ...provenance(r, w), template: template(r.template, `${w}.template`) }),
};

// ── Reading and verifying ─────────────────────────────────────────────────

function cmpSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

function readRegular(path, max, what) {
  let st;
  try { st = lstatSync(path); } catch { fail(`${what} not found`); }
  if (!st.isFile()) fail(`${what} is not a regular file (symlinks are refused)`);
  if (st.size > max) fail(`${what} is larger than ${max} bytes`);
  return readFileSync(path);
}

function validateManifest(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) fail("pack.json: expected an object");
  if (m.schema !== 1) fail("pack.json: schema must be 1");
  if (typeof m.name !== "string" || !PACK_NAME.test(m.name)) fail(`pack.json: name must match ${PACK_NAME}`);
  if (typeof m.version !== "string" || !SEMVER.test(m.version)) fail("pack.json: version must be x.y.z");
  if (typeof m.min_penthera !== "string" || !SEMVER.test(m.min_penthera)) fail("pack.json: min_penthera must be x.y.z");
  if (typeof m.created_at !== "string" || Number.isNaN(Date.parse(m.created_at))) fail("pack.json: created_at must be an ISO 8601 timestamp");
  text(m.description, "pack.json: description", { max: 1000, optional: true });
  const seen = new Set();
  list(m.rules, "pack.json: rules", {
    max: 100,
    item: (e, w) => {
      if (!e || typeof e.file !== "string" || !FILE_NAME.test(e.file) || e.file === "pack.json") fail(`${w}.file: a plain file name like secrets.json`);
      if (seen.has(e.file)) fail(`${w}.file: listed twice`);
      seen.add(e.file);
      if (!Object.hasOwn(KINDS, e.kind)) fail(`${w}.kind: one of ${Object.keys(KINDS).join(", ")}`);
      if (typeof e.sha256 !== "string" || !SHA256.test(e.sha256)) fail(`${w}.sha256: hex SHA-256`);
      return e;
    },
  });
  return m;
}

/** Load allowed_signers entries from the built-in file plus any extra files. */
export function loadSigners(extra = []) {
  const out = [];
  for (const f of [BUILTIN_SIGNERS, ...[].concat(extra)]) {
    if (!f) continue;
    if (!existsSync(f)) {
      if (f === BUILTIN_SIGNERS) continue;
      throw new Error(`allowed_signers file not found: ${f}`);
    }
    out.push(...parseAllowedSigners(readFileSync(f, "utf-8")));
  }
  return out;
}

/**
 * Verify a pack directory without activating it.
 * @param {string} dir
 * @param {{ signers?: object[], now?: number, version?: string }} [opts]
 * @returns {{ ok: boolean, dir: string, name?: string, version?: string,
 *   signature: "valid"|"invalid"|"missing", signer?: string, signatureError?: string,
 *   errors: string[], warnings: string[], manifest?: object, rules?: Record<string, object[]>, count?: number }}
 */
export function verifyPack(dir, opts = {}) {
  const abs = resolve(dir);
  const res = { ok: false, dir: abs, signature: "missing", errors: [], warnings: [] };
  try {
    let st;
    try { st = lstatSync(abs); } catch { fail(`not found: ${dir}`); }
    if (!st.isDirectory()) fail(`not a directory: ${dir}`);

    const raw = readRegular(join(abs, "pack.json"), MAX_MANIFEST_BYTES, "pack.json");
    let manifest;
    try { manifest = JSON.parse(raw.toString("utf-8")); } catch (e) { fail(`pack.json: invalid JSON (${e.message})`); }
    validateManifest(manifest);
    res.name = manifest.name;
    res.version = manifest.version;
    res.manifest = manifest;

    // 1. Signature over the exact bytes of pack.json.
    const sigPath = join(abs, "pack.json.sig");
    if (existsSync(sigPath)) {
      const sig = readRegular(sigPath, 64 * 1024, "pack.json.sig").toString("utf-8");
      const v = verifyWithSigners(raw, sig, NAMESPACE, opts.signers || loadSigners(), { now: opts.now });
      if (v.ok) { res.signature = "valid"; res.signer = v.principal; }
      else { res.signature = "invalid"; res.signatureError = v.reason; }
    }

    if (cmpSemver(opts.version || PKG_VERSION, manifest.min_penthera) < 0) {
      fail(`needs Penthera ${manifest.min_penthera} or later (this is ${opts.version || PKG_VERSION})`);
    }

    // 2. Every rule file against its hash in pack.json, then 3. its contents.
    const rules = Object.fromEntries(Object.keys(KINDS).map((k) => [k, []]));
    const ids = new Set();
    let count = 0;
    for (const entry of manifest.rules) {
      const buf = readRegular(join(abs, entry.file), MAX_RULE_FILE_BYTES, entry.file);
      const digest = createHash("sha256").update(buf).digest("hex");
      if (digest !== entry.sha256) fail(`${entry.file}: SHA-256 does not match pack.json (file changed after the pack was built)`);
      let data;
      try { data = JSON.parse(buf.toString("utf-8")); } catch (e) { fail(`${entry.file}: invalid JSON (${e.message})`); }
      if (!data || data.kind !== entry.kind) fail(`${entry.file}: kind is "${data?.kind}", pack.json says "${entry.kind}"`);
      list(data.rules, `${entry.file}: rules`, { max: MAX_RULES_PER_FILE, item: (r) => r });
      data.rules.forEach((r, i) => {
        const where = `${entry.file}: rules[${i}]`;
        if (!r || typeof r !== "object" || Array.isArray(r)) fail(`${where}: expected an object`);
        const compiled = KINDS[entry.kind](r, where);
        if (ids.has(compiled.id)) fail(`${where}.id: "${compiled.id}" used twice in this pack`);
        ids.add(compiled.id);
        rules[entry.kind].push({ ...compiled, kind: entry.kind, pack: manifest.name, packVersion: manifest.version });
        count++;
      });
    }
    const listed = new Set(manifest.rules.map((e) => e.file));
    for (const f of readdirSync(abs)) {
      if (f === "pack.json" || f === "pack.json.sig" || listed.has(f)) continue;
      res.warnings.push(`${f} is not listed in pack.json and is ignored`);
    }
    res.rules = rules;
    res.count = count;
    res.ok = true;
  } catch (e) {
    res.errors.push(e instanceof PackError ? e.message : `unexpected error: ${e.message}`);
  }
  return res;
}

