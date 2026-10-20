// One store for the single view. Renderers subscribe and redraw their window.
export const state = {
  meta: null,
  overview: null,
  findings: [],
  runs: { live: [], past: [] },
  sel: { kind: "all", key: null },   // all | project | run | past
  tab: "findings",                   // findings | deps | ai | history | proof (for all / project)
  finding: null,                     // { id, project } open in the inspector
  right: "none",                     // none | finding | settings
  query: "",
  pending: null,                     // the live run's diff waiting for a decision, if any
};

export const TABS = [
  { id: "findings", label: "Findings", key: "1" },
  { id: "deps", label: "Dependencies", key: "2" },
  { id: "ai", label: "AI tooling", key: "3" },
  { id: "history", label: "History", key: "4" },
  { id: "proof", label: "Proof", key: "5" },
];

const subs = new Set();
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }
export function set(patch) {
  Object.assign(state, patch);
  for (const fn of subs) fn(patch);
}

/** Every project key: scanned targets first, then project folders with no scans yet. */
export function projectKeys() {
  const scanned = (state.overview?.projects || []).map((p) => p.key);
  const folders = (state.meta?.projects || []).filter((f) => !scanned.includes(f));
  return [...scanned, ...folders];
}

export const projectOf = (key) => (state.overview?.projects || []).find((p) => p.key === key) || null;

/** The folder a run should use: the selected project if it is a folder, else the first project folder. */
export function folderFor(key) {
  if (key && key.startsWith("/")) return key;
  return state.meta?.projects?.[0] || "";
}

/** The project the current view is about, if any (a run or past run counts as its project). */
export function currentProject() {
  const s = state.sel;
  if (s.kind === "project") return s.key;
  if (s.kind === "past") return s.past?.target?.repo || s.past?.target?.url || null;
  if (s.kind === "run") return s.run?.repo || s.run?.url || null;
  return null;
}

/** The live run that is still going, if any. */
export const liveRun = () => state.runs.live.find((r) => r.status === "running") || null;
