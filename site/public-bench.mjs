/**
 * "Ranked against the free tools": the public-benchmark block in section 02.
 * Built from bench/public/published.json (bench/public/publish.mjs), so the
 * site shows exactly the numbers the README shows. No file, no block.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n2 = (x) => (x == null ? "n/a" : x.toFixed(2));
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// What each card ranks by, and the two numbers it shows under the rank.
const CARDS = {
  secrets: { label: "Leaked secrets", data: "Samsung CredData", score: "F1", short: "F1", lines: (r) => [`Precision ${n2(r.p)}`, `recall ${n2(r.r)}`] },
  npm: { label: "Malicious npm packages", data: "DataDog dataset", score: "Caught minus false alarms", short: "caught minus false alarms", lines: (r) => [`Caught ${n2(r.r)}`, `false alarms ${n2(r.fa)}`] },
  pypi: { label: "Malicious PyPI packages", data: "DataDog dataset", score: "Caught minus false alarms", short: "caught minus false alarms", lines: (r) => [`Caught ${n2(r.r)}`, `false alarms ${n2(r.fa)}`] },
  library: { label: "Injection bugs in JS libraries", data: "SecBench.js", score: "Found in the right file", short: "found", lines: (r) => [`Command ${r.command[0]}/${r.command[1]}`, `code ${r.code[0]}/${r.code[1]}`] },
};

/** Where a row would rank among the ranked rows (for "was 7th"). */
function wouldRank(row, ranked) {
  return row?.score == null ? null : ranked.filter((r) => r.kind !== "penthera" && r.score > row.score).length + 1;
}

function card(key, b) {
  const c = CARDS[key];
  // Scored rows, best first; a rank only when the field is big enough (b.ranked).
  const ranked = b.rows.filter((r) => r.score != null && !r.excluded).sort((a, z) => z.score - a.score);
  const us = ranked.find((r) => r.kind === "penthera");
  const was = b.rows.find((r) => r.kind === "penthera-before");
  if (!us) return "";
  const wasRank = wouldRank(was, ranked);
  const max = Math.max(...ranked.map((r) => r.score), 0.01);
  const bars = ranked.map((r) => `<li class="pb-row${r.kind === "penthera" ? " is-us" : ""}"><span class="pb-tool">${esc(r.tool)}</span><span class="pb-bar" style="--w:${Math.max(2, Math.round((r.score / max) * 100))}%"></span><span class="pb-val">${n2(r.score)}</span></li>`).join("");
  const notes = b.rows.filter((r) => r.caveat).map((r) => `${esc(r.tool)}: ${esc(r.caveat)}.`).join(" ");
  return `<li class="pb-card">
          <p class="pb-k">${esc(c.label)} <span>${esc(c.data)}</span></p>
          ${b.ranked
            ? `<p class="pb-rank"><span class="pb-place">${ord(us.rank)}</span> <span class="pb-of">of ${ranked.length}</span></p>`
            : `<p class="pb-rank"><span class="pb-place">${Math.round(us.score * 100)}%</span> <span class="pb-of">${esc(c.short)}</span></p>`}
          <p class="pb-lines">${c.lines(us).map(esc).join(" · ")}</p>
          ${was ? `<p class="pb-was">1.9.0: ${c.lines(was).map(esc).join(" · ")}${wasRank ? `, would rank ${ord(wasRank)}` : ""}</p>` : ""}
          <ol class="pb-chart" aria-label="${esc(c.score)}, every tool">${bars}</ol>
          <p class="pb-score">${esc(c.score)}${b.others?.[key === "secrets" ? "f1" : key === "library" ? "r" : "j"]?.median != null ? `. Median of the free tools: ${n2(b.others[key === "secrets" ? "f1" : key === "library" ? "r" : "j"].median)}` : ""}.</p>
          ${b.ranked ? "" : `<p class="pb-note">Not ranked: ${b.field} other free tool${b.field === 1 ? "" : "s"} measured, fewer than five.</p>`}
          ${notes ? `<p class="pb-note">${notes}</p>` : ""}
        </li>`;
}

export function publicBenchHtml(pub) {
  if (!pub?.benchmarks) return "";
  const cards = Object.keys(CARDS).map((k) => (pub.benchmarks[k] ? card(k, pub.benchmarks[k]) : "")).join("\n        ");
  return `<div class="pb" id="public-benchmarks">
        ${pub.sample ? `<p class="pb-sample">${esc(pub.note)}</p>` : ""}
        <h3 class="bench-title" id="pb-title">Ranked against the free tools</h3>
        <p class="bench-lede">Four public datasets other people built. Penthera and every free open-source tool we could run offline, scored the same way, on a half of each dataset we sealed before we started. Paid tools (${esc(pub.paidTools.names.join(", "))}) publish no results on these datasets, so they are not here.</p>
        <ul class="pb-cards" aria-labelledby="pb-title">
        ${cards}
        </ul>
        <p class="links">
          <a href="https://github.com/danoszz/penthera/blob/main/docs/research/prereg/E11b-improvement-study.md">Protocol</a>
          <a href="https://github.com/danoszz/penthera/blob/main/bench/public/PUBLISHED.md">All numbers</a>
          <a href="https://github.com/danoszz/penthera/tree/main/bench/public">Reproduce it</a>
        </p>
      </div>`;
}
