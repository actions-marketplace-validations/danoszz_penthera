/**
 * The parts of penthera.org that exist for agents rather than people, built
 * from the same values as the page so they cannot drift from it:
 *
 *   /index.md       the homepage as Markdown; GET / with Accept: text/markdown
 *                   answers with it (site/proxy.js on Vercel, site/serve.mjs locally)
 *   /openapi.json   OpenAPI 3.1 for POST /api/check; error codes read from api/
 *   JSONLD          a SoftwareApplication block for the page's <head>
 *   llms.txt        a "When to use Penthera" section, added by agents.mjs
 *
 * Unknown paths asked for as Markdown get api/not-found.mjs (a 404 in Markdown).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = "https://github.com/danoszz/penthera";
const NPM = "https://www.npmjs.com/package/penthera";
/** BRIEF.md, "Positioning (approved, used verbatim)": the short line. */
export const DESCRIPTION = "Offline cyber security agent for your apps and AI coding tools. Open R&D: measured in public, improved every release.";

// ── JSON-LD ─────────────────────────────────────────────────────────────────

/**
 * The SoftwareApplication record. A personal project: the author is a name and
 * a website, with no address, phone or email.
 */
export function jsonLdData({ version, origin }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Penthera",
    description: DESCRIPTION,
    url: origin,
    applicationCategory: "SecurityApplication",
    operatingSystem: "macOS, Linux, Windows",
    softwareRequirements: "Node.js 22 or later",
    softwareVersion: version,
    license: "https://spdx.org/licenses/MIT.html",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    downloadUrl: NPM,
    installUrl: NPM,
    sameAs: [REPO, NPM],
    author: { "@type": "Person", name: "Daan van der Zwaag", url: "https://daanvanderzwaag.com" },
  };
}

/**
 * The <script type="application/ld+json"> element. It is a data block, which
 * the browser never runs, so script-src 'self' does not apply to it (HTML,
 * "prepare the script element": a data block returns before the CSP check).
 * "<" is escaped so no value can close the element.
 */
export function jsonLd(o) {
  const json = JSON.stringify(jsonLdData(o)).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

// ── The live check's error codes, from the API's source ─────────────────────

/** What each error means and what to do, for the OpenAPI spec. */
const ERROR_HINTS = {
  invalid_url: "The url is empty, too long, not http(s), has credentials or a non-standard port.",
  not_public: "The host is localhost, a private or reserved address, or a name that is not public.",
  invalid_action: "action is not passive, token or deep.",
  invalid_json: "The body is not JSON.",
  off_target: "The verified scan tried to reach a host other than the verified one.",
  not_verified: "The ownership token was not found in DNS or at /.well-known/penthera.txt.",
  method_not_allowed: "Only POST is allowed.",
  too_large: "The request body is over 4 KB.",
  not_found: "The domain does not resolve.",
  too_many_redirects: "The site redirected more than four times.",
  tls_invalid: "The site's certificate is not valid.",
  rate_limited: "More than 8 checks from one address in a minute.",
  internal: "The check failed on penthera.org's side.",
  not_available: "The verified scan is not set up on this server.",
  unreachable: "penthera.org could not connect to the site.",
  timeout: "The site did not answer in time.",
  budget: "The check used up its request or time budget for this site.",
};

export const ERROR_RE = /new CheckError\(\s*"(\w+)",\s*(?:"(?:[^"\\]|\\.)*"|`[^`]*`|'[^']*'),\s*(\d+)\s*,/g;

/**
 * Every CheckError code the API can return, with its HTTP status, read from
 * api/ so the spec lists what the code actually throws.
 * @returns {Record<string, number>} code to status
 */
export function apiErrorCodes(root) {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".mjs")) files.push(p);
    }
  };
  walk(join(root, "api"));
  const codes = {};
  for (const f of files.sort()) {
    const src = readFileSync(f, "utf8");
    // new CheckError("code", "message" | `message`, status, hint); a status
    // under 400 is an internal sentinel that never reaches a client.
    for (const m of src.matchAll(ERROR_RE)) if (Number(m[2]) >= 400) codes[m[1]] ??= Number(m[2]);
  }
  return codes;
}

/** Codes that have no entry in ERROR_HINTS: the spec needs a line for each. */
export const undescribedCodes = (codes) => Object.keys(codes).filter((c) => !(c in ERROR_HINTS));

// ── OpenAPI ─────────────────────────────────────────────────────────────────

/** OpenAPI 3.1 for POST /api/check. */
export function openApi({ version, origin, root }) {
  const codes = apiErrorCodes(root);
  const byStatus = {};
  for (const [code, status] of Object.entries(codes)) (byStatus[status] ||= []).push(code);
  const errorResponses = Object.fromEntries(Object.keys(byStatus).sort().map((s) => [s, {
    description: byStatus[s].map((c) => `\`${c}\`: ${ERROR_HINTS[c] || "See error.message and error.hint."}`).join(" "),
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: { code: byStatus[s][0], message: "…", hint: "…" } } } },
  }]));
  const str = { type: "string" };
  return {
    openapi: "3.1.0",
    info: {
      title: "Penthera live check",
      version,
      summary: "Check a public website's passive security posture: HTTPS, TLS, security headers, cookies and what it discloses.",
      description: [
        "One endpoint, POST /api/check, with a JSON body. The default action, passive, sends one GET request to the site, as a browser would, and grades the response. Nothing is stored or logged.",
        "Only public http(s) sites on ports 80 and 443. For localhost, internal hosts or a full scan, run `npx penthera@" + version + " <url>` on your own machine.",
        "Rate limit: 8 checks per minute per client address. Only check sites you own or are authorized to test.",
      ].join("\n\n"),
      license: { name: "MIT", identifier: "MIT" },
      contact: { name: "Penthera on GitHub", url: `${REPO}/issues` },
    },
    servers: [{ url: origin }],
    externalDocs: { description: "What Penthera is and every doc, for agents", url: `${origin}/llms.txt` },
    paths: {
      "/api/check": {
        post: {
          operationId: "checkWebsiteSecurity",
          summary: "Check a public website's security basics",
          description: [
            "Grades a public website's HTTPS, TLS, security headers, cookies and disclosure from one passive GET request. Use it to answer \"is this site's basic security set up?\" for a URL.",
            "The action field picks what happens:",
            "- passive (default): the report for any public site.",
            "- token: the proof-of-ownership token for the host, to place in a DNS TXT record or at /.well-known/penthera.txt.",
            "- deep: once the token is in place, the owner-verified, payload-free scan; returns the same report shape with tier \"deep\".",
            "Errors are JSON: {\"error\": {\"code\", \"message\", \"hint\"}}. Read hint for what to do next.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckRequest" },
                examples: {
                  passive: { summary: "Passive check", value: { url: "example.com" } },
                  token: { summary: "Get the ownership token", value: { url: "example.com", action: "token" } },
                  deep: { summary: "Verified scan, after placing the token", value: { url: "example.com", action: "deep" } },
                },
              },
            },
          },
          responses: {
            200: {
              description: "A report (actions passive and deep) or the ownership token (action token).",
              content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/Report" }, { $ref: "#/components/schemas/OwnershipToken" }] } } },
            },
            ...errorResponses,
          },
        },
      },
    },
    components: {
      schemas: {
        CheckRequest: {
          type: "object",
          required: ["url"],
          additionalProperties: false,
          properties: {
            url: { type: "string", minLength: 1, maxLength: 2048, description: "The site: a domain (example.com means https://example.com/) or an http(s) URL on port 80 or 443.", examples: ["example.com", "https://example.com/login"] },
            action: { type: "string", enum: ["passive", "token", "deep"], default: "passive", description: "passive: grade one GET request. token: get the ownership token. deep: the verified scan, after the token is in place." },
          },
        },
        Report: {
          type: "object",
          required: ["url", "tier", "score", "verdict", "redirects", "scope", "categories", "checks"],
          properties: {
            url: { type: "string", description: "The final URL, after redirects." },
            status: { type: "integer", description: "The HTTP status of the final response." },
            tier: { type: "string", enum: ["passive", "deep"] },
            score: { type: "integer", minimum: 0, maximum: 100, description: "The share of check weight that passed, as a percentage." },
            verdict: { type: "string", description: "The score in words, such as \"Solid basics\" (90 or more) or \"Unsafe defaults\" (under 45)." },
            redirects: { type: "array", items: str, description: "Each URL that redirected, in order." },
            scope: { type: "string", description: "What was and was not checked." },
            categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
            checks: { type: "array", items: { $ref: "#/components/schemas/Check" } },
          },
        },
        Category: {
          type: "object",
          required: ["id", "label", "passed", "total"],
          properties: { id: str, label: str, passed: { type: "integer", minimum: 0 }, total: { type: "integer", minimum: 0 } },
        },
        Check: {
          type: "object",
          required: ["id", "category", "passed", "severity", "title", "evidence", "fix", "verify", "weight"],
          properties: {
            id: { type: "string", examples: ["https", "hsts", "csp"] },
            category: { type: "string", description: "The id of a category in categories." },
            passed: { type: "boolean" },
            severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"], description: "How much a failure matters." },
            title: str,
            evidence: { type: "string", description: "What the response showed; empty when there is nothing to show." },
            fix: { type: "string", description: "What to change." },
            verify: { type: "string", description: "A command that shows whether the fix worked, such as a curl." },
            weight: { type: "integer", minimum: 0, description: "This check's share of the score." },
          },
        },
        OwnershipToken: {
          type: "object",
          required: ["host", "token", "dns", "file"],
          properties: {
            host: str,
            token: { type: "string", description: "penthera-verify= and 32 base64url characters." },
            dns: { type: "object", required: ["name", "value"], properties: { name: { type: "string", examples: ["_penthera.example.com"] }, type: { const: "TXT" }, value: str } },
            file: { type: "object", required: ["url", "contents"], properties: { url: { type: "string", examples: ["https://example.com/.well-known/penthera.txt"] }, contents: str } },
            expiresNote: str,
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "hint"],
              properties: {
                code: { type: "string", enum: Object.keys(codes).sort() },
                message: { type: "string", description: "What happened." },
                hint: { type: "string", description: "What to do next." },
              },
            },
          },
        },
      },
    },
  };
}

// ── llms.txt: when to reach for Penthera ────────────────────────────────────

/** The "When to use Penthera" section for llms.txt. */
export function whenToUse({ version, origin }) {
  return `## When to use Penthera

Reach for it when the user wants one of these, on something they own or are authorized to test:

- Check their own repo before shipping: secrets and AI keys in the code, risky routes, runtime versions with known advisories. Run \`npx penthera@${version} --repo .\` in the repo. Add \`--sarif penthera.sarif\` for GitHub code scanning.
- Check their dependencies: what each package can do (shell, network, install scripts), typosquats, known-malicious versions. Run \`npx penthera@${version} deps\`.
- Check AI coding tool config: MCP servers, hooks, permissions, skills and instruction files. Run \`npx penthera@${version} agents\` (add \`--home\` for the user-level config).
- Check a running app they may test, such as a staging URL or localhost: headers, TLS, cookies, exposed files. Run \`npx penthera@${version} https://staging.example.com\`.
- Check a public site's basic security from here, without installing anything: \`POST ${origin}/api/check\` with \`{"url": "example.com"}\`. One passive GET, nothing stored, 8 checks a minute. It returns a score and each check with evidence, a fix and a curl to verify it. Spec: [${origin}/openapi.json](${origin}/openapi.json).

  \`\`\`
  curl -s ${origin}/api/check -H 'content-type: application/json' -d '{"url":"example.com"}'
  \`\`\`

- Call it as tools from an agent: the MCP server, \`npx -y penthera@${version} mcp\`. Its tools are read-only and run no shell.

Do not use it to find novel vulnerabilities, to test someone else's system, or in place of a human penetration test.
`;
}

// ── The homepage as Markdown ────────────────────────────────────────────────

/** /index.md: what the page says, for an agent that asked for Markdown. */
export function homeMarkdown({ values: v, version, origin }) {
  const pin = `penthera@${version}`;
  return `# Penthera: your open-source cyber security agent

> The security review you never had time for. Offline, rule-based, and you can verify every finding yourself.

Penthera ${version} is an open-source security agent for your apps and AI coding tools. It runs on your machine, with no account and no telemetry. Readable rules decide every finding and show the evidence; a model may only propose. MIT license, Node.js 22 or later, ${v.DEPS_N}.

This is ${origin}/ as Markdown. Only scan what you own or are authorized to test.

## Three ways to start

Each command is pinned, so it runs ${version} and never updates without you.

1. In a terminal, the CLI. The guided start asks before it changes anything and never commits or pushes.

   \`\`\`
   npx ${pin}
   \`\`\`

2. In your coding agent, the Agent Skill. It teaches Claude Code, Cursor, Codex and other agents to run scans and explain them.

   \`\`\`
   npx skills add danoszz/penthera
   \`\`\`

3. As tools your agent calls, the MCP server. Read-only tools; no fixes applied, no shell, no attack payloads.${v.MCP_NOTE_MD ? ` ${v.MCP_NOTE_MD}` : ""}

   \`\`\`
   claude mcp add penthera -- npx -y ${pin} mcp
   \`\`\`

   Other clients: ${origin}/docs/commands/mcp.md

## What it checks

| Target | What | Command |
|---|---|---|
| Your app | Secrets and AI keys (${v.N_SECRETS} patterns), admin and API routes, runtime versions with known advisories | \`npx ${pin} --repo .\` |
| Dependencies | What each package can do: shell, network, install scripts. Typosquats against ${v.PKGS} package names, known-malicious versions | \`npx ${pin} deps\` |
| AI tooling | MCP servers, hooks, permissions, and instructions that tell an agent to do harm (${v.N_AGENTS} rules) | \`npx ${pin} agents --home\` |
| A live URL | Headers, TLS, cookies, exposed files (${v.N_URL} URL scan templates), on sites you may test | \`npx ${pin} https://staging.example.com\` |

${v.RULES_ALL} readable rules in this release, citing ${v.REFS} sources.

## Live check API

Checks a public site's HTTPS, TLS, security headers, cookies and disclosure from one passive GET request. Nothing is stored. 8 checks a minute per address.

\`\`\`
curl -s ${origin}/api/check -H 'content-type: application/json' -d '{"url":"example.com"}'
\`\`\`

- \`action\`: \`passive\` (default), \`token\` (ownership token for the verified scan) or \`deep\` (the verified scan).
- Errors: \`{"error": {"code", "message", "hint"}}\`.
- OpenAPI 3.1: ${origin}/openapi.json

## How accurate it is

On the project's benchmark: precision ${v.BENCH_P} (95% CI ${v.BENCH_P_CI}) and recall ${v.BENCH_R} (95% CI ${v.BENCH_R_CI}), from ${v.BENCH_TP} true positives, ${v.BENCH_FP} false positives and ${v.BENCH_FN} misses in labs the project wrote. These numbers catch regressions; they do not measure real-world accuracy.

## Limits

- It finds known classes of problems, not novel ones. Opt-in AI mode lets a local model propose leads that the rules then check.
- It does not find business-logic or authorization flaws yet. Authenticated preview scans are planned.
- It will not find zero-days.
- It does not replace a human penetration test. Use it before and between tests.
- Accuracy on code the project did not write is still being measured (Penthera Bench v1 and experiment E1, pre-registered).

Details: ${origin}/docs/METHODOLOGY.md

## Links

- ${origin}/llms.txt: for agents, what Penthera is and where each doc is
- ${origin}/llms-full.txt: README.md and the documentation as one file
- ${origin}/docs/index.md: the documentation index
- ${origin}/openapi.json: the live check API
- ${REPO}: source
- ${NPM}: package
- ${origin}/sitemap.xml
`;
}

/** The files this module adds to site/dist. */
export function agentReadyFiles({ root, version, origin, values }) {
  return {
    "index.md": homeMarkdown({ values, version, origin }),
    "openapi.json": JSON.stringify(openApi({ version, origin, root }), null, 2) + "\n",
  };
}
