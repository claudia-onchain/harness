// OpenAI-compatible Chat Completions client (OpenAI, xAI, OpenRouter, Gemini, Ollama, LM Studio, custom).
// Streams text, reasoning deltas (OpenRouter `reasoning`, DeepSeek/Ollama `reasoning_content`), accumulates
// tool calls by index, reads usage (incl. OpenRouter cost) and degrades when a server rejects options.
import { parseSSEJson } from "./sse.js";
import { postWithRetry, errorText, completeText } from "./http.js";

/** Lumen history -> Chat Completions messages (tool images become a follow-up user message). */
export function toChat(messages) {
  const out = [];
  let pendingImages = [];
  const flushImages = () => {
    if (!pendingImages.length) return;
    out.push({ role: "user", content: [{ type: "text", text: "(images returned by the tool calls above)" }, ...pendingImages.map((url) => ({ type: "image_url", image_url: { url } }))] });
    pendingImages = [];
  };
  for (const m of messages) {
    if (m.role !== "tool") flushImages();
    if (m.role === "assistant") {
      const msg = { role: "assistant", content: m.content || (m.tool_calls?.length ? null : "") };
      if (m.tool_calls?.length) msg.tool_calls = m.tool_calls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.function.name, arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments || {}) } }));
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.tool_call_id, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "") });
      if (m.images?.length) pendingImages.push(...m.images);
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  flushImages();
  return out;
}

export class OpenAIChatClient {
  constructor({ provider = "openai", apiKey, model, baseUrl, maxTokens = 16000, thinking = "medium", usage = "openai", providerName = "OpenAI", headers = {} }) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    this.url = String(baseUrl || "").replace(/\/+$/, "");
    this.maxTokens = maxTokens;
    this.thinking = thinking;
    this.usageMode = usage;
    this.providerName = providerName;
    this.extraHeaders = headers;
    this.flags = { tools: true, streamOptions: usage === "openai", reasoning: provider === "openai" || provider === "openrouter", maxTokensField: provider === "openai" ? "max_completion_tokens" : "max_tokens" };
  }

  body(messages, tools) {
    const body = { model: this.model, messages: toChat(messages), stream: true };
    if (this.maxTokens) body[this.flags.maxTokensField] = this.maxTokens;
    if (this.flags.streamOptions) body.stream_options = { include_usage: true };
    if (this.usageMode === "openrouter") body.usage = { include: true };
    if (tools?.length && this.flags.tools) {
      body.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description || "", parameters: t.parameters || { type: "object", properties: {} } } }));
      body.tool_choice = "auto";
    }
    if (this.flags.reasoning && this.thinking && this.thinking !== "off") {
      const effort = this.thinking === "xhigh" ? "high" : this.thinking;
      if (this.provider === "openrouter") body.reasoning = { effort };
      else body.reasoning_effort = effort;
    }
    return body;
  }

  headers() {
    const h = { "content-type": "application/json", ...this.extraHeaders };
    if (this.apiKey) h.authorization = `Bearer ${this.apiKey}`;
    if (this.provider === "openrouter") { h["HTTP-Referer"] = "https://github.com/lumen-agent"; h["X-OpenRouter-Title"] = "Lumen"; h["X-Title"] = "Lumen"; }
    return h;
  }

  async *stream(messages, tools, { signal } = {}) {
    const body = this.body(messages, tools);
    const notices = [];
    const r = await postWithRetry(`${this.url}/chat/completions`, { headers: this.headers(), body, signal, providerName: this.providerName, onRetry: (t) => notices.push(t) });
    for (const t of notices) yield { type: "notice", text: t };
    if (r.aborted) return;
    if (r.error) { yield { type: "error", ...r.error }; return; }
    const res = r.res;
    if (!res.ok) {
      const msg = await errorText(res);
      if (res.status === 400 || res.status === 422 || res.status === 404) {
        if (body.stream_options && /stream_options/i.test(msg)) { this.flags.streamOptions = false; yield* this.stream(messages, tools, { signal }); return; }
        if ((body.reasoning || body.reasoning_effort) && /reason/i.test(msg)) { this.flags.reasoning = false; yield* this.stream(messages, tools, { signal }); return; }
        if (body.max_completion_tokens && /max_completion_tokens/i.test(msg)) { this.flags.maxTokensField = "max_tokens"; yield* this.stream(messages, tools, { signal }); return; }
        if (body.tools && /tool|function/i.test(msg)) {
          this.flags.tools = false;
          yield { type: "notice", text: "This model can't use tools, so it will answer without them." };
          yield* this.stream(messages, null, { signal });
          return;
        }
      }
      yield { type: "error", status: res.status, message: msg };
      return;
    }
    yield* this.read(res.body, signal);
  }

  /** Parse a Chat Completions SSE body into normalized events. Exposed for tests. */
  async *read(source, signal) {
    const calls = new Map();
    let model = this.model, stop = "", text = "", usage = null;
    try {
      for await (const { json: chunk } of parseSSEJson(source)) {
        if (chunk.error) { yield { type: "error", status: Number(chunk.error.code) || 502, message: String(chunk.error.message || "Model error") }; return; }
        if (chunk.model) model = chunk.model;
        const choice = chunk.choices?.[0];
        const d = choice?.delta || {};
        const reasoning = d.reasoning ?? d.reasoning_content;
        if (typeof reasoning === "string" && reasoning) yield { type: "thinking", text: reasoning };
        if (d.content) { text += d.content; yield { type: "text", text: d.content }; }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? calls.size;
          const cur = calls.get(i) || { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) { if (!cur.name) yield { type: "tool_start", id: tc.id, name: tc.function.name }; cur.name += tc.function.name; }
          if (tc.function?.arguments) cur.args += typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments);
          calls.set(i, cur);
        }
        if (choice?.finish_reason) stop = choice.finish_reason;
        if (chunk.usage) {
          const u = chunk.usage;
          usage = { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, cacheRead: u.prompt_tokens_details?.cached_tokens || 0, cacheWrite: 0 };
          if (Number.isFinite(u.cost)) usage.costUsd = u.cost;
        }
      }
    } catch (e) {
      if (signal?.aborted) return;
      yield { type: "error", status: 0, message: `Stream interrupted: ${e.message}` };
      return;
    }
    if (usage) yield { type: "usage", usage, model };
    if (calls.size) {
      const list = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => {
        let args = {}, argsError;
        try { args = c.args ? JSON.parse(c.args) : {}; } catch { argsError = "Tool arguments were not valid JSON."; }
        return { id: c.id || `call_${Date.now().toString(36)}_${i}`, name: c.name, args, ...(argsError ? { argsError } : {}) };
      });
      yield { type: "tool_calls", calls: list };
    }
    yield { type: "done", stop, model, text };
  }

  complete(messages, signal) { return completeText(this, messages, signal); }
}
