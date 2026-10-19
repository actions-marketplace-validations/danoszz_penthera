/**
 * `penthera deps`: offline, deterministic dependency risk scanning for npm.
 *
 * Reads package-lock.json, statically scans every installed package for what
 * it can do (lib/deps/capabilities.js), checks names for typosquats against a
 * vendored list, and, with --diff / --base, reports packages that are new or
 * that gained capabilities in an upgrade. Results are ordinary Penthera
 * findings (category "dependency-risk", source "deps-scan"), so the terminal,
 * Markdown, JSON and SARIF outputs all work unchanged.
 *
 * Offline by default. Old versions for the diff come from the base tree's
 * node_modules or npm's local content cache, verified against the lockfile
 * integrity. `--online` is the only network use (lib/deps/online.js).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, resolve, basename } from "node:path";
import { findLockfile, readLockfile, parseLockfile, directDependencies, readLockfileAtRef } from "./lockfile.js";
import { DirSource, sourceFromNpmCache, npmCacheDir } from "./source.js";
import { scanPackage, CAPABILITIES, CAPABILITY_ORDER, maxSeverity } from "./capabilities.js";
import { diffTrees } from "./diff.js";
import { findTyposquats, loadPopular } from "./typosquat.js";
import { checkLicenses } from "./license.js";
import { loadIocs } from "./iocs.js";

const SOURCE = "deps-scan";
const CATEGORY = "dependency-risk";
const KNOWN_BAD = ["ai-config-write", "ai-cli-invoke", "token-harvest"];
// Owners of these scopes legitimately manage their own AI tool config.
const KNOWN_BAD_EXEMPT = { "ai-config-write": [/^@anthropic-ai\//], "ai-cli-invoke": [/^@anthropic-ai\//] };

// ── Resolving package contents ────────────────────────────────────────────

function installedVersion(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")).version || null;
  } catch {
    return null;
  }
}

/**
 * Find a package's files offline: the tree's node_modules (when the installed
 * version matches the lockfile), else npm's cache by integrity.
 */
function resolveSource(pkg, treeRoot, cacheDirs) {
  if (treeRoot) {
    const dir = join(treeRoot, pkg.path);
    if (existsSync(dir) && installedVersion(dir) === pkg.version) return new DirSource(dir);
  }
  if (!pkg.integrity) return null;
  for (const d of cacheDirs) {
    const src = sourceFromNpmCache(pkg.integrity, d);
    if (src) return src;
  }
  return null;
}

/** Scan a list of lockfile packages. Results cached by name@version+integrity. */
function scanTree(pkgs, treeRoot, ctx) {
  return pkgs.map((p) => {
    const key = `${p.name}@${p.version}#${p.integrity || ""}`;
    if (!ctx.cache.has(key)) {
      const src = resolveSource(p, treeRoot, ctx.cacheDirs);
      ctx.cache.set(key, src ? { ...scanPackage(src, { prefix: `${p.path}/`, iocs: ctx.iocs }), source: src.kind } : null);
    }
    const r = ctx.cache.get(key);
    return {
      ...p,
      source: r?.source || null,
      capabilities: r ? r.capabilities : null,
      installScripts: r?.installScripts || {},
      installRisk: r?.installRisk || [],
      exfil: r?.exfil || [],
      filesScanned: r?.filesScanned || 0,
      iocHits: r?.iocHits || [],
    };
  });
}

// ── Findings ──────────────────────────────────────────────────────────────

const capList = (ids) => ids.map((id) => CAPABILITIES[id]?.label || id).join(", ");

function evidenceText(caps, ids) {
  const lines = [];
  for (const id of ids) {
    for (const e of (caps?.[id]?.evidence || []).slice(0, 2)) {
      lines.push(`${CAPABILITIES[id].label}: ${e.file}:${e.line} \`${e.snippet}\``);
    }
  }
  return lines.join("; ");
}

function firstEvidence(caps, ids) {
  for (const id of ids) {
    const e = caps?.[id]?.evidence?.[0];
    if (e) return e;
  }
  return null;
}

function finding({ title, severity, confidence, method, description, pkg, ev, capabilities, extra = {} }) {
  return {
    title,
    severity,
    category: CATEGORY,
    source: SOURCE,
    method,
    confidence,
    description,
    url: ev?.file || pkg.path,
    line: ev?.line || undefined,
    package: pkg.name,
    version: pkg.version,
    capabilities,
    ...extra,
  };
}

/** Risk findings that stand on their own, without a diff. */
function riskFindings(pkg) {
  const out = [];
  const caps = pkg.capabilities;
  if (!caps) return out;
  const at = `${pkg.name}@${pkg.version}`;

  for (const id of KNOWN_BAD) {
    if (!caps[id]) continue;
    if ((KNOWN_BAD_EXEMPT[id] || []).some((re) => re.test(pkg.name))) continue;
    const ev = caps[id].evidence[0];
    out.push(finding({
      title: `${at}: ${CAPABILITIES[id].label}`,
      severity: "critical",
      confidence: CAPABILITIES[id].confidence,
      method: "deps-capability-scan",
      description: `${CAPABILITIES[id].why} Evidence: ${evidenceText(caps, [id])}`,
      pkg, ev, capabilities: [id],
    }));
  }
  if (caps.obfuscated) {
    const ev = caps.obfuscated.evidence[0];
    out.push(finding({
      title: `${at}: obfuscated code`,
      severity: "high",
      confidence: "potential",
      method: "deps-capability-scan",
      description: `${CAPABILITIES.obfuscated.why} Signals at ${ev.file}:${ev.line}: ${ev.snippet}. Read the file before trusting it; minified code alone does not trigger this.`,
      pkg, ev, capabilities: ["obfuscated"],
    }));
  }
  if (pkg.exfil?.length) {
    const ev = pkg.exfil[0];
    out.push(finding({
      title: `${at}: serialises the whole environment next to network code`,
      severity: "high",
      confidence: "likely",
      method: "deps-capability-scan",
      description: `process.env (tokens, keys, CI secrets) is serialised within a few lines of a network call, the shape of credential exfiltration. Evidence: ${ev.file}:${ev.line} \`${ev.snippet}\`. ${evidenceText(caps, ["network"])}`,
      pkg, ev, capabilities: ["env-bulk", "network"],
    }));
  }
  if (caps["install-scripts"]) {
    const ev = caps["install-scripts"].evidence[0];
    const hooks = Object.entries(pkg.installScripts).map(([h, cmd]) => `${h}: \`${cmd.slice(0, 100)}\``).join("; ");
    const risky = pkg.installRisk.length > 0;
    out.push(finding({
      title: `${at}: runs ${risky ? "a risky " : ""}install script`,
      severity: risky ? "medium" : "low",
      confidence: "confirmed",
      method: "deps-capability-scan",
      description: `${CAPABILITIES["install-scripts"].why} ${hooks}.${risky ? ` Why it stands out: ${pkg.installRisk.join("; ")}.` : ""} Install with \`npm ci --ignore-scripts\` if the package works without it.`,
      pkg, ev, capabilities: ["install-scripts"],
    }));
  }
  return out;
}

// Capabilities that riskFindings already reports on their own.
const OWN_FINDING = new Set([...KNOWN_BAD, "obfuscated", "install-scripts"]);

function diffFindings(diff) {
  const out = [];
  for (const a of diff.added) {
    const ids = a.capabilities || [];
    const notable = ids.filter((id) => id !== "env" && id !== "dynamic-require" && !OWN_FINDING.has(id));
    if (notable.length === 0) continue;
    out.push(finding({
      title: `New dependency ${a.name}@${a.version}: ${capList(notable)}`,
      severity: maxSeverity(notable.map((id) => CAPABILITIES[id].severity)),
      confidence: "likely",
      method: "deps-capability-diff",
      description: `A package that was not in the base tree. It can: ${notable.map((id) => CAPABILITIES[id].why).join(" ")} Evidence: ${evidenceText(a.pkg.capabilities, notable)}`,
      pkg: a.pkg, ev: firstEvidence(a.pkg.capabilities, notable), capabilities: notable,
      extra: { change: "added" },
    }));
  }
  for (const u of diff.upgraded) {
    if (!u.gained || u.gained.length === 0) continue;
    const sev = maxSeverity(u.gained.map((id) => CAPABILITIES[id].severity));
    out.push(finding({
      title: `${u.name} ${u.from} → ${u.to} gained ${capList(u.gained)}`,
      severity: sev,
      confidence: u.gained.some((id) => CAPABILITIES[id].confidence === "potential") && u.gained.length === 1 ? "potential" : "likely",
      method: "deps-capability-diff",
      description: `This upgrade can do things the previous version could not. ${u.gained.map((id) => CAPABILITIES[id].why).join(" ")} Evidence: ${evidenceText(u.pkg.capabilities, u.gained)}`,
      pkg: u.pkg, ev: firstEvidence(u.pkg.capabilities, u.gained), capabilities: u.gained,
      extra: { change: "upgraded", from: u.from },
    }));
  }
  const missing = diff.upgraded.filter((u) => u.unavailable);
  if (missing.length) {
    out.push({
      title: `${missing.length} upgraded package(s) not compared: old version not available offline`,
      severity: "info",
      category: CATEGORY,
      source: SOURCE,
      method: "deps-capability-diff",
      confidence: "confirmed",
      description: `No local copy to compare against for: ${missing.map((u) => `${u.name} ${u.from} → ${u.to}`).join(", ")}. Install the base tree (\`npm ci --ignore-scripts\` in a checkout of the base) and pass that folder to --diff, or rerun with --online to fetch the old tarballs from the registry.`,
      url: "package-lock.json",
    });
  }
  return out;
}

function typosquatFindings(hits, pkgByName, direct) {
  return hits.map((h) => {
    const pkg = pkgByName.get(h.name) || { name: h.name, version: null, path: "package-lock.json" };
    const isDirect = direct.has(h.name);
    return finding({
      title: `${h.name} looks like ${h.target} (${h.kind})`,
      severity: isDirect ? "medium" : "low",
      confidence: "potential",
      method: "deps-typosquat",
      description: `\`${h.name}\` is ${h.distance} edit(s) from \`${h.target}\` (#${h.rank} in the vendored popular-package list) and is not itself on that list. Typosquats and AI-hallucinated names (slopsquatting) look exactly like this. Check it is the package you meant to install${isDirect ? "" : ` and why a dependency pulls it in`}.`,
      pkg, ev: { file: pkg.path, line: undefined }, capabilities: [],
      extra: { typosquatOf: h.target, direct: isDirect },
    });
  });
}

/**
 * Rule-pack IOC hits: known-malicious versions (from the lockfile, installed
 * or not) and campaign hosts or dropped files found in package contents.
 */
function iocFindings(tree, iocs) {
  const out = [];
  if (!iocs) return out;
  for (const p of tree) {
    const hits = [...iocs.matchPackage(p.name, p.version), ...(p.iocHits || [])];
    const seen = new Set();
    for (const h of hits) {
      const key = `${h.rule.pack}/${h.rule.id}/${h.type}/${h.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = h.rule;
      const at = `${p.name}@${p.version}`;
      const what = h.type === "package"
        ? `known-malicious version (${r.campaign})`
        : h.type === "file" ? `contains a file dropped by ${r.campaign}: ${h.value}` : `references ${r.campaign} exfiltration endpoint ${h.value}`;
      out.push(finding({
        title: `${at}: ${what}`,
        severity: r.severity,
        confidence: r.confidence,
        method: "deps-ioc",
        description: `${h.type === "package" ? `\`${at}\` is a published malicious version.` : `Indicator found in ${h.file}:${h.line}.`} Listed in rule pack ${r.pack}@${r.packVersion} (rule ${r.id}, recorded ${r.date}). Source: ${r.source}${r.description ? ` ${r.description}` : ""} Remove or pin away from this version, reinstall with \`npm ci --ignore-scripts\`, and treat any machine or CI runner that installed it as compromised: rotate the npm, GitHub and cloud credentials it could read.`,
        pkg: p, ev: h.type === "package" ? { file: p.path } : { file: h.file, line: h.line }, capabilities: [],
        extra: { ioc: { pack: r.pack, packVersion: r.packVersion, rule: r.id, type: h.type, value: h.value, campaign: r.campaign, source: r.source } },
      }));
    }
  }
  return out;
}

function registryFindings(results, pkgByKey) {
  const out = [];
  for (const [key, r] of [...results].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pkg = pkgByKey.get(key);
    if (!pkg) continue;
    for (const s of r.signals) {
      out.push(finding({
        title: `${key}: ${s.text}`,
        severity: s.severity,
        confidence: "confirmed",
        method: "deps-registry",
        description: `From npm registry metadata (--online). ${s.id === "publisher-change" ? "A new publisher on an established package is how account takeovers ship malware; check the release notes and diff." : s.id === "new-package" ? "Brand-new packages are where typosquats and slopsquats (names AI assistants hallucinate) live." : s.id === "fresh-version" ? "Most malicious versions are caught and pulled within days; waiting out a short cooldown on new releases avoids them." : ""}`,
        pkg, ev: { file: pkg.path }, capabilities: [],
        extra: { registrySignal: s.id },
      }));
    }
  }
  return out;
}

// ── Entry point ───────────────────────────────────────────────────────────

function summarize(tree) {
  const counts = {};
  for (const id of CAPABILITY_ORDER) counts[id] = 0;
  for (const p of tree) for (const id of Object.keys(p.capabilities || {})) counts[id]++;
  return counts;
}

/** Load the old tree for --diff (lockfile path or project folder) or --base (git ref). */
function loadBase(root, opts) {
  if (opts.baseLock) return { lock: opts.baseLock, treeRoot: null, label: opts.baseLabel || "base" };
  if (opts.base) {
    return { lock: readLockfileAtRef(root, opts.base), treeRoot: null, label: opts.base };
  }
  const p = resolve(opts.diff);
  if (!existsSync(p)) throw new Error(`--diff path not found: ${opts.diff}`);
  const isDir = statSync(p).isDirectory();
  const lockPath = isDir ? findLockfile(p) : p;
  if (!lockPath) throw new Error(`No package-lock.json in ${opts.diff}`);
  const treeRoot = dirname(lockPath);
  // A lockfile beside the project's own node_modules describes another tree;
  // only trust node_modules that sit next to the old lockfile.
  return { lock: readLockfile(lockPath), treeRoot: treeRoot === resolve(root) ? null : treeRoot, label: opts.diff };
}

/**
 * Scan a project's dependencies.
 * @param {string} root project folder containing package-lock.json
 * @param {{ diff?: string, base?: string, online?: boolean, prod?: boolean,
 *           onPhase?: Function, cacheDir?: string|string[], now?: number, fetchImpl?: Function,
 *           treeRoot?: string, lock?: object, baseLock?: object, baseLabel?: string,
 *           changedOnly?: boolean, licensePolicy?: object }} opts
 *   treeRoot: where installed packages live, when the lockfile describes a tree
 *     that is not installed beside it (penthera install)
 *   lock / baseLock: lockfile objects to use instead of reading them (the
 *     pre-commit hook passes the staged and HEAD lockfiles)
 *   changedOnly: in diff mode, scan only packages that changed (fast path)
 *   licensePolicy: from normalizeLicensePolicy(); adds category "license" findings
 */
export async function scanDeps(root, opts = {}) {
  const started = Date.now();
  const onPhase = opts.onPhase || (() => {});
  const lockPath = opts.lock ? join(root, "package-lock.json") : findLockfile(root);
  if (!lockPath) throw new Error(`No package-lock.json in ${root}. penthera deps reads the lockfile; run \`npm install --package-lock-only\` first.`);
  const lock = opts.lock || readLockfile(lockPath);
  const ctx = { cache: new Map(), cacheDirs: [].concat(opts.cacheDir || npmCacheDir()), iocs: loadIocs() };
  const keep = (p) => !p.link && p.version && (!opts.prod || !p.dev);

  const diffing = !!(opts.diff || opts.base || opts.baseLock);
  const base = diffing ? loadBase(root, opts) : null;
  let pkgs = parseLockfile(lock).filter(keep);
  if (diffing && opts.changedOnly) {
    const before = new Set(parseLockfile(base.lock).map((p) => `${p.name}@${p.version}`));
    pkgs = pkgs.filter((p) => !before.has(`${p.name}@${p.version}`));
  }
  onPhase(`Scanning ${pkgs.length} packages from ${basename(lockPath)} (offline)`);
  const tree = scanTree(pkgs, opts.treeRoot || root, ctx);
  const direct = new Set(directDependencies(lock));

  let diff = null;
  if (diffing) {
    const oldPkgs = parseLockfile(base.lock).filter(keep);
    const byVersion = new Map(tree.map((p) => [`${p.name}@${p.version}`, p]));
    const newNames = new Set(tree.map((p) => p.name));
    // Only old versions that are gone but whose name remains need inspecting:
    // a version present in both trees has the same contents (same lockfile
    // integrity), and a removed name is not compared.
    const needOld = oldPkgs.filter((p) => !byVersion.has(`${p.name}@${p.version}`) && newNames.has(p.name));
    onPhase(`Comparing against ${base.label}: ${needOld.length} replaced version(s) to inspect`);
    const oldScanned = new Map(scanTree(needOld, base.treeRoot, ctx).map((p) => [p.path, p]));
    const oldTree = oldPkgs.map((p) => oldScanned.get(p.path)
      || { ...p, capabilities: byVersion.get(`${p.name}@${p.version}`)?.capabilities || {}, installScripts: byVersion.get(`${p.name}@${p.version}`)?.installScripts || {} });
    diff = diffTrees(oldTree, tree);
  }

  // --online: registry metadata, and old tarballs the cache did not have.
  let online = null;
  const findings = [];
  if (opts.online) {
    const { checkRegistry, fetchTarballSource } = await import("./online.js");
    const changed = diff ? [...diff.added.map((a) => a.pkg), ...diff.upgraded.map((u) => ({ ...u.pkg, previous: u.from }))] : [];
    const items = diff ? changed : tree.filter((p) => direct.has(p.name));
    onPhase(`--online: fetching registry metadata for ${items.length} package(s) (the only network use)`);
    const results = await checkRegistry(items.map((p) => ({ name: p.name, version: p.version, previous: p.previous })), { fetchImpl: opts.fetchImpl, now: opts.now });
    online = { checked: items.length, unreachable: [...results.values()].filter((r) => !r.reachable).length, fetchedTarballs: 0 };
    if (diff) {
      const oldPkgs = parseLockfile(base.lock);
      for (const u of diff.upgraded.filter((x) => x.unavailable === "old")) {
        const oldPkg = oldPkgs.find((p) => p.name === u.name && p.version === u.from);
        // Verified against the base lockfile's integrity before anything is read.
        const src = await fetchTarballSource(oldPkg?.resolved, oldPkg?.integrity, { fetchImpl: opts.fetchImpl });
        if (!src) continue;
        online.fetchedTarballs++;
        const o = new Set(Object.keys(scanPackage(src, { prefix: `${oldPkg.path}/` }).capabilities));
        const n = new Set(Object.keys(u.pkg.capabilities || {}));
        u.gained = CAPABILITY_ORDER.filter((id) => n.has(id) && !o.has(id));
        u.lost = CAPABILITY_ORDER.filter((id) => o.has(id) && !n.has(id));
        u.unavailable = null;
      }
    }
    findings.push(...registryFindings(results, new Map(tree.map((p) => [`${p.name}@${p.version}`, p]))));
  }

  // In diff mode, report on what changed; otherwise on the whole tree.
  const inScope = diff
    ? new Set([...diff.added.map((a) => a.pkg), ...diff.upgraded.map((u) => u.pkg)])
    : new Set(tree);
  for (const p of tree) if (inScope.has(p)) findings.push(...riskFindings(p));
  // A known-bad package is reported wherever it sits, diff or not.
  findings.push(...iocFindings(tree, ctx.iocs));
  if (diff) findings.push(...diffFindings(diff));

  // Names you chose (direct deps), or names that are new in this change. A
  // transitive dependency of an unchanged tree was picked by its parent's
  // maintainers long ago; flagging those is mostly noise.
  const nameScope = diff ? diff.added.map((a) => a.name) : tree.filter((p) => direct.has(p.name)).map((p) => p.name);
  const typos = findTyposquats(nameScope);
  findings.push(...typosquatFindings(typos, new Map(tree.map((p) => [p.name, p])), direct));

  // License policy: the whole tree, or in diff mode only what changed.
  let licenses = null;
  if (opts.licensePolicy) {
    const scope = tree.filter((p) => inScope.has(p));
    onPhase(`Checking ${scope.length} package license(s) against the policy`);
    const r = checkLicenses(scope, opts.licensePolicy, { treeRoot: opts.treeRoot || root, lockfileHasLicenses: (lock.lockfileVersion || 1) >= 2 });
    findings.push(...r.findings);
    licenses = r.summary;
  }

  // Optional packages for other platforms (esbuild-style binaries) are expected to be absent.
  const unavailable = tree.filter((p) => !p.capabilities && !p.optional);
  const skippedOptional = tree.filter((p) => !p.capabilities && p.optional).length;
  const rel = (p) => {
    const r = relative(process.cwd(), p);
    return r === "" ? "." : r.startsWith("..") ? p : r;
  };
  return {
    target: rel(root),
    mode: "deps",
    local: true,
    reachable: true,
    timestamp: new Date(started).toISOString(),
    duration: Date.now() - started,
    deps: {
      lockfile: rel(lockPath),
      lockfileVersion: lock.lockfileVersion || 1,
      prod: !!opts.prod,
      network: opts.online ? "online (registry metadata only)" : "offline",
      total: tree.length,
      scanned: tree.filter((p) => p.capabilities).length,
      skippedOptional,
      direct: [...direct],
      notInstalled: unavailable.map((p) => `${p.name}@${p.version}`),
      capabilityCounts: summarize(tree),
      popularList: loadPopular().source,
      packages: tree.map((p) => ({
        name: p.name,
        version: p.version,
        path: p.path,
        dev: p.dev,
        license: p.license,
        direct: direct.has(p.name),
        source: p.source,
        capabilities: p.capabilities,
      })),
      typosquats: typos,
      licenses,
      online,
      diff: diff ? {
        base: base.label,
        added: diff.added.map(({ pkg, ...a }) => ({ ...a, installScripts: pkg.installScripts })),
        upgraded: diff.upgraded.map(({ pkg, prev, ...u }) => ({ ...u, installScripts: pkg.installScripts, previousInstallScripts: prev?.installScripts || null })),
        removed: diff.removed,
        evidence: Object.fromEntries([...diff.added, ...diff.upgraded].map((x) => {
          const ids = x.gained || x.capabilities || [];
          return [`${x.name}@${x.version || x.to}`, Object.fromEntries(ids.map((id) => [id, x.pkg.capabilities?.[id]?.evidence || []]))];
        })),
      } : null,
    },
    findings,
  };
}
