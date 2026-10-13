// Model clients. Every client yields the same normalized events:
//   { type: "text", text }              assistant text delta
//   { type: "thinking", text }          reasoning delta (summaries)
//   { type: "tool_start", id, name }    a tool call began streaming (UI hint)
//   { type: "tool_calls", calls: [{ id, name, args, argsError? }] }
//   { type: "usage", usage: { input, output, cacheRead, cacheWrite, costUsd? }, model }
//   { type: "notice", text }            retries, degraded features, fallback
//   { type: "error", status, message }
//   { type: "done", stop, model, raw?, rawProvider? }
import { LLM, PROVIDER_ORDER, parseModelSpec, rememberOpenRouterModels } from "./catalog.js";
import { AnthropicClient, ANTHROPIC_VERSION } from "./anthropic.js";
import { OpenAIChatClient } from "./openai-chat.js";
import { OpenAIResponsesClient } from "./openai-responses.js";
import { MockClient } from "./mock.js";
import { completeText } from "./http.js";
import { fetchJson, fetchT } from "../core/util.js";

export { LLM, parseModelSpec };

/** Base URL for a provider (custom reads it from the key store). */
export function baseUrlFor(provider, keys) {
  const p = LLM[provider];
  if (!p) return "";
  if (p.baseUrlKey) return (keys.get(p.baseUrlKey) || "").replace(/\/+$/, "");
  if (provider === "ollama" && process.env.OLLAMA_HOST) return `${process.env.OLLAMA_HOST.replace(/\/+$/, "").replace(/^(?!https?:)/, "http://")}/v1`;
  return p.baseUrl;
}

/** Is this LLM provider usable right now (key present / local server assumed)? */
export function providerConfigured(provider, keys, { localUp = {} } = {}) {
  const p = LLM[provider];
  if (!p || p.hidden) return false;
  if (p.local) return !!localUp[provider];
  if (p.baseUrlKey) return !!keys.get(p.baseUrlKey);
  return !!keys.get(p.key);
}

/** Probe Ollama / LM Studio on this machine (fast, 600 ms). */
export async function detectLocal() {
  const out = {};
  await Promise.all(["ollama", "lmstudio"].map(async (id) => {
    try {
      const url = id === "ollama" ? `${LLM.ollama.baseUrl.replace(/\/v1$/, "")}/api/tags` : `${LLM.lmstudio.baseUrl}/models`;
      const r = await fetchT(url, {}, 600);
      out[id] = r.ok;
    } catch { out[id] = false; }
  }));
  return out;
}

/** Pick the model to use: explicit spec > config.model > first configured provider's default. */
export function resolveModel({ spec, config, keys, localUp = {}, role = "default" }) {
  if (spec) return parseModelSpec(spec);
  if (role !== "default" && config.roles?.[role]?.provider) return config.roles[role];
  const cm = config.model;
  if (cm?.provider && LLM[cm.provider]) {
    const id = role === "default" ? cm.id || LLM[cm.provider].roles.default : LLM[cm.provider].roles[role] || cm.id;
    if (id) return { provider: cm.provider, id };
  }
  for (const p of PROVIDER_ORDER) {
    if (providerConfigured(p, keys, { localUp })) {
      const id = LLM[p].roles[role] || LLM[p].roles.default;
      if (id) return { provider: p, id };
      if (LLM[p].local) return { provider: p, id: "" };
    }
  }
  return null;
}

/** Build a streaming client for { provider, id }. Throws a friendly Error when a key is missing. */
export function createClient(model, { keys, config = {}, thinking, maxTokens } = {}) {
  const p = LLM[model?.provider];
  if (!p) throw new Error(`Unknown provider "${model?.provider}". Try anthropic, openai, xai, openrouter, gemini, ollama, lmstudio or custom.`);
  const common = { model: model.id, maxTokens: maxTokens ?? config.maxTokens ?? 32000, thinking: thinking ?? config.thinking ?? "medium", providerName: p.name };
  if (p.kind === "mock") return new MockClient({ model: model.id });
  const apiKey = p.key ? keys.get(p.key) : "";
  if (!p.local && !p.optionalKey && !apiKey) throw Object.assign(new Error(`No ${p.name} key yet. Add one with \`lumen keys set ${p.key} <key>\` or set ${p.key === "gemini" ? "GEMINI_API_KEY" : (p.key.toUpperCase() + "_API_KEY")}.`), { code: "no_key" });
  if (!model.id) throw Object.assign(new Error(`Pick a ${p.name} model first (/model).`), { code: "no_model" });
  const baseUrl = baseUrlFor(model.provider, keys);
  if (!baseUrl) throw new Error(`Set a base URL for ${p.name} first (lumen keys set customBaseUrl https://…/v1).`);
  if (p.kind === "anthropic") return new AnthropicClient({ ...common, apiKey, baseUrl });
  if (model.provider === "openai" && config.providers?.openai?.api === "responses") return new OpenAIResponsesClient({ ...common, apiKey, baseUrl });
  return new OpenAIChatClient({ ...common, provider: model.provider, apiKey, baseUrl, usage: p.usage });
}

/** Try the main client; on an error before any output, try the fallback once. */
export class FallbackClient {
  constructor(primary, fallback, label) {
    this.primary = primary; this.fallback = fallback; this.label = label;
    this.provider = primary.provider; this.model = primary.model;
  }
  async *stream(messages, tools, opts = {}) {
    let started = false, failed = null;
    for await (const ev of this.primary.stream(messages, tools, opts)) {
      if (ev.type === "error" && !started) { failed = ev; break; }
      if (ev.type === "text" || ev.type === "tool_calls") started = true;
      yield ev;
    }
    if (!failed || opts.signal?.aborted) return;
    const why = failed.status === 429 ? "rate limit" : failed.status >= 500 || failed.status === 0 ? "provider problem" : `error ${failed.status}`;
    yield { type: "notice", text: `The main model failed (${why}: ${String(failed.message).slice(0, 120)}). Trying ${this.label} once.` };
    yield* this.fallback.stream(messages, tools, opts);
  }
  complete(messages, signal) { return completeText(this, messages, signal); }
}

/** Live model list for a provider; falls back to the built-in catalog. */
export async function listModels(provider, keys) {
  const p = LLM[provider];
  if (!p) return [];
  const builtin = p.models.map((x) => ({ ...x }));
  try {
    const base = baseUrlFor(provider, keys);
    if (provider === "anthropic") {
      const key = keys.get("anthropic");
      if (!key) return builtin;
      const j = await fetchJson(`${(process.env.LUMEN_ANTHROPIC_BASE_URL || base).replace(/\/+$/, "")}/models?limit=100`, { headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION } }, 8000);
      const live = (j.data || []).map((x) => ({ id: x.id, name: x.display_name || x.id, context: x.max_input_tokens || null, vision: true, tools: true, price: builtin.find((b) => b.id === x.id)?.price || null }));
      return live.length ? live : builtin;
    }
    if (provider === "ollama") {
      const j = await fetchJson(`${base.replace(/\/v1$/, "")}/api/tags`, {}, 2000);
      return (j.models || []).map((x) => ({ id: x.name, name: x.name, context: null, vision: /llava|vision|vl|gemma3/i.test(x.name), tools: true, price: { in: 0, out: 0 } }));
    }
    if (provider === "openrouter") {
      const j = await fetchJson(`${base}/models`, {}, 10000);
      const live = (j.data || []).map((x) => ({
        id: x.id, name: x.name || x.id, context: x.context_length || null,
        vision: (x.architecture?.input_modalities || []).includes("image"),
        tools: (x.supported_parameters || []).includes("tools"),
        price: x.pricing ? { in: Number(x.pricing.prompt) * 1e6, out: Number(x.pricing.completion) * 1e6 } : null,
      }));
      rememberOpenRouterModels(live);
      return live.length ? live : builtin;
    }
    if (p.kind === "mock") return builtin;
    const key = p.key ? keys.get(p.key) : "";
    if (!p.local && !p.optionalKey && !key) return builtin;
    const j = await fetchJson(`${base}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} }, 8000);
    const live = (j.data || j.models || []).map((x) => ({ id: String(x.id || x.name).replace(/^models\//, ""), name: x.display_name || x.id || x.name, context: x.context_window || x.context_length || null, vision: undefined, tools: true, price: builtin.find((b) => b.id === x.id)?.price || null }));
    return live.length ? live : builtin;
  } catch {
    return builtin;
  }
}

/** Cheap live check of an LLM key: lists models (no tokens spent). */
export async function testLlm(provider, keys) {
  const p = LLM[provider];
  if (!p) return { ok: false, message: `Unknown provider ${provider}` };
  if (p.kind === "mock") return { ok: true, message: "Mock provider is always available." };
  const key = p.key ? keys.get(p.key) : "";
  if (!p.local && !p.optionalKey && !key) return { ok: false, message: `No ${p.name} key set.` };
  const base = baseUrlFor(provider, keys);
  try {
    if (provider === "anthropic") {
      const j = await fetchJson(`${(process.env.LUMEN_ANTHROPIC_BASE_URL || base).replace(/\/+$/, "")}/models?limit=5`, { headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION } }, 8000);
      return { ok: true, message: `Key works · ${(j.data || []).length}+ models visible` };
    }
    if (provider === "ollama") {
      const j = await fetchJson(`${base.replace(/\/v1$/, "")}/api/tags`, {}, 2000);
      return { ok: true, message: `Ollama is running · ${(j.models || []).length} local models` };
    }
    if (provider === "openrouter") {
      const j = await fetchJson(`${base}/key`, { headers: { authorization: `Bearer ${key}` } }, 8000);
      const d = j.data || {};
      return { ok: true, message: `Key works${d.label ? ` · ${d.label}` : ""}${d.limit_remaining != null ? ` · $${Number(d.limit_remaining).toFixed(2)} left` : ""}` };
    }
    const j = await fetchJson(`${base}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} }, 8000);
    return { ok: true, message: `Key works · ${(j.data || j.models || []).length} models visible` };
  } catch (e) {
    return { ok: false, message: e.status === 401 || e.status === 403 ? `${p.name} rejected the key (${e.status}).` : `Check failed: ${e.message}` };
  }
}
