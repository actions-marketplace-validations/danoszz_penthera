/**
 * Fix recipes: deterministic, local fixes for common findings.
 *
 * A recipe is { id, matches(finding), detect(repoPath), plan(repoPath, finding,
 * framework) } and may add probe(repoPath), a static check that reports the
 * finding from source so a fix can be verified without a live server. plan()
 * returns { diff, files, ownerActions, confidence } or null when it cannot find
 * a safe anchor. Recipes never write: applyDiff() is the separate step that does.
 */
import { createHash } from "node:crypto";
import headers from "./recipes/headers.js";
import cookies from "./recipes/cookies.js";
import cors from "./recipes/cors.js";
import rateLimit from "./recipes/rate-limit.js";
import secrets from "./recipes/secrets.js";

export { applyDiff, assertCleanTree, restoreFiles, FixError } from "./apply.js";
export { createPatch, parsePatch, applyHunks } from "./diff.js";
export { createModelFixer } from "./model.js";

export const RECIPES = [headers, cookies, cors, rateLimit, secrets];

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Findings from every recipe's static probe (headers, cookies, CORS, auth rate limits). */
export function probeRepo(repoPath, recipes = RECIPES) {
  return recipes.flatMap((r) => {
    if (!r.probe) return [];
    try {
      return r.probe(repoPath);
    } catch {
      return [];
    }
  });
}

export function findingKey(f) {
  return `${f.category || ""}|${f.title || ""}|${f.url || ""}`;
}

function planId(recipeId, diff) {
  return `${recipeId}-${createHash("sha256").update(diff).digest("hex").slice(0, 8)}`;
}

const brief = (f) => ({ title: f.title, severity: f.severity, category: f.category, url: f.url || null });

/**
 * Plan fixes for findings. Findings that resolve to the same diff (say, five
 * missing headers fixed by one middleware) share one plan.
 *
 * @param {string} repoPath
 * @param {object[]} findings
 * @param {{ model?: { plan(repoPath, finding): Promise<object|null> }, recipes?: object[] }} [opts]
 * @returns {Promise<{ plans: object[], unmatched: object[], refused: { finding: object, reason: string }[] }>}
 *   refused: findings whose model diff edited a protected file; they are in unmatched too.
 */
export async function planFixes(repoPath, findings, opts = {}) {
  const recipes = opts.recipes || RECIPES;
  const plans = new Map();
  const unmatched = [];
  const refused = [];
  const frameworks = new Map();
  const sorted = [...(findings || [])].sort((a, b) => (SEV_ORDER[a.severity] ?? 5) - (SEV_ORDER[b.severity] ?? 5));

  const add = (plan, finding) => {
    const id = planId(plan.recipe, plan.diff);
    const existing = plans.get(id);
    if (existing) {
      if (!existing.findings.some((f) => findingKey(f) === findingKey(finding))) existing.findings.push(brief(finding));
      return;
    }
    plans.set(id, { id, ...plan, findings: [brief(finding)] });
  };

  for (const finding of sorted) {
    let planned = false;
    for (const recipe of recipes) {
      if (!recipe.matches(finding)) continue;
      if (!frameworks.has(recipe.id)) frameworks.set(recipe.id, recipe.detect(repoPath));
      const framework = frameworks.get(recipe.id);
      if (!framework) continue;
      let p = null;
      try {
        p = recipe.plan(repoPath, finding, framework);
      } catch {
        p = null; // a recipe that trips over unexpected code declines rather than guessing
      }
      if (!p?.diff) continue;
      add({
        recipe: recipe.id,
        title: recipe.title,
        framework,
        source: "recipe",
        confidence: p.confidence || "medium",
        diff: p.diff,
        files: p.files,
        ownerActions: p.ownerActions || [],
        redactions: p.redactions || [],
      }, finding);
      planned = true;
      break;
    }
    if (planned) continue;
    if (opts.model && finding.severity !== "info") {
      let p = null;
      try {
        p = await opts.model.plan(repoPath, finding);
      } catch (e) {
        if (e?.code === "PROTECTED") refused.push({ finding, reason: e.message });
        p = null;
      }
      if (p?.diff) {
        add({ recipe: "local-model", title: "Model-suggested fix", framework: null, redactions: [], ...p }, finding);
        continue;
      }
    }
    unmatched.push(finding);
  }
  return { plans: [...plans.values()], unmatched, refused };
}

/** Mask redacted values (hardcoded secrets) so a plan is safe to print or store. */
export function redactPlan(plan) {
  let diff = plan.diff;
  for (const value of plan.redactions || []) {
    if (!value) continue;
    const mask = value.length <= 8 ? "***" : `${value.slice(0, 4)}…${value.slice(-4)}`;
    diff = diff.split(value).join(mask);
  }
  const { redactions, ...rest } = plan;
  return { ...rest, diff, redacted: Boolean(redactions?.length) };
}
