/**
 * The page's script: the browser check, the copy buttons and the hero loop.
 * Everything the visitor adds is rendered with textContent, never as HTML.
 */
import { check, ready, kindForName, guessKind, KINDS, HEADERS } from "./engine.js";
import { COPY } from "./copy.js";
import { EXAMPLES } from "virtual:examples";

const MAX_BYTES = 1024 * 1024;
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ── Copy buttons ────────────────────────────────────────────────────────────

function copyButtons() {
  for (const btn of document.querySelectorAll("[data-copy], [data-copy-from]")) {
    // A .cmd carries its own text and states; a prompt's button copies the <pre> beside it.
    const root = btn.closest("[data-copy-root]");
    const source = btn.dataset.copy != null ? btn.querySelector("code") : $("[data-copy-text]", root);
    const status = $("[data-copy-status]", btn);
    const label = btn.textContent;
    let timer;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? source.textContent);
      } catch {
        // No clipboard permission: select the text so the visitor can copy it.
        getSelection().selectAllChildren(source);
        return;
      }
      btn.dataset.state = "copied";
      if (status) status.textContent = `, ${COPY.copied.toLowerCase()}`;
      else btn.textContent = COPY.copied;
      clearTimeout(timer);
      timer = setTimeout(() => {
        delete btn.dataset.state;
        if (status) status.textContent = ", copy to clipboard";
        else btn.textContent = label;
      }, 1600);
    });
  }
}

// ── Hero loop: plays only when motion is welcome ────────────────────────────

function heroLoop() {
  const v = $("[data-loop]");
  if (!v) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const apply = () => {
    if (still.matches) { v.pause(); v.controls = true; return; }
    v.controls = false;
    v.play().catch(() => { v.controls = true; });
  };
  still.addEventListener("change", apply);
  apply();
}

// ── The check ───────────────────────────────────────────────────────────────

function textWithCode(parent, text) {
  // Findings mark code with backticks; show it as <code>, as text.
  String(text).split(/(`[^`]+`)/).forEach((part) => {
    if (/^`[^`]+`$/.test(part)) parent.append(el("code", null, part.slice(1, -1)));
    else if (part) parent.append(document.createTextNode(part));
  });
}

function setupCheck() {
  const root = $("[data-check]");
  if (!root) return;
  const staged = new Map(); // path -> text
  const list = $("[data-staged]", root);
  const out = $("[data-output]", root);
  const runBtn = $("[data-run]", root);
  const clearBtn = $("[data-clear]", root);

  const say = (text, cls = "empty") => { out.replaceChildren(el("p", cls, text)); };
  const note = (text) => { const p = el("p", "notice", text); list.after(p); setTimeout(() => p.remove(), 4000); };

  function renderStaged() {
    list.replaceChildren(...[...staged.keys()].map((path) => {
      const li = el("li");
      li.append(el("code", null, path));
      const x = el("button", "btn btn-sm", "Remove");
      x.type = "button";
      x.setAttribute("aria-label", COPY.remove(path));
      x.addEventListener("click", () => { staged.delete(path); renderStaged(); });
      li.append(x);
      return li;
    }));
    runBtn.disabled = clearBtn.disabled = staged.size === 0;
  }

  function stage(path, text) {
    const had = staged.has(path);
    staged.set(path, text);
    renderStaged();
    note(had ? COPY.replaced(path) : COPY.added(path));
  }

  async function addFiles(files) {
    for (const f of files) {
      const kind = kindForName(f.name);
      if (!kind) { say(COPY.unknownName(f.name), "error"); continue; }
      if (f.size > MAX_BYTES) { say(COPY.tooLarge(f.name), "error"); continue; }
      try { stage(kind.path, await f.text()); } catch { say(COPY.unreadable(f.name), "error"); }
    }
  }

  const input = $("[data-file]", root);
  input.addEventListener("change", () => { addFiles([...input.files]); input.value = ""; });
  const drop = $("[data-drop]", root);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    addFiles([...e.dataTransfer.files]);
  });

  $("[data-paste-add]", root).addEventListener("click", () => {
    const ta = $("[data-paste]", root);
    const text = ta.value;
    if (!text.trim()) { say(COPY.pasteEmpty, "error"); ta.focus(); return; }
    const chosen = $("[data-paste-kind]", root).value;
    const kind = KINDS.find((k) => k.id === chosen) || guessKind(text);
    stage(kind.path, text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text);
    ta.value = "";
  });

  $("[data-headers-add]", root).addEventListener("click", () => {
    const ta = $("[data-headers]", root);
    if (!ta.value.trim()) { say(COPY.headersEmpty, "error"); ta.focus(); return; }
    stage(HEADERS, ta.value.slice(0, MAX_BYTES));
    ta.value = "";
  });

  $("[data-example]", root).addEventListener("click", () => {
    staged.clear();
    for (const f of EXAMPLES) staged.set(f.path, f.text);
    renderStaged();
    say(COPY.exampleLoaded);
  });

  clearBtn.addEventListener("click", () => { staged.clear(); renderStaged(); say(COPY.empty); });

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    runBtn.textContent = COPY.running;
    try {
      const r = await check([...staged].map(([path, text]) => ({ path, text })));
      render(r);
    } catch (e) {
      say(COPY.failed(e?.message || String(e)), "error");
    } finally {
      runBtn.textContent = COPY.run;
      runBtn.disabled = staged.size === 0;
    }
  });

  function render(r) {
    if (!r.findings.length) { say(COPY.clean(r.files)); return; }
    const head = el("div", "summary");
    head.append(el("p", null, COPY.summary(r.findings.length, r.files, r.ms)));
    const tally = el("ul", "tally");
    for (const [sev, n] of Object.entries(r.counts)) {
      if (!n) continue;
      const li = el("li", null);
      li.append(el("span", `sev sev-${sev}`, COPY.severity[sev]), document.createTextNode(` ${n}`));
      tally.append(li);
    }
    head.append(tally);
    const rows = el("ol", "findings");
    for (const f of r.findings) {
      const li = el("li");
      const d = el("details");
      const s = el("summary");
      s.append(el("span", `sev sev-${f.severity}`, COPY.severity[f.severity] || f.severity));
      const title = el("span", "f-title");
      textWithCode(title, f.title);
      s.append(title);
      s.append(el("span", "f-file", f.url || ""));
      d.append(s);
      const body = el("div", "f-body");
      for (const para of String(f.description).split(/\n{2,}/)) {
        const p = el("p");
        textWithCode(p, para);
        body.append(p);
      }
      if (f.source === "runtime-advisory" && f.severity !== "info") body.append(el("p", "f-note", COPY.backport));
      if (f.remediation) {
        const p = el("p");
        p.append(el("strong", null, `${COPY.details.todo} `));
        textWithCode(p, f.remediation);
        body.append(p);
      }
      const dl = el("dl");
      for (const [k, v] of [[COPY.details.file, f.url], [COPY.details.rule, f.templateId || f.rule || f.method || f.source], [COPY.details.cves, f.cves?.join(", ")], [COPY.details.confidence, f.confidence]]) {
        if (!v) continue;
        const row = el("div");
        row.append(el("dt", null, k), el("dd", null, v));
        dl.append(row);
      }
      body.append(dl);
      d.append(body);
      li.append(d);
      rows.append(li);
    }
    out.replaceChildren(head, rows);
  }

  // Inflate the popular-package lists while the visitor reads.
  ready().catch((e) => say(COPY.failed(e.message), "error"));
  renderStaged();
}

// ── The bar wears the palette of the band beneath it ────────────────────────

function barPalette() {
  const bar = $(".bar");
  const bands = [...document.querySelectorAll(".band")];
  if (!bar || !bands.length) return;
  const under = new Set();
  const sync = () => {
    const band = bands.find((b) => under.has(b));
    if (!band) delete bar.dataset.over;
    else bar.dataset.over = band.classList.contains("band-blue") ? "blue" : "invert";
  };
  // A strip half the bar's height at the top of the viewport; rebuilt when
  // the viewport changes size, since rootMargin is fixed per observer.
  let io;
  const observe = () => {
    io?.disconnect();
    under.clear();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? under.add(e.target) : under.delete(e.target);
      sync();
    }, { rootMargin: `0px 0px -${Math.max(0, innerHeight - bar.offsetHeight / 2)}px 0px` });
    for (const b of bands) io.observe(b);
  };
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(observe, 150); });
  observe();
}

copyButtons();
heroLoop();
barPalette();
setupCheck();
