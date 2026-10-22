/**
 * The hand-labelled rows behind strings.json (see label.mjs).
 *
 * Every row: id, category, product, input ({ headers } | { image } | { file,
 * content }), kind, version (upstream, for exact/distro/branch), pre (a
 * pre-release of `version`), source, note, and optionally deviation (the id of
 * a known engine bug or limitation, see DEVIATIONS).
 *
 * kind is the truth about the string, not what the engine makes of it:
 *   exact    an upstream build at that exact version
 *   distro   a distribution build (backports fixes under the upstream number)
 *   branch   only the release line is known (php:8.3, .nvmrc: 20)
 *   present  the product, version not visible
 *   none     not the product, or no evidence for it at all
 */

export const CATEGORIES = {
  "exact-upstream": "An exact upstream version as the product prints it",
  "distro-backport": "A distribution build that says so (a package revision, or a Server header naming the distribution)",
  "distro-unmarked": "A distribution build whose string is identical to an upstream one",
  "hidden-partial": "The product with its version hidden or cut short (ServerTokens, server_tokens, expose_php, PHPSESSID, composer.json)",
  "prerelease-suffix": "Version suffixes: -dev, RC, OpenSSL letters, -fips",
  "docker-pinned": "Official Docker image tags with an exact version",
  "docker-floating": "Official Docker image tags that float (8.3, fpm, latest, lts, stable)",
  "version-file": ".php-version, .nvmrc, .node-version, .python-version, .tool-versions, runtime.txt",
  "end-of-life": "Exact or line-only versions on release lines past their end of support",
  lookalike: "Strings and images that look like one of the six products but are not",
};

export const DEVIATIONS = {
  B1: {
    type: "bug",
    status: "fixed in #102",
    title: "`introduced` is ignored for release lines older than the one the flaw was introduced on",
    detail: "CVE-2021-41773/42013 exist only in httpd 2.4.49 and 2.4.50 (`introduced: 2.4.49` on the 2.4 line). An exact 2.2 or 2.0 version is reported as \"end of life, no fix\" (critical, potential) for it, a distribution 2.2 build and a line-only 2.2 tag as \"check on server\". Lines below the oldest line that carries `introduced` cannot have the flaw.",
    fix: "In verdictFor, when the version's line has no fix entry and is older than the oldest listed line, and that line's entry has `introduced`, return none.",
  },
  B2: {
    type: "bug",
    status: "fixed in #101",
    title: "Pre-release versions are misread: -dev as a distribution build, RC/beta as no version",
    detail: "PHP/8.4.27-dev (a PHP-8.4 branch build from before 8.4.27) is reported as \"has the fix\": the -dev suffix is taken for a distribution build string and its upstream number compared with the fix. PHP/8.5.0RC1 and php:8.5.0RC1 parse as no version (\"check on server\" instead of affected); PHP/8.6.0RC4 gets \"check on server\" for advisories that do not cover 8.6. Python's 3.15.0rc1 and OpenSSL's 4.1.0-beta2 are dropped or taken for distribution builds.",
    fix: "Parse -dev, alpha, beta and RC (any case, with or without a separator) as a pre-release of the upstream number, sorting below the release, and never as a distribution build.",
  },
  B3: {
    type: "bug",
    status: "fixed in #103",
    title: "Python banners with only major.minor are ignored",
    detail: "aiohttp sends Server: Python/3.9 aiohttp/3.8.6 (aiohttp/http.py). The Python banner pattern needs x.y.z, so an end-of-life 3.9 is not reported; PHP's pattern already accepts x.y.",
    fix: "Accept Python/x.y in the banner pattern, which gives `branch` evidence.",
  },
  B4: {
    type: "bug",
    title: "Node.js LTS codenames are not resolved to their line",
    detail: "nvm accepts lts/iron in .nvmrc and the node image has iron, jod and hydrogen tags. They read as no version, so lts/iron (Node.js 20, end of life 30 Apr 2026) is not reported as end of life.",
    fix: "Map the LTS codenames (argon 4 … krypton 24) to their major line in lib/advisories/products.js.",
  },
  L1: {
    type: "limitation",
    title: "A distribution build whose string equals an upstream one is read as upstream",
    detail: "Debian 11-13 and Ubuntu 24.04+ print plain upstream PHP numbers (PHP/8.3.6), RHEL never adds a suffix, Debian's and RHEL's nginx add no OS token, and distribution Pythons print sys.version. Without a Server header naming the distribution, these read as exact upstream builds: PHP/8.3.6 from a patched Ubuntu 24.04 is reported critical and likely affected. The promise holds only for strings that mark themselves as distribution builds.",
    fix: "Not fixable from the string alone. Decided by the maintainer: such a banner gives at most `potential`, with a check-on-server note (#114). The verdict stays \"affected\" (labels here are verdicts, not confidence), so these entries keep this deviation. A list of frozen distribution versions in the pack is a possible follow-up.",
  },
  G1: {
    type: "gap",
    title: "Only official library images are read",
    detail: "nginxinc/nginx-unprivileged:1.27 is nginx 1.27 (end of life) but is not library/nginx, so there is no evidence. Absence is not reported as safe, so no promise breaks.",
    fix: "Optionally add well-known vendor images (nginxinc/nginx-unprivileged, bitnami/*) to dockerImages.",
  },
};

const H = (headers, cookies) => (cookies ? { headers, cookies } : { headers });
const XPB = (v) => H({ "x-powered-by": v });
const SRV = (v) => H({ server: v });
const IMG = (image) => ({ image });
const FILE = (file, content) => ({ file, content });

const PHP_REL = "https://www.php.net/releases/";
const HTTPD_TOKENS = "https://httpd.apache.org/docs/2.4/mod/core.html#servertokens";
const HTTPD_VULNS = "https://httpd.apache.org/security/vulnerabilities_24.html";

export const ROWS = [];
const add = (category, product, id, input, kind, version, source, note, extra = {}) =>
  ROWS.push({ id, category, product, input, kind, version, source, note, ...extra });

// ── PHP, upstream builds ────────────────────────────────────────────────
// X-Powered-By is "PHP/" PHP_VERSION (main/SAPI.c); expose_php=On prints it.
for (const [v, note] of [
  ["8.3.7", "last 8.3 release before CVE-2024-4577's fix (8.3.8): every bundled PHP advisory applies"],
  ["8.3.8", "fixes CVE-2024-4577, not CVE-2024-8926 (8.3.12)"],
  ["8.3.11", "one release below CVE-2024-8926's fix"],
  ["8.3.12", "the worked example in the 1.8.0 docs"],
  ["8.3.35", "last 8.3 release before 21 Oct 2026 (8.3.34 was never released)"],
  ["8.3.36", "the 21 Oct 2026 fix on 8.3: has every fix"],
  ["8.2.12", "the PHP XAMPP for Windows 8.2.12 bundles"],
  ["8.2.19", "below CVE-2024-4577's fix on 8.2 (8.2.20)"],
  ["8.2.20", "CVE-2024-4577 fixed, CVE-2024-8926 not (8.2.24)"],
  ["8.2.24", "both 2024 CGI fixes, not the 2026 ones"],
  ["8.2.34", "last 8.2 release before 21 Oct 2026"],
  ["8.2.35", "the 21 Oct 2026 fix on 8.2"],
  ["8.4.1", "first 8.4 GA release (8.4.0 was not published); the 2024 CGI advisories predate 8.4"],
  ["8.4.26", "one release below the 2026 fix on 8.4"],
  ["8.4.27", "the 21 Oct 2026 fix on 8.4"],
  ["8.5.0", "first 8.5 release"],
  ["8.5.11", "one release below the 2026 fix on 8.5"],
  ["8.5.12", "the 21 Oct 2026 fix on 8.5"],
]) add("exact-upstream", "php", `php-xpb-${v}`, XPB(`PHP/${v}`), "exact", v, PHP_REL, note);
add("exact-upstream", "php", "php-server-full-apache-unix-8.3.12", SRV("Apache/2.4.62 (Unix) PHP/8.3.12"), "exact", "8.3.12", HTTPD_TOKENS,
  "mod_php adds PHP/x.y.z to Server under ServerTokens Full; (Unix) marks a source build, not a distribution");
add("exact-upstream", "php", "php-xpb-and-server-same-version", H({ server: "Apache/2.4.62 (Unix) PHP/8.4.26", "x-powered-by": "PHP/8.4.26" }), "exact", "8.4.26", HTTPD_TOKENS,
  "the same version in two headers is one finding");

// ── Apache httpd, upstream builds and ServerTokens ──────────────────────
// ServerTokens Prod/Major/Minor/Min/OS/Full print "Apache", "Apache/2",
// "Apache/2.4", "Apache/2.4.62", "Apache/2.4.62 (Unix)", and Full adds modules.
const HTTPD_DIST = "https://archive.apache.org/dist/httpd/";
for (const [v, tok, note] of [
  ["2.4.48", "OS", "the release before CVE-2021-41773 was introduced: not affected"],
  ["2.4.49", "OS", "CVE-2021-41773 was introduced in 2.4.49"],
  ["2.4.50", "OS", "2.4.50's fix was incomplete (CVE-2021-42013)"],
  ["2.4.50", "Min", "ServerTokens Min: the version without the OS"],
  ["2.4.51", "OS", "fixes both"],
  ["2.4.62", "OS", "a 2024 release"],
  ["2.4.69", "OS", "newest 2.4 release in the Apache archive on 22 Oct 2026"],
]) {
  const banner = tok === "OS" ? `Apache/${v} (Unix)` : `Apache/${v}`;
  add("exact-upstream", "apache-httpd", `httpd-server-${tok.toLowerCase()}-${v}`, SRV(banner), "exact", v, v === "2.4.69" ? HTTPD_DIST : HTTPD_VULNS, note);
}
add("exact-upstream", "apache-httpd", "httpd-server-full-openssl-php", SRV("Apache/2.4.49 (Unix) OpenSSL/1.1.1l PHP/8.0.11"), "exact", "2.4.49", HTTPD_TOKENS,
  "ServerTokens Full with mod_ssl and mod_php: three products in one header");
for (const [banner, tok] of [["Apache", "Prod"], ["Apache/2", "Major"], ["Apache/2.4", "Minor"]]) {
  add("hidden-partial", "apache-httpd", `httpd-server-tokens-${tok.toLowerCase()}`, SRV(banner), "present", null, HTTPD_TOKENS,
    `ServerTokens ${tok}: the patch version is hidden, so 2.4.49/2.4.50 cannot be ruled out`);
}
add("end-of-life", "apache-httpd", "httpd-server-eol-2.2.34", SRV("Apache/2.2.34 (Unix)"), "exact", "2.2.34", HTTPD_DIST,
  "last 2.2 release (2.2 end of life July 2017); the 2.4.49 path traversal never existed on 2.2");
add("end-of-life", "apache-httpd", "httpd-server-eol-2.0.65", SRV("Apache/2.0.65 (Unix)"), "exact", "2.0.65", HTTPD_DIST,
  "last 2.0 release; not affected by a flaw introduced in 2.4.49");

// ── PHP, end-of-life lines ──────────────────────────────────────────────
for (const [v, note] of [
  ["8.1.28", "8.1 is end of life (31 Dec 2025); below CVE-2024-4577's fix on 8.1"],
  ["8.1.29", "has CVE-2024-4577's fix, not CVE-2024-8926's (8.1.30)"],
  ["8.1.34", "last 8.1 release: both 2024 fixes, no 2026 fix"],
  ["8.0.30", "last 8.0 release"],
  ["7.4.33", "last 7.4 release"],
  ["7.3.33", "last 7.3 release"],
  ["5.6.40", "last 5.6 release"],
]) add("end-of-life", "php", `php-xpb-eol-${v}`, XPB(`PHP/${v}`), "exact", v, "https://www.php.net/eol.php", note);

// ── Sources used below ──────────────────────────────────────────────────
const SAPI_H = "https://github.com/php/php-src/blob/master/main/SAPI.h";
const PHP_VER_84 = "https://github.com/php/php-src/blob/PHP-8.4/main/php_version.h";
const PHP_VER_85 = "https://github.com/php/php-src/blob/PHP-8.5/main/php_version.h";
const PHP_VER_MASTER = "https://github.com/php/php-src/blob/master/main/php_version.h";
const LP = (pkg, series) => `https://launchpad.net/ubuntu/${series}/+source/${pkg}`;
const MADISON = (pkg) => `https://qa.debian.org/madison.php?package=${pkg}&table=debian&text=on`;
const UBU_PHP_RULES_JAMMY = "https://git.launchpad.net/ubuntu/+source/php8.1/plain/debian/rules?h=ubuntu/jammy-updates";
const UBU_PHP_RULES_NOBLE = "https://git.launchpad.net/ubuntu/+source/php8.3/plain/debian/rules?h=ubuntu/noble-updates";
const DEB_PHP_EXTRA = "https://salsa.debian.org/php-team/php/-/commit/c53a23122e2e9d01089244cd6933e424004aaa41";
const DEB_PHP82_RULES = "https://sources.debian.org/data/main/p/php8.2/8.2.32-1~deb12u1/debian/rules";
const DEB_APACHE_RULES = "https://sources.debian.org/data/main/a/apache2/2.4.68-1~deb12u1/debian/rules";
const UBU_NGINX_BRAND = "https://git.launchpad.net/ubuntu/+source/nginx/plain/debian/patches/ubuntu-branding.patch?h=ubuntu/noble-updates";
const DEB_NGINX_SERIES = "https://sources.debian.org/data/main/n/nginx/1.22.1-9+deb12u9/debian/patches/series";
const EL_HTTPD_SPEC = "https://gitlab.com/redhat/centos-stream/rpms/httpd/-/raw/c9s/httpd.spec";
const EL_PHP_SPEC = "https://gitlab.com/redhat/centos-stream/rpms/php/-/raw/c9s/php.spec";
const ALMA = (rel, repo) => `https://repo.almalinux.org/almalinux/${rel}/${repo}/x86_64/os/Packages/`;
const CENTOS7 = "https://vault.centos.org/7.9.2009/os/x86_64/Packages/";
const CENTOS6 = "https://vault.centos.org/6.10/os/x86_64/Packages/";
const NGINX_TOKENS = "https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens";
const NGINX_DL = "https://nginx.org/en/download.html";
const NGINX_CHANGES = "https://nginx.org/en/CHANGES";
const MOD_SSL = "https://github.com/apache/httpd/blob/2.4.x/modules/ssl/ssl_engine_vars.c";
const OPENSSL_SRC = "https://openssl-library.org/source/";
const OPENSSL_111 = "https://openssl-library.org/news/vulnerabilities-1.1.1/";
const OPENSSL_102 = "https://github.com/openssl/openssl/blob/OpenSSL_1_0_2k/crypto/opensslv.h";
const CPY_SERVER = "https://github.com/python/cpython/blob/main/Lib/http/server.py";
const WERKZEUG = "https://github.com/pallets/werkzeug/blob/main/src/werkzeug/serving.py";
const AIOHTTP = "https://github.com/aio-libs/aiohttp/blob/master/aiohttp/http.py";
const NODE_DIST = "https://nodejs.org/dist/index.json";
const HUB = (img, tag) => `https://hub.docker.com/v2/repositories/${img.includes("/") ? img : `library/${img}`}/tags/${tag}`;
const LIB = (img) => `https://github.com/docker-library/official-images/blob/master/library/${img}`;
const NVM = "https://github.com/nvm-sh/nvm#nvmrc";
const XAMPP = "https://www.apachefriends.org/download.html";

// ── PHP, pre-releases ───────────────────────────────────────────────────
// A release branch reports the next patch with -dev (PHP-8.4 is "8.4.28-dev"
// after 8.4.27); an RC tag has no separator ("8.5.0RC1").
add("prerelease-suffix", "php", "php-xpb-dev-at-fix", XPB("PHP/8.4.27-dev"), "exact", "8.4.27", PHP_VER_84,
  "a PHP-8.4 branch build between 8.4.26 and 8.4.27: it predates the 21 Oct 2026 fix", { pre: true });
add("prerelease-suffix", "php", "php-xpb-dev-after-fix", XPB("PHP/8.4.28-dev"), "exact", "8.4.28", PHP_VER_84,
  "the PHP-8.4 branch today: after 8.4.27, so it has the fix", { pre: true });
add("prerelease-suffix", "php", "php-xpb-dev-8.5.13", XPB("PHP/8.5.13-dev"), "exact", "8.5.13", PHP_VER_85,
  "the PHP-8.5 branch today", { pre: true });
add("prerelease-suffix", "php", "php-xpb-dev-master", XPB("PHP/8.7.0-dev"), "exact", "8.7.0", PHP_VER_MASTER,
  "php-src master: a line newer than any advisory lists", { pre: true });
add("prerelease-suffix", "php", "php-xpb-rc-8.5.0RC1", XPB("PHP/8.5.0RC1"), "exact", "8.5.0", "https://github.com/php/php-src/blob/php-8.5.0RC1/main/php_version.h",
  "an 8.5 release candidate from 2025: below every 8.5 fix", { pre: true });
add("prerelease-suffix", "php", "php-xpb-rc-8.6.0RC4", XPB("PHP/8.6.0RC4"), "exact", "8.6.0", "https://github.com/php/php-src/blob/php-8.6.0RC4/main/php_version.h",
  "the current 8.6 release candidate: a line no bundled advisory lists", { pre: true });

// ── PHP, distribution builds that say so ────────────────────────────────
add("distro-backport", "php", "php-xpb-ubuntu-jammy-2.28", XPB("PHP/8.1.2-1ubuntu2.28"), "distro", "8.1.2", LP("php8.1", "jammy"),
  "Ubuntu 22.04 adds the package revision to PHP_VERSION (debian/rules); 2.28 was published 21 Oct 2026");
add("distro-backport", "php", "php-xpb-ubuntu-jammy-2.19", XPB("PHP/8.1.2-1ubuntu2.19"), "distro", "8.1.2", UBU_PHP_RULES_JAMMY,
  "an older jammy build; the upstream number 8.1.2 never changes on jammy");
add("distro-backport", "php", "php-xpb-ubuntu-focal", XPB("PHP/7.4.3-4ubuntu2.29"), "distro", "7.4.3", LP("php7.4", "focal"),
  "Ubuntu 20.04: 7.4 is end of life upstream, Ubuntu (and ESM) still patch it");
add("distro-backport", "php", "php-noble-behind-apache-ubuntu", H({ server: "Apache/2.4.58 (Ubuntu)", "x-powered-by": "PHP/8.3.6" }), "distro", "8.3.6", UBU_PHP_RULES_NOBLE,
  "Ubuntu 24.04 prints plain 8.3.6 (no EXTRA_VERSION); the Server header names the distribution");
add("distro-backport", "php", "php-noble-behind-nginx-ubuntu", H({ server: "nginx/1.24.0 (Ubuntu)", "x-powered-by": "PHP/8.3.6" }), "distro", "8.3.6", UBU_NGINX_BRAND,
  "PHP-FPM behind Ubuntu's nginx, which adds (Ubuntu) to its version");
add("distro-backport", "php", "php-bookworm-current", H({ server: "Apache/2.4.68 (Debian)", "x-powered-by": "PHP/8.2.35" }), "distro", "8.2.35", MADISON("php8.2"),
  "Debian 12 ships 8.2.35-1~deb12u1; Debian's PHP_VERSION carries no revision, the Server header names Debian");
add("distro-backport", "php", "php-bookworm-before-update", H({ server: "Apache/2.4.68 (Debian)", "x-powered-by": "PHP/8.2.32" }), "distro", "8.2.32", DEB_PHP82_RULES,
  "a bookworm box not yet updated: the number is below the fix, but a distribution build is never 'affected'");
add("distro-backport", "php", "php-bullseye-lts", H({ server: "Apache/2.4.62 (Debian)", "x-powered-by": "PHP/7.4.33" }), "distro", "7.4.33", MADISON("php7.4"),
  "Debian 11 LTS patches 7.4.33 (7.4.33-1+deb11u12) long after upstream end of life");
add("distro-backport", "php", "php-trixie-current", H({ server: "Apache/2.4.69 (Debian)", "x-powered-by": "PHP/8.4.27" }), "distro", "8.4.27", DEB_PHP_EXTRA,
  "Debian 13: 8.4.27-1~deb13u1; Debian stopped setting PHP_EXTRA_VERSION in 2024");
add("distro-backport", "php", "php-rocky9-default-stream", H({ server: "Apache/2.4.62 (Rocky Linux)", "x-powered-by": "PHP/8.0.30" }), "distro", "8.0.30", EL_PHP_SPEC,
  "EL9's default php is 8.0.30, supported by the distribution; RHEL adds no suffix, the httpd banner carries os-release NAME");
add("distro-backport", "php", "php-alma9-8.1-stream", H({ server: "Apache/2.4.62 (AlmaLinux)", "x-powered-by": "PHP/8.1.32" }), "distro", "8.1.32", ALMA(9, "AppStream"),
  "EL9 php:8.1 module stream, 8.1.32");
add("distro-backport", "php", "php-alma9-8.3-stream", H({ server: "Apache/2.4.62 (AlmaLinux)", "x-powered-by": "PHP/8.3.36" }), "distro", "8.3.36", ALMA(9, "AppStream"),
  "EL9 php:8.3 module stream, already at 8.3.36");
add("distro-backport", "php", "php-alma10", H({ server: "Apache/2.4.63 (AlmaLinux)", "x-powered-by": "PHP/8.3.36" }), "distro", "8.3.36", ALMA(10, "AppStream"),
  "EL10 ships php 8.3.36 and httpd 2.4.63");
add("distro-backport", "php", "php-rocky8-default", H({ server: "Apache/2.4.37 (Rocky Linux)", "x-powered-by": "PHP/7.2.24" }), "distro", "7.2.24", ALMA(8, "AppStream"),
  "EL8's php:7.2 stream");
add("distro-backport", "php", "php-centos7-full", SRV("Apache/2.4.6 (CentOS) OpenSSL/1.0.2k-fips mod_fcgid/2.3.9 PHP/5.4.16"), "distro", "5.4.16", CENTOS7,
  "CentOS 7's httpd 2.4.6, openssl 1.0.2k and php 5.4.16 under ServerTokens Full (the combination is constructed from those packages)");

// ── PHP, distribution builds that look upstream ─────────────────────────
add("distro-unmarked", "php", "php-noble-behind-cdn", XPB("PHP/8.3.6"), "distro", "8.3.6", UBU_PHP_RULES_NOBLE,
  "Ubuntu 24.04's php8.3 (8.3.6-0ubuntu0.24.04.13) with no distribution in Server (server_tokens off, or a CDN): the string equals upstream 8.3.6", { deviation: "L1" });
add("distro-unmarked", "php", "php-bookworm-behind-debian-nginx", H({ server: "nginx/1.22.1", "x-powered-by": "PHP/8.2.32" }), "distro", "8.2.32", DEB_NGINX_SERIES,
  "Debian's nginx adds no (Debian) token and Debian's PHP no revision: nothing marks the distribution", { deviation: "L1" });
add("distro-unmarked", "php", "php-bullseye-behind-nginx", H({ server: "nginx/1.18.0", "x-powered-by": "PHP/7.4.33" }), "distro", "7.4.33", MADISON("php7.4"),
  "Debian 11 LTS php7.4 behind Debian's nginx", { deviation: "L1" });
add("distro-unmarked", "php", "php-el9-behind-nginx", H({ server: "nginx/1.20.1", "x-powered-by": "PHP/8.0.30" }), "distro", "8.0.30", EL_PHP_SPEC,
  "EL9 default php behind EL9's nginx (no OS token)", { deviation: "L1" });
add("distro-unmarked", "php", "php-el8-8.2-stream-prod-tokens", H({ server: "Apache", "x-powered-by": "PHP/8.2.33" }), "distro", "8.2.33", ALMA(8, "AppStream"),
  "EL8's php:8.2 stream at 8.2.33 with ServerTokens Prod", { deviation: "L1" });
add("distro-unmarked", "php", "php-resolute-xpb", XPB("PHP/8.5.4"), "distro", "8.5.4", LP("php8.5", "resolute"),
  "Ubuntu 26.04's php8.5 (8.5.4-0ubuntu1.5), which also prints plain upstream", { deviation: "L1" });

// ── PHP, hidden and partial ─────────────────────────────────────────────
add("hidden-partial", "php", "php-cookie-only", H({ server: "nginx" }, ["PHPSESSID"]), "present", null, "https://www.php.net/manual/en/session.configuration.php#ini.session.name",
  "expose_php=Off, but PHPSESSID is PHP's default session.name");
add("hidden-partial", "php", "php-xpb-major-only", XPB("PHP/8"), "present", null, SAPI_H,
  "a cut-short banner (PHP itself prints the full version; a proxy or header rewrite leaves 'PHP/8')");
add("hidden-partial", "php", "php-xpb-minor-only", XPB("PHP/8.3"), "branch", "8.3", SAPI_H,
  "a cut-short banner naming the release line only");
add("hidden-partial", "php", "php-xpb-fpm-word", XPB("PHP-FPM"), "present", null, "https://www.php.net/manual/en/install.fpm.php",
  "a hand-set X-Powered-By naming PHP-FPM, no version");
add("hidden-partial", "php", "php-composer-json", FILE("composer.json", '{"require":{"php":"^8.2"}}\n'), "present", null, "https://getcomposer.org/doc/01-basic-usage.md#platform-packages",
  "require.php is a constraint, not the PHP that runs");

// ── PHP, Docker images ──────────────────────────────────────────────────
for (const [tag, kind, v, note, extra] of [
  ["8.3.12-fpm-alpine", "exact", "8.3.12", "pinned 2024 build; official images are upstream builds, -fpm-alpine is a variant"],
  ["8.2.12-apache", "exact", "8.2.12", "pinned Apache variant"],
  ["8.3.36-fpm", "exact", "8.3.36", "pinned at the fix"],
  ["7.4.33-fpm", "exact", "7.4.33", "last 7.4 image"],
  ["8.1.34-apache", "exact", "8.1.34", "last 8.1 image (pushed Jan 2026)"],
]) add("docker-pinned", "php", `php-img-${tag}`, IMG(`php:${tag}`), kind, v, HUB("php", tag), note, extra);
add("prerelease-suffix", "php", "php-img-8.5.0RC1", IMG("php:8.5.0RC1"), "exact", "8.5.0", HUB("php", "8.5.0RC1"),
  "an RC image from Oct 2025", { pre: true });
add("prerelease-suffix", "php", "php-img-8.6.0RC4-fpm", IMG("php:8.6.0RC4-fpm"), "exact", "8.6.0", LIB("php"),
  "the current RC image: a line no bundled advisory lists", { pre: true });
for (const [tag, kind, v, note] of [
  ["8.3", "branch", "8.3", "floats along 8.3: the patch level depends on when it was pulled"],
  ["8.4-cli", "branch", "8.4", "floating 8.4 CLI"],
  ["8.1-fpm", "branch", "8.1", "8.1 is end of life; the tag stopped at 8.1.34"],
  ["7.4-apache", "branch", "7.4", "end-of-life line"],
  ["5.6-apache", "branch", "5.6", "end-of-life line"],
  ["8.6-rc", "branch", "8.6", "the 8.6 RC line: newer than any line the advisories list"],
  ["8", "present", null, "spans release lines"],
  ["8-fpm-alpine", "present", null, "spans release lines"],
  ["fpm", "present", null, "no version at all"],
  ["apache", "present", null, "no version at all"],
  ["latest", "present", null, "no version at all"],
]) add("docker-floating", "php", `php-img-${tag}`, IMG(`php:${tag}`), kind, v, HUB("php", tag), note);
add("docker-floating", "php", "php-img-untagged", IMG("php"), "present", null, LIB("php"), "no tag means latest");

// ── PHP, version files ──────────────────────────────────────────────────
add("version-file", "php", "php-file-php-version-line", FILE(".php-version", "8.3\n"), "branch", "8.3", "https://github.com/phpenv/phpenv", "phpenv-style line pin");
add("version-file", "php", "php-file-php-version-exact", FILE(".php-version", "8.3.12\n"), "exact", "8.3.12", "https://github.com/phpenv/phpenv", "exact pin below the fix");
add("version-file", "php", "php-file-php-version-eol", FILE(".php-version", "8.1\n"), "branch", "8.1", "https://github.com/phpenv/phpenv", "end-of-life line");
add("version-file", "php", "php-file-tool-versions-affected", FILE(".tool-versions", "php 8.2.34\nnodejs 22.23.4\n"), "exact", "8.2.34", "https://asdf-vm.com/manage/configuration.html#tool-versions", "asdf pin below the fix");
add("version-file", "php", "php-file-tool-versions-fixed", FILE(".tool-versions", "php 8.4.27\n"), "exact", "8.4.27", "https://asdf-vm.com/manage/configuration.html#tool-versions", "asdf pin at the fix");

// ── PHP, other strings ──────────────────────────────────────────────────
add("exact-upstream", "php", "php-xampp-windows", SRV("Apache/2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.2.12"), "exact", "8.2.12", XAMPP,
  "XAMPP for Windows 8.2.12's bundle under ServerTokens Full (header shape inferred from the bundle and httpd's banner code); the CGI advisories' Windows condition fits");
add("end-of-life", "php", "php-xpb-eol-8.0-with-hint-free-server", H({ server: "Apache/2.4.62 (Unix)", "x-powered-by": "PHP/8.0.30" }), "exact", "8.0.30", "https://www.php.net/eol.php",
  "a source-built stack: (Unix) names no distribution");

// ── Apache httpd, distribution builds ───────────────────────────────────
// Debian and Ubuntu: ServerTokens OS, PLATFORM from lsb_release. EL: PLATFORM
// is os-release NAME, ServerTokens left at Full.
for (const [banner, v, src, note] of [
  ["Apache/2.4.41 (Ubuntu)", "2.4.41", LP("apache2", "focal"), "Ubuntu 20.04: older than the flaw"],
  ["Apache/2.4.52 (Ubuntu)", "2.4.52", LP("apache2", "jammy"), "Ubuntu 22.04 (2.4.52-1ubuntu4.25)"],
  ["Apache/2.4.58 (Ubuntu)", "2.4.58", LP("apache2", "noble"), "Ubuntu 24.04 (2.4.58-1ubuntu8.17)"],
  ["Apache/2.4.64 (Ubuntu)", "2.4.64", LP("apache2", "questing"), "Ubuntu 25.10"],
  ["Apache/2.4.66 (Ubuntu)", "2.4.66", LP("apache2", "resolute"), "Ubuntu 26.04"],
  ["Apache/2.4.62 (Debian)", "2.4.62", MADISON("apache2"), "Debian 11 point release (2.4.62-1~deb11u1)"],
  ["Apache/2.4.67 (Debian)", "2.4.67", MADISON("apache2"), "Debian 11 LTS security (2.4.67-1~deb11u3)"],
  ["Apache/2.4.68 (Debian)", "2.4.68", DEB_APACHE_RULES, "Debian 12 (2.4.68-1~deb12u1)"],
  ["Apache/2.4.69 (Debian)", "2.4.69", MADISON("apache2"), "Debian 13 security"],
  ["Apache/2.4.37 (Rocky Linux)", "2.4.37", ALMA(8, "AppStream"), "EL8 httpd 2.4.37 with years of backports: older than the flaw"],
  ["Apache/2.4.62 (Rocky Linux) OpenSSL/3.5.8", "2.4.62", EL_HTTPD_SPEC, "EL9 httpd under ServerTokens Full, with mod_ssl"],
  ["Apache/2.4.62 (AlmaLinux)", "2.4.62", ALMA(9, "AppStream"), "EL9 (2.4.62-13.el9_8.6)"],
  ["Apache/2.4.63 (AlmaLinux)", "2.4.63", ALMA(10, "AppStream"), "EL10 (2.4.63-13.el10_2.6)"],
  ["Apache/2.4.62 (CentOS Stream)", "2.4.62", EL_HTTPD_SPEC, "CentOS Stream 9"],
  ["Apache/2.4.62 (Red Hat Enterprise Linux)", "2.4.62", EL_HTTPD_SPEC, "RHEL 9"],
  ["Apache/2.4.6 (CentOS)", "2.4.6", CENTOS7, "CentOS 7: older than the flaw"],
]) add("distro-backport", "apache-httpd", `httpd-${banner.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+$/, "")}`, SRV(banner), "distro", v, src, note);
add("end-of-life", "apache-httpd", "httpd-centos6-2.2.15", SRV("Apache/2.2.15 (CentOS)"), "distro", "2.2.15", CENTOS6,
  "CentOS 6's httpd 2.2.15: end-of-life line, never had the 2.4.49 flaw");
add("prerelease-suffix", "apache-httpd", "httpd-dev-build", SRV("Apache/2.4.70-dev (Unix)"), "exact", "2.4.70", "https://github.com/apache/httpd/blob/2.4.x/include/ap_release.h",
  "a build from the 2.4.x branch (ap_release.h: 2.4.70 with DEVBUILD)", { pre: true });
add("exact-upstream", "apache-httpd", "httpd-xampp-windows", SRV("Apache/2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.2.12"), "exact", "2.4.58", XAMPP,
  "XAMPP's Apache Lounge build: (Win64) names no distribution");

// ── Apache httpd, Docker images ─────────────────────────────────────────
for (const [tag, kind, v, note, extra] of [
  ["2.4.48", "exact", "2.4.48", "the release before the flaw"],
  ["2.4.49", "exact", "2.4.49", "pinned to the vulnerable release (pushed 5 Oct 2021)"],
  ["2.4.50", "exact", "2.4.50", "the incomplete fix"],
  ["2.4.69-alpine", "exact", "2.4.69", "current"],
  ["2.2.34", "exact", "2.2.34", "last 2.2 image"],
]) add(tag.startsWith("2.2") ? "end-of-life" : "docker-pinned", "apache-httpd", `httpd-img-${tag}`, IMG(`httpd:${tag}`), kind, v, HUB("httpd", tag), note, extra);
for (const [tag, kind, v, note, extra] of [
  ["2.4", "branch", "2.4", "floats along 2.4: 2.4.49 cannot be ruled out from the tag"],
  ["2.2", "branch", "2.2", "end-of-life line"],
  ["2", "present", null, "spans release lines"],
  ["alpine", "present", null, "no version"],
  ["latest", "present", null, "no version"],
]) add("docker-floating", "apache-httpd", `httpd-img-${tag}`, IMG(`httpd:${tag}`), kind, v, HUB("httpd", tag), note, extra);

// ── Apache httpd, lookalikes ────────────────────────────────────────────
add("lookalike", "apache-httpd", "httpd-tomcat-coyote", SRV("Apache-Coyote/1.1"), "none", null, "https://github.com/apache/tomcat/blob/7.0.x/java/org/apache/coyote/http11/Constants.java",
  "Tomcat 7's connector banner: Apache Tomcat, not the Apache HTTP Server");
add("lookalike", "apache-httpd", "httpd-litespeed", SRV("LiteSpeed"), "none", null, "https://github.com/litespeedtech/openlitespeed/blob/master/src/http/httpserverversion.cpp",
  "OpenLiteSpeed's default banner");
add("lookalike", "apache-httpd", "httpd-iis", H({ server: "Microsoft-IIS/10.0", "x-powered-by": "ASP.NET" }), "none", null, "https://learn.microsoft.com/en-us/iis/configuration/system.webserver/security/requestfiltering/",
  "IIS with ASP.NET");

// ── PHP, lookalikes ─────────────────────────────────────────────────────
add("lookalike", "php", "php-hhvm", XPB("HHVM/4.172.1"), "none", null, "https://github.com/facebook/hhvm/blob/master/hphp/runtime/server/transport.cpp",
  "HHVM runs Hack/PHP code but is not php-src: PHP advisories do not apply");
add("lookalike", "php", "php-phpmyadmin-image", IMG("phpmyadmin:5.2"), "none", null, HUB("phpmyadmin", "5.2"),
  "the phpMyAdmin image: a PHP application, its tag is phpMyAdmin's version");
add("lookalike", "php", "php-aspnet", XPB("ASP.NET"), "none", null, "https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httpprotocol/customheaders/",
  "IIS's default X-Powered-By");

// ── nginx ───────────────────────────────────────────────────────────────
// server_tokens on (default) "nginx/1.31.8", off "nginx", build "nginx/1.31.8 (<build>)".
for (const [v, note] of [
  ["1.31.8", "current mainline (21 Oct 2026)"],
  ["1.30.6", "current stable"],
  ["1.30.0", "first 1.30 stable (14 Apr 2026)"],
]) add("exact-upstream", "nginx", `nginx-server-${v}`, SRV(`nginx/${v}`), "exact", v, NGINX_DL, note);
add("exact-upstream", "nginx", "nginx-server-tokens-build", SRV("nginx/1.31.8 (penthera-test)"), "exact", "1.31.8", NGINX_TOKENS,
  "server_tokens build appends the build name in parentheses; it is not a distribution");
for (const [v, note] of [
  ["1.28.3", "legacy on download.html: 1.28 stopped getting fixes when 1.30 came out"],
  ["1.27.3", "an old mainline"],
  ["1.25.3", "an old mainline"],
]) add("end-of-life", "nginx", `nginx-server-eol-${v}`, SRV(`nginx/${v}`), "exact", v, NGINX_CHANGES, note);
add("hidden-partial", "nginx", "nginx-server-tokens-off", SRV("nginx"), "present", null, NGINX_TOKENS, "server_tokens off");
for (const [v, series, note] of [
  ["1.18.0", "jammy", "Ubuntu 22.04 (1.18.0-6ubuntu14.21) and 20.04"],
  ["1.24.0", "noble", "Ubuntu 24.04 (1.24.0-2ubuntu7.18)"],
  ["1.28.0", "questing", "Ubuntu 25.10"],
  ["1.28.3", "resolute", "Ubuntu 26.04 (server_tokens build with --build=Ubuntu)"],
]) add("distro-backport", "nginx", `nginx-ubuntu-${series}`, SRV(`nginx/${v} (Ubuntu)`), "distro", v, series === "noble" ? UBU_NGINX_BRAND : LP("nginx", series), note);
for (const [v, src, note] of [
  ["1.22.1", DEB_NGINX_SERIES, "Debian 12 (1.22.1-9+deb12u10): Debian adds no branding"],
  ["1.26.3", MADISON("nginx"), "Debian 13 (1.26.3-3+deb13u10)"],
  ["1.20.1", ALMA(9, "AppStream"), "EL9's default nginx"],
  ["1.14.1", ALMA(8, "AppStream"), "EL8's nginx:1.14 stream"],
]) add("distro-unmarked", "nginx", `nginx-unmarked-${v}`, SRV(`nginx/${v}`), "distro", v, src, `${note}; the string equals upstream ${v}`, { deviation: "L1" });
for (const [tag, kind, v, note] of [
  ["1.31.8", "exact", "1.31.8", "current mainline"],
  ["1.30.6-alpine", "exact", "1.30.6", "current stable"],
  ["1.28.3", "exact", "1.28.3", "legacy"],
  ["1.27.3", "exact", "1.27.3", "old mainline (pushed Feb 2025)"],
  ["1.24.0", "exact", "1.24.0", "old stable"],
]) add("docker-pinned", "nginx", `nginx-img-${tag}`, IMG(`nginx:${tag}`), kind, v, HUB("nginx", tag), note);
for (const [tag, kind, v, note] of [
  ["1.30", "branch", "1.30", "floating stable line"],
  ["1.18", "branch", "1.18", "end-of-life line"],
  ["stable", "present", null, "no version"],
  ["mainline", "present", null, "no version"],
  ["alpine", "present", null, "no version"],
  ["latest", "present", null, "no version"],
]) add("docker-floating", "nginx", `nginx-img-${tag}`, IMG(`nginx:${tag}`), kind, v, HUB("nginx", tag), note);
add("docker-floating", "nginx", "nginx-img-unprivileged", IMG("nginxinc/nginx-unprivileged:1.27"), "branch", "1.27", HUB("nginxinc/nginx-unprivileged", "1.27"),
  "NGINX's own unprivileged image, not library/nginx: the tag is the nginx line", { deviation: "G1" });
for (const [banner, src, note] of [
  ["openresty/1.31.1.1", "https://github.com/openresty/openresty/tags", "OpenResty rebrands nginx's version string"],
  ["openresty", "https://github.com/openresty/openresty", "OpenResty with server_tokens off"],
  ["Tengine/3.2.0", "https://github.com/alibaba/tengine/blob/master/src/http/ngx_http_header_filter_module.c", "Tengine, an nginx fork"],
  ["Angie/1.13.0", "https://github.com/webserver-llc/angie/blob/master/src/http/ngx_http_header_filter_module.c", "Angie, an nginx fork"],
  ["cloudflare", "https://developers.cloudflare.com/fundamentals/reference/http-headers/", "Cloudflare's edge, often in front of nginx"],
]) add("lookalike", "nginx", `nginx-lookalike-${banner.split("/")[0].toLowerCase()}${banner.includes("/") ? "-versioned" : ""}`, SRV(banner), "none", null, src, note);

// ── OpenSSL (seen in httpd's Server header via mod_ssl, ServerTokens Full) ─
for (const [banner, kind, v, src, note, extra] of [
  ["Apache/2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.2.12", "exact", "3.1.3", XAMPP, "XAMPP's OpenSSL 3.1.3: 3.1 is end of life"],
  ["Apache/2.4.69 (Unix) OpenSSL/3.5.9", "exact", "3.5.9", OPENSSL_SRC, "3.5 LTS, current"],
  ["Apache/2.4.69 (Unix) OpenSSL/3.4.8", "exact", "3.4.8", OPENSSL_SRC, "3.4 reaches end of life on 22 Oct 2026, a day after the pack's date, so the pack does not call it end of life yet"],
  ["Apache/2.4.69 (Unix) OpenSSL/3.6.5", "exact", "3.6.5", OPENSSL_SRC, "3.6, supported until 1 Nov 2026"],
  ["Apache/2.4.69 (Unix) OpenSSL/4.0.3", "exact", "4.0.3", OPENSSL_SRC, "4.0"],
  ["Apache/2.4.62 (Unix) OpenSSL/3.0.19", "exact", "3.0.19", OPENSSL_SRC, "3.0 LTS ended 7 Sep 2026"],
  ["Apache/2.4.57 (Unix) OpenSSL/1.1.1w", "exact", "1.1.1w", OPENSSL_111, "1.1.1w, the last public 1.1.1 release"],
  ["Apache/2.4.62 (Unix) OpenSSL/1.1.1zj", "exact", "1.1.1zj", OPENSSL_111, "premium-support 1.1.1zj: still past public end of life"],
  ["Apache/2.4.41 (Unix) OpenSSL/1.0.2u", "exact", "1.0.2u", OPENSSL_SRC, "last public 1.0.2"],
  ["Apache/2.4.69 (Unix) OpenSSL/4.1.0-beta2", "exact", "4.1.0", OPENSSL_SRC, "a 4.1 beta (9 Oct 2026)", { pre: true }],
  ["Apache/2.4.6 (CentOS) OpenSSL/1.0.2k-fips", "distro", "1.0.2k", OPENSSL_102, "CentOS/RHEL 7: -fips comes from the FIPS build"],
  ["Apache/2.4.6 (Red Hat Enterprise Linux) OpenSSL/1.0.2k-fips", "distro", "1.0.2k", CENTOS7, "RHEL 7"],
  ["Apache/2.4.37 (Rocky Linux) OpenSSL/1.1.1k", "distro", "1.1.1k", ALMA(8, "BaseOS"), "EL8's openssl 1.1.1k-18: RHEL's version text drops -fips at mod_ssl's cut"],
  ["Apache/2.4.62 (Red Hat Enterprise Linux) OpenSSL/3.2.2", "distro", "3.2.2", EL_HTTPD_SPEC, "RHEL 9.5's openssl 3.2.2 (3.2 is end of life upstream)"],
  ["Apache/2.4.62 (Rocky Linux) OpenSSL/3.5.8", "distro", "3.5.8", ALMA(9, "BaseOS"), "EL9.8's openssl 3.5.8"],
  ["Apache/2.4.52 (Ubuntu) OpenSSL/3.0.2", "distro", "3.0.2", LP("openssl", "jammy"), "Ubuntu 22.04 (3.0.2-0ubuntu1.30) with ServerTokens Full"],
  ["Apache/2.4.68 (Debian) OpenSSL/3.0.22", "distro", "3.0.22", MADISON("openssl"), "Debian 12 (3.0.22-1~deb12u1) with ServerTokens Full"],
  ["Apache/2.4.41 (Ubuntu) OpenSSL/1.1.1f", "distro", "1.1.1f", LP("openssl", "focal"), "Ubuntu 20.04 (1.1.1f-1ubuntu2.24)"],
]) add(kind === "distro" ? "distro-backport" : extra?.pre ? "prerelease-suffix" : /1\.1\.1|1\.0\.2|3\.0\.19|3\.1\.3/.test(v) ? "end-of-life" : "exact-upstream",
  "openssl", `openssl-${v}${kind === "distro" ? `-${banner.match(/\(([^)]+)\)/)[1].toLowerCase().replace(/\s+/g, "-")}` : ""}`, SRV(banner), kind, v, src, note, extra);
add("lookalike", "openssl", "openssl-libressl-style", SRV("Apache/2.4.69 (Unix) LibreSSL/3.9.2"), "none", null, "https://www.libressl.org/releases.html",
  "LibreSSL is an OpenSSL fork with its own versions; OpenSSL's end-of-life dates do not apply");
add("hidden-partial", "openssl", "openssl-hidden-by-tokens-os", SRV("Apache/2.4.62 (Debian)"), "none", null, MOD_SSL,
  "mod_ssl's OpenSSL token only appears under ServerTokens Full: no OpenSSL evidence at all");

// ── Python ──────────────────────────────────────────────────────────────
// http.server: server_version + " Python/" + sys.version.split()[0]; Werkzeug
// sets server_version to "Werkzeug/x.y.z"; aiohttp sends "Python/x.y aiohttp/z".
for (const [banner, kind, v, src, note, extra] of [
  ["SimpleHTTP/0.6 Python/3.12.15", "exact", "3.12.15", CPY_SERVER, "python -m http.server"],
  ["SimpleHTTP/0.6 Python/3.15.1", "exact", "3.15.1", CPY_SERVER, "current 3.15"],
  ["Werkzeug/3.1.3 Python/3.13.17", "exact", "3.13.17", WERKZEUG, "Flask's dev server"],
  ["Werkzeug/3.1.3 Python/3.10.22", "exact", "3.10.22", WERKZEUG, "3.10 ended 1 Oct 2026, with 3.10.22 its last release"],
  ["BaseHTTP/0.6 Python/3.9.25", "exact", "3.9.25", CPY_SERVER, "last 3.9 release"],
  ["Werkzeug/2.0.3 Python/3.8.20", "exact", "3.8.20", WERKZEUG, "last 3.8 release"],
  ["Werkzeug/3.1.3 Python/3.15.0rc1", "exact", "3.15.0", "https://www.python.org/downloads/release/python-3150rc1/", "a 3.15 release candidate: Python spells rc in lowercase with no separator", { pre: true }],
  ["Python/3.11 aiohttp/3.9.5", "branch", "3.11", AIOHTTP, "aiohttp prints only major.minor"],
  ["Python/3.9 aiohttp/3.8.6", "branch", "3.9", AIOHTTP, "an end-of-life line behind aiohttp"],
  ["Werkzeug/3.0.1 Python/3.12.3", "distro", "3.12.3", LP("python3.12", "noble"), "Ubuntu 24.04's python3.12 (3.12.3-1ubuntu0.17): sys.version carries no package revision", { deviation: "L1" }],
  ["Werkzeug/2.0.2 Python/3.10.12", "distro", "3.10.12", LP("python3.10", "jammy"), "Ubuntu 22.04's python3.10, supported by Ubuntu past upstream end of life", { deviation: "L1" }],
  ["Werkzeug/2.0.3 Python/3.6.8", "distro", "3.6.8", ALMA(8, "BaseOS"), "EL8's platform python 3.6.8", { deviation: "L1" }],
  ["Werkzeug/3.0.1 Python/3.9.2", "distro", "3.9.2", MADISON("python3.9"), "Debian 11's python3.9 (3.9.2-1+deb11u7)", { deviation: "L1" }],
]) add(extra?.deviation === "L1" ? "distro-unmarked" : kind === "branch" ? "hidden-partial" : extra?.pre ? "prerelease-suffix" : /^3\.(8|9|10)\b/.test(v) ? "end-of-life" : "exact-upstream",
  "python", `python-server-${banner.split(" ")[0].split("/")[0].toLowerCase()}-${v}`, SRV(banner), kind, v, src, note, extra);
for (const [banner, src, note] of [
  ["gunicorn", "https://github.com/benoitc/gunicorn/blob/master/gunicorn/http/wsgi.py", "gunicorn names itself, not the interpreter"],
  ["uvicorn", "https://github.com/encode/uvicorn/blob/master/uvicorn/protocols/http/h11_impl.py", "uvicorn names itself, not the interpreter"],
]) add("hidden-partial", "python", `python-server-${banner}`, SRV(banner), "none", null, src, note);
for (const [tag, kind, v, note, extra] of [
  ["3.12.15-slim-bookworm", "exact", "3.12.15", "official images build CPython from source: -slim-bookworm is the base, not a distribution Python"],
  ["3.10.22", "exact", "3.10.22", "last 3.10 image"],
  ["3.9.25", "exact", "3.9.25", "last 3.9 image"],
  ["3.8.20", "exact", "3.8.20", "last 3.8 image"],
  ["3.15.0rc1", "exact", "3.15.0", "a release-candidate image", { pre: true }],
]) add(extra?.pre ? "prerelease-suffix" : "docker-pinned", "python", `python-img-${tag}`, IMG(`python:${tag}`), kind, v, HUB("python", tag), note, extra);
for (const [tag, kind, v, note] of [
  ["3.13", "branch", "3.13", "floating line"],
  ["3.10-slim", "branch", "3.10", "end-of-life line"],
  ["3.9", "branch", "3.9", "end-of-life line"],
  ["2.7", "branch", "2.7", "end-of-life line"],
  ["3.16-rc-slim", "branch", "3.16", "the 3.16 pre-release line"],
  ["3", "present", null, "spans release lines"],
  ["latest", "present", null, "no version"],
]) add("docker-floating", "python", `python-img-${tag}`, IMG(`python:${tag}`), kind, v, HUB("python", tag), note);
add("lookalike", "python", "python-img-pypy", IMG("pypy:3.10"), "none", null, HUB("pypy", "3.10"),
  "PyPy implements the Python 3.10 language; CPython's release lines do not apply");
const PYENV = "https://github.com/pyenv/pyenv#understanding-python-version-selection";
for (const [file, content, kind, v, src, note] of [
  [".python-version", "3.12.15\n", "exact", "3.12.15", PYENV, "pyenv exact pin"],
  [".python-version", "3.10\n", "branch", "3.10", PYENV, "pyenv line pin on an end-of-life line"],
  [".python-version", "3.9.25\n", "exact", "3.9.25", PYENV, "exact pin on an end-of-life line"],
  [".python-version", "system\n", "present", null, PYENV, "pyenv's system Python: version unknown"],
  ["runtime.txt", "python-3.12.15\n", "exact", "3.12.15", "https://devcenter.heroku.com/articles/python-runtimes", "Heroku-style runtime.txt"],
  ["runtime.txt", "python-3.8.20\n", "exact", "3.8.20", "https://devcenter.heroku.com/articles/python-runtimes", "end-of-life runtime.txt"],
  [".tool-versions", "python 3.11.17\n", "exact", "3.11.17", "https://asdf-vm.com/manage/configuration.html#tool-versions", "asdf pin"],
]) add("version-file", "python", `python-file-${file.replace(/^\./, "")}-${content.trim().replace(/\s+/g, "-")}`, FILE(file, content), kind, v, src, note);
add("lookalike", "python", "python-file-pypy", FILE(".python-version", "pypy3.10-7.3.17\n"), "present", null, PYENV,
  "a pyenv PyPy name: a Python is in use but not a CPython version, so no CPython release line is read from it");

// ── Node.js (no version banner: Express and Next.js send no version) ────
add("lookalike", "nodejs", "node-xpb-express", XPB("Express"), "none", null, "https://github.com/expressjs/express/blob/master/lib/application.js", "Express's X-Powered-By has no Node.js version");
add("lookalike", "nodejs", "node-xpb-nextjs", XPB("Next.js"), "none", null, "https://github.com/vercel/next.js/blob/canary/packages/next/src/server/send-payload.ts", "Next.js's X-Powered-By has no Node.js version");
add("lookalike", "nodejs", "node-img-node-red", IMG("nodered/node-red:4.0"), "none", null, "https://hub.docker.com/r/nodered/node-red", "Node-RED's tag is Node-RED's version");
for (const [tag, kind, v, note] of [
  ["20.11.1", "exact", "20.11.1", "pinned 20 (end of life 30 Apr 2026)"],
  ["18.20.8", "exact", "18.20.8", "last 18 release"],
  ["22.23.4-slim", "exact", "22.23.4", "current 22 LTS"],
  ["24.22.1-alpine", "exact", "24.22.1", "current 24 LTS"],
  ["26.12.1", "exact", "26.12.1", "current"],
  ["25.9.0", "exact", "25.9.0", "last 25 (odd lines end after six months)"],
]) add("docker-pinned", "nodejs", `node-img-${tag}`, IMG(`node:${tag}`), kind, v, HUB("node", tag), note);
for (const [tag, kind, v, note, extra] of [
  ["20", "branch", "20", "end-of-life line, still on Docker Hub"],
  ["20-alpine", "branch", "20", "end-of-life line"],
  ["18", "branch", "18", "end-of-life line"],
  ["16-alpine", "branch", "16", "end-of-life line"],
  ["14", "branch", "14", "end-of-life line"],
  ["24", "branch", "24", "supported LTS line"],
  ["lts", "present", null, "floats across lines"],
  ["current", "present", null, "floats across lines"],
  ["lts-alpine", "present", null, "floats across lines"],
  ["iron", "branch", "20", "the codename tag for 20, an end-of-life line", { deviation: "B4" }],
  ["hydrogen", "branch", "18", "the codename tag for 18", { deviation: "B4" }],
  ["jod", "branch", "22", "the codename tag for 22", { deviation: "B4" }],
]) add("docker-floating", "nodejs", `node-img-${tag}`, IMG(`node:${tag}`), kind, v, HUB("node", tag), note, extra);
for (const [file, content, kind, v, note, extra] of [
  [".nvmrc", "20\n", "branch", "20", "line pin on an end-of-life line"],
  [".nvmrc", "v20.11.1\n", "exact", "20.11.1", "nvm accepts a leading v"],
  [".nvmrc", "24\n", "branch", "24", "supported line"],
  [".nvmrc", "node\n", "present", null, "nvm's alias for the newest release"],
  [".nvmrc", "lts/*\n", "present", null, "the newest LTS, whichever line that is"],
  [".nvmrc", "lts/iron\n", "branch", "20", "nvm's LTS codename alias for 20", { deviation: "B4" }],
  [".nvmrc", "lts/hydrogen\n", "branch", "18", "nvm's LTS codename alias for 18", { deviation: "B4" }],
  [".node-version", "22.23.4\n", "exact", "22.23.4", "nodenv / fnm pin"],
  [".tool-versions", "nodejs 18.20.4\n", "exact", "18.20.4", "asdf pin on an end-of-life line"],
  [".tool-versions", "node 16.20.2\n", "exact", "16.20.2", "mise accepts `node`"],
]) add("version-file", "nodejs", `node-file-${file.replace(/^\./, "")}-${content.trim().replace(/[^a-z0-9.]+/gi, "-")}`, FILE(file, content), kind, v, file === ".nvmrc" ? NVM : NODE_DIST, note, extra);
