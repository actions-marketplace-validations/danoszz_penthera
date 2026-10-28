/**
 * --giants: run the free scanners you already have installed, read their
 * output, and fold their findings into Penthera's report
 * (docs/research/spec-giants.md).
 *
 * Penthera never downloads, installs or bundles a tool, its rules or its
 * database. Each tool runs as its own program under its own licence; its
 * findings are its own deterministic output, labelled with its name. No
 * model is involved anywhere here.
 *
 * runGiants() runs the tools for one scan mode and returns their status and
 * raw findings; attachGiants() merges those into a scan result.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AREAS, TOOLS, areasOf, installHint, parseVersion, toolById, versionStatus } from "./tools.js";
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_S, detectSandbox, displayCommand, minimalEnv, resolveTool, runTool } from "./runner.js";
import { DEFAULT_MERGE, mergePentheraFirst } from "./merge.js";
import { clean } from "./finding.js";
import { DEFAULT_GIANTS_POLICY } from "./policy.js";

export const GIANTS_SCHEMA = "penthera.giants/1";

// Which area a finding counts toward in the coverage table.
const CATEGORY_AREA = { secret: "secrets", code: "code", "dependency-vuln": "dependencies", "container-vuln": "infrastructure", "infra-misconfig": "infrastructure", web: "live" };

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1|[a-z0-9-]+\.localhost)$/i;

/**
 * May a live tool (nuclei, ZAP) be pointed at `url`? Only the target you
 * typed, a host on this machine, or a host you allowed. Checked before either
 * tool is looked up or started.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkLiveTarget(url, { typedUrl = null, allowHosts = [] } = {}) {
  let host;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: `${u.protocol} is not an http(s) URL` };
    host = u.hostname.toLowerCase();
  } catch {
    return { ok: false, reason: `not a URL: ${clean(url, 100)}` };
  }
  let typed = null;
  try { typed = typedUrl ? new URL(typedUrl).hostname.toLowerCase() : null; } catch { /* none */ }
  if (host === typed || LOCAL_HOST.test(host) || allowHosts.map((h) => String(h).toLowerCase()).includes(host)) return { ok: true };
  return { ok: false, reason: `${host} is not the target you gave, a host on this machine, or an allowed host` };
}

/** Parse a --with / --without list. Throws on an unknown tool name. */
export function parseToolList(value, flag) {
  if (value == null) return null;
  const names = String(value).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const alias = { zap: "zap", "zap-baseline": "zap", osv: "osv-scanner", pipaudit: "pip-audit" };
  const out = names.map((n) => alias[n] || n);
  const bad = out.filter((n) => !toolById(n));
  if (bad.length) throw new Error(`${flag}: unknown tool ${bad.join(", ")}. Known: ${TOOLS.map((t) => t.id).join(", ")}`);
  return [...new Set(out)];
}

function plan(tool, o) {
  const { modes, withList, without, online, policy } = o;
  if (!modes.includes(tool.mode)) return null;
  if (withList && !withList.includes(tool.id)) return { skip: "not in --with" };
  if (!withList && tool.explicitOnly) return { skip: `runs only with --with ${tool.id}` };
  if (without?.includes(tool.id)) return { skip: "left out with --without" };
  if (policy.deny.includes(tool.id)) return { skip: "denied by the policy file" };
  if (policy.only && !policy.only.includes(tool.id)) return { skip: "not in the policy file's giants.only" };
  if (tool.network === "online" && !online) return { skip: "needs --giants-online (it contacts a service)" };
  return { run: true };
}

function networkLabel(net, sandbox) {
  if (net === "deny") return sandbox ? `denied (${sandbox})` : "not enforced (no sandbox on this machine)";
  if (net === "loopback") return sandbox === "sandbox-exec" ? "this machine only (sandbox-exec)" : "target only (not enforced)";
  if (net === "target") return "target only (not enforced)";
  return "online";
}

function readOutput(path, maxBytes) {
  const size = statSync(path).size;
  if (size > maxBytes) throw new Error(`report is ${size} bytes, over the ${maxBytes}-byte cap`);
  return readFileSync(path, "utf-8");
}

const firstLine = (s) => clean(String(s || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-1)[0] || "", 300);

/**
 * Run one tool from start to finish. Never throws: the record says what happened.
 */
async function runOne(tool, ctx) {
  const rec = { id: tool.id, areas: areasOf(tool), licence: tool.licence, status: null, reason: null, path: null, version: null, versionStatus: null, command: null, exitCode: null, durationMs: 0, network: null, findings: 0 };
  const found = resolveTool(tool.bins, { root: ctx.root, cwd: ctx.cwd, pathEnv: ctx.pathEnv });
  if (found.refused.length) rec.refused = found.refused;
  if (!found.path) {
    rec.status = found.refused.length ? "refused" : "not installed";
    rec.reason = found.refused.length
      ? `${found.refused[0].path} is ${found.refused[0].reason}; not run`
      : `install: ${installHint(tool, ctx.platform)}`;
    return { rec };
  }
  rec.path = found.path;
  ctx.onStart?.(tool);
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `penthera-giants-${tool.id}-`)));
  try {
    const env = minimalEnv({ tmp, keepHome: tool.keepHome, extra: tool.env || {}, from: ctx.env });
    if (tool.versionArgs) {
      const v = await runTool({ cmd: found.path, args: tool.versionArgs, cwd: tmp, env, timeoutMs: 30_000, maxBytes: 1 << 20, network: "deny", sandbox: ctx.sandbox });
      rec.version = parseVersion(`${v.stdout}\n${v.stderr}`);
      rec.versionStatus = versionStatus(tool, rec.version);
      if (rec.versionStatus === "below-minimum") {
        rec.status = "skipped";
        rec.reason = `version ${rec.version} is below the minimum ${tool.minVersion}`;
        return { rec };
      }
    }
    const prepared = tool.command({ ...ctx, tmp, tool: { id: tool.id, version: rec.version } });
    if (prepared.skip) {
      rec.status = "skipped";
      rec.reason = prepared.skip;
      return { rec };
    }
    const steps = prepared.steps || [{ args: prepared.args, output: prepared.output }];
    let net = prepared.network || "deny";
    if (net === "target" && ctx.url && LOCAL_HOST.test(new URL(ctx.url).hostname)) net = "loopback";
    rec.network = networkLabel(net, ctx.sandbox);
    rec.command = steps.map((s) => displayCommand(tool.bins[0], s.args, { root: ctx.root, tmp })).join(" && ");
    const deadline = Date.now() + ctx.timeoutS * 1000;
    const texts = [];
    for (const step of steps) {
      const run = await runTool({ cmd: found.path, args: step.args, cwd: tmp, env, timeoutMs: Math.max(1000, deadline - Date.now()), maxBytes: ctx.maxBytes, network: net, sandbox: ctx.sandbox });
      rec.durationMs += run.durationMs;
      rec.exitCode = run.exitCode;
      if (run.timedOut) { rec.status = "timed out"; rec.reason = `stopped after ${ctx.timeoutS} s`; return { rec }; }
      if (run.overflow) { rec.status = "failed"; rec.reason = `output over the ${ctx.maxBytes}-byte cap; stopped`; return { rec }; }
      if (run.error) { rec.status = "failed"; rec.reason = clean(run.error, 300); return { rec }; }
      if (!tool.exitOk(run.exitCode)) {
        const skip = tool.skipReason?.(run, ctx);
        rec.status = skip ? "skipped" : "failed";
        rec.reason = skip || `exit ${run.exitCode ?? run.signal}: ${firstLine(run.stderr) || "no error message"}`;
        return { rec };
      }
      if (step.output === "stdout") texts.push(run.stdout);
      else if (step.output) {
        if (existsSync(step.output)) texts.push(readOutput(step.output, ctx.maxBytes));
        else if (prepared.optionalOutput) texts.push("");
        else { rec.status = "failed"; rec.reason = "the tool wrote no report"; return { rec }; }
      }
    }
    if (tool.reportVersion) {
      rec.version = texts.map((t) => tool.reportVersion(t)).find(Boolean) || rec.version;
      rec.versionStatus = versionStatus(tool, rec.version);
      if (rec.versionStatus === "below-minimum") { rec.status = "skipped"; rec.reason = `version ${rec.version} is below the minimum ${tool.minVersion}; its findings are not used`; return { rec }; }
    }
    let findings;
    try {
      findings = texts.flatMap((t) => tool.parse(t, { ...ctx, tool: { id: tool.id, version: rec.version }, prepared }));
    } catch (e) {
      rec.status = "failed";
      rec.reason = `output could not be read: ${clean(e.message, 200)}`;
      return { rec };
    }
    rec.status = "ran";
    rec.findings = findings.length;
    rec.byArea = {};
    for (const f of findings) {
      const a = CATEGORY_AREA[f.category];
      if (a) rec.byArea[a] = (rec.byArea[a] || 0) + 1;
    }
    if (rec.versionStatus === "untested") rec.reason = `version ${rec.version} has no recorded fixture yet (tested: ${tool.tested.join(", ")}); its output format may have changed`;
    if (rec.versionStatus === "unknown") rec.reason = "version unknown";
    const raw = texts.map((t, i) => ({ tool: tool.id, name: `${tool.id}${texts.length > 1 ? `-${i + 1}` : ""}.txt`, content: tool.sanitize ? tool.sanitize(t) : t }));
    return { rec, findings, raw };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Run the tools for one or both scan modes.
 *
 * @param {object} o
 * @param {string|null} [o.root] - the scanned repository (absolute), for repo tools
 * @param {string|null} [o.url] - the live target, for nuclei and ZAP
 * @param {string|null} [o.typedUrl] - the URL as given on the command line
 * @param {string[]} [o.allowHosts]
 * @param {string[]|null} [o.with] - from --with (implies --giants)
 * @param {string[]|null} [o.without]
 * @param {boolean} [o.online] - --giants-online
 * @param {number|null} [o.timeoutS] - --giants-timeout
 * @param {boolean} [o.deep]
 * @param {number} [o.rate] - requests per second for live tools (0: none)
 * @param {object} [o.policy] - the normalized `giants` policy
 * @param {{ semgrepRules?: string|null, nucleiTemplates?: string|null }} [o.settings]
 * @param {string[]} [o.languages] - source languages in the repo (from the coverage ledger)
 * @param {Record<string, { read: boolean, text: string }>} [o.pentheraRead] - per area id, what Penthera's own scan read ({ read: true, text: "7 files" })
 * @param {(msg: string) => void} [o.onPhase]
 * @returns {Promise<{ giants: object, toolFindings: object[], raw: object[] }>}
 */
export async function runGiants(o) {
  const policy = { ...DEFAULT_GIANTS_POLICY, ...(o.policy || {}) };
  const modes = [o.root && "repo", o.url && "url"].filter(Boolean);
  const sandbox = o.sandbox !== undefined ? o.sandbox : detectSandbox();
  const timeoutS = o.timeoutS || policy.timeout || DEFAULT_TIMEOUT_S;
  const ctx = {
    root: o.root || null, url: o.url || null, cwd: o.cwd || process.cwd(), pathEnv: o.pathEnv ?? process.env.PATH ?? "", env: o.env || process.env,
    platform: o.platform || process.platform, sandbox, timeoutS, maxBytes: o.maxBytes || DEFAULT_MAX_BYTES,
    online: Boolean(o.online), deep: Boolean(o.deep), rate: o.rate || 0, languages: o.languages || [],
    settings: { semgrepRules: o.settings?.semgrepRules || null, nucleiTemplates: o.settings?.nucleiTemplates || null },
  };
  const live = o.url ? checkLiveTarget(o.url, { typedUrl: o.typedUrl ?? o.url, allowHosts: o.allowHosts || [] }) : { ok: true };

  const tools = [];
  const toolFindings = [];
  const raw = [];
  for (const tool of TOOLS) {
    const p = plan(tool, { modes, withList: o.with || null, without: o.without || null, online: ctx.online, policy });
    if (!p) continue;
    if (p.skip) {
      tools.push({ id: tool.id, areas: areasOf(tool), licence: tool.licence, status: "skipped", reason: p.skip, findings: 0 });
      continue;
    }
    if (tool.mode === "url" && !live.ok) {
      tools.push({ id: tool.id, areas: areasOf(tool), licence: tool.licence, status: "refused", reason: `not started: ${live.reason}`, findings: 0 });
      continue;
    }
    // "Running" only once the tool is found: a missing one is listed in the report.
    const { rec, findings = [], raw: r = [] } = await runOne(tool, { ...ctx, onStart: (t) => o.onPhase?.(`Running ${t.id}...`) });
    tools.push(rec);
    toolFindings.push(...findings);
    raw.push(...r);
  }

  const areas = AREAS.filter((a) => modes.includes(a.mode)).map((a) => {
    const mine = tools.filter((t) => t.areas.includes(a.id));
    const ran = mine.filter((t) => t.status === "ran");
    return {
      id: a.id, label: a.label, penthera: a.penthera,
      // What Penthera's own checks read in this area, or null when they did not run.
      pentheraRead: o.pentheraRead?.[a.id] || null,
      status: ran.length ? "covered" : "not covered",
      tools: mine.map((t) => ({ id: t.id, status: t.status, version: t.version || null, findings: t.byArea ? t.byArea[a.id] || 0 : t.findings || 0 })),
    };
  });
  const required = policy.require.filter((id) => !tools.some((t) => t.id === id && t.status === "ran"));
  const giants = {
    schema: GIANTS_SCHEMA,
    merge: DEFAULT_MERGE,
    online: ctx.online,
    sandbox,
    timeoutSeconds: timeoutS,
    failOn: policy.failOn,
    tools,
    areas,
    ...(required.length ? { requiredNotRun: required } : {}),
  };
  return { giants, toolFindings, raw };
}

/**
 * Merge a runGiants() run into a scan result (Penthera-first): matching tool
 * findings are folded into Penthera's, the rest go to `result.giants.findings`.
 */
export function attachGiants(result, { giants, toolFindings }, { root = null } = {}) {
  const { findings, also, folded } = mergePentheraFirst(result.findings || [], toolFindings, { root });
  result.findings = findings;
  result.giants = { ...giants, folded, findings: also };
  return result;
}

/** Do other tools' findings make the scan exit 1? (spec decision 2) */
export function giantsGate(result) {
  const g = result.giants;
  if (!g || g.failOn === "never") return false;
  return (g.findings || []).some((f) => f.severity === "critical" || f.severity === "high");
}
