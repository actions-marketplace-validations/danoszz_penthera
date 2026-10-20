#!/usr/bin/env node
/**
 * Render the walkthrough video, assets/walkthrough.mp4, with its poster
 * (assets/walkthrough-poster.jpg) and captions (assets/walkthrough.vtt).
 *
 *   node scripts/media/walkthrough.mjs
 *   CHROME=/path/to/chrome node scripts/media/walkthrough.mjs
 *
 * The flow: `npx penthera` (setup), a scan of the local mock server,
 * `penthera ui --demo` in Simple and then Advanced mode, one finding, a fix
 * diff approved, and the owner report. The terminal parts are VHS tapes in
 * scripts/media/tapes/. The dashboard part drives headless Chrome over the
 * DevTools protocol, as scripts/dashboard-screenshots.mjs does, and records
 * it with Page.startScreencast (the same mechanism Playwright's video uses,
 * without adding a dependency). ffmpeg joins the parts and burns the
 * captions in; the same captions go to the .vtt.
 *
 * Needs Node 22+, a local Chrome or Chromium, vhs (with ttyd) and ffmpeg
 * with libx264. Demo data only: the dashboard runs with --demo, the scan
 * targets the mock server, and every server binds 127.0.0.1.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSETS = join(ROOT, "assets");
const CHROME = process.env.CHROME || {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
}[process.platform];
const W = 1280;
const H = 800;
const FPS = 30;
const MOCK_PORT = 8765; // scripts/media/tapes/scan.tape types this port
const MAX_BYTES = 8 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const log = (s) => process.stdout.write(`  ${s}\n`);

/** Start a process and resolve with the first stdout/stderr match of `re`. */
function launch(cmd, args, re, opts = {}) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], ...opts });
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

/** Run a command to completion; throw with its output if it fails. */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}):\n${(r.stderr || r.stdout || "").slice(-3000)}`);
  return r.stdout;
}

const duration = (file) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());

/** A minimal CDP client: browser-level calls, one page session, and its events. */
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
  const on = (method, fn) => {
    const l = (msg) => { if (msg.sessionId === sessionId && msg.method === method) fn(msg.params); };
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const loaded = () => new Promise((r) => { const off = on("Page.loadEventFired", () => { off(); r(); }); });
  return {
    send, page, on,
    async go(url) { const l = loaded(); await page("Page.navigate", { url }); await l; await sleep(500); },
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
    close: () => ws.close(),
  };
}

// ── In-page helpers. Each runs inside the dashboard through call(). ──────

/**
 * A pointer the viewer can follow. It lives in a manual popover, so it sits
 * in the top layer above modal dialogs; re-showing it moves it to the top.
 */
function pointerTo(target) {
  const doc = globalThis.document;
  let cur = doc.getElementById("media-pointer");
  if (!cur) {
    cur = doc.createElement("div");
    cur.id = "media-pointer";
    cur.setAttribute("popover", "manual");
    Object.assign(cur.style, {
      position: "fixed", inset: "auto", left: "640px", top: "420px", margin: "0", padding: "0", border: "0",
      background: "transparent", overflow: "visible", width: "24px", height: "28px", pointerEvents: "none",
      transition: "left 520ms cubic-bezier(.3,.7,.2,1), top 520ms cubic-bezier(.3,.7,.2,1)",
    });
    const ns = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "28");
    svg.setAttribute("viewBox", "0 0 24 28");
    const path = doc.createElementNS(ns, "path");
    path.setAttribute("d", "M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 15.5 L18 15.5 Z");
    path.setAttribute("fill", "#000");
    path.setAttribute("stroke", "#fff");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    cur.append(svg);
    doc.documentElement.append(cur);
  }
  if (cur.matches(":popover-open")) cur.hidePopover();
  cur.showPopover();
  if (target) {
    cur.style.left = `${Math.round(target.x)}px`;
    cur.style.top = `${Math.round(target.y)}px`;
  }
}

/** Find an element by CSS selector and optional text; return its centre. */
function locate(selector, text) {
  const all = [...globalThis.document.querySelectorAll(selector)].filter((e) => e.getClientRects().length);
  const el = text ? all.find((e) => e.textContent.replace(/\s+/g, " ").trim().includes(text)) : all[0];
  if (!el) return null;
  el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect();
  return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
}

function clickAt(selector, text) {
  const all = [...globalThis.document.querySelectorAll(selector)].filter((e) => e.getClientRects().length);
  const el = text ? all.find((e) => e.textContent.replace(/\s+/g, " ").trim().includes(text)) : all[0];
  el.click();
}

function press(key) {
  const doc = globalThis.document;
  const target = doc.querySelector("dialog[open]") || doc;
  target.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key, bubbles: true }));
}

async function waitFor(selector, text, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const el = [...globalThis.document.querySelectorAll(selector)].find((e) => !text || e.textContent.includes(text));
    if (el && el.getClientRects().length) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// ── The dashboard part ───────────────────────────────────────────────────

/**
 * Record `penthera ui --demo` and return { file, marks, report }: the video,
 * caption marks in seconds from its start, and the downloaded owner report.
 */
async function recordDashboard(b, scratch) {
  const frames = join(scratch, "frames");
  const downloads = join(scratch, "downloads");
  mkdirSync(frames);
  mkdirSync(downloads);
  const demo = await launch(process.execPath, ["bin/penthera.js", "ui", "--demo", "--port", "0"], /(http:\/\/127\.0\.0\.1:\d+\/#t=\S+)/);
  try {
    await b.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await b.page("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await b.page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await b.go(demo.match[1]);
    await b.call(waitFor, "dialog[open] .btn.primary", "Start", 5000);

    // Every frame Chrome paints, stamped on arrival.
    const shots = [];
    const off = b.on("Page.screencastFrame", (p) => {
      const file = join(frames, `${String(shots.length).padStart(5, "0")}.jpg`);
      writeFileSync(file, Buffer.from(p.data, "base64"));
      shots.push({ file, t: Date.now() });
      b.page("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
    });
    await b.page("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    await sleep(300);
    const t0 = Date.now();
    const marks = [];
    const caption = (text) => marks.push({ at: (Date.now() - t0) / 1000, text });
    const point = async (selector, text) => {
      const at = await b.call(locate, selector, text);
      if (!at) throw new Error(`not on screen: ${selector}${text ? ` "${text}"` : ""}`);
      await b.call(pointerTo, at);
      await sleep(650);
    };
    const click = async (selector, text, after = 500) => {
      await point(selector, text);
      await b.call(clickAt, selector, text);
      await sleep(after);
    };
    const wait = async (selector, text, ms = 15000) => {
      if (!(await b.call(waitFor, selector, text, ms))) throw new Error(`timed out waiting for ${selector} ${text || ""}`);
    };

    // Setup: what Penthera does, Simple or Advanced, the project.
    caption("penthera ui --demo: the local dashboard on 127.0.0.1, with fake data");
    await b.call(pointerTo, null);
    await sleep(2200);
    await click("dialog[open] .btn.primary", "Start", 900);
    await click("dialog[open] label.choice", "Simple", 500);
    await click("dialog[open] .btn.primary", "Next", 900);
    await click("dialog[open] .btn", "Skip", 700);

    // Simple: the verdict, then the first problem in plain words.
    caption("Simple mode: one sentence on whether you can ship");
    await point(".verdict .btn.primary", "Show me the first one");
    await sleep(1600);
    await b.call(clickAt, ".verdict .btn.primary", "Show me the first one");
    await sleep(500);
    caption("Each problem in plain words: what is wrong, how sure Penthera is, what to do");
    await sleep(3800);

    // Advanced: the triage matrix and one finding.
    caption("Advanced mode: severity against confidence, and every finding");
    await click(".menu-title.logo", null, 500);
    await click(".menu:not([hidden]) .menu-item", "Advanced mode", 900);
    await click(".item", "code/acme-shop", 1000);
    await click(".matrix .cell[class*=fill-]", null, 700);
    await click("#findings-list .row", null, 2600);

    // The fix loop: one change, its diff, Apply.
    caption("The fix loop proposes one change at a time and waits for your OK");
    await b.call(press, "n");
    await sleep(700);
    await click("dialog[open] label", "Fix loop", 400).catch(() => b.call(clickAt, "input[name=kind][value=loop]"));
    await click("dialog[open] .btn.primary", null, 300);
    await wait("dialog[open] .approval");
    await sleep(800);
    await point("dialog[open] .btn.primary", "Apply");
    await sleep(2600);
    caption("Apply: Penthera patches, re-scans, and keeps the commit only if the fix holds");
    await b.call(clickAt, "dialog[open] .btn.primary", "Apply");
    await sleep(500);
    await wait("dialog[open] .approval");
    await sleep(1400);
    await click("dialog[open] .btn", "Stop", 2400);

    // Proof: the report.
    caption("Proof: the report for the owner, an auditor or a developer");
    await b.call(press, "5");
    await sleep(1200);
    await click(".btn", "owner report", 2400);

    await b.page("Page.stopScreencast");
    off();
    const end = Date.now();
    const report = readdirSync(downloads).find((f) => /^penthera-owner-.*\.md$/.test(f));
    if (!report) throw new Error("the owner report did not download");

    // Frames to a constant-rate clip: each frame lasts until the next one.
    const list = shots.filter((s) => s.t >= t0);
    if (list.length < 10) throw new Error(`only ${list.length} frames recorded`);
    const lines = [];
    let prev = list[0].t;
    lines.push(`file '${list[0].file}'`);
    for (let i = 1; i < list.length; i++) {
      lines.push(`duration ${((list[i].t - prev) / 1000).toFixed(3)}`, `file '${list[i].file}'`);
      prev = list[i].t;
    }
    lines.push(`duration ${((end - prev) / 1000).toFixed(3)}`, `file '${list.at(-1).file}'`);
    const concat = join(scratch, "frames.txt");
    writeFileSync(concat, `${lines.join("\n")}\n`);
    const file = join(scratch, "dashboard.mp4");
    run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-crf", "18", file]);
    const shift = (list[0].t - t0) / 1000;
    return { file, marks: marks.map((m) => ({ ...m, at: Math.max(0, m.at - shift) })), report: join(downloads, report) };
  } finally {
    demo.child.kill();
  }
}

// ── Captions: one PNG strip per line, rendered by the same Chrome ────────

const CAPTION_H = 96;

async function renderCaption(b, text, file, page) {
  await b.go(page);
  await b.call((t) => { globalThis.document.getElementById("c").textContent = t; }, text);
  await sleep(100);
  const { data } = await b.page("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: CAPTION_H, scale: 1 } });
  writeFileSync(file, Buffer.from(data, "base64"));
}

const vttTime = (s) => {
  const ms = Math.round(s * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}.${String(ms % 1000).padStart(3, "0")}`;
};

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), "penthera-media-"));
  const profile = mkdtempSync(join(tmpdir(), "penthera-chrome-"));
  const procs = [];
  try {
    // The project the setup wizard runs on: the init fixture, in its own git repo.
    const app = join(scratch, "my-app");
    cpSync(join(ROOT, "tests", "fixtures", "init", "app"), app, { recursive: true });
    const git = (...a) => run("git", ["-c", "user.name=Penthera demo", "-c", "user.email=demo@example.test", ...a], { cwd: app });
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "Demo app");

    const mock = await launch(process.execPath, ["tests/fixtures/mock-server.js"], /./, { env: { ...process.env, MOCK_PORT: String(MOCK_PORT) } });
    procs.push(mock.child);
    const chrome = await launch(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "about:blank"], /DevTools listening on (ws:\/\/\S+)/);
    procs.push(chrome.child);
    const b = await connect(chrome.match[1]);

    log("recording the dashboard");
    const dash = await recordDashboard(b, scratch);

    // The setup tape needs the wizard, so the onboarding switch stays unset.
    const env = { ...process.env, PENTHERA_ROOT: ROOT, PENTHERA_MEDIA: scratch };
    delete env.PENTHERA_NO_ONBOARDING;
    const tape = (name) => {
      log(`rendering scripts/media/tapes/${name}.tape`);
      const out = join(scratch, `${name}.mp4`);
      run("vhs", [`scripts/media/tapes/${name}.tape`, "-o", out], { env });
      return out;
    };
    const parts = [
      { file: tape("setup"), marks: [
        { at: 0.3, text: "npx penthera: one command finds your framework, lockfiles and AI tooling" },
        { at: 7.5, text: "It checks offline by default, then asks before it installs anything" },
      ] },
      { file: tape("scan"), marks: [{ at: 0.3, text: "A scan of the local mock server, offline: only 127.0.0.1 is contacted" }] },
      { file: dash.file, marks: dash.marks },
      { file: tape("report"), marks: [{ at: 0.3, text: "The owner report: what to fix first, in plain words" }] },
    ];

    // One timeline: each part's marks shifted by the parts before it.
    let offset = 0;
    const cues = [];
    for (const p of parts) {
      p.duration = duration(p.file);
      for (const m of p.marks) cues.push({ start: offset + m.at, text: m.text });
      offset += p.duration;
    }
    const total = offset;
    cues.forEach((c, i) => { c.end = Math.min(i + 1 < cues.length ? cues[i + 1].start : total, total) - 0.05; });

    log("rendering captions");
    const font = join(ROOT, "src", "ui", "static", "fonts", "DepartureMono-Regular.woff2");
    const captionPage = join(scratch, "caption.html");
    writeFileSync(captionPage, `<!doctype html><meta charset="utf-8"><style>
      @font-face { font-family: "Departure Mono"; src: url("file://${font}") format("woff2"); }
      html, body { margin: 0; background: transparent; }
      body { width: ${W}px; height: ${CAPTION_H}px; display: flex; align-items: center; justify-content: center; }
      #c { font: 22px/1.3 "Departure Mono", ui-monospace, monospace; color: #fff; background: #0000ed;
           padding: 10px 18px; max-width: ${W - 120}px; text-align: center; box-shadow: 4px 4px 0 #000; }
    </style><div id="c"></div>`);
    await b.page("Emulation.setDeviceMetricsOverride", { width: W, height: CAPTION_H, deviceScaleFactor: 1, mobile: false });
    await b.page("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const [i, c] of cues.entries()) {
      c.png = join(scratch, `caption-${i}.png`);
      await renderCaption(b, c.text, c.png, `file://${captionPage}`);
    }
    b.close();

    log("joining the parts");
    const inputs = [];
    const filters = [];
    parts.forEach((p, i) => {
      inputs.push("-i", p.file);
      filters.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS},setsar=1,format=yuv420p[p${i}]`);
    });
    filters.push(`${parts.map((_, i) => `[p${i}]`).join("")}concat=n=${parts.length}:v=1:a=0[v0]`);
    cues.forEach((c, i) => {
      inputs.push("-i", c.png);
      const k = parts.length + i;
      filters.push(`[v${i}][${k}:v]overlay=0:${H - CAPTION_H - 28}:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'[v${i + 1}]`);
    });
    const out = join(ASSETS, "walkthrough.mp4");
    run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", `[v${cues.length}]`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out]);

    // Poster: Simple mode with the first problem open, captions and all.
    const posterAt = parts[0].duration + parts[1].duration + (dash.marks[2]?.at ?? 10) + 2.5;
    run("ffmpeg", ["-v", "error", "-y", "-ss", posterAt.toFixed(2), "-i", out, "-frames:v", "1", "-q:v", "3", join(ASSETS, "walkthrough-poster.jpg")]);

    const vtt = ["WEBVTT", "", ...cues.flatMap((c, i) => [String(i + 1), `${vttTime(c.start)} --> ${vttTime(c.end)}`, c.text, ""])].join("\n");
    writeFileSync(join(ASSETS, "walkthrough.vtt"), vtt);

    const size = statSync(out).size;
    log(`wrote assets/walkthrough.mp4 (${total.toFixed(1)} s, ${(size / 1024 / 1024).toFixed(2)} MB), walkthrough-poster.jpg, walkthrough.vtt`);
    if (total < 60 || total > 90) log(`warning: ${total.toFixed(1)} s is outside 60 to 90 s; adjust the tapes or the sleeps`);
    if (size > MAX_BYTES) throw new Error(`walkthrough.mp4 is ${(size / 1024 / 1024).toFixed(2)} MB, over 8 MB`);
  } finally {
    for (const p of procs) p.kill();
    await sleep(300);
    if (!process.env.KEEP_MEDIA_SCRATCH) rmSync(scratch, { recursive: true, force: true });
    else log(`scratch kept at ${scratch}`);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { process.stderr.write(`walkthrough: ${e.message}\n`); process.exit(1); });
