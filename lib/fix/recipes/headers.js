/**
 * Recipe: security response headers (CSP starter, HSTS, X-Frame-Options and
 * frame-ancestors, Referrer-Policy, X-Content-Type-Options) for Next.js,
 * Express, Fastify and Hono. Guidance: remediation rules "header-csp" and
 * "header-generic", and references/remediation.md#security-headers.
 */
import { auditSecurityHeaders } from "../../blackbox/headers.js";
import {
  detectFramework, hasDep, readText, walkCodeFiles, findEntryFile, findLine,
  addImport, insertAfterLine, toDiff,
} from "../util.js";

// A starter CSP: it allows inline scripts and styles because most framework
// apps (Next.js hydration in particular) break without them. The owner action
// says to tighten it.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

export const SECURITY_HEADERS = [
  ["Content-Security-Policy", CSP],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Content-Type-Options", "nosniff"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];

// The headers this recipe is responsible for (Permissions-Policy is a bonus in
// the literal variants, but helmet and secureHeaders don't set it by default).
const COVERED = ["content-security-policy", "strict-transport-security", "x-frame-options", "referrer-policy", "x-content-type-options"];
const HELMET_DEFAULTS = COVERED;
const HONO_DEFAULTS = ["strict-transport-security", "x-frame-options", "referrer-policy", "x-content-type-options"];

const NEXT_CONFIGS = ["next.config.js", "next.config.mjs", "next.config.ts", "next.config.cjs"];

const OWNER_ACTIONS = [
  "Tighten the starter Content-Security-Policy for your app: it allows inline scripts and styles. Test in staging (or ship it as Content-Security-Policy-Report-Only first) and move to nonces or hashes.",
  "Only keep Strict-Transport-Security if the site is served over HTTPS everywhere; add `preload` once you are sure.",
];

const ANCHORS = {
  express: /^(\s*)(?:const|let|var)\s+(\w+)\s*=\s*express\(\s*\)\s*;?\s*$/,
  hono: /^(\s*)(?:const|let|var)\s+(\w+)\s*=\s*new\s+Hono(?:<[^>]*>)?\(\s*\)\s*;?\s*$/,
};

function fastifyAnchor(source) {
  const factory = source.match(/import\s+(\w+)\s+from\s+['"]fastify['"]/)?.[1]
    || source.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]fastify['"]\s*\)\s*;?/)?.[1];
  if (factory) return new RegExp(`^(\\s*)(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:await\\s+)?${factory}\\([^()]*\\)\\s*;?\\s*$`);
  return /^(\s*)(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]fastify['"]\s*\)\([^()]*\)\s*;?\s*$/;
}

function anchorFor(framework, source) {
  return framework === "fastify" ? fastifyAnchor(source) : ANCHORS[framework];
}

function nextConfig(repoPath) {
  for (const file of NEXT_CONFIGS) {
    const source = readText(repoPath, file);
    if (source != null) return { file, source };
  }
  return null;
}

/** Lower-case names of the security headers the repo's code visibly sets. */
export function staticHeaders(repoPath, framework) {
  const found = new Set();
  const literal = /(?:key\s*:\s*|\.(?:setHeader|header|set|append)\(\s*)['"]([A-Za-z-]+)['"]/g;
  const sources = [];
  if (framework === "next") {
    const cfg = nextConfig(repoPath);
    if (cfg) sources.push(cfg.source);
    for (const f of ["middleware.ts", "middleware.js", "src/middleware.ts", "src/middleware.js"]) {
      const s = readText(repoPath, f);
      if (s) sources.push(s);
    }
  } else {
    for (const f of walkCodeFiles(repoPath)) {
      const s = readText(repoPath, f);
      if (s) sources.push(s);
    }
  }
  for (const s of sources) {
    for (const m of s.matchAll(literal)) found.add(m[1].toLowerCase());
    const helmet = /['"]helmet['"]/.test(s) && /\bhelmet\s*\(/.test(s);
    const fastifyHelmet = /['"]@fastify\/helmet['"]/.test(s) && /\.register\(/.test(s);
    if (helmet || fastifyHelmet) HELMET_DEFAULTS.forEach((h) => found.add(h));
    if (/\bsecureHeaders\s*\(/.test(s)) {
      HONO_DEFAULTS.forEach((h) => found.add(h));
      if (/contentSecurityPolicy\s*:/.test(s)) found.add("content-security-policy");
    }
  }
  return found;
}

function missingHeaders(repoPath, framework) {
  const present = staticHeaders(repoPath, framework);
  return COVERED.filter((h) => !present.has(h));
}

function planNext(repoPath) {
  const cfg = nextConfig(repoPath);
  const headerLines = [
    "const securityHeaders = [",
    ...SECURITY_HEADERS.map(([k, v]) => `  { key: "${k}", value: ${JSON.stringify(v)} },`),
    "];",
    "",
  ];
  const headersFn = [
    "  async headers() {",
    '    return [{ source: "/:path*", headers: securityHeaders }];',
    "  },",
  ];
  if (!cfg) {
    const after = [
      "// Security headers (added by penthera fix).",
      ...headerLines,
      "/** @type {import('next').NextConfig} */",
      "const nextConfig = {",
      ...headersFn,
      "};",
      "",
      "export default nextConfig;",
      "",
    ].join("\n");
    return toDiff([{ file: "next.config.mjs", before: null, after }]);
  }
  const { file, source } = cfg;
  // An existing headers() would need merging; leave that to a human.
  if (/\bheaders\s*\(/.test(source) || /\bsecurityHeaders\b/.test(source)) return null;

  const lines = source.split("\n");
  let idx = -1;
  let empty = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:(?:const|let|var)\s+(\w+)(?:\s*:\s*[\w.]+)?\s*=|module\.exports\s*=|export\s+default)\s*\{\s*(\}\s*;?)?\s*$/);
    if (!m) continue;
    // A named config object must be the one that gets exported.
    if (m[1] && !new RegExp(`(?:export\\s+default|module\\.exports\\s*=)\\s*${m[1]}\\s*;?\\s*$`, "m").test(source)) continue;
    idx = i;
    empty = Boolean(m[2]);
    break;
  }
  if (idx < 0) return null;

  const opening = lines[idx].replace(/\}\s*;?\s*$/, "").trimEnd();
  const semicolon = /;\s*$/.test(lines[idx]);
  const replaced = empty ? [opening, ...headersFn, `}${semicolon ? ";" : ""}`] : [lines[idx], ...headersFn];
  lines.splice(idx, 1, ...replaced);
  // Keep a JSDoc type comment (/** @type {import('next').NextConfig} */) attached to its object.
  const at = idx > 0 && /^\s*\/\*\*.*\*\/\s*$/.test(lines[idx - 1]) ? idx - 1 : idx;
  lines.splice(at, 0, "// Security headers (added by penthera fix).", ...headerLines);
  return toDiff([{ file, before: source, after: lines.join("\n") }]);
}

function planServer(repoPath, framework) {
  const probeAnchor = framework === "fastify" ? /['"]fastify['"]/ : ANCHORS[framework];
  const entry = findEntryFile(repoPath, new RegExp(probeAnchor.source, "m"));
  if (!entry) return null;
  const { file, source } = entry;
  const anchor = anchorFor(framework, source);
  const idx = findLine(source, anchor);
  if (idx < 0) return null;
  const app = source.split("\n")[idx].match(anchor)[2];

  let after;
  if (framework === "express" && hasDep(repoPath, "helmet")) {
    after = insertAfterLine(source, idx, [`${app}.use(helmet());`]);
    after = addImport(after, { name: "helmet", module: "helmet" });
  } else if (framework === "fastify" && hasDep(repoPath, "@fastify/helmet")) {
    after = insertAfterLine(source, idx, [`${app}.register(fastifyHelmet);`]);
    after = addImport(after, { name: "fastifyHelmet", module: "@fastify/helmet" });
  } else if (framework === "hono") {
    after = insertAfterLine(source, idx, [
      `${app}.use(`,
      '  "*",',
      "  secureHeaders({",
      "    contentSecurityPolicy: {",
      `      defaultSrc: ["'self'"],`,
      `      scriptSrc: ["'self'", "'unsafe-inline'"],`,
      `      styleSrc: ["'self'", "'unsafe-inline'"],`,
      `      imgSrc: ["'self'", "data:", "blob:"],`,
      `      frameAncestors: ["'none'"],`,
      `      objectSrc: ["'none'"],`,
      `      baseUri: ["'self'"],`,
      "    },",
      '    xFrameOptions: "DENY",',
      '    referrerPolicy: "strict-origin-when-cross-origin",',
      "  }),",
      ");",
    ]);
    after = addImport(after, { name: "secureHeaders", module: "hono/secure-headers", named: true });
  } else if (framework === "express") {
    after = insertAfterLine(source, idx, [
      "",
      "// Security headers (added by penthera fix). Tighten the starter CSP for your app.",
      `${app}.use((req, res, next) => {`,
      ...SECURITY_HEADERS.map(([k, v]) => `  res.setHeader("${k}", ${JSON.stringify(v)});`),
      "  next();",
      "});",
    ]);
  } else if (framework === "fastify") {
    after = insertAfterLine(source, idx, [
      "",
      "// Security headers (added by penthera fix). Tighten the starter CSP for your app.",
      `${app}.addHook("onSend", async (request, reply, payload) => {`,
      ...SECURITY_HEADERS.map(([k, v]) => `  reply.header("${k}", ${JSON.stringify(v)});`),
      "  return payload;",
      "});",
    ]);
  } else {
    return null;
  }
  return toDiff([{ file, before: source, after }]);
}

export default {
  id: "security-headers",
  title: "Add security response headers",
  matches(finding) {
    const t = finding.title || "";
    if (/permissions-policy/i.test(t)) return false;
    return /content-security-policy|x-frame-options|frame-ancestors|x-content-type-options|referrer-policy|strict-transport-security|hsts/i.test(t);
  },
  detect(repoPath) {
    return detectFramework(repoPath);
  },
  plan(repoPath, _finding, framework) {
    if (!["next", "express", "fastify", "hono"].includes(framework)) return null;
    if (missingHeaders(repoPath, framework).length === 0) return null; // already fixed
    const change = framework === "next" ? planNext(repoPath) : planServer(repoPath, framework);
    if (!change) return null;
    return { ...change, ownerActions: OWNER_ACTIONS, confidence: "medium" };
  },
  /** Static stand-in for the header audit: which covered headers the code never sets. */
  probe(repoPath) {
    const framework = detectFramework(repoPath);
    if (!["next", "express", "fastify", "hono"].includes(framework)) return [];
    const present = staticHeaders(repoPath, framework);
    const headers = Object.fromEntries([...present].map((h) => [h, "set"]));
    const where = framework === "next"
      ? nextConfig(repoPath)?.file || "next.config.mjs"
      : findEntryFile(repoPath, framework === "fastify" ? /['"]fastify['"]/ : new RegExp(ANCHORS[framework].source, "m"))?.file || null;
    const findings = auditSecurityHeaders(headers, "https://localhost", { local: true })
      .filter((f) => !/permissions-policy/i.test(f.title));
    if (!present.has("strict-transport-security")) {
      findings.push({ severity: "low", title: "Missing Strict-Transport-Security", description: "No HSTS header is set in code.", category: "headers" });
    }
    return findings.map((f) => ({ ...f, url: where, source: "fix-probe:headers" }));
  },
};
