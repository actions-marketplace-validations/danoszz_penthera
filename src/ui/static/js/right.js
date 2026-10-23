// The inspector: one finding in plain words with its evidence and fix, or
// settings, or a short note on what goes here. Nothing else lives on the right.
import { h, clear, empty, sevBadge, diffBlock } from "./dom.js";
import { api } from "./api.js";
import { state, set, simple, countsInView, currentProject } from "./state.js";
import { halftone, riskLevel } from "./charts.js";
import { SEVERITIES, shortProject } from "./format.js";
import { EMPTY, KEYS, SEV_WORD, AI, VERIFY } from "./copy.js";

let seq = 0;

export async function renderRight(el, ctx) {
  const my = ++seq;
  if (state.right === "finding" && state.finding) return findingView(el, ctx, my);
  if (state.right === "settings") return settingsView(el, ctx, my);
  return emptyView(el, ctx);
}

function head(title, ctx, extra, closable = true) {
  return h("div", { class: "win-bar" },
    closable ? h("button", { type: "button", class: "icon close-box", "aria-label": "Close (Esc)", title: "Close  Esc", onclick: () => set({ right: "none", finding: null }) }) : null,
    h("span", { class: "title" }, title),
    h("span", { class: "grow" }),
    extra || null,
    h("button", { type: "button", class: "icon", "aria-label": "Hide the inspector (])", title: "Hide the inspector  ]", onclick: ctx.toggleRight }, "⇥"));
}

// ── Nothing selected ────────────────────────────────────────────────────

function emptyView(el, ctx) {
  const counts = countsInView();
  const risk = riskLevel(counts);
  const said = counts ? SEVERITIES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(", ") : "";
  clear(el).append(
    head("Inspector", ctx, null, false),
    h("div", { class: "pane-body detail inspector-empty" },
      h("p", { class: "prose" }, EMPTY.inspector),
      simple() ? null : h("section", {}, h("p", { class: "label" }, "Keys"), h("dl", { class: "kv" }, KEYS.flatMap(([k, v]) => [h("dt", {}, h("kbd", {}, k)), h("dd", {}, v)]))),
      // The field: dark with dots when something serious is open, plain paper when nothing is.
      halftone({ risk, seed: currentProject() || "all projects", label: risk ? `Open risk: ${said}` : "Nothing open" }),
      h("p", { class: "muted field-note" }, risk ? "The darker this field, the more serious what is open." : "Nothing open: the field is clear."),
    ),
  );
}

// ── One finding ─────────────────────────────────────────────────────────

async function findingView(el, ctx, my) {
  const f = state.finding;
  clear(el).append(head("Finding", ctx), h("p", { class: "pad muted" }, "Reading evidence…"));
  let d;
  try { d = await api.get(`/api/findings/${f.id}?project=${encodeURIComponent(f.project)}`); } catch (e) {
    if (my === seq) clear(el).append(head("Finding", ctx), h("p", { class: "pad bad" }, e.message));
    return;
  }
  if (my !== seq) return;
  const x = d.explain || {};
  const section = (label, ...body) => h("section", {}, h("p", { class: "label" }, label), ...body);
  const canFix = d.fix && f.project.startsWith("/");
  if (simple()) {
    // Plain words first, one action, the detail folded away.
    const sure = { confirmed: "Penthera is sure about this one.", likely: "Penthera is fairly sure; worth checking.", "needs-human-review": "Penthera cannot be sure; a person should look." }[d.confidence] || "";
    clear(el).append(
      head("Problem", ctx),
      h("div", { class: "pane-body detail" },
        h("div", {}, h("span", { class: `sev sev-${d.severity}` }, SEV_WORD[d.severity] || d.severity)),
        h("h2", { tabindex: "-1" }, d.title),
        h("div", { class: "plain plate", "aria-label": "In plain words" },
          d.description ? h("p", {}, h("b", {}, "What is wrong :: "), d.description) : null,
          h("p", {}, h("b", {}, "How sure :: "), sure),
          x.fixText || d.remediation ? h("p", {}, h("b", {}, "What to do :: "), x.fixText || d.remediation) : null,
          h("p", {}, h("b", {}, "Check the fix :: "), VERIFY)),
        canFix
          ? h("div", { class: "actions start" }, h("button", { type: "button", class: "btn primary", onclick: () => ctx.newScan("loop", f.project) }, "Fix it for me…"),
            h("p", { class: "muted prose" }, "You will see the change and approve it first."))
          : h("p", { class: "muted prose" }, "Penthera has no automatic fix for this one. The steps above say what to change; a developer can do it in minutes."),
        h("details", { class: "more" }, h("summary", {}, "Show the details"),
          h("dl", { class: "kv" },
            h("dt", {}, "where"), h("dd", {}, d.location || "-"),
            h("dt", {}, "project"), h("dd", {}, f.project)),
          d.evidence ? section("Evidence", h("pre", { class: "block" }, d.evidence)) : null,
          d.fix ? section("The change", diffBlock(d.fix.diff)) : null,
          d.sources?.length ? section("Read more", h("ul", { class: "mini" }, d.sources.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.cite))))) : null),
      ),
    );
    return;
  }
  clear(el).append(
    head("Finding", ctx),
    h("div", { class: "pane-body detail" },
      h("div", {}, sevBadge(d.severity), " ", h("span", { class: "chip" }, d.confidence || "unrated"), " ", d.category ? h("span", { class: "chip" }, d.category) : null),
      h("h2", { tabindex: "-1" }, d.title),
      h("dl", { class: "kv" },
        h("dt", {}, "where"), h("dd", {}, d.location || "-"),
        h("dt", {}, "project"), h("dd", {}, f.project),
        h("dt", {}, "id"), h("dd", { class: "muted" }, d.id)),
      h("div", { class: "plain plate", "aria-label": "In plain words" },
        h("p", {}, h("b", {}, "In plain words :: "), (x.plainSeverity || d.severity) === "note" ? "a note, not a problem." : `a ${x.plainSeverity || d.severity} problem${d.category ? ` with ${d.category.replace(/-/g, " ")}` : ""}.`),
        x.confidenceMeaning ? h("p", {}, h("b", {}, `How sure (${x.confidence}) :: `), x.confidenceMeaning) : null,
        x.fixText ? h("p", {}, h("b", {}, "What to do :: "), x.fixText) : null,
        h("p", {}, h("b", {}, "Check the fix :: "), VERIFY),
        x.owasp?.length ? h("p", { class: "muted" }, `Maps to ${x.owasp.join(" · ")}`) : null),
      d.description ? section("What we saw", h("p", {}, d.description)) : null,
      d.evidence ? section("Evidence", h("pre", { class: "block" }, d.evidence)) : null,
      d.remediation ? section("How to fix", h("p", {}, d.remediation)) : null,
      d.sources?.length ? section("Sources", h("ul", { class: "mini" }, d.sources.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.cite))))) : null,
      d.fix ? section("Fix recipe",
        h("p", {}, h("span", { class: "chip" }, d.fix.recipe), ` :: ${d.fix.title}`),
        diffBlock(d.fix.diff),
        f.project.startsWith("/") ? h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: () => ctx.newScan("loop", f.project) }, "Fix it with the loop…")) : null)
        : section("Fix recipe", h("p", { class: "muted" }, "No recipe matches. Fix it by hand, or run the loop with a local model (--fix-model) from the CLI.")),
    ),
  );
}

// ── Settings (behind the gear) ──────────────────────────────────────────

async function settingsView(el, ctx, my) {
  const [settings, mem, aiLog] = await Promise.all([api.get("/api/settings"), api.get("/api/memory"), api.get("/api/ai-mode/consent").catch(() => ({ log: [] }))]);
  if (my !== seq) return;
  const radios = ["dark", "light"].map((t) => {
    const r = h("input", { type: "radio", name: "theme", value: t, checked: ctx.theme.get() === t });
    r.addEventListener("change", () => ctx.setTheme(t));
    return h("label", {}, r, h("span", {}, t === "dark" ? "Dark" : "Light"));
  });
  clear(el).append(
    head("Settings", ctx),
    h("div", { class: "pane-body detail" },
      h("section", {}, h("p", { class: "label" }, "Mode"),
        h("div", { class: "seg", role: "radiogroup", "aria-label": "Mode" }, ["simple", "advanced"].map((m) => {
          const r = h("input", { type: "radio", name: "ux", value: m, checked: state.ux === m });
          r.addEventListener("change", () => ctx.setUx(m));
          return h("label", {}, r, h("span", {}, m === "simple" ? "Simple" : "Advanced"));
        })),
        h("p", { class: "muted prose" }, "Simple shows what to fix in plain words. Advanced adds dependencies, AI tooling, history, evidence and the raw detail."),
        h("div", { class: "actions start" }, h("button", { type: "button", class: "btn", onclick: () => ctx.setup() }, "Run setup again…"))),
      h("section", {}, h("p", { class: "label" }, "Theme"), h("div", { class: "seg", role: "radiogroup", "aria-label": "Theme" }, radios),
        h("p", { class: "muted" }, "Remembered in this browser. The first visit follows your system.")),
      h("section", {}, h("p", { class: "label" }, "Where data comes from"),
        h("dl", { class: "kv" },
          h("dt", {}, "reports"), h("dd", {}, state.meta.reportsDir),
          h("dt", {}, "memory"), h("dd", {}, state.meta.memoryRoot),
          h("dt", {}, "projects"), h("dd", {}, state.meta.projects.map((p) => h("div", {}, p)))),
        h("p", { class: "muted" }, "Only these folders and ~/.penthera are read. Add folders with penthera ui --project <dir>.")),
      h("section", {}, h("p", { class: "label" }, "Egress for scans started here"), h("p", {}, settings.offline ? "Offline: only the target." : "Online: target plus recon sources.")),
      h("section", {}, h("p", { class: "label" }, "AI mode"),
        h("p", { class: "muted prose" }, AI.settings),
        aiLog.log.length
          ? h("ul", { class: "mini" }, aiLog.log.slice(-10).reverse().map((e) => h("li", { class: "stacked" },
            h("span", {}, `${e.model} · ${e.route === "ollama-cloud" ? "ollama.com" : "this computer"}`),
            h("span", { class: "muted" }, `${shortProject(e.project || "")} · ${String(e.at || "").slice(0, 16).replace("T", " ")} · ${e.via}`))))
          : empty(AI.settingsEmpty)),
      h("section", {}, h("p", { class: "label" }, "Memory chains"),
        mem.projects.length ? h("ul", { class: "mini" }, mem.projects.map((p) => h("li", {}, h("span", { class: p.chain === "ok" ? "t1" : "bad" }, p.chain === "ok" ? "✓" : "[!]"), h("span", { class: "grow" }, p.label), h("span", { class: "muted" }, `${p.events} events`)))) : empty(EMPTY.memory)),
      h("section", {}, h("p", { class: "label" }, "Keys"), h("dl", { class: "kv" }, KEYS.flatMap(([k, v]) => [h("dt", {}, h("kbd", {}, k)), h("dd", {}, v)]))),
      h("section", {}, h("p", { class: "label" }, "Session"),
        h("p", { class: "muted" }, `127.0.0.1 only · one-time link swapped for a session kept in this tab only · Host and Origin checked · strict CSP · ${state.meta.demo ? "demo data" : "local reports"}`)),
    ),
  );
}
