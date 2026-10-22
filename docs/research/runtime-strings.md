# Runtime strings: a labelled test set for runtime advisories

> **Project page.** For "does Penthera's runtime-advisory check keep its promises on the version strings real servers, images and repos actually contain?"

Penthera 1.8.0 reads `Server` and `X-Powered-By` banners, `PHPSESSID`, Docker
images and version files, and answers per product and advisory: affected, end
of life with no fix, check on server, or has the fix (see
[runtime advisories](../runtime-advisories.md)). It promises two things:

1. A hidden or partial version is never reported as safe.
2. A distribution build is never reported as affected, because distributions
   backport fixes under the old upstream number.

This set tests both promises on 253 real-world strings for PHP, Apache httpd,
nginx, Node.js, Python and OpenSSL. Every string is labelled by hand from a
primary source. The test runs each string through the real engine and the
bundled `advisories` pack.

- Set: [`bench/runtime-strings/strings.json`](../../bench/runtime-strings/strings.json)
- Test: [`tests/runtime-strings.test.js`](../../tests/runtime-strings.test.js) (part of `npm test`)
- Rows and labeller: [`rows.mjs`](../../bench/runtime-strings/rows.mjs), [`label.mjs`](../../bench/runtime-strings/label.mjs)

**Result, 22 Oct 2026.** The first promise holds on every string. The second
holds on every string that marks itself as a distribution build: 43 of 43.
It does not hold on 14 distribution builds whose string is identical to an
upstream one. Six of those are PHP builds: four are reported as critical and
likely affected, including Ubuntu 24.04's patched `PHP/8.3.6` behind a CDN.
The other two get a critical "end of life, no fix". The set
also found four small engine bugs. Each has its own fix PR: B2 and B1 are
merged ([#101](https://github.com/danoszz/penthera/pull/101),
[#102](https://github.com/danoszz/penthera/pull/102)), and B3, B4 and the L1
mitigation are open.

## Results

The test prints this table on every run. "Label" means the engine matched the
whole label: evidence kind, every verdict and end of life. "Report" counts
only what the user sees, the verdicts and end of life. A kind-only miss gives
the right findings for the wrong reason.

| Category | Entries | First run: label | First run: report | With #101 and #102: label | With #101 and #102: report |
|---|---:|---:|---:|---:|---:|
| distro-backport | 43 | 100.0% | 100.0% | 100.0% | 100.0% |
| distro-unmarked | 14 | 0.0% | 7.1% | 0.0% | 7.1% |
| docker-floating | 43 | 88.4% | 90.7% | 90.7% | 93.0% |
| docker-pinned | 24 | 100.0% | 100.0% | 100.0% | 100.0% |
| end-of-life | 23 | 82.6% | 82.6% | 100.0% | 100.0% |
| exact-upstream | 41 | 100.0% | 100.0% | 100.0% | 100.0% |
| hidden-partial | 14 | 85.7% | 92.9% | 85.7% | 92.9% |
| lookalike | 17 | 100.0% | 100.0% | 100.0% | 100.0% |
| prerelease-suffix | 12 | 0.0% | 58.3% | 100.0% | 100.0% |
| version-file | 22 | 90.9% | 90.9% | 90.9% | 90.9% |
| **total** | **253** | **84.6%** | **88.5%** | **91.3%** | **92.5%** |

The first run is the engine as released in 1.8.0. The remaining misses are
B3 (2), B4 (5), G1 (1) and L1 (14). B3 and B4 have open fixes. L1 entries
stay misses after the L1 mitigation, because the verdict is still "affected"
(at `potential` confidence).

By product: PHP 88 entries, Apache httpd 45, Python 36, nginx 33, Node.js 31,
OpenSSL 20.

The test passes. Every entry the engine gets wrong carries a `deviation` that
records what the engine says today. The test checks that the engine still says
exactly that, so the suite stays green and the miss stays on the record. When a
fix lands, that entry fails until its deviation is removed, so each fix shows up
as a change to this table.

## What the set found

| Id | Type | Entries | What goes wrong | Worst case |
|---|---|---:|---|---|
| L1 | limitation | 14 | A distribution build whose string equals an upstream one is read as upstream | `X-Powered-By: PHP/8.3.6` from a patched Ubuntu 24.04 behind a CDN: **critical, likely affected** |
| B2 (fixed, #101) | bug | 12 | `-dev` is read as a distribution build, and `RC`, `rc` or `-beta` as no version | `PHP/8.4.27-dev`, a build from before 8.4.27: **"has the fix"** |
| B1 (fixed, #102) | bug | 5 | `introduced` is ignored on release lines older than the flaw | `Apache/2.2.34`: **critical, "end of life, no fix"** for a flaw that only exists in 2.4.49 and 2.4.50 |
| B4 | bug | 5 | Node.js LTS codenames (`lts/iron`, `node:iron`) are not resolved | `.nvmrc: lts/iron` (Node.js 20) is not reported as end of life |
| B3 | bug | 2 | `Server: Python/3.9 aiohttp/3.8.6` is ignored, because the Python pattern needs x.y.z | an end-of-life Python 3.9 is not reported |
| G1 | gap | 1 | Only `library/` images are read | `nginxinc/nginx-unprivileged:1.27` gives no evidence |

L1 and B2 break the promises. B1 overstates. B3, B4 and G1 understate, which
the docs allow ("no answer is not a clean bill of health").

### L1: distribution builds that look upstream

This is the main finding. The engine treats a version as a distribution build
in two cases: the version carries a package suffix, or the `Server` header names a
distribution. The research shows how often neither is true:

- **PHP.** Ubuntu 20.04 and 22.04 add the package revision to `PHP_VERSION`
  (`PHP/8.1.2-1ubuntu2.28`), via
  [debian/rules](https://git.launchpad.net/ubuntu/+source/php8.1/plain/debian/rules?h=ubuntu/jammy-updates).
  Ubuntu 24.04 and 26.04 do not
  ([noble rules](https://git.launchpad.net/ubuntu/+source/php8.3/plain/debian/rules?h=ubuntu/noble-updates)),
  so they print `PHP/8.3.6` and `PHP/8.5.4`. Debian 11 and 12 still try to add
  it, but the `sed` matches nothing since PHP 7.4's `configure.ac`. Debian
  stopped trying in 2024
  ([salsa commit](https://salsa.debian.org/php-team/php/-/commit/c53a23122e2e9d01089244cd6933e424004aaa41)).
  RHEL never adds a suffix
  ([php.spec](https://gitlab.com/redhat/centos-stream/rpms/php/-/raw/c9s/php.spec)).
- **nginx.** Only Ubuntu brands nginx (`nginx/1.24.0 (Ubuntu)`,
  [ubuntu-branding.patch](https://git.launchpad.net/ubuntu/+source/nginx/plain/debian/patches/ubuntu-branding.patch?h=ubuntu/noble-updates)).
  Debian and RHEL print plain `nginx/1.22.1` and `nginx/1.20.1`.
- **Python.** `http.server` prints `sys.version.split()[0]`, which has no
  package revision on any distribution.
- **Apache httpd.** This one is safe. Debian and Ubuntu set `ServerTokens OS`
  and the platform from `lsb_release`. EL builds put os-release `NAME` in
  `PLATFORM` ([httpd.spec](https://gitlab.com/redhat/centos-stream/rpms/httpd/-/raw/c9s/httpd.spec)).
  So `Apache/2.4.58 (Ubuntu)` names its distribution, and every PHP version on
  the same response inherits that.

PHP behind Apache on a distribution is therefore handled correctly. PHP-FPM
behind Debian's or RHEL's nginx is not, and neither is any PHP behind a CDN or
with `server_tokens off`. A version string cannot tell `PHP/8.3.6` from Ubuntu
24.04 apart from upstream 8.3.6, so this cannot be fixed from the string. Two
mitigations are possible (see the decisions below).

### B2: pre-releases

`main/php_version.h` on a release branch names the next patch with `-dev`:
`PHP-8.4` says `8.4.28-dev` today
([source](https://github.com/php/php-src/blob/PHP-8.4/main/php_version.h)).
A build from that branch between 8.4.26 and 8.4.27 sends `PHP/8.4.27-dev`. It
does not have the 21 October fix, but the engine strips `-dev`, treats the
rest as a distribution build of 8.4.27, and says it has the fix. RC tags have
no separator (`8.5.0RC1`), so `parseVersion` rejects them. The result is
"check on server", even for 8.6, which no advisory lists. Python's `3.15.0rc1`
gives no evidence, and OpenSSL's `4.1.0-beta2` is read as a distribution build.
Production servers rarely run pre-releases, but CI images and dev containers
do, and "has the fix" is the one answer that must never be wrong.

### B1: `introduced` and older lines

The httpd rule lists one line, `2.4`, fixed in 2.4.51 and introduced in 2.4.49.
For a line the rule does not list, the engine assumes the worst: "whether
the flaw exists on 2.2 is not stated; treat it as affected". That default is
right for PHP's 2026 advisories, which name no `introduced` version. Here the
advisory says the opposite: the flaw only exists in 2.4.49 and 2.4.50. Even
so, `Apache/2.2.34 (Unix)` and `httpd:2.2.34` get a critical "end of life,
no fix" finding for it, and CentOS 6's `Apache/2.2.15 (CentOS)` gets
"check on server". The end-of-life finding itself is correct and stays.

## Proposed fixes

Each is its own small PR with a regression test (B1–B4 are open, see
below). When each lands, the matching `deviation` entries come out of the
rows, `strings.json` is regenerated, and the table above is updated.

| PR | Change | Regression test |
|---|---|---|
| B1 | `verdictFor`: when the version's line has no fix entry, is older than the oldest listed line, and that line's entry has `introduced`, return none | `Apache/2.2.34 (Unix)` gives only the end-of-life finding |
| B2 | `parseVersion`: read `-dev`, `alpha`, `beta`, `RC` (any case, with or without a separator) as a pre-release that sorts below its release, and never as a distribution build. `parseImageRef` takes the same tags. A pre-release of the version after the fix is "check on server" | `PHP/8.4.27-dev` is affected; `PHP/8.4.28-dev` is check on server; `PHP/8.4.29-dev` has the fix; `PHP/8.6.0RC4` gives no advisory verdict |
| B3 | Python banner pattern: accept `Python/x.y` as `branch` evidence | `Python/3.9 aiohttp/3.8.6` is end of life |
| B4 | Node.js: map LTS codenames (`argon` 4 … `krypton` 24) to their line for `.nvmrc` `lts/<name>` and `node:<name>` | `.nvmrc: lts/iron` is end of life |
| L1 | Data, not code: a `runtime-distro-version` list in the pack of the frozen upstream version per supported distribution release (Ubuntu 24.04 php 8.3.6, Debian 12 nginx 1.22.1, EL9 php 8.0.30, …), reported as "check on server" with the distribution named | `X-Powered-By: PHP/8.3.6` alone is check on server, naming Ubuntu 24.04 |

A frozen-version list cannot cover a distribution that moves to new upstream
point releases. Debian, for example, ships `php8.2 8.2.35-1~deb12u1`, so its
`PHP/8.2.35` is identical to the upstream version and genuinely fixed. The list
only helps where the number stays fixed for the distribution's life.

## Decisions for the maintainer

Fixes for B1–B4 are open as separate PRs: B2
[#101](https://github.com/danoszz/penthera/pull/101), B1
[#102](https://github.com/danoszz/penthera/pull/102), B3
[#103](https://github.com/danoszz/penthera/pull/103) and B4
[#106](https://github.com/danoszz/penthera/pull/106). L1 changed what
Penthera claims, so it went to the maintainer:

1. **L1, decided: cap and explain**, implemented in
   [#114](https://github.com/danoszz/penthera/pull/114). For PHP, Apache
   httpd, nginx, Python and OpenSSL, an "affected" or "end of life" finding
   from a banner with no distribution token is now at most `potential`, with
   a note to check on the server. Severity is unchanged. Official images and
   version files stay `likely`. The set labels verdicts, not confidence, so
   the 14 L1 entries keep their deviation: the verdict is still "affected",
   now at `potential` with the note. Two alternatives were not taken: a pack
   list of frozen distribution versions (a possible follow-up), and "check
   on server" for every unmarked version (it would lose "affected" for
   upstream builds).
2. **Should this set gate releases?**
   - **(a) Recommended.** Yes, as it is now: part of `npm test`, with known
     deviations pinned.
   - (b) Add a floor to `npm run audit:internal` (for example report-match ≥
     88%), so a regression that also changes a deviation still fails.

## How the set was built

1. **Strings, from primary sources only.** These are vendor docs and source
   code (php-src, httpd, nginx, CPython, Werkzeug, aiohttp, Express,
   Next.js, Tomcat, OpenResty, OpenLiteSpeed, HHVM), distribution package archives
   (Launchpad, Debian madison and sources.debian.org, the AlmaLinux and Rocky
   repos, the CentOS vault), the official image library files and the Docker
   Hub tag API (every tag in the set returned 200 on 22 Oct 2026), and
   php.net's release list. Every PHP version in the set is in
   php.net's release JSON; 8.3.34 and 8.4.0 never existed, so they are left out.
   Nothing was scanned: no request went to anyone's server.
2. **Rows by hand.** Each row in `rows.mjs` gives the input, the product, and
   the truth about the string: its kind (`exact`, `distro`, `branch`,
   `present` or `none`) and its upstream version, with the source and a note.
   The kind is the judgement that matters, and it comes from the source, not
   from the engine. For example, `PHP/8.3.6` from Ubuntu 24.04 is `distro`,
   because Ubuntu's php8.3 package is a distribution build.
3. **Verdicts from the published facts.** `label.mjs` derives the verdicts
   for each row from the advisory facts in the pack's JSON (fixed versions,
   `introduced`, end-of-life dates) and the documented verdict table. It does
   not import the engine. It only runs the engine for rows marked with a
   deviation, to record what the engine says instead. The labels were then
   reviewed by hand, and each disagreement with the engine was checked
   against its source before it was classed as a bug, a limitation or a gap.
4. **The test.** It reads only `strings.json`. For each entry it builds the
   evidence the way a scan does: `evidenceFromResponse` for headers, and a
   temporary `Dockerfile` or version file through `evidenceFromRepo`. It
   then runs `matchRuntimeAdvisories` and `verdictFor` with the bundled
   packs. It checks four things: the label (or the pinned deviation); that
   the report's findings follow from the verdicts; the two promises on every
   entry without a deviation; and that `strings.json` is in sync with
   `rows.mjs`.

Labels are relative to the bundled pack: advisories up to 21 Oct 2026, with
end of life judged on the pack's date, 21 Oct 2026. So `OpenSSL/3.4.8` is not
end of life in the set, although OpenSSL 3.4 reached end of life on 22 Oct.
When the pack changes, regenerate with `node bench/runtime-strings/label.mjs`
and review the diff. The open Node.js advisory PR, for instance, will add
verdicts to every Node.js entry.

## Coverage

**Covered.**

- Exact upstream builds on both sides of every bundled fix.
- Every httpd `ServerTokens` level, and nginx's `server_tokens` off, on and
  build.
- `PHPSESSID`, `composer.json` and cut-short banners.
- Distribution builds from Ubuntu 20.04 to 26.04, Debian 11 to 13, EL7 to EL10
  (RHEL, Rocky, Alma, CentOS Stream) and CentOS 6 and 7.
- PHP, Python and OpenSSL pre-releases.
- OpenSSL letter releases including premium 1.1.1zj, and `-fips`.
- Pinned and floating official images, including RC and codename tags.
- `.php-version`, `.nvmrc`, `.node-version`, `.python-version`,
  `.tool-versions` and `runtime.txt`.
- End-of-life lines for all six products.
- Lookalikes: Tomcat, OpenLiteSpeed, IIS, HHVM, OpenResty, Tengine, Angie,
  Cloudflare, LibreSSL, PyPy, phpMyAdmin and Node-RED images, Express and
  Next.js.

**Not covered.**

- Alpine packages: Alpine builds print plain upstream numbers, and whether a
  given `-rN` backports or tracks upstream varies per package.
- Amazon Linux: no primary source for its httpd banner.
- SUSE and FreeBSD.
- Commercial LiteSpeed.
- Ubuntu ESM builds after Ubuntu 20.04's standard support ended.
- Banners rewritten by load balancers.
- `X-Powered-By` with several products.
- Compose files: they use the same image parser as Dockerfiles, which is
  covered.
- Node.js versions inside distribution packages: no input type carries them.

**Constructed, not observed.**

- Some full banners combine real package versions in the documented format:
  the CentOS 7 `Apache/2.4.6 (CentOS) OpenSSL/1.0.2k-fips mod_fcgid/2.3.9
  PHP/5.4.16`, the XAMPP `Apache/2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.2.12`, and
  the `ServerTokens Full` OpenSSL entries on Debian and Ubuntu.
- The cut-short `PHP/8` and `PHP/8.3`: PHP itself always prints the full
  version.
- The Debian and Ubuntu 24.04 PHP behaviour comes from their packaging source
  (debian/rules); it was not observed on a running server.

**Threats to validity.** The same person wrote the rows and the labeller, so
a misreading of an advisory would appear in both. The cross-check against
OpenAI's php2shell-checker in
[the case study](case-study-php-2026-10.md#an-independent-cross-check) covers
the PHP 2026 rules independently. The set is weighted towards PHP (88 of 253)
because PHP has four of the five bundled advisories.

## License

The set (`strings.json`, `rows.mjs`, `label.mjs`, this page) is licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The strings are
factual version identifiers quoted from the cited sources. None of those
sources restricts quoting a version number or a header value. The source
code cited is under its own license and is linked, not copied.
