/**
 * Capability diff between two dependency trees (`penthera deps --diff`).
 *
 * The question a reviewer has on a lockfile PR is not "is anything vulnerable"
 * but "what can my dependencies do now that they could not do before". This
 * compares capability sets per package name: a package is new, or an upgrade
 * gained (or lost) capabilities, or it stayed the same.
 */
import { CAPABILITY_ORDER } from "./capabilities.js";

/** Compare two version strings numerically (prerelease sorts before release). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v || "").replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => parseInt(n, 10) || 0), pre: pre || null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return String(x.pre || "").localeCompare(String(y.pre || ""));
}

const ordered = (ids) => CAPABILITY_ORDER.filter((id) => ids.has(id));

/**
 * @param {{ name, version, capabilities: object|null }[]} oldTree capabilities null = not inspectable
 * @param {{ name, version, capabilities: object|null }[]} newTree
 */
export function diffTrees(oldTree, newTree) {
  const group = (tree) => {
    const m = new Map();
    for (const p of tree) {
      if (!m.has(p.name)) m.set(p.name, new Map());
      m.get(p.name).set(p.version, p);
    }
    return m;
  };
  const oldBy = group(oldTree);
  const newBy = group(newTree);
  const added = [];
  const upgraded = [];
  const removed = [];

  for (const [name, versions] of [...newBy].sort((a, b) => a[0].localeCompare(b[0]))) {
    const before = oldBy.get(name);
    for (const [version, p] of [...versions].sort((a, b) => compareVersions(a[0], b[0]))) {
      if (before?.has(version)) continue; // unchanged
      const capIds = p.capabilities ? Object.keys(p.capabilities) : null;
      if (!before) {
        added.push({ name, version, capabilities: capIds ? ordered(new Set(capIds)) : null, pkg: p });
        continue;
      }
      // Compare against the closest older version present before (else the lowest one).
      const olds = [...before.keys()].sort(compareVersions);
      const from = [...olds].reverse().find((v) => compareVersions(v, version) < 0) || olds[0];
      const prev = before.get(from);
      if (!p.capabilities || !prev.capabilities) {
        upgraded.push({ name, from, to: version, gained: null, lost: null, unavailable: !prev.capabilities ? "old" : "new", pkg: p });
        continue;
      }
      const o = new Set(Object.keys(prev.capabilities));
      const n = new Set(Object.keys(p.capabilities));
      upgraded.push({
        name,
        from,
        to: version,
        gained: ordered(new Set([...n].filter((c) => !o.has(c)))),
        lost: ordered(new Set([...o].filter((c) => !n.has(c)))),
        unavailable: null,
        pkg: p,
      });
    }
  }
  for (const [name, versions] of [...oldBy].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!newBy.has(name)) for (const v of [...versions.keys()].sort(compareVersions)) removed.push({ name, version: v });
  }
  return { added, upgraded, removed };
}
