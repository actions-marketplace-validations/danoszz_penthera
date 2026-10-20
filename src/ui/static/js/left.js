// Left sidebar: brand, "+ New scan", projects with their grade, runs grouped
// by project (like the session list in Claude Code), and the footer gear.
import { h, clear } from "./dom.js";
import { state, set, projectKeys, projectOf } from "./state.js";
import { ago, shortProject } from "./format.js";
import { EMPTY } from "./copy.js";

const KIND_LABEL = { scan: "scan", deps: "deps", agents: "AI tooling", loop: "fix loop" };

export function renderLeft(el, { onNewScan, toggleLeft, theme }) {
  const projects = state.overview?.projects || [];
  const keys = projectKeys();
  const totalOpen = projects.reduce((n, p) => n + p.open, 0);

  const item = (attrs, ...kids) => h("button", { type: "button", class: "item", ...attrs }, ...kids);
  const current = (kind, key) => String(state.sel.kind === kind && (key == null || state.sel.key === key));

  const projectList = h("ul", { class: "side-list", "aria-label": "Projects" },
    h("li", {}, item({ "aria-current": current("all"), onclick: () => set({ sel: { kind: "all", key: null } }) },
      h("span", { class: "grade" }, "∑"), h("span", { class: "name" }, "All projects"), h("span", { class: "count" }, String(totalOpen)),
      h("span", { class: "sub" }, `${projects.length} scanned · ${totalOpen} open`))),
    keys.map((key) => {
      const p = projectOf(key);
      return h("li", {}, item({ "aria-current": current("project", key), title: key, onclick: () => set({ sel: { kind: "project", key } }) },
        h("span", { class: `grade grade-${p?.grade || "x"}` }, p ? p.grade : "·"),
        h("span", { class: "name" }, shortProject(key)),
        h("span", { class: "count" }, p ? String(p.open) : ""),
        h("span", { class: "sub" }, p ? `${p.mode || "scan"} · ${ago(p.lastScan)}` : "not scanned yet")));
    }),
  );
  if (!keys.length) projectList.append(h("li", { class: "group-h" }, EMPTY.projects));

  // Runs: live ones from this session first, then past loop runs, grouped by project.
  const runs = [
    ...state.runs.live.map((r) => ({ live: true, id: r.id, kind: r.kind, project: r.repo || r.url, status: r.status, at: r.startedAt, run: r })),
    ...state.runs.past.map((l, i) => ({ live: false, id: `past-${i}`, kind: "loop", project: l.target.repo || l.target.url, status: l.stopReason, at: l.startedAt, past: l })),
  ];
  const groups = new Map();
  for (const r of runs) {
    const k = r.project || "unknown";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const runList = h("ul", { class: "side-list", "aria-label": "Runs" });
  for (const [project, list] of groups) {
    runList.append(h("li", { class: "group-h", title: project }, shortProject(project)));
    for (const r of list.slice(0, 6)) {
      const kindSel = r.live ? "run" : "past";
      const sum = r.past ? `${r.past.totals.verified} verified · ${r.past.findings.initial ?? "?"} → ${r.past.findings.final ?? "?"}` : r.status;
      runList.append(h("li", {}, item({
        "aria-current": current(kindSel, r.id),
        onclick: () => set({ sel: { kind: kindSel, key: r.id, run: r.run || null, past: r.past || null } }),
      },
      h("span", { class: `dot ${r.live && r.status === "running" ? "live" : r.live ? "done" : ""}`, "aria-hidden": "true" }),
      h("span", { class: "name" }, KIND_LABEL[r.kind] || r.kind),
      h("span", { class: "count muted" }, ago(r.at)),
      h("span", { class: "sub" }, sum || ""))));
    }
  }
  if (!runs.length) runList.append(h("li", { class: "group-h" }, EMPTY.runs));

  const body = h("div", { class: "pane-body" },
    h("button", { type: "button", class: "btn new-scan", onclick: onNewScan }, "+ New scan"),
    h("div", { class: "side-label" }, h("span", {}, "Projects")),
    projectList,
    h("div", { class: "side-label" }, h("span", {}, "Runs")),
    runList,
    h("div", { class: "side-foot" },
      h("button", { type: "button", class: "icon", "aria-label": "Settings", title: "Settings", "aria-pressed": String(state.right === "settings"),
        onclick: () => set({ right: state.right === "settings" ? "cards" : "settings", openRight: true }) }, "⚙"),
      h("button", { type: "button", class: "icon", "aria-label": `Theme: ${theme.get()}. Switch`, title: "Switch theme", onclick: () => { theme.set(theme.get() === "light" ? "dark" : "light"); renderLeft(el, { onNewScan, toggleLeft, theme }); } }, theme.get() === "light" ? "◑" : "◐"),
      h("span", { class: "grow" }),
      h("span", {}, state.meta?.demo ? "demo · " : ""),
      h("span", {}, `v${state.meta?.version || ""}`),
    ),
  );
  clear(el).append(
    h("div", { class: "win-bar" },
      h("span", { class: "mark", "aria-hidden": "true" }),
      h("span", { class: "logotype", role: "img", "aria-label": "Penthera" }),
      h("span", { class: "grow" }),
      h("button", { type: "button", class: "icon", "aria-label": "Hide the sidebar ([)", title: "Hide the sidebar  [", onclick: toggleLeft }, "⇤"),
    ),
    body,
  );
}
