/**
 * Loop timeline: found → fixed → verified per finding, with time-to-fix.
 *
 * Two sources, in this order:
 *   result.loopRun          an agent loop run (`penthera agent`), either
 *                           { iterations: [{ n, found:[fid], fixed:[{fid, recipe}],
 *                             verified:[fid], failed:[fid], ms }] }
 *                           or the penthera.loopRun/1 shape
 *                           { iterations: [{ n, durationMs, fixes: [{ recipe,
 *                             status, findings: [{ fid, title }] }] }] }
 *   result.memory.history   fix events from the local learning store (--memory)
 *
 * Returns null when neither has anything to show.
 */

const fidOf = (x) => (typeof x === "string" ? x : typeof x?.fid === "string" ? x.fid : typeof x?.id === "string" ? x.id : null);
const list = (x) => (Array.isArray(x) ? x : []);

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function titles(result) {
  const map = new Map();
  for (const f of [...list(result?.findings), ...list(result?.suppressed)]) {
    if (typeof f?.fid === "string" && !map.has(f.fid)) map.set(f.fid, f.title || "");
  }
  return map;
}

/** penthera.loopRun/1 iteration → the found/fixed/verified/failed lists. */
function normalizeIteration(it, names) {
  if (!Array.isArray(it?.fixes)) return it;
  const found = [];
  const fixed = [];
  const verified = [];
  const failed = [];
  for (const fx of it.fixes) {
    const applied = fx?.status === "verified" || fx?.status === "failed";
    for (const f of list(fx?.findings)) {
      const fid = fidOf(f);
      if (!fid) continue;
      if (typeof f.title === "string" && !names.has(fid)) names.set(fid, f.title);
      found.push(fid);
      if (applied) fixed.push({ fid, recipe: typeof fx.recipe === "string" ? fx.recipe : null });
      if (fx.status === "verified") verified.push(fid);
      if (fx.status === "failed") failed.push(fid);
    }
  }
  return { n: it.n, ms: Number.isFinite(it.ms) ? it.ms : it.durationMs, found, fixed, verified, failed };
}

function fromLoop(loopRun, names) {
  const its = list(loopRun?.iterations);
  if (!its.length) return null;
  const rows = new Map();
  const row = (fid) => {
    if (!rows.has(fid)) rows.set(fid, { fid, title: names.get(fid) || "", found: null, fixed: null, recipe: null, verified: null, failed: null, timeToFixMs: null, _start: null });
    return rows.get(fid);
  };
  let elapsed = 0;
  its.map((x) => normalizeIteration(x, names)).forEach((it, i) => {
    const n = Number.isInteger(it?.n) ? it.n : i + 1;
    const startMs = elapsed;
    elapsed += Number.isFinite(it?.ms) && it.ms > 0 ? it.ms : 0;
    for (const x of list(it?.found)) {
      const fid = fidOf(x);
      if (!fid) continue;
      const r = row(fid);
      if (r.found == null) { r.found = `iteration ${n}`; r._start = startMs; }
    }
    for (const x of list(it?.fixed)) {
      const fid = fidOf(x);
      if (!fid) continue;
      const r = row(fid);
      r.fixed = `iteration ${n}`;
      r.recipe = typeof x?.recipe === "string" ? x.recipe : r.recipe;
      if (r.found == null) { r.found = `iteration ${n}`; r._start = startMs; }
    }
    for (const x of list(it?.verified)) {
      const fid = fidOf(x);
      if (!fid) continue;
      const r = row(fid);
      r.verified = `iteration ${n}`;
      r.failed = null;
      r.timeToFixMs = elapsed - (r._start ?? startMs);
    }
    for (const x of list(it?.failed)) {
      const fid = fidOf(x);
      if (!fid) continue;
      const r = row(fid);
      if (!r.verified) r.failed = `iteration ${n}`;
    }
  });
  const entries = [...rows.values()].map(({ _start, ...r }) => r);
  return { source: "agent loop", iterations: its.length, totalMs: elapsed, entries };
}

function fromMemory(history, names) {
  const fixes = list(history?.fixes);
  if (!fixes.length) return null;
  const entries = fixes.map((f) => {
    const t0 = Date.parse(f.firstSeen);
    const t1 = Date.parse(f.verified);
    return {
      fid: f.id,
      title: names.get(f.id) || "",
      found: f.firstSeen || null,
      fixed: f.applied || null,
      recipe: f.recipe || null,
      verified: f.verified || null,
      failed: f.verified ? null : (f.failed || null),
      timeToFixMs: Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, t1 - t0) : null,
    };
  });
  return { source: "memory", iterations: null, totalMs: null, entries };
}

/** Build the timeline for a scan result, or null. */
export function buildTimeline(result) {
  const names = titles(result);
  const t = fromLoop(result?.loopRun, names) || fromMemory(result?.memory?.history, names);
  if (!t || !t.entries.length) return null;
  const times = t.entries.map((e) => e.timeToFixMs).filter((x) => x != null);
  return {
    ...t,
    verifiedCount: t.entries.filter((e) => e.verified).length,
    failedCount: t.entries.filter((e) => e.failed).length,
    openCount: t.entries.filter((e) => !e.verified && !e.failed).length,
    medianTimeToFixMs: median(times),
  };
}

/** "350 ms", "4.2 s", "12 min", "3.5 h", "2.1 days". */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} days`;
}
