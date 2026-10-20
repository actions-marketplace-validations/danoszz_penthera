// First-run setup: three screens in one window. Welcome, choose Simple or
// Advanced, then the project and a first check. Back is always there, the
// fraction says where you are, and closing it early keeps Simple mode.
import { h, announce } from "./dom.js";
import { api } from "./api.js";
import { state, set, folderFor } from "./state.js";
import { shortProject } from "./format.js";
import { SETUP } from "./copy.js";
import { openWindow } from "./dialog.js";

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|[a-z0-9-]+\.localhost)$/i;

export function setup(ctx) {
  const answers = { ux: state.ux || "simple", folder: folderFor(state.sel.kind === "project" ? state.sel.key : null), url: "" };
  const body = h("div", { class: "setup" });
  const progress = h("span", { class: "progress" });
  const win = openWindow({ title: "Set up Penthera", body, wide: true });
  win.el.querySelector(".win-bar").append(h("span", { class: "grow" }), progress);
  win.el.addEventListener("close", () => ctx.finishSetup(answers.ux), { once: true });
  let step = 0;

  const nav = (...right) => h("div", { class: "actions" },
    step > 0 ? h("button", { type: "button", class: "btn", onclick: () => go(step - 1) }, "◂ Back") : null,
    h("span", { class: "grow" }), ...right);

  function go(n) {
    step = n;
    progress.textContent = `${n + 1} / ${SETUP.steps}`;
    body.replaceChildren(...[welcome, mode, project][n]());
    body.querySelector("[data-first]")?.focus();
  }

  function welcome() {
    const w = SETUP.welcome;
    return [
      h("span", { class: "logotype xl", role: "img", "aria-label": "Penthera" }),
      h("h2", {}, w.title),
      ...w.body.map((p) => h("p", { class: "prose" }, p)),
      h("p", { class: "gate prose" }, w.gate),
      nav(h("button", { type: "button", class: "btn primary", "data-first": "", onclick: () => go(1) }, "Start ▸")),
    ];
  }

  function mode() {
    const m = SETUP.mode;
    const opt = (id, o) => {
      const input = h("input", { type: "radio", name: "ux", value: id, checked: answers.ux === id, "data-first": answers.ux === id ? "" : null });
      input.addEventListener("change", () => { answers.ux = id; });
      return h("label", { class: "choice big" }, input, h("span", {}, h("span", { class: "t1" }, o.title), h("span", { class: "note prose" }, o.body)));
    };
    return [
      h("h2", {}, m.title),
      h("fieldset", {}, h("legend", { class: "sr" }, m.title), h("div", { class: "choices" }, opt("simple", m.simple), opt("advanced", m.advanced))),
      h("p", { class: "muted prose" }, m.note),
      nav(h("button", { type: "button", class: "btn primary", onclick: () => { ctx.setUx(answers.ux); go(2); } }, "Next ▸")),
    ];
  }

  function project() {
    const p = SETUP.project;
    const folders = state.meta?.projects || [];
    const folder = h("select", { id: "su-folder", "data-first": "" }, folders.map((f) => h("option", { value: f, selected: f === answers.folder }, shortProject(f))));
    folder.addEventListener("change", () => { answers.folder = folder.value; });
    const url = h("input", { type: "text", id: "su-url", autocomplete: "off", spellcheck: "false", placeholder: "http://localhost:3000", value: answers.url });
    const confirm = h("input", { type: "text", id: "su-confirm", autocomplete: "off", spellcheck: "false" });
    const confirmQ = h("label", { for: "su-confirm", class: "prose" });
    const confirmRow = h("div", { class: "field confirm", hidden: true }, confirmQ, confirm);
    const err = h("p", { class: "err", role: "alert", hidden: true });
    url.addEventListener("input", () => {
      answers.url = url.value;
      let host = null;
      try { host = url.value.trim() ? new URL(/^[a-z]+:\/\//i.test(url.value) ? url.value : `http://${url.value}`).hostname : null; } catch { /* not a URL yet */ }
      const remote = Boolean(host && !LOCAL.test(host));
      confirmRow.hidden = !remote;
      if (remote) confirmQ.textContent = `${host} is not on this computer. Type its name to confirm it is yours or you may test it:`;
    });
    const check = h("button", { type: "button", class: "btn primary" }, `${p.check} ▸`);
    check.addEventListener("click", async () => {
      err.hidden = true;
      check.disabled = true;
      try {
        const r = await api.post("/api/runs", { kind: "scan", repo: folder.value, url: url.value, confirm: confirm.value, maxIterations: 5 });
        win.close();
        await ctx.refresh();
        set({ sel: { kind: "run", key: r.id, run: r } });
        announce("First check started");
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
        check.disabled = false;
      }
    });
    return [
      h("h2", {}, p.title),
      h("div", { class: "form" },
        h("div", { class: "field" }, h("label", { for: "su-folder" }, p.folder), folders.length ? folder : h("p", { class: "muted" }, "No folder given."), h("p", { class: "muted prose" }, p.folderNote)),
        h("div", { class: "field" }, h("label", { for: "su-url" }, p.url), url, h("p", { class: "muted prose" }, p.urlNote)),
        confirmRow, err),
      nav(h("button", { type: "button", class: "btn", onclick: win.close }, p.skip), check),
    ];
  }

  go(0);
}
