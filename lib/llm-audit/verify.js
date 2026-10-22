/**
 * The verification ladder for model-proposed findings (spec-ai-mode.md,
 * stage 3). This file is rung 1: does a Penthera rule agree?
 *
 * For each candidate, in order:
 *   1. Location. The file must exist inside the repo (symlinks resolved) and
 *      the line must be in it. If not, the candidate is `location-not-found`
 *      or `out-of-scope` and is not shown as a finding.
 *   2. Rule. If the candidate's class maps to a rule family, that family runs
 *      once over the repo and a hit of the right kind in the same file makes
 *      the candidate `confirmed-by-rule`. The rule's own finding is the record;
 *      the candidate is attached to it as "also proposed by".
 *   3. Otherwise `unverified`, with the reason. A rule that ran and did not
 *      fire is not evidence the candidate is wrong (rules miss things), so it
 *      never counts against it.
 *
 * Nothing here runs project code, calls a model, or uses the network. The
 * candidate's verdict from its producer never sets Penthera's confidence.
 */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { classById } from "./classes.js";

export const VERIFY_SCHEMA = "penthera.verify/1";
export const STATUSES = ["confirmed-by-rule", "unverified", "location-not-found", "out-of-scope"];
const MAX_READ_BYTES = 16 * 1024 * 1024;

const norm = (p) => String(p || "").split("\\").join("/").replace(/^\.\//, "");

/** Lines in a regular file inside root, or a status saying why it can't be read. */
function checkLocation(root, file, line) {
  let real;
  try {
    real = realpathSync(join(root, file));
  } catch {
    return { status: "location-not-found", reason: `${file} does not exist in this checkout` };
  }
  const rel = relative(root, real);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { status: "out-of-scope", reason: `${file} resolves outside the repository` };
  }
  let fd;
  try {
    fd = openSync(real, constants.O_RDONLY | (constants.O_NONBLOCK || 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return { status: "location-not-found", reason: `${file} is not a regular file` };
    if (st.size > MAX_READ_BYTES) return { ok: true }; // too large to count lines; the file exists
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n === 0) break;
      off += n;
    }
    let lines = 0;
    for (let i = 0; i < off; i++) if (buf[i] === 10) lines++;
    if (off > 0 && buf[off - 1] !== 10) lines++;
    if (line > lines) return { status: "location-not-found", reason: `${file} has ${lines} line${lines === 1 ? "" : "s"}; the finding points at line ${line}` };
    return { ok: true };
  } catch {
    return { status: "location-not-found", reason: `${file} could not be read` };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** The rule findings of one family that agree with a candidate's class and file. */
function ruleHits(family, cls, file, ruleFindings) {
  const list = ruleFindings[family.family] || [];
  if (family.family === "secrets") return list.filter((f) => f.category === "secrets" && f.severity !== "info" && norm(f.url) === file);
  if (family.family === "code-pattern") return list.filter((f) => f.category === "code-pattern" && norm(f.file) === file && family.patterns.includes(f.pattern));
  if (family.family === "agents") return list.filter((f) => f.severity !== "info" && norm(f.url) === file);
  return [];
}

/**
 * Run the rule families the candidates need, once each.
 * @param {string} root
 * @param {Set<string>} families
 * @param {{ scanRepo: Function, scanAgents: Function }} scanners
 */
async function runRules(root, families, { scanRepo, scanAgents }) {
  const out = {};
  if (families.has("secrets") || families.has("code-pattern")) {
    const r = await scanRepo(root, {});
    out.secrets = r.findings.filter((f) => f.category === "secrets");
    out["code-pattern"] = r.findings.filter((f) => f.category === "code-pattern");
  }
  if (families.has("agents")) {
    const r = await scanAgents(root, {});
    out.agents = r.findings;
  }
  return out;
}

/**
 * Verify candidates against a local checkout.
 * @param {string} repoPath
 * @param {object[]} candidates - from parseCloudflareFindings()
 * @param {object} [opts]
 * @param {{ scanRepo: Function, scanAgents: Function }} [opts.scanners] - injectable for tests
 * @param {object} [opts.input] - { file, sha256, producer, schema, rejected } for the report
 */
export async function verifyCandidates(repoPath, candidates, { scanners, input = {} } = {}) {
  const root = realpathSync(repoPath);
  const located = candidates.map((c) => ({ c, loc: checkLocation(root, norm(c.file), c.line) }));

  const families = new Set();
  for (const { c, loc } of located) {
    const rule = classById(c.class).rule;
    if (loc.ok && rule) families.add(rule.family);
  }
  const ruleFindings = families.size ? await runRules(root, families, scanners || await defaultScanners()) : {};

  const results = [];
  const confirmed = new Map(); // rule finding → candidates that it confirms
  for (const { c, loc } of located) {
    const cls = classById(c.class);
    let verification;
    if (!loc.ok) {
      verification = { status: loc.status, reason: loc.reason };
    } else if (!cls.rule) {
      verification = { status: "unverified", reason: `Penthera has no rule for ${cls.label.toLowerCase()}` };
    } else {
      const hits = ruleHits(cls.rule, cls, norm(c.file), ruleFindings);
      if (hits.length) {
        verification = { status: "confirmed-by-rule", by: cls.rule.family, rule: hits[0].templateId || hits[0].title, reason: `${hits[0].title}` };
        for (const h of hits) {
          if (!confirmed.has(h)) confirmed.set(h, []);
          confirmed.get(h).push(c);
        }
      } else {
        verification = { status: "unverified", reason: `the ${cls.rule.family} rules ran and did not flag ${norm(c.file)}; that does not mean the finding is wrong` };
      }
    }
    results.push({ ...c, file: norm(c.file), verification });
  }

  const findings = [];
  for (const [rule, cands] of confirmed) {
    findings.push({
      ...rule,
      alsoProposedBy: cands.map((c) => ({ producer: c.origin.producer, fingerprint: c.fingerprint, title: c.title })),
    });
  }
  for (const r of results) {
    if (r.verification.status !== "unverified") continue;
    findings.push(modelFinding(r));
  }

  const counts = Object.fromEntries(STATUSES.map((s) => [s, results.filter((r) => r.verification.status === s).length]));
  return {
    schema: VERIFY_SCHEMA,
    mode: "verify",
    target: root,
    timestamp: new Date().toISOString(),
    input: { ...input, candidates: candidates.length },
    counts,
    candidates: results,
    findings,
    ai: {
      route: "import",
      producer: input.producer || null,
      modelCalledByPenthera: false,
      hostsContacted: [],
      note: "Penthera read a file and this checkout. It ran no model and sent nothing anywhere.",
    },
  };
}

/** An unverified candidate as a report finding, labelled so it can't pass for a rule finding. */
export function modelFinding(r) {
  return {
    severity: r.severity || "medium",
    severitySource: r.severity ? "model" : "default",
    title: r.title,
    description: r.description,
    url: r.file,
    line: r.line,
    category: "llm-audit",
    class: r.class,
    source: "llm-import",
    method: r.origin.producer,
    confidence: "needs-human-review",
    modelProposed: true,
    label: "model-proposed, unverified",
    verification: r.verification,
    origin: { ...r.origin, fingerprint: r.fingerprint },
  };
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function defaultScanners() {
  const [{ scanRepo }, { scanAgents }] = await Promise.all([import("../../src/scan-repo.js"), import("../agents/index.js")]);
  return { scanRepo, scanAgents };
}
