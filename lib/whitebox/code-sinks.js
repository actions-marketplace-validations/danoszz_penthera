/**
 * Code-execution sinks in server code, with a taint-lite check for request
 * data reaching them.
 *
 * The route-scoped risky-pattern check (lib/attack-surface.js) only reads
 * files it recognizes as route handlers, so a sink in a helper module (DVNA's
 * core/appHandler.js) or behind an Express `routes/` folder that is not a
 * Next.js API root (Juice Shop) is never read. This pass reads every server
 * code file instead.
 *
 * Sinks:
 *   eval              eval(x), new Function(x) with a non-literal argument;
 *                     vm.runIn*Context / vm.compileFunction / new vm.Script
 *                     (node:vm is not a security boundary)
 *   command-injection child_process exec / execSync whose command contains
 *                     request data (both run it through a shell)
 *
 * Taint-lite: request data (`req.body`, `req.query`, `req.params`,
 * `req.headers`, `req.cookies`, `req.file(s)`, also `request.` and
 * `ctx.request.`, and those fields destructured from `req` or from a
 * parameter typed `Request`) and every variable assigned from an expression
 * that uses it, function calls included, within one file. No call graph, no
 * scopes, no sanitizers: "likely" means "derived from the request", not
 * "exploitable".
 *
 * Confidence:
 *   likely     request data appears in the sink's arguments
 *   potential  eval or new Function with a non-literal argument of unknown
 *              origin (stored data, a helper's parameter); worth a look,
 *              often safe
 * Not reported: a vm call whose arguments are untainted (running a fixed
 * script in a context is how vm is meant to be used) and an exec whose
 * command is untainted (CLIs and build tools build shell commands from their
 * own constants all the time; eval of a non-constant is rare and worth a look).
 */
import { readdirSync, lstatSync, existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const CODE_EXT = /\.(?:js|ts|mjs|cjs|jsx|tsx)$/;
// Not server code an attacker can reach: dependencies, build output, tests,
// browser assets, build tooling.
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage", "vendor",
  "test", "tests", "__tests__", "spec", "e2e", "cypress", "fixtures", "__mocks__",
  "public", "static", "assets", "scripts",
]);
// Next.js App Router route files are read by the route-scoped check already.
const ROUTE_FILE = /(?:^|\/)api\/(?:.*\/)?route\.[cm]?[jt]s$/;
const SKIP_FILES = /\.(?:spec|test)\.[cm]?[jt]sx?$|\.min\.js$|^(?:gruntfile|gulpfile)\.[cm]?js$|\.config\.[cm]?[jt]s$/i;
const MAX_BYTES = 512 * 1024;
// A line this long means minified or generated code, not a server source file.
const MAX_LINE = 5000;
const MAX_FILES = 5000;

const SOURCE = /\b(?:req|request|ctx\.request)\.(?:body|query|params|headers|cookies|files?)\b/;
const REQUEST_FIELDS = new Set(["body", "query", "params", "headers", "cookies", "file", "files"]);

const SINKS = [
  { pattern: "eval", call: "eval", re: /(?<![\w.$])eval\s*\(/g, needsDynamic: true },
  { pattern: "eval", call: "new Function", re: /\bnew\s+Function\s*\(/g, needsDynamic: true },
  { pattern: "eval", call: "vm", re: /\bvm\.(?:runInContext|runInNewContext|runInThisContext|compileFunction)\s*\(|\bnew\s+vm\.Script\s*\(/g, needsDynamic: false },
  { pattern: "command-injection", call: "exec", re: /(?<![\w.$])(?:exec|execSync)\s*\(|\b(?:child_process|childProcess|cp)\.(?:exec|execSync)\s*\(/g, needsDynamic: false, needsImport: /child_process/ },
];

const SEVERITY = { eval: "high", "command-injection": "critical" };

function walk(dir, files, root) {
  if (files.length >= MAX_FILES || !existsSync(dir) || (dir !== root && existsSync(join(dir, ".git")))) return files;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, files, root);
    else if (st.isFile() && CODE_EXT.test(entry) && !SKIP_FILES.test(entry) && st.size <= MAX_BYTES) files.push(full);
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

/** Blank out comments (same length, line breaks kept), leaving strings as they are. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
    } else if (c === "'" || c === '"' || c === "`") {
      quote = c; out += c; i++;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      out += c; i++;
    }
  }
  return out;
}

/** Blank out string and template-literal contents (same length, quotes kept), so a sink named inside a string is not a call. */
export function maskStrings(src) {
  let out = "";
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { out += "  "; i++; continue; }
      if (c === quote) { quote = null; out += c; continue; }
      out += c === "\n" ? "\n" : " ";
    } else {
      if (c === "'" || c === '"' || c === "`") quote = c;
      out += c;
    }
  }
  return out;
}

/** The argument text of the call whose "(" is at `open`, up to its ")" (bounded). */
function callArgs(src, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length && i < open + 2000; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1, open + 300);
}

// One string literal without interpolation, or a number: nothing dynamic.
const LITERAL_ARG = /^\s*(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`$]*`|\d+(?:\.\d+)?)\s*$/;

/** First argument of an argument list (top-level comma split, bounded). */
function firstArg(args) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) return args.slice(0, i);
  }
  return args;
}

const escapeRe = (s) => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/** Variables that hold request data, followed through assignments in this file. */
export function taintedNames(src) {
  const names = new Set();
  const isTainted = (expr) => SOURCE.test(expr) || [...names].some((n) => new RegExp(`(?<![\\w$.])${escapeRe(n)}\\b`).test(expr));
  const decl = /(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=(?![=>])\s*([^;\n]{1,300})/g;
  const destructure = /\b(?:const|let|var)\s*\{([^}]{1,300})\}\s*=\s*([^;\n]{1,300})/g;
  const fieldsOf = (list) => {
    for (const part of list.split(",")) {
      const field = part.split(/[:=]/)[0].trim();
      if (REQUEST_FIELDS.has(field)) names.add(part.split("=")[0].split(":").pop().trim());
    }
  };
  // `({ body, query }: Request, res) =>` and `const { body } = req`
  for (const m of src.matchAll(/\(\s*\{([^}]{1,300})\}\s*:\s*(?:express\.)?Request\b/g)) fieldsOf(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]{1,300})\}\s*=\s*(?:req|request|ctx\.request)\s*[;\n]/g)) fieldsOf(m[1]);
  for (let round = 0; round < 6; round++) {
    const size = names.size;
    for (const m of src.matchAll(decl)) if (!names.has(m[1]) && isTainted(m[2])) names.add(m[1]);
    for (const m of src.matchAll(destructure)) {
      if (!isTainted(m[2])) continue;
      for (const part of m[1].split(",")) {
        const name = part.split("=")[0].split(":").pop().trim().replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
    if (names.size === size) break;
  }
  return names;
}

/**
 * Find code-execution sinks in one file's source.
 * @returns {{ pattern, call, line, confidence, tainted }[]}
 */
export function findSinks(source) {
  if (source.split("\n").some((l) => l.length > MAX_LINE)) return [];
  const src = stripComments(source);
  const code = maskStrings(src);
  const names = taintedNames(src);
  const taints = (text) => SOURCE.test(text) || [...names].some((n) => new RegExp(`(?<![\\w$.])${escapeRe(n)}\\b`).test(text));
  const hits = [];
  for (const sink of SINKS) {
    if (sink.needsImport && !sink.needsImport.test(src)) continue;
    sink.re.lastIndex = 0;
    for (const m of code.matchAll(sink.re)) {
      const open = m.index + m[0].length - 1;
      const args = callArgs(src, open);
      const tainted = taints(args);
      const dynamic = !LITERAL_ARG.test(firstArg(args));
      if (!tainted && (!sink.needsDynamic || !dynamic)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      hits.push({ pattern: sink.pattern, call: sink.call, line, tainted, confidence: tainted ? "likely" : "potential" });
    }
  }
  return hits;
}

/**
 * Scan a repository's server code for code-execution sinks.
 * @param {string} repoPath
 * @returns {object[]} findings, one per file and sink kind
 */
export function scanCodeSinks(repoPath) {
  const findings = [];
  for (const file of walk(repoPath, [], repoPath)) {
    let source;
    try { source = readFileSync(file, "utf-8"); } catch { continue; }
    const rel = relative(repoPath, file).split(sep).join("/");
    if (ROUTE_FILE.test(rel)) continue;
    const byPattern = new Map();
    for (const hit of findSinks(source)) {
      const list = byPattern.get(hit.pattern) || [];
      list.push(hit);
      byPattern.set(hit.pattern, list);
    }
    for (const [pattern, hits] of byPattern) {
      const top = hits.find((h) => h.tainted) || hits[0];
      const lines = hits.map((h) => `${h.call} on line ${h.line}${h.tainted ? " (from the request)" : ""}`).slice(0, 5).join(", ");
      findings.push({
        severity: SEVERITY[pattern],
        title: `${pattern} in ${rel}`,
        description: top.tainted
          ? `Data derived from the request reaches a code-execution sink in \`${rel}\`: ${lines}.`
          : `A code-execution sink in \`${rel}\` takes a value Penthera cannot trace to a constant: ${lines}. Check where it comes from.`,
        remediation: pattern === "eval"
          ? "Do not evaluate data as code. Parse it (JSON.parse, a math parser) instead; node:vm is not a sandbox."
          : "Use execFile or spawn with an argument array and no shell, and validate the input against an allowlist.",
        url: rel,
        file: rel,
        line: top.line,
        pattern,
        category: "code-pattern",
        source: "static-analysis",
        confidence: top.confidence,
      });
    }
  }
  return findings;
}
