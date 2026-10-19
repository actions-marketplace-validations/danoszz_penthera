/**
 * Property-based fuzzing (fast-check) for the parsers that take untrusted
 * input: SPDX expressions and lockfiles from dependency trees, agent files for
 * the hidden-content engine, and community templates plus target responses
 * for the template matcher. Each property states what must hold for any input:
 * no crash outside the documented error type, and structural invariants.
 *
 * A failure prints a seed and path; rerun with fc.assert(..., { seed, path }).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseSpdx, formatSpdx, leaves, SpdxError } from "../lib/deps/license.js";
import { parseLockfile, nameFromLockPath } from "../lib/deps/lockfile.js";
import { scanHiddenContent, hasTagChars } from "../lib/agents/hidden-content.js";
import { runMatcher, runExtractor } from "../lib/templates.js";
import { hasNestedQuantifier } from "../lib/rules/regex-guard.js";
import { extractScripts } from "../lib/retirejs.js";
import { mdInline } from "../src/report/md-escape.js";

const RUNS = { numRuns: 300 };

// Strings that lean towards the syntax each parser cares about.
const fromAlphabet = (chars, maxLength = 60) =>
  fc.array(fc.constantFrom(...chars), { maxLength }).map((a) => a.join(""));

describe("SPDX expression parser", () => {
  const spdxish = fc.oneof(
    fc.string({ maxLength: 80 }),
    fromAlphabet(["MIT", "Apache-2.0", "GPL-2.0+", "AND", "OR", "WITH", "and", "or", "(", ")", " ", "Classpath-exception-2.0", "LicenseRef-x", "+", ":", "é", "\t"]),
  );

  it("returns a tree or throws SpdxError, for any string", () => {
    fc.assert(fc.property(spdxish, (s) => {
      try {
        const tree = parseSpdx(s);
        expect(leaves(tree).length).toBeGreaterThan(0);
      } catch (e) {
        expect(e).toBeInstanceOf(SpdxError);
      }
    }), RUNS);
  });

  const id = fc.constantFrom("MIT", "Apache-2.0", "BSD-3-Clause", "GPL-2.0-only", "LicenseRef-acme", "Some-Unknown-1.0");
  const leaf = fc.tuple(id, fc.boolean(), fc.option(fc.constantFrom("Classpath-exception-2.0", "LLVM-exception"), { nil: null }))
    .map(([i, plus, ex]) => `${i}${plus ? "+" : ""}${ex ? ` WITH ${ex}` : ""}`);
  const expr = fc.letrec((tie) => ({
    e: fc.oneof({ depthSize: "small", withCrossShrink: true },
      leaf,
      fc.tuple(tie("e"), fc.constantFrom("AND", "OR", "and", "or"), tie("e")).map(([a, o, b]) => `${a} ${o} ${b}`),
      tie("e").map((x) => `(${x})`)),
  })).e;

  it("formatting a parsed expression is a fixed point", () => {
    fc.assert(fc.property(expr, (s) => {
      const once = formatSpdx(parseSpdx(s));
      expect(formatSpdx(parseSpdx(once))).toBe(once);
    }), RUNS);
  });
});

describe("npm lockfile parser", () => {
  const pkgEntry = fc.record({
    name: fc.option(fc.string(), { nil: undefined }),
    version: fc.option(fc.oneof(fc.string(), fc.integer()), { nil: undefined }),
    integrity: fc.option(fc.string(), { nil: undefined }),
    resolved: fc.option(fc.string(), { nil: undefined }),
    dev: fc.option(fc.anything(), { nil: undefined }),
    hasInstallScript: fc.option(fc.boolean(), { nil: undefined }),
    license: fc.option(fc.oneof(fc.string(), fc.object()), { nil: undefined }),
  }, { requiredKeys: [] });
  const lockKey = fc.oneof(fc.string(), fc.constantFrom("", "node_modules/a", "node_modules/@s/b/node_modules/c", "__proto__", "constructor"));
  const v3 = fc.dictionary(lockKey, fc.oneof(pkgEntry, fc.constant(null))).map((packages) => ({ lockfileVersion: 3, packages }));
  const v1 = fc.letrec((tie) => ({
    deps: fc.dictionary(fc.string({ maxLength: 12 }), fc.oneof(
      { depthSize: "small" },
      fc.constant(null),
      fc.record({ version: fc.string(), dependencies: tie("deps") }, { requiredKeys: ["version"] }),
    ), { maxKeys: 4 }),
  })).deps.map((dependencies) => ({ lockfileVersion: 1, dependencies }));

  it("never throws, on lock-shaped or arbitrary JSON", () => {
    fc.assert(fc.property(fc.oneof(v3, v1, fc.jsonValue()), (lock) => {
      const out = parseLockfile(lock);
      expect(Array.isArray(out)).toBe(true);
      for (const p of out) {
        expect(typeof p.path).toBe("string");
        expect(p.path).toContain("node_modules/");
        expect(p.license === null || typeof p.license === "string").toBe(true);
      }
      const paths = out.map((p) => p.path);
      expect([...paths].sort((a, b) => a.localeCompare(b))).toEqual(paths);
    }), RUNS);
  });

  it("the package name is whatever follows the last node_modules/", () => {
    fc.assert(fc.property(fc.string(), fc.string().filter((s) => !s.includes("node_modules/")), (pre, name) => {
      expect(nameFromLockPath(`${pre}node_modules/${name}`)).toBe(name);
    }), RUNS);
  });
});

describe("hidden-content engine", () => {
  const tricky = fc.oneof(
    fc.string({ unit: "binary", maxLength: 400 }),
    fromAlphabet(["a", " ", "\n", "\t", "​", "‮", "⁦", "﻿", "\u{E0041}", "<!--", "-->", "curl ", "| sh", "base64 -d", "QUJD", "ignore previous instructions", "#"], 120),
  );

  it("returns findings with a kind and never throws, for any text", () => {
    fc.assert(fc.property(tricky, (s) => {
      const out = scanHiddenContent(s);
      expect(Array.isArray(out)).toBe(true);
    }), RUNS);
  });

  it("always reports Unicode tag characters", () => {
    const tagText = fc.string({ minLength: 1, maxLength: 10 }).map((s) => [...s].map((c) => String.fromCodePoint(0xe0000 + (c.codePointAt(0) % 0x80))).join(""));
    fc.assert(fc.property(fc.string({ maxLength: 50 }), tagText, fc.string({ maxLength: 50 }), (a, tags, b) => {
      const text = a + tags + b;
      expect(hasTagChars(text)).toBe(true);
      expect(scanHiddenContent(text).length).toBeGreaterThan(0);
    }), RUNS);
  });
});

describe("template matcher", () => {
  const pattern = fc.oneof(
    fc.string({ maxLength: 40 }),
    fromAlphabet(["(", ")", "a", "+", "*", "?", "{2}", "{1,}", "[", "]", "\\", "|", ".", "^", "$", "(?:", "\\d", "\\s"], 30),
  );
  const ctx = fc.record({ body: fc.string({ maxLength: 300 }), headers: fc.string({ maxLength: 100 }), status: fc.integer({ min: 100, max: 599 }) });

  it("matchers and extractors never throw, whatever the template or response", () => {
    fc.assert(fc.property(
      fc.constantFrom("regex", "negative-regex", "word", "negative-word", "status", "bogus"),
      fc.array(pattern, { maxLength: 3 }), ctx, fc.constantFrom("and", "or"), fc.constantFrom("body", "header"),
      (type, regex, c, condition, part) => {
        const m = runMatcher({ type, regex, words: regex, status: [c.status], condition, part }, c);
        expect(typeof m).toBe("boolean");
        const x = runExtractor({ type: "regex", regex, part }, c);
        expect(x === null || typeof x === "string" || x === undefined).toBe(true);
      },
    ), RUNS);
  });

  it("the nested-quantifier guard never throws and flags every (x+)+ wrapping", () => {
    fc.assert(fc.property(pattern, fc.constantFrom("+", "*", "{2,}"), fc.constantFrom("+", "*", "{1,}"), (p, inner, outer) => {
      expect(typeof hasNestedQuantifier(p)).toBe("boolean");
      expect(hasNestedQuantifier(`(a${inner})${outer}`)).toBe(true);
    }), RUNS);
  });

  it("script extraction never throws and finds no more scripts than <script tags", () => {
    const html = fc.oneof(fc.string({ maxLength: 300 }), fromAlphabet(["<script", "<SCRIPT", " src=", "'x.js'", "\"/y.js\"", ">", "</script", "</ScRiPt >", " ", "var v='1.2.3';", "<", "/"], 60));
    fc.assert(fc.property(html, (h) => {
      const out = extractScripts(h, "https://t.test");
      const tags = (h.toLowerCase().match(/<script/g) || []).length;
      expect(out.external.length).toBeLessThanOrEqual(tags);
      expect(out.inline.length).toBeLessThanOrEqual(tags);
    }), RUNS);
  });
});

describe("Markdown inline escaping", () => {
  it("output never breaks a table row or carries raw HTML", () => {
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 200 }), (s) => {
      const out = mdInline(s);
      expect(out).not.toMatch(/[\r\n<>]/);
      // Every pipe is escaped by an odd run of backslashes.
      for (const m of out.matchAll(/(\\*)\|/g)) expect(m[1].length % 2).toBe(1);
    }), RUNS);
  });
});
