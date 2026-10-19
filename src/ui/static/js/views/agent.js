import { h, panel, clear, empty, diffBlock, announce, sevBadge } from "../dom.js";
import { createTyper } from "../typer.js";
import { bars } from "../charts.js";
import { ago, duration, pct, shortProject } from "../format.js";

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|[a-z0-9-]+\.localhost)$/i;

function hostOf(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`).hostname; } catch { return null; }
}

export async function render(root, { api, params, meta }) {
  const [{ live, past }, mem] = await Promise.all([api.get("/api/runs"), api.get("/api/memory")]);
  const projects = meta.projects || [];

  // ── Form ──
  const repo = h("input", { type: "text", id: "a-repo", list: "a-projects", autocomplete: "off", spellcheck: "false", value: params.get("repo") || projects[0] || "", placeholder: "/path/to/project" });
  const url = h("input", { type: "text", id: "a-url", autocomplete: "off", spellcheck: "false", placeholder: "http://localhost:3000 (optional)" });
  const confirmWrap = h("label", { class: "field c12", for: "a-confirm", hidden: true });
  const confirm = h("input", { type: "text", id: "a-confirm", autocomplete: "off", spellcheck: "false" });
  const confirmHint = h("span", { class: "hint" });
  confirmWrap.append(h("span", {}, "Confirm target"), confirm, confirmHint);
  const iters = h("input", { type: "number", id: "a-iter", min: "1", max: "50", value: "5" });
  const tests = h("input", { type: "checkbox", id: "a-tests" });
  const modeLoop = h("input", { type: "radio", name: "a-mode", value: "loop", checked: true });
  const modeScan = h("input", { type: "radio", name: "a-mode", value: "scan" });
  const start = h("button", { type: "submit", class: "btn go" }, "Run as agent ▸");
  const formErr = h("p", { class: "error", role: "alert", hidden: true });

  const syncConfirm = () => {
    const host = hostOf(url.value);
    const remote = host && !LOCAL.test(host);
    confirmWrap.hidden = !remote;
    if (remote) {
      confirm.placeholder = host;
      confirmHint.textContent = `${host} is not on this machine. Type the hostname to confirm you own it or have written permission to test it.`;
    }
    start.textContent = (modeScan.checked ? "Run scan ▸" : "Run as agent ▸");
  };
  url.addEventListener("input", syncConfirm);
  modeLoop.addEventListener("change", syncConfirm);
  modeScan.addEventListener("change", syncConfirm);

  const form = h("form", { class: "form-grid", novalidate: true },
    h("div", { class: "c12" }, h("div", { class: "seg", role: "radiogroup", "aria-label": "Mode" },
      h("label", {}, modeLoop, h("span", {}, "fix loop")),
      h("label", {}, modeScan, h("span", {}, "scan only")),
    )),
    h("label", { class: "field c6", for: "a-repo" }, h("span", {}, "Project folder"), repo, h("datalist", { id: "a-projects" }, projects.map((p) => h("option", { value: p })))),
    h("label", { class: "field c4", for: "a-url" }, h("span", {}, "Running app URL"), url),
    h("label", { class: "field c2", for: "a-iter" }, h("span", {}, "Max rounds"), iters),
    confirmWrap,
    h("div", { class: "c12 filters" },
      h("label", { class: "check", for: "a-tests" }, tests, "run the project's tests to verify"),
      h("span", { class: "faint" }, "always offline :: egress limited to the URL host :: local commits only, never pushed"),
    ),
    h("div", { class: "c12" }, start, formErr),
  );

  // ── Terminal ──
  const term = h("div", { class: "term", role: "log", "aria-live": "off", "aria-label": "Agent output", tabindex: "0" });
  const statusChip = h("span", { class: "chip" }, "idle");
  const stopBtn = h("button", { type: "button", class: "btn danger", disabled: true }, "Stop");
  const approvalSlot = h("div");
  const timeline = h("ol", { class: "timeline", "aria-label": "Iterations" });
  const runInfo = h("div", { class: "muted" });

  root.append(
    h("h1", {}, "Agent"),
    h("p", { class: "lede" }, "Run penthera agent --loop from here: it scans, proposes a fix, waits for you, applies it on a local branch, re-scans to verify, and learns. Nothing is pushed."),
    h("div", { class: "grid" },
      panel("Run", { class: "span-12" }, form),
      panel("Terminal", { class: "span-8" },
        h("div", { class: "term-head" }, runInfo, h("div", { class: "filters" }, statusChip, stopBtn)),
        term,
        approvalSlot,
      ),
      h("div", { class: "span-4 grid" },
        panel("Iterations", { class: "span-12" }, timeline),
        panel("Memory", { class: "span-12" }, memoryPanel(mem.projects)),
      ),
      panel("Past runs", { class: "span-12" }, pastRuns(past)),
    ),
  );

  let typer = createTyper(term);
  let es = null;
  let run = null;
  let pending = null;
  const its = new Map();

  typer.push("penthera agent ready. Enter a project folder and press Run.", "dim");
  typer.push("Every diff waits for you: [y] approve  [n] skip  [q] stop.", "dim");

  function setStatus(s) {
    statusChip.textContent = s;
    statusChip.className = `chip ${s === "running" ? "on" : s === "error" ? "bad" : s === "awaiting you" ? "blue" : ""}`;
    stopBtn.disabled = !(s === "running" || s === "awaiting you");
  }

  function itemFor(n, of) {
    if (!its.has(n)) {
      const fixes = h("ul", { class: "fixes" });
      const head = h("div", {}, h("span", { class: "ok" }, `round ${n}`), of ? h("span", { class: "faint" }, ` / ${of}`) : null);
      const sub = h("div", { class: "faint" }, "scanning…");
      const li = h("li", {}, head, sub, fixes);
      timeline.append(li);
      its.set(n, { li, sub, fixes, current: null });
    }
    return its.get(n);
  }
  let lastIt = null;

  function onEvent(ev) {
    const d = ev.data;
    switch (ev.type) {
      case "log": {
        const t = d.text;
        const cls = /^penthera /.test(t) ? "cmd" : /verified and committed|scan done/.test(t) ? "ok"
          : /failed verification|^error|not applied/.test(t) ? "bad" : /^\s*iteration \d+/.test(t) ? "hl" : /^\s{3,}/.test(t) ? "dim" : null;
        typer.push(t.replace(/^\n/, ""), cls);
        break;
      }
      case "iteration": lastIt = itemFor(d.n, d.of); break;
      case "scanned": if (lastIt) lastIt.sub.textContent = `${d.findings} findings, ${d.fixable} fixable, ${d.suppressed} suppressed`; break;
      case "approval": {
        pending = d;
        const it = itemFor(d.iteration);
        const li = h("li", {}, h("span", { class: "blue" }, "??"), h("span", { class: "t" }, d.plan.title));
        it.fixes.append(li);
        it.current = li;
        showApproval(d);
        setStatus("awaiting you");
        announce(`Diff ${d.index} of ${d.total} waiting for approval: ${d.plan.title}`);
        break;
      }
      case "decision": {
        pending = null;
        clear(approvalSlot);
        const it = lastIt || itemFor(1);
        const mark = { y: ["..", "muted"], n: ["--", "faint"], skip: ["~~", "faint"], quit: ["xx", "bad"] }[d.answer] || ["..", "muted"];
        if (it.current) { it.current.firstChild.textContent = mark[0]; it.current.firstChild.className = mark[1]; }
        if (d.answer !== "y") it.current = null;
        setStatus("running");
        break;
      }
      case "fix": {
        const it = lastIt;
        if (it?.current) {
          const [txt, cls] = d.status === "verified" ? ["OK", "ok"] : d.status === "failed" ? ["!!", "bad"] : ["--", "faint"];
          it.current.firstChild.textContent = txt;
          it.current.firstChild.className = cls;
          it.current = null;
        }
        break;
      }
      case "status": {
        if (d.status === "running") setStatus("running");
        else {
          setStatus(d.status);
          clear(approvalSlot);
          start.disabled = false;
          if (d.summary?.totals) {
            const t = d.summary.totals;
            typer.push(`done: ${d.summary.stopReason} after ${t.iterations} round${t.iterations === 1 ? "" : "s"} (${duration(d.summary.durationMs)})`, "cmd");
            typer.push(`${t.verified} verified, ${t.failed} failed and reverted, ${t.declined} skipped`, t.failed ? "bad" : "ok");
            for (const it of its.values()) if (it.sub.textContent === "scanning…") it.sub.textContent = "nothing left to fix";
          }
          announce(`Run ${d.status}`);
        }
        break;
      }
      default: break;
    }
  }

  function showApproval(d) {
    typer.flush();
    const p = d.plan;
    const decide = async (answer) => {
      for (const b of approvalSlot.querySelectorAll("button")) b.disabled = true;
      try {
        await api.post(`/api/runs/${run.id}/decision`, { approvalId: d.approvalId, answer });
      } catch (e) {
        typer.push(`error: ${e.message}`, "bad");
        for (const b of approvalSlot.querySelectorAll("button")) b.disabled = false;
      }
    };
    const approve = h("button", { type: "button", class: "btn go", onclick: () => decide("approve") }, "Approve", h("span", { class: "k" }, "[y]"));
    clear(approvalSlot).append(h("section", { class: "approval", "aria-labelledby": "ap-h" },
      h("h3", { id: "ap-h" }, `Diff ${d.iteration}.${d.index} of ${d.total} :: ${p.title}`),
      h("dl", { class: "kv" },
        h("dt", {}, "recipe"), h("dd", {}, `${p.recipe}${p.framework ? ` (${p.framework})` : ""}, confidence ${p.confidence}`),
        h("dt", {}, "files"), h("dd", {}, p.files.join(", ")),
        h("dt", {}, "fixes"), h("dd", {}, p.findings.map((f) => h("div", {}, sevBadge(f.severity), " ", f.title))),
        h("dt", {}, "memory"), h("dd", {}, d.memory ? `${d.memory.verified} verified, ${d.memory.failed} failed on this stack` : "no history for this recipe yet"),
      ),
      diffBlock(p.diff),
      p.redacted ? h("p", { class: "faint" }, "Secret values in this diff are masked here; the real patch uses them.") : null,
      h("div", { class: "actions" },
        approve,
        h("button", { type: "button", class: "btn", onclick: () => decide("skip") }, "Skip", h("span", { class: "k" }, "[n]")),
        h("button", { type: "button", class: "btn danger", onclick: () => decide("stop") }, "Stop", h("span", { class: "k" }, "[q]")),
      ),
    ));
    approve.focus({ preventScroll: true });
    approvalSlot.scrollIntoView({ block: "nearest" });
  }

  function attach(r) {
    run = r;
    runInfo.textContent = `${r.kind === "loop" ? "loop" : "scan"} :: ${r.repo ? shortProject(r.repo) : ""}${r.url ? ` + ${r.url}` : ""} :: started ${ago(r.startedAt)}`;
    es?.close();
    es = new EventSource(`/api/runs/${r.id}/stream`);
    for (const type of ["log", "iteration", "scanned", "approval", "decision", "fix", "status"]) {
      es.addEventListener(type, (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* malformed event */ } });
    }
    es.addEventListener("end", () => { es.close(); es = null; });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formErr.hidden = true;
    start.disabled = true;
    try {
      const r = await api.post("/api/runs", {
        kind: modeScan.checked ? "scan" : "loop", repo: repo.value, url: url.value, confirm: confirm.value,
        maxIterations: Number(iters.value), runTests: tests.checked,
      });
      typer.stop();
      clear(term);
      clear(timeline);
      its.clear();
      lastIt = null;
      typer = createTyper(term);
      attach(r);
    } catch (err) {
      formErr.textContent = err.message;
      formErr.hidden = false;
      start.disabled = false;
      if (err.status === 428) confirm.focus();
    }
  });

  stopBtn.addEventListener("click", async () => {
    if (!run) return;
    stopBtn.disabled = true;
    try { await api.post(`/api/runs/${run.id}/stop`); } catch (e) { typer.push(`error: ${e.message}`, "bad"); }
  });

  const onKey = (e) => {
    if (!pending || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
    const btns = approvalSlot.querySelectorAll(".actions button");
    const map = { y: 0, n: 1, q: 2 };
    if (e.key in map && btns[map[e.key]] && !btns[map[e.key]].disabled) { e.preventDefault(); btns[map[e.key]].click(); }
  };
  document.addEventListener("keydown", onKey);

  // Re-attach to a run that is still going (navigated away and back).
  const running = live.find((r) => r.status === "running");
  if (running) {
    start.disabled = true;
    typer.stop();
    clear(term);
    typer = createTyper(term);
    attach(running);
  }
  syncConfirm();

  return () => {
    es?.close();
    typer.stop();
    document.removeEventListener("keydown", onKey);
  };
}

function memoryPanel(projects) {
  if (!projects.length) return empty("No memory yet. Scans with --memory and loop runs write to ~/.penthera/memory.");
  const recipes = new Map();
  for (const p of projects) for (const r of p.recipes) {
    const cur = recipes.get(r.recipe) || { verified: 0, failed: 0 };
    cur.verified += r.verified;
    cur.failed += r.failed;
    recipes.set(r.recipe, cur);
  }
  const events = projects.reduce((n, p) => n + p.events, 0);
  const verified = projects.reduce((n, p) => n + p.verifiedFixes, 0);
  const failed = projects.reduce((n, p) => n + p.failedFixes, 0);
  const broken = projects.filter((p) => p.chain !== "ok");
  return h("div", {},
    h("dl", { class: "kv" },
      h("dt", {}, "projects"), h("dd", {}, String(projects.length)),
      h("dt", {}, "events"), h("dd", {}, String(events)),
      h("dt", {}, "chain"), h("dd", { class: broken.length ? "bad" : "ok" }, broken.length ? `${broken.length} broken: memory ignored there` : "intact (sha-256 hash chain)"),
      h("dt", {}, "fixes"), h("dd", {}, h("span", { class: "ok" }, `${verified} verified`), `, ${failed} failed`),
    ),
    h("p", { class: "label" }, "Recipe success"),
    bars([...recipes].map(([recipe, r]) => ({
      label: recipe, value: r.verified, cls: "ok",
    })), { width: 12, cls: () => "ok" }),
    h("p", { class: "panel-note" }, [...recipes].map(([recipe, r]) => `${recipe} ${pct(r.verified / Math.max(1, r.verified + r.failed))}`).join(" :: ")),
  );
}

function pastRuns(past) {
  if (!past.length) return empty("No loop runs in the reports folder yet.");
  return h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, ...["When", "Project", "Findings", "Verified", "Failed", "Skipped", "Stopped because", "Branch"].map((t, i) => h("th", { class: [i >= 3 && i <= 5 ? "num" : null, i === 7 ? "hide-narrow" : null] }, t)))),
    h("tbody", {}, past.map((l) => h("tr", {},
      h("td", { class: "muted" }, ago(l.startedAt)),
      h("td", { class: "trunc", title: l.target.repo || "" }, shortProject(l.target.repo)),
      h("td", {}, `${l.findings.initial ?? "?"} → ${l.findings.final ?? "?"}`),
      h("td", { class: "num ok" }, String(l.totals.verified)),
      h("td", { class: ["num", l.totals.failed ? "bad" : "faint"] }, String(l.totals.failed)),
      h("td", { class: "num faint" }, String(l.totals.declined + l.totals.skipped)),
      h("td", { class: "muted" }, l.stopReason || "-"),
      h("td", { class: "faint hide-narrow" }, l.branch || "-"),
    ))),
  ));
}
