// One store for the single view. Renderers subscribe and redraw their column.
export const state = {
  meta: null,
  overview: null,
  findings: [],
  runs: { live: [], past: [] },
  sel: { kind: "all", key: null },   // all | project | run | past
  finding: null,                     // { id, project } open in the right panel
  right: "cards",                    // cards | finding | settings
  query: "",
  mode: "scan",
  activeRun: null,                   // the live run object being streamed
};

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
