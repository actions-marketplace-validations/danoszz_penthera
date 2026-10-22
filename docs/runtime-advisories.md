# Runtime advisories

> **Pro.** For "is my PHP / nginx / Apache / Node.js / Python / OpenSSL affected by this advisory?"

When a runtime or web server gets a security release, the first question is
which of your systems run an affected version. Penthera answers what it can see
and says plainly what it cannot. The method and its limits are in the
methodology's [runtime advisories](METHODOLOGY.md#runtime-advisories) section.

## Check your app

```bash
penthera https://staging.example.com            # what the site says about itself
penthera --repo .                                # what the repository pins
```

Both runs check against the advisories in the bundled `advisories` pack and
any pack you add with `--rules`. You get one of four answers per product and
version:

| Answer | Meaning | What to do |
|---|---|---|
| **affected** | An exact upstream version is visible and is below the fix | Upgrade to the fixed version on that line |
| **end of life, no fix** | The version is on a line the vendor no longer supports | Move to a supported line |
| **check on server** | The product is in use but the version is hidden, floating (`php:8.3`), a distribution build (`8.1.2-1ubuntu2.19`), or a pre-release of the fixed version or the next one (`8.4.28-dev`, which PHP's branch reports from 8.4.27's release candidate on) | Run the check command in the finding (`php -v`, `nginx -v`, ...) on the server or in the container |
| **has the fix (as advertised)** | The visible version is at or above every fix | Nothing, unless a proxy or a stale banner could be lying |

No answer means no evidence of the product, which is **not** a clean bill of
health. Most production servers hide their version, and a CDN in front of the
site hides the origin entirely. When a big advisory lands, check your inventory
on the server itself, not only from outside.

For the PHP release of 21 October 2026, Penthera's verdicts match OpenAI's
independent [php2shell-checker](https://github.com/openai/php2shell-checker)
on every branch it lists; a test keeps it that way. See the
[case study](research/case-study-php-2026-10.md#an-independent-cross-check).

## Load an advisory before the next release

Advisory data is a signed rule pack, so a new advisory does not need a new
Penthera release:

```bash
penthera rules verify ./php-2026-10            # check the signature and every rule
penthera https://staging.example.com --rules ./php-2026-10
penthera --repo . --rules ./php-2026-10
```

Packs signed by the maintainer key in `lib/rules/allowed_signers` load
directly. A pack signed by someone else needs `--rules-signers <file>`, and an
unsigned one needs `--allow-unsigned-rules`. See [rule-packs.md](rule-packs.md).

## Write one (maintainers)

1. Copy the fixed versions **from the vendor's release announcement or
   changelog only**. Do not take them from news coverage, and never guess
   ahead of the release.
2. One rule per advisory, in a `runtime-advisory` rule file:

   ```json
   {
     "kind": "runtime-advisory",
     "rules": [
       {
         "id": "php-2026-10-example",
         "product": "php",
         "title": "Short description from the vendor",
         "severity": "critical",
         "cves": ["CVE-2026-NNNNN"],
         "cvss": { "version": "4.0", "score": 9.2 },
         "fixed": [
           { "branch": "8.3", "version": "8.3.NN" },
           { "branch": "8.4", "version": "8.4.NN" }
         ],
         "source": "https://www.php.net/ChangeLog-8.php",
         "date": "2026-10-21",
         "confidence": "confirmed"
       }
     ]
   }
   ```

   Use the vendor's own severity. Add `condition` when the flaw needs more than
   the version (an operating system, a SAPI, a module). Findings for such a rule
   never go above `potential`. Add `introduced` on a line when versions before
   it are not affected.
3. Build and sign it: `npm run rules:build -- ./php-2026-10 --name php-2026-10 --version 1.0.0`,
   then `scripts/rules/sign-pack.sh ./php-2026-10`.
4. Fold the rule into the bundled `advisories` pack in the next release, with a
   benchmark case (see [bench/README.md](../bench/README.md)).
