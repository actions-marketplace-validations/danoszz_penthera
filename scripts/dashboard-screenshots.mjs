#!/usr/bin/env node
/**
 * Regenerate the dashboard screenshots in assets/dashboard/ from the demo
 * data. Starts `penthera ui --demo` (and an empty instance for the first-run
 * screen), drives headless Chrome over the DevTools protocol, and writes
 * 800x500 desktop and 390x844 phone JPEGs.
 *
 *   node scripts/dashboard-screenshots.mjs
 *   CHROME=/path/to/chrome node scripts/dashboard-screenshots.mjs
 *
 * Needs Node 22+ (global WebSocket) and a local Chrome or Chromium. Nothing
 * here touches the network: both servers bind 127.0.0.1.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "assets", "dashboard");
const CHROME = process.env.CHROME || {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
}[process.platform];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Start a process and resolve with the first stdout/stderr match of `re`. */
function launch(cmd, args, re) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    let buf = "";
    const on = (d) => {
      buf += strip(String(d));
      const m = buf.match(re);
      if (m) resolve({ child, match: m });
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("exit", (code) => reject(new Error(`${cmd} exited (${code}) before it was ready:\n${buf}`)));
  });
}

/** A minimal CDP client over one page session. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else for (const fn of listeners) fn(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  const loaded = () => new Promise((r) => {
    const fn = (msg) => { if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") { listeners.delete(fn); r(); } };
    listeners.add(fn);
  });
  return {
    async go(url) { const l = loaded(); await page("Page.navigate", { url }); await l; await sleep(700); await this.pin(); },
    async reload() { const l = loaded(); await page("Page.reload"); await l; await sleep(900); await this.pin(); },
    async js(expr) {
      const r = await page("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async size(width, height, mobile = false) {
      await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    },
    async scheme(value) {
      this.theme = value;
      await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
    },
    /** Pin the theme on the page as theme.js would, so a stale preference never leaks into a shot. */
    async pin() {
      await this.call((theme) => globalThis.document.documentElement.setAttribute("data-theme", theme), this.theme === "light" ? "light" : "dark");
      await sleep(150);
    },
    /** Run a function in the page with values passed as arguments, never pasted into source. */
    async call(fn, ...args) {
      const { result: global } = await page("Runtime.evaluate", { expression: "globalThis" });
      const r = await page("Runtime.callFunctionOn", {
        functionDeclaration: fn.toString(), objectId: global.objectId,
        arguments: args.map((value) => ({ value })), awaitPromise: true, returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    /** Replace the dashboard's saved preferences in this browser. */
    async prefs(values) {
      await this.call((o) => { const ls = globalThis.localStorage; ls.clear(); for (const [k, v] of Object.entries(o)) ls.setItem(k, v); }, values);
    },
    async shot(file, { scale = 1, width, height } = {}) {
      const clip = { x: 0, y: 0, width, height, scale };
      const { data } = await page("Page.captureScreenshot", { format: "jpeg", quality: 82, clip });
      writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
      process.stdout.write(`  wrote assets/dashboard/${file}\n`);
    },
    close: () => ws.close(),
  };
}

// Page helpers, run inside the dashboard.
const H = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
  const menu = async (label) => {
    document.querySelector(".menu-title.logo").click(); await sleep(80);
    [...document.querySelectorAll(".menu:not([hidden]) .menu-item")].find((b) => b.textContent.includes(label)).click(); await sleep(250);
  };
  const project = async (name) => { [...document.querySelectorAll(".item")].find((b) => b.textContent.includes(name)).click(); await sleep(400); };
`;

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "penthera-shots-"));
  const empty = join(scratch, "code", "my-app");
  mkdirSync(empty, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "penthera-chrome-"));
  const procs = [];
  try {
    const demo = await launch(process.execPath, ["bin/penthera.js", "ui", "--demo", "--port", "0"], /(http:\/\/127\.0\.0\.1:\d+\/#t=\S+)/);
    procs.push(demo.child);
    const blank = await launch(process.execPath, ["bin/penthera.js", "ui", "--project", empty, "--port", "0"], /(http:\/\/127\.0\.0\.1:\d+\/#t=\S+)/);
    procs.push(blank.child);
    const chrome = await launch(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], /DevTools listening on (ws:\/\/\S+)/);
    procs.push(chrome.child);
    const b = await connect(chrome.match[1]);
    const desktop = { width: 1280, height: 800, scale: 0.625 };
    const phone = { width: 390, height: 844 };

    // Sign in once: the token is swapped for a session cookie.
    await b.size(desktop.width, desktop.height);
    await b.go(demo.match[1]);
    const base = demo.match[1].replace(/\/#t=.*/, "/");

    // ui-dark: Simple mode, all projects, the first problem open.
    await b.scheme("dark");
    await b.prefs({ "penthera-ui-mode": "simple", "penthera-ui-theme": "dark", "penthera-ui-panels": '{"left":true,"right":true}' });
    await b.reload();
    await b.js(`${H} document.querySelector(".verdict .btn.primary").click(); await sleep(600);`);
    await b.shot("ui-dark.jpg", desktop);

    // ui-light: Advanced mode, one project, a triage cell picked, a finding open.
    await b.scheme("light");
    await b.prefs({ "penthera-ui-mode": "advanced", "penthera-ui-theme": "light", "penthera-ui-panels": '{"left":true,"right":true}' });
    await b.reload();
    await b.js(`${H} await project("staging.acme.test"); document.querySelector(".matrix .cell.fill-medium").click(); await sleep(200); document.querySelector("#findings-list .row").click(); await sleep(600);`);
    await b.shot("ui-light.jpg", desktop);

    // ui-setup: the first-visit setup, on the mode screen.
    await b.scheme("dark");
    await b.prefs({ "penthera-ui-theme": "dark", "penthera-ui-panels": '{"left":true,"right":true}' });
    await b.reload();
    await b.js(`${H} document.querySelector("dialog[open] .btn.primary").click(); await sleep(300);`);
    await b.shot("ui-setup.jpg", desktop);

    // ui-run: Simple mode, a fix waiting in its window.
    await b.prefs({ "penthera-ui-mode": "simple", "penthera-ui-theme": "dark", "penthera-ui-panels": '{"left":true,"right":true}' });
    await b.reload();
    await b.js(`${H} await project("code/acme-shop"); key("n"); await sleep(200);
      document.querySelector("input[name=kind][value=loop]").click(); document.querySelector("dialog[open] .btn.primary").click();
      for (let i = 0; i < 40 && !document.querySelector("dialog[open] .approval"); i++) await sleep(500);
      await sleep(400);`);
    await b.shot("ui-run.jpg", desktop);
    await b.js(`${H} document.querySelector("dialog[open]")?.dispatchEvent(new KeyboardEvent("keydown", { key: "q", bubbles: true })); await sleep(1500);`);

    // narrow-dark and narrow-light: the phone layout, then a problem in its drawer.
    await b.size(phone.width, phone.height, true);
    await b.prefs({ "penthera-ui-mode": "simple", "penthera-ui-theme": "dark" });
    await b.go(base);
    await b.shot("narrow-dark.jpg", { ...phone, scale: 1 });
    await b.scheme("light");
    await b.prefs({ "penthera-ui-mode": "simple", "penthera-ui-theme": "light" });
    await b.go(base);
    await b.js(`${H} document.querySelector(".verdict .btn.primary").click(); await sleep(600);`);
    await b.shot("narrow-light.jpg", { ...phone, scale: 1 });

    // ui-start: a fresh install with no reports, setup closed.
    await b.size(desktop.width, desktop.height);
    await b.go(blank.match[1]);
    await b.prefs({ "penthera-ui-mode": "simple", "penthera-ui-theme": "light", "penthera-ui-panels": '{"left":true,"right":true}' });
    await b.reload();
    await b.shot("ui-start.jpg", desktop);
    b.close();
  } finally {
    for (const p of procs) p.kill();
    await sleep(300);
    rmSync(scratch, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { process.stderr.write(`dashboard-screenshots: ${e.message}\n`); process.exit(1); });
