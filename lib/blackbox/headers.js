/**
 * HTTP security header audit.
 */

const HEADER_CHECKS = [
  {
    header: "x-frame-options",
    severity: "low",
    title: "Missing X-Frame-Options",
    description: "Page can be embedded in iframes (clickjacking risk).",
    category: "headers",
  },
  {
    header: "content-security-policy",
    severity: "medium",
    title: "Missing Content-Security-Policy",
    description: "No CSP, inline scripts and third-party resources are unrestricted.",
    category: "headers",
  },
  {
    header: "x-content-type-options",
    severity: "low",
    title: "Missing X-Content-Type-Options",
    description: "Browser may MIME-sniff responses (XSS aid).",
    category: "headers",
  },
  {
    header: "referrer-policy",
    severity: "info",
    title: "Missing Referrer-Policy",
    description: "Referrer headers may leak internal URLs to third parties.",
    category: "headers",
  },
  {
    header: "permissions-policy",
    severity: "info",
    title: "Missing Permissions-Policy",
    description: "Browser features (camera, geolocation) are not restricted by policy header.",
    category: "headers",
  },
];

/** A header's value, whatever the case of its name; "" when absent. */
function headerValue(headers, name) {
  const key = Object.keys(headers).find((h) => h.toLowerCase() === name);
  return key ? String(headers[key]).trim() : "";
}

/**
 * @param {Record<string, string>} headers - lowercase header map
 * @param {string} url
 * @param {object} opts
 */
export function auditSecurityHeaders(headers = {}, url, opts = {}) {
  const findings = [];
  const local = opts.local || false;
  const isHttps = url.startsWith("https://");

  for (const check of HEADER_CHECKS) {
    const present = Object.keys(headers).some((h) => h.toLowerCase() === check.header);
    if (present) continue;

    findings.push({
      severity: check.severity,
      title: check.title,
      description: check.description,
      url,
      category: check.category,
      source: "header-audit",
    });
  }

  if (!isHttps && !local) {
    findings.push({
      severity: "high",
      title: "No HTTPS, traffic sent in cleartext",
      description: "Credentials and session data can be intercepted on the network. Use TLS in production.",
      url,
      category: "transport",
      source: "header-audit",
    });
  }

  // X-Powered-By names the framework (Express and PHP send it by default) and
  // serves no client. Reported on its own, since it is fixed on its own:
  // app.disable("x-powered-by"), expose_php = Off, poweredByHeader: false.
  const poweredBy = headerValue(headers, "x-powered-by");
  if (poweredBy) {
    findings.push({
      severity: "low",
      title: `X-Powered-By header discloses ${poweredBy.slice(0, 60)}`,
      description: `Responses carry \`X-Powered-By: ${poweredBy.slice(0, 120)}\`, which tells an attacker which framework to target. It serves no client; remove it.`,
      evidence: `x-powered-by: ${poweredBy.slice(0, 120)}`,
      remediation: "Express: app.disable(\"x-powered-by\") (or helmet). PHP: expose_php = Off. Next.js: poweredByHeader: false.",
      url,
      category: "headers",
      source: "header-audit",
      confidence: "confirmed",
    });
  }

  const server = headers.server || headers["x-powered-by"];
  if (server && /uvicorn|gunicorn|werkzeug/i.test(server)) {
    findings.push({
      severity: "info",
      title: "Server version disclosed",
      description: `Response exposes server header: ${server}`,
      url,
      category: "disclosure",
      source: "header-audit",
    });
  }

  return findings;
}
