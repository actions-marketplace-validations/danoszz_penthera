/**
 * Penthera, agents mode: an offline, deterministic audit of the AI developer
 * tooling configured in a repo and (with --home) on this machine.
 *
 * No network, no LLM judge, no registry lookups. Every verdict is a rule you
 * can read, so a skill cannot argue its way past it.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { relative, sep, extname } from "node:path";
import { discoverAgentConfig, walk, parseFrontmatter, MAX_FILE_BYTES } from "./discover.js";
import { scanHiddenContent, sniffBinary, BINARY_EXTENSIONS, MEDIA_EXTENSIONS } from "./hidden-content.js";
import { checkMcpServer, checkHook, checkPermissions, checkAllowedTools, checkMarketplaces } from "./rules.js";
import { computeLockEntries, diffLock, readLock, writeLock, lockPath, LOCK_FILENAME } from "./lock.js";
import { owaspFor, owaspLabel } from "./owasp.js";

export { scanHiddenContent } from "./hidden-content.js";
export { discoverAgentConfig } from "./discover.js";

const SOURCE = "agents-scan";
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

function scanTextFile(path, display, hits) {
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
  for (const h of scanHiddenContent(buf.toString("utf-8"))) hits.push({ ...h, url: display });
}

function scanSkillFolder(skill, inv, hits) {
  const { files, symlinks, truncated } = walk(skill.dir);
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
    scanTextFile(f, display, hits);
  }
}

// ── Grade ─────────────────────────────────────────────────────────────────

const WEIGHT = { critical: 30, high: 15, medium: 5, low: 1, info: 0 };

/** A–F grade. Any critical finding is an F; otherwise score bands. */
export function gradeFindings(findings) {
  let score = 100;
  for (const f of findings) score -= WEIGHT[f.severity] ?? 0;
  score = Math.max(0, score);
  const critical = findings.some((f) => f.severity === "critical");
  const grade = critical ? "F" : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { grade, score };
}

// ── Scan ──────────────────────────────────────────────────────────────────

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
  for (const s of inv.skills) {
    scanSkillFolder(s, inv, hits);
    hits.push(...checkAllowedTools(inv.display(s.skillFile), s.frontmatter, `Skill "${s.name}"`));
  }

  progress("Scanning instruction and rule files...");
  for (const f of inv.instructionFiles) {
    scanTextFile(f.path, f.display, hits);
    if (/\.mdc?$/i.test(f.path)) {
      let text = "";
      try { text = readFileSync(f.path, "utf-8"); } catch { /* unreadable */ }
      hits.push(...checkAllowedTools(f.display, parseFrontmatter(text), "Command"));
    }
  }

  progress(`Checking ${inv.mcpServers.length} MCP server(s), ${inv.hooks.length} hook(s), permissions and plugins...`);
  for (const m of inv.mcpServers) hits.push(...checkMcpServer(m));
  for (const h of inv.hooks) hits.push(...checkHook(h));
  hits.push(...checkPermissions(inv));
  hits.push(...checkMarketplaces(inv));
  for (const e of inv.errors) {
    hits.push({ rule: "config-unparsed", severity: "info", title: "Config file could not be parsed", detail: e.message, url: e.file });
  }

  // Rug-pull pins
  progress("Comparing against penthera.lock...");
  const entries = computeLockEntries(inv);
  const lpath = opts.lockPath || lockPath(inv.root);
  const lockInfo = { path: lpath, status: "missing", changed: 0, added: 0, removed: 0, entries: Object.keys(entries).length };
  if (opts.pin) {
    writeLock(lpath, entries);
    lockInfo.status = "pinned";
  } else {
    let lock = null;
    try {
      lock = readLock(lpath);
    } catch (e) {
      hits.push({ rule: "config-unparsed", severity: "medium", title: `${LOCK_FILENAME} is corrupt`, detail: `${e.message}. Rug-pull detection is off until it is re-pinned.`, url: LOCK_FILENAME });
      lockInfo.status = "corrupt";
    }
    if (lock) {
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
        configFiles: inv.configFiles.map((f) => f.display),
      },
      lock: { ...lockInfo, path: inv.display(lpath) },
    },
    executedProbes: ["agent-config-discovery", "hidden-content", "agent-config-rules", "agent-lock"],
    findings,
  };
}

