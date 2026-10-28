/**
 * The A-F grade for a list of findings, shared by `penthera agents`, the
 * dashboard and `penthera init`. No dependencies.
 */
const WEIGHT = { critical: 30, high: 15, medium: 5, low: 1, info: 0 };

/** A–F grade. Any critical finding is an F; otherwise score bands. */
export function gradeFindings(findings) {
  let score = 100;
  for (const f of findings) score -= WEIGHT[f.severity] ?? 0;
  score = Math.max(0, score);
  const critical = findings.some((f) => f.severity === "critical");
  const grade = critical ? "F" : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { grade, score };
}
