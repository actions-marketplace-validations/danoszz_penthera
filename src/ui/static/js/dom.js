// DOM helpers. Everything is built with createElement and textContent: report
// data (finding titles, evidence, diffs) comes from scanned sites and repos,
// so it is never parsed as HTML. No HTML string is ever assigned anywhere in the UI.

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : v);
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** h("div", { class: "x", onclick }, child, "text") */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

/** SVG element. */
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

/**
 * Empty an element. Returns a null-safe appender: native Element.append()
 * turns null into the text "null", which is how a stray conditional child
 * once rendered "null" in the menu bar. Everything goes through append() below.
 */
export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return { append: (...children) => { append(el, children); return el; } };
}

/** Null-safe append for an existing element. */
export function put(el, ...children) {
  append(el, children);
  return el;
}

export const sevClass = (sev) => `sev sev-${sev || "info"}`;
export const sevBadge = (sev) => h("span", { class: sevClass(sev) }, sev || "info");

export function empty(text) {
  return h("p", { class: "empty" }, text);
}

export function announce(text) {
  const el = document.getElementById("announce");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = text; }, 30);
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One light above the metal plates, as on penthera.org. With a mouse the
 * pointer carries it: every .plate gets the pointer in its own coordinates,
 * so they all catch the same light. Off with reduced motion and on touch.
 */
export function metalLight() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches || prefersReducedMotion()) return;
  let x = 0, y = 0, queued = false;
  const paint = () => {
    queued = false;
    for (const el of document.querySelectorAll(".plate")) {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--lx", `${Math.round(x - r.left)}px`);
      el.style.setProperty("--ly", `${Math.round(y - r.top)}px`);
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; queue(); }, { passive: true });
  // Scrolling a window moves its plates under a still pointer.
  addEventListener("scroll", queue, { passive: true, capture: true });
  document.documentElement.addEventListener("pointerleave", () => {
    for (const el of document.querySelectorAll(".plate")) { el.style.removeProperty("--lx"); el.style.removeProperty("--ly"); }
  });
}

/** Colour a unified diff line by line (still plain text nodes). */
export function diffBlock(diff) {
  const pre = h("pre", { class: "block diff", tabindex: "0", "aria-label": "Diff preview" });
  for (const line of String(diff || "").split("\n")) {
    const cls = line.startsWith("+++") || line.startsWith("---") ? "meta"
      : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : null;
    pre.append(h("span", { class: cls }, `${line}\n`));
  }
  return pre;
}
