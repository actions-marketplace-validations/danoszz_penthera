#!/usr/bin/env node
/**
 * Render the three "how it works" shots for the home page's tour (section 03)
 * from the real dashboard, in the light theme, with demo data:
 *
 *   tour-1-scan.jpg     the Check my app window: what to do, and the folder
 *   tour-2-verdict.jpg  the verdict and the first problem to fix
 *   tour-3-fix.jpg      a fix waiting for approval, its diff open
 *
 *   CHROME=/path/to/chrome node site/tools/tour-shots.mjs
 *
 * Starts `penthera ui --demo` on 127.0.0.1 and drives a headless Chrome over
 * the DevTools protocol; nothing here touches the network. Each shot is
 * cropped to the part that matters, so it reads at a third of the page's
 * width, and rendered at device scale 2: a 1200 x 750 JPEG (16:10) at
 * quality 82. Outputs go to site/media/tour/ and are committed; the build
 * only copies them.
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
const DIALOG = { width: 1024, height: 720 };   // a laptop-size window for the two dialogs
const NARROW = { width: 760, height: 700 };    // the verdict with both side panels shut
const SHOT = { width: 1200, height: 750 };
const DPR = 2;

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
  await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  const loaded = () => new Promise((r) => {
    const fn = (msg) => { if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") { listeners.delete(fn); r(); } };
    listeners.add(fn);
  });
  return {
    async go(url) { const l = loaded(); await page("Page.navigate", { url }); await l; await sleep(900); },
    async size({ width, height }) {
      await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: DPR, mobile: false });
    },
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
    /** Capture a 16:10 box (x, y, width in CSS px) as a 1200 x 750 JPEG. */
    async shot(file, { x, y, width }) {
      const clip = { x, y, width, height: width * SHOT.height / SHOT.width, scale: SHOT.width / DPR / width };
      const { data } = await page("Page.captureScreenshot", { format: "jpeg", quality: 82, clip });
      writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
      process.stdout.write(`  wrote site/media/tour/${file}\n`);
    },
    close: () => ws.close(),
  };
}

/**
 * A 16:10 box over a region { x, y, width, height } in CSS px: as wide as the
 * region plus padding, anchored at its top so a tall region is cut at the
 * bottom, and kept inside the viewport.
 */
function box(r, view, pad = 12) {
  const width = Math.min(view.width, r.width + 2 * pad);
  const height = width * SHOT.height / SHOT.width;
  const x = Math.min(Math.max(0, r.x - pad), view.width - width);
  const y = Math.min(Math.max(0, r.y - pad), view.height - height);
  return { x, y, width };
}

// Page functions, run inside the dashboard.
function prefs(panels) {
  const ls = globalThis.localStorage;
  ls.clear();
  ls.setItem("penthera-ui-mode", "simple");
  ls.setItem("penthera-ui-theme", "light");
  ls.setItem("penthera-ui-panels", panels);
}
async function openNewCheck() {
  const doc = globalThis.document;
  doc.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "n" }));
  await new Promise((r) => setTimeout(r, 500));
  return doc.querySelector("dialog[open]").getBoundingClientRect().toJSON();
}
function verdictAndFirst() {
  // The verdict plate down to the first problem in the list, nothing open over it.
  const doc = globalThis.document;
  const v = doc.querySelector(".verdict").getBoundingClientRect();
  const row = [...doc.querySelectorAll(".row")].find((r) => r.textContent.includes("Hardcoded Stripe"));
  const bottom = row.getBoundingClientRect().bottom;
  return { x: v.x, y: v.y, width: v.width, height: bottom - v.y };
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
    await b.size(DIALOG);
    await b.go(demo.match[1]);
    await b.call(prefs, '{"left":true,"right":true}');
    await b.reload();

    // 1 · Start a check: the window's top, what to do and the app's folder.
    await b.shot("tour-1-scan.jpg", box(await b.call(openNewCheck), DIALOG));

    // 3 · A fix waiting for approval: the headline, the problem and the diff.
    await b.reload();
    await b.shot("tour-3-fix.jpg", box(await b.call(fixWaiting), DIALOG));

    // 2 · The verdict and the first problem to fix, side panels shut.
    await b.size(NARROW);
    await b.call(prefs, '{"left":false,"right":false}');
    await b.reload();
    await b.shot("tour-2-verdict.jpg", box(await b.call(verdictAndFirst), NARROW, 8));
    b.close();
  } finally {
    for (const p of procs) p.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { process.stderr.write(`tour-shots: ${e.message}\n`); process.exit(1); });
