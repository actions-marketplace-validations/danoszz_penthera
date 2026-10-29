/**
 * The README's benchmark summary: one row per benchmark, then what a tied rank
 * means and how the secrets rank depends on the F weight. Built from
 * published.json and rank-intervals.json only, so no number is typed by hand.
 * publish.mjs writes it into README.md; tests/bench-summary.test.js checks
 * that README.md still matches it.
 */
import { BENCHMARKS, RANK_INTERVALS, tiedPhrase } from "../../site/benchmarks.mjs";

export const SUMMARY_ROWS = [
  ["Leaked secrets (Samsung CredData)", "secrets", "F1"],
  ["Malicious npm packages (DataDog)", "npm", "caught minus false alarms"],
  ["Malicious PyPI packages (DataDog)", "pypi", "caught minus false alarms"],
  ["Injection bugs in JS libraries (SecBench.js)", "library", "found in the right file"],
];

const SHORT = { secrets: "CredData", npm: "npm", pypi: "PyPI", library: "SecBench.js" };
const pct = (x) => (x == null ? "n/a" : x.toFixed(2));
const ordn = (n) => `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]}`;
/** F-beta: beta below 1 weighs precision more, above 1 recall. */
export const fBeta = (p, r, beta) => (p && r ? ((1 + beta * beta) * p * r) / (beta * beta * p + r) : 0);

/** One line under the full tables: the rank column is an order by score; how sure Penthera's place is. */
export function rankIntervalLine() {
  const parts = SUMMARY_ROWS.filter(([, k]) => RANK_INTERVALS.penthera[k]).map(([, k]) => {
    const [lo, hi] = RANK_INTERVALS.penthera[k].rank;
    return `${lo === hi ? ordn(lo) : `${ordn(lo)} to ${ordn(hi)}`} on ${SHORT[k]}`;
  });
  return `The rank column orders tools by score, and close scores can swap places. Penthera's 95% rank interval (bootstrap, exploratory): ${parts.join(", ")}.`;
}

/** The summary table and its two notes, as Markdown lines. */
export function readmeSummary(published, label) {
  const sum = [`| Benchmark | Score | Penthera 1.9.0 | **Penthera ${label || "now"}** | Rank among free tools | Best other free tool |`, "|---|---|---|---|---|---|"];
  for (const [title, k, measure] of SUMMARY_ROWS) {
    const b = published.benchmarks[k];
    const us = b.rows.find((r) => r.kind === "penthera"), was = b.rows.find((r) => r.kind === "penthera-before");
    const best = b.rows.filter((r) => r.kind === "tool" && !r.excluded && r.score != null).sort((x, y) => y.score - x.score)[0];
    // A point rank goes out with its rank interval when the interval spans more than one place.
    const tie = b.ranked ? tiedPhrase(RANK_INTERVALS.penthera[k]) : "";
    sum.push(`| [${title}](https://penthera.org/benchmarks/${BENCHMARKS[k].slug}) | ${measure} | ${pct(was?.score)} | **${pct(us?.score)}** | ${b.ranked && us?.rank ? `**${ordn(us.rank)} of ${b.of}${tie}**${tie ? " ⁴" : ""}` : `${b.field} other tools, not ranked`} | ${best ? `${best.tool} ${pct(best.score)}` : "n/a"} |`);
  }
  const out = [...sum];
  // ⁴ What a tied range means, and how often Penthera came out first.
  const tied = SUMMARY_ROWS.filter(([, k]) => published.benchmarks[k]?.ranked && tiedPhrase(RANK_INTERVALS.penthera[k]));
  if (tied.length) {
    const items = published.benchmarks.library?.rows.find((r) => r.kind === "penthera")?.pooled?.[1];
    const firsts = tied.map(([, k], i) => `${Math.round(RANK_INTERVALS.penthera[k].first * 100)}%${i ? "" : " of the redraws"} on ${SHORT[k]}`);
    const list = firsts.length > 1 ? `${firsts.slice(0, -1).join(", ")} and ${firsts.at(-1)}` : firsts[0];
    out.push("", `⁴ A tied range is a rank interval: the range Penthera's rank fell in, in 95% of ${RANK_INTERVALS.replicates.toLocaleString("en-US")} bootstrap redraws of each tool's counts${items ? ` (on SecBench.js, of its ${items} test bugs)` : ""}. Penthera alone came out first in ${list}. Exploratory: computed after the registered ranking.`);
  }
  // Secrets: does the rank depend on how F weighs precision against recall?
  const S = published.benchmarks.secrets, us = S?.rows.find((r) => r.kind === "penthera");
  if (S?.ranked && us?.rank) {
    const ranked = S.rows.filter((r) => r.rank != null);
    const by = (beta, name) => {
      const o = ranked.map((r) => [r, fBeta(r.p, r.r, beta)]).sort((a, z) => z[1] - a[1]);
      const i = o.findIndex(([r]) => r === us);
      const other = o[i === 0 ? 1 : 0];
      return `${ordn(i + 1)} by ${name} (${pct(o[i][1])} against ${other[0].tool} ${pct(other[1])})`;
    };
    out.push("", `Leaked secrets: ${ordn(us.rank)} by F1, the registered score; ${by(0.5, "F0.5, which weighs precision more")}; ${by(2, "F2, which weighs recall more")}.`);
  }
  return out;
}
