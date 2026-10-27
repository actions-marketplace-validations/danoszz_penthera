/**
 * The page's script: the live check, the copy buttons and the hero loop.
 * Everything the visitor adds is rendered with textContent, never as HTML.
 */
import { COPY } from "./copy.js";
import { liveField } from "./field.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ── Counting, without cookies ───────────────────────────────────────────────

// Vercel Web Analytics custom events, so we can see how many checks run and
// how many lead to an install. An event is a name and at most which button;
// never the URL or host checked, the score, or anything typed or pasted. Web
// Analytics sets no cookies (docs/privacy.md). The stub queues events until
// the analytics script loads; counting never breaks the page.
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
function count(name, data) {
  try { window.va("event", data ? { name, data } : { name }); } catch { /* counting is never worth an error */ }
}

// ── Copy buttons ────────────────────────────────────────────────────────────

function copyButtons() {
  for (const btn of document.querySelectorAll("[data-copy], [data-copy-from]")) {
    // A .cmd carries its own text and states; a prompt's button copies the <pre> beside it.
    const root = btn.closest("[data-copy-root]");
    const source = btn.dataset.copy != null ? btn.querySelector("code") || btn : $("[data-copy-text]", root);
    const status = $("[data-copy-status]", btn);
    // A button with an icon swaps only its label's text.
    const labelEl = $("[data-copy-label]", btn) || btn;
    const label = labelEl.textContent;
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
      if (btn.dataset.track) count("copy", { what: btn.dataset.track });
      if (status) status.textContent = `, ${COPY.copied.toLowerCase()}`;
      else labelEl.textContent = COPY.copied;
      clearTimeout(timer);
      timer = setTimeout(() => {
        delete btn.dataset.state;
        if (status) status.textContent = ", copy to clipboard";
        else labelEl.textContent = label;
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

// ── The live check ──────────────────────────────────────────────────────────

// POST /api/check (api/check.mjs) and render its report: the score as a
// 10 × 10 grid of pixels, the categories, every check with its evidence, fix
// and verify command, and a prompt for your coding agent built from the
// checks you pick. The report stays in this tab; nothing is stored.

const SEV = { high: 0, medium: 1, low: 2, info: 3 };
const API = "/api/check";

async function callCheck(body) {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, consent: true }) });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data) throw (data?.error || { message: "The check could not run.", hint: "Try again, or run npx penthera on your own machine." });
  return data;
}

function pixels(score) {
  const grid = el("div", "meter");
  grid.setAttribute("role", "img");
  grid.setAttribute("aria-label", `${score} out of 100`);
  for (let i = 0; i < 100; i++) grid.append(el("i", i < score ? "on" : null));
  return grid;
}

function findingItem(c) {
  const li = el("li", `finding sev-${c.severity}${c.passed ? " ok" : ""}`);
  const d = el("details");
  const s = el("summary");
  s.append(el("span", "finding-mark", c.passed ? "ok" : c.severity), el("span", "finding-title", c.title));
  d.append(s);
  const body = el("div", "finding-body");
  if (c.evidence) { const p = el("p", "finding-ev"); textWithCode(p, `Evidence: ${c.evidence}`); body.append(p); }
  if (!c.passed && c.fix) body.append(el("p", "finding-fix", c.fix));
  if (!c.passed && c.verify) body.append(el("pre", "finding-verify", c.verify));
  if (body.childNodes.length) d.append(body);
  li.append(d);
  return li;
}

function promptFor(report, picked) {
  const lines = [
    `Improve the security of ${report.url}.`,
    "",
    `Current Penthera quick check: ${report.score}/100 (${report.scope})`,
    "",
    "Fix these in priority order:",
    "",
  ];
  picked.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.title} (${c.severity})`);
    if (c.evidence) lines.push(`Evidence: ${c.evidence}`);
    lines.push(`Fix: ${c.fix}`);
    if (c.verify) lines.push(`Verify: \`${c.verify}\``);
    lines.push("");
  });
  lines.push(
    "Requirements:",
    "- Inspect the codebase and the hosting config (vercel.json, netlify.toml, nginx, middleware, CDN settings) before changing files.",
    "- Change only what each fix needs and keep the site working.",
    "- After deploying, run each verify command and check the result.",
    `- Then run \`npx penthera ${report.url}\` for the full scan and \`npx penthera --repo .\` for the code.`,
  );
  return lines.join("\n");
}

function promptDialog(report) {
  const failed = report.checks.filter((c) => !c.passed).sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  const dlg = el("dialog", "prompt-dialog");
  const form = el("form");
  form.method = "dialog";
  form.append(el("h3", null, "What should the prompt cover?"));
  const count = el("p", "prompt-count");
  const presets = el("div", "prompt-presets");
  const list = el("ul", "prompt-list");
  const boxes = failed.map((c) => {
    const li = el("li");
    const label = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = c.severity === "high" || c.severity === "medium";
    label.append(box, el("span", "prompt-t", c.title), el("span", "prompt-s", `${CATEGORY[c.category] || c.category} · ${c.severity}`));
    li.append(label);
    list.append(li);
    return [box, c];
  });
  const copy = el("button", "btn", "");
  copy.type = "button";
  copy.dataset.variant = "default";
  const sync = () => {
    const n = boxes.filter(([b]) => b.checked).length;
    count.textContent = `${failed.length} findings · ${n} selected`;
    copy.textContent = `Copy prompt (${n})`;
    copy.disabled = n === 0;
  };
  for (const [label, pick] of [["Recommended", (c) => c.severity === "high" || c.severity === "medium"], ["All", () => true], ["None", () => false]]) {
    const b = el("button", "btn btn-sm btn-white", label);
    b.type = "button";
    b.addEventListener("click", () => { for (const [box, c] of boxes) box.checked = pick(c); sync(); });
    presets.append(b);
  }
  list.addEventListener("change", sync);
  const cancel = el("button", "btn btn-white", "Cancel");
  cancel.value = "cancel";
  copy.addEventListener("click", async () => {
    const text = promptFor(report, boxes.filter(([b]) => b.checked).map(([, c]) => c));
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; count("copy", { what: "fix-prompt" }); } catch { copy.textContent = "Copy failed"; }
    setTimeout(() => dlg.close(), 700);
  });
  const actions = el("div", "prompt-actions");
  actions.append(cancel, copy);
  form.append(count, presets, list, actions);
  dlg.append(form);
  dlg.addEventListener("close", () => dlg.remove());
  sync();
  return dlg;
}

const CATEGORY = {};

function renderReport(box, report, rescan) {
  for (const c of report.categories) CATEGORY[c.id] = c.label;
  box.replaceChildren(backBar());
  // Left: what was checked and the verdict. Right: the score, and the one
  // blue button on the screen, Prompt to fix. Everything else is white.
  const head = el("div", "report-head");
  const id = el("div", "report-id");
  id.append(el("p", "report-host", new URL(report.url).host), el("h2", "report-verdict", report.verdict));
  const side = el("div", "report-side");
  const score = el("div", "report-score");
  const n = el("p", "score-n", String(report.score));
  n.append(el("span", null, "/100"));
  score.append(pixels(report.score), n);
  side.append(score);
  const failed = report.checks.filter((c) => !c.passed);
  if (failed.length) {
    const open = el("button", "btn report-prompt", `Prompt to fix (${failed.length})`);
    open.type = "button";
    open.dataset.variant = "default";
    open.addEventListener("click", () => { const d = promptDialog(report); document.body.append(d); d.showModal(); });
    side.append(open);
  } else {
    side.append(el("p", "report-clean", "Nothing to fix from the outside. The full scan goes further."));
  }
  const meta = el("p", "report-meta", `Checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  const again = el("button", "btn btn-white btn-sm", "Check again");
  again.type = "button";
  again.addEventListener("click", rescan);
  meta.append(again);
  side.append(meta);
  head.append(id, side);

  const cats = el("ul", "report-cats");
  for (const c of report.categories) {
    const li = el("li", c.passed === c.total ? "ok" : null);
    li.append(el("span", null, c.label), el("span", "cat-n", `${c.passed} / ${c.total} passed`));
    cats.append(li);
  }
  // What to fix first, open; what passed, folded into one line.
  const list = el("ol", "report-list");
  failed.sort((a, b) => SEV[a.severity] - SEV[b.severity]).forEach((c) => list.append(findingItem(c)));
  const passed = report.checks.filter((c) => c.passed);
  const fold = el("details", "report-passed");
  fold.append(el("summary", null, `${passed.length} checks passed`));
  const okList = el("ol", "report-list");
  passed.forEach((c) => okList.append(findingItem(c)));
  fold.append(okList);
  const scope = el("p", "report-scope", report.scope);
  box.append(head, cats);
  if (failed.length) box.append(list);
  if (passed.length) box.append(fold);
  box.append(scope);
  box.append(deeperOnYourMachine(report));
  // One quiet line to the Pro waitlist (site/pages/pro.md).
  const pro = el("p", "report-pro", "Want a person to keep an eye on this with you? ");
  const link = el("a", null, "Penthera Pro");
  link.href = "/pro";
  link.addEventListener("click", () => count("link", { to: "pro-from-check" }));
  pro.append(link);
  box.append(pro);
  box.hidden = false;
}

// The deeper scan runs only on the visitor's own machine: penthera.org
// never sends more than a browser visit would.
function deeperOnYourMachine(report) {
  const wrap = el("div", "report-deep");
  wrap.append(el("h3", null, "Go deeper on your own machine"));
  wrap.append(el("p", null, "Exposed files, debug pages, API specs and your code: the full scan runs where you are responsible for it, never from penthera.org."));
  const cmd = `npx penthera ${report.url}`;
  const b = el("button", "cmd cmd-white", "");
  b.type = "button";
  b.dataset.copy = cmd;
  b.append(el("span", "cmd-prompt", "$"), el("code", null, cmd), el("span", "cmd-act", "Copy"));
  b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(cmd); b.lastChild.textContent = "Copied"; count("copy", { what: "full-scan" }); } catch { getSelection().selectAllChildren(b.querySelector("code")); }
  });
  wrap.append(b);
  return wrap;
}

// ── Consent before every first check of a site ─────────────────────────────

// A heavy-blur modal with the terms in plain words, then slide to scan. The
// slider is a real range input, so it works with a keyboard and a screen
// reader; it only counts when it reaches the end.
const consented = new Set();

function askConsent(host) {
  if (consented.has(host)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const dlg = el("dialog", "consent");
    const form = el("form");
    form.method = "dialog";
    form.append(el("p", "consent-eyebrow", "Before you check"), el("h3", null, host));
    const ul = el("ul", "consent-list");
    for (const t of [
      "Only check a site you own, or one you have written permission to test.",
      "This check is passive: it loads what one browser visit loads. It sends no attacks and guesses no paths.",
      "It is research-backed and educational. A good score is not a guarantee and not a penetration test.",
      "Zero abuse: checks of sites that aren't yours are not welcome here, and patterns of abuse are blocked.",
      "Nothing about you or the site is stored. Deeper testing runs only on your own machine, under your responsibility.",
    ]) ul.append(el("li", null, t));
    const terms = el("p", "consent-terms");
    terms.append(document.createTextNode("By sliding you confirm this is your site or you are authorized to test it, and you accept the "));
    const a = el("a", null, "terms");
    a.href = "/terms";
    a.target = "_blank";
    terms.append(a, document.createTextNode("."));
    const slide = el("div", "slide");
    const range = el("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.value = "0";
    range.setAttribute("aria-label", `Slide to scan ${host}`);
    const label = el("span", "slide-label", "slide to scan");
    label.setAttribute("aria-hidden", "true");
    slide.append(label, range);
    const cancel = el("button", "btn consent-cancel", "Not my site");
    cancel.value = "cancel";
    form.append(ul, terms, slide, cancel);
    dlg.append(form);
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok) consented.add(host);
      dlg.close();
      dlg.remove();
      resolve(ok);
    };
    const paint = () => slide.style.setProperty("--p", `${range.value}%`);
    range.addEventListener("input", paint);
    const release = () => {
      if (Number(range.value) >= 97) { range.value = "100"; paint(); setTimeout(() => finish(true), 160); return; }
      slide.classList.add("back");
      range.value = "0";
      paint();
      setTimeout(() => slide.classList.remove("back"), 260);
    };
    // A pointer that lets go short of the end slides back; the keyboard
    // (arrows, End) moves it in steps and counts once it reaches the end.
    let dragging = false;
    range.addEventListener("pointerdown", () => { dragging = true; });
    range.addEventListener("change", () => {
      if (dragging) { dragging = false; release(); return; }
      if (Number(range.value) >= 100) finish(true);
    });
    dlg.addEventListener("cancel", () => finish(false));
    form.addEventListener("submit", () => finish(false));
    document.body.append(dlg);
    dlg.showModal();
    range.focus();
  });
}

// ── Fix mode ────────────────────────────────────────────────────────────────

// Once a check starts, the hero steps aside: the report takes the top of the
// screen, with a way back at the top left. Entering adds a history entry, so
// the browser's back button leaves fix mode too.
let leaveFixMode = () => {};

function backBar() {
  const bar = el("div", "report-top");
  const back = el("button", "report-back", "Back");
  back.type = "button";
  back.setAttribute("aria-label", "Back to the start");
  back.addEventListener("click", () => leaveFixMode());
  bar.append(back, el("span", "report-mode", "Check and fix"));
  return bar;
}

function setupScan() {
  const form = $("[data-scan]");
  const box = $("[data-report]");
  const hero = $(".hero");
  if (!form || !box || !hero) return;
  const input = form.querySelector("input");
  const button = form.querySelector("button[type=submit]");

  // The report starts 24 px below the header, wherever the header ends: the
  // logotype grows with the viewport, so this is measured, not fixed.
  const placeBelowHeader = () => {
    // The logotype overflows the bar, so take the lowest of the two.
    const parts = [$(".bar"), $(".bar .brand")].filter(Boolean);
    if (!parts.length) return;
    const top = Math.max(...parts.map((p) => p.getBoundingClientRect().bottom)) - hero.getBoundingClientRect().top;
    hero.style.setProperty("--fix-top", `${Math.ceil(top + 24)}px`);
  };
  addEventListener("resize", () => { if (hero.dataset.mode === "fix") placeBelowHeader(); });
  const enter = () => {
    if (hero.dataset.mode !== "fix") history.pushState({ penthera: "fix" }, "", "#check");
    hero.dataset.mode = "fix";
    scrollTo({ top: 0, behavior: "instant" });
    placeBelowHeader();
  };
  const exit = () => {
    delete hero.dataset.mode;
    box.hidden = true;
    box.replaceChildren();
    scrollTo({ top: 0, behavior: "instant" });
    input.focus({ preventScroll: true });
  };
  leaveFixMode = () => (history.state?.penthera === "fix" ? history.back() : exit());
  addEventListener("popstate", () => { if (hero.dataset.mode === "fix") exit(); });

  const run = async () => {
    const url = input.value.trim();
    if (!url) { input.focus(); return; }
    let host;
    try { host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host; } catch { host = url; }
    if (!(await askConsent(host))) { input.focus(); return; }
    button.disabled = true;
    enter();
    box.hidden = false;
    box.replaceChildren(backBar(), el("p", "report-busy", `Checking ${host}: the page, its headers, its scripts and DNS…`));
    try {
      renderReport(box, await callCheck({ url }), run);
      count("check", { result: "report" });
    } catch (e) {
      count("check", { result: "error" });
      box.replaceChildren(backBar(), el("p", "report-error", `${e.message} ${e.hint || ""}`));
    } finally {
      button.disabled = false;
    }
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
}

function textWithCode(parent, text) {
  // Findings mark code with backticks; show it as <code>, as text.
  String(text).split(/(`[^`]+`)/).forEach((part) => {
    if (/^`[^`]+`$/.test(part)) parent.append(el("code", null, part.slice(1, -1)));
    else if (part) parent.append(document.createTextNode(part));
  });
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
    else bar.dataset.over = band.classList.contains("band-blue") ? "blue" : band.classList.contains("band-grey") ? "grey" : "invert";
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

// ── The bottom veil stays off the hero text and the footer ──────────────

function veilClear() {
  const veil = $(".veil");
  // The whole hero text block (headline, subline, install command), not just
  // the headline, and the footer.
  const targets = [$(".hero-text"), $(".foot")].filter(Boolean);
  if (!veil || !targets.length) return;
  const inZone = new Set();
  let io;
  const observe = () => {
    io?.disconnect();
    inZone.clear();
    const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--veil-h")) || 224;
    // Watch only the strip the veil covers: the bottom --veil-h of the viewport.
    io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? inZone.add(e.target) : inZone.delete(e.target);
      if (inZone.size) veil.dataset.off = "";
      else delete veil.dataset.off;
    }, { rootMargin: `-${Math.max(0, innerHeight - h)}px 0px 0px 0px` });
    for (const t of targets) io.observe(t);
  };
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(observe, 150); });
  observe();
}

// ── One light for the metal plates ──────────────────────────────────────

// The plates' sheen is a light above the page. With a mouse, the pointer
// carries it: every plate gets the pointer's position in its own
// coordinates, so they all catch the same light. Off with reduced motion.
function metalLight() {
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  if (!fine.matches || still.matches) return;
  const plates = [...document.querySelectorAll(".pillars li, .bench-stats li, .road li, .ways > li, .prompt-card, .btn-prompt, .pb-card")];
  let x = 0, y = 0, queued = false;
  const paint = () => {
    queued = false;
    for (const el of plates) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) continue;
      el.style.setProperty("--lx", `${Math.round(x - r.left)}px`);
      el.style.setProperty("--ly", `${Math.round(y - r.top)}px`);
    }
  };
  let seen = false;
  const queue = () => { if (seen && !queued) { queued = true; requestAnimationFrame(paint); } };
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; seen = true; queue(); }, { passive: true });
  // Scrolling moves the plates under a still pointer.
  addEventListener("scroll", queue, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    for (const el of plates) { el.style.removeProperty("--lx"); el.style.removeProperty("--ly"); }
  });
}

copyButtons();
// Links marked data-track: counted by where on the page they are.
for (const a of document.querySelectorAll("a[data-track]")) a.addEventListener("click", () => count("link", { to: a.dataset.track }));
metalLight();
heroLoop();
veilClear();
liveField($(".hero .field"));
barPalette();
setupScan();
