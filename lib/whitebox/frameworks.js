/**
 * Discover API routes in Express, Hono, and Fastify projects.
 */
import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "vendor"]);
const CODE_EXT = /\.(js|ts|mjs|cjs)$/;

const ROUTE_DIRS = ["routes", "src/routes", "api", "src/api", "server/routes", "src/server/routes"];

// Express / Hono / Fastify route patterns
const ROUTE_RES = [
  /(?:app|router|server|api|hono)\.(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /(?:app|router|server|api|hono)\.(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /fastify\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.(get|post|put|patch|delete)\s*\(\s*['"`](\/[^'"`]+)['"`]/gi,
  /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,\s*url:\s*['"`]([^'"`]+)['"`]/gi,
];

function walkCodeFiles(dir, files = [], root = dir) {
  // Nested repos and worktrees are separate projects; symlinks are not followed.
  if (!existsSync(dir) || (dir !== root && existsSync(join(dir, ".git")))) return files;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walkCodeFiles(full, files, root);
    } else if (CODE_EXT.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function extractRoutesFromSource(source, filePath, repoPath) {
  const routes = [];
  const seen = new Set();

  for (const re of ROUTE_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) {
      const method = m[1].toUpperCase();
      let path = m[2];
      if (!path.startsWith("/")) path = `/${path}`;
      const key = `${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      routes.push({
        url: path,
        filePath: relative(repoPath, filePath),
        methods: [method],
        auth: classifyAuth(source),
        inputs: [],
        externalCalls: [],
        securityPatterns: detectRisk(source),
        hasParams: path.includes(":") || path.includes("*"),
        framework: detectFramework(source),
        sourceLength: source.length,
      });
    }
  }

  return routes;
}

export function detectFramework(source) {
  if (/from\s+['"]hono['"]|new Hono/.test(source)) return "hono";
  if (/from\s+['"]fastify['"]|fastify\(/.test(source)) return "fastify";
  if (/from\s+['"]express['"]|require\s*\(\s*['"]express['"]\)/.test(source)) return "express";
  return "node";
}

function classifyAuth(source) {
  const auth = [];
  if (/verifyAdmin|isAdmin|requireAdmin/.test(source)) auth.push("admin");
  if (/requireAuth|getSession|verifyToken|jwt\.verify/.test(source)) auth.push("user");
  if (/CRON_SECRET|verifyCron/.test(source)) auth.push("cron");
  if (auth.length === 0) auth.push("public");
  return auth;
}

function detectRisk(source) {
  const patterns = [];
  if (/eval\s*\(/.test(source)) patterns.push("RISK:eval");
  if (/innerHTML/.test(source)) patterns.push("RISK:innerHTML");
  if (/exec\s*\(|spawn\s*\(/.test(source)) patterns.push("RISK:command-injection");
  return patterns;
}

/**
 * @param {string} repoPath
 * @returns {object[]} routes in attack-surface shape
 */
export function discoverFrameworkRoutes(repoPath) {
  const all = [];
  const seen = new Set();

  const scanFiles = (dir) => {
    for (const file of walkCodeFiles(dir)) {
      let source;
      try {
        source = readFileSync(file, "utf-8");
      } catch {
        continue;
      }
      if (!/(express|hono|fastify|Router|\.get\s*\(|\.post\s*\()/i.test(source)) continue;

      for (const route of extractRoutesFromSource(source, file, repoPath)) {
        const key = `${route.methods[0]}:${route.url}:${route.filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(route);
      }
    }
  };

  for (const dir of ROUTE_DIRS) {
    scanFiles(join(repoPath, dir));
  }

  // Also scan top-level server entry files
  for (const entry of ["server.js", "server.ts", "index.js", "index.ts", "app.js", "app.ts", "src/index.ts"]) {
    const full = join(repoPath, entry);
    if (!existsSync(full)) continue;
    try {
      const source = readFileSync(full, "utf-8");
      for (const route of extractRoutesFromSource(source, full, repoPath)) {
        const key = `${route.methods[0]}:${route.url}:${route.filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(route);
      }
    } catch { /* skip */ }
  }

  return all.sort((a, b) => a.url.localeCompare(b.url));
}

// Web frameworks by manifest dependency, most specific first (Next.js ships React,
// SvelteKit ships Vite). Python names are matched in requirements/pyproject text.
const NPM_FRAMEWORKS = [
  ["next", "Next.js"], ["nuxt", "Nuxt"], ["@remix-run/node", "Remix"], ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"], ["@nestjs/core", "NestJS"], ["hono", "Hono"], ["fastify", "Fastify"],
  ["express", "Express"], ["koa", "Koa"], ["vite", "Vite"],
];
const PY_FRAMEWORKS = [["django", "Django"], ["fastapi", "FastAPI"], ["flask", "Flask"]];
const SOURCE_NAMES = { express: "Express", hono: "Hono", fastify: "Fastify" };

/**
 * Name the project's web framework from its manifests, offline. Falls back to
 * detectFramework() on the server entry files.
 * @param {string} repoPath
 * @returns {string|null} e.g. "Next.js", "Express", "FastAPI"
 */
export function detectProjectFramework(repoPath) {
  try {
    const pkg = JSON.parse(readFileSync(join(repoPath, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, name] of NPM_FRAMEWORKS) if (deps[dep]) return name;
  } catch { /* no or unreadable package.json */ }
  let py = "";
  for (const f of ["requirements.txt", "pyproject.toml", "Pipfile"]) {
    try { py += readFileSync(join(repoPath, f), "utf-8").toLowerCase() + "\n"; } catch { /* absent */ }
  }
  for (const [dep, name] of PY_FRAMEWORKS) if (new RegExp(`(^|[^a-z0-9_-])${dep}([^a-z0-9_-]|$)`, "m").test(py)) return name;
  for (const entry of ["server.js", "server.ts", "index.js", "index.ts", "app.js", "app.ts", "src/index.ts"]) {
    try {
      const name = SOURCE_NAMES[detectFramework(readFileSync(join(repoPath, entry), "utf-8"))];
      if (name) return name;
    } catch { /* absent */ }
  }
  return null;
}
