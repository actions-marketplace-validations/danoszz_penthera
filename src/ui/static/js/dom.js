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

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** A framed panel with a box-drawing title. */
export function panel(title, attrs, ...children) {
  const id = `p-${Math.random().toString(36).slice(2, 9)}`;
  return h("section", { class: ["panel", attrs?.class], "aria-labelledby": id },
    h("h2", { class: "panel-h", id }, title),
    ...children);
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
