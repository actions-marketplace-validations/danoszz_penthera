/**
 * Report-side view over memory events: the scan trend (counts per scan) and
 * the fix history per finding id (first seen → fix applied → verified or
 * failed). Like views.js it only reads, and every field is type-checked.
 */

const MAX_STR = 500;
const str = (x) => (typeof x === "string" && x.length > 0 && x.length <= MAX_STR ? x : null);
const int = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
const iso = (x) => (str(x) && !Number.isNaN(Date.parse(x)) ? x : null);

/**
 * @param {object[]} events  verified events from openMemory().events()
 * @param {{ maxScans?: number }} opts  how many recent scans the trend keeps
 * @returns {{ trend: object[], fixes: object[] }}
 */
export function buildHistory(events, { maxScans = 12 } = {}) {
  const trend = [];
  const fixes = new Map();
  const fix = (id) => {
    if (!fixes.has(id)) fixes.set(id, { id, firstSeen: null, applied: null, recipe: null, verified: null, failed: null });
    return fixes.get(id);
  };
  const firstSeen = new Map();

  for (const ev of events || []) {
    const d = ev?.data;
    const ts = iso(ev?.ts);
    if (!d || typeof d !== "object" || !ts) continue;
    if (ev.type === "scan") {
      const c = d.counts && typeof d.counts === "object" ? d.counts : {};
      trend.push({
        ts, critical: int(c.critical), high: int(c.high), medium: int(c.medium), low: int(c.low),
        total: int(c.total), suppressed: int(c.suppressed),
      });
      for (const id of Array.isArray(d.ids) ? d.ids : []) if (str(id) && !firstSeen.has(id)) firstSeen.set(id, ts);
    } else if (ev.type === "fix_applied" || ev.type === "fix_verified" || ev.type === "fix_failed") {
      const id = str(d.id);
      if (!id) continue;
      const f = fix(id);
      if (ev.type === "fix_applied") {
        f.applied = ts;
        f.recipe = str(d.recipe) || f.recipe;
        f.verified = null;
        f.failed = null;
      } else if (ev.type === "fix_verified") f.verified = ts;
      else f.failed = ts;
    }
  }
  for (const f of fixes.values()) f.firstSeen = firstSeen.get(f.id) || f.applied;
  return { trend: trend.slice(-maxScans), fixes: [...fixes.values()] };
}
