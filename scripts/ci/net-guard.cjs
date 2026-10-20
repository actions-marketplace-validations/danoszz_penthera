/**
 * Offline guard for CI smoke tests. Preload it into every Node process of a
 * check:
 *
 *   NODE_OPTIONS="--require /abs/path/net-guard.cjs"
 *   PENTHERA_NET_GUARD_LOG=/abs/path/net-guard.log
 *
 * Any TCP/TLS connection or DNS query to a host that is not loopback fails the
 * way a real network error would (asynchronously, ENETUNREACH) and is appended
 * to the log. Callers assert the log is empty afterwards, so a command that
 * quietly falls back after a failed download still fails the check.
 *
 * Loopback (127.0.0.0/8, ::1, localhost) and IPC sockets stay allowed: the
 * dashboard, the init dev-server probe and the mock targets all live there.
 */
"use strict";
const net = require("node:net");
const dns = require("node:dns");
const fs = require("node:fs");

const LOG = process.env.PENTHERA_NET_GUARD_LOG;

function isLoopback(host) {
  if (host == null || host === "") return true; // net defaults to localhost
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1"
    || h === "0:0:0:0:0:0:0:1" || /^127\./.test(h) || /^::ffff:127\./.test(h);
}

function record(kind, host) {
  const line = `${kind} ${host} pid=${process.pid} argv=${process.argv.slice(1).join(" ")}\n`;
  if (LOG) { try { fs.appendFileSync(LOG, line); } catch { /* still blocked below */ } }
  process.stderr.write(`net-guard: blocked ${kind} to ${host}\n`);
  const err = new Error(`net-guard: ${kind} to ${host} blocked (this check runs offline)`);
  err.code = "ENETUNREACH";
  return err;
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  // net.connect() passes [normalizedArgs]; socket.connect() passes the raw forms.
  const a = Array.isArray(args[0]) ? args[0] : args;
  const first = a[0];
  let host = null;
  let ipc = false;
  if (first && typeof first === "object") {
    ipc = typeof first.path === "string";
    host = first.host;
  } else if (typeof first === "string" && Number.isNaN(Number(first))) {
    ipc = true; // a pipe or socket path
  } else if (typeof a[1] === "string") {
    host = a[1];
  }
  if (!ipc && !isLoopback(host)) {
    const err = record("connect", host);
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return connect.apply(this, args);
};

function guardHostFn(obj, name, kind) {
  const orig = obj[name];
  if (typeof orig !== "function") return;
  obj[name] = function guarded(host, ...rest) {
    if (isLoopback(host)) return orig.call(this, host, ...rest);
    const err = record(kind, host);
    const cb = rest.find((r) => typeof r === "function");
    if (cb) { process.nextTick(cb, err); return undefined; }
    return Promise.reject(err);
  };
}

for (const name of Object.keys(dns)) {
  if (name === "lookup" || name.startsWith("resolve") || name === "reverse") guardHostFn(dns, name, `dns.${name}`);
}
for (const name of Object.keys(dns.promises)) {
  if (name === "lookup" || name.startsWith("resolve") || name === "reverse") guardHostFn(dns.promises, name, `dns.${name}`);
}
for (const proto of [dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name.startsWith("resolve") || name === "reverse") guardHostFn(proto, name, `dns.${name}`);
  }
}
