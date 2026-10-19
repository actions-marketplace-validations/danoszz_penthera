/**
 * Evidence bundle (--evidence <dir>): the reports for one scan, a manifest.json
 * with the SHA-256 of every artifact, and optionally manifest.json.sig, an SSH
 * signature (`ssh-keygen -Y sign -n penthera-evidence`) over the manifest.
 *
 * verifyEvidence() recomputes every hash, rejects files the manifest does not
 * list, and checks the signature with ssh-keygen. No hosted service and no new
 * dependency: an auditor needs Node (or sha256sum and jq) and OpenSSH 8+.
 * See docs/evidence.md.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, lstatSync,
} from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { createGit } from "../agent/git.js";

export const SCHEMA = "penthera-evidence/1";
export const NAMESPACE = "penthera-evidence";
export const MANIFEST = "manifest.json";
export const SIGNATURE = "manifest.json.sig";

const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const SECRET_FLAG = /^--?(?:auth-cookie|auth-bearer|cookie|[\w-]*(?:token|secret|password|passwd|api-key|apikey)[\w-]*)$/i;
const SECRET_PARAM = /^(?:[\w-]*(?:token|secret|password|passwd|key|sig|signature|auth|session|code)[\w-]*)$/i;

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Mask credentials in a URL: user:pass@ and secret-looking query values. */
function redactUrl(s) {
  let u;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  if (!/^https?:$/.test(u.protocol)) return s;
  let changed = false;
  if (u.username || u.password) { u.username = "REDACTED"; u.password = ""; changed = true; }
  for (const k of [...u.searchParams.keys()]) {
    if (SECRET_PARAM.test(k)) { u.searchParams.set(k, "REDACTED"); changed = true; }
  }
  return changed ? u.toString() : s;
}

/**
 * Redact secrets from a command line: the value of --auth-cookie, --auth-bearer
 * and any flag named like a token or password (both `--flag v` and
 * `--flag=v`), plus credentials inside URLs.
 */
export function redactArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    const eq = a.indexOf("=");
    if (a.startsWith("-") && eq > 0 && SECRET_FLAG.test(a.slice(0, eq))) {
      out.push(`${a.slice(0, eq)}=[REDACTED]`);
    } else if (SECRET_FLAG.test(a) && i + 1 < argv.length) {
      out.push(a, "[REDACTED]");
      i++;
    } else {
      out.push(redactUrl(a));
    }
  }
  return out;
}

function quote(a) {
  return /^[\w@%+=:,./[\]-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`;
}

/** { commit, dirty } for a git checkout, or null. */
export function gitInfo(dir) {
  if (!dir) return null;
  try {
    // The scanned repo is untrusted: no fsmonitor, no hooks, no transports.
    const git = createGit(dir);
    const commit = git.run("rev-parse", "HEAD").trim();
    const status = git.run("status", "--porcelain");
    return /^[0-9a-f]{40,64}$/.test(commit) ? { commit, dirty: status.trim().length > 0 } : null;
  } catch {
    return null;
  }
}

/** True when ssh-keygen is on PATH. */
export function hasSshKeygen() {
  const r = spawnSync("ssh-keygen", ["-?"], { stdio: "ignore" });
  return !r.error;
}

function publicKeyFor(keyPath) {
  const pub = keyPath.endsWith(".pub") ? keyPath : `${keyPath}.pub`;
  if (!existsSync(pub)) return null;
  const line = readFileSync(pub, "utf-8").trim().split("\n")[0];
  return /^(ssh-|ecdsa-|sk-)[\w@.-]+ [A-Za-z0-9+/=]+/.test(line) ? line.split(" ").slice(0, 2).join(" ") : null;
}

/** Throws unless `dir` is missing or empty, so a bundle never mixes runs. */
export function assertEmptyDir(dir) {
  if (!existsSync(dir)) return;
  if (!lstatSync(dir).isDirectory()) throw new Error(`--evidence ${dir} exists and is not a directory`);
  if (readdirSync(dir).length) throw new Error(`--evidence ${dir} is not empty; use a new directory per run`);
}

/**
 * Write a bundle.
 * @param {string} dir
 * @param {{ path: string, content: string|Buffer, kind?: string }[]} artifacts
 * @param {{ version: string, argv: string[], target: string, generatedAt: string,
 *           scan?: object, repo?: string|null, signKey?: string|null }} meta
 * @returns {{ manifest: object, signed: boolean, dir: string }}
 */
export function writeEvidenceBundle(dir, artifacts, meta) {
  const root = resolve(dir);
  assertEmptyDir(root);
  mkdirSync(root, { recursive: true });

  const entries = [];
  for (const a of artifacts) {
    if (!SAFE_PATH.test(a.path) || a.path === MANIFEST || a.path === SIGNATURE) throw new Error(`Bad artifact path ${a.path}`);
    const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content), "utf-8");
    const file = join(root, ...a.path.split("/"));
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, buf);
    entries.push({ path: a.path, kind: a.kind || null, bytes: buf.length, sha256: sha256(buf) });
  }
  entries.sort((x, y) => x.path.localeCompare(y.path));

  const argv = redactArgv(meta.argv || []);
  const signKey = meta.signKey ? resolve(meta.signKey) : null;
  const manifest = {
    schema: SCHEMA,
    tool: { name: "penthera", version: meta.version, node: process.version },
    generated_at: meta.generatedAt,
    command: ["penthera", ...argv].map(quote).join(" "),
    argv,
    target: meta.target,
    scan: meta.scan || null,
    git: gitInfo(meta.repo),
    artifacts: entries,
    signature: signKey ? { namespace: NAMESPACE, file: SIGNATURE, public_key: publicKeyFor(signKey) } : null,
  };
  const manifestPath = join(root, MANIFEST);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  if (signKey) signManifest(manifestPath, signKey);
  return { manifest, signed: Boolean(signKey), dir: root };
}

/** ssh-keygen -Y sign; writes <manifest>.sig. A passphrase prompt goes to the terminal. */
export function signManifest(manifestPath, keyPath) {
  if (!existsSync(keyPath)) throw new Error(`--sign-key ${keyPath} not found`);
  const r = spawnSync("ssh-keygen", ["-Y", "sign", "-f", keyPath, "-n", NAMESPACE, manifestPath], {
    stdio: ["inherit", "pipe", "pipe"], encoding: "utf-8",
  });
  if (r.error) throw new Error(`Signing needs ssh-keygen (OpenSSH 8.0+): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ssh-keygen -Y sign failed: ${(r.stderr || "").trim()}`);
}

function listFiles(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isDirectory()) listFiles(root, p, out);
    else out.push(relative(root, p).split(sep).join("/"));
  }
  return out;
}

function sshVerify(args, manifestBuf) {
  const r = spawnSync("ssh-keygen", ["-Y", ...args], { input: manifestBuf, encoding: "utf-8" });
  if (r.error) return { ok: false, missing: true, out: r.error.message };
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

/**
 * Signature status. A bundle that says it is signed (manifest.signature, or a
 * .sig file) only passes when the signature verifies against --allowed-signers:
 * anyone can re-sign a rewritten manifest with their own key, so a signature
 * whose signer was not checked proves nothing and must not read as "verified".
 */
function checkSignature(root, manifestBuf, manifest, allowedSigners) {
  const sigPath = join(root, SIGNATURE);
  const declared = manifest.signature != null;
  if (!existsSync(sigPath)) {
    if (declared) return { status: "missing", ok: false, detail: `the manifest declares a signature but ${SIGNATURE} is missing` };
    return allowedSigners
      ? { status: "missing", ok: false, detail: `--allowed-signers was given but there is no ${SIGNATURE}` }
      : { status: "unsigned", ok: true, detail: "UNSIGNED: hashes only prove the bundle is internally consistent, not who wrote it" };
  }
  if (lstatSync(sigPath).isSymbolicLink() || !lstatSync(sigPath).isFile()) {
    return { status: "invalid", ok: false, detail: `${SIGNATURE} is not a regular file` };
  }
  if (!allowedSigners) {
    const r = sshVerify(["check-novalidate", "-n", NAMESPACE, "-s", sigPath], manifestBuf);
    if (!r.missing && !r.ok) return { status: "invalid", ok: false, detail: r.out };
    return { status: "unverified", ok: false, detail: "the bundle is signed, but the signer was not checked: pass --allowed-signers <file> listing the keys you trust" };
  }
  const allowed = resolve(allowedSigners);
  if (!existsSync(allowed)) return { status: "invalid", ok: false, detail: `allowed signers file ${allowedSigners} not found` };
  const found = spawnSync("ssh-keygen", ["-Y", "find-principals", "-f", allowed, "-s", sigPath], { encoding: "utf-8" });
  if (found.error) return { status: "invalid", ok: false, detail: "ssh-keygen not found; cannot check the signature" };
  const principals = (found.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!principals.length) return { status: "invalid", ok: false, detail: "no key in the allowed signers file made this signature" };
  for (const principal of principals) {
    const r = sshVerify(["verify", "-f", allowed, "-I", principal, "-n", NAMESPACE, "-s", sigPath], manifestBuf);
    if (r.ok) return { status: "valid", ok: true, principal, detail: `signed by ${principal}` };
  }
  return { status: "invalid", ok: false, detail: "signature does not verify against the allowed signers" };
}

/**
 * Verify a bundle. Never throws on a bad bundle; returns { ok, ... }.
 * `warnings` carries the UNSIGNED notice for a bundle that passes without a
 * signature; `requireSignature` turns that into a failure.
 * @param {string} dir
 * @param {{ allowedSigners?: string, requireSignature?: boolean }} opts
 */
export function verifyEvidence(dir, { allowedSigners = null, requireSignature = false } = {}) {
  const root = resolve(dir);
  const problems = [];
  const files = [];
  const fail = (msg) => ({ ok: false, problems: [msg], warnings: [], files, unlisted: [], signature: null, manifest: null });

  const manifestPath = join(root, MANIFEST);
  if (!existsSync(manifestPath)) return fail(`${MANIFEST} not found in ${dir}`);
  const manifestBuf = readFileSync(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBuf.toString("utf-8"));
  } catch (e) {
    return fail(`${MANIFEST} is not valid JSON: ${e.message}`);
  }
  if (manifest?.schema !== SCHEMA || !Array.isArray(manifest.artifacts)) return fail(`${MANIFEST} is not a ${SCHEMA} manifest`);

  const listed = new Set();
  for (const a of manifest.artifacts) {
    const path = a?.path;
    if (typeof path !== "string" || !SAFE_PATH.test(path) || path === MANIFEST || path === SIGNATURE || listed.has(path)) {
      problems.push(`unsafe or duplicate artifact path ${JSON.stringify(path)}`);
      continue;
    }
    listed.add(path);
    const file = join(root, ...path.split("/"));
    const st = existsSync(file) ? lstatSync(file) : null;
    if (!st) { files.push({ path, ok: false, reason: "missing" }); continue; }
    if (!st.isFile()) { files.push({ path, ok: false, reason: "not a regular file" }); continue; }
    const actual = sha256(readFileSync(file));
    if (typeof a.sha256 !== "string" || actual !== a.sha256.toLowerCase()) {
      files.push({ path, ok: false, reason: "hash mismatch", expected: a.sha256, actual });
    } else {
      files.push({ path, ok: true, sha256: actual });
    }
  }
  const unlisted = listFiles(root).filter((p) => p !== MANIFEST && p !== SIGNATURE && !listed.has(p));
  for (const p of unlisted) problems.push(`${p} is in the bundle but not in the manifest`);
  for (const f of files) if (!f.ok) problems.push(`${f.path}: ${f.reason}`);

  const signature = checkSignature(root, manifestBuf, manifest, allowedSigners);
  if (!signature.ok) problems.push(`signature: ${signature.detail}`);
  const warnings = [];
  if (signature.status === "unsigned") {
    if (requireSignature) problems.push("signature: --require-signature was given but the bundle is not signed");
    else warnings.push("UNSIGNED bundle: anyone could have written it. Ask for a signed bundle and verify with --allowed-signers --require-signature.");
  }

  return { ok: problems.length === 0, problems, warnings, files, unlisted, signature, manifest };
}
