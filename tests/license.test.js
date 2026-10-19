import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseSpdx, formatSpdx, classifyLicense, canonicalId, licenseField, SpdxError,
  normalizeLicensePolicy, evaluateExpression, checkLicenses, LICENSE_PRESETS, packageExempt,
} from "../lib/deps/license.js";
import { normalizePolicy } from "../lib/install/policy.js";
import { scanDeps } from "../lib/deps/index.js";
import { buildSbom } from "../lib/whitebox/sbom.js";
import { writeSarifReport } from "../src/reporter.js";
import { formatDepsMarkdown } from "../lib/deps/report.js";

const ok = (expr, policy) => evaluateExpression(parseSpdx(expr), normalizeLicensePolicy(policy)).ok;

describe("SPDX expression parser", () => {
  it("parses single ids, canonicalising case", () => {
    expect(parseSpdx("MIT")).toMatchObject({ type: "license", id: "MIT", known: true, plus: false });
    expect(parseSpdx("apache-2.0").id).toBe("Apache-2.0");
  });

  it("gives AND precedence over OR, and WITH over both", () => {
    const t = parseSpdx("MIT OR Apache-2.0 AND BSD-3-Clause");
    expect(t.type).toBe("or");
    expect(t.args[1]).toMatchObject({ type: "and" });
    expect(formatSpdx(t)).toBe("MIT OR (Apache-2.0 AND BSD-3-Clause)");
    const w = parseSpdx("GPL-2.0-only WITH Classpath-exception-2.0 OR MIT");
    expect(w.args[0]).toMatchObject({ id: "GPL-2.0-only", exception: "Classpath-exception-2.0" });
  });

  it("handles parentheses, nesting and redundant wrapping", () => {
    expect(formatSpdx(parseSpdx("(MIT AND BSD-3-Clause)"))).toBe("MIT AND BSD-3-Clause");
    expect(formatSpdx(parseSpdx("((MIT))"))).toBe("MIT");
    expect(formatSpdx(parseSpdx("(MIT OR Apache-2.0) AND (ISC OR BSD-2-Clause)"))).toBe("(MIT OR Apache-2.0) AND (ISC OR BSD-2-Clause)");
    expect(parseSpdx("MIT AND (ISC AND Zlib)").args).toHaveLength(3); // flattened
  });

  it("accepts lowercase operators, + suffixes and LicenseRefs", () => {
    expect(parseSpdx("MIT or Apache-2.0").type).toBe("or");
    expect(parseSpdx("GPL-2.0+")).toMatchObject({ id: "GPL-2.0", plus: true });
    expect(parseSpdx("LicenseRef-acme-eula")).toMatchObject({ known: true, ref: true });
    expect(parseSpdx("DocumentRef-spdx-tool-1.2:LicenseRef-MIT-Style-2")).toMatchObject({ known: true, ref: true });
  });

  it("rejects malformed expressions", () => {
    for (const bad of ["", "   ", "(MIT", "MIT)", "MIT AND", "OR MIT", "MIT OR OR ISC", "MIT ISC", "MIT WITH", "MIT, ISC", "()", "MIT / ISC"]) {
      expect(() => parseSpdx(bad), bad).toThrow(SpdxError);
    }
  });

  it("marks unknown ids and exceptions", () => {
    expect(parseSpdx("Totally-Made-Up").known).toBe(false);
    expect(parseSpdx("MIT WITH Not-An-Exception").known).toBe(false);
  });

  it("normalises deprecated GNU ids for comparison", () => {
    expect(canonicalId("GPL-3.0")).toBe("GPL-3.0-only");
    expect(canonicalId("GPL-3.0", true)).toBe("GPL-3.0-or-later");
    expect(canonicalId("AGPL-3.0+")).toBe("AGPL-3.0-or-later");
    expect(canonicalId("LGPL-2.1")).toBe("LGPL-2.1-only");
    expect(canonicalId("GPL-2.0-with-classpath-exception")).toBe("GPL-2.0-only");
    expect(canonicalId("mit")).toBe("MIT");
  });
});

describe("license classification", () => {
  it("separates SPDX, UNLICENSED, missing, custom and unknown", () => {
    expect(classifyLicense("MIT").kind).toBe("spdx");
    expect(classifyLicense("UNLICENSED").kind).toBe("unlicensed");
    expect(classifyLicense(null).kind).toBe("missing");
    expect(classifyLicense("NOASSERTION").kind).toBe("missing");
    expect(classifyLicense("SEE LICENSE IN LICENSE.md").kind).toBe("custom");
    expect(classifyLicense("MIT/X11").kind).toBe("unknown");
    expect(classifyLicense("Commercial").kind).toBe("unknown");
  });

  it("reads license, legacy object and licenses-array forms", () => {
    expect(licenseField({ license: "ISC" })).toBe("ISC");
    expect(licenseField({ license: { type: "MIT", url: "x" } })).toBe("MIT");
    expect(licenseField({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("(MIT OR Apache-2.0)");
    expect(licenseField({})).toBe(null);
  });
});

describe("license policy presets", () => {
  it("permissive allows MIT/ISC/BSD/Apache and nothing copyleft", () => {
    expect(ok("MIT", "permissive")).toBe(true);
    expect(ok("(MIT AND BSD-3-Clause)", "permissive")).toBe(true);
    expect(ok("LGPL-3.0-only", "permissive")).toBe(false);
    expect(ok("MPL-2.0", "permissive")).toBe(false);
    expect(ok("GPL-3.0", "permissive")).toBe(false);
  });

  it("OR needs one acceptable branch, AND needs all", () => {
    expect(ok("MIT OR GPL-3.0-only", "permissive")).toBe(true);
    expect(ok("MIT AND GPL-3.0-only", "permissive")).toBe(false);
    expect(ok("(GPL-2.0-only OR MPL-2.0) AND MIT", "weak-copyleft-ok")).toBe(true);
  });

  it("weak-copyleft-ok adds LGPL/MPL/EPL but still refuses GPL", () => {
    expect(ok("LGPL-2.1+", "weak-copyleft-ok")).toBe(true);
    expect(ok("MPL-2.0", "weak-copyleft-ok")).toBe(true);
    expect(ok("GPL-2.0-only", "weak-copyleft-ok")).toBe(false);
  });

  it("no-agpl denies AGPL in every spelling and allows everything else", () => {
    expect(ok("AGPL-3.0", "no-agpl")).toBe(false);
    expect(ok("AGPL-3.0-or-later", "no-agpl")).toBe(false);
    expect(ok("agpl-3.0+", "no-agpl")).toBe(false);
    expect(ok("SSPL-1.0", "no-agpl")).toBe(false);
    expect(ok("GPL-3.0-only", "no-agpl")).toBe(true);
    expect(ok("MIT OR AGPL-3.0-only", "no-agpl")).toBe(true);
  });

  it("custom allow/deny lists extend a preset; deny wins; globs and WITH entries work", () => {
    expect(ok("WTFPL", { preset: "permissive", deny: ["WTFPL"] })).toBe(false);
    expect(ok("Python-2.0", { allow: ["Python-2.0"] })).toBe(true);
    expect(ok("MIT", { allow: ["Python-2.0"] })).toBe(false);
    expect(ok("GPL-3.0-or-later", { deny: ["GPL-*"] })).toBe(false);
    expect(ok("GPL-2.0-only WITH Classpath-exception-2.0", { preset: "permissive", allow: ["GPL-2.0-only WITH Classpath-exception-2.0"] })).toBe(true);
    expect(ok("GPL-2.0-only", { preset: "permissive", allow: ["GPL-2.0-only WITH Classpath-exception-2.0"] })).toBe(false);
  });

  it("validates the policy section", () => {
    expect(() => normalizeLicensePolicy({ preset: "copyleft-yolo" })).toThrow(/unknown preset/);
    expect(() => normalizeLicensePolicy({ alow: [] })).toThrow(/unknown field/);
    expect(() => normalizeLicensePolicy({})).toThrow(/preset, an allow list or a deny list/);
    expect(() => normalizeLicensePolicy({ preset: "permissive", unknown: "maybe" })).toThrow(/warn.*block/);
    expect(normalizeLicensePolicy("no-agpl").deny).toEqual(LICENSE_PRESETS["no-agpl"].deny);
    const p = normalizePolicy({ licenses: { preset: "permissive" }, hook: { blockOn: "critical" } });
    expect(p.licenses.allow).toContain("MIT");
    expect(p.hook.blockOn).toBe("critical");
    expect(normalizePolicy({}).licenses).toBe(null);
    expect(() => normalizePolicy({ hook: { blockOn: "sometimes" } })).toThrow(/blockOn/);
  });

  it("allowPackages exempts by name glob and version pin", () => {
    expect(packageExempt(["@acme/*"], "@acme/ui", "1.0.0")).toBe("@acme/*");
    expect(packageExempt(["left-pad@1.3.0"], "left-pad", "1.3.0")).toBe("left-pad@1.3.0");
    expect(packageExempt(["left-pad@1.3.0"], "left-pad", "1.4.0")).toBe(null);
  });
});

describe("checkLicenses findings", () => {
  const pkgs = [
    { name: "ok", version: "1.0.0", path: "node_modules/ok", license: "MIT" },
    { name: "agpl", version: "1.0.0", path: "node_modules/agpl", license: "AGPL-3.0-only" },
    { name: "private", version: "1.0.0", path: "node_modules/private", license: "UNLICENSED" },
    { name: "bare", version: "1.0.0", path: "node_modules/bare", license: null },
    { name: "odd", version: "1.0.0", path: "node_modules/odd", license: "MIT/X11" },
    { name: "@acme/x", version: "2.0.0", path: "node_modules/@acme/x", license: "AGPL-3.0-only" },
  ];

  it("flags breaches, UNLICENSED, missing and unknown with category license", () => {
    const policy = normalizeLicensePolicy({ preset: "no-agpl", allowPackages: ["@acme/*"] });
    const { findings, summary } = checkLicenses(pkgs, policy, { lockfileHasLicenses: true });
    const by = Object.fromEntries(findings.map((f) => [f.package, f]));
    expect(findings.every((f) => f.category === "license")).toBe(true);
    expect(by.agpl.severity).toBe("high");
    expect(by.private.severity).toBe("high");
    expect(by.bare.severity).toBe("medium");
    expect(by.odd.severity).toBe("medium");
    expect(by.ok).toBeUndefined();
    expect(by["@acme/x"]).toBeUndefined();
    expect(summary).toMatchObject({ checked: 6, breaches: 1, unlicensed: 1, missing: 1, unknown: 1, exempt: 1 });
  });

  it("unknown: block raises missing and unknown licenses to high", () => {
    const { findings } = checkLicenses(pkgs, normalizeLicensePolicy({ preset: "permissive", unknown: "block" }), { lockfileHasLicenses: true });
    expect(findings.find((f) => f.package === "bare").severity).toBe("high");
  });

  it("does not guess for a v1 lockfile package that is not installed", () => {
    const { findings, summary } = checkLicenses([{ name: "a", version: "1.0.0", path: "node_modules/a" }], normalizeLicensePolicy("permissive"), {});
    expect(findings).toEqual([]);
    expect(summary.notChecked).toBe(1);
  });
});

describe("deps --license-policy end to end", () => {
  const dir = mkdtempSync(join(tmpdir(), "penthera-license-"));
  const lock = {
    name: "app", lockfileVersion: 3,
    packages: {
      "": { name: "app", dependencies: { good: "1.0.0", bad: "1.0.0", legacy: "1.0.0" } },
      "node_modules/good": { version: "1.0.0", license: "MIT OR Apache-2.0" },
      "node_modules/bad": { version: "1.0.0", license: "AGPL-3.0" },
      "node_modules/legacy": { version: "1.0.0" },
    },
  };
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }));
  mkdirSync(join(dir, "node_modules", "legacy"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "legacy", "package.json"), JSON.stringify({ name: "legacy", version: "1.0.0", licenses: [{ type: "BSD-3-Clause" }] }));

  it("reports license findings in JSON, SARIF and Markdown and adds licenses to the SBOM", async () => {
    try {
      const r = await scanDeps(dir, { licensePolicy: normalizeLicensePolicy("no-agpl"), cacheDir: join(dir, "no-cache") });
      const lic = r.findings.filter((f) => f.category === "license");
      expect(lic.map((f) => f.package)).toEqual(["bad"]);
      expect(r.deps.licenses).toMatchObject({ policy: "no-agpl", checked: 3, breaches: 1 });
      expect(formatDepsMarkdown(r.deps)).toMatch(/\*\*Licenses:\*\* 3 checked against "no-agpl": 1 breach the policy/);

      const sarifPath = join(dir, "out.sarif");
      writeSarifReport({ ...r, findings: r.findings }, sarifPath);
      const sarif = JSON.parse((await import("node:fs")).readFileSync(sarifPath, "utf-8"));
      expect(sarif.runs[0].results.some((x) => /AGPL-3.0/.test(x.message.text))).toBe(true);

      const sbom = buildSbom(dir);
      const lics = Object.fromEntries(sbom.components.map((c) => [c.name, c.licenses]));
      expect(lics.good).toEqual([{ expression: "MIT OR Apache-2.0" }]);
      expect(lics.bad).toEqual([{ license: { id: "AGPL-3.0" } }]);
      expect(lics.legacy).toEqual([{ license: { id: "BSD-3-Clause" } }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
