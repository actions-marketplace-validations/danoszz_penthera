/**
 * Penthera, agents mode: an offline, deterministic audit of the AI developer
 * tooling configured in a repo and (with --home) on this machine.
 *
 * No network, no LLM judge, no registry lookups. Every verdict is a rule you
 * can read, so a skill cannot argue its way past it.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { relative, sep, extname, basename, dirname, join } from "node:path";
import { discoverAgentConfig, walk, parseFrontmatter, MAX_FILE_BYTES, skillSkipDir, isFile, jsonErrorMessage } from "./discover.js";
import { scanHiddenContent, sniffBinary, BINARY_EXTENSIONS, MEDIA_EXTENSIONS } from "./hidden-content.js";
import {
  checkMcpServer, checkHook, checkPermissions, checkAllowedTools, checkMarketplaces,
  checkMcpExtras, checkHookExtras, checkTasks, checkApproveSettings, findRegistryRedirects,
  registrySeverity, registryDetail,
} from "./rules.js";
import { computeLockEntries, diffLock, readLock, writeLock, lockPath, LOCK_FILENAME, LOCK_VERSION } from "./lock.js";
import { owaspFor, owaspLabel } from "./owasp.js";
import { gradeFindings } from "./grade.js";

export { scanHiddenContent } from "./hidden-content.js";
export { discoverAgentConfig } from "./discover.js";

const SOURCE = "agents-scan";
export const NOT_CHECKED_TOOL_DESCRIPTIONS = "MCP tool descriptions: servers are not started, so tool-description poisoning is not checked.";
const CATEGORY = "agent-config";

/** Turn a rule hit into a finding in Penthera's standard shape. */
export function toFinding(hit) {
  const ids = owaspFor(hit.rule);
  const mapping = ids.length ? ` [${owaspLabel(ids)}]` : "";
  return {
    severity: hit.severity,
    title: hit.title,
    description: `${hit.detail}${hit.line ? ` (line ${hit.line})` : ""}${mapping}`,
    url: hit.url,
    category: CATEGORY,
    source: SOURCE,
    templateId: `agents/${hit.rule}`,
    owasp: ids,
    confidence: hit.confidence || (hit.severity === "info" ? "confirmed" : "likely"),
  };
}

// ── Content scanning ──────────────────────────────────────────────────────

function scanTextFile(path, display, hits, { registry = false } = {}) {
  let buf;
  try {
    const st = statSync(path);
    if (st.size > MAX_FILE_BYTES) {
      hits.push({
        rule: "file-too-large",
        severity: "medium",
        title: "File too large to scan",
        detail: `${(st.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_FILE_BYTES / 1024 / 1024} MB limit. Padding a file past a scanner's size limit is a known way to hide a payload; review it by hand.`,
        url: display,
      });
      return;
    }
    buf = readFileSync(path);
  } catch {
    return;
  }
  const binary = sniffBinary(buf);
  if (binary) {
    hits.push({
      rule: "embedded-binary",
      severity: "high",
      title: `Embedded ${binary}`,
      detail: `A ${binary} inside agent instructions cannot be reviewed as text, and agents can be told to unpack or run it.`,
      url: display,
    });
    return;
  }
  if (buf.subarray(0, 8192).includes(0)) {
    hits.push({
      rule: "unknown-binary",
      severity: "medium",
      title: "Unrecognised binary file",
      detail: "A binary file of unknown type sits next to agent instructions. Check what it is and why it is there.",
      url: display,
    });
    return;
  }
  const text = buf.toString("utf-8");
  for (const h of scanHiddenContent(text)) hits.push({ ...h, url: display });
  if (registry) {
    const r = findRegistryRedirects(text, path)[0];
    if (r) {
      hits.push({
        rule: "registry-redirect",
        severity: registrySeverity(r, "high"),
        title: "Agent instructions point the package manager at another registry",
        detail: `${registryDetail(r)} A skill or rule file that changes the registry decides what later installs get. Remove it; a company mirror belongs in your own user config.`,
        url: display,
      });
    }
  }
}

/**
 * The Python source a .pyc was compiled from, if it is next to it:
 * `__pycache__/fill.cpython-312.pyc` from `../fill.py`, or legacy `fill.pyc`
 * from `fill.py` in the same folder.
 */
export function pycSource(f) {
  const dir = dirname(f);
  if (basename(dir) === "__pycache__") {
    const stem = basename(f).split(".")[0];
    const src = join(dirname(dir), `${stem}.py`);
    return stem && isFile(src) ? src : null;
  }
  const src = f.replace(/\.py[co]$/i, ".py");
  return src !== f && isFile(src) ? src : null;
}

const NOT_READ_SKILL_DIR = (d) => basename(d) === "node_modules"
  ? "dependency folder inside a skill (check it with `penthera deps`)"
  : basename(d) === ".git"
    ? "git metadata inside a skill"
    : "Python virtual environment inside a skill (check it with `penthera deps --venv`)";

function scanSkillFolder(skill, inv, hits) {
  const { files, symlinks, truncated, skipped } = walk(skill.dir, { skipDirs: skillSkipDir });
  for (const d of skipped) inv.notRead.push({ file: inv.display(d), what: NOT_READ_SKILL_DIR(d) });
  let realDir = skill.dir;
  try { realDir = realpathSync(skill.dir); } catch { /* keep */ }
  for (const l of symlinks) {
    let target = null;
    try { target = realpathSync(l); } catch { /* broken */ }
    if (!target || (target !== realDir && !target.startsWith(realDir + sep))) {
      hits.push({
        rule: "symlink-escape",
        severity: "high",
        title: "Symlink points outside the skill folder",
        detail: `\`${relative(skill.dir, l)}\` resolves to ${target ? `\`${inv.display(target)}\`` : "a missing target"}. Scanners that stay inside the folder never see what the agent reads through it.`,
        url: inv.display(l),
      });
    }
  }
  if (truncated) {
    hits.push({
      rule: "file-too-large",
      severity: "medium",
      title: "Skill folder too large to scan fully",
      detail: "More files than the scanner's limit; the rest were not checked. Review the folder by hand.",
      url: skill.display,
    });
  }
  for (const f of files) {
    const display = inv.display(f);
    const pySource = /\.py[co]$/i.test(f) ? pycSource(f) : null;
    if (pySource) {
      // Python writes this cache the first time the skill's own script runs.
      hits.push({
        rule: "embedded-binary",
        severity: "low",
        title: "Python bytecode cache in skill",
        detail: `Python compiled \`${relative(skill.dir, pySource)}\` into this file when the script ran; the source next to it was checked, the bytecode was not. Delete \`__pycache__\` before you share the skill, so what ships is only what a reviewer can read.`,
        url: display,
      });
      continue;
    }
    if (BINARY_EXTENSIONS.test(f)) {
      let head = Buffer.alloc(0);
      try { head = readFileSync(f).subarray(0, 512); } catch { /* unreadable */ }
      const kind = sniffBinary(head) || `${extname(f)} file`;
      hits.push({
        rule: "embedded-binary",
        severity: "high",
        title: `Embedded ${kind} in skill`,
        detail: `Compiled code and archives in a skill cannot be reviewed as text. A skill can tell the agent to run or unpack them.`,
        url: display,
      });
      continue;
    }
    if (MEDIA_EXTENSIONS.test(f)) {
      // Check that "media" really is media; a renamed archive is a classic dodge.
      let head = Buffer.alloc(0);
      try { head = readFileSync(f).subarray(0, 512); } catch { /* unreadable */ }
      const kind = sniffBinary(head);
      if (kind) {
        hits.push({
          rule: "embedded-binary",
          severity: "high",
          title: `${kind} disguised as ${extname(f)}`,
          detail: `The file extension says media; the bytes say ${kind}.`,
          url: display,
        });
      }
      continue;
    }
    scanTextFile(f, display, hits, { registry: true });
  }
}

function registryHitForFile(r, display) {
  return {
    rule: "registry-redirect",
    severity: registrySeverity(r, "medium"),
    title: "Plugin ships a package-manager config that changes the registry",
    detail: `${registryDetail(r)} It applies to installs run in this plugin folder. Check that the server is one you trust, or remove the file from the plugin.`,
    url: display,
  };
}

// ── Grade ─────────────────────────────────────────────────────────────────

// In its own module so callers that only grade (the dashboard, init) do not
// load discover.js and its `yaml` dependency.
export { gradeFindings };

// ── Scan ──────────────────────────────────────────────────────────────────

/**
 * Run `check` on each item; one file that throws (hostile nesting, a parser
 * edge case) is reported and skipped instead of aborting the whole audit.
 */
function eachChecked(items, hits, fileOf, check) {
  for (const item of items) {
    try {
      check(item);
    } catch (e) {
      hits.push({
        rule: "config-unparsed",
        severity: "medium",
        title: "File could not be checked",
        detail: `${e?.message || e}. Review it by hand.`,
        url: fileOf(item),
      });
    }
  }
}

/**
 * Audit agent configuration.
 * @param {string} root
 * @param {object} [opts] { home, homeDir, pin, onPhase }
 */
export async function scanAgents(root, opts = {}) {
  const progress = opts.onPhase || (() => {});
  const start = Date.now();

  progress("Discovering agent configuration...");
  const inv = discoverAgentConfig(root, { home: opts.home, homeDir: opts.homeDir });
  const hits = [];

  progress(`Scanning ${inv.skills.length} skill(s) for hidden content...`);
  eachChecked(inv.skills, hits, (s) => inv.display(s.skillFile), (s) => {
    scanSkillFolder(s, inv, hits);
    hits.push(...checkAllowedTools(inv.display(s.skillFile), s.frontmatter, `Skill "${s.name}"`));
  });

  progress("Scanning instruction and rule files...");
  eachChecked(inv.instructionFiles, hits, (f) => f.display, (f) => {
    scanTextFile(f.path, f.display, hits, { registry: true });
    if (/\.mdc?$/i.test(f.path)) {
      let text = "";
      try { text = readFileSync(f.path, "utf-8"); } catch { /* unreadable */ }
      hits.push(...checkAllowedTools(f.display, parseFrontmatter(text), "Command"));
    }
  });

  progress(`Checking ${inv.mcpServers.length} MCP server(s), ${inv.hooks.length} hook(s), permissions and plugins...`);
  eachChecked(inv.mcpServers, hits, (m) => m.file, (m) => hits.push(...checkMcpServer(m), ...checkMcpExtras(m)));
  eachChecked(inv.hooks, hits, (h) => h.file, (h) => hits.push(...checkHook(h), ...checkHookExtras(h)));
  hits.push(...checkPermissions(inv));
  hits.push(...checkApproveSettings(inv));
  hits.push(...checkTasks(inv));
  eachChecked(inv.registryFiles, hits, (f) => f.display, (f) => {
    let text = "";
    try { text = readFileSync(f.path, "utf-8"); } catch { return; }
    const r = findRegistryRedirects(text, f.path)[0];
    if (r) hits.push(registryHitForFile(r, f.display));
  });
  hits.push(...checkMarketplaces(inv));
  for (const e of inv.errors) {
    hits.push({ rule: "config-unparsed", severity: "info", title: "Config file could not be parsed", detail: e.message, url: e.file });
  }

  // Rug-pull pins
  progress("Comparing against penthera.lock...");
  const lpath = opts.lockPath || lockPath(inv.root);
  let lock = null;
  let corrupt = null;
  if (!opts.pin) {
    try { lock = readLock(lpath); } catch (e) { corrupt = e; }
  }
  // A lock file is compared with hashes made the way its version made them,
  // so upgrading Penthera never reads as a changed skill (a false rug pull).
  const lockVersion = lock ? (lock.lockfileVersion === 1 || lock.lockfileVersion == null ? 1 : LOCK_VERSION) : LOCK_VERSION;
  const entries = computeLockEntries(inv, { version: lockVersion });
  const lockInfo = { path: lpath, status: "missing", changed: 0, added: 0, removed: 0, entries: Object.keys(entries).length };
  if (opts.pin) {
    writeLock(lpath, entries);
    lockInfo.status = "pinned";
  } else {
    if (corrupt) {
      hits.push({ rule: "config-unparsed", severity: "medium", title: `${LOCK_FILENAME} is corrupt`, detail: `${corrupt instanceof SyntaxError ? jsonErrorMessage(corrupt) : corrupt.message}. Rug-pull detection is off until it is re-pinned.`, url: LOCK_FILENAME });
      lockInfo.status = "corrupt";
    }
    if (lock) {
      if (lockVersion < LOCK_VERSION) {
        hits.push({
          rule: "lock-outdated",
          severity: "info",
          title: `${LOCK_FILENAME} is lockfile version ${lockVersion}: re-pin after upgrading`,
          detail: `It was compared the way version ${lockVersion} hashes skills, which leaves out \`dist\`, \`build\` and \`.next\` inside a skill folder. Review the skills, then run \`penthera agents --pin\` to write version ${LOCK_VERSION}, which pins those folders too.`,
          url: LOCK_FILENAME,
        });
      }
      const scopes = opts.home ? ["repo", "home"] : ["repo"];
      const d = diffLock(lock, entries, { scopes });
      Object.assign(lockInfo, { status: "checked", changed: d.changed.length, added: d.added.length, removed: d.removed.length });
      for (const c of d.changed) {
        hits.push({
          rule: "lock-changed",
          severity: "high",
          title: `Pinned ${c.kind} changed since ${LOCK_FILENAME}: ${c.key.replace(/^\w+:/, "")}`,
          detail: `Hash was ${c.previous.slice(0, 12)}…, now ${c.sha256.slice(0, 12)}…. A ${c.kind} that changes after review is how a rug pull works. Diff it, then re-pin with \`penthera agents --pin\` if the change is expected.`,
          url: LOCK_FILENAME,
        });
      }
      for (const a of d.added) {
        hits.push({
          rule: "lock-new",
          severity: "medium",
          title: `New ${a.kind} not in ${LOCK_FILENAME}: ${a.key.replace(/^\w+:/, "")}`,
          detail: `Added since the last pin. Review it, then run \`penthera agents --pin\`.`,
          url: LOCK_FILENAME,
        });
      }
      for (const r of d.removed) {
        hits.push({
          rule: "lock-removed",
          severity: "info",
          title: `Pinned ${r.kind} no longer present: ${r.key.replace(/^\w+:/, "")}`,
          detail: "Removed since the last pin.",
          url: LOCK_FILENAME,
        });
      }
    } else if (lockInfo.status === "missing" && Object.keys(entries).length) {
      hits.push({
        rule: "lock-missing",
        severity: "info",
        title: `No ${LOCK_FILENAME}: skills, MCP servers and hooks are not pinned`,
        detail: `Run \`penthera agents --pin\` after reviewing them. Later runs then report anything that changed (rug pulls) or appeared.`,
        url: LOCK_FILENAME,
      });
    }
  }

  const findings = hits.map(toFinding);
  const { grade, score } = gradeFindings(findings);

  return {
    target: inv.root,
    mode: "agents",
    local: true,
    reachable: true,
    timestamp: new Date().toISOString(),
    duration: Date.now() - start,
    agents: {
      grade,
      score,
      home: !!opts.home,
      inventory: {
        skills: inv.skills.length,
        mcpServers: inv.mcpServers.length,
        hooks: inv.hooks.length,
        permissions: inv.permissions.length,
        plugins: inv.plugins.length,
        marketplaces: inv.marketplaces.length,
        instructionFiles: inv.instructionFiles.length,
        tasks: inv.tasks.length,
        configFiles: inv.configFiles.map((f) => f.display),
      },
      // What this scan did not read: always the MCP tool descriptions, plus
      // any agent config on disk that no rule covers yet.
      notChecked: [
        ...inv.notRead.map((n) => `${n.file}: ${n.what}, not read by \`penthera agents\`.`),
        NOT_CHECKED_TOOL_DESCRIPTIONS,
      ],
      lock: { ...lockInfo, path: inv.display(lpath) },
    },
    executedProbes: ["agent-config-discovery", "hidden-content", "agent-config-rules", "agent-lock"],
    findings,
  };
}

