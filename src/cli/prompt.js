/**
 * Shared terminal prompt helpers (TTY + piped stdin).
 */
import { createInterface } from "node:readline";
import { dim } from "./ansi.js";

let _pipedLines = null;
let _rl = null;

/** Open the prompt. Safe to call again after closePrompt(): piped answers already read are kept. */
export async function initPrompt() {
  if (_pipedLines) return;
  if (process.stdin.isTTY) {
    _rl = createInterface({ input: process.stdin, output: process.stdout });
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    _pipedLines = Buffer.concat(chunks).toString().split("\n").map((l) => l.trim());
  }
}

export function closePrompt() {
  if (_rl) _rl.close();
  _rl = null;
}

export function ask(question) {
  if (_pipedLines) {
    process.stdout.write(question);
    const answer = _pipedLines.shift() || "";
    process.stdout.write(answer + "\n");
    return Promise.resolve(answer);
  }
  return new Promise((resolve) => {
    _rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/** Normalize user URL input (adds http/https). */
export function normalizeUrlInput(raw, forceLocal = false) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    const looksLocal = forceLocal ||
      /^(localhost|127\.|0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01]))/.test(trimmed);
    return looksLocal ? `http://${trimmed}` : `https://${trimmed}`;
  }
  return trimmed;
}

/** Single-choice menu. Returns selected option id. */
export async function choose(question, options) {
  process.stdout.write(`\n${question}\n`);
  options.forEach((opt, i) => {
    process.stdout.write(`  ${i + 1}. ${opt.label}\n`);
  });
  const answer = await ask(`\n  Choice [1-${options.length}]: `);
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) return options[idx].id;
  return options[0].id;
}

export async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

/**
 * Parse a checklist answer: "" keeps the defaults, numbers ("2", "1,3", "2 4")
 * toggle those items. Returns null when the answer is not a list of valid numbers.
 */
export function parseToggles(answer, count) {
  const a = (answer || "").trim();
  if (!a) return [];
  const parts = a.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > count)) return null;
  return [...new Set(nums.map((n) => n - 1))];
}

/**
 * Multi-select list with defaults. Enter accepts; numbers toggle items.
 * @param {string} question
 * @param {{ id: string, label: string, hint?: string, checked: boolean }[]} items
 * @returns {Promise<Set<string>>} the ids that end up checked
 */
export async function checklist(question, items, { indent = "  " } = {}) {
  const checked = items.map((i) => !!i.checked);
  process.stdout.write(`${indent}${question}\n`);
  const pad = Math.max(...items.map((i) => i.label.length));
  items.forEach((item, i) => {
    const hint = item.hint ? `  ${dim(item.hint)}` : "";
    process.stdout.write(`${indent}  ${i + 1}. [${checked[i] ? "x" : " "}] ${item.hint ? item.label.padEnd(pad) : item.label}${hint}\n`);
  });
  for (let tries = 0; tries < 3; tries++) {
    const toggles = parseToggles(await ask(`${indent}Enter to accept, or numbers to toggle (e.g. 2,4): `), items.length);
    if (toggles) {
      for (const i of toggles) checked[i] = !checked[i];
      break;
    }
    process.stdout.write(`${indent}Type item numbers from 1 to ${items.length}, separated by commas, or just press Enter.\n`);
  }
  return new Set(items.filter((_, i) => checked[i]).map((i) => i.id));
}
