#!/usr/bin/env node
/**
 * Regenerate lib/references.json "sources" and docs/references.md from
 * docs/references.bib, so the report citations and the rendered list can't
 * drift from the bibliography. The category -> keys map in references.json is
 * hand-maintained and kept as is.
 *
 *   node scripts/build-references.mjs          write both files
 *   node scripts/build-references.mjs --check  exit 1 if either is stale
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
];

/** Minimal BibTeX reader: enough for the flat, brace-delimited entries in references.bib. */
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
    entries.push({ type: m[1].toLowerCase(), key: m[2], ...fields });
    re.lastIndex = i;
  }
  return entries;
}

const ACCENTS = { "{\\'e}": "é", "{\\'a}": "á", '{\\"u}': "ü", "\\emph{": "" };
export function clean(s = "") {
  let out = s;
  for (const [k, v] of Object.entries(ACCENTS)) out = out.split(k).join(v);
  return out.replace(/[{}]/g, "").replace(/--/g, "-").replace(/\s+/g, " ").trim();
}

function authors(e) {
  return clean(e.author).split(/\s+and\s+/).map((a) => a.trim());
}

function surname(a) {
  return a.includes(",") ? a.split(",")[0].trim() : a;
}

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

function venue(e) {
  return clean(e.booktitle || e.journal || e.howpublished || e.institution || e.publisher || "");
}

function renderMd(entries) {
  const L = [];
  L.push("# References");
  L.push("");
  L.push("The research and standards Penthera's methodology and findings cite. The BibTeX source is [references.bib](references.bib); this page is generated from it by `node scripts/build-references.mjs`.");
  L.push("");
  L.push("Every entry was checked against the publisher or standards body (Crossref DOI metadata, USENIX, NDSS, arXiv, the RFC Editor, OWASP, MITRE, OASIS, the EU Publications Office) on 2026-10-19. Entries that could not be verified were left out. How each one is used is described in [METHODOLOGY.md](METHODOLOGY.md).");
  L.push("");
  for (const [tag, heading] of TOPICS) {
    const group = entries.filter((e) => clean(e.note) === tag);
    if (!group.length) continue;
    L.push(`## ${heading}`);
    L.push("");
    for (const e of group) {
      const as = authors(e).join("; ");
      const year = e.year ? ` (${e.year})` : "";
      L.push(`- \`${e.key}\`: ${as}${year}. *${clean(e.title)}*. ${venue(e)}. <${linkFor(e)}>`);
    }
    L.push("");
  }
  return L.join("\n");
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
