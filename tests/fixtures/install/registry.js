#!/usr/bin/env node
/**
 * A tiny npm registry for `penthera install` tests and demos.
 *
 * Serves packuments and tarballs for a fixed set of packages from 127.0.0.1,
 * so real npm can resolve and install against it and no test touches the
 * public registry. Packages are built with tests/fixtures/deps/build.js.
 *
 * `color-helper@1.1.0` gains a postinstall script that writes a marker file to
 * an absolute path: if the marker exists, the script ran.
 *
 *   node tests/fixtures/install/registry.js /tmp/install-demo
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { packageFiles, tarball, sri } from "../deps/build.js";

const j = (...p) => p.join("");
const HTTPS = j("ht", "tps");

/** Package specs (same shape as build.js). `marker` is where the postinstall writes. */
export function installPackages(marker) {
  return {
    "tiny-format@1.0.0": { "index.js": "module.exports = (s) => String(s).trim();\n" },
    "tiny-format@1.0.1": { "index.js": "module.exports = (s) => String(s ?? '').trim();\n" },
    "color-helper@1.0.0": { "index.js": "module.exports = (c) => `#${c}`;\n" },
    "color-helper@1.1.0": {
      "index.js": "module.exports = (c) => `#${c}`;\n",
      "postinstall.js": `require('fs').writeFileSync(${JSON.stringify(marker)}, 'postinstall ran\\n');\n`,
      _scripts: { postinstall: "node postinstall.js" },
    },
    "pad-utils@2.0.0": { "index.js": "module.exports = (s, n) => String(s).padStart(n);\n" },
    // A clean upgrade that also pulls in a new, harmless transitive dependency.
    "tiny-format@1.1.0": { "index.js": "module.exports = require('pad-utils');\n", _deps: { "pad-utils": "^2.0.0" } },
    "expresss@1.0.0": { "index.js": "module.exports = function app() { return {}; };\n" },
    "net-report@1.0.0": {
      "index.js": `const https = require('${HTTPS}');\nmodule.exports = (u) => https.get(u);\n`,
    },
  };
}

const INSTALL_HOOKS = ["preinstall", "install", "postinstall"];

/** Build packuments and tarballs for every package spec. */
function buildRegistry(packages, baseUrl) {
  const docs = new Map();
  const tarballs = new Map();
  for (const key of Object.keys(packages).sort()) {
    const { name, version, files } = packageFiles(key, packages);
    const tgz = tarball(files);
    const manifest = JSON.parse(files["package.json"]);
    const file = `${name}-${version}.tgz`;
    tarballs.set(`/${name}/-/${file}`, tgz);
    const doc = docs.get(name) || { name, "dist-tags": {}, versions: {}, time: { created: "2026-01-01T00:00:00.000Z" } };
    doc.versions[version] = {
      ...manifest,
      ...(Object.keys(manifest.scripts || {}).some((h) => INSTALL_HOOKS.includes(h)) ? { hasInstallScript: true } : {}),
      dist: {
        tarball: `${baseUrl}/${name}/-/${file}`,
        integrity: sri(tgz),
        shasum: createHash("sha1").update(tgz).digest("hex"),
      },
    };
    doc.time[version] = "2026-01-01T00:00:00.000Z";
    docs.set(name, doc);
  }
  for (const doc of docs.values()) {
    const latest = Object.keys(doc.versions).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
    doc["dist-tags"].latest = latest;
  }
  return { docs, tarballs };
}

/**
 * Start the registry on 127.0.0.1 (random port).
 * @returns {Promise<{ url: string, requests: string[], close: () => Promise<void> }>}
 */
export async function startRegistry(packages) {
  const requests = [];
  let reg = null;
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    requests.push(`${req.method} ${path}`);
    const tgz = reg.tarballs.get(path);
    if (tgz) {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": tgz.length });
      return res.end(tgz);
    }
    const doc = reg.docs.get(path.slice(1));
    if (doc) {
      const body = JSON.stringify(doc);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(body);
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end('{"error":"not found"}');
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  reg = buildRegistry(packages, url);
  return { url, requests, close: () => new Promise((r) => server.close(() => r())) };
}

/**
 * npm environment pointing at the fixture registry, with a private cache and
 * config. Proxies point at a closed port with only 127.0.0.1 exempt, so any
 * request to another host fails instead of reaching the internet.
 */
export function npmEnv(registryUrl, dir) {
  mkdirSync(dir, { recursive: true });
  const userconfig = join(dir, "npmrc");
  writeFileSync(userconfig, "");
  return {
    ...process.env,
    npm_config_registry: `${registryUrl}/`,
    npm_config_cache: join(dir, "npm-cache"),
    npm_config_userconfig: userconfig,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_loglevel: "error",
    npm_config_proxy: "http://127.0.0.1:9/",
    npm_config_https_proxy: "http://127.0.0.1:9/",
    npm_config_noproxy: "127.0.0.1",
  };
}

/**
 * A project with the given dependencies, installed (scripts off) from the
 * fixture registry. Async: the registry runs in this process, so a blocking
 * child would deadlock it.
 */
export async function createProject(dir, deps, env) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture-app", version: "1.0.0", private: true, dependencies: deps }, null, 2) + "\n");
  await promisify(execFile)("npm", ["install", "--ignore-scripts"], { cwd: dir, env });
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node tests/fixtures/install/registry.js <output-dir>");
    process.exit(2);
  }
  const marker = join(out, "POSTINSTALL_RAN");
  const reg = await startRegistry(installPackages(marker));
  console.log(`Fixture registry on ${reg.url}  (Ctrl-C to stop)`);
  console.log(`Marker file: ${marker}`);
  console.log(`  export npm_config_registry=${reg.url}/ npm_config_cache=${join(out, "npm-cache")}`);
}
