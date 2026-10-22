/**
 * Dashboard labels with real (long) project paths. Found in the 2026-10-22
 * end-to-end test: a URL + folder check was labelled with the folder's full
 * absolute path, and the finding rows gave that label all the width, leaving
 * the finding title a 0px column.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shortProject } from "../src/ui/static/js/format.js";

describe("shortProject", () => {
  it("shortens both halves of a URL + folder project key", () => {
    expect(shortProject("https://www.example.com + /private/tmp/a/very/long/path/work/fixapp")).toBe("www.example.com + work/fixapp");
  });

  it("keeps the existing forms", () => {
    expect(shortProject("https://staging.acme.test")).toBe("staging.acme.test");
    expect(shortProject("/Users/me/code/acme-shop")).toBe("code/acme-shop");
    expect(shortProject("")).toBe("-");
  });
});

describe("finding rows", () => {
  it("cap the tag so it cannot take the title's column", () => {
    const css = readFileSync("src/ui/static/app.css", "utf-8");
    const rule = css.match(/\.row \.tag \{([^}]*)\}/)?.[1] || "";
    expect(rule).toMatch(/max-width:/);
    expect(rule).toMatch(/text-overflow: ellipsis/);
    expect(rule).toMatch(/white-space: nowrap/);
  });
});
