/**
 * One E20-R2 visit in its own thread. A page can make a regex run for minutes on
 * the event loop, where no timer fires, so the parent ends this thread at the
 * hard cap instead. Progress goes out as bytes arrive, so a killed visit keeps its
 * counters and hop list, also in the middle of a response.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { parentPort, workerData } from "node:worker_threads";
import { evidenceOf } from "./classify.mjs";
import { visit } from "./run.mjs";

const { row, loopbackPort, exclude, budgetMs, hardCapMs } = workerData;
const meter = { requests: 0, bytes: 0, redirects: 0, hosts: [] };
const send = () => parentPort.postMessage({ progress: { requests: meter.requests, bytes: meter.bytes, redirects: meter.redirects, hosts: [...meter.hosts] } });
let sent = 0;
meter.tick = (now = false) => {
  if (!now && Date.now() - sent < 50) return;
  sent = Date.now();
  send();
};
const add = meter.hosts.push.bind(meter.hosts);
meter.hosts.push = (host) => { add(host); send(); };
const record = await visit(row, {
  loopbackPort, exclude: new Map(exclude), evidence: evidenceOf, strict: true, budgetMs, hardCapMs, meter,
  lookup: loopbackPort ? undefined : (host, opts = {}) => dnsLookup(host, { ...opts, family: 4 }),
});
parentPort.postMessage({ record });
