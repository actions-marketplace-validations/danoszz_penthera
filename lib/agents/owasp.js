/**
 * Map agent-config rules to the OWASP MCP Top 10 (2025) and the OWASP Top 10
 * for Agentic Applications (2026, "ASI") so findings line up with the
 * frameworks people already report against.
 *
 * MCP03 Tool Poisoning is about instructions in MCP tool descriptions and
 * metadata. No rule here reads tool descriptions (servers are never started),
 * so no rule carries MCP03. Hidden text in skills and rule files maps to ASI01
 * (goal hijack), not to tool poisoning.
 */

export const OWASP_NAMES = {
  MCP01: "MCP01:2025 Token Mismanagement & Secret Exposure",
  MCP02: "MCP02:2025 Privilege Escalation via Scope Creep",
  MCP03: "MCP03:2025 Tool Poisoning",
  MCP04: "MCP04:2025 Software Supply Chain Attacks & Dependency Tampering",
  MCP05: "MCP05:2025 Command Injection & Execution",
  MCP07: "MCP07:2025 Insufficient Authentication & Authorization",
  MCP09: "MCP09:2025 Shadow MCP Servers",
  ASI01: "ASI01 Agent Goal Hijack",
  ASI02: "ASI02 Tool Misuse & Exploitation",
  ASI03: "ASI03 Identity & Privilege Abuse",
  ASI04: "ASI04 Agentic Supply Chain Vulnerabilities",
  ASI05: "ASI05 Unexpected Code Execution",
  ASI06: "ASI06 Memory & Context Poisoning",
  ASI07: "ASI07 Insecure Inter-Agent Communication",
  ASI09: "ASI09 Human-Agent Trust Exploitation",
};

const HIDDEN = ["ASI01"];
const EXEC = ["MCP05", "ASI05"];
const SUPPLY = ["MCP04", "ASI04"];

export const RULE_OWASP = {
  // Hidden content
  "unicode-tags": HIDDEN,
  "variation-selectors": HIDDEN,
  "bidi-controls": HIDDEN,
  "zero-width": HIDDEN,
  "whitespace-vertical": HIDDEN,
  "whitespace-horizontal": HIDDEN,
  "html-comment-instructions": HIDDEN,
  "scanner-directed": HIDDEN,
  "base64-blob": ["ASI01", "ASI04"],
  "embedded-binary": SUPPLY,
  "unknown-binary": SUPPLY,
  "symlink-escape": ["ASI04"],
  "file-too-large": ["ASI04"],
  // Code execution
  "curl-pipe-shell": EXEC,
  "curl-pipe-interpreter": EXEC,
  "shell-process-substitution": EXEC,
  "shell-command-substitution": EXEC,
  "base64-pipe-shell": EXEC,
  "shell-eval": EXEC,
  "js-eval-remote": EXEC,
  "py-exec-remote": EXEC,
  "powershell-iex": EXEC,
  // MCP servers
  "mcp-unpinned": SUPPLY,
  "mcp-inline-secret": ["MCP01", "ASI03"],
  "mcp-plain-http": ["MCP07", "ASI07"],
  "mcp-exec": EXEC,
  "mcp-auto-approve": ["MCP02", "ASI09"],
  "env-code-injection": EXEC,
  "registry-redirect": SUPPLY,
  // Hooks and permissions
  "hook-exec": EXEC,
  "hook-pipe-shell": EXEC,
  "hook-auto-approve": ["MCP02", "ASI09"],
  "hook-local-script": ["ASI05"],
  "task-folder-open": EXEC,
  "permission-wildcard": ["MCP02", "ASI03"],
  "permission-tmp-script": ["MCP02", "ASI03"],
  "permission-bypass-mode": ["MCP02", "ASI09"],
  "permission-credential-read": ["MCP01", "ASI03"],
  // Plugins
  "marketplace-unpinned": SUPPLY,
  "plugin-source-unpinned": SUPPLY,
  // Lock file
  "lock-changed": SUPPLY,
  "lock-new": ["MCP09", "ASI04"],
  "lock-removed": ["MCP09"],
  "lock-missing": ["MCP09"],
  "config-unparsed": [],
};

export function owaspFor(rule) {
  return RULE_OWASP[rule] || [];
}

export function owaspLabel(ids) {
  return ids.map((id) => OWASP_NAMES[id] || id).join(" · ");
}
