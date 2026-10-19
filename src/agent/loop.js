/**
 * `penthera agent --loop`: scan → triage → plan → patch → verify → learn, locally.
 *
 * One iteration scans the repo (and the URL, if given), drops suppressed
 * findings, ranks the rest with memory, plans fixes (recipes first, a local
 * model only with --fix-model), then takes the plans one at a time: show the
 * diff and ask, apply it on the fix branch, re-scan (plus the project's tests
 * with --run-tests), commit it if it verified, revert it if it did not, and
 * write what happened to memory. It repeats until nothing fixable is left,
 * --max-iterations is reached, or the user stops it.
 *
 * Guarantees (each has a test in tests/agent.test.js):
 * - Git goes through ./git.js only: local subcommands, no hooks, no transports.
 *   Nothing is pushed, fetched or opened as a pull request.
 * - Everything runs in one egress context limited to the URL target, always
 *   offline. Loopback is added only with --fix-model, for Ollama.
 * - A dirty tree or a detached HEAD is refused unless allowDirty is set.
 * - Every diff is approved by `ask` unless --auto low and memory shows the
 *   recipe verified at least 3 times on this framework with no failures.
 * - When `signal` aborts, the fix in flight is verified and committed or
 *   reverted before the loop returns; the branch holds only verified commits.
 */
import { randomUUID, createHash } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanRepo as defaultScanRepo } from "../scan-repo.js";
import { scanUrl as defaultScanUrl } from "../scan-url.js";
import { createEgressContext, runWithEgress, request } from "../utils/http.js";
import {
  planFixes, probeRepo, applyDiff, redactPlan, findingKey, createModelFixer,
} from "../../lib/fix/index.js";
import { assertLocalModelUrl } from "../../lib/fix/model.js";
import { detectFramework } from "../../lib/fix/util.js";
import {
  openMemory, projectIdFor, buildViews, rankFindings, isSuppressed, withRepoSuppressions,
  findingId, loadRepoSuppressions,
} from "../../lib/memory/index.js";
import { createGit } from "./git.js";
import { hasTestScript, runProjectTests } from "./tests.js";

export const LOOP_RUN_SCHEMA = "penthera.loopRun/1";
export const AUTO_MIN_VERIFIED = 3;

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const OLLAMA_HOST = "127.0.0.1";

export class LoopError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "LoopError";
    this.code = code;
  }
}

/** `penthera/fix-<yyyymmdd-hhmm>` in local time. */
export function fixBranchName(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `penthera/fix-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

/**
 * The loop's egress context: only the URL target, always offline. Loopback is
 * allowed only when a fix model is set (Ollama listens on 127.0.0.1:11434).
 */
export function loopEgressContext({ url = null, fixModel = null } = {}) {
  return createEgressContext({ target: url || undefined, offline: true, allowHosts: fixModel ? [OLLAMA_HOST] : [] });
}

/** fetch for lib/fix/model.js that goes through the egress-guarded client. */
export function localModelFetch(url, init = {}) {
  assertLocalModelUrl(url);
  const { redirect: _ignored, ...rest } = init;
  return request(url, { ...rest, probe: "fix-model", timeout: 120_000 });
}

const sevOf = (f) => SEV_ORDER[f?.severity] ?? 5;
const brief = (f) => ({ fid: findingId(f), title: f.title, severity: f.severity, category: f.category || null });
const keysOf = (list) => new Set(list.map(findingKey));
const actionable = (list) => list.filter((f) => f.severity !== "info");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    if (!f || (f.severity === "info" && f.category === "config")) return false;
    const k = findingKey(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Record a timed step on `list`. */
async function timed(list, step, fn) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    list.push({ step, startedAt, durationMs: Date.now() - t0 });
  }
}

function clean(obj) {
  return JSON.parse(JSON.stringify(obj)); // drops undefined so memory's canonical JSON accepts it
}

/**
 * Run the loop.
 *
 * @param {object} opts
 * @param {string} opts.repo - repo to fix (required)
 * @param {string} [opts.url] - live target to scan as well
 * @param {number} [opts.maxIterations=5]
 * @param {"off"|"low"} [opts.auto="off"]
 * @param {boolean} [opts.runTests=false]
 * @param {string} [opts.fixModel] - local Ollama model name
 * @param {boolean} [opts.allowDirty=false]
 * @param {(req: object) => Promise<"y"|"n"|"skip"|"quit">} [opts.ask] - approval prompt; required unless every plan is auto-approved
 * @param {(line: string) => void} [opts.log]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.memoryRoot] - memory root (default ~/.penthera/memory)
 * @param {{ scanRepo?: Function, scanUrl?: Function, runTests?: Function, model?: object }} [opts.deps] - injectable for tests
 * @param {{ revertPending?: () => void }} [opts.handle] - filled with an emergency revert for a second Ctrl-C
 * @returns {Promise<object>} loopRun
 */
export async function runLoop(opts = {}) {
  if (!opts.repo) throw new LoopError("agent --loop needs a repo to fix (--repo <path>)", "NO_REPO");
  const repo = resolve(opts.repo);
  const url = opts.url || null;
  const maxIterations = Math.max(1, Number.isInteger(opts.maxIterations) ? opts.maxIterations : 5);
  const auto = opts.auto === "low" ? "low" : "off";
  const log = opts.log || (() => {});
  const deps = opts.deps || {};
  const scanRepoFn = deps.scanRepo || defaultScanRepo;
  const scanUrlFn = deps.scanUrl || defaultScanUrl;
  const testsFn = deps.runTests || runProjectTests;
  const stopped = () => Boolean(opts.signal?.aborted);

  // ── Preflight: a git work tree on a branch, clean unless --allow-dirty ──
  const gitExec = deps.gitExec ? { exec: deps.gitExec } : {};
  let git = createGit(repo, gitExec);
  if (git.tryRun("rev-parse", "--is-inside-work-tree")?.trim() !== "true") {
    throw new LoopError(`${repo} is not a git work tree. The loop commits each fix, so it needs git.`, "NOT_GIT");
  }
  const baseSha = git.tryRun("rev-parse", "--verify", "--quiet", "HEAD")?.trim();
  if (!baseSha) throw new LoopError(`${repo} has no commits yet. Commit once, then run the loop.`, "NO_HEAD");
  const base = git.tryRun("symbolic-ref", "--quiet", "--short", "HEAD")?.trim() || null;
  if (!base && !opts.allowDirty) {
    throw new LoopError("HEAD is detached. Check out a branch first (the fix branch starts from it), or pass --allow-dirty.", "DETACHED");
  }
  const prefix = git.run("rev-parse", "--show-prefix").trim();
  const dirtyFiles = new Set(
    git.run("status", "--porcelain", "--untracked-files=all", "--", ".").split("\n").filter(Boolean)
      .map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop())
      .map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p)),
  );
  if (dirtyFiles.size && !opts.allowDirty) {
    throw new LoopError(`${repo} has uncommitted changes (${[...dirtyFiles].slice(0, 5).join(", ")}${dirtyFiles.size > 5 ? ", ..." : ""}). Commit or stash them first, or pass --allow-dirty.`, "DIRTY");
  }
  if (!git.tryRun("config", "--get", "user.email")?.trim()) {
    // No identity configured: commit as the agent rather than failing after a verified fix.
    git = createGit(repo, {
      ...gitExec,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "penthera agent", GIT_AUTHOR_EMAIL: "penthera-agent@localhost",
        GIT_COMMITTER_NAME: "penthera agent", GIT_COMMITTER_EMAIL: "penthera-agent@localhost",
      },
    });
  }

  // ── Memory: fail closed on a broken chain (no ranking, no auto, no writes) ──
  const { id: projectId, label } = projectIdFor({ repo });
  const mem = openMemory(projectId, { root: opts.memoryRoot, label });
  const chainOk = mem.verify().ok;
  let views = chainOk ? buildViews(mem.events()) : { suppressions: [], recipeSuccess: [], seen: {} };
  const repoSupp = loadRepoSuppressions(repo);
  views = withRepoSuppressions(views, repoSupp.entries);
  let eventsAppended = 0;
  const remember = (type, data) => {
    if (!chainOk) return;
    try {
      mem.append({ type, data: clean(data) });
      eventsAppended++;
    } catch (e) {
      log(`  memory: could not record ${type} (${e.message})`);
    }
  };
  const recipeStats = (framework, recipe) =>
    views.recipeSuccess?.find((r) => r.framework === String(framework || "unknown").toLowerCase() && r.recipe === recipe) || null;
  const stack = detectFramework(repo) || "unknown";

  let model = null;
  if (opts.fixModel) model = deps.model || createModelFixer({ model: opts.fixModel, fetch: localModelFetch });

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const loopRun = {
    schema: LOOP_RUN_SCHEMA,
    id: randomUUID(),
    startedAt,
    finishedAt: null,
    durationMs: 0,
    target: { repo, url },
    branch: { base, baseSha, fix: null },
    options: {
      maxIterations, auto, runTests: Boolean(opts.runTests), fixModel: opts.fixModel || null,
      offline: true, allowDirty: Boolean(opts.allowDirty),
    },
    stopReason: null,
    error: null,
    findings: { initial: null, final: null },
    totals: { iterations: 0, planned: 0, applied: 0, verified: 0, failed: 0, declined: 0, skipped: 0, commits: [] },
    memory: { projectId, chain: chainOk ? "ok" : "broken", eventsAppended: 0 },
    iterations: [],
  };
  if (!chainOk) log("  memory chain is broken: ranking and --auto are off, nothing is recorded. Run `penthera memory verify`.");
  for (const w of repoSupp.warnings || []) log(`  ${w}`);

  // ── The fix branch, from the current HEAD ──
  let branch = fixBranchName();
  for (let i = 2; git.tryRun("show-ref", "--verify", "--quiet", `refs/heads/${branch}`) !== null; i++) {
    branch = `${fixBranchName()}-${i}`;
  }
  git.run("checkout", "-b", branch);
  loopRun.branch.fix = branch;
  log(`  on ${branch} (from ${base || baseSha.slice(0, 12)})`);

  // The fix in flight, so a second Ctrl-C can put the files back.
  let pending = null;
  const revert = (files, created) => {
    const tracked = files.filter((f) => !created.includes(f));
    if (tracked.length) git.run("checkout", "--", ...tracked);
    for (const f of created) {
      const p = join(repo, f);
      if (existsSync(p)) unlinkSync(p);
    }
  };
  if (opts.handle) {
    opts.handle.revertPending = () => {
      if (pending) revert(pending.files, pending.created);
      pending = null;
    };
  }

  const ctx = loopEgressContext({ url, fixModel: opts.fixModel });
  const scanOpts = { offline: true, allowHosts: [...ctx.allowHosts], timeout: opts.scanTimeout || 10_000 };

  async function scan() {
    const repoResult = await scanRepoFn(repo, {});
    const stat = dedupe([...(repoResult?.findings || []), ...probeRepo(repo)]);
    let live = [];
    if (url) {
      const r = await scanUrlFn(url, scanOpts);
      live = dedupe(r?.findings || []);
    }
    return { static: stat, live, all: dedupe([...stat, ...live]) };
  }

  function recordScan(s) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of s.all) if (counts[f.severity] != null) counts[f.severity]++;
    remember("scan", {
      stack, modes: url ? ["repo", "url", "agent"] : ["repo", "agent"],
      counts: { ...counts, total: s.all.length, suppressed: 0 },
      ids: actionable(s.all).map(findingId),
    });
  }

  function triage(s) {
    const kept = [];
    let suppressed = 0;
    for (const f of s.all) {
      if (isSuppressed(f, views)) suppressed++;
      else kept.push(f);
    }
    return { ranked: chainOk ? rankFindings(kept, views, { framework: stack }) : kept, suppressed };
  }

  let heldBack = 0; // plans left out of the last plan() because they were declined or failed
  const tried = new Set(); // plan keys declined or failed in this run: never proposed again
  const planKey = (p) => (p.source === "recipe" ? `recipe:${p.recipe}` : `model:${p.findings.map(findingKey).sort().join("|")}`);

  async function plan(ranked) {
    const byKey = new Map(ranked.map((f) => [findingKey(f), f]));
    const { plans } = await planFixes(repo, ranked, { model });
    const order = new Map(ranked.map((f, i) => [findingKey(f), i]));
    heldBack = plans.filter((p) => tried.has(planKey(p))).length;
    return plans
      .filter((p) => !tried.has(planKey(p)))
      .map((p) => {
        const stats = p.source === "recipe" ? recipeStats(p.framework, p.recipe) : null;
        return {
          plan: p,
          originals: p.findings.map((b) => byKey.get(findingKey(b)) || b),
          sev: Math.min(...p.findings.map(sevOf)),
          rate: stats?.rate ?? null,
          rank: Math.min(...p.findings.map((b) => order.get(findingKey(b)) ?? Infinity)),
          stats,
        };
      })
      // Severity first (memory never changes it), then the recipe's verified rate, then memory's finding rank.
      .sort((a, b) => a.sev - b.sev || (b.rate ?? 0.5) - (a.rate ?? 0.5) || a.rank - b.rank);
  }

  const autoOk = (p, stats) => auto === "low" && chainOk && p.source === "recipe" && p.confidence !== "needs-human-review"
    && stats && stats.verified >= AUTO_MIN_VERIFIED && stats.failed === 0;

  function commitMessage(p, entry, decision) {
    const lines = p.findings.map((f) => `- [${f.severity || "?"}] ${f.title}${f.url ? ` (${f.url})` : ""}`);
    const tests = entry.verify?.tests ? (entry.verify.tests.ok ? "project tests passed" : "project tests failed") : "project tests not run";
    return [
      `fix(security): ${p.title}${p.framework ? ` (${p.framework})` : ""}`,
      [
        "Fixes:", ...lines, "",
        `Recipe: ${p.recipe} (${p.source}, confidence ${p.confidence}), plan ${p.id}`,
        `Verified: re-scan no longer reports the fixed findings and shows no new ones; ${tests}.`,
        `Applied by penthera agent --loop (${decision === "auto" ? "auto-approved from memory" : "approved"}). Nothing was pushed.`,
      ].join("\n"),
    ];
  }

  let current = null; // last scan, kept in sync as fixes land
  let stopReason = null;

  const body = async () => {
    for (let n = 1; n <= maxIterations && !stopReason; n++) {
      if (stopped()) { stopReason = "interrupted"; break; }
      const it = { n, startedAt: new Date().toISOString(), durationMs: 0, findings: null, steps: [], fixes: [] };
      loopRun.iterations.push(it);
      const itStart = Date.now();
      log(`\n  iteration ${n}/${maxIterations}`);

      current = await timed(it.steps, "scan", scan);
      recordScan(current);
      if (loopRun.findings.initial == null) loopRun.findings.initial = actionable(current.all).length;
      const { ranked, suppressed } = await timed(it.steps, "triage", async () => triage(current));
      const candidates = await timed(it.steps, "plan", () => plan(ranked));
      it.findings = { total: current.all.length, suppressed, fixable: candidates.length };
      loopRun.totals.planned += candidates.length;
      log(`  scan: ${actionable(current.all).length} findings (${suppressed} suppressed), ${candidates.length} fixable`);

      if (!candidates.length) {
        stopReason = heldBack ? "declined-or-failed-left" : "no-fixable-findings";
        it.durationMs = Date.now() - itStart;
        break;
      }

      let appliedHere = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (stopped()) { stopReason = "interrupted"; break; }
        let { plan: p, originals, stats } = candidates[i];
        const entry = {
          planId: p.id, recipe: p.recipe, title: p.title, framework: p.framework || null, source: p.source,
          confidence: p.confidence, files: p.files, findings: originals.map(brief),
          memory: stats ? { verified: stats.verified, failed: stats.failed } : null,
          decision: null, status: "not-applied", reason: null, commit: null, verify: null, steps: [],
        };
        it.fixes.push(entry);

        // Earlier fixes in this iteration may have changed the same files: re-plan against the tree.
        if (i > 0) {
          const fresh = (await planFixes(repo, originals, { model })).plans.find((q) => planKey(q) === planKey(p));
          if (!fresh) {
            entry.decision = "obsolete";
            entry.reason = "an earlier fix in this iteration already covered it";
            continue;
          }
          p = fresh;
          Object.assign(entry, { planId: p.id, files: p.files });
        }

        const shown = redactPlan(p);
        let answer;
        if (autoOk(p, stats)) {
          answer = "auto";
          log(`  [${i + 1}/${candidates.length}] ${p.title}: auto-approved (memory: ${stats.verified} verified, 0 failed on ${p.framework})`);
        } else {
          if (!opts.ask) throw new LoopError("No approval prompt: every diff needs a y/n answer unless --auto low applies", "NO_PROMPT");
          answer = await timed(entry.steps, "approve", () => opts.ask({
            plan: shown, iteration: n, index: i + 1, total: candidates.length,
            memory: entry.memory, signal: opts.signal,
          }));
        }
        if (stopped()) { entry.decision = "quit"; stopReason = "interrupted"; break; }
        if (answer === "quit") { entry.decision = "quit"; stopReason = "user-quit"; break; }
        if (answer === "n") { entry.decision = "declined"; tried.add(planKey(p)); loopRun.totals.declined++; continue; }
        if (answer !== "y" && answer !== "auto") { entry.decision = "skipped"; loopRun.totals.skipped++; continue; }
        entry.decision = answer === "auto" ? "auto" : "approved";

        const touchesDirty = p.files.filter((f) => dirtyFiles.has(f));
        if (touchesDirty.length) {
          entry.reason = `touches files with uncommitted changes (${touchesDirty.join(", ")}); fix them by hand`;
          tried.add(planKey(p));
          log(`    not applied: ${entry.reason}`);
          continue;
        }

        // ── Patch ──
        let applied;
        try {
          applied = await timed(entry.steps, "patch", async () => applyDiff(repo, p.diff, { allowDirty: Boolean(opts.allowDirty) }));
        } catch (e) {
          entry.reason = `did not apply: ${e.message}`;
          tried.add(planKey(p));
          log(`    not applied: ${e.message}`);
          continue;
        }
        const files = applied.files.map((f) => f.path);
        const created = applied.files.filter((f) => f.created).map((f) => f.path);
        pending = { files, created };
        loopRun.totals.applied++;
        appliedHere++;
        const primary = originals[0];
        const learnData = {
          id: findingId(primary), recipe: p.recipe, framework: p.framework || stack, category: primary.category || null,
          diff_sha256: sha256(p.diff), plan: p.id, ids: originals.map(findingId), source: p.source, loop: loopRun.id,
        };
        await timed(entry.steps, "learn", async () => remember("fix_applied", learnData));

        // ── Verify: re-scan, then the project's tests ──
        const before = current;
        const verdict = await timed(entry.steps, "verify", async () => {
          const after = await scan();
          const staticNow = keysOf(after.static);
          const liveNow = keysOf(after.live);
          const beforeKeys = keysOf(before.all);
          const targetedRemaining = p.findings.filter((f) => staticNow.has(findingKey(f))).length;
          const liveRemaining = p.findings.filter((f) => liveNow.has(findingKey(f))).length;
          const introduced = actionable(after.all).filter((f) => !beforeKeys.has(findingKey(f)));
          let tests = null;
          if (opts.runTests && hasTestScript(repo)) {
            const r = await testsFn(repo);
            tests = { ok: r.ok, exitCode: r.exitCode, durationMs: r.durationMs };
            if (!r.ok) entry.testOutput = r.output?.slice(-2_000);
          }
          const reasons = [];
          if (targetedRemaining) reasons.push(`${targetedRemaining} targeted finding(s) still reported`);
          if (introduced.length) reasons.push(`new finding(s): ${introduced.slice(0, 3).map((f) => f.title).join("; ")}`);
          if (tests && !tests.ok) reasons.push(`project tests failed (exit ${tests.exitCode})`);
          return { after, ok: reasons.length === 0, reasons, summary: { targetedRemaining, newFindings: introduced.length, liveRemaining, tests } };
        });
        entry.verify = verdict.summary;

        if (verdict.ok) {
          const [subject, msg] = commitMessage(p, entry, entry.decision);
          await timed(entry.steps, "commit", async () => {
            git.run("add", "--", ...files);
            git.run("commit", "-q", "-m", subject, "-m", msg, "--", ...files);
          });
          pending = null;
          entry.commit = git.run("rev-parse", "HEAD").trim();
          entry.status = "verified";
          loopRun.totals.verified++;
          loopRun.totals.commits.push(entry.commit);
          current = verdict.after;
          await timed(entry.steps, "learn", async () => remember("fix_verified", { ...learnData, commit: entry.commit }));
          const live = entry.verify.liveRemaining ? `; ${entry.verify.liveRemaining} still served by the running app until it restarts` : "";
          log(`    verified and committed ${entry.commit.slice(0, 10)}${live}`);
        } else {
          await timed(entry.steps, "revert", async () => revert(files, created));
          pending = null;
          entry.status = "failed";
          entry.reason = verdict.reasons.join("; ");
          tried.add(planKey(p));
          loopRun.totals.failed++;
          await timed(entry.steps, "learn", async () => remember("fix_failed", { ...learnData, reason: entry.reason }));
          log(`    failed verification, reverted: ${entry.reason}`);
        }
        if (stopped()) { stopReason = "interrupted"; break; }
      }
      it.durationMs = Date.now() - itStart;
      if (!stopReason && appliedHere === 0 && it.fixes.every((f) => f.decision !== "skipped")) {
        stopReason = "declined-or-failed-left";
      }
    }

    if (!stopReason) {
      // The last iteration may have fixed everything: check before saying we ran out of iterations.
      const s = await scan();
      current = s;
      const left = await plan(triage(s).ranked);
      stopReason = left.length ? "max-iterations" : heldBack ? "declined-or-failed-left" : "no-fixable-findings";
    }
  };

  try {
    await runWithEgress(ctx, body);
  } catch (e) {
    if (pending) {
      try { revert(pending.files, pending.created); } catch { /* reported below */ }
      pending = null;
    }
    stopReason = "error";
    loopRun.error = e.message;
  }

  loopRun.stopReason = stopReason;
  loopRun.findings.final = current ? actionable(triage(current).ranked).length : null;
  loopRun.totals.iterations = loopRun.iterations.length;
  loopRun.finishedAt = new Date().toISOString();
  loopRun.durationMs = Date.now() - t0;
  remember("loop_run", summarizeForMemory(loopRun));
  loopRun.memory.eventsAppended = eventsAppended;
  return loopRun;
}

/** The loopRun as stored in memory: no test output, bounded size. */
export function summarizeForMemory(loopRun) {
  const { iterations, ...rest } = loopRun;
  return clean({
    ...rest,
    iterations: iterations.map((it) => ({
      ...it,
      fixes: it.fixes.map(({ testOutput, findings, ...f }) => ({ ...f, findings: findings.map((x) => x.fid) })),
    })),
  });
}
