# E15: prompt injection hidden in what coding agents read (pre-registration)

> **Project page.** For researchers asking "can a static, rule-based check find
> instructions planted in the skills, rule files and MCP tool descriptions a
> coding agent reads, without crying wolf on normal ones?"

| | |
|---|---|
| Experiment | E15 |
| Status | **Draft for review, not registered.** It is registered by the commit that merges it, before any data is fetched or any rule is changed. Planned changes after registration go in § 9 |
| Date written | 2026-10-28 |
| Authors | Daan van der Zwaag (PI). Drafted with Claude (AI-assisted) |
| Data collected before registration | None. No attack set or negative file has been fetched |
| Scanner under test | Penthera 2.1.0 (`penthera agents`), as released before the study (P0) |
| Cost | $0. Offline, no model calls |

## Abstract

**Question.** Can a static, rule-based check find prompt-injection payloads
planted in the files a coding agent reads (skills, rule files, MCP tool
descriptions), without flagging normal ones?
**Method.** Payloads that worked against real models, from a public
competition ([Dziemian et al., 2026](../../references.md#dziemian2026ipiarena))
and from MCPTox ([Wang et al., 2026](../../references.md#wang2026mcptox)),
each planted in three carriers and three presentations (plain, hidden,
encoded). At least 300 normal agent files as negatives. A seeded dev/test
split; rules written on dev; test opened once.
**Outcomes.** Recall per carrier and presentation, false-alarm rate on
normal files, Wilson 95% intervals; McNemar's test for P1 against P0.
**Result.** None yet (draft, 29 Oct 2026).
**Limits.** Planting is synthetic. Plain persuasive text is expected to be
mostly missed by any static check (H2 is a stated limit, not a goal).
Popular negatives may be cleaner than the long tail.

## 1. Research questions

1. **RQ1.** How many prompt-injection payloads planted in agent files does
   `penthera agents` find, by where they are planted and how they are
   presented?
2. **RQ2.** How often does it flag a normal, published agent file that holds
   no payload?
3. **RQ3.** Which kinds does a static check miss? This is answered whatever
   the result, as the stated limit of the method.

## 2. Data

**Positives: payloads that worked against real models.**
- **The successful attacks from the indirect prompt-injection competition**
  in Dziemian et al. (2026, arXiv:2603.15714), 95 as released. *Check before
  registration:* the count, the licence, and that the release includes the
  payload text.
- **MCPTox tool-poisoning samples (2025).** *Check before registration:* the
  source, the licence and the count. If either set can't be used under its
  licence, it is dropped, and § 9 says so.

Each payload is planted in **three carriers**:
- a skill (`SKILL.md` body);
- an agent rule file (`CLAUDE.md`, `.cursorrules`, `AGENTS.md`);
- an MCP tool description (a server manifest's `description`).

It is planted in **three presentations**:
- **plain:** the text as written;
- **hidden:** zero-width characters, Unicode tag characters or bidirectional
  controls;
- **encoded:** base64, or an HTML comment.

That's up to 9 files per payload, and each file is one positive.

**Negatives: normal agent files.** Published skills, rule files and MCP
manifests, sampled from public repositories before any rule work:
- the sampling frame is listed in § 6;
- each is pinned by commit;
- each is read once by a person to confirm it holds no payload.

The target is at least 300 files. A file that turns out to hold a payload
moves to the positives, and the move is recorded.

**Split.** Payloads and negative source repositories are split 50/50 into dev
and test with a fixed seed, by payload and by repository, so one payload never
appears on both sides. The test half is sealed (ids and hashes only) before any
rule is written. As in E11b, dev is for tuning and test is opened once.

## 3. Arms

| Arm | What it is |
|---|---|
| **P0** | Penthera 2.1.0, `penthera agents`, as released before this study |
| **P1** | Penthera after rule work on dev, the version that would ship |
| **Others** | Every free tool in scope that runs offline, on its defaults, listed in E13's field before the run. A tool that needs a network service is reported as "not run offline" |

## 4. Scoring

- **Recall:** a positive file counts as found when `penthera agents` reports a
  finding in that file at any severity. It's reported per carrier, per
  presentation, and overall, with Wilson 95% intervals.
- **False-alarm rate:** negative files with any finding at medium or above,
  out of all negative files, with a Wilson interval.
- **Strict variant:** a positive only counts when the finding points at the
  planted span (by line). It's reported next to the main score.

## 5. Hypotheses

Stated before any data is fetched. Each is decided on the test half:

| | Claim | Supported when |
|---|---|---|
| **H1** | P1 finds hidden and encoded payloads | recall on hidden + encoded, test, lower 95% bound ≥ 0.80 |
| **H2** | Plain persuasive text is mostly missed. This is a stated limit, not a goal | recall on plain, test, is reported; no threshold |
| **H3** | P1 rarely flags normal agent files | false-alarm rate on test negatives, upper 95% bound ≤ 0.03 |
| **H4** | P1 improves on P0 | McNemar on paired positives (test), p < 0.05 |

## 6. Procedure

1. Merge this file. That commit is the registration.
2. Fetch the attack sets and the negative sample frame:
   - skills from public skill repositories and marketplaces;
   - rule files from the 200 most-starred repositories containing `CLAUDE.md`
     or `.cursorrules`;
   - MCP manifests from the Official MCP Registry.

   Pin everything by hash.
3. Build the planted files with a script in `bench/e15/`, then split and seal.
4. Run P0 on dev. Write rules on dev only.
5. Run P1 and the other tools on test, once, offline, with the network
   denied. Score, publish in `bench/e15/RESULTS.md`, whatever the result.

## 7. Threats to validity

- **Synthetic planting.** Real attacks may hide elsewhere (a README, a
  fetched web page). The carriers cover what `agents` reads today.
- **Not built for this.** The payloads were made to fool models, not static
  checkers. That favours a static check on hidden text and disfavours it on
  plain text, which is why H2 is reported, not tested.
- **Prevalence.** Recall on planted files says nothing about how common such
  files are in the wild.
- **Negatives chosen by popularity** may be cleaner than the long tail.

## 8. Cost

Offline, on the maintainer's machine. No paid services and no model calls:
$0.

## 9. Deviations

None yet.

## 10. Sample size, stopping and exclusions

Added on 29 Oct 2026 to the draft, before registration.

- **Sample size.** H3's bound needs enough test negatives: with 150 test
  negatives (half of 300) and no false alarm, the Wilson upper bound is
  about 0.025, under the 0.03 limit; with one false alarm it is about 0.037,
  over it. So H3 can pass only with zero or near-zero false alarms at this
  size, and a larger negative set is better. For H1, 95 payloads × 6 hidden
  or encoded files ≈ 570 files, about 285 on test: at a true recall of 0.90
  the lower bound is about 0.86, comfortably testable against 0.80.
- **Stopping.** The test half is scored once (§ 6, step 5). No rule pass
  after that.
- **Exclusions.** A payload is excluded before planting if its text is not
  in the release, if it is a duplicate of another payload after Unicode
  normalization, or if its license does not allow redistribution in a
  derived file. A negative file is excluded if it cannot be pinned by
  commit, or if the person reading it finds a payload (it then moves to the
  positives, § 2). Every exclusion is listed with its reason.

## 11. Related work

Indirect prompt injection, where instructions arrive in data a model reads,
was named by [Greshake et al. (2023)](../../references.md#greshake2023signed).
Tool-description poisoning in MCP is measured by MCPTox
([Wang et al., 2026](../../references.md#wang2026mcptox)), and attacks that
worked against deployed agents come from a public competition
([Dziemian et al., 2026](../../references.md#dziemian2026ipiarena)). Those
studies test models. E15 tests a static check that runs before a model
reads the file. Statistics: [Wilson (1927)](../../references.md#wilson1927probable),
[McNemar (1947)](../../references.md#mcnemar1947note).

## 12. What the result will mean

- **For users.** If H1 and H3 hold, `penthera agents` can be described as
  catching hidden and encoded instructions in the files it reads, with the
  rates and the carriers named. H2's number tells users how much plain text
  it misses, next to that claim.
- **For the tool.** Only rules written on dev and kept by the test run ship.
  A rule that fails H3 on test does not ship.
- **Not claimed.** Nothing about how common such files are in the wild
  (§ 7, prevalence).

## 13. Open science

| What | Where | License | Shared? |
|---|---|---|---|
| Protocol, planting and scoring scripts | this file, `bench/e15/` (planned) | MIT | Yes |
| Split manifests | `bench/e15/` (ids and hashes only) | MIT | Yes |
| Payload texts | their own releases | as released; checked before registration (§ 2) | Linked by id; planted files only if the license allows |
| Negative files | their own repositories, pinned by commit | each project's own | Linked by commit and path |

## 14. Revision log

| Date | Change | Commit |
|---|---|---|
| 2026-10-28 | Draft written | `a045933` |
| 2026-10-29 | Metadata table, abstract, §§ 10 to 14 | this commit |
