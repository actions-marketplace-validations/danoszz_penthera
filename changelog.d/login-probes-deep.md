section: Changed

- **The default scan sends no attack payloads to your login.** A URL scan
  used to POST nine logins and an `' OR '1'='1` string to `/api/login`,
  which a CDN firewall (Vercel, Cloudflare) can read as an attack and start
  challenging you. Now `quick` sends no login request, `standard` sends one
  login with invalid credentials (to catch a login that accepts anything),
  and the rate-limit burst and the SQL error check run only with `--deep`.
  The MCP `scan_url` tool follows the same profiles.
