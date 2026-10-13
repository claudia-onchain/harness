// The turn loop: stream the model, run requested tools (parallel when safe), feed results back, repeat until
// the model stops calling tools or maxRounds. Steering messages typed while busy are injected after the
// current tool round. Abort stops streaming and tools.
import { estimateCost } from "../llm/catalog.js";
import { id as newId } from "../core/util.js";

const clipResult = (s, n = 4000) => (String(s).length > n ? String(s).slice(0, n) + "…" : String(s));

/**
 * @param o.client     streaming model client
 * @param o.system     system prompt string
 * @param o.messages   history array (mutated: assistant + tool messages are appended)
 * @param o.registry   ToolRegistry
 * @param o.toolCtx    context passed to tools (cwd, keys, approvals, …)
 * @param o.emit       (event) => void
 * @param o.takeSteering () => string[]  queued user messages to inject
 * @param o.onMessage  (msg) => void     persist hook
 * @param o.vision     model accepts images
 */
export async function runTurn(o) {
  const { client, system, messages, registry, toolCtx, emit, signal, sessionId, maxRounds = 24, takeSteering = () => [], onMessage = () => {}, only, vision = true, provider } = o;
  const tools = registry.specs(toolCtx.config, only);
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, lastInput: 0, priced: true };
  let rounds = 0, finalText = "", model = client.model;

  for (; rounds < maxRounds; rounds++) {
    if (signal?.aborted) break;
    emit({ type: "agent_status", state: "thinking", sessionId });
    const msgId = newId("m_");
    let text = "", calls = null, raw = null, rawProvider = null, failed = null, thinking = "";
    for await (const ev of client.stream([{ role: "system", content: system }, ...messages], tools.length ? tools : null, { signal })) {
      if (ev.type === "text") { text += ev.text; emit({ type: "delta", sessionId, id: msgId, text: ev.text }); }
      else if (ev.type === "thinking") { thinking += ev.text; emit({ type: "thinking", sessionId, delta: ev.text }); }
      else if (ev.type === "tool_start") emit({ type: "agent_status", state: "tool", detail: ev.name, sessionId });
      else if (ev.type === "tool_calls") calls = ev.calls;
      else if (ev.type === "usage") {
        const u = ev.usage;
        usage.input += u.input || 0; usage.output += u.output || 0; usage.cacheRead += u.cacheRead || 0; usage.cacheWrite += u.cacheWrite || 0;
        usage.lastInput = u.input || usage.lastInput;
        const c = estimateCost(provider || client.provider, ev.model || client.model, u);
        if (c == null) usage.priced = false; else usage.costUsd += c;
        if (ev.model) model = ev.model;
        emit({ type: "usage", sessionId, usage: { ...usage } });
      }
      else if (ev.type === "notice") emit({ type: "notice", level: "info", text: ev.text, sessionId });
      else if (ev.type === "error") failed = ev;
      else if (ev.type === "done") { raw = ev.raw || null; rawProvider = ev.rawProvider || null; if (ev.model) model = ev.model; }
    }
    if (signal?.aborted) {
      if (text) { const m = { role: "assistant", content: text + "\n\n[stopped]" }; messages.push(m); onMessage(m); }
      break;
    }
    if (failed) {
      emit({ type: "error", sessionId, message: failed.message, status: failed.status });
      if (text) { const m = { role: "assistant", content: text }; messages.push(m); onMessage(m); }
      return { ok: false, error: failed.message, usage, rounds, text: finalText + text, model };
    }
    const assistant = { role: "assistant", content: text, id: msgId };
    if (thinking) assistant.thinking = thinking.slice(0, 20000);
    if (calls?.length) assistant.tool_calls = calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }));
    if (raw) { assistant.raw = raw; assistant.rawProvider = rawProvider; assistant.rawModel = client.model; }
    messages.push(assistant);
    onMessage(assistant);
    if (text) { finalText += (finalText ? "\n\n" : "") + text; emit({ type: "assistant_done", sessionId, id: msgId, text }); }

    if (!calls?.length) {
      const steer = takeSteering();
      if (!steer.length) break;
      for (const s of steer) { const m = { role: "user", content: s }; messages.push(m); onMessage(m); emit({ type: "user", sessionId, id: newId("u_"), text: s, source: "steer" }); }
      continue;
    }

    // Run tools: consecutive parallel-safe calls run together; others run one at a time in order.
    const results = new Array(calls.length);
    let i = 0;
    while (i < calls.length) {
      const batch = [i];
      if (registry.get(calls[i].name)?.safe) while (batch.length < 8 && i + batch.length < calls.length && registry.get(calls[i + batch.length].name)?.safe) batch.push(i + batch.length);
      await Promise.all(batch.map(async (k) => {
        const c = calls[k];
        const t = registry.get(c.name);
        emit({ type: "tool_start", sessionId, callId: c.id, name: c.name, args: c.args, label: t?.label || c.name });
        emit({ type: "agent_status", state: "tool", detail: t?.label || c.name, sessionId });
        const r = c.argsError ? { ok: false, text: `Error: ${c.argsError} Re-send the call with valid JSON arguments.`, summary: "bad arguments" } : await registry.execute(c.name, c.args, { ...toolCtx, signal, sessionId });
        results[k] = r;
        emit({ type: "tool_end", sessionId, callId: c.id, name: c.name, ok: r.ok, summary: r.summary, result: clipResult(r.text) });
      }));
      i += batch.length;
      if (signal?.aborted) break;
    }
    calls.forEach((c, k) => {
      const r = results[k] || { ok: false, text: "(not run: the turn was stopped)" };
      const m = { role: "tool", tool_call_id: c.id, name: c.name, content: r.text, ...(r.ok ? {} : { isError: true }) };
      if (r.images?.length) { if (vision) m.images = r.images; else m.content += "\n(An image was captured but the current model can't see images. Switch to a vision model.)"; }
      messages.push(m);
      onMessage(m.images ? { ...m, images: m.images.map(() => "[image omitted from log]") } : m);
    });
    if (signal?.aborted) break;
    for (const s of takeSteering()) { const m = { role: "user", content: s }; messages.push(m); onMessage(m); emit({ type: "user", sessionId, id: newId("u_"), text: s, source: "steer" }); }
  }
  if (rounds >= maxRounds) emit({ type: "notice", level: "warn", text: `Stopped after ${maxRounds} tool rounds (config maxRounds).`, sessionId });
  return { ok: !signal?.aborted, aborted: !!signal?.aborted, usage, rounds, text: finalText, model };
}
