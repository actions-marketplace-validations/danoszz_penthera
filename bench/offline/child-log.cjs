/**
 * E17 child-process recorder (protocol § 3 and § 9.3). Preload it next to the
 * network guard:
 *
 *   NODE_OPTIONS="--require net-guard.cjs --require child-log.cjs"
 *   PENTHERA_CHILD_LOG=/abs/path/children.log
 *
 * Appends one line per child process a command starts: `node guarded`,
 * `node unguarded` (a Node child whose env drops the guard) or `exec <name>`
 * (a non-Node program, which the guard cannot see). It records only; it never
 * blocks a child.
 */
"use strict";
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");

const LOG = process.env.PENTHERA_CHILD_LOG;

function record(file, args, opts) {
  if (!LOG) return;
  let line;
  const name = path.basename(String(file || "")).split(" ")[0];
  const isNode = file === process.execPath || name === "node" || name === path.basename(process.execPath);
  if (isNode) {
    const env = (opts && opts.env) || process.env;
    line = /net-guard\.cjs/.test(env.NODE_OPTIONS || "") ? "node guarded" : "node unguarded";
  } else {
    line = `exec ${name}`;
  }
  try { fs.appendFileSync(LOG, `${line}\n`); } catch { /* recording must never break the run */ }
}

// spawn/spawnSync carry (file, args?, opts?); exec/execSync carry (command, opts?).
const optsOf = (args) => args.find((a) => a && typeof a === "object" && !Array.isArray(a));
for (const fn of ["spawn", "spawnSync", "execFile", "execFileSync", "fork"]) {
  const orig = cp[fn];
  cp[fn] = function recorded(file, ...rest) {
    record(fn === "fork" ? process.execPath : file, rest, optsOf(rest));
    return orig.call(this, file, ...rest);
  };
}
for (const fn of ["exec", "execSync"]) {
  const orig = cp[fn];
  cp[fn] = function recorded(command, ...rest) {
    record(String(command).trim().split(/\s+/)[0], [], optsOf(rest));
    return orig.call(this, command, ...rest);
  };
}
syncBuiltinESMExports();
