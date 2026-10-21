#!/usr/bin/env node
/**
 * Regenerate lib/references.json "sources" and docs/references.md from
 * docs/references.bib, so the report citations and the rendered list can't
 * drift from the bibliography. docs/references.md is rendered in APA 7th
 * edition style. The category -> keys map in references.json is
 * hand-maintained and kept as is.
 *
 *   node scripts/build-references.mjs          write both files
 *   node scripts/build-references.mjs --check  exit 1 if either is stale
 *
 * The APA formatter (formatApa, formatBibliography) and the in-text citation
 * checker (checkCitations) are exported for tests/references.test.js.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const BIB = new URL("docs/references.bib", ROOT);
const JSON_OUT = new URL("lib/references.json", ROOT);
const MD_OUT = new URL("docs/references.md", ROOT);

const TOPICS = [
  ["blackbox", "Black-box scanning and benchmarking"],
  ["design", "Security design principles"],
  ["threatmodel", "Threat modeling"],
  ["supplychain", "Software supply chain"],
  ["secrets", "Secret leakage"],
  ["web", "Web application security"],
  ["llm", "LLM and agent security"],
  ["standards", "Standards and regulation"],
  ["advisories", "Vulnerability advisories and version data"],
];

/** Entries with this keyword may stay uncited in METHODOLOGY.md. */
export const FURTHER_READING = "further-reading";

/**
 * Minimal BibTeX reader: enough for the flat, brace-delimited entries in
 * references.bib. A `type` field (as on @techreport) is returned as
 * `reporttype` so it cannot shadow the entry type.
 */
export function parseBib(text) {
  const entries = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(re.lastIndex, i - 1);
    const fields = {};
    const fre = /(\w+)\s*=\s*/g;
    let f;
    while ((f = fre.exec(body))) {
      let j = fre.lastIndex;
      let val;
      if (body[j] === "{") {
        let d = 1; let k = j + 1;
        while (k < body.length && d > 0) { if (body[k] === "{") d++; else if (body[k] === "}") d--; k++; }
        val = body.slice(j + 1, k - 1);
        fre.lastIndex = k;
      } else {
        const end = body.indexOf(",", j);
        val = body.slice(j, end === -1 ? undefined : end).trim();
        fre.lastIndex = end === -1 ? body.length : end;
      }
      fields[f[1].toLowerCase()] = val;
    }
    const { type: reporttype, ...rest } = fields;
    entries.push({ type: m[1].toLowerCase(), key: m[2], ...rest, ...(reporttype ? { reporttype } : {}) });
    re.lastIndex = i;
  }
  return entries;
}

const ACCENTS = { "{\\'e}": "é", "{\\'a}": "á", '{\\"u}': "ü", "\\emph{": "" };

function deaccent(s = "") {
  let out = s;
  for (const [k, v] of Object.entries(ACCENTS)) out = out.split(k).join(v);
  return out;
}

export function clean(s = "") {
  return deaccent(s).replace(/[{}]/g, "").replace(/--/g, "-").replace(/\s+/g, " ").trim();
}

function authors(e) {
  return clean(e.author).split(/\s+and\s+/).map((a) => a.trim());
}

function surname(a) {
  return a.includes(",") ? a.split(",")[0].trim() : a;
}

/** Short label used in reports and SARIF, e.g. "Meli et al. 2019" or "RFC 6797 (2012)". */
export function citeLabel(e) {
  if (e.shorthand) return clean(e.shorthand);
  const as = authors(e);
  const year = e.year || "n.d.";
  if (e.key.startsWith("rfc") || /^RFC \d+/.test(clean(e.howpublished))) {
    const rfc = clean(e.howpublished).match(/RFC \d+/);
    if (rfc) return `${rfc[0]} (${year})`;
  }
  if (as.length === 1) return `${surname(as[0])} ${year}`.replace(/ n\.d\.$/, "");
  if (as.length === 2) return `${surname(as[0])} & ${surname(as[1])} ${year}`;
  return `${surname(as[0])} et al. ${year}`;
}

export function linkFor(e) {
  return e.doi ? `https://doi.org/${e.doi}` : e.url;
}

// ── APA 7 ────────────────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Split a raw BibTeX name list at top-level " and " (braced corporate names stay whole). */
function splitNames(raw = "") {
  const s = raw.replace(/\s+/g, " ").trim();
  const out = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth === 0 && s.startsWith(" and ", i)) { out.push(cur); cur = ""; i += 4; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out.map((n) => n.trim()).filter(Boolean);
}

/** { corporate } for a braced group author, else { family, given }. */
export function parseName(raw) {
  const t = raw.trim();
  if (t.startsWith("{") && t.endsWith("}") && !deaccent(t).slice(1, -1).includes("{")) return { corporate: clean(t) };
  const name = clean(t);
  if (name.includes(",")) {
    const [family, ...given] = name.split(",");
    return { family: family.trim(), given: given.join(",").trim() };
  }
  const parts = name.split(" ");
  return { family: parts.pop(), given: parts.join(" ") };
}

/** "Cristian-Alexandru" -> "C.-A.", "A H M Nazmus" -> "A. H. M. N.". */
export function initials(given = "") {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.split("-").map((p) => `${p.replace(/\./g, "").charAt(0).toUpperCase()}.`).join("-"))
    .join(" ");
}

const nameRef = (n) => n.corporate || (n.given ? `${n.family}, ${initials(n.given)}` : n.family);
const nameInitialsFirst = (n) => n.corporate || (n.given ? `${initials(n.given)} ${n.family}` : n.family);
const nameCite = (n) => n.corporate || n.family;

/** APA reference-list author element: "Surname, I. I., Surname, I., & Surname, I." */
export function formatAuthors(names) {
  const list = names.map(nameRef);
  if (list.length === 1) return list[0];
  if (list.length <= 20) return `${list.slice(0, -1).join(", ")}, & ${list.at(-1)}`;
  return `${list.slice(0, 19).join(", ")}, . . . ${list.at(-1)}`;
}

function formatEditors(names) {
  const list = names.map(nameInitialsFirst);
  const joined = list.length === 1 ? list[0] : list.length === 2 ? `${list[0]} & ${list[1]}` : `${list.slice(0, -1).join(", ")}, & ${list.at(-1)}`;
  return `${joined} (${list.length === 1 ? "Ed." : "Eds."})`;
}

/**
 * APA sentence case. Braced groups are protected (proper nouns, acronyms);
 * words with a capital after the first letter (GitHub, LLMs) are kept; the
 * first word and the first word after a colon, ? or ! are capitalized.
 */
export function sentenceCase(raw = "") {
  const s = deaccent(raw).replace(/\s+/g, " ").trim();
  let out = "";
  let start = true;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "{") {
      let d = 1;
      let j = i + 1;
      while (j < s.length && d > 0) { if (s[j] === "{") d++; else if (s[j] === "}") d--; j++; }
      out += s.slice(i + 1, j - 1).replace(/[{}]/g, "");
      start = false;
      i = j;
      continue;
    }
    const word = s.slice(i).match(/^\p{L}+/u)?.[0];
    if (word) {
      if (/\p{Lu}/u.test(word.slice(1))) out += word;
      else out += start ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase();
      start = false;
      i += word.length;
      continue;
    }
    if (/[:?!]/.test(c) || (c === "." && s[i + 1] === " ")) start = true;
    else if (/\d/.test(c)) start = false;
    out += c;
    i++;
  }
  return out.replace(/ -- /g, " – ").replace(/--/g, "–");
}

/** Container names (journals, proceedings, sites) keep their own capitalization. */
const container = (s) => clean(s.replace(/--/g, "–"));
const pages = (p) => clean(p).replace(/-+/g, "–");
const endsSentence = (s) => /[.?!]$/.test(s.replace(/\*+$/, ""));
const period = (s) => (endsSentence(s) ? s : `${s}.`);

function isRfc(e) {
  return /^RFC \d+/.test(clean(e.howpublished));
}

function isArxivOnly(e) {
  return e.type === "misc" && /arxiv/i.test(e.archiveprefix || "");
}

const isWebPage = (e) => e.type === "misc" && !isRfc(e) && !isArxivOnly(e);

function retrieved(e) {
  const [y, m, d] = (e.urldate || "").split("-").map(Number);
  if (!y || !m || !d) return `<${e.url}>`;
  return `Retrieved ${MONTHS[m - 1]} ${d}, ${y}, from <${e.url}>`;
}

function link(e) {
  if (e.doi) return `<https://doi.org/${e.doi}>`;
  if (!e.url) return "";
  return isWebPage(e) && e.urldate ? retrieved(e) : `<${e.url}>`;
}

/** "2023", "2025b", "n.d.", "n.d.-a". */
function yearLabel(e) {
  const base = e.year || "n.d.";
  if (!e.suffix) return base;
  return e.year ? `${base}${e.suffix}` : `${base}-${e.suffix}`;
}

function dateElement(e) {
  const y = yearLabel(e);
  // Web pages and standards carry a full date when one is known; reports, books and papers use the year.
  if (isWebPage(e) && e.year && e.month && e.day) {
    const mi = MONTH_KEYS.indexOf(clean(e.month).slice(0, 3).toLowerCase());
    if (mi >= 0) return `${y}, ${MONTHS[mi]} ${clean(e.day)}`;
  }
  return y;
}

function authorElement(e) {
  const a = formatAuthors(splitNames(e.author).map(parseName));
  return `${period(a)} (${dateElement(e)}).`;
}

/** Render one entry as an APA 7 reference (Markdown: *italics*, <autolinks>). */
export function formatApa(e) {
  const parts = [authorElement(e)];
  const title = sentenceCase(e.title);
  const addon = e.titleaddon ? ` [${clean(e.titleaddon)}]` : "";
  const site = clean(e.organization || e.publisher || e.howpublished || "");
  const authorText = splitNames(e.author).map(parseName).map(nameCite).join(", ");

  switch (e.type) {
    case "article": {
      let src = `*${container(e.journal)}*`;
      if (e.volume) src += `, *${clean(e.volume)}*${e.number ? `(${clean(e.number)})` : ""}`;
      if (e.pages) src += `, ${pages(e.pages)}`;
      parts.push(period(title), `${src}.`);
      break;
    }
    case "inproceedings":
    case "incollection": {
      const eds = e.editor ? `${formatEditors(splitNames(e.editor).map(parseName))}, ` : "";
      const pp = e.pages ? ` (pp. ${pages(e.pages)})` : "";
      parts.push(period(title), `In ${eds}*${container(e.booktitle)}*${pp}.`);
      if (e.publisher) parts.push(period(clean(e.publisher)));
      break;
    }
    case "book":
      parts.push(period(`*${title}*`));
      if (e.publisher) parts.push(period(clean(e.publisher)));
      break;
    case "techreport": {
      const num = [clean(e.reporttype || "Report"), clean(e.number || "")].filter(Boolean).join(" ");
      parts.push(`*${title}* (${num}).`);
      if (e.institution) parts.push(period(clean(e.institution)));
      break;
    }
    default: {
      if (isRfc(e)) {
        const hp = clean(e.howpublished);
        const series = [hp.match(/RFC \d+/)?.[0], hp.match(/BCP \d+/)?.[0]].filter(Boolean).join(", ");
        parts.push(`*${title}* (${series}).`, "RFC Editor.");
      } else if (isArxivOnly(e)) {
        parts.push(`*${title}* [Preprint].`, "arXiv.");
      } else {
        const version = e.version ? ` (Version ${clean(e.version)})` : "";
        parts.push(period(`*${title}*${version}${addon}`));
        if (site && site !== authorText) parts.push(period(site));
      }
    }
  }
  const l = link(e);
  if (l) parts.push(l);
  return parts.join(" ");
}

function sortName(n) {
  return (n.corporate ? n.corporate.replace(/^(The|A|An) /, "") : `${n.family} ${initials(n.given)}`).toLowerCase();
}

const sortTitle = (e) => clean(e.title).replace(/^(The|A|An) /i, "").toLowerCase();

/** APA order: author by author (surname, then initials), a shorter list first, then year (n.d. first), then title. */
export function compareApa(a, b) {
  const na = splitNames(a.author).map((n) => sortName(parseName(n)));
  const nb = splitNames(b.author).map((n) => sortName(parseName(n)));
  for (let i = 0; i < Math.min(na.length, nb.length); i++) {
    const c = na[i].localeCompare(nb[i], "en");
    if (c) return c;
  }
  if (na.length !== nb.length) return na.length - nb.length;
  const ya = a.year ? Number(a.year) : -Infinity;
  const yb = b.year ? Number(b.year) : -Infinity;
  if (ya !== yb) return ya - yb;
  return sortTitle(a).localeCompare(sortTitle(b), "en");
}

/**
 * Sort entries in APA order and add year suffixes (2025a, n.d.-b) where one
 * author list has several works in the same year. Suffixes are assigned over
 * the whole bibliography, so they stay unique across topic groups.
 */
export function formatBibliography(entries) {
  const sorted = [...entries].map((e) => ({ ...e })).sort(compareApa);
  const groups = new Map();
  for (const e of sorted) {
    const id = `${splitNames(e.author).map((n) => sortName(parseName(n))).join("|")}#${e.year || "n.d."}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(e);
  }
  for (const g of groups.values()) {
    if (g.length > 1) g.forEach((e, i) => { e.suffix = String.fromCharCode(97 + i); });
  }
  return sorted.map((e) => ({ ...e, apa: formatApa(e), ...inTextFor(e) }));
}

/** APA in-text forms: parenthetical "(Bau et al., 2010)" and narrative "Bau et al. (2010)". */
export function inTextFor(e) {
  const names = splitNames(e.author).map(parseName).map(nameCite);
  const y = yearLabel(e);
  const short = names.length >= 3 ? `${names[0]} et al.` : null;
  const paren = short || names.join(" & ");
  const narrative = short || names.join(" and ");
  return { year: y, citeNames: paren, narrativeNames: narrative, parenthetical: `(${paren}, ${y})`, narrativeCite: `${narrative} (${y})` };
}

const YEAR = String.raw`(?:(?:19|20)\d{2}[a-z]?|n\.d\.(?:-[a-z])?)`;

/** Remove fenced code, inline code and link targets, which are never citations. */
function proseOnly(md) {
  return md
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/\]\([^)]*\)/g, "]");
}

/**
 * Find APA in-text citations in Markdown prose and resolve each against the
 * bibliography. Returns { citations, unresolved, uncited }: `unresolved` lists
 * citations with no matching reference, `uncited` lists keys never cited and
 * not marked further reading.
 */
export function checkCitations(markdown, entries) {
  const bib = formatBibliography(entries);
  const paren = new Map();
  const narr = new Map();
  for (const e of bib) {
    paren.set(`${e.citeNames}, ${e.year}`, e.key);
    narr.set(`${e.narrativeNames}|${e.year}`, e.key);
  }
  const text = proseOnly(markdown);
  const citations = [];
  const unresolved = [];
  const cited = new Set();
  const groupRe = /\(([^()]*)\)/g;
  let m;
  while ((m = groupRe.exec(text))) {
    if (!new RegExp(`\\b${YEAR}`).test(m[1])) continue;
    const before = text.slice(0, m.index).replace(/\s+/g, " ").trimEnd();
    for (let part of m[1].split(/;\s*/)) {
      part = part.replace(/\s+/g, " ").trim().replace(/^(?:e\.g\.,|see also|see) /, "");
      const yearsOnly = part.match(new RegExp(`^(${YEAR}(?:, ${YEAR})*)$`));
      const withNames = part.match(new RegExp(`^(.+?), (${YEAR}(?:, ${YEAR})*)$`));
      if (yearsOnly) {
        for (const y of yearsOnly[1].split(", ")) {
          const hit = [...narr.entries()].find(([k]) => k.endsWith(`|${y}`) && before.endsWith(k.split("|")[0]));
          if (hit) { cited.add(hit[1]); citations.push({ text: `${hit[0].split("|")[0]} (${y})`, key: hit[1] }); }
          else unresolved.push(`${before.split(" ").slice(-4).join(" ")} (${y})`);
        }
      } else if (withNames) {
        for (const y of withNames[2].split(", ")) {
          const key = paren.get(`${withNames[1]}, ${y}`);
          if (key) { cited.add(key); citations.push({ text: `(${withNames[1]}, ${y})`, key }); }
          else unresolved.push(`(${withNames[1]}, ${y})`);
        }
      } else if (new RegExp(`\\b${YEAR}`).test(part)) {
        unresolved.push(`(${part})`);
      }
    }
  }
  const uncited = bib
    .filter((e) => !cited.has(e.key) && !clean(e.keywords).split(/[,;]\s*/).includes(FURTHER_READING))
    .map((e) => e.key);
  return { citations, unresolved, uncited };
}

function renderMd(entries) {
  const bib = formatBibliography(entries);
  const L = [];
  L.push("# References");
  L.push("");
  L.push("The research and standards that Penthera's [methodology](METHODOLOGY.md) and per-finding sources cite, in APA 7th edition style, grouped by topic and sorted alphabetically by first author within each group. The BibTeX source is [references.bib](references.bib); this page is generated from it by `node scripts/build-references.mjs`, and a test fails if the two drift or if a citation in METHODOLOGY.md does not resolve to an entry here.");
  L.push("");
  L.push("Every entry was checked against the publisher or standards body (Crossref DOI metadata, USENIX, NDSS, arXiv, the RFC Editor, OWASP, MITRE, OASIS, the EU Publications Office) on 2026-10-19. Entries that could not be verified were left out, and so were fields (pages, volume, issue, editors) that the publisher's metadata does not record. Each entry has an anchor named after its BibTeX key, for example [`#bau2010state`](#bau2010state), which is also the key reports and SARIF use.");
  const further = bib.filter((e) => clean(e.keywords).split(/[,;]\s*/).includes(FURTHER_READING));
  if (further.length) {
    L.push("");
    L.push("Entries marked † are further reading: they inform the work but are not cited in the methodology.");
  }
  L.push("");
  for (const [tag, heading] of TOPICS) {
    const group = bib.filter((e) => clean(e.note) === tag);
    if (!group.length) continue;
    L.push(`## ${heading}`);
    L.push("");
    for (const e of group) {
      const mark = further.includes(e) ? "† " : "";
      L.push(`<a id="${e.key}"></a>${mark}${e.apa}`);
      L.push("");
    }
  }
  return L.join("\n").replace(/\n+$/, "\n");
}

function build() {
  const entries = parseBib(readFileSync(BIB, "utf-8"));
  const current = JSON.parse(readFileSync(JSON_OUT, "utf-8"));
  const sources = {};
  for (const e of entries) {
    sources[e.key] = { cite: citeLabel(e), title: clean(e.title), url: linkFor(e) };
  }
  const json = JSON.stringify({ ...current, sources }, null, 2) + "\n";
  return { json, md: renderMd(entries), entries };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const { json, md } = build();
  if (process.argv.includes("--check")) {
    const stale = readFileSync(JSON_OUT, "utf-8") !== json || readFileSync(MD_OUT, "utf-8") !== md;
    if (stale) { console.error("references are stale: run node scripts/build-references.mjs"); process.exit(1); }
  } else {
    writeFileSync(JSON_OUT, json);
    writeFileSync(MD_OUT, md);
    console.log("wrote lib/references.json and docs/references.md");
  }
}
