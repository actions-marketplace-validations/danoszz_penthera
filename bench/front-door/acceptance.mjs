#!/usr/bin/env node
/**
 * E20-R2 acceptance: one real pilot on loopback, then every stop condition injected in
 * turn, each proved to refuse pass 2 through the same gate a real run uses. Nothing
 * leaves the machine.
 *
 *   npm run e20r:acceptance
 *
 * Prints a pass or fail table, and exits 1 on any fail. A row passes when the gate
 * behaves as the row expects; the first row must be allowed, so that a gate refusing
 * everything can't pass. Validation labels come after pass 2, so those rows prove that
 * scoring refuses them.
 */
import { createServer } from "node:http";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, readExclusions } from "./run.mjs";
import { sealPilot } from "./pilot-report.mjs";
import { authorizeR, mergeCohorts, pilotEvidence, R_COHORTS, readRemovals, runPass } from "./replicate.mjs";
import { prunePilot, scoreLabels } from "./validation-sample.mjs";

const IP = "178.104.243.225";
const COMMIT = "c".repeat(40);
const hashOf = (s) => sha256(Buffer.from(s));
const LISTS = Object.fromEntries(Object.keys(R_COHORTS).map((c) => [c, hashOf(`list ${c}`)]));
const FIXED = Object.freeze({ classifier: hashOf("classifier"), psl: hashOf("psl"), exclude: hashOf("exclude"), homepage: hashOf("homepage") });
const PRIOR = Buffer.from("old.selftest.example.com\n");
const PAGE = `Study page, from ${IP}.`;
const PREREG = `| Status | **Registered.** Accepted |
| Amendment 2 | **Adopted.** Merged |
| Source address | \`${IP}\` |
| Frozen classifier SHA-256 | \`${FIXED.classifier}\` |
| Public Suffix List SHA-256 | \`${FIXED.psl}\` |
| Prior opt-outs SHA-256 | \`${sha256(PRIOR)}\` |
${Object.entries(LISTS).map(([c, h]) => `| ${c} list SHA-256 | \`${h}\` |`).join("\n")}
| E20-R exclusion list SHA-256 | \`${FIXED.exclude}\` |
| E20-R homepage-only list SHA-256 | \`${FIXED.homepage}\` |

## Amendment 2

**Status: adopted.** Text.
`;
const STATE = Object.freeze({ classifierSha256: FIXED.classifier, protocolSha256: hashOf(PREREG), codeSha256: hashOf("code"), pslSha256: FIXED.psl, listSha256: LISTS });

const stub = () => Promise.reject(Object.assign(new Error("x"), { code: "ENODATA" }));
const rawOf = (dir) => readFileSync(join(dir, "raw.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** The one real pilot, on loopback, under the hashes this exercise freezes. */
async function basePilot(root) {
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); res.end("User-agent: *\nAllow: /\n"); return; }
    res.writeHead(req.url === "/" ? 200 : 404, { "content-type": "text/html" });
    res.end("<html><title>A page</title><p>Hello from a synthetic site.</p></html>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const out = join(root, "results", "e20r-pilot-1");
  try {
    await runPass(mergeCohorts({ T1k: [{ host: "a.selftest.example.com", rank: 1, group: "com" }, { host: "b.selftest.example.com", rank: 2, group: "com" }] }), {
      pass: "pilot", out, loopbackPort: server.address().port, delayMs: 0, dns: { mx: stub, ns: stub, resolveTxt: stub, resolveCaa: stub },
      manifest: STATE, recheck: () => STATE,
    });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  return out;
}

/** A copy of the pilot's results, with `change` applied to its records and an honest manifest. */
function variant(root, change = (r) => r, manifest = (m) => m) {
  const dir = mkdtempSync(join(root, "v-"));
  cpSync(join(root, "results"), join(dir, "results"), { recursive: true });
  const run = join(dir, "results", "e20r-pilot-1");
  const text = rawOf(run).map((r) => JSON.stringify(change(r))).join("\n") + "\n";
  writeFileSync(join(run, "raw.jsonl"), text);
  const m = JSON.parse(readFileSync(join(run, "manifest.json"), "utf8"));
  writeFileSync(join(run, "manifest.json"), JSON.stringify(manifest({ ...m, rawSha256: hashOf(text) }), null, 2) + "\n");
  return { results: join(dir, "results"), run };
}

const finish = (v, exclude) => { sealPilot(v.run, { exclude }); prunePilot(v.run); return v; };

function gate(results, { over = {}, current = {}, dropped } = {}) {
  const pilot = pilotEvidence(dropped ?? readRemovals("a.selftest.example.com\nb.selftest.example.com\n", "pilot"), { results, current: { ...STATE, ...current } });
  try {
    authorizeR({
      registered: "E20R", pass: 2, listHashes: LISTS, excludeHash: FIXED.exclude, homepageOnlyHash: FIXED.homepage, preregText: PREREG, pageText: PAGE,
      tree: { commit: COMMIT, dirty: false, hidden: false, remoteTip: COMMIT }, sourceIps: [IP], removals: "", priorOptOuts: PRIOR, pilot, classifierHash: FIXED.classifier, pslHash: FIXED.psl, ...over,
    });
    return "allowed";
  } catch (e) {
    return `refused: ${e.message.replace(/^Refused: /, "").slice(0, 80)}`;
  }
}

const labels = (n, map = (i) => `${i},page`) => `id,label\n${Array.from({ length: n }, (_, i) => map(i + 1)).join("\n")}\n`;
const key = [1, 2, 3].map((id) => ({ id, stratum: "candidate-page", stratumSize: 3, ruleLabel: "page" }));
function scored(human, agent = labels(3)) {
  try {
    scoreLabels(key, human, agent, { resamples: 10 });
    return "allowed";
  } catch (e) {
    return `refused: ${e.message.slice(0, 70)}`;
  }
}

/** Every row: its condition, what it must do, and what it did. */
export async function runAcceptance() {
  const root = mkdtempSync(join(tmpdir(), "e20r2-acceptance-"));
  const exclude = readExclusions("gov government\n");
  const rows = [];
  // A refusal must be for the row's own reason, or an unrelated fault could pass every row.
  const add = (condition, expect, got, because = /./) => rows.push({ condition, expect, got, pass: got.startsWith(expect) && because.test(got) });
  try {
    await basePilot(root);
    const clean = () => finish(variant(root), exclude);
    const stops = (condition, because, change, manifest) => add(condition, "refused", gate(finish(variant(root, change, manifest), exclude).results), because);

    add("clean pilot, sealed and pruned", "allowed", gate(clean().results));
    add("no pilot at all", "refused", gate(join(root, "nothing")), /No pilot manifest/);

    stops("privacy scrub miss", /privacy scrub/, (r) => ({ ...r, evidence: { ...r.evidence, excerpt: "you are 203.0.113.7" } }));
    stops("internal worker error", /internal error/, (r) => (r.host.startsWith("a.") ? { ...r, status: "error", error: "internal" } : r));
    stops("insufficient 2xx evidence", /excerpt/, (r) => ({ ...r, evidence: { ...r.evidence, pageExcerpt: { scripts: 0 } } }));
    stops("missing DNS", /no DNS read/, ({ dns: _dns, ...r }) => r);
    stops("more than 20 requests", /more than 20/, (r) => ({ ...r, counters: { ...r.counters, requests: 21 } }));
    stops("hop to an excluded host", /excluded host/, (r) => ({ ...r, hops: [...r.hops, "ministry.gov"] }));
    stops("dead run: no name resolves, resolver failing", /graded/, ({ evidence: _e, checks: _c, finalHost: _f, ...r }) => ({ ...r, status: "error", error: "not_found", netCode: "ESERVFAIL" }));
    stops("resolver failures over the ceiling", /resolver failure/, (r) => ({ ...r, dns: { ...r.dns, listed: { ...r.dns.listed, outcomes: { ...r.dns.listed.outcomes, ns: "resolver-failure:ESERVFAIL" } } } }));
    stops("every site blocked, zero 2xx", /no site answered/, (r) => ({ ...r, httpStatus: 403 }));
    stops("graded share under the floor", /graded/, ({ evidence: _e, checks: _c, finalHost: _f, ...r }) => ({ ...r, status: "error", error: "timeout" }));
    stops("changed while the pilot ran", /changed while/, (r) => r, (m) => ({ ...m, immutableAtFinish: { ok: false, changed: ["codeSha256"] } }));

    const unsealed = variant(root);
    prunePilot(unsealed.run);
    add("pilot report not sealed", "refused", gate(unsealed.results), /no sealed report/);

    const unpruned = variant(root);
    sealPilot(unpruned.run, { exclude });
    add("pruning absent", "refused", gate(unpruned.results), /no proof/);

    const restored = clean();
    const fresh = variant(root);
    writeFileSync(join(restored.run, "raw.jsonl"), readFileSync(join(fresh.run, "raw.jsonl")));
    add("pruning undone: text back on disk", "refused", gate(restored.results), /not the pruned one/);

    const fake = variant(root);
    sealPilot(fake.run, { exclude });
    writeFileSync(join(fake.run, "prune-manifest.json"), JSON.stringify({ manifestSha256: "x", rawSha256Before: "x", rawSha256After: "x" }));
    add("pruning failed: proof for another run", "refused", gate(fake.results), /another run/);

    const killed = variant(root, (r) => r, ({ finishedAt: _f, rawSha256: _r, ...m }) => m);
    prunePilot(killed.run);
    add("pilot killed before it finished", "refused", gate(killed.results), /did not finish/);

    const tampered = clean();
    const sealed = JSON.parse(readFileSync(join(tampered.run, "pilot-result.json"), "utf8"));
    writeFileSync(join(tampered.run, "pilot-result.json"), JSON.stringify({ ...sealed, manifestSha256: "x" }));
    add("sealed report for another run", "refused", gate(tampered.results), /another run/);

    const base = clean();
    add("changed classifier", "refused", gate(base.results, { over: { classifierHash: hashOf("edited") } }), /frozen classifier/);
    add("changed classifier since the pilot", "refused", gate(base.results, { current: { classifierSha256: hashOf("edited") } }), /classifierSha256/);
    add("changed protocol", "refused", gate(base.results, { current: { protocolSha256: hashOf("edited") } }), /protocolSha256/);
    add("changed suffix list", "refused", gate(base.results, { over: { pslHash: hashOf("edited") } }), /Public Suffix List/);
    add("changed list", "refused", gate(base.results, { over: { listHashes: { ...LISTS, T1k: hashOf("edited") } } }), /T1k list/);
    add("changed code", "refused", gate(base.results, { current: { codeSha256: hashOf("edited") } }), /codeSha256/);
    add("dropped list is not the pilot's", "refused", gate(base.results, { dropped: readRemovals("x.selftest.example.com\n", "pilot") }), /exactly the pilot sites/);

    add("audit labels complete", "allowed", scored(labels(3)));
    add("audit labels incomplete", "refused", scored(labels(2)), /no label/);
    add("audit labels duplicate", "refused", scored(labels(3).replace("2,page", "1,page")), /duplicate/);
    add("audit labels unknown id", "refused", scored(labels(3).replace("3,page", "9,page")), /unknown id/);
    add("audit labels invalid", "refused", scored(labels(3).replace("3,page", "3,maybe")), /invalid label/);
    add("agent labels incomplete", "refused", scored(labels(3), labels(2)), /agent labels/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return rows;
}

async function main() {
  const rows = await runAcceptance();
  const width = Math.max(...rows.map((r) => r.condition.length));
  console.log(`${"Condition".padEnd(width)}  Expected  Result  Detail`);
  for (const r of rows) console.log(`${r.condition.padEnd(width)}  ${r.expect.padEnd(8)}  ${r.pass ? "PASS  " : "FAIL  "}  ${r.got}`);
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed} of ${rows.length} passed.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((code) => { process.exitCode = code; });
