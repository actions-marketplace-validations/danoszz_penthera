// The menu bar: every action in one place, each with its shortcut written
// next to it, and the status on the right (offline or online, the live run,
// a diff waiting for you). The logo is the first menu, like the Apple menu:
// the horizontal wordmark when there is room, the P mark when there is not.
//
// Keyboard (WAI-ARIA menubar): Left / Right move between menus, Down or Enter
// opens one, Up / Down move inside it, Esc closes and returns to the title.
import { h, clear, announce } from "./dom.js";
import { api } from "./api.js";
import { state, set, TABS, currentProject, liveRun } from "./state.js";
import { shortProject } from "./format.js";

let openIdx = -1;

export function renderMenubar(el, ctx) {
  const project = currentProject() || state.overview?.projects?.[0]?.key || "";
  const scanned = state.overview?.projects?.some((p) => p.key === project);
  const run = liveRun();
  const inDoc = state.sel.kind === "all" || state.sel.kind === "project";
  const report = (a) => ({ label: `Download ${a} report`, href: scanned ? `/api/report?${new URLSearchParams({ project, audience: a })}` : null, disabled: !scanned });

  const menus = [
    { id: "app", label: "Penthera", logo: true, items: [
      { label: "About Penthera…", run: () => ctx.about() },
      { label: "Settings…", run: () => set({ right: "settings" }), key: "" },
      "-",
      { label: "Light theme", check: ctx.theme.get() === "light", run: () => ctx.setTheme("light") },
      { label: "Dark theme", check: ctx.theme.get() === "dark", run: () => ctx.setTheme("dark") },
    ] },
    { id: "file", label: "File", items: [
      { label: "New scan…", key: "n", run: () => ctx.newScan() },
      "-",
      { label: "All projects", run: () => set({ sel: { kind: "all", key: null } }) },
      { label: "Close the detail", key: "Esc", disabled: state.right === "none", run: () => set({ right: "none", finding: null }) },
    ] },
    { id: "scan", label: "Scan", items: [
      { label: "Scan a site or folder…", run: () => ctx.newScan("scan") },
      { label: "Check dependencies…", run: () => ctx.newScan("deps") },
      { label: "Audit AI tooling…", run: () => ctx.newScan("agents") },
    ] },
    { id: "fix", label: "Fix", items: [
      { label: "Run the fix loop…", run: () => ctx.newScan("loop") },
      { label: "Show the running run", disabled: !run, run: () => set({ sel: { kind: "run", key: run.id, run } }) },
      { label: "Stop the run", disabled: !run, run: () => api.post(`/api/runs/${run.id}/stop`).then(() => announce("Stopping after the current step")) },
    ] },
    { id: "evidence", label: "Evidence", items: [
      { label: `Proof for ${shortProject(project)}`, disabled: !project, key: "5", run: () => ctx.openTab("proof", project) },
      "-",
      report("auditor"), report("owner"), report("developer"),
    ] },
    { id: "view", label: "View", items: [
      { label: "Projects window", key: "[", check: ctx.panels.left, run: ctx.toggleLeft },
      { label: "Inspector window", key: "]", check: ctx.panels.right, run: ctx.toggleRight },
      { label: "Search findings", key: "/", disabled: !inDoc, run: () => { ctx.openTab("findings"); queueMicrotask(() => document.getElementById("q")?.focus()); } },
      "-",
      ...TABS.map((t) => ({ label: t.label, key: t.key, check: inDoc && state.tab === t.id, disabled: !inDoc, run: () => ctx.openTab(t.id) })),
    ] },
  ];

  const titles = [];
  const bar = h("ul", { class: "menus", role: "menubar", "aria-label": "Menu bar" });
  menus.forEach((m, i) => {
    const pop = h("ul", { class: "menu", role: "menu", "aria-label": m.label, hidden: i !== openIdx });
    const title = h("button", {
      type: "button", class: ["menu-title", m.logo ? "logo" : null], role: "menuitem", "aria-haspopup": "menu", "aria-expanded": String(i === openIdx),
      tabindex: i === 0 ? "0" : "-1", "aria-label": m.logo ? "Penthera menu" : null,
    }, m.logo ? [h("span", { class: "logotype", "aria-hidden": "true" }), h("span", { class: "mark", "aria-hidden": "true" })] : m.label);
    titles.push(title);
    for (const it of m.items) {
      if (it === "-") { pop.append(h("li", { role: "separator", class: "sep" })); continue; }
      const kids = [h("span", { class: "check", "aria-hidden": "true" }, it.check ? "✓" : ""), h("span", { class: "grow" }, it.label), it.key ? h("kbd", {}, it.key) : null];
      const role = it.check != null ? "menuitemcheckbox" : "menuitem";
      const item = it.href
        ? h("a", { class: "menu-item", role, href: it.href, download: "", tabindex: "-1" }, kids)
        : h("button", { type: "button", class: "menu-item", role, tabindex: "-1", disabled: it.disabled || null, "aria-checked": it.check != null ? String(it.check) : null }, kids);
      if (it.disabled && it.href == null) item.setAttribute("aria-disabled", "true");
      item.addEventListener("click", () => { close(); if (!it.href) it.run?.(); });
      pop.append(h("li", { role: "none" }, item));
    }
    title.addEventListener("click", () => (openIdx === i ? close() : open(i)));
    title.addEventListener("pointerenter", () => { if (openIdx !== -1 && openIdx !== i) open(i, false); });
    title.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const n = (i + (e.key === "ArrowRight" ? 1 : -1) + menus.length) % menus.length;
        if (openIdx !== -1) open(n); else { titles[n].focus(); roving(n); }
      } else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(i);
      }
    });
    pop.addEventListener("keydown", (e) => {
      const items = [...pop.querySelectorAll(".menu-item:not([disabled])")];
      const at = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        open((i + (e.key === "ArrowRight" ? 1 : -1) + menus.length) % menus.length);
      } else if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") e.preventDefault();
        close();
        titles[i].focus();
      }
    });
    bar.append(h("li", { role: "none", class: "menu-wrap" }, title, pop));
  });

  function roving(n) { titles.forEach((t, j) => t.setAttribute("tabindex", j === n ? "0" : "-1")); }
  function open(i, focusFirst = true) {
    openIdx = i;
    bar.querySelectorAll(".menu").forEach((p, j) => { p.hidden = j !== i; });
    titles.forEach((t, j) => t.setAttribute("aria-expanded", String(j === i)));
    roving(i);
    titles[i].focus();
    if (focusFirst) bar.querySelectorAll(".menu")[i].querySelector(".menu-item:not([disabled])")?.focus();
  }
  function close() {
    openIdx = -1;
    bar.querySelectorAll(".menu").forEach((p) => { p.hidden = true; });
    titles.forEach((t) => t.setAttribute("aria-expanded", "false"));
  }
  menubarClose = close;

  // Status, right-aligned: the live run, then egress.
  const offline = state.meta?.settings?.offline !== false;
  const egress = h("button", { type: "button", class: "status", role: "switch", "aria-checked": String(offline), title: offline ? "Scans started here contact only their target. Click to go online." : "Scans may also contact recon sources. Click to go offline." },
    h("span", { class: ["lamp", offline ? null : "on"], "aria-hidden": "true" }), offline ? "Offline" : "Online");
  egress.addEventListener("click", async () => {
    const s = await api.post("/api/settings", { offline: !offline }).catch(() => null);
    if (!s) return;
    state.meta.settings = s;
    set({ meta: state.meta });
    announce(`Offline ${s.offline ? "on" : "off"}`);
  });
  const waiting = state.pending;
  const runStatus = run
    ? h("button", { type: "button", class: ["status", waiting ? "waiting" : null], onclick: () => set({ sel: { kind: "run", key: run.id, run } }) },
      h("span", { class: "lamp live", "aria-hidden": "true" }),
      waiting ? `Fix ${waiting.index} of ${waiting.total} waiting for you` : `${({ scan: "Scan", deps: "Dependencies", agents: "AI tooling", loop: "Fix loop" })[run.kind] || run.kind} running`)
    : null;

  clear(el).append(bar, h("span", { class: "grow" }),
    h("div", { class: "statuses", role: "status", "aria-live": "polite" }, runStatus, egress,
      state.meta?.demo ? h("span", { class: "status dim" }, "demo") : null));
}

let menubarClose = () => {};
/** Close any open menu (a click elsewhere, or Esc from the page). Returns true if one was open. */
export function closeMenus() {
  if (openIdx === -1) return false;
  menubarClose();
  return true;
}
