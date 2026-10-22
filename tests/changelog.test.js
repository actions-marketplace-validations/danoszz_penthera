import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseFragment, readFragments, release } from "../scripts/changelog.mjs";

describe("changelog fragments", () => {
  it("parses a fragment and rejects malformed ones", () => {
    expect(parseFragment("section: Fixed\n\n- **A fix.** Details.\n")).toEqual({ section: "Fixed", body: "- **A fix.** Details." });
    expect(() => parseFragment("- no section\n")).toThrow(/section:/);
    expect(() => parseFragment("section: Misc\n\n- x\n")).toThrow(/unknown section/);
    expect(() => parseFragment("section: Fixed\n\nprose only\n")).toThrow(/bullets/);
  });

  it("every fragment in changelog.d is valid", () => {
    expect(() => readFragments(join(import.meta.dirname, "..", "changelog.d"))).not.toThrow();
  });

  it("folds [Unreleased] notes and fragments into a dated release, sections in a fixed order", () => {
    const before = "# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- old fix\n\n## [1.0.0] - 2026-01-01\n\n- first\n";
    const after = release(before, [
      { file: "b.md", section: "Added", body: "- new thing" },
      { file: "a.md", section: "Fixed", body: "- another fix" },
    ], "1.1.0", "2026-02-02");
    expect(after).toBe(
      "# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-02-02\n\n### Added\n\n- new thing\n\n### Fixed\n\n- old fix\n- another fix\n\n## [1.0.0] - 2026-01-01\n\n- first\n",
    );
  });
});
