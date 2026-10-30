/**
 * One E20-R2 visit in its own thread. A page can make a regex run for minutes on
 * the event loop, where no timer fires, so the parent ends this thread at the
 * hard cap instead. Progress goes out with each request, so a killed visit keeps
 * its counters and hop list.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { parentPort, workerData } from "node:worker_threads";
import { evidenceOf } from "./classify.mjs";
import { visit } from "./run.mjs";

const { row, loopbackPort, exclude, budgetMs, hardCapMs } = workerData;
const meter = { requests: 0, bytes: 0, redirects: 0, hosts: [] };
const report = meter.hosts.push.bind(meter.hosts);
meter.hosts.push = (host) => {
  report(host);
  parentPort.postMessage({ progress: { ...meter, hosts: [...meter.hosts] } });
};
const record = await visit(row, {
  loopbackPort, exclude: new Map(exclude), evidence: evidenceOf, strict: true, budgetMs, hardCapMs, meter,
  lookup: loopbackPort ? undefined : (host, opts = {}) => dnsLookup(host, { ...opts, family: 4 }),
});
parentPort.postMessage({ record });
