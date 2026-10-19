// Hand-rolled charts: text bars made of block characters, and small SVGs.
// Every chart carries its numbers as text (a label or aria-label), so colour
// is never the only channel.
import { h, s } from "./dom.js";
import { SEVERITIES, stamp } from "./format.js";

const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** A bar of `width` characters, filled to value/max with eighth-blocks. */
export function textBar(value, max, width = 24) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const eighths = Math.round(ratio * width * 8);
  const full = Math.floor(eighths / 8);
  const part = EIGHTHS[eighths % 8];
  const filled = "█".repeat(full) + part;
  const rest = Math.max(0, width - full - (part ? 1 : 0));
  return { filled, rest: "·".repeat(rest) };
}

/** Rows of label / bar / count, e.g. a severity mix. */
export function bars(rows, { width = 24, cls = (r) => r.cls, fill = (r) => r.fill || cls(r) } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const el = h("div", { class: "bars", role: "list" });
  for (const r of rows) {
    const { filled, rest } = textBar(r.value, max, width);
    el.append(
      h("span", { class: cls(r), role: "listitem", "aria-label": `${r.label}: ${r.value}` }, r.label),
      h("span", { class: "bar", "aria-hidden": "true" }, h("span", { class: fill(r) }, filled), h("span", { class: "track" }, rest)),
      h("span", { class: "num", "aria-hidden": "true" }, String(r.value)),
    );
  }
  return el;
}

export function severityBars(counts, opts = {}) {
  return bars(SEVERITIES.map((sev) => ({ label: sev, value: counts?.[sev] || 0, cls: `sev sev-${sev}`, fill: `c-${sev}` })), opts);
}

/** One stacked bar across all severities (SVG, so no inline styles are needed). */
export function stackedBar(counts, { height = 8 } = {}) {
  const total = SEVERITIES.reduce((n, k) => n + (counts?.[k] || 0), 0);
  const svg = s("svg", {
    class: "chart stackbar", viewBox: `0 0 100 ${height}`, preserveAspectRatio: "none",
    role: "img", "aria-label": SEVERITIES.map((k) => `${counts?.[k] || 0} ${k}`).join(", "),
  });
  svg.append(s("rect", { class: "seg-track", x: 0, y: 0, width: 100, height }));
  let x = 0;
  for (const k of SEVERITIES) {
    const w = total ? ((counts?.[k] || 0) / total) * 100 : 0;
    if (w > 0) svg.append(s("rect", { class: `seg-${k}`, x, y: 0, width: w, height }));
    x += w;
  }
  return svg;
}

/** Tiny line, last point marked. */
export function sparkline(values, { width = 140, height = 24, label = "trend", zero = true } = {}) {
  const vs = values.filter((v) => Number.isFinite(v));
  const svg = s("svg", {
    class: "spark", viewBox: `0 0 ${width} ${height}`, role: "img",
    "aria-label": vs.length ? `${label}: ${vs.join(", ")}` : `${label}: no data`,
  });
  if (vs.length < 2) {
    svg.append(s("line", { x1: 0, y1: height / 2, x2: width, y2: height / 2, stroke: "#1f3d1a", "stroke-dasharray": "2 3" }));
    return svg;
  }
  const max = Math.max(...vs, 1);
  const min = zero ? Math.min(...vs, 0) : Math.min(...vs) - 2;
  const pad = 3;
  const pts = vs.map((v, i) => [pad + (i * (width - pad * 2)) / (vs.length - 1), height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2)]);
  svg.append(s("polyline", { class: "s-line", points: pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ") }));
  const last = pts[pts.length - 1];
  svg.append(s("circle", { class: "s-dot", cx: last[0], cy: last[1], r: 2 }));
  return svg;
}

/**
 * Findings over time: total open (green, filled) and critical+high (red, dashed).
 * @param {{ ts: string, total: number, severe: number }[]} points
 */
export function trendChart(points, { width = 640, height = 180 } = {}) {
  const m = { l: 30, r: 10, t: 10, b: 22 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const max = Math.max(1, ...points.map((p) => p.total));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const x = (i) => m.l + (points.length < 2 ? iw / 2 : (i * iw) / (points.length - 1));
  const y = (v) => m.t + ih - (v / nice) * ih;
  const svg = s("svg", {
    class: "chart", viewBox: `0 0 ${width} ${height}`, role: "img",
    "aria-label": points.length
      ? `Open findings over ${points.length} scans: from ${points[0].total} to ${points[points.length - 1].total}; critical and high from ${points[0].severe} to ${points[points.length - 1].severe}`
      : "No scans yet",
  });
  for (let i = 0; i <= 5; i++) {
    const v = (nice / 5) * i;
    svg.append(s("line", { class: i ? "grid-line" : "axis", x1: m.l, x2: width - m.r, y1: y(v), y2: y(v) }));
    svg.append(s("text", { class: "tick", x: m.l - 6, y: y(v) + 3, "text-anchor": "end" }, String(Math.round(v))));
  }
  if (!points.length) return svg;
  const line = (key) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  svg.append(s("path", { class: "area-total", d: `${line("total")}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` }));
  svg.append(s("path", { class: "line-total", d: line("total") }));
  svg.append(s("path", { class: "line-severe", d: line("severe") }));
  points.forEach((p, i) => {
    svg.append(s("circle", { class: "dot", cx: x(i), cy: y(p.total), r: 2.2 }, s("title", {}, `${stamp(p.ts)}: ${p.total} open, ${p.severe} critical/high`)));
  });
  const ticks = points.length <= 6 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  for (const i of ticks) {
    svg.append(s("text", { class: "tick", x: x(i), y: height - 6, "text-anchor": i === 0 ? "start" : i === points.length - 1 ? "end" : "middle" }, stamp(points[i].ts).slice(5, 10)));
  }
  return svg;
}

/** Vertical columns with value labels (time-to-fix buckets, etc). */
export function columns(items, { width = 320, height = 130, label = "distribution" } = {}) {
  const m = { t: 16, b: 20 };
  const max = Math.max(1, ...items.map((i) => i.n));
  const bw = width / items.length;
  const svg = s("svg", { class: "chart", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${label}: ${items.map((i) => `${i.label} ${i.n}`).join(", ")}` });
  svg.append(s("line", { class: "axis", x1: 0, x2: width, y1: height - m.b, y2: height - m.b }));
  items.forEach((it, i) => {
    const hgt = ((height - m.t - m.b) * it.n) / max;
    const x0 = i * bw + bw * 0.22;
    svg.append(s("rect", { class: "col", x: x0, y: height - m.b - hgt, width: bw * 0.56, height: Math.max(hgt, it.n ? 1 : 0) }));
    svg.append(s("text", { class: "col-value", x: i * bw + bw / 2, y: height - m.b - hgt - 4, "text-anchor": "middle" }, String(it.n)));
    svg.append(s("text", { class: "col-label", x: i * bw + bw / 2, y: height - 5, "text-anchor": "middle" }, it.label));
  });
  return svg;
}

const BIG = {
  A: [" ▄▀▀▄ ", "█▄▄▄█", "█   █"],
  B: ["█▀▀▄", "█▀▀▄", "█▄▄▀"],
  C: ["▄▀▀▀", "█   ", "▀▄▄▄"],
  D: ["█▀▀▄", "█  █", "█▄▄▀"],
  F: ["█▀▀▀", "█▀▀ ", "█   "],
};

/** The agent-config grade as a block-letter. */
export function bigGrade(letter) {
  const rows = BIG[letter] || ["", letter || "?", ""];
  return h("pre", { class: `grade-big grade-${letter}`, "aria-hidden": "true" }, rows.join("\n"));
}
