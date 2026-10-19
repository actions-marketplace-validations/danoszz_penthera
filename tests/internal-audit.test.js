/**
 * The internal audit's own parsing logic (scripts/audit/run.mjs). The gates
 * themselves run in `npm run audit:internal`; these tests make sure a gate
 * cannot pass because a parser silently read nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseBenchTotals,
  actionRefs,
  isPinned,
  markdownLinks,
  readPreviousData,
  diffReports,
} from "../scripts/audit/run.mjs";

describe("internal audit: bench totals", () => {
  it("reads the Total row of the committed RESULTS.md", () => {
    const t = parseBenchTotals(readFileSync(new URL("../bench/RESULTS.md", import.meta.url), "utf-8"));
    expect(t.precision).toBeGreaterThan(0);
    expect(t.recall).toBeGreaterThan(0);
    expect(Number.isInteger(t.tp)).toBe(true);
  });

  it("returns null when there is no Total row", () => {
    expect(parseBenchTotals("# nothing here")).toBeNull();
  });
});

describe("internal audit: action pinning", () => {
  const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";

  it("finds uses: in workflow jobs and composite action steps", () => {
    const wf = `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v7\n      - uses: actions/setup-node@v6\n`;
    expect(actionRefs(wf)).toEqual([`actions/checkout@${sha}`, "actions/setup-node@v6"]);
    const composite = `runs:\n  using: composite\n  steps:\n    - uses: ./\n`;
    expect(actionRefs(composite)).toEqual(["./"]);
  });

  it("accepts SHAs, local actions and docker digests; rejects tags and branches", () => {
    expect(isPinned(`actions/checkout@${sha}`)).toBe(true);
    expect(isPinned("./")).toBe(true);
    expect(isPinned(`docker://alpine@sha256:${"a".repeat(64)}`)).toBe(true);
    expect(isPinned("actions/checkout@v7")).toBe(false);
    expect(isPinned("actions/checkout@main")).toBe(false);
    expect(isPinned("docker://alpine:3")).toBe(false);
  });
});

describe("internal audit: docs links", () => {
  it("collects relative links outside code fences and inline code", () => {
    const md = [
      "See [the method](docs/METHODOLOGY.md#confidence) and <a href=\"x.md\">x</a>.",
      "`[not](a-link.md)`",
      "```",
      "[also not](fenced.md)",
      "```",
      "[web](https://example.com)",
    ].join("\n");
    expect(markdownLinks(md)).toEqual(["docs/METHODOLOGY.md#confidence", "x.md", "https://example.com"]);
  });
});

describe("internal audit: report diff", () => {
  it("round-trips the data block and lists changed numbers", () => {
    const prev = { commit: "abc", date: "d", gates: { bench: { status: "pass", metrics: { precision: 0.9, seconds: 3 } } } };
    const md = `# r\n<!-- audit-data\n${JSON.stringify(prev)}\n-->\n`;
    expect(readPreviousData(md)).toEqual(prev);
    const cur = { gates: { bench: { status: "fail", metrics: { precision: 0.8, seconds: 9 } } } };
    expect(diffReports(prev, cur)).toEqual(["- bench: pass → fail", "- bench.precision: 0.900 → 0.800"]);
    expect(diffReports(null, cur)[0]).toMatch(/first run/);
  });
});
