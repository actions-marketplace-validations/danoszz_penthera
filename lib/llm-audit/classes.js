/**
 * Vulnerability classes for model-proposed findings, and which Penthera rule
 * family can check each one.
 *
 * Cloudflare's findings.json has no class field, so the class is inferred from
 * the finding's own words with the fixed table below: first match wins, the
 * same text always gives the same class, and the report says the class was
 * inferred. No model is involved. A class with `rule: null` has no Penthera
 * rule; its findings can only be reproduced (later) or stay unverified.
 *
 * `rule` says how rung 1 of the verification ladder looks for agreement:
 * - { family: "secrets" }: a secret-scan finding in the same file
 * - { family: "code-pattern", patterns }: a risky-pattern finding of one of
 *   these patterns in the same file
 * - { family: "agents" }: a `penthera agents` finding in the same file
 */

export const CLASSES = [
  {
    id: "hardcoded-secret",
    label: "Hardcoded secret",
    match: /hard-?coded\s+(?:\w+\s+)?(?:secret|credential|password|token|api[\s_-]?key|key)|(?:leaked|committed|exposed|plaintext)\s+(?:\w+\s+)?(?:secret|credential|api[\s_-]?key|token|password)|secret\s+(?:is\s+)?committed/i,
    rule: { family: "secrets" },
  },
  {
    id: "command-injection",
    label: "Command injection",
    match: /command\s+injection|shell\s+injection|os\s+command|\bchild_process\b|\bexecSync?\s*\(|\bspawn\s*\(.*shell/i,
    rule: { family: "code-pattern", patterns: ["command-injection"] },
  },
  {
    id: "code-injection",
    label: "Code injection (eval)",
    match: /code\s+injection|\beval\s*\(|\bnew\s+Function\s*\(|arbitrary\s+code\s+evaluation/i,
    rule: { family: "code-pattern", patterns: ["eval"] },
  },
  {
    id: "xss",
    label: "Cross-site scripting",
    match: /cross[\s-]site\s+scripting|\bxss\b|innerHTML|dangerouslySetInnerHTML/i,
    rule: { family: "code-pattern", patterns: ["innerHTML"] },
  },
  {
    id: "cors",
    label: "Permissive CORS",
    match: /\bcors\b|access-control-allow-origin/i,
    rule: { family: "code-pattern", patterns: ["cors-wildcard"] },
  },
  {
    id: "error-disclosure",
    label: "Error details disclosed",
    match: /stack\s+trace|error\s+(?:message\s+)?(?:leak|disclos|expos)|verbose\s+error/i,
    rule: { family: "code-pattern", patterns: ["error-leak"] },
  },
  {
    id: "agent-config",
    label: "AI agent configuration",
    match: /\bmcp\b|model\s+context\s+protocol|agent\s+(?:config|hook|skill|instruction)|\bSKILL\.md\b|\.claude\/settings/i,
    rule: { family: "agents" },
  },
  { id: "sql-injection", label: "SQL injection", match: /sql\s+injection|\bsqli\b/i, rule: null },
  { id: "path-traversal", label: "Path traversal", match: /path\s+traversal|directory\s+traversal|\.\.\/\s*sequences|zip\s*slip/i, rule: null },
  { id: "ssrf", label: "Server-side request forgery", match: /server[\s-]side\s+request\s+forgery|\bssrf\b/i, rule: null },
  { id: "open-redirect", label: "Open redirect", match: /open\s+redirect/i, rule: null },
  { id: "prototype-pollution", label: "Prototype pollution", match: /prototype\s+pollution/i, rule: null },
  { id: "deserialization", label: "Unsafe deserialization", match: /deserializ|unpickl|yaml\.load\b/i, rule: null },
  { id: "access-control", label: "Broken access control", match: /\bidor\b|insecure\s+direct\s+object|authori[sz]ation|access\s+control|privilege\s+escalation|tenant\s+isolation/i, rule: null },
  { id: "authentication", label: "Broken authentication", match: /authenticat|session\s+fixation|\bjwt\b|password\s+reset/i, rule: null },
  { id: "csrf", label: "Cross-site request forgery", match: /cross[\s-]site\s+request\s+forgery|\bcsrf\b/i, rule: null },
  { id: "race-condition", label: "Race condition", match: /race\s+condition|\btoctou\b|time[\s-]of[\s-]check/i, rule: null },
  { id: "resource-exhaustion", label: "Resource exhaustion", match: /denial\s+of\s+service|\bdos\b|resource\s+exhaustion|\bredos\b|unbounded/i, rule: null },
];

export const OTHER = { id: "other", label: "Other", rule: null };

/**
 * The class of a finding, from its title, then its description, then its root cause.
 * Earlier fields win, so a title that names the class is not overridden by a
 * description that mentions another one in passing.
 * @param {...string} texts
 */
export function classify(...texts) {
  for (const t of texts) {
    if (typeof t !== "string" || !t) continue;
    const hit = CLASSES.find((c) => c.match.test(t));
    if (hit) return hit;
  }
  return OTHER;
}

export function classById(id) {
  return CLASSES.find((c) => c.id === id) || OTHER;
}
