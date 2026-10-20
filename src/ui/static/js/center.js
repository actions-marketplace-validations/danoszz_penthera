// The centre window: the document you are looking at. A project (or all of
// them) is a header and five tabs :: Findings, Dependencies, AI tooling,
// History, Proof. A run is a transcript of tool output with inline Apply /
// Skip / Stop. Runs start from the New scan dialog, not from here.
import { h, clear, empty, sevBadge, diffBlock, announce } from "./dom.js";
import { api } from "./api.js";
import { state, set, projectOf, TABS } from "./state.js";
import { createTyper } from "./typer.js";
import { stackedBar, sparkline, wordmark } from "./charts.js";
import { ago, duration, shortProject, plural, SEVERITIES } from "./format.js";
import { START, EMPTY } from "./copy.js";
import { depsTab, aiTab, historyTab, proofTab } from "./panels.js";

const SEV_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

// ── Stream state that outlives a redraw: the live run's typer and SSE ──
let typer = null;
let es = null;
let pending = null;
let visible = [];

export function stopStream() {
  es?.close();
  es = null;
  typer?.stop();
  typer = null;
}

export function renderCenter(el, ctx) {
  const { toggleLeft, toggleRight } = ctx;
  const search = h("input", { type: "search", id: "q", placeholder: "Search  /", "aria-label": "Search findings", value: state.query });
  search.addEventListener("input", () => { set({ query: search.value }); });
  const title = state.sel.kind === "all" ? "All projects"
    : state.sel.kind === "project" ? shortProject(state.sel.key)
      : state.sel.kind === "run" ? `Run :: ${state.sel.run?.kind || ""}` : "Fix loop run";
  const doc = state.sel.kind === "all" || state.sel.kind === "project";
  const toolbar = h("div", { class: "win-bar" },
    h("button", { type: "button", class: "icon", "aria-label": "Show or hide the projects window ([)", title: "Projects  [", onclick: toggleLeft }, "☰"),
    h("span", { class: "title" }, title),
    h("span", { class: "grow" }),
    doc && state.tab === "findings" ? search : null,
    h("button", { type: "button", class: "icon", "aria-label": "Show or hide the inspector (])", title: "Inspector  ]", onclick: toggleRight }, "◫"),
  );
  const stream = h("div", { class: "stream pane-body", id: "stream" });
  const col = h("div", { class: "col" });
  stream.append(col);
  clear(el).append(toolbar, stream);

  if (state.sel.kind === "run") return runView(col, ctx);
  stopStream();
  if (state.sel.kind === "past") return pastRunView(col, ctx);
  return projectView(col, ctx);
}

/** Re-render only the findings list (search typing must not rebuild the toolbar). */
export function refreshList(ctx) {
  const list = document.getElementById("findings-list");
  if (list) fillFindings(list, ctx);
}

// ── Project (or all projects) ──────────────────────────────────────────

function projectView(col, ctx) {
  const o = state.overview;
  if (!o) return;
  const all = state.sel.kind === "all";
  const key = state.sel.key;
  const p = all ? null : projectOf(key);

  if (!o.projects.length && all) return startView(col, ctx);
  if (!all && !p) return notScannedView(col, key, ctx);

  const counts = all ? o.mix : p.counts;
  const open = all ? o.open : p.open;
  const fixed = all ? o.fixed : p.fixed;
  const trend = all ? combinedTrend(o.projects) : p.trend.map((t) => t.total);
  col.append(h("header", { class: "head" },
    h("span", { class: `grade lg grade-${all ? "x" : p.grade}`, title: all ? "" : `score ${p.score}/100` }, all ? "∑" : p.grade),
    h("h1", { title: key || "" }, all ? "All projects" : shortProject(key)),
    h("div", { class: "meta" }, all ? `${plural(o.projects.length, "project")} · newest scan ${ago(o.lastScans[0]?.ts)}` : `${p.mode || "scan"} · last scan ${ago(p.lastScan)} · ${plural(p.trend.length, "scan")}`),
    h("div", { class: "right-bits" },
      stackedBar(counts, { width: 24 }),
      sparkline(trend, { label: "open findings per scan" }),
      h("div", { class: "counts" }, h("b", {}, String(open)), " open · ", h("span", { class: "ok" }, String(fixed)), " fixed"),
    ),
  ));

  col.append(tabStrip(ctx));
  const panel = h("div", { class: "tab-panel", role: "tabpanel", id: `tab-${state.tab}`, "aria-labelledby": `tabbtn-${state.tab}` });
  col.append(panel);
  if (state.tab === "deps") return depsTab(panel);
  if (state.tab === "ai") return aiTab(panel);
  if (state.tab === "history") return historyTab(panel, all ? null : key);
  if (state.tab === "proof") return proofTab(panel, all ? null : key);

  // Since the last scan.
  const since = h("div");
  panel.append(since);
  if (!all && p.trend.length > 1) {
    api.get(`/api/history?project=${encodeURIComponent(key)}`).then((hst) => {
      if (state.sel.key !== key) return;
      since.append(h("section", { class: "section" },
        h("h2", {}, h("span", {}, "Since the last scan"), h("span", {}, `${hst.new.length} new · ${hst.fixed.length} fixed`)),
        h("div", { class: "cols2" },
          miniList(hst.new, "Nothing new."),
          miniList(hst.fixed, "Nothing fixed since the last scan.", true),
        )));
    }).catch(() => {});
  } else if (all && (o.columns.newest.length || o.columns.fixed.length)) {
    since.append(h("section", { class: "section" },
      h("h2", {}, h("span", {}, "Since the last scan"), h("span", {}, `${o.columns.newest.length} new · ${o.columns.fixed.length} fixed`)),
      h("div", { class: "cols2" }, miniList(o.columns.newest, "Nothing new."), miniList(o.columns.fixed, "Nothing fixed.", true))));
  }

  const list = h("ul", { class: "rows", id: "findings-list", "aria-label": "Findings" });
  panel.append(h("section", { class: "section" }, h("h2", {}, h("span", {}, "Findings"), h("span", { id: "findings-count" })), list));
  fillFindings(list, ctx);
}

/** Folder tabs: the selected one joins the page below it. Arrow keys move between them. */
function tabStrip(ctx) {
  const strip = h("div", { class: "tabs", role: "tablist", "aria-label": "Project views" });
  const btns = TABS.map((t, i) => {
    const b = h("button", {
      type: "button", role: "tab", class: "tab", id: `tabbtn-${t.id}`, "aria-selected": String(state.tab === t.id),
      "aria-controls": `tab-${t.id}`, tabindex: state.tab === t.id ? "0" : "-1", title: `${t.label}  ${t.key}`, onclick: () => ctx.openTab(t.id),
    }, t.label);
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const n = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
      ctx.openTab(n.id);
      queueMicrotask(() => document.getElementById(`tabbtn-${n.id}`)?.focus());
    });
    return b;
  });
  strip.append(...btns, h("span", { class: "tab-rest" }));
  return strip;
}

function fillFindings(list, ctx) {
  const all = state.sel.kind === "all";
  const q = state.query.trim().toLowerCase();
  const rows = state.findings
    .filter((f) => !f.suppressed && (all || f.project === state.sel.key))
    .filter((f) => !q || `${f.title} ${f.category} ${f.location} ${f.project}`.toLowerCase().includes(q))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.title.localeCompare(b.title));
  visible = rows;
  clear(list);
  let group = null;
  for (const f of rows) {
    const fixFirst = f.severity === "critical" || f.severity === "high";
    const g = fixFirst ? "Fix first" : "Then";
    if (g !== group) {
      group = g;
      list.append(h("li", { class: "group-h" }, g === "Fix first" ? `Fix first :: ${rows.filter((x) => x.severity === "critical" || x.severity === "high").length}` : `Then :: ${rows.filter((x) => !(x.severity === "critical" || x.severity === "high")).length}`));
    }
    const cur = state.finding && state.finding.id === f.id && state.finding.project === f.project;
    list.append(h("li", {}, h("button", {
      type: "button", class: ["row", fixFirst ? "b" : null], "aria-current": String(Boolean(cur)), dataset: { id: f.id, project: f.project },
      onclick: () => ctx.openFinding(f),
    },
    sevBadge(f.severity),
    h("span", { class: "t" }, f.title),
    h("span", { class: "tag" }, all ? shortProject(f.project) : f.category || ""),
    f.location ? h("span", { class: "where" }, f.location) : null)));
  }
  if (!rows.length) list.append(h("li", {}, empty(state.findings.length && q ? `${EMPTY.filtered}` : EMPTY.findings)));
  const count = document.getElementById("findings-count");
  if (count) count.textContent = q ? `${rows.length} match` : plural(rows.length, "open finding");
}

/** j / k: move the selection and open the finding in the right panel. */
export function moveFinding(step, ctx) {
  if (!visible.length) return;
  const i = visible.findIndex((f) => state.finding && f.id === state.finding.id && f.project === state.finding.project);
  const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + step))];
  ctx.openFinding(next);
  const btn = document.querySelector(`#findings-list .row[data-id="${next.id}"]`);
  btn?.focus({ preventScroll: false });
}

function miniList(rows, none, fixed = false) {
  return rows.length
    ? h("ul", { class: "mini" }, rows.slice(0, 8).map((r) => h("li", {}, h("span", { class: `sw sev-${r.severity}`, "aria-hidden": "true" }), h("span", { class: ["grow", fixed ? "muted" : null] }, fixed ? `✓ ${r.title}` : r.title))))
    : h("p", { class: "empty" }, none);
}

function combinedTrend(projects) {
  const len = Math.max(0, ...projects.map((p) => p.trend.length));
  const out = [];
  for (let i = 0; i < len; i++) out.push(projects.reduce((n, p) => n + ((p.trend[p.trend.length - len + i] || p.trend[0])?.total || 0), 0));
  return out;
}

function startView(col, ctx) {
  col.append(h("div", { class: "start" },
    wordmark(),
    h("p", { class: "muted" }, START.gate),
    h("h1", {}, START.title),
    h("p", {}, START.intro),
    h("div", { class: "steps" }, START.steps.map((st, i) => h("div", { class: "step" },
      h("span", { class: "n" }, `${i + 1}.`),
      h("h3", {}, st.title),
      h("button", { type: "button", class: "btn", onclick: () => ctx.newScan(st.kind) }, `${st.title}…`),
      h("p", {}, st.body)))),
    h("p", { class: "muted" }, `${START.demo} `, h("code", {}, "penthera ui --demo"), "."),
  ));
}

function notScannedView(col, key, ctx) {
  col.append(h("div", { class: "start" },
    h("h1", {}, shortProject(key)),
    h("p", { class: "muted" }, key),
    h("p", {}, "Not scanned yet. Start with a scan of this folder; it reads only what is inside it."),
    h("div", { class: "actions start" }, h("button", { type: "button", class: "btn primary", onclick: () => ctx.newScan("scan", key) }, "New scan…")),
  ));
}

// ── A live run, as a transcript ─────────────────────────────────────────

function runView(col, ctx) {
  const run = state.sel.run;
  if (!run) return;
  const status = h("span", { class: "chip" }, run.status);
  const stop = h("button", { type: "button", class: "btn small", disabled: run.status !== "running" }, "Stop");
  const lines = h("div", { class: "transcript", role: "log", "aria-live": "off", "aria-label": "Run output" });
  const tail = h("div");
  col.append(
    h("div", { class: "run-head" },
      h("h1", {}, `${({ scan: "Scan", deps: "Dependency check", agents: "AI tooling audit", loop: "Fix loop" })[run.kind] || run.kind}`),
      h("span", { class: "muted" }, `${shortProject(run.repo || run.url)}${run.url && run.repo ? ` + ${run.url}` : ""} · ${ago(run.startedAt)}`),
      h("span", { class: "grow" }), status, stop),
    lines, tail,
  );
  const setStatus = (st) => {
    status.textContent = st;
    status.className = `chip ${st === "running" ? "on" : st === "awaiting you" ? "blue" : st === "error" ? "inv" : ""}`;
    stop.disabled = !(st === "running" || st === "awaiting you");
  };
  setStatus(run.status === "running" ? "running" : run.status);
  stop.addEventListener("click", async () => {
    stop.disabled = true;
    try { await api.post(`/api/runs/${run.id}/stop`); } catch (e) { typer?.push(`error: ${e.message}`, "bad"); }
  });

  stopStream();
  typer = createTyper(lines);
  pending = null;
  es = new EventSource(`/api/runs/${run.id}/stream`);
  const scroll = () => { const st = document.getElementById("stream"); if (st) st.scrollTop = st.scrollHeight; };
  const onEvent = (ev) => {
    const d = ev.data;
    switch (ev.type) {
      case "log": {
        const t = d.text.replace(/^\n/, "");
        const cls = /^penthera /.test(t) ? "cmd" : /verified and committed|done:|^(scan|deps|agents) done/.test(t) ? "ok"
          : /failed verification|^error|not applied/.test(t) ? "bad" : /^\s*iteration \d+/.test(t) ? "hl" : /^\s{3,}/.test(t) || /\.\.\.$/.test(t) ? "dim" : null;
        typer.push(cls === "dim" || cls === "bad" ? t.trim() : t, cls);
        break;
      }
      case "approval": {
        pending = d;
        set({ pending: { index: d.index, total: d.total } });
        typer.flush();
        tail.append(approvalDialog(run, d, typer));
        setStatus("awaiting you");
        scroll();
        announce(`Fix ${d.index} of ${d.total} is waiting for you: ${d.plan.title}`);
        break;
      }
      case "decision": {
        pending = null;
        set({ pending: null });
        clear(tail);
        setStatus("running");
        break;
      }
      case "status": {
        if (d.status === "running") break;
        if (state.pending) set({ pending: null });
        setStatus(d.status);
        clear(tail);
        const sum = d.summary;
        if (sum?.totals) {
          const t = sum.totals;
          typer.push(`done: ${sum.stopReason} after ${plural(t.iterations, "round")} (${duration(sum.durationMs)})`, "ok");
          typer.push(`${t.verified} verified and committed :: ${t.failed} failed and reverted :: ${t.declined} skipped${sum.branch ? ` :: branch ${sum.branch}` : ""}`, t.failed ? "bad" : "ok");
        }
        tail.append(h("div", { class: "actions" },
          run.repo || run.url ? h("button", { type: "button", class: "btn primary", onclick: () => ctx.refresh().then(() => set({ sel: { kind: "project", key: run.repo || run.url } })) }, "Open the project ▸") : null));
        ctx.refresh();
        announce(`Run ${d.status}`);
        break;
      }
      default: break;
    }
  };
  for (const type of ["log", "approval", "decision", "status"]) {
    es.addEventListener(type, (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* malformed event */ } });
  }
  es.addEventListener("end", () => { es?.close(); es = null; });
}

function approvalDialog(run, d, ty) {
  const p = d.plan;
  const decide = async (answer, box) => {
    for (const b of box.querySelectorAll("button")) b.disabled = true;
    try {
      await api.post(`/api/runs/${run.id}/decision`, { approvalId: d.approvalId, answer });
    } catch (e) {
      ty.push(`error: ${e.message}`, "bad");
      for (const b of box.querySelectorAll("button")) b.disabled = false;
    }
  };
  const box = h("section", { class: "dialog", role: "alertdialog", "aria-labelledby": "ap-h", "aria-describedby": "ap-d" });
  const apply = h("button", { type: "button", class: "btn primary", onclick: () => decide("approve", box) }, "Apply", h("span", { class: "k" }, "y"));
  box.append(
    h("div", { class: "dialog-bar" }, h("span", {}, `Fix ${d.index} of ${d.total}`)),
    h("div", { class: "dialog-body" },
      h("h3", { id: "ap-h" }, p.title),
      h("p", { id: "ap-d", class: "muted" }, `${p.recipe}${p.framework ? ` (${p.framework})` : ""} · ${p.files.join(", ")} · ${d.memory ? `memory: ${d.memory.verified} verified, ${d.memory.failed} failed` : "no history for this recipe yet"}`),
      h("div", {}, p.findings.map((f) => h("div", {}, sevBadge(f.severity), " ", h("span", { class: "t1" }, f.title)))),
      diffBlock(p.diff),
      p.redacted ? h("p", { class: "muted" }, "Secret values are masked here; the real patch uses them.") : null,
      h("div", { class: "actions" },
        h("button", { type: "button", class: "btn", onclick: () => decide("stop", box) }, "Stop", h("span", { class: "k" }, "q")),
        h("button", { type: "button", class: "btn", onclick: () => decide("skip", box) }, "Skip", h("span", { class: "k" }, "n")),
        apply),
    ),
  );
  queueMicrotask(() => apply.focus({ preventScroll: true }));
  return box;
}

/** y / n / q while a diff waits. */
export function answerPending(key) {
  if (!pending) return false;
  const btns = document.querySelectorAll(".dialog .actions button");
  const i = { q: 0, n: 1, y: 2 }[key];
  if (i == null || !btns[i] || btns[i].disabled) return false;
  btns[i].click();
  return true;
}

// ── A past loop run, rebuilt from its loopRun ───────────────────────────

function pastRunView(col, ctx) {
  const l = state.sel.past;
  if (!l) return;
  col.append(
    h("div", { class: "run-head" }, h("h1", {}, "Fix loop"), h("span", { class: "muted" }, `${shortProject(l.target.repo)} · ${ago(l.startedAt)} · ${duration(l.durationMs)}`)),
    h("div", { class: "transcript" },
      h("div", { class: "ln cmd" }, `penthera agent --loop --repo ${l.target.repo}${l.target.url ? ` --url ${l.target.url}` : ""}`),
      l.iterations.flatMap((it) => [
        h("div", { class: "ln hl" }, `iteration ${it.n}`),
        it.findings ? h("div", { class: "ln dim" }, `scan: ${it.findings.total} findings (${it.findings.suppressed} suppressed), ${it.findings.fixable} fixable`) : null,
        ...it.fixes.map((f) => h("div", { class: `ln ${f.status === "verified" ? "ok" : f.status === "failed" ? "bad" : "dim"}` },
          `${f.status === "verified" ? "OK " : f.status === "failed" ? "!! " : "-- "}${f.title} :: ${f.decision}${f.commit ? ` :: ${f.commit.slice(0, 10)}` : ""}`)),
      ]),
      h("div", { class: "ln ok" }, `done: ${l.stopReason} :: ${l.totals.verified} verified, ${l.totals.failed} failed, ${l.totals.declined + l.totals.skipped} skipped`),
      h("div", { class: "ln" }, `branch ${l.branch} :: nothing was pushed`),
    ),
    h("div", { class: "actions" }, h("button", { type: "button", class: "btn", onclick: () => set({ sel: { kind: "project", key: l.target.repo } }) }, "Open the project ▸")),
  );
}
