/**
 * E11b round 2: provider token formats and generic API keys.
 * Fixtures are our own made-up values in each provider's documented shape;
 * every secret is split with j() so Penthera's self-scan does not report
 * this file.
 */
import { describe, it, expect } from "vitest";
import { findSecretsInText, secretRulesFor } from "../lib/whitebox/secrets.js";

const j = (...p) => p.join("");
const names = (text, opts) => findSecretsInText(text, opts).map((h) => h.name);
const HEX = (n) => "9f3a1c7e5b2d4086".repeat(8).slice(0, n);
const ALNUM = (n) => "Zr8KqT2mWv5NpLx7Bc4HdJ9sYf3Ge6Ua".repeat(4).slice(0, n);

describe("round 2, R1: provider token formats", () => {
  it("finds AWS temporary (STS) access key IDs, not only long-term ones", () => {
    expect(names(j('"AccessKeyId": "AS', "IA", "Z3MXQ7HPLR2VKW4N", '"'))).toEqual(["AWS access key"]);
    expect(names(j("key = AK", "IA", "Z3MXQ7HPLR2VKW4N"))).toEqual(["AWS access key"]);
    // AWS's documented example keys are never a leak.
    expect(names(j("AS", "IAIOSFODNN7EXAMPLE"))).toEqual([]);
    expect(names(j('"AccessKeyId": "AS', "IAJEXAMPLEXEG2JICEA", '"'))).toEqual([]);
    expect(names(j("AWS_KEY=AK", "IA", "XXXXXXXXXXXXXXXX"))).toEqual([]);
  });

  it("does not report AWS IAM identifiers that are not credentials", () => {
    // AIDA (user), AROA (role) and AIPA (instance profile) IDs are public identifiers.
    for (const p of ["AI" + "DA", "AR" + "OA", "AI" + "PA"]) expect(names(j('"UserId": "', p, "Z3MXQ7HPLR2VKW4NQ", '"'))).toEqual([]);
  });

  it("finds every GitHub token prefix", () => {
    for (const p of ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"]) expect(names(j("GH = '", p, ALNUM(36), "'")), p).toEqual(["GitHub token"]);
    expect(names(j("GH = '", "github", "_pat_", ALNUM(22), "_", ALNUM(59), "'"))).toEqual(["GitHub token"]);
    expect(names(j("ghx_", ALNUM(36)))).toEqual([]);
  });

  it("finds Stripe restricted live keys and Postman API keys", () => {
    expect(names(j("STRIPE = 'rk", "_live_", ALNUM(24), "'"))).toEqual(["Stripe secret key"]);
    expect(names(j("url = 'https://api.example.com/c?apikey=PM", "AK-", HEX(24), "-", HEX(34), "'"))).toEqual(["Postman API key"]);
    expect(names(j("PM", "AK-", HEX(20), "-", HEX(34)))).toEqual([]);
  });

  it("reads reStructuredText, AsciiDoc and .markdown as docs: fixed shapes only", () => {
    for (const f of ["docs/setup.rst", "docs/guide.adoc", "docs/guide.asciidoc", "README.markdown"]) expect(secretRulesFor(f), f).toBe("shapes");
    const doc = j("    key_id = 'AK", "IA", "Z3MXQ7HPLR2VKW4N'\n    pass", "word = 'Kq7-vR2mLz9x'\n");
    expect(names(doc, { shapesOnly: true, path: "docs/setup.rst" })).toEqual(["AWS access key"]);
  });
});
