/**
 * Safety of the --report-template engine: no prototype access, no code, no
 * includes, values cannot inject template syntax, Markdown structure or HTML,
 * and seeded fuzzing never produces anything but output or a TemplateError.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderTemplate, parseTemplate, escapeValue, TemplateError } from "../src/report/template.js";

// Seeded PRNG so a fuzz failure reproduces.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

const NASTY = [
  "{{", "}}", "{{summary.critical}}", "{{#each findings}}", "{{/each}}", "{{> x}}", "{{{raw}}}",
  "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "\"", "'", "&amp;", "|", "\n", "\r\n",
  "# heading", "- list", "1. item", "> quote", "```", "`", "[link](javascript:alert(1))", "![img](http://x)",
  "*", "_", "~", "\\", "\u0000", "\u001b[31m", " ", "__proto__", "constructor", "${process.exit()}",
];

function randomValue(r) {
  let s = "";
  const n = 1 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) s += r() < 0.6 ? pick(r, NASTY) : String.fromCharCode(32 + Math.floor(r() * 95));
  return s;
}

afterEach(() => {
  expect(Object.prototype.polluted).toBeUndefined();
  expect({}.constructor).toBe(Object);
});

describe("template syntax", () => {
  it("renders values, loops, @index, this and else", () => {
    const out = renderTemplate(
      "{{title}}: {{#each items}}{{@index}}={{this}}{{#if @index}}!{{/if}} {{/each}}{{#if none}}y{{else}}n{{/if}}",
      { title: "T", items: ["a", "b"] },
    );
    expect(out).toBe("T: 0=a 1=b! n");
  });

  it("looks names up in enclosing scopes and treats empty arrays as false", () => {
    expect(renderTemplate("{{#each xs}}{{name}}-{{target}};{{/each}}{{#if empty}}x{{/if}}", {
      target: "t", xs: [{ name: "a" }, { name: "b", target: "own" }], empty: [],
    })).toBe("a-t;b-own;");
  });

  it("prints nothing for objects, arrays, functions and missing values", () => {
    expect(renderTemplate("[{{o}}][{{a}}][{{f}}][{{missing.deep.path}}]", { o: { x: 1 }, a: [1], f: () => "ran" })).toBe("[][][][]");
  });

  it("reports syntax errors with a line number", () => {
    expect(() => parseTemplate("ok\n\n{{#if x}}")).toThrow(/Unclosed \{\{#if\}\} \(line 3\)/);
    expect(() => parseTemplate("{{/each}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{#each a}}{{/if}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{else}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{#if a}}{{else}}{{else}}{{/if}}")).toThrow(TemplateError);
  });
});

describe("no prototype access", () => {
  const forbidden = [
    "{{__proto__}}", "{{constructor}}", "{{prototype}}", "{{a.__proto__}}", "{{a.constructor.constructor}}",
    "{{this.__proto__.polluted}}", "{{#each __proto__}}{{/each}}", "{{#if constructor}}x{{/if}}",
    "{{#each findings}}{{constructor.name}}{{/each}}", "{{summary.__proto__.toString}}",
  ];
  for (const t of forbidden) {
    it(`rejects ${t}`, () => {
      expect(() => renderTemplate(t, { a: {}, findings: [{}], summary: {} })).toThrow(/not allowed/);
    });
  }

  it("never reads inherited properties", () => {
    const data = { a: {}, list: [1, 2], s: "str" };
    const out = renderTemplate("{{toString}}{{valueOf}}{{hasOwnProperty}}{{a.toString}}{{list.map}}{{list.push}}{{s.length}}{{a.isPrototypeOf}}", data);
    expect(out).toBe("");
    expect(renderTemplate("{{list.length}} {{list.0}}", data)).toBe("2 1");
  });

  it("does not follow getters on the prototype chain of a class instance", () => {
    class Secret { get leak() { return "LEAK"; } }
    expect(renderTemplate("{{x.leak}}", { x: new Secret() })).toBe("");
  });
});

describe("no code, helpers or includes", () => {
  for (const t of [
    "{{> partial}}", "{{>partial}}", "{{include \"/etc/passwd\"}}", "{{lookup a b}}", "{{a b}}", "{{{raw}}}",
    "{{&raw}}", "{{!comment}}", "{{a + 1}}", "{{a()}}", "{{process.exit()}}", "{{#with a}}{{/with}}",
    "{{#each a as |x|}}{{/each}}", "{{a[0]}}", "{{../a}}", "{{@root.a}}", "{{require('fs')}}", "{{=<% %>=}}",
  ]) {
    it(`rejects ${t}`, () => {
      expect(() => parseTemplate(t)).toThrow(TemplateError);
    });
  }
});

describe("values are escaped", () => {
  it("a value with template syntax prints as text", () => {
    const out = renderTemplate("{{title}} / {{secret}}", { title: "{{secret}}", secret: "s3cr3t" });
    expect(out).toBe("\\{\\{secret\\}\\} / s3cr3t");
  });

  it("a value cannot open HTML, a heading, a list or a table cell", () => {
    expect(escapeValue("<b onclick=\"x\">'")).toBe("&lt;b onclick=&quot;x&quot;&gt;&#39;");
    expect(escapeValue("a\n# h\n- l")).toBe("a \\# h - l");
    expect(escapeValue("# h")).toBe("\\# h");
    expect(escapeValue("- l")).toBe("\\- l");
    expect(escapeValue("1. l")).toBe("1\\. l");
    expect(escapeValue("a|b")).toBe("a\\|b");
    expect(escapeValue("[x](javascript:alert(1))")).toBe("\\[x\\]\\(javascript:alert\\(1\\)\\)");
    expect(escapeValue("\u001b[31mred\u0000")).toBe("\\[31mred");
    expect(escapeValue(7)).toBe("7");
    expect(escapeValue(false)).toBe("false");
  });

  it("fuzz: 2,000 random hostile values never break out of their slot", () => {
    const r = rng(0xC0FFEE);
    const tpl = parseTemplate("| {{v}} |\n{{#each list}}* {{this}}\n{{/each}}");
    for (let i = 0; i < 2000; i++) {
      const v = randomValue(r);
      const list = [randomValue(r), randomValue(r)];
      const out = renderTemplate(tpl, { v, list });
      const lines = out.split("\n");
      expect(lines.length).toBe(4); // 1 row + 2 items + trailing newline: values add no lines
      expect(lines[0].startsWith("| ") && lines[0].endsWith(" |")).toBe(true);
      const slots = [lines[0].slice(2, -2), lines[1].slice(2), lines[2].slice(2)];
      for (const slot of slots) {
        expect(slot).not.toMatch(/[<>"'\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/);
        // Every Markdown-active character is backslash-escaped (HTML entities aside).
        expect(slot.replace(/&(?:#\d+|[a-z]+);/g, "").replace(/\\[\s\S]/g, "")).not.toMatch(/[\\`*_[\]{}()#!~|]/);
      }
    }
  });

  it("fuzz: 3,000 random templates either render or throw TemplateError", () => {
    const r = rng(1234);
    const parts = [
      "{{", "}}", "{{a}}", "{{a.b}}", "{{#each list}}", "{{/each}}", "{{#if a}}", "{{else}}", "{{/if}}",
      "{{this}}", "{{@index}}", "{{__proto__}}", "{{constructor}}", "{{> x}}", "{{{a}}}", "text ", "\n", "{", "}",
      "{{ a }}", "{{#each a}}", "{{#if list}}", "{{list.0.b}}", "{{a.toString}}",
    ];
    const data = { a: { b: "<x>" }, list: [{ b: "1" }, { b: "{{a}}" }] };
    for (let i = 0; i < 3000; i++) {
      let t = "";
      const n = 1 + Math.floor(r() * 12);
      for (let j = 0; j < n; j++) t += pick(r, parts);
      try {
        const out = renderTemplate(t, data);
        expect(typeof out).toBe("string");
        expect(out).not.toContain("<x>");
        expect(out).not.toContain("function");
        expect(out).not.toContain("[object");
      } catch (e) {
        expect(e).toBeInstanceOf(TemplateError);
      }
    }
  });
});

describe("limits", () => {
  it("rejects deep nesting", () => {
    expect(() => parseTemplate("{{#if a}}".repeat(40) + "{{/if}}".repeat(40))).toThrow(/nested too deeply/);
  });

  it("rejects oversized templates", () => {
    expect(() => parseTemplate("x".repeat(300 * 1024))).toThrow(/larger than/);
  });

  it("caps output size (no exponential blow-up)", () => {
    const list = Array.from({ length: 300 }, () => "y".repeat(100));
    const tpl = "{{#each list}}{{#each list}}{{#each list}}{{this}}{{/each}}{{/each}}{{/each}}";
    expect(() => renderTemplate(tpl, { list })).toThrow(/Rendered report is larger than/);
  });
});
