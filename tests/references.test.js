/**
 * Per-finding research citations: data integrity, and that they reach the
 * Markdown report and SARIF.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { CATEGORY_REFERENCES, SOURCES, referencesFor, referenceKeysFor } from "../lib/references.js";
import { parseBib, formatApa, formatBibliography, sentenceCase, checkCitations, initials } from "../scripts/build-references.mjs";
import { FINDING_WSTG } from "../lib/owasp-wstg.js";
import { formatMarkdownReport } from "../src/report/markdown.js";
import { writeSarifReport } from "../src/reporter.js";
import { buildActionPlan, formatActionPlanMarkdown } from "../lib/remediation/index.js";

const bib = parseBib(readFileSync(new URL("../docs/references.bib", import.meta.url), "utf-8"));
const bibKeys = new Set(bib.map((e) => e.key));

describe("references data", () => {
  it("maps every category to 1-3 keys that exist in references.bib", () => {
    for (const [cat, keys] of Object.entries(CATEGORY_REFERENCES)) {
      expect(keys.length, cat).toBeGreaterThanOrEqual(1);
      expect(keys.length, cat).toBeLessThanOrEqual(3);
      for (const k of keys) expect(bibKeys.has(k), `${cat} -> ${k}`).toBe(true);
    }
  });

  it("covers every WSTG finding category and the main remediation categories", () => {
    const required = [
      ...Object.keys(FINDING_WSTG),
      "headers", "transport", "email-auth", "js-vulnerability", "disclosure", "injection",
    ];
    for (const cat of required) expect(referenceKeysFor({ category: cat }).length, cat).toBeGreaterThan(0);
  });

  it("gives every bib entry a DOI or URL, a title, a year or urldate, and a topic", () => {
    for (const e of bib) {
      expect(e.doi || e.url, e.key).toBeTruthy();
      expect(e.title, e.key).toBeTruthy();
      expect(e.year || e.urldate, e.key).toBeTruthy();
      expect(e.note, e.key).toMatch(/^(blackbox|design|threatmodel|supplychain|secrets|web|llm|standards)$/);
    }
  });

  it("has generated sources and references.md in sync with the bib", () => {
    expect(Object.keys(SOURCES).sort()).toEqual([...bibKeys].sort());
    expect(() => execFileSync(process.execPath, ["scripts/build-references.mjs", "--check"], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
    })).not.toThrow();
  });

  it("cites every finding category the code emits, deps, license and machine audit included (360 review)", () => {
    const emitted = new Set();
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(m?js)$/.test(e.name)) for (const m of readFileSync(p, "utf-8").matchAll(/category: "([a-z0-9-]+)"/g)) emitted.add(m[1]);
      }
    };
    walk(new URL("../lib", import.meta.url).pathname);
    walk(new URL("../src", import.meta.url).pathname);
    for (const cat of ["dependency-risk", "license", "machine-integrity", "rootkit"]) expect(emitted.has(cat), cat).toBe(true);
    const missing = [...emitted].filter((cat) => referenceKeysFor({ category: cat }).length === 0);
    expect(missing).toEqual([]);
  });

  it("gives license findings their own remediation, not the generic fallback", () => {
    const plan = buildActionPlan([{ severity: "high", category: "license", title: "copyleft@1.0.0: AGPL-3.0-or-later is not allowed", package: "copyleft" }]);
    expect(plan[0]).toMatchObject({ id: "license", ownerAction: true });
    expect(plan[0].references).toEqual(["spdxlicenselist"]);
  });

  it("returns [] for unknown categories", () => {
    expect(referencesFor({ category: "no-such-thing" })).toEqual([]);
    expect(referencesFor({})).toEqual([]);
  });
});

describe("APA 7 reference formatter", () => {
  const one = (bibtex) => parseBib(bibtex)[0];

  it("formats a journal article: italic journal and volume, issue, pages, DOI", () => {
    const e = one(`@article{a, author = {Saltzer, J. H. and Schroeder, M. D.}, title = {The Protection of Information in Computer Systems},
      journal = {Proceedings of the IEEE}, volume = {63}, number = {9}, year = {1975}, pages = {1278--1308}, doi = {10.1109/PROC.1975.9939}}`);
    expect(formatApa(e)).toBe(
      "Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE*, *63*(9), 1278–1308. <https://doi.org/10.1109/PROC.1975.9939>",
    );
  });

  it("formats a conference paper with \"In\", editors, pages and publisher", () => {
    const e = one(`@inproceedings{c, author = {Kocher, Paul C.}, title = {Timing Attacks on Implementations of {Diffie-Hellman}, {RSA}, {DSS}, and Other Systems},
      booktitle = {Advances in Cryptology -- CRYPTO '96}, editor = {Koblitz, Neal}, publisher = {Springer}, year = {1996}, pages = {104--113}, doi = {10.1007/3-540-68697-5_9}}`);
    expect(formatApa(e)).toBe(
      "Kocher, P. C. (1996). Timing attacks on implementations of Diffie-Hellman, RSA, DSS, and other systems. In N. Koblitz (Ed.), *Advances in Cryptology – CRYPTO '96* (pp. 104–113). Springer. <https://doi.org/10.1007/3-540-68697-5_9>",
    );
    const proc = one(`@inproceedings{p, author = {Meli, Michael and McNiece, Matthew R. and Reaves, Bradley}, title = {How Bad Can It {Git}? Characterizing Secret Leakage in Public {GitHub} Repositories},
      booktitle = {Proceedings 2019 Network and Distributed System Security Symposium}, publisher = {Internet Society}, year = {2019}, doi = {10.14722/ndss.2019.23418}}`);
    expect(formatApa(proc)).toBe(
      "Meli, M., McNiece, M. R., & Reaves, B. (2019). How bad can it Git? Characterizing secret leakage in public GitHub repositories. In *Proceedings 2019 Network and Distributed System Security Symposium*. Internet Society. <https://doi.org/10.14722/ndss.2019.23418>",
    );
  });

  it("formats a book with an italic sentence-case title", () => {
    const e = one(`@book{b, author = {Shostack, Adam}, title = {Threat Modeling: Designing for Security}, publisher = {Wiley}, year = {2014}, url = {https://example.org/tm}}`);
    expect(formatApa(e)).toBe("Shostack, A. (2014). *Threat modeling: Designing for security*. Wiley. <https://example.org/tm>");
  });

  it("formats a web page with a corporate author, full date, site name and retrieval date", () => {
    const e = one(`@misc{w, author = {{OWASP Foundation}}, title = {{OWASP Top 10} for {LLM} Applications 2025}, organization = {OWASP Gen AI Security Project},
      year = {2024}, month = nov, day = {17}, url = {https://genai.owasp.org/x/}, urldate = {2026-10-19}}`);
    expect(formatApa(e)).toBe(
      "OWASP Foundation. (2024, November 17). *OWASP Top 10 for LLM applications 2025*. OWASP Gen AI Security Project. Retrieved October 19, 2026, from <https://genai.owasp.org/x/>",
    );
  });

  it("omits the site name when it equals the corporate author, and uses n.d. without a year", () => {
    const e = one(`@misc{m, author = {{The MITRE Corporation}}, title = {{CWE}: {Common Weakness Enumeration}}, howpublished = {The MITRE Corporation},
      url = {https://cwe.mitre.org/}, urldate = {2026-10-19}}`);
    expect(formatApa(e)).toBe("The MITRE Corporation. (n.d.). *CWE: Common Weakness Enumeration*. Retrieved October 19, 2026, from <https://cwe.mitre.org/>");
  });

  it("lists three or more authors with a serial comma and ampersand, and hyphenated initials", () => {
    const e = one(`@inproceedings{z, author = {Zimmermann, Markus and Staicu, Cristian-Alexandru and Tenny, Cam and Pradel, Michael},
      title = {Small World with High Risks: A Study of Security Threats in the npm Ecosystem}, booktitle = {28th USENIX Security Symposium (USENIX Security 19)},
      publisher = {USENIX Association}, year = {2019}, pages = {995--1010}, url = {https://www.usenix.org/z}}`);
    expect(formatApa(e)).toBe(
      "Zimmermann, M., Staicu, C.-A., Tenny, C., & Pradel, M. (2019). Small world with high risks: A study of security threats in the npm ecosystem. In *28th USENIX Security Symposium (USENIX Security 19)* (pp. 995–1010). USENIX Association. <https://www.usenix.org/z>",
    );
    expect(formatBibliography([e])[0]).toMatchObject({ parenthetical: "(Zimmermann et al., 2019)", narrativeCite: "Zimmermann et al. (2019)" });
  });

  it("formats RFCs, NIST reports and arXiv preprints as reports", () => {
    const rfc = one(`@misc{r, author = {Lodderstedt, T. and Bradley, J. and Labunets, A. and Fett, D.}, title = {Best Current Practice for {OAuth} 2.0 Security},
      howpublished = {RFC 9700, BCP 240, RFC Editor}, year = {2025}, month = jan, doi = {10.17487/RFC9700}}`);
    expect(formatApa(rfc)).toBe("Lodderstedt, T., Bradley, J., Labunets, A., & Fett, D. (2025). *Best current practice for OAuth 2.0 security* (RFC 9700, BCP 240). RFC Editor. <https://doi.org/10.17487/RFC9700>");
    const nist = one(`@techreport{n, author = {Scarfone, K. A.}, title = {Technical Guide to Information Security Testing and Assessment},
      institution = {National Institute of Standards and Technology}, type = {NIST Special Publication}, number = {800-115}, year = {2008}, doi = {10.6028/NIST.SP.800-115}}`);
    expect(formatApa(nist)).toBe("Scarfone, K. A. (2008). *Technical guide to information security testing and assessment* (NIST Special Publication 800-115). National Institute of Standards and Technology. <https://doi.org/10.6028/NIST.SP.800-115>");
    const arxiv = one(`@misc{x, author = {Perez, F{\\'a}bio and Ribeiro, Ian}, title = {Ignore Previous Prompt: Attack Techniques For Language Models},
      year = {2022}, archivePrefix = {arXiv}, doi = {10.48550/arXiv.2211.09527}}`);
    expect(formatApa(arxiv)).toBe("Perez, F., & Ribeiro, I. (2022). *Ignore previous prompt: Attack techniques for language models* [Preprint]. arXiv. <https://doi.org/10.48550/arXiv.2211.09527>");
  });

  it("sentence-cases titles but keeps braced groups and acronyms", () => {
    expect(sentenceCase("{CSP} Is Dead, Long Live {CSP}! On the Insecurity of Whitelists")).toBe("CSP is dead, long live CSP! On the insecurity of whitelists");
    expect(sentenceCase("{in-toto}: Providing Farm-to-Table Guarantees")).toBe("in-toto: Providing farm-to-table guarantees");
    expect(sentenceCase("25 Million Flows Later: Large-scale Detection of {DOM}-based {XSS}")).toBe("25 million flows later: Large-scale detection of DOM-based XSS");
    expect(initials("A H M Nazmus")).toBe("A. H. M. N.");
  });

  it("sorts by first author's surname and adds year suffixes to same-author, same-year works", () => {
    const entries = parseBib(`
      @misc{b, author = {{OWASP Foundation}}, title = {{OWASP Top 10}:2025}, year = {2025}, url = {https://x/b}}
      @misc{a, author = {{OWASP Foundation}}, title = {{OWASP MCP Top 10}}, year = {2025}, url = {https://x/a}}
      @book{c, author = {Abel, Ann}, title = {First}, publisher = {P}, year = {2020}, url = {https://x/c}}
      @misc{d, author = {{The MITRE Corporation}}, title = {Thing}, url = {https://x/d}}`);
    const out = formatBibliography(entries);
    expect(out.map((e) => e.key)).toEqual(["c", "d", "a", "b"]);
    expect(out.find((e) => e.key === "a").parenthetical).toBe("(OWASP Foundation, 2025a)");
    expect(out.find((e) => e.key === "b").apa).toContain("(2025b).");
  });

  it("sorts every topic group of references.md alphabetically, APA style", () => {
    const md = readFileSync(new URL("../docs/references.md", import.meta.url), "utf-8");
    for (const section of md.split(/^## /m).slice(1)) {
      const keys = [...section.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]);
      const expected = formatBibliography(bib.filter((e) => keys.includes(e.key))).map((e) => e.key);
      expect(keys, section.split("\n")[0]).toEqual(expected);
    }
  });
});

describe("METHODOLOGY.md in-text citations", () => {
  const methodology = readFileSync(new URL("../docs/METHODOLOGY.md", import.meta.url), "utf-8");

  it("resolves every APA in-text citation to a reference, and cites every reference or marks it further reading", () => {
    const { citations, unresolved, uncited } = checkCitations(methodology, bib);
    expect(citations.length).toBeGreaterThan(40);
    expect(unresolved).toEqual([]);
    expect(uncited).toEqual([]);
  });

  it("catches a citation with no reference and a reference that is never cited", () => {
    const entries = parseBib(`@book{k, author = {Knuth, Donald}, title = {T}, publisher = {P}, year = {1968}, url = {https://x}}
      @book{u, author = {Unused, Una}, title = {U}, publisher = {P}, year = {2000}, url = {https://x}, keywords = {further-reading}}
      @book{v, author = {Vague, Val}, title = {V}, publisher = {P}, year = {2001}, url = {https://x}}`);
    const r = checkCitations("As Knuth (1968) and (Knuth, 1969) say; see [x](a/2020/b) and `(Nobody, 2000)`.", entries);
    expect(r.citations.map((c) => c.key)).toEqual(["k"]);
    expect(r.unresolved).toEqual(["(Knuth, 1969)"]);
    expect(r.uncited).toEqual(["v"]);
  });

  it("keeps the How to cite block in step with CITATION.cff", () => {
    const cff = readFileSync(new URL("../CITATION.cff", import.meta.url), "utf-8");
    const version = cff.match(/^version:\s*"?([^"\s]+)"?/m)[1];
    expect(methodology).toContain(`(Version ${version}) [Computer software]`);
    expect(methodology).toContain(`version = {${version}}`);
    expect(methodology).toContain("https://github.com/danoszz/penthera");
  });
});

const result = {
  target: "http://127.0.0.1:1",
  timestamp: "2026-10-19T00:00:00.000Z",
  findings: [
    { severity: "medium", title: "Missing Content-Security-Policy", category: "headers", source: "header-audit", confidence: "confirmed", url: "http://127.0.0.1:1/" },
    { severity: "critical", title: "AWS access key in source", category: "secrets", source: "secret-scan", confidence: "confirmed", url: "src/aws.js" },
  ],
};

describe("references in reports", () => {
  it("adds a Why this matters / Sources line to the Markdown report", () => {
    const md = formatMarkdownReport(result);
    expect(md).toContain("Why this matters / Sources: [Weichselbaum et al. 2016](https://doi.org/10.1145/2976749.2978363)");
    expect(md).toContain("[Meli et al. 2019](https://doi.org/10.14722/ndss.2019.23418)");
  });

  it("adds Sources to action-plan items", () => {
    const md = formatActionPlanMarkdown(buildActionPlan(result.findings));
    expect(md).toMatch(/\*\*Sources:\*\* \[Meli et al\. 2019\]/);
  });

  it("sets helpUri, help and properties.references on SARIF rules", () => {
    const file = join(mkdtempSync(join(tmpdir(), "penthera-refs-")), "out.sarif");
    writeSarifReport(result, file);
    const rules = JSON.parse(readFileSync(file, "utf-8")).runs[0].tool.driver.rules;
    const headers = rules.find((r) => r.id === "headers");
    expect(headers.helpUri).toBe("https://doi.org/10.1145/2976749.2978363");
    expect(headers.help.markdown).toContain("Weichselbaum et al. 2016");
    expect(headers.help.text).toMatch(/^Sources: /);
    expect(headers.properties.references).toEqual(["weichselbaum2016csp", "hodges2012rfc6797", "owaspwstg42"]);
  });

  it("leaves SARIF rules without references untouched", () => {
    const file = join(mkdtempSync(join(tmpdir(), "penthera-refs-")), "out.sarif");
    writeSarifReport({ ...result, findings: [{ severity: "low", title: "x", category: "unmapped" }] }, file);
    const [rule] = JSON.parse(readFileSync(file, "utf-8")).runs[0].tool.driver.rules;
    expect(rule.helpUri).toBeUndefined();
    expect(rule.help).toBeUndefined();
    expect(rule.properties.references).toBeUndefined();
  });
});
