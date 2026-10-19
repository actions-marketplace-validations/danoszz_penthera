import { h, panel, empty } from "../dom.js";
import { severityBars, stackedBar, sparkline, trendChart, columns } from "../charts.js";
import { ago, duration, shortProject, SEVERITIES } from "../format.js";

/** Merge per-project trends into one series by scan index from the end. */
function combinedTrend(projects) {
  const len = Math.max(0, ...projects.map((p) => p.trend.length));
  const out = [];
  for (let i = 0; i < len; i++) {
    let total = 0;
    let severe = 0;
    let ts = null;
    for (const p of projects) {
      const t = p.trend[p.trend.length - len + i] || p.trend[0];
      if (!t) continue;
      total += t.total;
      severe += (t.critical || 0) + (t.high || 0);
      if (!ts || t.ts > ts) ts = t.ts;
    }
    out.push({ ts, total, severe });
  }
  return out;
}

export async function render(root, { api, go }) {
  const o = await api.get("/api/overview");
  const total = SEVERITIES.reduce((n, s) => n + o.mix[s], 0);
  const severe = o.mix.critical + o.mix.high;

  root.append(
    h("h1", {}, "Overview"),
    h("p", { class: "lede" }, `${o.projects.length} project${o.projects.length === 1 ? "" : "s"} from local reports and memory. Nothing here left this machine.`),
  );

  if (!o.projects.length) {
    root.append(h("div", { class: "notice" },
      h("p", {}, "No reports yet. Scan something with -o into the reports folder, or start a run from the Agent screen."),
      h("pre", { class: "block" }, "penthera http://localhost:3000 --offline -o reports/local.json\npenthera --repo . -o reports/repo.json"),
    ));
    return;
  }

  root.append(h("div", { class: "tiles" },
    tile("Open findings", String(o.open), `${severe} critical or high`),
    tile("Fixed", String(o.fixed), "gone in a later scan or verified by the loop", "ok"),
    tile("Median time to fix", o.timeToFix.medianDays == null ? "-" : `${o.timeToFix.medianDays}d`, `${o.timeToFix.samples} fixes measured`),
    tile("Egress hosts", String(o.egress.hosts.length), `${o.egress.blocked.length} blocked by offline mode`),
  ));

  const grid = h("div", { class: "grid" });
  root.append(grid);

  // Posture per project
  const rows = o.projects.map((p) => h("tr", {},
    h("td", {}, h("span", { class: `grade grade-${p.grade}`, title: `score ${p.score}/100` }, p.grade)),
    h("td", {}, h("button", { class: "row-btn trunc", type: "button", title: p.key, onclick: () => go("findings", { project: p.key }) }, shortProject(p.key)),
      h("span", { class: "faint" }, ` ${p.mode || ""}`)),
    h("td", { class: "hide-narrow" }, stackedBar(p.counts)),
    h("td", {}, sparkline(p.trend.map((t) => t.total), { label: `open findings, ${shortProject(p.key)}` })),
    h("td", { class: "num" }, String(p.open)),
    h("td", { class: "num ok" }, String(p.fixed)),
    h("td", { class: "num muted hide-narrow" }, ago(p.lastScan)),
  ));
  grid.append(panel("Posture per project", { class: "span-12" },
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ...["Grade", "Project", "Severity", "Trend", "Open", "Fixed", "Last scan"].map((t, i) => h("th", { class: [i >= 4 && i < 6 ? "num" : null, i === 2 || i === 6 ? "hide-narrow" : null] }, t)))),
      h("tbody", {}, rows),
    )),
    h("p", { class: "panel-note" }, "Grade: 100 minus 30 per critical, 15 per high, 5 per medium, 1 per low. Any critical is an F."),
  ));

  grid.append(panel("Severity mix", { class: "span-5" },
    stackedBar(o.mix, { height: 6 }),
    severityBars(o.mix, { width: 22 }),
    h("p", { class: "panel-note" }, `${total} findings in the latest report of each project.`),
  ));

  grid.append(panel("Findings over time", { class: "span-7" },
    trendChart(combinedTrend(o.projects)),
    h("div", { class: "legend" },
      h("span", {}, h("span", { class: "sw sw-total" }), "open (critical to low)"),
      h("span", {}, h("span", { class: "sw sw-severe" }), "critical + high"),
    ),
  ));

  grid.append(panel("Time to fix", { class: "span-4" },
    columns(o.timeToFix.buckets, { label: "Fixes by time to fix" }),
    h("p", { class: "panel-note" }, "From first seen to gone (or verified by the loop)."),
  ));

  grid.append(panel("Egress hosts", { class: "span-4" },
    o.egress.hosts.length
      ? h("ul", { class: "list" }, o.egress.hosts.map((x) => h("li", {},
        h("span", { class: x.thirdParty ? "warn" : "ok" }, x.thirdParty ? "3P" : "OK"),
        h("span", { class: "grow trunc", title: x.host }, x.host),
        h("span", { class: "num muted" }, String(x.requests)),
      )))
      : empty("No egress recorded."),
    o.egress.blocked.length ? h("div", {},
      h("p", { class: "label" }, "Blocked (offline)"),
      h("ul", { class: "list" }, o.egress.blocked.map((x) => h("li", {}, h("span", { class: "faint" }, "--"), h("span", { class: "grow trunc" }, x.host), h("span", { class: "num faint" }, String(x.requests))))),
    ) : null,
  ));

  grid.append(panel("Last scans", { class: "span-4" },
    h("ul", { class: "list" }, o.lastScans.map((sc) => h("li", {},
      h("span", { class: "faint" }, ago(sc.ts).padStart(7)),
      h("span", { class: "grow trunc", title: sc.target }, shortProject(sc.target)),
      worst(sc.counts),
      h("span", { class: "num muted" }, duration(sc.durationMs)),
    ))),
  ));

  if (o.loops.length) {
    grid.append(panel("Agent loop runs", { class: "span-12" },
      h("ul", { class: "list" }, o.loops.map((l) => h("li", {},
        h("span", { class: "faint" }, ago(l.startedAt)),
        h("span", { class: "grow" }, `${shortProject(l.target.repo)} :: ${l.findings.initial ?? "?"} → ${l.findings.final ?? "?"} findings`),
        h("span", { class: "ok" }, `${l.totals.verified} verified`),
        l.totals.failed ? h("span", { class: "bad" }, `${l.totals.failed} failed`) : null,
        h("span", { class: "muted hide-narrow" }, l.branch || ""),
      ))),
    ));
  }
}

function worst(c) {
  const sev = SEVERITIES.find((k) => c[k] > 0);
  return sev ? h("span", { class: `sev sev-${sev}` }, `${c[sev]} ${sev}`) : h("span", { class: "ok" }, "clean");
}

function tile(label, value, sub, cls) {
  return h("div", { class: "tile" }, h("span", { class: "label" }, label), h("div", { class: ["big", cls] }, value), h("div", { class: "sub" }, sub));
}
