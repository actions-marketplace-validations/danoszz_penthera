/**
 * Static capability detection for npm packages (`penthera deps`).
 *
 * For one package, answer "what can this code do?": run at install time, spawn
 * a shell, open sockets, write outside its folder, read the environment, build
 * code at runtime, load native binaries. Plus signals that a package is hiding
 * something (obfuscation) and indicators from real attacks (writing AI agent
 * config, driving AI CLIs to search the disk, harvesting GitHub tokens).
 *
 * Deliberately simple and deterministic: comments are blanked by a small
 * tokenizer, then line-level patterns run over the code. No AST, no network, no
 * model. Every capability carries file:line evidence so a human can check it.
 * A regex pass misses things a determined attacker can hide; that is why the
 * obfuscation signals exist, and why the output says "capability" rather than
 * "safe".
 *
 * Literals that name attack indicators are assembled at runtime so Penthera's
 * own source does not read like the payloads it looks for.
 */

const j = (...parts) => parts.join("");

/** Capability catalogue. `severity` is used when a package newly gains it. */
export const CAPABILITIES = {
  "install-scripts": { label: "install script", severity: "high", confidence: "confirmed",
    why: "Runs code on `npm install`, before you have used or reviewed the package." },
  shell: { label: "shell", severity: "medium", confidence: "likely",
    why: "Can run arbitrary programs through child_process." },
  network: { label: "network", severity: "medium", confidence: "likely",
    why: "Can open network connections (http, https, net, dgram, tls, fetch, WebSocket)." },
  "fs-write": { label: "writes outside its folder", severity: "medium", confidence: "potential",
    why: "Writes files and refers to the home directory or system paths." },
  env: { label: "env vars", severity: "low", confidence: "likely",
    why: "Reads process.env." },
  "env-bulk": { label: "whole environment", severity: "medium", confidence: "likely",
    why: "Serialises or enumerates all of process.env, which holds tokens and keys." },
  eval: { label: "dynamic code", severity: "medium", confidence: "likely",
    why: "Builds code at runtime with eval, new Function or vm." },
  "dynamic-require": { label: "computed require/import", severity: "low", confidence: "likely",
    why: "Loads modules whose names are computed at runtime." },
  native: { label: "native binary", severity: "low", confidence: "confirmed",
    why: "Ships or builds native code (.node, binding.gyp) that this scanner cannot read." },
  obfuscated: { label: "obfuscated", severity: "high", confidence: "potential",
    why: "Code looks deliberately hidden (obfuscator identifiers, escape-heavy strings, encoded blobs fed to eval)." },
  "ai-config-write": { label: "writes AI agent config", severity: "critical", confidence: "likely",
    why: "Writes AI assistant config (~/.claude, ~/.cursor, .mcp.json, Claude Desktop config). A dependency has no business doing this." },
  "ai-cli-invoke": { label: "drives AI CLIs", severity: "critical", confidence: "likely",
    why: "Runs an AI coding CLI (claude, gemini, q), the pattern used by the s1ngularity attack to search the disk for secrets." },
  "token-harvest": { label: "GitHub token harvesting", severity: "critical", confidence: "likely",
    why: "Reads GitHub credentials: runs the gh CLI to print its token, reads gh's hosts file or git's credential store, or matches token-shaped strings next to network code." },
  // Python only (lib/deps/python): code that runs whenever the interpreter starts, and unpickling.
  "startup-hook": { label: "runs at Python startup", severity: "high", confidence: "confirmed",
    why: "Ships a .pth file with an import line (or a sitecustomize.py), or writes one. Python runs that code on every interpreter start in that environment, so installing the package is enough to run it: a known persistence and supply-chain trick." },
  deserialize: { label: "unpickles data", severity: "low", confidence: "likely",
    why: "Loads pickle, marshal or unsafe YAML data, which runs code if the data is attacker-controlled." },
};

/** Python wording for capabilities whose npm description names npm or Node APIs. */
const PY_WHY = {
  "install-scripts": "Runs code at install time: a setup.py with custom commands, or an in-tree build backend, executes when pip builds the package from source.",
  shell: "Can run arbitrary programs (subprocess, os.system, os.popen, pty).",
  network: "Can open network connections (socket, urllib, requests, httpx, aiohttp and similar).",
  env: "Reads os.environ.",
  "env-bulk": "Serialises or enumerates all of os.environ, which holds tokens and keys.",
  eval: "Builds code at runtime with eval, exec or compile.",
  "dynamic-require": "Imports modules whose names are computed at runtime (__import__, importlib).",
  native: "Ships native extensions (.so, .pyd) or loads libraries with ctypes, which this scanner cannot read.",
  obfuscated: "Code looks deliberately hidden (encoded blobs or compressed payloads handed to exec, escape-heavy strings, PyArmor).",
  "ai-cli-invoke": "Runs an AI coding CLI (claude, gemini, q) through a subprocess, the pattern used by the s1ngularity attack to search the disk for secrets.",
};

/** Why a capability matters, worded for the package's ecosystem. */
export const capabilityWhy = (id, ecosystem) => (ecosystem === "pypi" && PY_WHY[id]) || CAPABILITIES[id]?.why || id;

/** Stable display order. */
export const CAPABILITY_ORDER = Object.keys(CAPABILITIES);

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
export const maxSeverity = (sevs) => sevs.reduce((m, s) => (SEV_RANK[s] > SEV_RANK[m] ? s : m), "info");

const JS_EXT = /\.(c|m)?jsx?$/i;
// Large enough for real bundles (typescript.js and editor workers are 9-13 MB),
// and the same as the tarball reader's per-file cap (source.js MAX_FILE_BYTES).
// A file over it is not read, and the package is then unscanned, never clean.
const MAX_JS_BYTES = 64 * 1024 * 1024;
const MAX_EVIDENCE = 5;
const EXFIL_WINDOW = 40; // lines
const NEAR_WINDOW = 30; // lines
const PAYLOAD_WINDOW = 3000; // characters

// ── Tokenizer: blank comments, keep strings and line numbers ─────────────

const REGEX_PREV = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await|delete|instanceof|new|throw)$/;

/**
 * Replace comment bodies with spaces (newlines preserved) so patterns don't
 * fire on documentation. Strings, template literals and regex literals are
 * skipped over intact. Heuristic, not a full parser.
 */
export function blankComments(src) {
  const n = src.length;
  const parts = [];
  let last = 0;
  let i = 0;
  let prev = ""; // previous significant character
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") {
      let end = src.indexOf("\n", i);
      if (end === -1) end = n;
      parts.push(src.slice(last, i), " ".repeat(end - i));
      i = last = end;
      continue;
    }
    if (ch === "/" && nx === "*") {
      let end = src.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      parts.push(src.slice(last, i), blank(src.slice(i, end)));
      i = last = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < n && src[i] !== ch && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i++;
      prev = ch;
      continue;
    }
    if (ch === "`") {
      i++;
      while (i < n && src[i] !== "`") i += src[i] === "\\" ? 2 : 1;
      i++;
      prev = ch;
      continue;
    }
    if (ch === "/") {
      const isRegex = prev === "" || REGEX_PREV.has(prev) ||
        (/[\w$]/.test(prev) && REGEX_KEYWORDS.test(src.slice(Math.max(0, i - 12), i).trimEnd()));
      if (isRegex) {
        i++;
        let inClass = false;
        while (i < n && src[i] !== "\n") {
          const c = src[i];
          if (c === "\\") { i += 2; continue; }
          if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) break;
          i++;
        }
        i++;
        prev = "a"; // a regex literal behaves like an operand
        continue;
      }
    }
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") prev = ch;
    i++;
  }
  parts.push(src.slice(last));
  return parts.join("");
}

// ── Patterns ──────────────────────────────────────────────────────────────

/** require("x") / import "x" / from "x" / import("x"), with optional node: prefix and subpath. */
const moduleRe = (mods) => new RegExp(
  String.raw`(?:(?<![\w$.])require\s*\(\s*|\bfrom\s*|(?<![\w$.])import\s*\(\s*|(?<![\w$.])import\s+)(['"\`])(?:node:)?(?:${mods})(?:\/[\w/]*)?\1`,
);

// process.env, also written as process["env"] to dodge simple pattern matches.
const PENV = String.raw`process(?:\.env\b|\[\s*['"\`]env['"\`]\s*\])`;

const P = {
  shell: [moduleRe("child_process"), /process\.binding\(\s*['"]spawn_sync['"]/],
  network: [
    moduleRe("http|https|http2|net|dgram|tls"),
    /(?<![\w$.]|function\s{1,4}|\bfunction\s*\*?\s*)fetch\s*\(\s*[^)\s]/,
    /\bnew\s+(?:WebSocket|XMLHttpRequest)\s*\(/,
    /\bnavigator\.sendBeacon\s*\(/,
  ],
  env: [new RegExp(String.raw`\b${PENV}`)],
  envSerialise: new RegExp(String.raw`\bJSON\.stringify\(\s*${PENV}\s*[,)]|\bBuffer\.from\(\s*JSON\.stringify\(\s*${PENV}`),
  envBulk: [
    new RegExp(String.raw`\bJSON\.stringify\(\s*${PENV}\s*[,)]`),
    new RegExp(String.raw`\bObject\.(?:keys|entries|values)\(\s*${PENV}\s*\)`),
    new RegExp(String.raw`\bfor\s*\(\s*(?:const|let|var)?\s*[\w$]+\s+in\s+${PENV}\s*\)`),
  ],
  eval: [
    /(?<![\w$.])eval\s*\(/,
    /\bnew\s+Function\s*\((?!\s*['"`]return this['"`]\s*\))/,
    /(?<![\w$.]|new\s{1,4})Function\s*\((?!\s*\))(?!\s*['"`]return this['"`]\s*\))/,
    moduleRe("vm"),
  ],
  dynamicRequire: [
    /(?<![\w$.]|function\s{1,4})require\s*\(\s*(?![\s'")]|`[^`$]*`)/,
    /(?<![\w$.])import\s*\(\s*(?![\s'")]|`[^`$]*`)/,
  ],
  native: [/\bprocess\.dlopen\s*\(/],
  fsReadCall: /\b(?:readFile|readFileSync|createReadStream)\s*\(/,
  fsWriteCall: /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|copyFile|copyFileSync|cpSync|rename|renameSync|symlink|symlinkSync|outputFile|outputFileSync|writeJson|writeJsonSync|chmod|chmodSync)\s*\(/,
  outsidePath: /\b(?:os\.)?homedir\s*\(\s*\)|process\.env\.(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|XDG_CONFIG_HOME)\b|['"`]~\/|['"`]\/(?:etc|usr|var|Library|System)\/|['"`][A-Z]:\\\\(?:Windows|Users)/,
  dataUri: /data:(?:image|font|audio|video)\/[\w.+-]+;base64,$/,
};

// Attack indicators, assembled at runtime.
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AI_CONFIG_TARGETS = [j(".cl", "aude"), j(".cur", "sor"), j(".m", "cp.json"), j("claude_", "desktop_", "config.json")];
const AI_CONFIG_RE = new RegExp(
  `['"\`/\\\\](?:${AI_CONFIG_TARGETS.map(escRe).join("|")})(?:['"\`/\\\\]|$)`,
);
const DESKTOP_CONFIG_RE = new RegExp(escRe(AI_CONFIG_TARGETS[3]));
const AI_CLIS = [j("cla", "ude"), j("gem", "ini"), "q"];
const AI_CLI_CALL_RE = new RegExp(
  String.raw`\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|execa|execaSync)\s*\(\s*['"\`](?:${AI_CLIS.join("|")})(?:['"\`]|\s)`,
);
const AI_CLI_FLAGS = [j("--dangerously", "-skip-", "permissions"), j("--yo", "lo"), j("--trust-", "all-", "tools")];
const AI_CLI_FLAG_RE = new RegExp(`['"\`\\s](?:${AI_CLI_FLAGS.join("|")})(?:['"\`\\s]|$)`);
const GH_TOKEN_CMD_RE = new RegExp(j("\\bgh\\s+auth\\s+", "token\\b"));
const GH_CRED_FILE_RE = new RegExp(`(?:${j("\\.git-", "credentials")}|${j("gh[/\\\\\\\\]", "hosts\\.yml")})`);
const GH_TOKEN_REGEX_RE = new RegExp(`(?:${j("gh", "p_")}|${j("gh", "o_")}|${j("github", "_pat_")}|${j("gh", "\\[pousr")}|${j("gh", "\\[ps")})`);

/** Attack-indicator patterns shared with the Python scanner (lib/deps/python). */
export const INDICATORS = {
  AI_CONFIG_RE, DESKTOP_CONFIG_RE, AI_CLIS, AI_CLI_FLAG_RE, GH_TOKEN_CMD_RE, GH_CRED_FILE_RE, GH_TOKEN_REGEX_RE,
};

const DECODE_RE = /\batob\s*\(|\bBuffer\.from\([^)]*['"`](?:base64|hex)['"`]|String\.fromCharCode\s*\(|\bdecodeURIComponent\s*\(\s*escape\s*\(/;

const SUSPICIOUS_INSTALL_CMD = /\b(?:curl|wget|powershell|Invoke-WebRequest|iwr)\b|\|\s*(?:ba)?sh\b|base64\s+(?:-d|--decode)/i;
// Shell commands that send data out without an HTTP client: DNS lookups or
// pings of a computed or dotted name, raw sockets, and hex-encoding for them.
const SHELL_SEND_CMD = new RegExp([
  String.raw`\b(?:${j("nsl", "ookup")}|dig|host|ping)\s+(?:-\S+\s+)*[^\s'"\`]*(?:\$\(|\$\{|\`|[\w-]+\.[a-z]{2,})`,
  String.raw`\/dev\/(?:tcp|udp)\/`,
  String.raw`\b(?:nc|ncat|netcat|telnet)\s+(?:-\w+\s+)*[\w.$\{\}-]+\s+\d{2,5}\b`,
  String.raw`\bxxd\s+-p\b`,
].join("|"), "i");
// Cheap pre-filter for the two above: one of their words is on the line.
const CMD_HINT = new RegExp(`curl|wget|owershell|ebRequest|iwr|sh\\b|base64|${j("ook", "up")}|dig|host|ping|/dev/|nc|telnet|xxd`, "i");
/** A command string an install hook should not run: it downloads, pipes to a shell, or sends data out. */
const INSTALL_SHELL_CMD = new RegExp(`${SUSPICIOUS_INSTALL_CMD.source}|${SHELL_SEND_CMD.source}`, "i");
// require() of a module name decoded at runtime: the name is hidden on purpose.
const DECODED_REQUIRE_RE = /(?<![\w$.])require\s*\(\s*(?:Buffer\.from\s*\(|atob\s*\(|String\.fromCharCode\s*\(|decodeURIComponent\s*\(|unescape\s*\()/;
// Starting another node script: spawn("node", [file]), spawn(process.execPath, [...]), fork(file), exec("node file").
const SPAWN_CALL_RE = /\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\(/g;
const EXEC_NODE_RE = /\bexec(?:Sync)?\s*\(\s*['"`]node\s+(?:-\S+\s+)*((?:\.{0,2}\/)?[\w./-]+)/;
const SCRIPT_LITERAL_RE = /['"`]((?:\.{0,2}\/)?[\w./-]+\.(?:c|m)?js)['"`]/;
export const RISKY_FOR_INSTALL = ["network", "eval", "obfuscated", "env-bulk", "ai-config-write", "ai-cli-invoke", "token-harvest"];

// ── Helpers ───────────────────────────────────────────────────────────────

export function snippet(line, idx) {
  const start = Math.max(0, idx - 40);
  const s = line.slice(start, start + 120).trim();
  return (start > 0 ? "…" : "") + s + (start + 120 < line.length ? "…" : "");
}

export function add(caps, id, ev) {
  const list = caps[id] || (caps[id] = { count: 0, evidence: [] });
  list.count++;
  if (list.evidence.length < MAX_EVIDENCE) list.evidence.push(ev);
}

/** Shannon entropy in bits per character. */
export function entropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Obfuscation signals for one file (comment-blanked code).
 * Returns { flagged, signals: string[], line }.
 */
export function obfuscationSignals(code, { hasDynamicCode = false, evalRes = P.eval, decodeRe = DECODE_RE, strongEscapes = true } = {}) {
  const signals = [];
  let line = 1;
  let strong = 0;

  const obfIds = code.match(/\b_0x[0-9a-f]{4,6}\b/g);
  if (obfIds && obfIds.length >= 10) {
    strong++;
    signals.push(`${obfIds.length} obfuscator-style identifiers (_0x…)`);
    line = lineOf(code, code.search(/\b_0x[0-9a-f]{4,6}\b/));
  }

  // Printable characters only: ANSI colour codes (\x1b) and control bytes are normal.
  const hexEsc = code.match(/\\x[2-7][0-9a-fA-F]/g);
  if (hexEsc && hexEsc.length >= 50 && (hexEsc.length * 4) / code.length >= 0.05) {
    if (strongEscapes) strong++;
    signals.push(`\\x escape density ${Math.round(((hexEsc.length * 4) / code.length) * 100)}%`);
    if (line === 1) line = lineOf(code, code.indexOf("\\x"));
  }

  // Encoded blobs: long base64/hex runs, or shorter runs with high entropy.
  const blobs = [];
  for (const m of code.matchAll(/[A-Za-z0-9+/]{200,}={0,2}|\b[0-9a-fA-F]{400,}\b/g)) {
    const s = m[0];
    const before = code.slice(Math.max(0, m.index - 40), m.index);
    if (P.dataUri.test(before)) continue; // embedded image/font
    if (/^[a-z]+$/i.test(s)) continue; // a long word, not an encoding
    if (s.startsWith("AGFzbQ")) continue; // base64 WebAssembly module ("\0asm"), sandboxed
    const e = entropy(s.slice(0, 4000));
    const isHex = /^[0-9a-fA-F]+$/.test(s);
    if (s.length >= 1000 || (!isHex && e >= 5.0)) {
      blobs.push({ len: s.length, e, index: m.index, end: m.index + s.length, isHex });
      if (blobs.length >= 50) break;
    }
  }

  let longest = 0;
  for (const l of code.split("\n")) if (l.length > longest) longest = l.length;

  // The classic dropper: decode a blob and hand it to eval, all in one place.
  // Requires the blob, a decode call and dynamic code within a few thousand
  // characters of each other; any two of them far apart in a bundle is normal.
  let payload = null;
  if (blobs.length && hasDynamicCode) {
    const offsets = (res) => res.flatMap((re) => [...code.matchAll(new RegExp(re.source, "g"))].map((m) => m.index));
    const evals = offsets(evalRes);
    const decodes = offsets([decodeRe]);
    const near = (b, list) => list.some((o) => o >= b.index - PAYLOAD_WINDOW && o <= b.end + PAYLOAD_WINDOW);
    payload = blobs.find((b) => near(b, evals) && near(b, decodes)) || null;
  }
  const blob = payload || blobs[0];
  if (blob) signals.push(`${blob.isHex ? "hex" : "base64-like"} blob of ${blob.len} chars (entropy ${blob.e.toFixed(1)})`);
  if (longest >= 5000) signals.push(`line of ${longest} chars`);
  if (payload) signals.push("blob decoded and run with eval/new Function/vm");
  const flagged = strong > 0 || !!payload;
  if (flagged && line === 1 && payload) line = lineOf(code, payload.index);
  return { flagged, signals, line };
}

/**
 * String and template literals on one line, as { text, index }. A linear scan;
 * a literal that continues on the next line is cut at the line end.
 */
export function literalsOf(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const q = line[i];
    if (q !== '"' && q !== "'" && q !== "`") { i++; continue; }
    let k = i + 1;
    while (k < line.length && line[k] !== q) k += line[k] === "\\" ? 2 : 1;
    out.push({ text: line.slice(i + 1, k), index: i });
    i = k + 1;
  }
  return out;
}

/**
 * Node scripts a line starts: { path } as written, or { ref } when the script
 * is held in a variable (`spawn("node", [script])`), resolved by the caller.
 */
function spawnedScripts(line) {
  const out = [];
  const e = line.match(EXEC_NODE_RE);
  if (e) out.push({ path: e[1] });
  for (const m of line.matchAll(SPAWN_CALL_RE)) {
    const win = line.slice(m.index, m.index + 300);
    const fork = /^fork/.test(m[0]);
    if (!fork && !/^[^,]*(?:['"`]node(?:\.exe)?['"`]|process\.execPath)/.test(win.slice(m[0].length))) continue;
    const lit = win.match(SCRIPT_LITERAL_RE);
    if (lit) { out.push({ path: lit[1] }); continue; }
    const ref = fork ? win.match(/^fork\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/) : win.match(/,\s*\[\s*(?:['"`]-[\w-]+['"`]\s*,\s*)*([A-Za-z_$][\w$]*)\s*[,\]]/);
    if (ref) out.push({ ref: ref[1] });
  }
  return out;
}

/** The script path a variable is set to, if its declaration names one: `const s = path.join(__dirname, "w.js")`. */
function scriptOfVariable(code, name) {
  const m = code.match(new RegExp(String.raw`\b(?:const|let|var)\s+${name.replace(/\$/g, "\\$")}\s*=\s*([^;\n]{0,200})`));
  const lit = m && m[1].match(SCRIPT_LITERAL_RE);
  return lit ? lit[1] : null;
}

/**
 * Whether a position in comment-blanked code is inside a template literal,
 * by the parity of unescaped backticks before it. Calls must come in
 * increasing order of position; each part of the code is counted once.
 */
function templateTracker(code) {
  let at = 0;
  let open = false;
  return (pos) => {
    for (let i = code.indexOf("`", at); i !== -1 && i < pos; i = code.indexOf("`", i + 1)) {
      if (code[i - 1] !== "\\") open = !open;
      at = i + 1;
    }
    at = Math.max(at, pos);
    return open;
  };
}

/** Normalise a relative path inside the package ("a/./b/../c.js" -> "a/c.js"); null if it leaves the package. */
export function normalizeRel(p) {
  const parts = [];
  for (const seg of String(p).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
  }
  return parts.join("/");
}

export function lineOf(code, idx) {
  if (idx <= 0) return 1;
  let n = 1;
  for (let i = 0; i < idx; i++) if (code.charCodeAt(i) === 10) n++;
  return n;
}

export function findLine(text, needle) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return 1;
}

// ── Per-file scan ─────────────────────────────────────────────────────────

/**
 * Scan one JS file's source. Returns { caps, fileFlags } where caps is
 * { capId: { count, evidence: [{ file, line, snippet }] } }.
 */
export function scanSource(src, file) {
  const caps = {};
  const code = blankComments(src);
  const lines = code.split("\n");
  const has = { shell: false, network: false, fsWrite: false, fsRead: false, outside: false, envBulk: false, eval: false };
  const firstHit = {};
  const netLines = [];
  const writeHits = [];
  const outsideLines = [];
  const aiConfigHits = [];
  const serialiseHits = [];
  const cmdHits = [];
  const spawned = [];

  // Whole-file pre-checks, so the per-line work below runs only where it can matter.
  const maybeShell = P.shell.some((re) => re.test(code));
  const maybeDecodedRequire = DECODED_REQUIRE_RE.test(code);
  const inTemplate = templateTracker(code);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const lineStart = offset;
    offset += l.length + 1;
    if (!l.trim()) continue;
    const ev = (re) => {
      const m = l.match(re);
      return m ? { file, line: i + 1, snippet: snippet(l, m.index) } : null;
    };
    const hit = (id, res) => {
      for (const re of res) {
        const e = ev(re);
        if (e) { add(caps, id, e); return e; }
      }
      return null;
    };
    if (hit("shell", P.shell)) has.shell = true;
    // Command strings: checked inside literals only (or a line inside a
    // multi-line template literal), so code and identifiers do not count.
    if (maybeShell && cmdHits.length < MAX_EVIDENCE && CMD_HINT.test(l) && INSTALL_SHELL_CMD.test(l)) {
      const lit = literalsOf(l).find((x) => INSTALL_SHELL_CMD.test(x.text));
      if (lit) cmdHits.push({ file, line: i + 1, snippet: snippet(l, lit.index) });
      else if (inTemplate(lineStart)) cmdHits.push({ file, line: i + 1, snippet: snippet(l, 0) });
    }
    if (maybeShell && spawned.length < 20 && /\b(?:spawn|fork|exec)/.test(l)) spawned.push(...spawnedScripts(l));
    if (maybeDecodedRequire && !firstHit.decodedRequire) firstHit.decodedRequire = ev(DECODED_REQUIRE_RE);
    const net = hit("network", P.network);
    if (net) { has.network = true; netLines.push(i + 1); }
    hit("env", P.env);
    const bulk = hit("env-bulk", P.envBulk);
    if (bulk) { has.envBulk = true; if (P.envSerialise.test(l)) serialiseHits.push(bulk); }
    if (hit("eval", P.eval)) has.eval = true;
    hit("dynamic-require", P.dynamicRequire);
    hit("native", P.native);

    const w = ev(P.fsWriteCall);
    if (w) { has.fsWrite = true; writeHits.push(w); }
    if (P.outsidePath.test(l)) { has.outside = true; outsideLines.push(i + 1); }

    const aiCfg = ev(AI_CONFIG_RE);
    if (aiCfg) aiConfigHits.push(aiCfg);
    const aiCall = ev(AI_CLI_CALL_RE) || ev(AI_CLI_FLAG_RE);
    if (aiCall) firstHit.aiCli = firstHit.aiCli || aiCall;
    const ghCmd = ev(GH_TOKEN_CMD_RE);
    if (ghCmd) firstHit.ghCmd = firstHit.ghCmd || ghCmd;
    const ghFile = ev(GH_CRED_FILE_RE);
    if (ghFile) firstHit.ghFile = firstHit.ghFile || ghFile;
    if (P.fsReadCall.test(l)) has.fsRead = true;
    const ghShape = ev(GH_TOKEN_REGEX_RE);
    if (ghShape) firstHit.ghShape = firstHit.ghShape || ghShape;
  }

  // Writes outside the package: a write call within a few lines of a home
  // directory or system path reference.
  const near = (line, lines) => lines.some((n) => Math.abs(n - line) <= NEAR_WINDOW);
  const outsideWrite = writeHits.find((w) => near(w.line, outsideLines));
  if (outsideWrite) add(caps, "fs-write", outsideWrite);

  // AI agent config paths next to a write call. In the home directory (or
  // Claude Desktop's config, which only lives there) it is the s1ngularity
  // pattern. A project-level .mcp.json or .claude/ written by a CLI the user
  // runs (e.g. an `init` command) is normal, so that only counts when an
  // install hook runs the file (decided in scanPackage).
  const writeLines = writeHits.map((w) => w.line);
  const aiWrites = aiConfigHits.filter((h) => near(h.line, writeLines));
  const homeWrite = aiWrites.find((h) => near(h.line, outsideLines) || DESKTOP_CONFIG_RE.test(h.snippet));
  if (homeWrite) add(caps, "ai-config-write", homeWrite);
  const aiConfigProject = homeWrite ? null : aiWrites[0] || null;
  if (firstHit.aiCli && has.shell) add(caps, "ai-cli-invoke", firstHit.aiCli);
  // The token command only matters if the file can run it; the credential
  // files only matter if the file reads files or talks to the network.
  if (firstHit.ghCmd && has.shell) add(caps, "token-harvest", firstHit.ghCmd);
  else if (firstHit.ghFile && (has.fsRead || has.network)) add(caps, "token-harvest", firstHit.ghFile);
  else if (firstHit.ghShape && has.network && (has.envBulk || has.outside)) add(caps, "token-harvest", firstHit.ghShape);

  const obf = obfuscationSignals(code, { hasDynamicCode: has.eval });
  if (obf.flagged) {
    add(caps, "obfuscated", { file, line: obf.line, snippet: obf.signals.join("; ") });
  } else if (firstHit.decodedRequire) {
    add(caps, "obfuscated", { ...firstHit.decodedRequire, snippet: `module name decoded at runtime: ${firstHit.decodedRequire.snippet}` });
  }

  // Composite: the whole environment serialised within a few lines of network
  // code is the exfiltration shape. Enumerating keys to filter them is not.
  const exfil = serialiseHits.find((e) => netLines.some((n) => Math.abs(n - e.line) <= EXFIL_WINDOW)) || null;
  // Command strings and started scripts only matter in a file that can run them.
  const scripts = has.shell ? spawned.map((x) => x.path || scriptOfVariable(code, x.ref)).filter(Boolean) : [];
  return { caps, exfil, aiConfigProject, shellCmd: has.shell ? cmdHits[0] || null : null, spawned: scripts };
}

export function mergeCaps(into, from) {
  for (const [id, v] of Object.entries(from)) {
    const t = into[id] || (into[id] = { count: 0, evidence: [] });
    t.count += v.count;
    for (const e of v.evidence) if (t.evidence.length < MAX_EVIDENCE) t.evidence.push(e);
  }
}

// ── Per-package scan ──────────────────────────────────────────────────────

const INSTALL_HOOKS = ["preinstall", "install", "postinstall"];

/**
 * Script files an install hook runs with `node [flags] <file>`. Tokenized
 * rather than matched with one regex: hook commands come from the package
 * under inspection, so the parser must stay linear on hostile input.
 */
export function nodeScriptTargets(cmd) {
  const out = [];
  const tokens = String(cmd).slice(0, 4096).split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (!/^(?:.*[\\/])?node(?:\.exe)?$/.test(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith("-")) j++;
    if (j < tokens.length && /^[\w./-]+$/.test(tokens[j])) out.push(tokens[j]);
  }
  return out;
}

/**
 * Scan a package through a source (see source.js).
 * @param {{ files(): string[], read(rel): Buffer, size(rel): number, anomaly?: string, truncated?: boolean }} source
 * @param {{ prefix?: string, iocs?: ReturnType<import("./iocs.js").loadIocs> }} opts prefix is
 *   prepended to evidence paths (e.g. node_modules/foo/); iocs are rule-pack indicators to look for
 * @returns {{ name, version, capabilities, installScripts, exfil, filesScanned, skipped, unscanned, iocHits }}
 *   unscanned: why the package could not be fully read (archive anomaly, no
 *   package.json, a code file too large to scan, more files than the source
 *   lists), else null. Callers must not treat such a package as clean.
 */
export function scanPackage(source, opts = {}) {
  const prefix = opts.prefix || "";
  const caps = {};
  const files = source.files();
  let pkg = {};
  let pkgText = "";
  // Install scripts come only from package.json, so a package whose archive or
  // manifest could not be read is unscanned, never clean (fail closed).
  let unscanned = source.anomaly || null;
  try {
    pkgText = source.read("package.json").toString("utf-8");
    pkg = JSON.parse(pkgText);
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("not an object");
  } catch {
    pkg = {};
    unscanned = unscanned || "package.json is missing or not valid JSON, so its install scripts are unknown";
  }
  const iocs = opts.iocs || null;
  const iocHits = iocs ? [...iocs.scanFiles(files, source, prefix), ...iocs.scanText(pkgText, `${prefix}package.json`)] : [];

  const installScripts = {};
  for (const hook of INSTALL_HOOKS) {
    const cmd = pkg.scripts?.[hook];
    if (typeof cmd === "string" && cmd.trim()) {
      installScripts[hook] = cmd;
      add(caps, "install-scripts", { file: `${prefix}package.json`, line: findLine(pkgText, `"${hook}"`), snippet: `${hook}: ${cmd}`.slice(0, 160) });
    }
  }
  // npm runs `node-gyp rebuild` implicitly when binding.gyp exists and no install hook does.
  if (files.includes("binding.gyp") && !installScripts.install && !installScripts.preinstall) {
    installScripts.install = "node-gyp rebuild (implicit, binding.gyp)";
    add(caps, "install-scripts", { file: `${prefix}binding.gyp`, line: 1, snippet: "binding.gyp: npm runs node-gyp rebuild on install" });
  }

  for (const f of files) {
    if (/\.node$/i.test(f)) add(caps, "native", { file: `${prefix}${f}`, line: 1, snippet: "prebuilt native addon" });
  }
  if (files.includes("binding.gyp")) add(caps, "native", { file: `${prefix}binding.gyp`, line: 1, snippet: "native addon built from source" });

  const exfil = [];
  const fileCaps = {};
  const fileCmd = {};
  const fileSpawned = {};
  const aiConfigProject = {};
  let filesScanned = 0;
  const skipped = [];
  const binTargets = new Set(Object.values(typeof pkg.bin === "string" ? { x: pkg.bin } : pkg.bin || {}).map((p) => String(p).replace(/^\.\//, "")));
  for (const f of files) {
    const isJs = JS_EXT.test(f) || binTargets.has(f);
    if (!isJs || /\.d\.[cm]?ts$/i.test(f)) continue;
    if (source.size(f) > MAX_JS_BYTES) { skipped.push(f); continue; }
    let src;
    try { src = source.read(f).toString("utf-8"); } catch { continue; }
    filesScanned++;
    if (iocs) iocHits.push(...iocs.scanText(src, `${prefix}${f}`));
    const r = scanSource(src, `${prefix}${f}`);
    fileCaps[f] = Object.keys(r.caps);
    if (r.aiConfigProject) aiConfigProject[f] = r.aiConfigProject;
    if (r.shellCmd) fileCmd[f] = r.shellCmd;
    if (r.spawned.length) fileSpawned[f] = r.spawned;
    mergeCaps(caps, r.caps);
    if (r.exfil) exfil.push(r.exfil);
  }
  // Code that was never read is not clean code: fail closed.
  if (source.truncated) {
    unscanned = unscanned || `the package has more than ${source.maxFiles} files, so some were never read`;
  }
  if (skipped.length) {
    unscanned = unscanned || `${skipped.length} code file(s) over ${MAX_JS_BYTES / 1024 / 1024} MB were not scanned (${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? ", ..." : ""})`;
  }

  // Install scripts that are themselves suspicious: shell download pipes, or a
  // `node file.js` hook whose file reaches the network, decodes payloads, etc.
  const installRisk = [];
  const resolveScript = (t, from = "") => {
    const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
    const cands = [normalizeRel(dir ? `${dir}/${t}` : t), normalizeRel(t)].filter((x) => x !== null);
    for (const c of cands) for (const f of [c, `${c}.js`, `${c}/index.js`]) if (fileCaps[f]) return f;
    return null;
  };
  // What makes a file risky to run at install: its capabilities, and shell
  // command strings in it that download, pipe to a shell or send data out.
  const riskOf = (file) => {
    const bad = fileCaps[file].filter((c) => RISKY_FOR_INSTALL.includes(c));
    if (fileCmd[file]) bad.push(`shell command at line ${fileCmd[file].line}`);
    return bad;
  };
  for (const [hook, cmd] of Object.entries(installScripts)) {
    if (INSTALL_SHELL_CMD.test(cmd)) installRisk.push(`${hook} runs \`${cmd.slice(0, 80)}\``);
    // Inline code (`node -e "..."`) is scanned like a file.
    const inline = Object.keys(scanSource(cmd, "package.json").caps).filter((c) => RISKY_FOR_INSTALL.includes(c));
    if (inline.length) installRisk.push(`${hook} inline code (${inline.join(", ")})`);
    // Files the hook runs: `node file.js` or `node -e "require('./file')"`.
    const targets = [
      ...nodeScriptTargets(cmd),
      ...[...cmd.slice(0, 4096).matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ].map((t) => t.replace(/^\.\//, ""));
    for (const target of new Set(targets)) {
      const file = resolveScript(target);
      if (!file) continue;
      const bad = riskOf(file);
      if (aiConfigProject[file]) {
        add(caps, "ai-config-write", aiConfigProject[file]);
        bad.push("ai-config-write");
      }
      if (bad.length) installRisk.push(`${hook} runs ${file} (${[...new Set(bad)].join(", ")})`);
      // One hop: a hook script that starts another local script (often
      // detached, so the install finishes first) passes on that script's risk.
      for (const s of new Set(fileSpawned[file] || [])) {
        const next = resolveScript(s, file);
        if (!next || next === file) continue;
        const nextBad = riskOf(next);
        if (nextBad.length) installRisk.push(`${hook} runs ${file}, which starts ${next} (${[...new Set(nextBad)].join(", ")})`);
      }
    }
  }

  // Stable evidence order.
  for (const v of Object.values(caps)) {
    v.evidence.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }
  const ordered = {};
  for (const id of CAPABILITY_ORDER) if (caps[id]) ordered[id] = caps[id];

  return {
    name: pkg.name || null,
    version: pkg.version || null,
    capabilities: ordered,
    installScripts,
    installRisk,
    exfil,
    filesScanned,
    skipped,
    unscanned,
    iocHits,
  };
}
