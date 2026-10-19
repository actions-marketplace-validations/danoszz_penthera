// penthera ui: hash router, keyboard shortcuts, shell chrome.
import { h, clear, announce } from "./dom.js";
import { api } from "./api.js";
import { typeInto } from "./typer.js";
import * as overview from "./views/overview.js";
import * as findings from "./views/findings.js";
import * as agent from "./views/agent.js";
import * as deps from "./views/deps.js";
import * as ai from "./views/ai.js";
import * as evidence from "./views/evidence.js";
import * as settings from "./views/settings.js";

const VIEWS = { overview, findings, agent, deps, ai, evidence, settings };
const ORDER = Object.keys(VIEWS);
const TITLES = { overview: "Overview", findings: "Findings", agent: "Agent", deps: "Dependencies", ai: "AI tooling", evidence: "Evidence", settings: "Settings" };

const main = document.getElementById("main");
const ctx = { api, meta: null, go, params: new URLSearchParams() };
let cleanup = null;
let renderSeq = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [name, query = ""] = raw.split("?");
  return { name: VIEWS[name] ? name : "overview", params: new URLSearchParams(query) };
}

export function go(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${name}${q ? `?${q}` : ""}`;
}

async function render() {
  const seq = ++renderSeq;
  const { name, params } = parseHash();
  ctx.params = params;
  for (const a of document.querySelectorAll(".nav a")) {
    if (a.dataset.view === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  document.title = `${TITLES[name]} :: penthera ui`;
  document.querySelector("#prompt .path").textContent = `~/${name}`;
  typeInto(document.getElementById("prompt-cmd"), `penthera ui --view ${name}`);

  if (cleanup) { try { cleanup(); } catch { /* view already gone */ } cleanup = null; }
  clear(main);
  const root = h("div"); // no enter animation: screens switch from the keyboard (1-7)
  main.append(root);
  try {
    const c = await VIEWS[name].render(root, ctx);
    if (seq !== renderSeq) { c?.(); return; }
    cleanup = c || null;
  } catch (e) {
    if (seq !== renderSeq) return;
    clear(root).append(
      h("h1", {}, TITLES[name]),
      h("p", { class: "error", role: "alert" }, e.message),
      e.status === 401 ? h("p", { class: "muted" }, "The session ended. Restart penthera ui and open the new one-time URL.") : null,
    );
  }
  announce(`${TITLES[name]} screen`);
}

function chrome(meta) {
  const top = document.getElementById("top-meta");
  clear(top).append(
    meta.demo ? h("span", { class: "chip warn", title: "Fake data seeded by --demo" }, "DEMO DATA") : null,
    h("span", { class: meta.settings.offline ? "chip on" : "chip warn" }, meta.settings.offline ? "egress: offline" : "egress: target + sources"),
    h("span", { class: "chip" }, `v${meta.version}`),
  );
  const foot = document.getElementById("side-foot");
  const row = (k, v) => h("div", { class: "row" }, h("span", {}, k), h("span", { class: "v" }, v));
  clear(foot).append(
    row("bind", `${location.host}`),
    row("session", "cookie, strict"),
    row("network", "none"),
    row("telemetry", "none"),
  );
}

function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= ORDER.length) {
    e.preventDefault();
    go(ORDER[n - 1]);
    main.focus({ preventScroll: true });
  }
});

window.addEventListener("hashchange", render);

(async function boot() {
  try {
    ctx.meta = await api.get("/api/meta");
    chrome(ctx.meta);
  } catch (e) {
    clear(main).append(
      h("h1", {}, "Not signed in"),
      h("p", { class: "error", role: "alert" }, e.message),
      h("p", { class: "muted" }, "Run penthera ui and open the one-time URL it prints. The link works once."),
    );
    return;
  }
  ctx.refreshMeta = async () => { ctx.meta = await api.get("/api/meta"); chrome(ctx.meta); };
  render();
})();
