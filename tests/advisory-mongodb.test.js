/**
 * MongoDB end-of-life lines (E10 pilot miss `mongo-image` on Juice Shop: a
 * compose file pins mongo:4.4.29, a line that ended 2024-02-29). The repo
 * fixture is written to a temp dir at runtime.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runtimeAdvisoriesForRepo } from "../lib/advisories/index.js";
import { parseImageRef } from "../lib/advisories/evidence.js";
import { rulesOf } from "../lib/rules/index.js";

function scanCompose(images) {
  const dir = mkdtempSync(join(tmpdir(), "penthera-mongo-"));
  try {
    const services = images.map((img, i) => `  db${i}:\n    image: ${img}\n`).join("");
    writeFileSync(join(dir, "docker-compose.yml"), `services:\n${services}`);
    return runtimeAdvisoriesForRepo(dir).filter((f) => f.rule === "mongodb-eol");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("MongoDB in the advisories pack", () => {
  it("reads the official mongo image", () => {
    expect(parseImageRef("mongo:4.4.29")).toMatchObject({ product: "mongodb", kind: "exact" });
    expect(parseImageRef("docker.io/library/mongo:7.0")).toMatchObject({ product: "mongodb", kind: "branch" });
    expect(parseImageRef("bitnami/mongodb:4.4")).toBeNull();
  });

  it("reports a pinned end-of-life line with the vendor's date", () => {
    const [f, ...rest] = scanCompose(["mongo:4.4.29"]);
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ title: "MongoDB 4.4.29 is end of life: no more security fixes", url: "docker-compose.yml", severity: "high" });
    expect(f.description).toContain("2024-02-29");
    expect(f.description).toContain("https://www.mongodb.com/legal/support-policy/lifecycles");
  });

  it("reports ended major and interim lines, not supported ones", () => {
    expect(scanCompose(["mongo:5.0.31", "mongo:6.0", "mongo:8.2.1-noble", "mongo:7.3.4"])).toHaveLength(4);
    expect(scanCompose(["mongo:7.0.14", "mongo:8.0", "mongo:8.3.1", "mongo:9.0.0", "mongo:latest", "mongo:7"])).toEqual([]);
  });

  it("every listed line had ended by the rule's check date", () => {
    const [rule] = rulesOf("runtime-eol").filter((r) => r.product === "mongodb");
    for (const b of rule.branches) expect(b.eol <= rule.date, b.branch).toBe(true);
    expect(rule.branches.map((b) => b.branch)).not.toContain("7.0");
    expect(rule.branches.map((b) => b.branch)).not.toContain("8.0");
  });
});
