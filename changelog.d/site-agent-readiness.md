section: Site

- **Unknown API paths answer in JSON.** `/api` and anything under it that is not a route return a 404 with `error.code`, `error.message` and `error.hint`, the shape `POST /api/check` uses.
- **The live check says when to retry.** A rate-limited check now carries `Retry-After`, set to the longest wait among the limits it hit, and the OpenAPI spec states the rate limits and how versions and breaking changes work.
- **`/server.json` is on the site.** It is the MCP Registry manifest from the repo: a local npm package over stdio, with no hosted endpoint.
- **New `/contact` page,** with public channels: email, GitHub and private security reports.
- **The homepage's structured data adds an Organization** with the public contact email, and no street address or phone. `llms.txt` now says what Penthera does not do, and the OpenAPI fields all declare a type.
