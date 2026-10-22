/**
 * Ollama on 127.0.0.1 for AI mode: list models, tell local from cloud, and
 * generate structured output.
 *
 * Same host rules as the fix model (lib/fix/model.js): one fixed origin,
 * checked before every request, redirects refused. Ollama can also serve
 * models that run on ollama.com through the same local address ("cloud"
 * models). Those are the `ollama-cloud` route and need their own consent, so
 * every model is classified before use, and a model Penthera cannot classify
 * is treated as cloud.
 */
import { OLLAMA_ORIGIN, assertLocalModelUrl } from "../fix/model.js";
import { readJson } from "../../src/utils/http.js";

export { OLLAMA_ORIGIN };
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class OllamaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
  }
}

/**
 * Why Ollama says a model runs remotely, or null when it runs here.
 * Signals: a `-cloud` / `:cloud` name, or a remote host or model field in its
 * metadata (Ollama's /api/tags and /api/show mark cloud models this way).
 * @param {object} entry - one /api/tags model, optionally merged with /api/show
 */
export function remoteReason(entry) {
  if (!entry || typeof entry !== "object") return "Ollama did not describe this model";
  const name = String(entry.name || entry.model || "");
  if (/(?:-|:)cloud$/i.test(name)) return `its name (${name}) marks it as a cloud model`;
  for (const k of ["remote_host", "remote_model", "remote"]) {
    if (entry[k]) return `Ollama lists it with ${k}${typeof entry[k] === "string" ? ` ${entry[k]}` : ""}`;
  }
  return null;
}

async function call(fetchImpl, path, { body, timeout }) {
  const url = assertLocalModelUrl(`${OLLAMA_ORIGIN}${path}`).href;
  let res;
  try {
    res = await fetchImpl(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    if (e?.name === "TimeoutError") throw new OllamaError(`Ollama did not answer within ${Math.round(timeout / 1000)} s`, "timeout");
    throw new OllamaError("Ollama is not running on this computer (127.0.0.1:11434). Start it with `ollama serve`.", "unreachable");
  }
  if (!res.ok) throw new OllamaError(`Ollama answered ${res.status} for ${path}`, "http");
  return readJson(res, { maxBytes: MAX_RESPONSE_BYTES, timeout });
}

/**
 * @param {{ fetch?: typeof fetch, timeout?: number }} [opts]
 */
export function createOllama({ fetch: fetchImpl = globalThis.fetch, timeout = 120_000 } = {}) {
  return {
    /** Installed models, each with its route. */
    async models() {
      const data = await call(fetchImpl, "/api/tags", { timeout: 10_000 });
      const list = Array.isArray(data?.models) ? data.models : [];
      return list
        .filter((m) => m && typeof m.name === "string")
        .map((m) => {
          const why = remoteReason(m);
          return { name: m.name, digest: m.digest || null, size: Number.isFinite(m.size) ? m.size : null, route: why ? "ollama-cloud" : "local", remoteReason: why };
        });
    },

    /** One model by name, classified; unknown models are refused. */
    async model(name) {
      const all = await this.models();
      const m = all.find((x) => x.name === name || x.name === `${name}:latest`);
      if (!m) throw new OllamaError(`Ollama has no model named ${name}. \`ollama list\` shows what is installed; \`penthera ai models\` shows which run on this computer.`, "missing");
      return m;
    },

    /**
     * Generate JSON that matches `schema` (Ollama structured outputs).
     * @returns {Promise<{ text: string, promptTokens: number, outputTokens: number }>}
     */
    async generate({ model, system, prompt, schema, seed = 0 }) {
      const data = await call(fetchImpl, "/api/generate", {
        timeout,
        body: { model, system, prompt, format: schema, stream: false, options: { temperature: 0, seed } },
      });
      return {
        text: typeof data?.response === "string" ? data.response : "",
        promptTokens: Number.isInteger(data?.prompt_eval_count) ? data.prompt_eval_count : 0,
        outputTokens: Number.isInteger(data?.eval_count) ? data.eval_count : 0,
      };
    },
  };
}
