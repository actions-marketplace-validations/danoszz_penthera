# Fix-recipe fixtures

One deliberately insecure app per framework, used by `tests/fix.test.js`. Each
one is missing security headers, sets a cookie without flags, allows any CORS
origin, and has a login route without a rate limit. The Express and Next.js apps
also carry a hardcoded secret: a random string, not a real credential.

The apps are never installed or run: the tests copy a fixture to a temp git
repo, plan fixes, apply them, and re-scan statically.
