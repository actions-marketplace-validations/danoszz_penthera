// Floating windows: the New scan dialog and About. A native <dialog> opened
// with showModal(), so focus is trapped, Esc closes it and the page behind is
// inert. Focus returns to whatever opened it.
import { h, announce } from "./dom.js";
import { api } from "./api.js";
import { state, set, folderFor, liveRun } from "./state.js";
import { shortProject } from "./format.js";
import { KINDS, NOTES, ABOUT } from "./copy.js";

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|[a-z0-9-]+\.localhost)$/i;

function hostOf(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`).hostname; } catch { return null; }
}

/** Open a modal window. Returns { el, close }. */
export function openWindow({ title, label, body, wide = false }) {
  const opener = document.activeElement;
  const dlg = h("dialog", { class: ["window", wide ? "wide" : null], "aria-label": label || title });
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.append(
    h("div", { class: "win-bar" },
      h("button", { type: "button", class: "icon close-box", "aria-label": "Close (Esc)", title: "Close  Esc", onclick: close }),
      h("span", { class: "title" }, title)),
    h("div", { class: "window-body" }, body),
  );
  dlg.addEventListener("close", () => {
    dlg.remove();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
  });
  // A click on the backdrop (the dialog element itself, outside its box) closes it.
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

/**
 * New scan: what to run, on which folder, against which URL. The hostname of
 * a URL that is not on this machine must be typed back before the run starts.
 */
export function newScan(ctx, { kind = "scan", project = null } = {}) {
  const selected = project ?? (state.sel.kind === "project" ? state.sel.key : null);
  const folders = state.meta?.projects || [];
  const busy = liveRun();

  const radios = KINDS.map((k) => {
    const input = h("input", { type: "radio", name: "kind", value: k.kind, checked: k.kind === kind });
    return h("label", { class: "choice" }, input,
      h("span", {}, h("span", { class: "t1" }, k.title), h("span", { class: "note prose" }, NOTES[k.kind])));
  });
  const kindNow = () => radios.map((r) => r.querySelector("input")).find((i) => i.checked)?.value || "scan";

  const folder = h("select", { id: "ns-folder", "aria-describedby": "ns-folder-note" },
    folders.map((f) => h("option", { value: f, selected: f === folderFor(selected) }, shortProject(f))));
  const url = h("input", { type: "text", id: "ns-url", autocomplete: "off", spellcheck: "false", placeholder: "http://localhost:3000" });
  if (selected && /^https?:/.test(selected)) url.value = selected;
  const urlRow = h("div", { class: "field" }, h("label", { for: "ns-url" }, "Running app URL ", h("span", { class: "muted" }, "(optional)")), url);

  const confirm = h("input", { type: "text", id: "ns-confirm", autocomplete: "off", spellcheck: "false" });
  const confirmQ = h("label", { for: "ns-confirm", class: "prose" });
  const confirmRow = h("div", { class: "field confirm", hidden: true }, confirmQ, confirm);

  const offline = h("input", { type: "checkbox", id: "ns-offline", checked: state.meta?.settings?.offline !== false });
  offline.addEventListener("change", async () => {
    const s = await api.post("/api/settings", { offline: offline.checked }).catch(() => null);
    if (!s) { offline.checked = !offline.checked; return; }
    state.meta.settings = s;
    set({ meta: state.meta });
    announce(`Offline ${s.offline ? "on" : "off"}`);
  });

  const err = h("p", { class: "err", role: "alert", hidden: true });
  const start = h("button", { type: "submit", class: "btn primary", disabled: Boolean(busy) });
  const cancel = h("button", { type: "button", class: "btn" }, "Cancel");

  const sync = () => {
    const k = kindNow();
    const def = KINDS.find((x) => x.kind === k);
    const usesUrl = k === "scan" || k === "loop";
    urlRow.hidden = !usesUrl;
    const host = usesUrl ? hostOf(url.value) : null;
    const remote = Boolean(host && !LOCAL.test(host));
    confirmRow.hidden = !remote;
    if (remote) confirmQ.textContent = `${host} is not on this machine. Type its name to confirm you own it or may test it:`;
    start.textContent = `${def.button} ▸`;
  };
  for (const r of radios) r.querySelector("input").addEventListener("change", sync);
  url.addEventListener("input", sync);

  const form = h("form", { class: "form", novalidate: true },
    h("fieldset", {}, h("legend", {}, "What to run"), h("div", { class: "choices" }, radios)),
    h("div", { class: "field" }, h("label", { for: "ns-folder" }, "Project folder"), folders.length ? folder : h("p", { class: "muted" }, "No folders. Start penthera ui with --project <dir>."),
      h("p", { id: "ns-folder-note", class: "muted prose" }, "Runs read and write only inside this folder.")),
    urlRow,
    confirmRow,
    h("label", { class: "check" }, offline, h("span", {}, h("span", { class: "t1" }, "Offline"), h("span", { class: "note prose" }, " :: contact only the target. Applies to every run started here."))),
    busy ? h("p", { class: "muted prose" }, "A run is in progress. Stop it or wait for it to finish first.") : null,
    err,
    h("div", { class: "actions" }, h("span", { class: "grow muted" }, "Only scan what you own or may test."), cancel, start),
  );
  const win = openWindow({ title: "New scan", body: form });
  cancel.addEventListener("click", win.close);
  sync();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    start.disabled = true;
    const k = kindNow();
    const usesUrl = k === "scan" || k === "loop";
    try {
      const r = await api.post("/api/runs", { kind: k, repo: folder.value || folderFor(selected), url: usesUrl ? url.value : "", confirm: confirm.value, maxIterations: 5 });
      win.close();
      await ctx.refresh();
      set({ sel: { kind: "run", key: r.id, run: r } });
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      start.disabled = false;
      if (ex.status === 428) confirm.focus();
    }
  });
  queueMicrotask(() => (radios.find((r) => r.querySelector("input").checked)?.querySelector("input"))?.focus());
}

/** About Penthera: the wordmark, the version and what this page is. */
export function about() {
  const body = h("div", { class: "about" },
    h("span", { class: "logotype xl", role: "img", "aria-label": "Penthera" }),
    h("p", { class: "prose" }, ABOUT.line),
    h("dl", { class: "kv" },
      h("dt", {}, "version"), h("dd", {}, `v${state.meta?.version || ""}${state.meta?.demo ? " · demo data" : ""}`),
      h("dt", {}, "license"), h("dd", {}, ABOUT.license),
      h("dt", {}, "type"), h("dd", {}, ABOUT.type)),
    h("p", { class: "muted prose" }, ABOUT.local),
  );
  const win = openWindow({ title: "About Penthera", body });
  const ok = h("button", { type: "button", class: "btn primary", onclick: win.close }, "OK");
  body.append(h("div", { class: "actions" }, ok));
  ok.focus();
}

