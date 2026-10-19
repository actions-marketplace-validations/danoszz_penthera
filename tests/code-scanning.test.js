/**
 * Regressions for the GitHub code-scanning alerts fixed in one batch:
 * polynomial ReDoS in the template guard, incomplete Markdown escaping,
 * and regex-based <script> extraction.
 */
import { describe, it, expect } from "vitest";
import { hasNestedQuantifier } from "../lib/rules/regex-guard.js";
import { runMatcher, runExtractor } from "../lib/templates.js";
import { mdInline } from "../src/report/md-escape.js";
import { formatQuestionnaireMarkdown } from "../lib/compliance/questionnaire.js";
import { formatMarkdownReport } from "../src/report/markdown.js";
import { extractScripts } from "../lib/retirejs.js";

const elapsed = (fn) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

describe("template regex guard (js/polynomial-redos)", () => {
  it("still refuses nested quantifiers", () => {
    for (const p of ["(a+)+", "(\\w*\\s?)*", "((ab)+c)*", "(?:x+){2,}", "a+*"]) {
      expect(hasNestedQuantifier(p), p).toBe(true);
    }
    for (const p of ["a+b*", "(abc)+", "[a+]+", "\\(a+\\)+", "version\\s*[:=]\\s*([0-9.]+)"]) {
      expect(hasNestedQuantifier(p), p).toBe(false);
    }
  });

  it("stays linear on hostile pattern strings", () => {
    // The old guard was itself a backtracking regex; these took seconds.
    const hostile = ["(".repeat(50_000), "(" + "a+".repeat(25_000), "[".repeat(50_000) + "]+".repeat(10), "(+".repeat(30_000)];
    for (const p of hostile) expect(elapsed(() => hasNestedQuantifier(p))).toBeLessThan(250);
  });

  it("refuses a catastrophic template regex instead of running it on a hostile body", () => {
    const body = "a".repeat(40) + "!";
    const ms = elapsed(() => {
      expect(runMatcher({ type: "regex", regex: ["^(a+)+$"] }, { body, headers: "", status: 200 })).toBe(false);
      expect(runExtractor({ type: "regex", regex: ["(a|a+)+$"] }, { body, headers: "" })).toBe(null);
    });
    expect(ms).toBeLessThan(250);
  });

  it("still matches and extracts with ordinary patterns", () => {
    const ctx = { body: "server: nginx/1.25.3", headers: "", status: 200 };
    expect(runMatcher({ type: "regex", regex: ["nginx/[0-9.]+"] }, ctx)).toBe(true);
    expect(runExtractor({ type: "regex", regex: ["nginx/([0-9.]+)"], group: 1 }, ctx)).toBe("1.25.3");
    // An invalid pattern from a template is skipped, not thrown (found by tests/fuzz.test.js).
    expect(runExtractor({ type: "regex", regex: ["(", "nginx/([0-9.]+)"], group: 1 }, ctx)).toBe("1.25.3");
  });
});

describe("Markdown escaping (js/incomplete-sanitization)", () => {
  it("escapes backslash before pipe, so `\\|` cannot close the cell", () => {
    expect(mdInline("a\\|b")).toBe("a\\\\\\|b");
    expect(mdInline("x | y\nz<b>")).toBe("x \\| y z&lt;b&gt;");
  });

  it("questionnaire rows keep their column count with hostile text", () => {
    const md = formatQuestionnaireMarkdown({
      total: 1,
      summary: { answered: 0, needsHuman: 1 },
      answers: [{ question: "Do you\\| MFA? | <img src=x>\n- injected", answer: "NEEDS HUMAN INPUT", measure: null }],
    });
    const row = md.split("\n").find((l) => l.startsWith("| Do you"));
    expect(row.split(/(?<!\\)\|/).length).toBe(5); // 3 cells between 4 unescaped pipes
    expect(md).not.toContain("<img");
    expect(md).not.toMatch(/^- injected/m);
  });

  it("report tables escape backslashes in finding text", () => {
    const md = formatMarkdownReport({
      target: "https://example.test",
      findings: [{ severity: "high", title: "t\\| <script>", category: "x", detail: "d" }],
    });
    expect(md).not.toContain("<script>");
    expect(md).not.toMatch(/t\\\| /);
  });
});

describe("script extraction (js/bad-tag-filter)", () => {
  const base = "https://t.test";
  it("handles case, attributes and junk in closing tags", () => {
    const html = [
      '<SCRIPT type="text/javascript" SRC="/a.js"></SCRIPT >',
      "<script src=//cdn.test/jquery-3.4.1.min.js defer></script foo=bar>",
      "<script>\n var jQueryVersion = '1.12.4';\n</script\t\n>",
      "<scripts>not a script</scripts>",
      "<ScRiPt data-x='>'>window.angularVersion = '1.5.0';</sCrIpT>",
    ].join("\n");
    const out = extractScripts(html, base);
    expect(out.external).toEqual([`${base}/a.js`, "https://cdn.test/jquery-3.4.1.min.js"]);
    expect(out.inline.map((s) => s.trim())).toEqual([
      "var jQueryVersion = '1.12.4';",
      "window.angularVersion = '1.5.0';",
    ]);
  });

  it("an unclosed script runs to end of input, and nothing hangs", () => {
    expect(extractScripts("<script>var a = 'xxxxxxxxxxxx';", base).inline).toHaveLength(1);
    const big = "<script ".repeat(20_000) + "</script".repeat(20_000);
    expect(elapsed(() => extractScripts(big, base))).toBeLessThan(500);
  });
});

describe("Python lockfile shapes (found by tests/fuzz.test.js)", async () => {
  const { parsePythonInput } = await import("../lib/deps/python/lockfiles.js");
  it("a Pipfile.lock that is not an object is an Error, not a TypeError", () => {
    for (const text of ["null", "1", "[]", '"x"']) {
      expect(() => parsePythonInput(text, "Pipfile.lock", "/nonexistent")).toThrow(/not a JSON object/);
    }
  });
  it("a TOML lockfile whose package key is not an array has no packages", () => {
    for (const kind of ["uv.lock", "poetry.lock", "pdm.lock"]) {
      expect(parsePythonInput('package = "x"\n', kind, "/nonexistent").packages).toEqual([]);
    }
  });
});
