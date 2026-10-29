#!/usr/bin/env node
/**
 * Render the three "how it works" shots for the home page's tour (section 03)
 * from the real dashboard, in the light theme, with demo data:
 *
 *   tour-1-scan.jpg     the Check my app window: pick the folder, start a check
 *   tour-2-verdict.jpg  the verdict, the list to fix, the first problem open
 *   tour-3-fix.jpg      a fix waiting for approval, its diff open
 *
 *   CHROME=/path/to/chrome node site/tools/tour-shots.mjs
 *
 * Starts `penthera ui --demo` on 127.0.0.1 and drives a headless Chrome over
 * the DevTools protocol; nothing here touches the network. Each shot is an
 * 800 x 500 JPEG at quality 82, like assets/dashboard/. Outputs go to
 * site/media/tour/ and are committed; the build only copies them.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SITE, "..");
const OUT = join(SITE, "media", "tour");
const CHROME = process.env.CHROME || {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
}[process.platform];
const W = 1024, H = 640;          // the viewport: the dashboard at a laptop size
const SHOT = { width: 800, height: 500 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Start a process and resolve with the first stdout/stderr match of `re`. */
function launch(cmd, args, re) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((ok, fail) => {
    let buf = "";
    const on = (d) => { buf += strip(String(d)); const m = buf.match(re); if (m) ok({ child, match: m }); };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("exit", (code) => fail(new Error(`${cmd} exited (${code}) before it was ready:\n${buf}`)));
  });
}

/** One page over CDP: navigate, run code, capture a clip. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message)); else w.resolve(msg.result);
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
  await page("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  const loaded = () => new Promise((r) => {
    const fn = (msg) => { if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") { listeners.delete(fn); r(); } };
    listeners.add(fn);
  });
  return {
    async go(url) { const l = loaded(); await page("Page.navigate", { url }); await l; await sleep(900); },
    async reload() { const l = loaded(); await page("Page.reload"); await l; await sleep(900); },
    /** Run a page function with values passed as arguments, never pasted into source. */
    async call(fn, ...args) {
      const { result: global } = await page("Runtime.evaluate", { expression: "globalThis" });
      const r = await page("Runtime.callFunctionOn", {
        functionDeclaration: fn.toString(), objectId: global.objectId,
        arguments: args.map((value) => ({ value })), awaitPromise: true, returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    /** Capture a 16:10 box (x, y, width in CSS px) as an 800 x 500 JPEG. */
    async shot(file, { x = 0, y = 0, width = W } = {}) {
      const clip = { x, y, width, height: width * SHOT.height / SHOT.width, scale: SHOT.width / width };
      const { data } = await page("Page.captureScreenshot", { format: "jpeg", quality: 82, clip });
      writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
      process.stdout.write(`  wrote site/media/tour/${file}\n`);
    },
    close: () => ws.close(),
  };
}

/** A 16:10 box around an element, padded, centred on it and kept in the viewport. */
function around(r, pad = 48) {
  const width = Math.min(W, Math.max(r.width + 2 * pad, (r.height + 2 * pad) * SHOT.width / SHOT.height));
  const height = width * SHOT.height / SHOT.width;
  const x = Math.min(Math.max(0, r.x + r.width / 2 - width / 2), W - width);
  const y = Math.min(Math.max(0, r.y + r.height / 2 - height / 2), H - height);
  return { x, y, width };
}

// Page functions, run inside the dashboard.
function prefs() {
  const ls = globalThis.localStorage;
  ls.clear();
  ls.setItem("penthera-ui-mode", "simple");
  ls.setItem("penthera-ui-theme", "light");
  ls.setItem("penthera-ui-panels", '{"left":true,"right":true}');
}
async function openNewCheck() {
  const doc = globalThis.document;
  doc.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "n" }));
  await new Promise((r) => setTimeout(r, 500));
  return doc.querySelector("dialog[open]").getBoundingClientRect().toJSON();
}
async function firstProblem() {
  globalThis.document.querySelector(".verdict .btn.first").click();
  await new Promise((r) => setTimeout(r, 800));
}
async function fixWaiting() {
  const doc = globalThis.document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "n" }));
  await sleep(400);
  doc.querySelector("dialog[open] input[name=kind][value=loop]").click();
  doc.querySelector("dialog[open] .btn.primary").click();
  for (let i = 0; i < 40 && !doc.querySelector("dialog[open] .approval"); i++) await sleep(500);
  const dialog = doc.querySelector("dialog[open]");
  dialog.querySelector("details").open = true;
  await sleep(700);
  return dialog.getBoundingClientRect().toJSON();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "penthera-tour-"));
  const procs = [];
  try {
    const demo = await launch(process.execPath, ["bin/penthera.js", "ui", "--demo", "--port", "0"], /(http:\/\/127\.0\.0\.1:\d+\/#t=\S+)/);
    procs.push(demo.child);
    const chrome = await launch(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], /DevTools listening on (ws:\/\/\S+)/);
    procs.push(chrome.child);
    const b = await connect(chrome.match[1]);

    // Sign in once: the one-time token is swapped for a session.
    await b.go(demo.match[1]);
    await b.call(prefs);
    await b.reload();

    // 1 · Start a check: the window that picks the folder and the kind of run.
    await b.shot("tour-1-scan.jpg", around(await b.call(openNewCheck), 40));

    // 2 · The verdict and the first problem, in plain words.
    await b.reload();
    await b.call(firstProblem);
    await b.shot("tour-2-verdict.jpg");

    // 3 · A fix waiting for approval, with the exact change open.
    await b.reload();
    await b.shot("tour-3-fix.jpg", around(await b.call(fixWaiting), 24));
    b.close();
  } finally {
    for (const p of procs) p.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { process.stderr.write(`tour-shots: ${e.message}\n`); process.exit(1); });
