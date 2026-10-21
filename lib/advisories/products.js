/**
 * The runtimes and servers runtime advisories can name, and how to recognize
 * each one. Detection is code; which versions are affected is data, in signed
 * rule packs (kind `runtime-advisory`, see lib/rules/pack.js).
 */

// Release line ("branch") of a version: the unit a vendor patches and ends
// support for. Null when the version is too coarse to name one.
const minorLine = (v) => (v.minor === null ? null : `${v.major}.${v.minor}`);

export const PRODUCTS = Object.freeze({
  php: {
    branchOf: minorLine,
    name: "PHP",
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
    checkCommand: "python3 --version",
    // Werkzeug and http.server print "Python/3.12.1" in Server
    banner: /\bPython\/(\d+\.\d+\.\d+[^\s,;()]*)/,
    present: null,
    dockerImages: ["python"],
    toolVersions: ["python"],
    versionFiles: [".python-version"],
  },
  openssl: {
    branchOf: (v) => (v.major >= 3 ? minorLine(v) : v.patch === null ? null : `${v.major}.${v.minor}.${v.patch}`),
    name: "OpenSSL",
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
