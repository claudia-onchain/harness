// OpenAI Responses API client (optional: config.providers.openai.api = "responses").
import { parseSSEJson } from "./sse.js";
import { postWithRetry, errorText, completeText } from "./http.js";

export function toResponsesInput(messages) {
  let instructions = "";
  const input = [];
  for (const m of messages) {
    if (m.role === "system") { instructions += (instructions ? "\n\n" : "") + (typeof m.content === "string" ? m.content : ""); continue; }
    if (m.role === "user") {
      const parts = typeof m.content === "string" ? [{ type: "input_text", text: m.content }]
        : (m.content || []).map((p) => (p.type === "text" ? { type: "input_text", text: p.text } : p.type === "image_url" ? { type: "input_image", image_url: p.image_url?.url || p.image_url } : null)).filter(Boolean);
      input.push({ role: "user", content: parts });
    } else if (m.role === "assistant") {
      if (m.content) input.push({ role: "assistant", content: [{ type: "output_text", text: String(m.content) }] });
      for (const tc of m.tool_calls || []) input.push({ type: "function_call", call_id: tc.id, name: tc.function.name, arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments || {}) });
    } else if (m.role === "tool") {
      input.push({ type: "function_call_output", call_id: m.tool_call_id, output: typeof m.content === "string" ? m.content : JSON.stringify(m.content) });
      if (m.images?.length) input.push({ role: "user", content: m.images.map((url) => ({ type: "input_image", image_url: url })) });
    }
  }
  return { instructions, input };
}

export class OpenAIResponsesClient {
  constructor({ provider = "openai", apiKey, model, baseUrl, maxTokens = 16000, thinking = "medium", providerName = "OpenAI" }) {
    Object.assign(this, { provider, apiKey, model, maxTokens, thinking, providerName });
    this.url = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.flags = { reasoning: true };
  }

  async *stream(messages, tools, { signal } = {}) {
    const { instructions, input } = toResponsesInput(messages);
    const body = { model: this.model, input, stream: true, max_output_tokens: this.maxTokens };
    if (instructions) body.instructions = instructions;
    if (tools?.length) body.tools = tools.map((t) => ({ type: "function", name: t.name, description: t.description || "", parameters: t.parameters || { type: "object", properties: {} }, strict: false }));
    if (this.flags.reasoning && this.thinking !== "off") body.reasoning = { effort: this.thinking === "xhigh" ? "high" : this.thinking, summary: "auto" };
    const r = await postWithRetry(`${this.url}/responses`, { headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` }, body, signal, providerName: this.providerName });
    if (r.aborted) return;
    if (r.error) { yield { type: "error", ...r.error }; return; }
    if (!r.res.ok) {
      const msg = await errorText(r.res);
      if (r.res.status === 400 && body.reasoning && /reason/i.test(msg)) { this.flags.reasoning = false; yield* this.stream(messages, tools, { signal }); return; }
      yield { type: "error", status: r.res.status, message: msg };
      return;
    }
    yield* this.read(r.res.body, signal);
  }

  async *read(source, signal) {
    const items = new Map();
    let model = this.model, usage = null, stop = "";
    try {
      for await (const { json: ev } of parseSSEJson(source)) {
        switch (ev.type) {
          case "response.output_text.delta": if (ev.delta) yield { type: "text", text: ev.delta }; break;
          case "response.reasoning_summary_text.delta": if (ev.delta) yield { type: "thinking", text: ev.delta }; break;
          case "response.output_item.added":
            if (ev.item?.type === "function_call") { items.set(ev.item.id || ev.output_index, { call_id: ev.item.call_id, name: ev.item.name, args: ev.item.arguments || "" }); yield { type: "tool_start", id: ev.item.call_id, name: ev.item.name }; }
            break;
          case "response.function_call_arguments.delta": { const it = items.get(ev.item_id ?? ev.output_index); if (it) it.args += ev.delta || ""; break; }
          case "response.function_call_arguments.done": { const it = items.get(ev.item_id ?? ev.output_index); if (it && ev.arguments) it.args = ev.arguments; break; }
          case "response.output_item.done":
            if (ev.item?.type === "function_call") { const it = items.get(ev.item.id ?? ev.output_index); if (it) { it.args = ev.item.arguments ?? it.args; it.done = true; } }
            break;
          case "response.completed": {
            const u = ev.response?.usage || {};
            model = ev.response?.model || model;
            stop = ev.response?.status || "completed";
            usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.input_tokens_details?.cached_tokens || 0, cacheWrite: 0 };
            break;
          }
          case "error": case "response.failed":
            yield { type: "error", status: 502, message: ev.message || ev.error?.message || ev.response?.error?.message || "Model error" };
            return;
          default: break;
        }
      }
    } catch (e) {
      if (signal?.aborted) return;
      yield { type: "error", status: 0, message: `Stream interrupted: ${e.message}` };
      return;
    }
    if (usage) yield { type: "usage", usage, model };
    const calls = [...items.values()].map((c) => { let args = {}; try { args = JSON.parse(c.args || "{}"); } catch { /* bad json */ } return { id: c.call_id, name: c.name, args }; });
    if (calls.length) yield { type: "tool_calls", calls };
    yield { type: "done", stop, model };
  }

  complete(messages, signal) { return completeText(this, messages, signal); }
}
