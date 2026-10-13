// Native Anthropic Messages API client (streaming SSE): text, adaptive thinking with effort, tool_use,
// prompt caching on the system prompt and last tool, image input, retries, refusal handling and
// server-side fallbacks on the 5.x models. Emits Lumen's normalized events (see llm/index.js).
import { parseSSEJson } from "./sse.js";
import { postWithRetry, errorText, jsonOr, completeText } from "./http.js";

export const ANTHROPIC_VERSION = "2023-06-01";
const toolId = (id, i) => String(id || `toolu_${i}`).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
const KEEP_BLOCKS = new Set(["text", "thinking", "redacted_thinking", "tool_use"]);

function imageBlock(url) {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(String(url || ""));
  if (m) return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
  if (/^https?:\/\//.test(url)) return { type: "image", source: { type: "url", url } };
  return null;
}

function contentBlocks(content) {
  if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];
  const out = [];
  for (const p of Array.isArray(content) ? content : []) {
    if (p?.type === "text" && p.text) out.push({ type: "text", text: String(p.text) });
    else if (p?.type === "image_url") { const b = imageBlock(p.image_url?.url || p.image_url); if (b) out.push(b); }
  }
  return out;
}

/**
 * Lumen history (OpenAI-shaped) -> { system, messages }. Assistant turns produced by this same model keep their
 * raw blocks (thinking included) so the history stays append-only; other turns become text + tool_use blocks.
 */
export function toAnthropic(messages, { model, keepThinking = true } = {}) {
  let system = "";
  const out = [];
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content.push(...blocks);
    else out.push({ role, content: [...blocks] });
  };
  messages.forEach((msg, i) => {
    if (msg.role === "system") { system += (system ? "\n\n" : "") + (typeof msg.content === "string" ? msg.content : contentBlocks(msg.content).map((b) => b.text || "").join("\n")); return; }
    if (msg.role === "user") { const b = contentBlocks(msg.content); push("user", b.length ? b : [{ type: "text", text: "(empty message)" }]); return; }
    if (msg.role === "tool") {
      const text = String(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "")) || "(empty)";
      const imgs = (msg.images || []).map(imageBlock).filter(Boolean);
      const block = { type: "tool_result", tool_use_id: toolId(msg.tool_call_id, i), content: imgs.length ? [{ type: "text", text }, ...imgs] : text };
      if (msg.isError) block.is_error = true;
      push("user", [block]);
      return;
    }
    if (msg.role !== "assistant") return;
    let blocks;
    if (Array.isArray(msg.raw) && msg.raw.length && msg.rawProvider === "anthropic" && (!model || msg.rawModel === model)) {
      blocks = msg.raw.filter((b) => KEEP_BLOCKS.has(b.type) && (keepThinking || (b.type !== "thinking" && b.type !== "redacted_thinking")));
    } else {
      blocks = [];
      if (msg.content && String(msg.content).trim()) blocks.push({ type: "text", text: String(msg.content) });
      (msg.tool_calls || []).forEach((tc, j) => blocks.push({ type: "tool_use", id: toolId(tc.id, `${i}_${j}`), name: String(tc.function?.name || "unknown"), input: jsonOr(tc.function?.arguments, {}) }));
    }
    push("assistant", blocks);
  });
  // Every tool_use needs a matching tool_result in the following user message (an aborted turn can leave one open).
  for (let i = 0; i < out.length; i++) {
    if (out[i].role !== "assistant") continue;
    const ids = out[i].content.filter((b) => b.type === "tool_use").map((b) => b.id);
    if (!ids.length) continue;
    let next = out[i + 1];
    if (!next || next.role !== "user") { next = { role: "user", content: [] }; out.splice(i + 1, 0, next); }
    const have = new Set(next.content.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id));
    const missing = ids.filter((x) => !have.has(x)).map((x) => ({ type: "tool_result", tool_use_id: x, content: "(no result: the turn was stopped)", is_error: true }));
    const results = [...next.content.filter((b) => b.type === "tool_result" && ids.includes(b.tool_use_id)), ...missing];
    next.content = [...results, ...next.content.filter((b) => !(b.type === "tool_result" && ids.includes(b.tool_use_id)))];
  }
  while (out.length && out[0].role !== "user") out.shift();
  return { system, messages: out };
}

const supportsAdaptive = (model) => /claude-(opus|sonnet|haiku|fable|mythos)-5|claude-(opus|sonnet)-4-[6-9]/.test(model);
const supportsFallbacks = (model) => /^claude-(opus-5-5|opus-5$|sonnet-5-5|fable-5-1)/.test(model);

export class AnthropicClient {
  constructor({ apiKey, model, baseUrl, maxTokens = 32000, thinking = "medium", providerName = "Anthropic" }) {
    this.provider = "anthropic";
    this.apiKey = apiKey;
    this.model = model;
    this.url = (process.env.LUMEN_ANTHROPIC_BASE_URL || baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
    this.maxTokens = Math.max(4096, maxTokens);
    this.thinking = thinking;
    this.providerName = providerName;
    this.flags = { eager: true, fallbacks: true, effort: true, keepThinking: true, tools: true };
  }

  body(messages, tools) {
    const { system, messages: msgs } = toAnthropic(messages, { model: this.model, keepThinking: this.flags.keepThinking });
    const body = { model: this.model, max_tokens: this.maxTokens, stream: true, messages: msgs };
    if (system) body.system = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
    if (tools?.length && this.flags.tools) {
      body.tools = tools.map((t) => ({ name: t.name, description: t.description || "", input_schema: t.parameters || { type: "object", properties: {} }, ...(this.flags.eager ? { eager_input_streaming: true } : {}) }));
      body.tools[body.tools.length - 1].cache_control = { type: "ephemeral" };
    }
    if (supportsAdaptive(this.model)) {
      const level = this.thinking || "medium";
      body.thinking = level === "off" ? { type: "adaptive" } : { type: "adaptive", display: "summarized" };
      if (this.flags.effort) body.output_config = { effort: level === "off" ? "low" : level };
    }
    if (this.flags.fallbacks && supportsFallbacks(this.model)) body.fallbacks = "default";
    return body;
  }

  headers(body) {
    const h = { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": ANTHROPIC_VERSION };
    if (body.fallbacks) h["anthropic-beta"] = "server-side-fallback-2026-07-01";
    return h;
  }

  async *stream(messages, tools, { signal } = {}) {
    const body = this.body(messages, tools);
    const notices = [];
    const r = await postWithRetry(`${this.url}/messages`, { headers: this.headers(body), body, signal, providerName: this.providerName, onRetry: (t) => notices.push(t) });
    for (const t of notices) yield { type: "notice", text: t };
    if (r.aborted) return;
    if (r.error) { yield { type: "error", ...r.error }; return; }
    const res = r.res;
    if (!res.ok) {
      const msg = await errorText(res);
      if (res.status === 400) {
        const retry = (flag) => { this.flags[flag] = false; return true; };
        if (body.fallbacks && /fallback/i.test(msg) && retry("fallbacks")) { yield* this.stream(messages, tools, { signal }); return; }
        if (/eager_input_streaming/i.test(msg) && retry("eager")) { yield* this.stream(messages, tools, { signal }); return; }
        if (body.output_config && /effort|output_config/i.test(msg) && retry("effort")) { yield* this.stream(messages, tools, { signal }); return; }
        if (this.flags.keepThinking && /thinking|signature/i.test(msg) && retry("keepThinking")) { yield* this.stream(messages, tools, { signal }); return; }
        if (body.tools && /tool/i.test(msg) && !/tool_use|tool_result/i.test(msg) && retry("tools")) {
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

  /** Parse an Anthropic SSE body into normalized events. Exposed for tests. */
  async *read(source, signal) {
    const blocks = [];
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let model = this.model, stop = "";
    try {
      for await (const { json: ev } of parseSSEJson(source)) {
        switch (ev.type) {
          case "message_start": {
            const u = ev.message?.usage || {};
            if (ev.message?.model) model = ev.message.model;
            usage.input = u.input_tokens || 0; usage.cacheRead = u.cache_read_input_tokens || 0;
            usage.cacheWrite = u.cache_creation_input_tokens || 0; usage.output = u.output_tokens || 0;
            break;
          }
          case "content_block_start": {
            const b = { ...(ev.content_block || {}) };
            if (b.type === "tool_use") { b.json = ""; b.input = {}; }
            if (b.type === "text") b.text = b.text || "";
            if (b.type === "thinking") { b.thinking = b.thinking || ""; b.signature = b.signature || ""; }
            blocks[ev.index] = b;
            if (b.type === "text" && b.text) yield { type: "text", text: b.text };
            if (b.type === "thinking" && b.thinking) yield { type: "thinking", text: b.thinking };
            if (b.type === "tool_use") yield { type: "tool_start", id: b.id, name: b.name };
            break;
          }
          case "content_block_delta": {
            const b = blocks[ev.index], d = ev.delta || {};
            if (!b) break;
            if (d.type === "text_delta" && d.text) { b.text += d.text; yield { type: "text", text: d.text }; }
            else if (d.type === "input_json_delta") b.json += d.partial_json || "";
            else if (d.type === "thinking_delta" && d.thinking) { b.thinking += d.thinking; yield { type: "thinking", text: d.thinking }; }
            else if (d.type === "signature_delta") b.signature = (b.signature || "") + (d.signature || "");
            break;
          }
          case "content_block_stop": {
            const b = blocks[ev.index];
            if (b?.type === "tool_use") {
              try { b.input = b.json ? JSON.parse(b.json) : {}; } catch { b.input = {}; b.badJson = true; }
            }
            if (b) b.done = true;
            break;
          }
          case "message_delta": {
            if (ev.delta?.stop_reason) stop = ev.delta.stop_reason;
            const u = ev.usage || {};
            if (u.output_tokens !== undefined) usage.output = u.output_tokens;
            if (u.input_tokens) usage.input = u.input_tokens;
            if (u.cache_read_input_tokens) usage.cacheRead = u.cache_read_input_tokens;
            if (u.cache_creation_input_tokens) usage.cacheWrite = u.cache_creation_input_tokens;
            break;
          }
          case "error": {
            const e = ev.error || {};
            const status = e.type === "overloaded_error" ? 529 : e.type === "rate_limit_error" ? 429 : e.type === "api_error" ? 500 : 502;
            yield { type: "error", status, message: String(e.message || "Model error") };
            return;
          }
          default: break; // ping, message_stop, unknown
        }
      }
    } catch (e) {
      if (signal?.aborted) return;
      yield { type: "error", status: 0, message: `Stream interrupted: ${e.message}` };
      return;
    }
    yield { type: "usage", usage: { input: usage.input + usage.cacheRead + usage.cacheWrite, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite }, model };
    if (stop === "refusal") { yield { type: "error", status: 422, message: "Claude declined this request." }; return; }
    const raw = blocks.filter((b) => b && b.done).map(({ json, done, badJson, ...b }) => b);
    const calls = blocks.filter((b) => b?.done && b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input || {}, ...(b.badJson ? { argsError: "Tool input was not valid JSON (possibly truncated)." } : {}) }));
    if (stop === "max_tokens" && blocks.some((b) => b?.type === "tool_use" && !b.done)) yield { type: "notice", text: "The reply hit max_tokens in the middle of a tool call." };
    if (calls.length) yield { type: "tool_calls", calls };
    yield { type: "done", stop, model, raw, rawProvider: "anthropic" };
  }

  complete(messages, signal) { return completeText(this, messages, signal); }
}
