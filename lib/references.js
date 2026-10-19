/**
 * Research and standards references for findings.
 *
 * lib/references.json maps each finding category to 1-3 keys of
 * docs/references.bib, and carries a short record for each key so reports can
 * cite without parsing BibTeX. Every entry was checked against the publisher or
 * standards body before it was added; see docs/references.md.
 */
import { readFileSync } from "node:fs";

const DATA = JSON.parse(readFileSync(new URL("./references.json", import.meta.url), "utf-8"));

export const SOURCES = DATA.sources;
export const CATEGORY_REFERENCES = DATA.categories;

/** Reference keys for a finding, by category. Unknown categories get []. */
export function referenceKeysFor(finding) {
  return CATEGORY_REFERENCES[finding?.category] || [];
}

/** Resolved source records ({ key, cite, title, url }) for a finding. */
export function referencesFor(finding) {
  return referenceKeysFor(finding)
    .map((key) => (SOURCES[key] ? { key, ...SOURCES[key] } : null))
    .filter(Boolean);
}

/** One-line Markdown list of sources, e.g. "[Weichselbaum et al. 2016](https://doi.org/...)". */
export function formatSourcesMarkdown(refs) {
  return refs.map((r) => `[${r.cite}](${r.url})`).join(" · ");
}
