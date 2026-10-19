import { h, panel, empty, clear, announce } from "../dom.js";
import { ago, stamp, shortProject } from "../format.js";

export async function render(root, { api }) {
  const { bundles } = await api.get("/api/evidence");
  root.append(
    h("h1", {}, "Evidence"),
    h("p", { class: "lede" }, "Bundles written with --evidence <dir>. Verify recomputes every SHA-256 against manifest.json and checks the SSH signature, the same as penthera evidence verify."),
  );
  if (!bundles.length) {
    root.append(h("div", { class: "notice" }, empty("No evidence bundles in the reports folder. Write one with: penthera <url> --evidence reports/evidence/today --sign-key ~/.ssh/id_ed25519")));
    return;
  }
  const out = h("div");
  const rows = bundles.map((b) => {
    const result = h("td", { class: "muted", "aria-live": "polite" }, "not checked");
    const btn = h("button", { type: "button", class: "btn" }, "Verify");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      result.textContent = "hashing…";
      result.className = "muted";
      try {
        const r = await api.post("/api/evidence/verify", { id: b.id });
        result.textContent = r.ok ? "[VERIFIED]" : `[FAILED] ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}`;
        result.className = r.ok ? "ok" : "bad";
        clear(out).append(report(b, r));
        announce(`${b.path}: ${r.ok ? "verified" : "verification failed"}`);
      } catch (e) {
        result.textContent = e.message;
        result.className = "bad";
      } finally {
        btn.disabled = false;
      }
    });
    return h("tr", {},
      h("td", {}, b.path),
      h("td", { class: "trunc hide-narrow", title: b.target || "" }, shortProject(b.target)),
      h("td", { class: "muted hide-narrow" }, ago(b.generatedAt)),
      h("td", { class: "num" }, String(b.artifacts)),
      h("td", {}, b.signed ? h("span", { class: "chip on" }, "signed") : h("span", { class: "chip" }, "unsigned")),
      h("td", {}, btn),
      result,
    );
  });
  root.append(h("div", { class: "grid" },
    panel("Bundles", { class: "span-12" }, h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ...["Bundle", "Target", "Written", "Files", "Signature", "", "Result"].map((t, i) => h("th", { class: [i === 3 ? "num" : null, i === 1 || i === 2 ? "hide-narrow" : null] }, t)))),
      h("tbody", {}, rows),
    ))),
    h("div", { class: "span-12" }, out),
  ));
}

function report(b, r) {
  return panel(`Verification :: ${b.path}`, {},
    h("p", { class: r.ok ? "ok" : "bad" }, r.ok ? "Every artifact matches the manifest." : "NOT VERIFIED"),
    h("ul", { class: "list" }, r.files.map((f) => h("li", {},
      h("span", { class: f.ok ? "ok" : "bad" }, f.ok ? "ok  " : "FAIL"),
      h("span", { class: "grow" }, f.path),
      f.ok ? null : h("span", { class: "bad" }, f.reason),
    ))),
    r.signature ? h("p", {}, h("span", { class: r.signature.ok ? (r.signature.status === "valid" ? "ok" : "warn") : "bad" }, `signature ${r.signature.status}: `), r.signature.detail) : null,
    r.problems.length ? h("pre", { class: "block" }, r.problems.map((p) => `- ${p}`).join("\n")) : null,
    h("p", { class: "panel-note" }, `checked ${stamp(new Date().toISOString())}`),
  );
}
