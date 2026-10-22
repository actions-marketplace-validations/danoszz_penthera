/**
 * The runtimes and servers runtime advisories can name, and how to recognize
 * each one. `backports`: distributions commonly ship it with security fixes
 * backported under the upstream number, so a banner with no distribution
 * token may still be a patched package (Debian 11-13, Ubuntu 24.04+ and RHEL
 * print plain PHP versions; Debian's and RHEL's nginx add no OS token). Detection is code; which versions are affected is data, in signed
 * rule packs (kind `runtime-advisory`, see lib/rules/pack.js).
 */

// Release line ("branch") of a version: the unit a vendor patches and ends
// support for. Null when the version is too coarse to name one.
const minorLine = (v) => (v.minor === null ? null : `${v.major}.${v.minor}`);

export const PRODUCTS = Object.freeze({
  php: {
    branchOf: minorLine,
    name: "PHP",
    backports: true,
    // On the server itself, the version and any distro build string.
    checkCommand: "php -v",
    banner: /\bPHP\/(\d+\.\d+(?:\.\d+)?[^\s,;()]*)/i,
    // X-Powered-By: PHP, with the version stripped
    present: /\bPHP\b/i,
    dockerImages: ["php"],
    toolVersions: ["php"],
    versionFiles: [".php-version"],
  },
  "apache-httpd": {
    branchOf: minorLine,
    name: "Apache HTTP Server",
    backports: true,
    checkCommand: "httpd -v (or apache2 -v)",
    banner: /\bApache\/(\d+\.\d+\.\d+[^\s,;()]*)/,
    // not Apache-Coyote (Tomcat) or Apache-HttpClient
    present: /^Apache(?![-\w])/,
    dockerImages: ["httpd"],
    toolVersions: [],
    versionFiles: [],
  },
  nginx: {
    branchOf: minorLine,
    name: "nginx",
    backports: true,
    checkCommand: "nginx -v",
    banner: /\bnginx\/(\d+\.\d+\.\d+[^\s,;()]*)/i,
    present: /^nginx\b/i,
    dockerImages: ["nginx"],
    toolVersions: [],
    versionFiles: [],
  },
  nodejs: {
    branchOf: (v) => String(v.major),
    name: "Node.js",
    // Node.js has no version banner, and official images and binaries are upstream.
    backports: false,
    checkCommand: "node -v",
    banner: null,
    present: null,
    dockerImages: ["node"],
    toolVersions: ["nodejs", "node"],
    versionFiles: [".nvmrc", ".node-version"],
  },
  python: {
    branchOf: minorLine,
    name: "Python",
    backports: true,
    checkCommand: "python3 --version",
    // Werkzeug and http.server print "Python/3.12.1" in Server; aiohttp only
    // "Python/3.12 aiohttp/3.9.5", which still names the release line
    banner: /\bPython\/(\d+\.\d+(?:\.\d+)?[^\s,;()]*)/,
    present: null,
    dockerImages: ["python"],
    toolVersions: ["python"],
    versionFiles: [".python-version"],
  },
  openssl: {
    branchOf: (v) => (v.major >= 3 ? minorLine(v) : v.patch === null ? null : `${v.major}.${v.minor}.${v.patch}`),
    name: "OpenSSL",
    backports: true,
    checkCommand: "openssl version",
    banner: /\bOpenSSL\/(\d+\.\d+\.\d+[a-z]{0,2}[^\s,;()]*)/,
    present: null,
    dockerImages: [],
    toolVersions: [],
    versionFiles: [],
  },
});

export const PRODUCT_IDS = Object.freeze(Object.keys(PRODUCTS));

// A Server banner that names a distribution: its packages carry backported
// fixes under the upstream version number (Red Hat even prints no suffix), so
// every version on that response is treated as a distro build.
export const DISTRO_HINT = /\b(Debian|Ubuntu|Raspbian|CentOS|Red Hat|RHEL|AlmaLinux|Rocky|Oracle Linux|Amazon Linux|Fedora|SUSE|openSUSE|Alpine)\b/i;
