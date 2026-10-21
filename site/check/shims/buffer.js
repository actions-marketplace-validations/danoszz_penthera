/**
 * The part of Node's Buffer that lib/ uses, on a Uint8Array. TypedArray
 * methods such as subarray() return this class too, so `buf.subarray(0, 4)
 * .toString("latin1")` behaves as it does in Node.
 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));
B64_INDEX.set("-", 62).set("_", 63);

const enc = new TextEncoder();

function normEncoding(e = "utf8") {
  const n = String(e).toLowerCase().replace("-", "");
  if (n === "binary") return "latin1";
  return n;
}

function decodeBase64(s) {
  // Node ignores characters outside the alphabet and stops at padding.
  const out = [];
  let acc = 0, bits = 0;
  for (const c of s) {
    if (c === "=") break;
    const v = B64_INDEX.get(c);
    if (v === undefined) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return out;
}

function encodeBase64(bytes, url) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [B64[(n >> 18) & 63], B64[(n >> 12) & 63], B64[(n >> 6) & 63], B64[n & 63]];
    const keep = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    s += chars.slice(0, keep).join("") + (url ? "" : "=".repeat(4 - keep));
  }
  return url ? s.replace(/\+/g, "-").replace(/\//g, "_") : s;
}

export class Buffer extends Uint8Array {
  static alloc(n) { return new Buffer(n); }

  static isBuffer(b) { return b instanceof Buffer; }

  static from(value, encoding) {
    if (typeof value === "string") {
      const e = normEncoding(encoding);
      if (e === "utf8") return new Buffer(enc.encode(value));
      if (e === "latin1" || e === "ascii") return new Buffer([...value].map((c) => c.charCodeAt(0) & 0xff));
      if (e === "hex") return new Buffer((value.match(/[0-9a-f]{2}/gi) || []).map((h) => parseInt(h, 16)));
      if (e === "base64" || e === "base64url") return new Buffer(decodeBase64(value));
      throw new Error(`Buffer.from: unsupported encoding ${encoding}`);
    }
    if (value instanceof ArrayBuffer) return new Buffer(new Uint8Array(value));
    return new Buffer(value);
  }

  static concat(list) {
    const out = new Buffer(list.reduce((n, b) => n + b.length, 0));
    let off = 0;
    for (const b of list) { out.set(b, off); off += b.length; }
    return out;
  }

  toString(encoding, start = 0, end = this.length) {
    const view = this.subarray(start, end);
    const e = normEncoding(encoding);
    if (e === "utf8") return new TextDecoder("utf-8").decode(view);
    if (e === "latin1" || e === "ascii") { let s = ""; for (const b of view) s += String.fromCharCode(b); return s; }
    if (e === "hex") return [...view].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (e === "base64") return encodeBase64(view, false);
    if (e === "base64url") return encodeBase64(view, true);
    throw new Error(`Buffer.toString: unsupported encoding ${encoding}`);
  }

  equals(other) {
    if (!other || other.length !== this.length) return false;
    for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
    return true;
  }

  readUInt32BE(off = 0) {
    if (off + 4 > this.length) throw new RangeError("readUInt32BE out of range");
    return ((this[off] << 24) >>> 0) + (this[off + 1] << 16) + (this[off + 2] << 8) + this[off + 3];
  }

  includes(value, from) {
    if (typeof value === "string") return this.toString("latin1").includes(value, from);
    return super.includes(value, from);
  }
}

export default { Buffer };
