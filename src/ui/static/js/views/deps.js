import { h, panel, empty, sevBadge } from "../dom.js";
import { bars, sparkline, severityBars } from "../charts.js";
import { ago, plural } from "../format.js";

const CAP_SEV = {
  "install-scripts": "high", shell: "medium", network: "medium", "fs-write": "medium", env: "low", "env-bulk": "medium",
  eval: "medium", "dynamic-require": "low", native: "low", obfuscated: "high", "ai-config-write": "critical", "ai-cli-invoke": "critical", "token-harvest": "critical",
};

const capChip = (id, gained = false) => h("span", { class: `chip ${CAP_SEV[id] === "critical" || CAP_SEV[id] === "high" ? "bad" : gained ? "warn" : ""}` }, `${gained ? "+" : ""}${id}`);

export async function render(root, { api }) {
  const d = await api.get("/api/deps");
  root.append(
    h("h1", {}, "Dependencies"),
    h("p", { class: "lede" }, "What your npm dependencies can do, what changed, and what the install firewall let in. Read from penthera deps and penthera install --json reports, offline."),
  );
  const grid = h("div", { class: "grid" });
  root.append(grid);
  const l = d.latest;

  if (!l) {
    grid.append(panel("Latest deps scan", { class: "span-12" }, empty("No deps report yet. Run: penthera deps --base origin/main --json > reports/deps.json")));
  } else {
    const caps = Object.entries(l.capabilityCounts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const diff = l.diff;
    root.querySelector(".lede").after(h("div", { class: "tiles" },
      tile("Packages", String(l.total), `${l.scanned} scanned, ${l.direct} direct`),
      tile("Added", diff ? String(diff.added.length) : "-", diff ? `vs ${diff.base}` : "no base to compare"),
      tile("Gained capabilities", diff ? String(diff.upgraded.reduce((n, u) => n + u.gained.length, 0) + diff.added.reduce((n, a) => n + a.capabilities.length, 0)) : "-", "new things code can do"),
      tile("Typosquats", String(l.typosquats.length), l.typosquats.length ? "names one edit from a popular package" : "none found"),
    ));

    grid.append(panel("Capabilities in the tree", { class: "span-5" },
      bars(caps.map(([id, n]) => ({ label: id, value: n, cls: "muted", fill: `c-${CAP_SEV[id] || "info"}` })), { width: 18 }),
      h("p", { class: "panel-note" }, `${l.lockfile} :: ${l.network} :: ${ago(l.ts)}`),
    ));

    grid.append(panel("Capability diff", { class: "span-7" },
      diff ? h("div", {},
        h("div", { class: "filters" },
          h("span", { class: "chip on" }, `+${diff.added.length} added`),
          h("span", { class: "chip warn" }, `~${diff.upgraded.length} upgraded`),
          h("span", { class: "chip" }, `-${diff.removed.length} removed`),
          h("span", { class: "faint" }, `base ${diff.base}`),
        ),
        h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Package"), h("th", {}, "Change"), h("th", {}, "Can now"))),
          h("tbody", {},
            diff.added.map((a) => h("tr", {}, h("td", {}, a.name), h("td", { class: "ok" }, `+ ${a.version}`), h("td", {}, a.capabilities.length ? a.capabilities.map((c) => capChip(c, true)) : h("span", { class: "faint" }, "nothing flagged")))),
            diff.upgraded.filter((u) => u.gained.length || u.lost.length).map((u) => h("tr", {}, h("td", {}, u.name), h("td", { class: "warn" }, `${u.from} → ${u.to}`), h("td", {}, u.gained.map((c) => capChip(c, true)), u.lost.map((c) => h("span", { class: "chip" }, `-${c}`))))),
            diff.removed.map((r) => h("tr", {}, h("td", { class: "faint" }, r.name), h("td", { class: "faint" }, `- ${r.version}`), h("td", {}))),
          ),
        )),
        h("p", { class: "panel-note" }, `${plural(diff.upgraded.filter((u) => !u.gained.length && !u.lost.length).length, "upgrade")} with no capability change not shown.`),
      ) : empty("No diff in the latest report. Run penthera deps --base <ref> to compare."),
    ));

    grid.append(panel("Deps findings", { class: "span-7" },
      l.findings.length ? h("ul", { class: "list" }, l.findings.map((f) => h("li", {}, sevBadge(f.severity), h("span", { class: "grow" }, f.title), h("span", { class: "faint trunc hide-narrow" }, f.location || "")))) : empty("No findings."),
      l.typosquats.length ? h("p", { class: "panel-note" }, l.typosquats.map((t) => `${t.name} looks like ${t.similarTo}`).join(" :: ")) : null,
    ));

    grid.append(panel("Severity and history", { class: "span-5" },
      severityBars(l.counts, { width: 16 }),
      h("p", { class: "label" }, "Package count over time"),
      sparkline(d.history.map((x) => x.total), { width: 300, height: 36, label: "package count", zero: false }),
    ));
  }

  grid.append(panel("Install firewall decisions", { class: "span-12" },
    d.installs.length ? h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ...["When", "Install", "Decision", "Flags", "Denied by policy", "Needed approval"].map((t) => h("th", {}, t)))),
      h("tbody", {}, d.installs.map((i) => {
        const flags = [...new Set(i.changes.flatMap((c) => c.flags))];
        const deny = [...new Set(i.changes.flatMap((c) => c.deny))];
        const appr = [...new Set(i.changes.flatMap((c) => c.approval))];
        const verdict = i.action === "refused" || deny.length ? ["REFUSED", "bad"] : i.clean ? ["CLEAN", "ok"] : ["APPROVED", "warn"];
        return h("tr", {},
          h("td", { class: "muted" }, ago(i.ts)),
          h("td", {}, i.specs.join(" "), h("span", { class: "faint" }, ` (${plural(i.changes.length, "package")})`)),
          h("td", { class: verdict[1] }, `[${verdict[0]}]`),
          h("td", {}, flags.length ? flags.map((f) => capChip(f)) : h("span", { class: "faint" }, "-")),
          h("td", { class: "bad" }, deny.join(", ") || h("span", { class: "faint" }, "-")),
          h("td", { class: "warn" }, appr.join(", ") || h("span", { class: "faint" }, "-")),
        );
      })),
    )) : empty("No penthera install --json reports yet."),
  ));
}

function tile(label, value, sub) {
  return h("div", { class: "tile" }, h("span", { class: "label" }, label), h("div", { class: "big" }, value), h("div", { class: "sub" }, sub));
}
