section: Changed

- **The first screen of [penthera.org](https://penthera.org) is now the live
  check.** "Is your site/app safe?" sits over the field and the Check button,
  with the title kept as the page's h1 in a small kicker above it. On the
  right, an example result card shows real output: the site's own passive
  check, run at build time against the test server in
  `tests/fixtures/mock-server.js` on loopback. Your result replaces that card
  in the same place. The left side then lists the next steps above the fold:
  Prompt to fix, `npx penthera <url>`, `npx penthera --repo .` and Star on
  GitHub. A clean result gets the same next steps. On a phone, Prompt to fix
  sits inside the card, and Star on GitHub stands in for the commands you
  would run on a laptop. The check itself is unchanged: passive, nothing
  stored, the same consent and slide to scan.
- Two new cookieless event labels, named in
  [docs/privacy.md](../docs/privacy.md): `copy {what: "repo-result"}` and
  `link {to: "github-star-result"}`, for the two new buttons next to a
  result. The live check's terms now say what is counted, as privacy.md does:
  that a check ran and whether it returned a report or an error, never the
  address, the score or anything you type.
