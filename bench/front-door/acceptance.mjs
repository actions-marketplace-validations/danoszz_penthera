#!/usr/bin/env node
/**
 * E20-R2 acceptance: one real pilot on loopback, through the same commands a real run
 * uses, then every stop condition injected in turn, each proved to refuse pass 2 through
 * `main()`. Nothing leaves the machine.
 *
 *   npm run e20r:acceptance
 *
 * Prints a pass or fail table, and exits 1 on any fail. A row passes when the command
 * behaves as the row expects and, for a refusal, gives the row's own reason. The first
 * row must be allowed, so that a gate refusing everything can't pass. What only a server
 * can supply stands in through `deps`, and the pilot is marked a fixture, which a real
 * run refuses. Labels come after pass 2, so those rows prove that scoring refuses them.
 */
import { createServer } from "node:http";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./run.mjs";
import { main as analyze } from "./analyze-r.mjs";
import { main as reportMain } from "./pilot-report.mjs";
import { sealHash } from "./record-checks.mjs";
import { CLAIM_COHORTS, main as replicate, R_COHORTS } from "./replicate.mjs";
import { main as validation, scoreLabels } from "./validation-sample.mjs";

const IP = "178.104.243.225";
const COMMIT = "c".repeat(40);
const hashOf = (s) => sha256(Buffer.from(s));
const CLASSIFIER = hashOf("classifier"), PSL = hashOf("psl");

const stub = () => Promise.reject(Object.assign(new Error("x"), { code: "ENODATA" }));
const DNS = { mx: stub, ns: stub, resolveTxt: stub, resolveCaa: stub };
const rawOf = (dir) => readFileSync(join(dir, "raw.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const quiet = () => undefined;

/** Lists, a protocol that hashes them, and the flags a run takes. */
function fixture(root) {
  const lists = join(root, "lists");
  mkdirSync(lists);
  const hashes = {};
  for (const [cohort, { file, format }] of Object.entries(R_COHORTS)) {
    const hosts = Array.from({ length: CLAIM_COHORTS.includes(cohort) ? 12 : 2 }, (_, i) => `s${i}.${cohort.toLowerCase()}.selftest.example.com`);
    const text = format === "tranco" ? hosts.map((h, i) => `${i + 1},${h}`).join("\n") : `batch,domain\n${hosts.map((h) => `x,${h}`).join("\n")}`;
    writeFileSync(join(lists, `${file}`), `${text}\n`);
    hashes[cohort] = hashOf(`${text}\n`);
  }
  const file = (name, text) => { writeFileSync(join(root, name), text); return join(root, name); };
  const exclude = file("exclusions.txt", "gov government\n");
  const homepage = file("homepage.txt", "s0.t1k.selftest.example.com\n");
  const removals = file("removals.txt", "");
  const prior = file("prior.txt", "old.selftest.example.com\n");
  const manyRemovals = file("many-removals.txt", `${Array.from({ length: 5 }, (_, i) => `s${i}.t1k.selftest.example.com`).join("\n")}\n`);
  const otherExclude = file("other-exclusions.txt", "bad.org adult\n");
  const prereg = `| Status | **Registered.** Accepted |
| Amendment 2 | **Adopted.** Merged |
| Source address | \`${IP}\` |
| Frozen classifier SHA-256 | \`${CLASSIFIER}\` |
| Public Suffix List SHA-256 | \`${PSL}\` |
| Prior opt-outs SHA-256 | \`${sha256(readFileSync(prior))}\` |
${Object.entries(hashes).map(([c, h]) => `| ${c} list SHA-256 | \`${h}\` |`).join("\n")}
| E20-R exclusion list SHA-256 | \`${sha256(readFileSync(exclude))}\` |
| E20-R homepage-only list SHA-256 | \`${sha256(readFileSync(homepage))}\` |

## Amendment 2

**Status: adopted.** Text.
`;
  const common = ["--registered", "E20R", "--lists", lists, "--exclude", exclude, "--homepage-only", homepage, "--removals", removals, "--prior-optouts", prior];
  const state = { classifierSha256: CLASSIFIER, protocolSha256: hashOf(prereg), studyPageSha256: hashOf("page"), codeSha256: hashOf("code"), lockfileSha256: hashOf("lock"), runtimeSha256: hashOf("node"), pslSha256: PSL };
  return { common, prereg, state, exclude, otherExclude, removals, prior, manyRemovals, roundsLog: join(root, "rounds.log") };
}

/** One `main()` call, with its exit code and what it said. */
async function run(fx, args, over = {}) {
  const said = [];
  const code = await replicate(args, {
    say: (m) => said.push(m), results: fx.results, preregText: fx.prereg, pageText: `Study page, from ${IP}.`, tree: { commit: COMMIT, dirty: false, hidden: false, remoteTip: COMMIT },
    sourceIps: [IP], state: fx.state, classifierHash: CLASSIFIER, pslHash: PSL, fixture: true, loopbackPort: fx.port, dns: DNS, roundsLog: fx.roundsLog, ...over,
  });
  return { code, said: said.join(" ") };
}

/** Seal, then prune, through their commands. */
function close(fx, runDir, { skips = [fx.removals, fx.prior], exclude = fx.exclude, prune = true } = {}) {
  const code = reportMain([join(runDir, "raw.jsonl"), "--exclude", exclude, ...skips.flatMap((f) => ["--skip", f]), "--seal"], { log: quiet, fail: quiet });
  if (prune) validation(["prune", runDir], { log: quiet });
  return code;
}

/** A copy of the pilot's results, with `change` applied to its records and an honest manifest. */
function variant(fx, change = (r) => r, manifest = (m) => m) {
  const dir = mkdtempSync(join(fx.root, "v-"));
  cpSync(fx.base, join(dir, "results"), { recursive: true });
  const runDir = join(dir, "results", "e20r-pilot-1");
  const text = rawOf(runDir).map((r) => JSON.stringify(change(r))).join("\n") + "\n";
  writeFileSync(join(runDir, "raw.jsonl"), text);
  const m = JSON.parse(readFileSync(join(runDir, "manifest.json"), "utf8"));
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify(manifest({ ...m, rawSha256: hashOf(text) }), null, 2) + "\n");
  cpSync(fx.roundsLog, join(dir, "rounds.log"));
  return { ...fx, results: join(dir, "results"), roundsLog: join(dir, "rounds.log"), runDir };
}

/** Change a seal's fields, and give it a true hash, as someone editing it by hand would. */
function reseal(runDir, change) {
  const file = join(runDir, "pilot-result.json");
  const fields = change(JSON.parse(readFileSync(file, "utf8")));
  writeFileSync(file, JSON.stringify({ ...fields, sealSha256: sealHash(fields) }));
}

/** A second round: a copy of the first, started later, in the log as a run would put it. */
function secondRound(v) {
  const again = join(v.results, "e20r-pilot-2");
  cpSync(v.runDir, again, { recursive: true });
  const m = JSON.parse(readFileSync(join(again, "manifest.json"), "utf8"));
  writeFileSync(join(again, "manifest.json"), `${JSON.stringify({ ...m, startedAt: "2099-01-01T00:00:00.000Z" }, null, 2)}\n`);
  const manifestSha256 = sha256(readFileSync(join(again, "manifest.json")));
  reseal(again, (seal) => ({ ...seal, manifestSha256 }));
  writeFileSync(join(again, "prune-manifest.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(again, "prune-manifest.json"), "utf8")), manifestSha256 }));
  appendFileSync(v.roundsLog, `${JSON.stringify({ dir: "e20r-pilot-2", pilotSitesSha256: m.pilotSitesSha256, startedAt: "2099-01-01T00:00:00.000Z" })}\n`);
  return again;
}

const labels = (n, map = (i) => `${i},page`) => `id,label\n${Array.from({ length: n }, (_, i) => map(i + 1)).join("\n")}\n`;
const key = [1, 2, 3].map((id) => ({ id, stratum: "candidate-page", stratumSize: 3, ruleLabel: "page" }));
function scored(human, agent = labels(3)) {
  try {
    scoreLabels(key, human, agent, { resamples: 10 });
    return { code: 0, said: "allowed" };
  } catch (e) {
    return { code: 3, said: e.message };
  }
}

/** A command that refuses by throwing counts as refusing. */
async function catching(fn) {
  try {
    return await fn();
  } catch (e) {
    return { code: 3, said: e.message };
  }
}

/** Make the later round's number the lower one, so only the start times tell them apart. */
function renumbered(v, later) {
  const hold = `${later}-hold`;
  cpSync(later, hold, { recursive: true });
  rmSync(later, { recursive: true });
  cpSync(v.runDir, later, { recursive: true });
  rmSync(v.runDir, { recursive: true });
  cpSync(hold, v.runDir, { recursive: true });
  rmSync(hold, { recursive: true });
  const lines = readFileSync(v.roundsLog, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  writeFileSync(v.roundsLog, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  return v;
}

/** Every row: its condition, what it must do, and what it did. */
export async function runAcceptance() {
  const root = mkdtempSync(join(tmpdir(), "e20r2-acceptance-"));
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); res.end("User-agent: *\nAllow: /\n"); return; }
    res.writeHead(req.url === "/" ? 200 : 404, { "content-type": "text/html" });
    res.end("<html><title>A page</title><p>Hello from a synthetic site.</p></html>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const rows = [];
  const add = (condition, expect, got, because = /./) => {
    const allowed = got.code === 0;
    rows.push({ condition, expect, got: `exit ${got.code}: ${got.said.slice(0, 80)}`, pass: (expect === "allowed") === allowed && because.test(got.said) });
  };
  try {
    const fx = { ...fixture(root), root, port: server.address().port, results: join(root, "results") };
    const pilotArgs = (n = 50, round = 1) => ["--pilot", String(n), "--pilot-round", String(round), ...fx.common];
    const withRemovals = (file) => { const args = [...fx.common, "--pass", "2", "--pilot-dropped", join(fx.base ?? fx.results, "e20r-pilot-1", "pilot-sites.txt")]; args[args.indexOf("--removals") + 1] = file; return args; };
    const pass2 = (at) => [...fx.common.slice(0), "--pass", "2", "--pilot-dropped", join(at.results, "e20r-pilot-1", "pilot-sites.txt")];
    const started = await run(fx, pilotArgs());
    fx.base = fx.results;
    add("real pilot runs on loopback", "allowed", started);
    const gate = (at, over) => run(at, pass2(at), { stopBeforeRun: true, ...over });
    const clean = () => { const v = variant(fx); close(fx, v.runDir); return v; };
    const stops = async (condition, because, change, manifest) => { const v = variant(fx, change, manifest); close(fx, v.runDir); add(condition, "refused", await gate(v), because); };

    add("clean pilot, sealed and pruned", "allowed", await gate(clean()), /authorized/);
    add("no pilot at all", "refused", await run({ ...fx, results: join(root, "nothing"), roundsLog: join(root, "no-rounds.log") }, [...fx.common, "--pass", "2", "--pilot-dropped", fx.removals], { stopBeforeRun: true }), /No pilot manifest/);

    await stops("privacy scrub miss", /privacy scrub/, (r) => ({ ...r, evidence: { ...r.evidence, excerpt: "you are 203.0.113.7" } }));
    await stops("B3: stored (at) address", /privacy scrub/, (r) => ({ ...r, evidence: { ...r.evidence, excerpt: "john (at) example dot com" } }));
    await stops("internal worker error", /internal error/, (r) => (r.order === 0 ? { ...r, status: "error", error: "internal" } : r));
    await stops("insufficient 2xx evidence", /excerpt/, (r) => ({ ...r, evidence: { ...r.evidence, pageExcerpt: { scripts: 0 } } }));
    await stops("missing DNS", /no DNS read/, ({ dns: _dns, ...r }) => r);
    await stops("more than 20 requests", /more than 20/, (r) => ({ ...r, counters: { ...r.counters, requests: 21 } }));
    await stops("hop to an excluded host", /excluded host/, (r) => ({ ...r, hops: [...r.hops, "ministry.gov"] }));
    await stops("dead run: no name resolves", /graded/, ({ evidence: _e, checks: _c, finalHost: _f, ...r }) => ({ ...r, status: "error", error: "not_found", netCode: "ESERVFAIL" }));
    const failing = (q) => (r) => ({ ...r, dns: { ...r.dns, listed: { ...r.dns.listed, outcomes: { ...r.dns.listed.outcomes, [q]: "resolver-failure:ESERVFAIL" } } } });
    await stops("resolver failures on NS", /resolver failure/, failing("ns"));
    await stops("B4: resolver failures on TXT", /resolver failure/, failing("txt"));
    await stops("B4: resolver failures on CAA", /resolver failure/, failing("caa"));
    await stops("B4: SPF reads unanswered", /SPF reads/, (r) => ({ ...r, dns: { ...r.dns, listed: { ...r.dns.listed, spfRecordPresent: null, spf: null } } }));
    await stops("every site blocked, zero 2xx", /no site answered/, (r) => ({ ...r, httpStatus: 403 }));
    await stops("B4: DMARC reads unanswered", /DMARC reads/, (r) => ({ ...r, dns: { ...r.dns, listed: { ...r.dns.listed, dmarc: null } } }));
    await stops("under 30 eligible sites", /under 30 eligible/, ({ evidence: _e, checks: _c, finalHost: _f, dns: _d, ...r }) => (r.order < 25 ? { ...r, status: "opted_out" } : { ...r, evidence: _e, checks: _c, finalHost: _f, dns: _d }));
    await stops("under 20 graded sites", /under 20 graded/, ({ evidence: _e, checks: _c, finalHost: _f, ...r }) => (r.order < 20 ? { ...r, status: "opted_out" } : r.order < 31 ? { ...r, status: "error", error: "timeout" } : { ...r, evidence: _e, checks: _c, finalHost: _f }));
    await stops("graded share under the floor", /graded/, ({ evidence: _e, checks: _c, finalHost: _f, ...r }) => ({ ...r, status: "error", error: "timeout" }));
    await stops("B5: every site opted out", /no eligible site/, ({ evidence: _e, checks: _c, finalHost: _f, dns: _d, ...r }) => ({ ...r, status: "opted_out" }));
    await stops("changed while the pilot ran", /changed while/, (r) => r, (m) => ({ ...m, immutableAtFinish: { ok: false, changed: ["codeSha256"] } }));

    add("B5: --pilot 1", "refused", await run(fx, pilotArgs(1, 2)), /takes 40 to 50/);
    await stops("B5: a pilot under the floor", /floor is 40/, (r) => r, (m) => ({ ...m, sites: 39 }));

    const lowerFailed = variant(fx);
    close(fx, lowerFailed.runDir);
    const later = secondRound(lowerFailed);
    reseal(later, (seal) => ({ ...seal, passed: false, stop: ["a privacy scrub missed something"] }));
    const earlierFile = join(lowerFailed.runDir, "manifest.json");
    add("B1: the later round failed, with a lower number", "refused", await gate(renumbered(lowerFailed, later)), /failed/);
    add("B1: a round number at or below an existing one", "refused", await run(lowerFailed, pilotArgs(50, 2)), /not after round/);
    if (!existsSync(earlierFile)) throw new Error("fixture lost a round");

    const wrongExclude = variant(fx);
    close(fx, wrongExclude.runDir, { exclude: fx.otherExclude });
    add("B2: sealed with the wrong --exclude", "refused", await gate(wrongExclude), /failed.*--exclude/);
    const noSkip = variant(fx);
    close(fx, noSkip.runDir, { skips: [fx.removals] });
    add("B2: sealed without a --skip list", "refused", await gate(noSkip), /failed.*--skip/);
    const ownList = variant(fx);
    close(fx, ownList.runDir, { skips: [fx.removals, fx.prior, join(ownList.runDir, "pilot-sites.txt")] });
    add("B2: this round's own list as a skip list", "refused", await gate(ownList), /failed.*--skip/);
    const noFlag = variant(fx);
    add("B2: --seal with no --skip", "refused", { code: reportMain([join(noFlag.runDir, "raw.jsonl"), "--exclude", fx.exclude, "--seal"], { log: quiet, fail: quiet }) === 2 ? 3 : 0, said: "--seal refused" });
    const swapped = clean();
    reseal(swapped.runDir, (seal) => ({ ...seal, lists: {} }));
    add("B2: seal holds other list hashes", "refused", await gate(swapped), /other skip lists/);

    const flipped = variant(fx, (r) => ({ ...r, evidence: { ...r.evidence, excerpt: "you are 203.0.113.7" } }));
    close(fx, flipped.runDir);
    const flippedSeal = join(flipped.runDir, "pilot-result.json");
    const failedSeal = JSON.parse(readFileSync(flippedSeal, "utf8"));
    writeFileSync(flippedSeal, JSON.stringify({ ...failedSeal, passed: true, stop: [] }));
    add("seal: passed edited by hand", "refused", await gate(flipped), /own hash/);
    reseal(flipped.runDir, (seal) => ({ ...seal, passed: true, stop: [] }));
    add("seal: passed edited, hash redone", "refused", await gate(flipped), /does not pass/);
    const reportEdited = clean();
    writeFileSync(join(reportEdited.runDir, "pilot-report.json"), "{}\n");
    add("seal: report edited", "refused", await gate(reportEdited), /not the sealed one/);

    const deleted = clean();
    appendFileSync(deleted.roundsLog, `${JSON.stringify({ dir: "e20r-pilot-2", pilotSitesSha256: "x" })}\n`);
    add("rounds log: a round's folder was deleted", "refused", await gate(deleted), /rounds log/);
    const unlogged = clean();
    writeFileSync(unlogged.roundsLog, "");
    add("rounds log: a round is not in it", "refused", await gate(unlogged), /rounds log/);

    add("removal list over 5% of sites", "refused", await run(clean(), withRemovals(fx.manyRemovals), { stopBeforeRun: true }), /5 of \d+ sites.*over 5%/);

    add("S3: a loopback pilot in a real run", "refused", await gate(clean(), { fixture: false }), /ran on loopback/);

    const unsealed = variant(fx);
    validation(["prune", unsealed.runDir], { log: quiet });
    add("pilot report not sealed", "refused", await gate(unsealed), /no sealed report/);
    const unpruned = variant(fx);
    close(fx, unpruned.runDir, { prune: false });
    add("pruning absent", "refused", await gate(unpruned), /no proof/);
    const restored = clean();
    writeFileSync(join(restored.runDir, "raw.jsonl"), readFileSync(join(variant(fx).runDir, "raw.jsonl")));
    add("pruning undone: text back on disk", "refused", await gate(restored), /not the pruned one/);
    const fake = variant(fx);
    close(fx, fake.runDir, { prune: false });
    writeFileSync(join(fake.runDir, "prune-manifest.json"), JSON.stringify({ manifestSha256: "x", rawSha256Before: "x", rawSha256After: "x" }));
    add("pruning failed: proof for another run", "refused", await gate(fake), /another run/);
    const killed = variant(fx, (r) => r, ({ finishedAt: _f, rawSha256: _r, ...m }) => m);
    validation(["prune", killed.runDir], { log: quiet });
    add("pilot killed before it finished", "refused", await gate(killed), /did not finish/);
    const tampered = clean();
    reseal(tampered.runDir, (seal) => ({ ...seal, manifestSha256: "x" }));
    add("sealed report for another run", "refused", await gate(tampered), /another run/);

    const base = clean();
    const edited = hashOf("edited");
    const changed = (name) => gate(base, { state: { ...fx.state, [name]: edited } });
    add("changed classifier", "refused", await gate(base, { classifierHash: edited }), /frozen classifier/);
    add("changed classifier since the pilot", "refused", await changed("classifierSha256"), /classifierSha256/);
    add("changed protocol", "refused", await changed("protocolSha256"), /protocolSha256/);
    add("changed study page", "refused", await changed("studyPageSha256"), /studyPageSha256/);
    add("changed suffix list", "refused", await gate(base, { pslHash: edited }), /Public Suffix List/);
    add("changed code", "refused", await changed("codeSha256"), /codeSha256/);
    add("changed runtime", "refused", await changed("runtimeSha256"), /runtimeSha256/);
    const listFile = fx.common[fx.common.indexOf("--lists") + 1];
    const t1k = join(listFile, R_COHORTS.T1k.file);
    const original = readFileSync(t1k);
    writeFileSync(t1k, Buffer.concat([original, Buffer.from("999,extra.selftest.example.com\n")]));
    add("changed list", "refused", await gate(base), /listSha256/);
    writeFileSync(t1k, original);
    add("dropped list is not the pilot's", "refused", await run(base, [...fx.common, "--pass", "2", "--pilot-dropped", fx.prior], { stopBeforeRun: true }), /exactly the pilot sites/);

    const failing2 = variant(fx);
    close(fx, failing2.runDir);
    secondRound(failing2);
    reseal(failing2.runDir, (seal) => ({ ...seal, passed: false, stop: ["x"] }));
    add("S1: a failed round rerun with nothing changed", "refused", await gate(failing2), /changed nothing/);
    writeFileSync(join(failing2.runDir, "pilot-explanation.txt"), "A note on what went wrong.\n");
    add("S1: the same, with a recorded explanation", "allowed", await gate(failing2), /authorized/);

    const stopped = clean();
    const failingDns = { ...DNS, ns: () => Promise.reject(Object.assign(new Error("x"), { code: "ESERVFAIL" })) };
    add("in flight: resolver failures stop pass 2", "refused", await run(stopped, pass2(stopped), { dns: failingDns, rollingWindow: 8 }), /STOP: over 20%.*partial/);
    const stoppedRun = join(stopped.results, "e20r-pass2");
    const analysis = (dir) => { const said = []; const code = analyze(["--pass1", join(dir, "raw.jsonl"), "--e20", join(dir, "raw.jsonl"), join(dir, "raw.jsonl"), "--out", join(dir, "analysis.json")], { fail: (m) => said.push(m) }); return { code, said: said.join(" ") || "analyzed" }; };
    const draw = (dir) => { const said = []; const code = validation(["draw", dir], { log: quiet, fail: (m) => said.push(m) }); return { code, said: said.join(" ") || "drawn" }; };
    add("analysis of a stopped pass 2", "refused", analysis(stoppedRun), /stopped/);
    add("audit draw of a stopped pass 2", "refused", draw(stoppedRun), /stopped/);
    add("no pilot round after pass 2 started", "refused", await run(stopped, pilotArgs(50, 2)), /pass 2 has started/);

    const whole = clean();
    add("pass 2 runs to its end", "allowed", await run(whole, pass2(whole)));
    const wholeRun = join(whole.results, "e20r-pass2");
    add("analysis of a whole pass 2", "allowed", analysis(wholeRun), /analyzed/);
    add("a second start of pass 2", "refused", await catching(() => run(whole, pass2(whole))), /already holds a run/);
    const rawFile = join(wholeRun, "raw.jsonl");
    const kept = readFileSync(rawFile);
    writeFileSync(rawFile, Buffer.concat([kept, Buffer.from("{}\n")]));
    add("analysis of a raw file that changed", "refused", analysis(wholeRun), /not the one the manifest hashed/);
    add("audit draw of a raw file that changed", "refused", draw(wholeRun), /not the one the manifest hashed/);
    writeFileSync(rawFile, kept);
    add("audit draw of a whole pass 2", "allowed", draw(wholeRun), /drawn/);
    add("analysis after the draw pruned it", "allowed", analysis(wholeRun), /analyzed/);

    add("audit labels complete", "allowed", scored(labels(3)));
    add("audit labels incomplete", "refused", scored(labels(2)), /no label/);
    add("audit labels duplicate", "refused", scored(labels(3).replace("2,page", "1,page")), /duplicate/);
    add("audit labels unknown id", "refused", scored(labels(3).replace("3,page", "9,page")), /unknown id/);
    add("audit labels invalid", "refused", scored(labels(3).replace("3,page", "3,maybe")), /invalid label/);
    add("agent labels incomplete", "refused", scored(labels(3), labels(2)), /agent labels/);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
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
