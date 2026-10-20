// The right panel: stacked cards (environment, memory, dependencies, AI
// tooling, evidence, changes), or one finding's detail, or settings.
import { h, clear, empty, sevBadge, diffBlock, announce } from "./dom.js";
import { api } from "./api.js";
import { state, set } from "./state.js";
import { bars, SHADE } from "./charts.js";
import { ago, shortProject, plural, pct } from "./format.js";
import { EMPTY, KEYS } from "./copy.js";

let seq = 0;

export async function renderRight(el, ctx) {
  const my = ++seq;
  if (state.right === "finding" && state.finding) return findingView(el, ctx, my);
  if (state.right === "settings") return settingsView(el, ctx, my);
  return cardsView(el, ctx, my);
}

function card(title, aside, open, ...body) {
  return h("details", { class: "card", open: open || null },
    h("summary", {}, h("span", {}, title), aside ? h("span", { class: "aside" }, aside) : null),
    h("div", { class: "card-body" }, ...body));
}

function head(title, ctx, extra) {
  return h("div", { class: "win-bar" },
    h("span", { class: "title" }, title),
    h("span", { class: "grow" }),
    extra || null,
    h("button", { type: "button", class: "icon", "aria-label": "Close (Esc)", title: "Close  Esc", onclick: () => set({ right: "cards", finding: null }) }, "×"));
}

// ── Cards ───────────────────────────────────────────────────────────────

async function cardsView(el, ctx, my) {
  const project = state.sel.kind === "project" ? state.sel.key : state.sel.kind === "past" ? state.sel.past?.target?.repo : state.sel.run?.repo || null;
  const [env, mem, deps, ai, ev, settings] = await Promise.all([
    api.get(`/api/env?project=${encodeURIComponent(project || "")}`),
    api.get("/api/memory"), api.get("/api/deps"), api.get("/api/ai"), api.get("/api/evidence"), api.get("/api/settings"),
  ]).catch((e) => { clear(el).append(h("p", { class: "pad error" }, e.message)); return []; });
  if (my !== seq || !env) return;

  clear(el).append(h("div", { class: "win-bar" }, h("span", { class: "title" }, "Details"), h("span", { class: "grow" }),
    h("button", { type: "button", class: "icon", "aria-label": "Hide the details panel (])", title: "Hide details  ]", onclick: ctx.toggleRight }, "⇥")),
  h("div", { class: "pane-body cards" },
    envCard(env, settings, project, ctx),
    memoryCard(mem.projects),
    depsCard(deps),
    aiCard(ai),
    evidenceCard(ev.bundles, project, ctx),
    changesCard(env, project),
  ));
}

function envCard(env, settings, project, ctx) {
  const sw = h("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(settings.offline) }, h("span", {}, "Offline"), h("span", { class: "state" }, settings.offline ? "on" : "off"));
  sw.addEventListener("click", async () => {
    const s = await api.post("/api/settings", { offline: sw.getAttribute("aria-checked") !== "true" });
    sw.setAttribute("aria-checked", String(s.offline));
    sw.lastChild.textContent = s.offline ? "on" : "off";
    announce(`Offline ${s.offline ? "on" : "off"}`);
    ctx.refreshMeta?.();
  });
  return card("Environment", settings.offline ? "offline" : "online", true,
    h("dl", { class: "kv" },
      h("dt", {}, "folder"), h("dd", {}, env.folder || (project ? "a URL target" : state.meta?.projects?.[0] || "-")),
      h("dt", {}, "branch"), h("dd", {}, env.branch ? `${env.branch}${env.head ? ` @ ${env.head}` : ""}` : "-"),
      h("dt", {}, "bound to"), h("dd", {}, `${location.host}, no network`),
    ),
    sw,
    h("p", { class: "muted" }, settings.offline ? "Scans started here contact only their target." : "Scans may also contact recon sources and fetch the Retire.js database."),
    env.hosts.length ? h("div", {},
      h("p", { class: "label" }, "Hosts the last scan contacted"),
      h("ul", { class: "mini" }, env.hosts.map((x) => h("li", {}, h("span", { class: x.thirdParty ? "t1" : "ok" }, x.thirdParty ? "3P" : "OK"), h("span", { class: "grow" }, x.host), h("span", { class: "muted" }, String(x.requests))))),
      env.blocked.length ? h("ul", { class: "mini" }, env.blocked.map((x) => h("li", {}, h("span", { class: "muted" }, "--"), h("span", { class: "grow muted" }, `${x.host} (blocked)`)))) : null,
    ) : null,
  );
}

function memoryCard(projects) {
  if (!projects.length) return card("Memory", "", false, empty(EMPTY.memory));
  const recipes = new Map();
  for (const p of projects) for (const r of p.recipes) {
    const c = recipes.get(r.recipe) || { verified: 0, failed: 0 };
    c.verified += r.verified;
    c.failed += r.failed;
    recipes.set(r.recipe, c);
  }
  const broken = projects.filter((p) => p.chain !== "ok");
  const ttf = projects.map((p) => p.medianTimeToFixDays).filter((x) => x != null);
  return card("Memory", broken.length ? `${broken.length} broken` : "chain ok", false,
    h("dl", { class: "kv" },
      h("dt", {}, "chain"), h("dd", { class: broken.length ? "bad" : "ok" }, broken.length ? `[!] broken in ${plural(broken.length, "project")} :: ignored there` : "[OK] sha-256 hash chain"),
      h("dt", {}, "events"), h("dd", {}, String(projects.reduce((n, p) => n + p.events, 0))),
      h("dt", {}, "fixes"), h("dd", {}, `${projects.reduce((n, p) => n + p.verifiedFixes, 0)} verified · ${projects.reduce((n, p) => n + p.failedFixes, 0)} failed`),
      h("dt", {}, "time to fix"), h("dd", {}, ttf.length ? `median ${Math.min(...ttf)}-${Math.max(...ttf)} days` : "-"),
    ),
    h("p", { class: "label" }, "Recipe success"),
    bars([...recipes].map(([recipe, r]) => ({ label: recipe, value: r.verified })), { width: 10 }),
    h("p", { class: "muted" }, [...recipes].map(([recipe, r]) => `${recipe} ${pct(r.verified / Math.max(1, r.verified + r.failed))}`).join(" · ")),
  );
}

const CAP_SEV = { "install-scripts": "high", obfuscated: "high", "ai-config-write": "critical", "ai-cli-invoke": "critical", "token-harvest": "critical" };

function depsCard(d) {
  const l = d.latest;
  if (!l) return card("Dependencies", "", false, empty(EMPTY.deps));
  const diff = l.diff;
  const gained = diff ? diff.upgraded.reduce((n, u) => n + u.gained.length, 0) + diff.added.reduce((n, a) => n + a.capabilities.length, 0) : 0;
  const chip = (id, plus) => h("span", { class: `chip ${CAP_SEV[id] ? "inv" : ""}` }, `${plus ? "+" : ""}${id}`);
  return card("Dependencies", `${l.ecosystem} · ${l.total} packages`, false,
    h("dl", { class: "kv" },
      h("dt", {}, "packages"), h("dd", {}, `${l.total} (${l.direct} direct) · ${l.lockfile}`),
      h("dt", {}, "diff"), h("dd", {}, diff ? `+${diff.added.length} added · ~${diff.upgraded.length} upgraded · -${diff.removed.length} removed vs ${diff.base}` : "no base compared"),
      h("dt", {}, "gained"), h("dd", {}, `${gained} capabilities`),
      h("dt", {}, "typosquats"), h("dd", { class: l.typosquats.length ? "bad" : null }, l.typosquats.length ? l.typosquats.map((t) => `${t.name} ~ ${t.similarTo}`).join(", ") : "none"),
    ),
    diff ? h("ul", { class: "mini" },
      diff.added.map((a) => h("li", { class: "stacked" }, h("span", {}, `+ ${a.name}@${a.version}`), h("span", { class: "chips" }, a.capabilities.slice(0, 4).map((c) => chip(c, true))))),
      diff.upgraded.filter((u) => u.gained.length).map((u) => h("li", { class: "stacked" }, h("span", {}, `${u.name} ${u.from} → ${u.to}`), h("span", { class: "chips" }, u.gained.slice(0, 4).map((c) => chip(c, true)))))) : null,
    h("p", { class: "label" }, "Capabilities in the tree"),
    bars(Object.entries(l.capabilityCounts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ label: id, value: n, ch: SHADE[CAP_SEV[id] || "low"] })), { width: 10 }),
    d.installs.length ? h("div", {},
      h("p", { class: "label" }, "Install firewall"),
      h("ul", { class: "mini" }, d.installs.slice(0, 5).map((i) => {
        const deny = i.changes.some((c) => c.deny.length) || i.action === "refused";
        return h("li", {}, h("span", { class: deny ? "bad" : i.clean ? "ok" : "t1" }, deny ? "REFUSED" : i.clean ? "CLEAN" : "APPROVED"), h("span", { class: "grow" }, i.specs.join(" ")), h("span", { class: "muted" }, ago(i.ts)));
      }))) : null,
  );
}

function aiCard(d) {
  const l = d.latest;
  if (!l) return card("AI tooling", "", false, empty(EMPTY.ai));
  const lock = l.lock || {};
  const drift = (lock.changed || 0) + (lock.added || 0) + (lock.removed || 0);
  return card("AI tooling", `grade ${l.grade}`, false,
    h("div", { class: "head" }, h("span", { class: `grade lg grade-${l.grade}` }, l.grade), h("div", {}, h("div", { class: "t1" }, `score ${l.score}/100`), h("div", { class: "muted" }, `${d.history.map((x) => x.grade).join(" → ")} · ${ago(l.ts)}`))),
    h("dl", { class: "kv" },
      h("dt", {}, "penthera.lock"), h("dd", { class: drift ? "bad" : null }, lock.status === "missing" ? "not pinned" : drift ? `${lock.changed || 0} changed · ${lock.added || 0} new · ${lock.removed || 0} removed` : "no drift"),
      h("dt", {}, "inventory"), h("dd", {}, `${l.inventory.skills || 0} skills · ${l.inventory.mcpServers || 0} MCP · ${l.inventory.hooks || 0} hooks`),
      h("dt", {}, "hidden content"), h("dd", { class: l.hidden.length ? "bad" : "ok" }, l.hidden.length ? `${l.hidden.length} hits` : "none"),
    ),
    l.hidden.length ? h("ul", { class: "mini" }, l.hidden.slice(0, 4).map((x) => h("li", {}, sevBadge(x.severity), h("span", { class: "grow" }, `${x.title} · ${x.location || ""}`)))) : null,
  );
}

function evidenceCard(bundles, project, ctx) {
  const target = project || state.overview?.projects?.[0]?.key || "";
  const msg = h("p", { class: "muted", "aria-live": "polite" });
  const out = h("div");
  const create = h("button", { type: "button", class: "btn", disabled: !target || !state.overview?.projects?.some((p) => p.key === target) }, "Create bundle");
  create.addEventListener("click", async () => {
    create.disabled = true;
    msg.textContent = "Writing the bundle and hashing every file…";
    try {
      const r = await api.post("/api/evidence/create", { project: target });
      const v = await api.post("/api/evidence/verify", { id: r.id });
      msg.textContent = `${r.path} :: ${v.ok ? "verified" : "verification failed"}`;
      ctx.redrawRight();
    } catch (e) { msg.textContent = e.message; create.disabled = false; }
  });
  const list = h("ul", { class: "mini" }, bundles.map((b) => {
    const res = h("span", { class: "muted" }, b.signed ? "signed" : "unsigned");
    const btn = h("button", { type: "button", class: "btn small" }, "Verify");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      res.textContent = "hashing…";
      const r = await api.post("/api/evidence/verify", { id: b.id }).catch((e) => ({ ok: false, problems: [e.message], files: [] }));
      res.textContent = r.ok ? "[OK]" : `[!] ${plural(r.problems.length, "problem")}`;
      res.className = r.ok ? "ok" : "bad";
      clear(out).append(r.ok ? null : h("pre", { class: "block" }, r.problems.map((p) => `- ${p}`).join("\n")));
      btn.disabled = false;
    });
    return h("li", {}, h("span", { class: "grow", title: b.target || "" }, `${b.path} · ${ago(b.generatedAt)}`), res, btn);
  }));
  return card("Evidence", plural(bundles.length, "bundle"), false,
    target ? h("div", { class: "actions" },
      h("span", { class: "muted grow" }, shortProject(target)),
      create,
      ...["auditor", "owner", "developer"].map((a) => h("a", { class: "btn small", href: `/api/report?${new URLSearchParams({ project: target, audience: a })}`, download: "" }, `${a}.md`)),
    ) : null,
    msg,
    bundles.length ? list : empty(EMPTY.evidence),
    out,
  );
}

function changesCard(env, project) {
  const past = state.runs.past.filter((l) => !project || l.target.repo === project || l.target.url === project);
  const fixes = past.flatMap((l) => l.iterations.flatMap((it) => it.fixes.filter((f) => f.commit).map((f) => ({ ...f, branch: l.branch, at: l.startedAt }))));
  return card("Changes", plural(fixes.length, "fix", "fixes"), false,
    fixes.length ? h("ul", { class: "mini" }, fixes.slice(0, 12).map((f) => h("li", {},
      h("span", { class: "ok" }, "OK"),
      h("span", { class: "grow" }, f.title, h("span", { class: "muted" }, ` · ${f.branch}`)),
      h("code", { class: "muted", title: `git show ${f.commit}` }, f.commit.slice(0, 7))))) : empty(EMPTY.changes),
    env.fixBranches.length ? h("div", {}, h("p", { class: "label" }, "Local fix branches"), h("ul", { class: "mini" }, env.fixBranches.map((b) => h("li", {}, h("code", { class: "grow" }, b))))) : null,
    h("p", { class: "muted" }, "Nothing is pushed. Review with git log --stat main..<branch>, then merge or push it yourself."),
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
  clear(el).append(
    head("Finding", ctx),
    h("div", { class: "pane-body detail" },
      h("div", {}, sevBadge(d.severity), " ", h("span", { class: "chip" }, d.confidence || "unrated"), " ", d.category ? h("span", { class: "chip" }, d.category) : null),
      h("h2", { tabindex: "-1" }, d.title),
      h("dl", { class: "kv" },
        h("dt", {}, "where"), h("dd", {}, d.location || "-"),
        h("dt", {}, "project"), h("dd", {}, f.project),
        h("dt", {}, "id"), h("dd", { class: "muted" }, d.id)),
      h("div", { class: "plain", "aria-label": "In plain words" },
        h("p", {}, h("b", {}, "In plain words :: "), (x.plainSeverity || d.severity) === "note" ? "a note, not a problem." : `a ${x.plainSeverity || d.severity} problem${d.category ? ` with ${d.category.replace(/-/g, " ")}` : ""}.`),
        x.confidenceMeaning ? h("p", {}, h("b", {}, `How sure (${x.confidence}) :: `), x.confidenceMeaning) : null,
        x.fixText ? h("p", {}, h("b", {}, "What to do :: "), x.fixText) : null,
        x.owasp?.length ? h("p", { class: "muted" }, `Maps to ${x.owasp.join(" · ")}`) : null),
      d.description ? section("What we saw", h("p", {}, d.description)) : null,
      d.evidence ? section("Evidence", h("pre", { class: "block" }, d.evidence)) : null,
      d.remediation ? section("How to fix", h("p", {}, d.remediation)) : null,
      d.sources?.length ? section("Sources", h("ul", { class: "mini" }, d.sources.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.cite))))) : null,
      d.fix ? section("Fix recipe",
        h("p", {}, h("span", { class: "ok" }, d.fix.recipe), ` :: ${d.fix.title}`),
        diffBlock(d.fix.diff),
        f.project.startsWith("/") ? h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: () => { set({ mode: "loop", sel: { kind: "project", key: f.project } }); ctx.focusBar("loop"); } }, "Fix it with the loop ▸")) : null)
        : section("Fix recipe", h("p", { class: "muted" }, "No recipe matches. Fix it by hand, or run the loop with a local model (--fix-model) from the CLI.")),
    ),
  );
}

// ── Settings (behind the gear) ──────────────────────────────────────────

async function settingsView(el, ctx, my) {
  const [settings, mem] = await Promise.all([api.get("/api/settings"), api.get("/api/memory")]);
  if (my !== seq) return;
  const radios = ["dark", "light"].map((t) => {
    const r = h("input", { type: "radio", name: "theme", value: t, checked: ctx.theme.get() === t });
    r.addEventListener("change", () => ctx.theme.set(t));
    return h("label", {}, r, h("span", {}, t === "dark" ? "Dark" : "Light"));
  });
  clear(el).append(
    head("Settings", ctx),
    h("div", { class: "pane-body detail" },
      h("section", {}, h("p", { class: "label" }, "Theme"), h("div", { class: "seg", role: "radiogroup", "aria-label": "Theme" }, radios),
        h("p", { class: "muted" }, "Remembered in this browser. The first visit follows your system.")),
      h("section", {}, h("p", { class: "label" }, "Where data comes from"),
        h("dl", { class: "kv" },
          h("dt", {}, "reports"), h("dd", {}, state.meta.reportsDir),
          h("dt", {}, "memory"), h("dd", {}, state.meta.memoryRoot),
          h("dt", {}, "projects"), h("dd", {}, state.meta.projects.map((p) => h("div", {}, p)))),
        h("p", { class: "muted" }, "Only these folders and ~/.penthera are read. Add folders with penthera ui --project <dir>.")),
      h("section", {}, h("p", { class: "label" }, "Egress for scans started here"), h("p", {}, settings.offline ? "Offline: only the target." : "Online: target plus recon sources.")),
      h("section", {}, h("p", { class: "label" }, "Memory chains"),
        mem.projects.length ? h("ul", { class: "mini" }, mem.projects.map((p) => h("li", {}, h("span", { class: p.chain === "ok" ? "ok" : "bad" }, p.chain === "ok" ? "[OK]" : "[!]"), h("span", { class: "grow" }, p.label), h("span", { class: "muted" }, `${p.events} events`)))) : empty(EMPTY.memory)),
      h("section", {}, h("p", { class: "label" }, "Keys"), h("dl", { class: "kv" }, KEYS.flatMap(([k, v]) => [h("dt", {}, h("kbd", {}, k)), h("dd", {}, v)]))),
      h("section", {}, h("p", { class: "label" }, "Session"),
        h("p", { class: "muted" }, `127.0.0.1 only · one-time link swapped for an HttpOnly, SameSite=Strict cookie · Host and Origin checked · strict CSP · ${state.meta.demo ? "demo data" : "local reports"}`)),
    ),
  );
}
