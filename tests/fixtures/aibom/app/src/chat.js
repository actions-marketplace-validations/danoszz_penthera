import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { readFile } from "node:fs/promises";

const anthropic = new Anthropic();
const openai = new OpenAI();
const PRIMARY_MODEL = "claude-sonnet-4-5";
const FALLBACK = 'gpt-4o-mini';

// Not models: a CLI name, a path, a scoped package, a template literal.
const tool = "claude-code";
const helper = "src/utils.js";
const pkg = "@anthropic-ai/sdk";
const dynamic = `claude-${process.env.TIER}`;

export async function answer(question) {
  const system = await readFile(new URL("../prompts/system.md", import.meta.url), "utf-8");
  try {
    return await anthropic.messages.create({ model: PRIMARY_MODEL, max_tokens: 512, system, messages: [{ role: "user", content: question }] });
  } catch {
    return openai.chat.completions.create({ model: FALLBACK, messages: [{ role: "user", content: question }] });
  }
}

export const embeddingModel = "text-embedding-3-small";
export const sameModelAgain = "claude-sonnet-4-5";
