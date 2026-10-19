# Due diligence checklist

What a funder, sponsor or acquirer is likely to check, what is already in
place, and what is still open. Checked on 2026-10-19 against the `main` branch
at commit 156eda6.

Legend: **Done**, **Open** (needs action), **Decide** (maintainer's call).

## 1. Contributions and sign-off (DCO)

| Item | Status | Notes |
|------|--------|-------|
| Contributors are all known | Done | `git shortlog -sne --all`: 54 commits as "Daan van der Zwaag <daan@devign.it>", 6 as "Daan <daan@devign.it>" (same person, commits made in the GitHub web UI), 1 from dependabot. No outside human contributors. All 8 pull requests so far were opened by the maintainer or dependabot. |
| DCO sign-off required | Open | The Developer Certificate of Origin 1.1 (https://developercertificate.org/) lets a contributor certify they have the right to submit their code under the project licence. This PR adds a DCO section to CONTRIBUTING.md. Enforcement is not on yet. To enforce, install a DCO check app on the repo, or turn on "Require contributors to sign off on web-based commits" in repository settings. |
| Past commits | Decide | Past commits are not signed off, but all are by the maintainer, so no outside rights are in question. A short statement in the README or this file is enough; rewriting history is not worth it. |
| Author identity | Open | Add a `.mailmap` mapping "Daan" to "Daan van der Zwaag" so tools show one author. |
| AI-assisted commits | Done | 45 commit messages carry `Co-Authored-By: Claude ...` trailers, recording which work was AI-assisted. NLnet's GenAI policy names commit messages as one acceptable way to log this (https://nlnet.nl/foundation/policies/generativeAI/). |

## 2. Licence and copyright

| Item | Status | Notes |
|------|--------|-------|
| Project licence | Done | MIT, in `LICENSE`, `package.json` and `.claude-plugin/plugin.json`. |
| Copyright line | Open | `LICENSE` says "Copyright (c) 2026 daan". Change to the full legal name, or to a company if the maintainer moves the project into one: "Copyright (c) 2026 Daan van der Zwaag". |
| Runtime dependencies | Done | One: `yaml` (ISC). Dev dependency: `vitest` (MIT). Both permissive. |
| Third-party data in the source | Open | `lib/params.js` has a parameter wordlist with the comment "Curated from SecLists, Arjun defaults, and CommonCrawl analysis." SecLists is MIT and Arjun is AGPL-3.0 (GitHub licence metadata for both repositories). A list of common parameter names like `id` and `page` is unlikely to carry copyright on its own, but an acquirer's lawyer will ask. Options: document which entries came from where, or rebuild the list from MIT sources only and change the comment. Add a `THIRD_PARTY_NOTICES` file crediting SecLists. |
| Other inspiration notes | Decide | The same file says "Inspired by: Arjun (6.2k stars), ParamSpider". Inspiration for an algorithm is fine; make sure no code was copied, and keep the note. |
| Copyright of AI-assisted code | Decide | The US Copyright Office's report "Copyright and Artificial Intelligence, Part 2: Copyrightability" (29 January 2025, https://www.copyright.gov/ai/) addresses protection for AI-generated material. It is a US source; EU and Dutch law may differ. This matters little for an MIT project but may come up in an acquisition. Keep the co-author trailers as the record of human direction and review. Not legal advice. |
| Assets | Done | `assets/` holds the project's own logo, social image and demo GIF. Confirm the logo was made by the maintainer or under a licence that allows transfer. |

## 3. Name and trademark

| Item | Status | Notes |
|------|--------|-------|
| Existing "Penthera" company | Decide | Penthera (penthera.com) is a US company, founded around 2004 to 2005, that sells a video download SDK for mobile apps and describes itself as a SaaS company for streaming providers (https://www.penthera.com/about, https://pitchbook.com/profiles/company/61416-37). Different field (video delivery, not security), but the same word. A search found no registered PENTHERA mark; that search was not exhaustive. |
| Similar name in security | Decide | Pentera (pentera.io), formerly Pcysys, sells automated security validation and pentesting software (https://en.wikipedia.org/wiki/Pentera). Pentera Security Ltd. has filed US trademark applications for PENTERA covering security software (https://trademarks.justia.com/owners/pentera-security-ltd-5403910). "Penthera" and "Pentera" differ by one letter in the same product category. This is the bigger risk: an acquirer will notice, and a confusion claim is plausible. |
| Recommended next steps | Open | 1. Search EUIPO eSearch plus, TMview and the BOIP register for PENTHERA and PENTERA in classes 9 and 42. 2. Ask an IP lawyer for a short clearance opinion before spending on a filing or a brand. 3. If cleared, a Benelux filing at BOIP costs EUR 244 for one class (https://boip.int/en/node/2163, verify before filing); an EU trade mark at EUIPO costs more. 4. If not cleared, a rename is cheapest now, while adoption is small. |
| npm and GitHub names | Done | `penthera` on npm and `danoszz/penthera` on GitHub are held by the maintainer. |

## 4. Security posture of the project itself

| Item | Status | Notes |
|------|--------|-------|
| Pinned GitHub Actions | Done | Every `uses:` in `.github/workflows/` is pinned to a full commit SHA with the version in a comment. Dependabot proposes updates (an update to `actions/setup-node` is open as pull request #11). |
| Staged npm publishing with 2FA | Done | `publish.yml` runs `npm stage publish`; nothing goes live until the maintainer approves the staged version with 2FA on npmjs.com. A hijacked workflow can stage, never ship. Merged in pull request #13. |
| Trusted publishing, no stored token | Done | Publishing uses npm trusted publishing (OIDC). No npm token is stored in the repo or in secrets. |
| npm provenance | Done | `--provenance` links each tarball to the workflow run and commit. |
| CodeQL | Done | `.github/workflows/codeql.yml`. |
| OpenSSF Scorecard | Done | Runs weekly and on push. Score 6.3 / 10 on 2026-10-19 (https://scorecard.dev/viewer/?uri=github.com/danoszz/penthera). |
| Scorecard: Token-Permissions 0 | Open | Scorecard reports workflow tokens with excessive permissions. `publish.yml` grants `contents: write` and `id-token: write` at the top level; move them to the job and set `permissions: read-all` or `{}` at the top. Check the other workflows the same way. |
| Scorecard: Code-Review 0 | Decide | 0 of 15 changesets were reviewed by a second person. Expected for a solo project. A second maintainer or an outside reviewer would fix it. |
| Scorecard: Signed-Releases 0 | Open | Scorecard looks for signatures or provenance attached to GitHub Releases. npm provenance exists, but the GitHub Release has no signed artefact. Attaching the packed tarball with a provenance attestation (for example `actions/attest-build-provenance`) would cover it. |
| Scorecard: CII-Best-Practices 0 | Open | Apply for the OpenSSF Best Practices badge (https://www.bestpractices.dev/). Most criteria are already met. |
| Scorecard: Fuzzing 0 | Decide | Penthera has property-based API fuzzing as a feature, but the project's own code is not fuzzed. Low priority. |
| Scorecard: Branch-Protection not scored | Open | Scorecard could not read branch protection (needs an admin token). Check that `main` requires PRs and passing CI. |
| Security policy | Done | `SECURITY.md` with private advisory reporting, response times and safe harbour. |
| Offline tests | Done | Tests do not reach the internet (CONTRIBUTING.md). |
| No telemetry | Done | Stated in README "Privacy". An acquirer may want to verify it; the egress guard on the roadmap would make it testable. |

## 5. Business and governance

| Item | Status | Notes |
|------|--------|-------|
| Legal entity | Decide | The project is held by an individual. Funders such as NLnet accept individuals. An acquisition is simpler if the code, names and accounts sit in one entity. |
| Accounts that would transfer | Open | List them: GitHub repo, npm package and its trusted publisher config, skills.sh listing, plugin marketplace entries, domain (if any), GitHub Sponsors profile. Make sure each has 2FA and a recovery path. |
| Bus factor | Open | One maintainer. A documented release runbook exists (CONTRIBUTING.md, "Cutting a release"). Consider a second npm owner with 2FA for continuity. |
| Funding history | Done | None so far. Keep a simple record of any grant or sponsorship income from the start. |
| Claims in public material | Done | README and docs say "readiness" and "evidence", never "certified" or "compliant". Keep it that way in pitches. |

## Sources

- DCO 1.1: https://developercertificate.org/
- NLnet GenAI policy: https://nlnet.nl/foundation/policies/generativeAI/
- US Copyright Office AI reports: https://www.copyright.gov/ai/
- Penthera (video SDK company): https://www.penthera.com/about , https://pitchbook.com/profiles/company/61416-37
- Pentera: https://en.wikipedia.org/wiki/Pentera , https://trademarks.justia.com/owners/pentera-security-ltd-5403910
- BOIP fees: https://boip.int/en/node/2163
- OpenSSF Scorecard result: https://api.scorecard.dev/projects/github.com/danoszz/penthera
- Arjun licence: https://github.com/s0md3v/Arjun ; SecLists licence: https://github.com/danielmiessler/SecLists
