// penthera ui: a menu bar over three tiled windows. Projects on the left, the
// selected project (five tabs) or run in the centre, the inspector on the
// right. Runs start from the New scan dialog; every action is also in a menu.
import { h, clear, announce } from "./dom.js";
import { api } from "./api.js";
import { patternDefs } from "./charts.js";
import { state, set, on, TABS } from "./state.js";
import { renderMenubar, closeMenus } from "./menubar.js";
import { renderLeft } from "./left.js";
import { renderCenter, refreshList, moveFinding, answerPending } from "./center.js";
import { renderRight } from "./right.js";
import { newScan, about } from "./dialog.js";
import { ERR } from "./copy.js";

const THEME_KEY = "penthera-ui-theme";
const PANELS_KEY = "penthera-ui-panels";
const app = document.getElementById("app");
const menubar = document.getElementById("menubar");
const left = document.getElementById("left");
const center = document.getElementById("center");
const right = document.getElementById("right");
const scrim = document.getElementById("scrim");

// ── Theme: one system, [data-theme] on <html>; theme.js set it before paint ──
const theme = {
  get: () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"),
  set(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* storage off: this page only */ }
    announce(`${t === "light" ? "Light" : "Dark"} theme`);
  },
};

// ── Side windows: [ and ] toggle; drawers below 1180px / 760px ──
const narrowRight = () => window.matchMedia("(max-width: 1180px)").matches;
const narrowLeft = () => window.matchMedia("(max-width: 760px)").matches;
function savedPanels() {
  try { return JSON.parse(localStorage.getItem(PANELS_KEY) || "null"); } catch { return null; }
}
const panels = { left: true, right: true, ...(savedPanels() || {}) };
function applyPanels() {
  app.classList.toggle("no-left", !panels.left);
  app.classList.toggle("no-right", !panels.right);
  scrim.hidden = !((panels.right && narrowRight()) || (panels.left && narrowLeft()));
  if (!narrowRight()) {
    try { localStorage.setItem(PANELS_KEY, JSON.stringify(panels)); } catch { /* per-viewer convenience only */ }
  }
  if (state.meta) renderMenubar(menubar, ctx);
}
function toggleLeft() { panels.left = !panels.left; applyPanels(); }
function toggleRight() { panels.right = !panels.right; applyPanels(); }
scrim.addEventListener("click", () => {
  if (narrowLeft()) panels.left = false;
  if (narrowRight()) panels.right = false;
  applyPanels();
});

// ── Context the renderers share ──
const ctx = {
  theme,
  panels,
  toggleLeft,
  toggleRight,
  refresh,
  setTheme(t) { theme.set(t); renderMenubar(menubar, ctx); if (state.right === "settings") renderRight(right, ctx); },
  newScan(kind, project) { closeMenus(); newScan(ctx, { kind, project }); },
  about() { about(); },
  openTab(tab, project) {
    const patch = { tab };
    if (project) patch.sel = { kind: "project", key: project };
    else if (state.sel.kind !== "all" && state.sel.kind !== "project") patch.sel = { kind: "all", key: null };
    set(patch);
  },
  openFinding(f) {
    set({ finding: { id: f.id, project: f.project }, right: "finding" });
    if (!panels.right) { panels.right = true; applyPanels(); }
    for (const b of document.querySelectorAll("#findings-list .row")) {
      b.setAttribute("aria-current", String(b.dataset.id === f.id && b.dataset.project === f.project));
    }
  },
};

async function refresh() {
  const [overview, findings, runs] = await Promise.all([api.get("/api/overview"), api.get("/api/findings"), api.get("/api/runs")]);
  const live = runs.live.find((r) => r.status === "running" && r.pending);
  set({ overview, findings: findings.findings, runs, ...(live && !state.pending ? { pending: { index: live.pending.index, total: live.pending.total } } : {}) });
}

// ── Redraw on state changes, one window at a time ──
on((patch) => {
  const keys = Object.keys(patch);
  if (keys.includes("query") && keys.length === 1) { refreshList(ctx); return; }
  if (keys.some((k) => ["overview", "runs", "sel", "meta", "right", "tab", "pending"].includes(k))) renderMenubar(menubar, ctx);
  if (keys.some((k) => ["overview", "runs", "sel", "meta"].includes(k))) renderLeft(left, ctx);
  if (keys.some((k) => ["overview", "findings", "sel", "tab"].includes(k))) {
    // A live transcript is rebuilt only when the selection changes, never on a data refresh.
    if (!(state.sel.kind === "run" && !keys.includes("sel"))) renderCenter(center, ctx);
    if (keys.includes("sel") && narrowLeft() && panels.left) { panels.left = false; applyPanels(); }
  }
  if (keys.some((k) => ["sel", "right", "finding"].includes(k))) {
    if (state.right !== "none" && !panels.right) { panels.right = true; applyPanels(); }
    renderRight(right, ctx);
  }
});

// ── Keyboard ──
function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
document.addEventListener("pointerdown", (e) => { if (!menubar.contains(e.target)) closeMenus(); });
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector("dialog[open]")) return; // the dialog owns the keyboard
  if (e.key === "Escape") {
    if (closeMenus()) return;
    const q = document.getElementById("q");
    if (document.activeElement === q && q.value) { q.value = ""; set({ query: "" }); return; }
    if (state.right !== "none") { set({ right: "none", finding: null }); return; }
    if ((narrowRight() && panels.right) || (narrowLeft() && panels.left)) scrim.click();
    return;
  }
  if (isTyping(e) || menubar.contains(e.target)) return;
  if (answerPending(e.key)) { e.preventDefault(); return; }
  const tab = TABS.find((t) => t.key === e.key);
  if (tab) { e.preventDefault(); ctx.openTab(tab.id); return; }
  if (e.key === "n") { e.preventDefault(); ctx.newScan(); return; }
  if (e.key === "/") {
    e.preventDefault();
    if (state.tab !== "findings" || !(state.sel.kind === "all" || state.sel.kind === "project")) ctx.openTab("findings");
    document.getElementById("q")?.focus();
    return;
  }
  if (e.key === "j" || e.key === "k") { e.preventDefault(); moveFinding(e.key === "j" ? 1 : -1, ctx); return; }
  if (e.key === "[") { e.preventDefault(); toggleLeft(); return; }
  if (e.key === "]") { e.preventDefault(); toggleRight(); }
});

if (narrowLeft()) panels.left = false;
if (narrowRight()) panels.right = false;
applyPanels();

(async function boot() {
  document.body.append(patternDefs());
  try {
    state.meta = await api.get("/api/meta");
    renderMenubar(menubar, ctx);
    renderRight(right, ctx);
    await refresh();
    document.title = `Penthera${state.meta.demo ? " :: demo" : ""}`;
  } catch (e) {
    clear(center).append(h("div", { class: "col" },
      h("h1", {}, "Not signed in"),
      h("p", { class: "bad", role: "alert" }, e.message),
      h("p", { class: "muted" }, e.status === 401 ? ERR.session : "Run penthera ui and open the one-time link it prints. The link works once."),
    ));
  }
})();
