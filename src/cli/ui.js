/**
 * `penthera ui [--port 0] [--open] [--project <dir>]... [--reports <dir>] [--demo]`
 *
 * Starts the local dashboard on 127.0.0.1 and prints a one-time URL. See
 * docs/dashboard.md for the security model.
 */
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { mkdtempSync, openSync, writeSync, closeSync, rmSync, constants as FS } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bold, dim, red, green } from "./ansi.js";

const HELP = `
  ${bold("penthera ui")}: the local dashboard, on 127.0.0.1 only

  ${dim("Usage")}
    $ penthera ui [--open] [--port <n>] [--project <dir>]... [--reports <dir>]
    $ penthera ui --demo          Realistic fake data, for a first look or screenshots

  ${dim("Options")}
        --port <n>          Port to listen on (default: 0, a random free port)
        --open              Open the one-time URL in your browser (through a
                            private launcher file, so the token is not on a
                            command line)
        --project <dir>     Folder the dashboard may read and run the agent loop in
                            (repeatable; default: the current folder)
        --reports <dir>     Report JSON folder (default: <first project>/reports)
        --demo              Seed fake data; nothing is read from disk
    -h, --help              Show this help

  The URL holds a one-time token after the #, which the browser never sends
  over the network. The page swaps it for a session that lives in that tab
  only; the token then stops working. Nothing outside the project folders and
  ~/.penthera is read, and the server never contacts the network. Ctrl-C
  stops it.
`;

/**
 * Write a small page that forwards to `url`, in a folder only this user can
 * read, and return its path. --open hands the browser this path instead of
 * the URL, so the token never appears in a command line (`ps` shows every
 * process's arguments to every local user).
 */
export function writeLauncher(url, dir = mkdtempSync(join(tmpdir(), "penthera-ui-"))) {
  const file = join(dir, "open.html");
  const safe = url.replace(/[^A-Za-z0-9:/#=._-]/g, "");
  const html = `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">`
    + `<meta http-equiv="refresh" content="0;url=${safe}"><title>penthera ui</title>`
    + `<p>Opening penthera ui. If nothing happens, use the link printed in the terminal.</p>\n`;
  const fd = openSync(file, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | (FS.O_NOFOLLOW || 0), 0o600);
  try { writeSync(fd, html); } finally { closeSync(fd); }
  return { file, dir };
}

function openBrowser(url, session) {
  let launcher;
  try { launcher = writeLauncher(url); } catch { return; /* the URL is printed anyway */ }
  const target = launcher.file;
  const [cmd, args] = process.platform === "darwin" ? ["open", [target]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", target]]
      : ["xdg-open", [target]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch { /* the URL is printed anyway */ }
  // The launcher is useless once the link is redeemed; remove it then, or after two minutes.
  const cleanup = () => { clearInterval(poll); rmSync(launcher.dir, { recursive: true, force: true }); };
  const poll = setInterval(() => { if (session.redeemed) cleanup(); }, 500);
  poll.unref();
  setTimeout(cleanup, 120_000).unref();
  process.once("exit", cleanup);
}

export async function runUi(argv, { version }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        port: { type: "string", default: "0" },
        open: { type: "boolean", default: false },
        project: { type: "string", multiple: true },
        reports: { type: "string" },
        demo: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    process.stderr.write(`  ${red("Error")} ${e.message}\n${HELP}`);
    return 2;
  }
  const opts = parsed.values;
  if (opts.help) { console.log(HELP); return 0; }
  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`  ${red("Error")} --port must be 0-65535\n`);
    return 2;
  }

  const { startUiServer } = await import("../ui/server.js");
  let ui;
  try {
    ui = await startUiServer({ port, projects: opts.project, reportsDir: opts.reports, demo: opts.demo, version });
  } catch (e) {
    process.stderr.write(`  ${red("Not started")} ${e.message}\n`);
    return 2;
  }

  process.stdout.write(`\n  ${bold("penthera ui")}${opts.demo ? dim("  (demo data)") : ""}\n`);
  process.stdout.write(`  ${green(ui.url)}\n`);
  process.stdout.write(dim(`  one-time link: it signs one browser tab in, then stops working\n`));
  process.stdout.write(dim(`  listening on 127.0.0.1:${ui.port} only. Ctrl-C to stop\n\n`));
  if (opts.open) openBrowser(ui.url, ui.session);

  await new Promise((resolve) => {
    // The signal can arrive twice: npm (npx) forwards it to us right after the
    // terminal or a process-group kill delivered it. Keep listening and ignore
    // repeats, so the second copy cannot fall through to the default action
    // and kill the process before it stops. The caller exits as soon as this
    // resolves, so close only after "Stopped." is written.
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      process.stdout.write("\n  Stopped.\n", () => ui.close().then(resolve));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return 0;
}
