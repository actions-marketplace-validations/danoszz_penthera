/**
 * Packaging: building or installing Penthera runs no project scripts.
 *
 * pre-commit.com installs a `language: node` hook by running `npm pack` on
 * this repo, and `npm pack` runs `prepack`; a test suite there would run on
 * every `pre-commit install-hooks`. The release workflow runs the tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");

describe("packaging", () => {
  it("package.json has no pack or install lifecycle scripts", () => {
    const { scripts = {} } = JSON.parse(read("package.json"));
    for (const name of ["prepack", "postpack", "prepare", "preinstall", "install", "postinstall"]) {
      expect(scripts[name], name).toBeUndefined();
    }
  });

  it("the pre-commit hook installs as a node package, and publishing still runs the tests", () => {
    expect(read(".pre-commit-hooks.yaml")).toMatch(/language: node/);
    expect(read(".github/workflows/publish.yml")).toMatch(/run: npm test/);
  });
});
