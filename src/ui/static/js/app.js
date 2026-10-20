// penthera ui: one view. Left: projects and runs. Centre: the selected project
// or run. Right: cards, or the open finding, or settings.
import { h, clear, announce } from "./dom.js";
import { api, signIn } from "./api.js";
import { patternDefs } from "./charts.js";
import { state, set, on } from "./state.js";
import { renderLeft } from "./left.js";
import { renderCenter, renderBar, refreshList, moveFinding, answerPending } from "./center.js";
import { renderRight } from "./right.js";
import { ERR } from "./copy.js";

const THEME_KEY = "penthera-ui-theme";
const PANELS_KEY = "penthera-ui-panels";
const app = document.getElementById("app");
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

// ── Side panels: [ and ] toggle; drawers below 1180px / 760px ──
const narrowRight = () => window.matchMedia("(max-width: 1180px)").matches;
const narrowLeft = () => window.matchMedia("(max-width: 760px)").matches;
function savedPanels() {
  try { return JSON.parse(localStorage.getItem(PANELS_KEY) || "null"); } catch { return null; }
}
function applyPanels({ left: l, right: r }) {
  app.classList.toggle("no-left", !l);
  app.classList.toggle("no-right", !r);
  scrim.hidden = !((r && narrowRight()) || (l && narrowLeft()));
  if (!narrowRight()) {
    try { localStorage.setItem(PANELS_KEY, JSON.stringify({ left: l, right: r })); } catch { /* per-viewer convenience only */ }
  }
}
const panels = { left: true, right: true, ...(savedPanels() || {}) };
if (narrowLeft()) panels.left = false;
if (narrowRight()) panels.right = false;
applyPanels(panels);
function toggleLeft() { panels.left = !panels.left; applyPanels(panels); }
function toggleRight() { panels.right = !panels.right; applyPanels(panels); }
scrim.addEventListener("click", () => {
  if (narrowLeft()) panels.left = false;
  if (narrowRight()) panels.right = false;
  applyPanels(panels);
});

// ── Context the renderers share ──
const ctx = {
  theme,
  toggleLeft,
  toggleRight,
  refresh,
  refreshMeta: async () => { state.meta = await api.get("/api/meta"); },
  redrawRight: () => renderRight(right, ctx),
  openFinding(f) {
    set({ finding: { id: f.id, project: f.project }, right: "finding" });
    if (!panels.right) { panels.right = true; applyPanels(panels); }
    for (const b of document.querySelectorAll("#findings-list .row")) {
      b.setAttribute("aria-current", String(b.dataset.id === f.id && b.dataset.project === f.project));
    }
  },
  focusBar(kind) {
    if (kind && kind !== state.mode) set({ mode: kind });
    if (narrowLeft() && panels.left) { panels.left = false; applyPanels(panels); }
    const input = document.getElementById("bar-input");
    (input && !input.disabled ? input : document.querySelector(".bar .btn.primary"))?.focus();
  },
};

async function refresh() {
  const [overview, findings, runs] = await Promise.all([api.get("/api/overview"), api.get("/api/findings"), api.get("/api/runs")]);
  set({ overview, findings: findings.findings, runs });
}

// ── Redraw on state changes, one column at a time ──
on((patch) => {
  const keys = Object.keys(patch);
  if (keys.includes("query") && keys.length === 1) { refreshList(ctx); return; }
  if (keys.some((k) => ["overview", "runs", "sel", "meta", "right"].includes(k))) renderLeft(left, { onNewScan: () => ctx.focusBar("scan"), toggleLeft, theme });
  if (keys.some((k) => ["overview", "findings", "sel", "mode"].includes(k))) {
    // A live transcript is rebuilt only when the selection changes; data refreshes redraw the bar.
    if (state.sel.kind === "run" && !keys.includes("sel")) renderBar(center, ctx);
    else renderCenter(center, ctx);
    if (keys.includes("sel") && narrowLeft() && panels.left) { panels.left = false; applyPanels(panels); }
  }
  if (keys.some((k) => ["sel", "right", "finding"].includes(k)) || (keys.includes("runs") && state.right === "cards")) {
    if (patch.openRight && !panels.right) { panels.right = true; applyPanels(panels); }
    renderRight(right, ctx);
  }
});

// ── Keyboard ──
function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape") {
    const q = document.getElementById("q");
    if (document.activeElement === q && q.value) { q.value = ""; set({ query: "" }); return; }
    if (state.right !== "cards") { set({ right: "cards", finding: null }); return; }
    if ((narrowRight() && panels.right) || (narrowLeft() && panels.left)) scrim.click();
    return;
  }
  if (isTyping(e)) return;
  if (answerPending(e.key)) { e.preventDefault(); return; }
  if (e.key === "/") { const q = document.getElementById("q"); if (q) { e.preventDefault(); q.focus(); } return; }
  if (e.key === "j" || e.key === "k") { e.preventDefault(); moveFinding(e.key === "j" ? 1 : -1, ctx); return; }
  if (e.key === "[") { e.preventDefault(); toggleLeft(); return; }
  if (e.key === "]") { e.preventDefault(); toggleRight(); }
});

(async function boot() {
  document.body.append(patternDefs());
  try {
    await signIn();
    state.meta = await api.get("/api/meta");
    await refresh();
    document.title = `penthera ui${state.meta.demo ? " :: demo" : ""}`;
  } catch (e) {
    clear(center).append(h("div", { class: "col" },
      h("h1", {}, "Not signed in"),
      h("p", { class: "bad", role: "alert" }, e.message),
      h("p", { class: "muted" }, e.status === 401 ? ERR.session : "Run penthera ui and open the one-time link it prints. The link works once."),
    ));
  }
})();
