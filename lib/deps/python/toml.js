/**
 * A small TOML reader for Python lockfiles and pyproject.toml.
 *
 * Covers what poetry.lock, uv.lock, pdm.lock, Pipfile and pyproject.toml use:
 * tables, arrays of tables, dotted keys, basic/literal/multi-line strings,
 * integers, floats, booleans, dates (kept as strings), multi-line arrays and
 * inline tables. Not a validating parser: malformed input yields a best-effort
 * object or throws, never runs anything. Linear in the input size. Arrays
 * and inline tables nest at most MAX_DEPTH deep, so hostile input throws a
 * TOML error instead of overflowing the stack.
 */

const MAX_DEPTH = 200;

class Reader {
  constructor(src) {
    this.s = src.replace(/\r\n/g, "\n");
    this.i = 0;
    this.depth = 0;
  }

  /** Enter a nested array or inline table. */
  nest() {
    if (++this.depth > MAX_DEPTH) this.error(`nested deeper than ${MAX_DEPTH} levels`);
  }

  peek(n = 0) { return this.s[this.i + n]; }
  eof() { return this.i >= this.s.length; }

  error(msg) {
    const line = this.s.slice(0, this.i).split("\n").length;
    throw new Error(`TOML: ${msg} at line ${line}`);
  }

  /** Skip spaces and tabs (and, with nl, newlines and comments). */
  ws(nl = false) {
    while (!this.eof()) {
      const c = this.peek();
      if (c === " " || c === "\t") this.i++;
      else if (nl && c === "\n") this.i++;
      else if (c === "#") { while (!this.eof() && this.peek() !== "\n") this.i++; }
      else break;
    }
  }

  key() {
    this.ws();
    const c = this.peek();
    if (c === '"' || c === "'") return this.string();
    const start = this.i;
    while (!this.eof() && /[A-Za-z0-9_-]/.test(this.peek())) this.i++;
    if (start === this.i) this.error("expected a key");
    return this.s.slice(start, this.i);
  }

  dottedKey() {
    const parts = [this.key()];
    this.ws();
    while (this.peek() === ".") {
      this.i++;
      parts.push(this.key());
      this.ws();
    }
    return parts;
  }

  string() {
    const q = this.peek();
    const triple = this.s.startsWith(q.repeat(3), this.i);
    if (triple) {
      this.i += 3;
      if (this.peek() === "\n") this.i++; // a newline right after the opener is trimmed
      let out = "";
      while (!this.eof()) {
        if (this.s.startsWith(q.repeat(3), this.i) && this.peek(3) !== q) { this.i += 3; return out; }
        const c = this.peek();
        if (q === '"' && c === "\\") {
          if (this.peek(1) === "\n" || /[ \t]/.test(this.peek(1) || "")) { // line-ending backslash
            this.i++;
            while (!this.eof() && /[ \t\n]/.test(this.peek())) this.i++;
            continue;
          }
          out += this.escape();
          continue;
        }
        out += c;
        this.i++;
      }
      this.error("unterminated string");
    }
    this.i++;
    let out = "";
    while (!this.eof() && this.peek() !== q) {
      if (this.peek() === "\n") this.error("newline in string");
      if (q === '"' && this.peek() === "\\") { out += this.escape(); continue; }
      out += this.peek();
      this.i++;
    }
    this.i++;
    return out;
  }

  escape() {
    const c = this.peek(1);
    this.i += 2;
    const map = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
    if (c in map) return map[c];
    if (c === "u" || c === "U") {
      const len = c === "u" ? 4 : 8;
      const hex = this.s.slice(this.i, this.i + len);
      this.i += len;
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    }
    return c || "";
  }

  value() {
    this.ws();
    const c = this.peek();
    if (c === '"' || c === "'") return this.string();
    if (c === "[") return this.array();
    if (c === "{") return this.inlineTable();
    const start = this.i;
    while (!this.eof() && !/[,\]}\n#]/.test(this.peek())) this.i++;
    const raw = this.s.slice(start, this.i).trim();
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^[+-]?\d[\d_]*$/.test(raw)) return parseInt(raw.replace(/_/g, ""), 10);
    if (/^[+-]?(?:\d[\d_]*)?(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?$/.test(raw) && raw !== "") return parseFloat(raw.replace(/_/g, ""));
    if (raw === "") this.error("expected a value");
    return raw; // dates, inf, nan: kept as text
  }

  array() {
    this.nest();
    this.i++;
    const out = [];
    for (;;) {
      this.ws(true);
      if (this.peek() === "]") { this.i++; this.depth--; return out; }
      if (this.eof()) this.error("unterminated array");
      out.push(this.value());
      this.ws(true);
      if (this.peek() === ",") this.i++;
      else if (this.peek() !== "]") this.error("expected , or ]");
    }
  }

  inlineTable() {
    this.nest();
    this.i++;
    const out = {};
    for (;;) {
      this.ws(true);
      if (this.peek() === "}") { this.i++; this.depth--; return out; }
      if (this.eof()) this.error("unterminated inline table");
      const k = this.dottedKey();
      this.ws();
      if (this.peek() !== "=") this.error("expected =");
      this.i++;
      setPath(out, k, this.value());
      this.ws(true);
      if (this.peek() === ",") this.i++;
    }
  }
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function setPath(obj, keys, value) {
  let t = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(t[k])) t[k] = {};
    t = t[k];
  }
  t[keys[keys.length - 1]] = value;
}

/** Walk to a table header path; the last element of an array of tables counts as the table. */
function tableAt(root, keys, create) {
  let t = root;
  for (const k of keys) {
    let next = t[k];
    if (Array.isArray(next)) next = next[next.length - 1];
    if (!isObj(next)) {
      if (!create) return null;
      next = t[k] = {};
    }
    t = next;
  }
  return t;
}

/** Parse TOML text into a plain object. */
export function parseToml(src) {
  const r = new Reader(String(src));
  const root = {};
  let current = root;
  for (;;) {
    r.ws(true);
    if (r.eof()) break;
    if (r.peek() === "[") {
      const isArray = r.peek(1) === "[";
      r.i += isArray ? 2 : 1;
      const keys = r.dottedKey();
      r.ws();
      if (!r.s.startsWith(isArray ? "]]" : "]", r.i)) r.error("expected ]");
      r.i += isArray ? 2 : 1;
      if (isArray) {
        const parent = tableAt(root, keys.slice(0, -1), true);
        const last = keys[keys.length - 1];
        if (!Array.isArray(parent[last])) parent[last] = [];
        const t = {};
        parent[last].push(t);
        current = t;
      } else {
        current = tableAt(root, keys, true);
      }
      continue;
    }
    const k = r.dottedKey();
    r.ws();
    if (r.peek() !== "=") r.error("expected =");
    r.i++;
    setPath(current, k, r.value());
    r.ws();
    if (!r.eof() && r.peek() !== "\n") r.error("expected end of line");
  }
  return root;
}
