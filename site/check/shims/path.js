/** POSIX node:path, enough for lib/. The page's working directory is /repo. */
export const sep = "/";
export const delimiter = ":";
const CWD = "/repo";

export function normalize(p) {
  const abs = p.startsWith("/");
  const out = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (out.length && out.at(-1) !== "..") out.pop(); else if (!abs) out.push(".."); continue; }
    out.push(part);
  }
  const s = (abs ? "/" : "") + out.join("/");
  return s || (abs ? "/" : ".");
}

export function join(...parts) {
  const s = parts.filter((p) => p !== "").join("/");
  return s ? normalize(s) : ".";
}

export function resolve(...parts) {
  let p = "";
  for (let i = parts.length - 1; i >= 0 && !p.startsWith("/"); i--) p = parts[i] + (p ? "/" + p : "");
  if (!p.startsWith("/")) p = CWD + (p ? "/" + p : "");
  return normalize(p);
}

export function isAbsolute(p) { return p.startsWith("/"); }

export function dirname(p) {
  const n = normalize(p);
  const i = n.lastIndexOf("/");
  if (i < 0) return ".";
  return i === 0 ? "/" : n.slice(0, i);
}

export function basename(p, ext) {
  const b = normalize(p).split("/").pop() || "";
  return ext && b.endsWith(ext) && b !== ext ? b.slice(0, -ext.length) : b;
}

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i) : "";
}

export function relative(from, to) {
  const a = resolve(from).split("/").filter(Boolean);
  const b = resolve(to).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

export const posix = { sep, delimiter, normalize, join, resolve, isAbsolute, dirname, basename, extname, relative };
export default posix;
