// xAI Responses API client: plain JSON, SSE streaming, WebSocket mode, compaction and a client-side
// function-calling loop. Every surface returns the same normalised shape so the rest of Pulse never
// looks at raw output items, and every surface reports usage through `onUsage` so the budget code
// meters from what xAI actually charged.
import { parseSSE } from "./sse.js";
import { openSocket } from "./ws.js";
import { createRequester } from "./http.js";
import { summarizeUsage, addUsage } from "./cost.js";
import { GrokError, GrokAbortError, GrokToolError, GrokInvalidRequestError, errorFromEvent } from "./errors.js";

const X_STATUS = /^https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/[^/?#]+\/status\/\d+/i;
const TERMINAL = new Set(["response.completed", "response.incomplete", "response.failed", "response.cancelled"]);

export const citationKind = (url) => (X_STATUS.test(String(url || "")) ? "x" : "web");

/** Did the request ask for JSON? (`text.format.type` is json_schema or json_object.) */
export const wantsJson = (body) => /^json_/.test(String(body?.text?.format?.type || ""));

/** Lenient JSON parse for function-call arguments: the model is strict, the network may not be. */
function parseArgs(s) {
  if (s && typeof s === "object") return s;
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

/** Raw Responses object → { id, status, model, text, output, functionCalls, citations, json, usage, raw }. */
export function normalizeResponse(raw, { expectJson = false } = {}) {
  const output = Array.isArray(raw?.output) ? raw.output : [];
  const texts = [];
  const citations = [];
  let offset = 0;
  for (const item of output) {
    if (item?.type !== "message") continue;
    for (const part of item.content || []) {
      if (part?.type !== "output_text") continue;
      const text = String(part.text ?? "");
      for (const a of part.annotations || []) {
        if (a?.type !== "url_citation") continue;
        citations.push({ url: a.url, title: a.title ?? "", start: offset + (a.start_index ?? 0), end: offset + (a.end_index ?? 0), kind: citationKind(a.url) });
      }
      texts.push(text);
      offset += text.length;
    }
  }
  const text = texts.join("");
  const functionCalls = output.filter((i) => i?.type === "function_call").map((i) => ({ callId: i.call_id, name: i.name, args: parseArgs(i.arguments), argsRaw: i.arguments, id: i.id }));
  let json;
  if (expectJson) {
    try { json = JSON.parse(text); } catch (e) {
      throw new GrokError(`structured output was not valid JSON: ${e.message}`, { code: "invalid_json", data: { text: text.slice(0, 2000) }, cause: e });
    }
  }
  return {
    id: raw?.id, status: raw?.status, model: raw?.model, text, output, functionCalls, citations, json,
    usage: summarizeUsage(raw?.usage), incompleteDetails: raw?.incomplete_details ?? null, raw,
  };
}

/* ----------------------------------------------------------------------------------------------- tools */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoDate(v, label) {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!DATE.test(s)) throw new GrokInvalidRequestError(`${label} must be YYYY-MM-DD, got "${s}"`);
  return s;
}
function handles(list, label) {
  if (!list) return undefined;
  const arr = (Array.isArray(list) ? list : String(list).split(",")).map((h) => String(h).trim().replace(/^@+/, "")).filter(Boolean);
  if (!arr.length) return undefined;
  if (arr.length > 20) throw new GrokInvalidRequestError(`${label}: at most 20 handles (got ${arr.length})`);
  return [...new Set(arr)];
}
function domains(list, label) {
  if (!list) return undefined;
  const arr = (Array.isArray(list) ? list : String(list).split(",")).map((d) => String(d).trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
  if (!arr.length) return undefined;
  if (arr.length > 5) throw new GrokInvalidRequestError(`${label}: at most 5 domains (got ${arr.length})`);
  return [...new Set(arr)];
}

export const tools = {
  xSearch({ allowedHandles, excludedHandles, fromDate, toDate, images = false, video = false } = {}) {
    const t = { type: "x_search" };
    const allowed = handles(allowedHandles, "allowedHandles");
    const excluded = handles(excludedHandles, "excludedHandles");
    if (allowed && excluded) throw new GrokInvalidRequestError("x_search: allowedHandles and excludedHandles are mutually exclusive");
    if (allowed) t.allowed_x_handles = allowed;
    if (excluded) t.excluded_x_handles = excluded;
    const from = isoDate(fromDate, "fromDate"), to = isoDate(toDate, "toDate");
    if (from && to && from >= to) throw new GrokInvalidRequestError(`x_search: toDate is exclusive and must be after fromDate (${from} .. ${to})`);
    if (from) t.from_date = from;
    if (to) t.to_date = to;
    if (images) t.enable_image_understanding = true;
    if (video) t.enable_video_understanding = true;
    return t;
  },
  webSearch({ allowedDomains, excludedDomains, images = false, imageSearch = false } = {}) {
    const t = { type: "web_search" };
    const allowed = domains(allowedDomains, "allowedDomains");
    const excluded = domains(excludedDomains, "excludedDomains");
    if (allowed && excluded) throw new GrokInvalidRequestError("web_search: allowedDomains and excludedDomains are mutually exclusive");
    if (allowed || excluded) t.filters = allowed ? { allowed_domains: allowed } : { excluded_domains: excluded };
    if (images) t.enable_image_understanding = true;
    if (imageSearch) t.enable_image_search = true;
    return t;
  },
  codeInterpreter: () => ({ type: "code_interpreter" }),
  fileSearch({ collectionIds, maxResults } = {}) {
    const ids = (Array.isArray(collectionIds) ? collectionIds : [collectionIds]).filter(Boolean);
    if (!ids.length) throw new GrokInvalidRequestError("file_search needs at least one collection id");
    const t = { type: "file_search", vector_store_ids: ids };
    if (maxResults) t.max_num_results = maxResults;
    return t;
  },
  mcp({ serverUrl, serverLabel, headers, allowedTools, authorization, description } = {}) {
    if (!serverUrl) throw new GrokInvalidRequestError("mcp needs serverUrl");
    const t = { type: "mcp", server_url: serverUrl, server_label: serverLabel || new URL(serverUrl).hostname.replace(/\W+/g, "_") };
    if (description) t.server_description = description;
    if (allowedTools?.length) t.allowed_tools = allowedTools;
    if (authorization) t.authorization = authorization;
    if (headers && Object.keys(headers).length) t.headers = headers;
    return t;
  },
  imageGeneration: ({ action = "auto" } = {}) => ({ type: "image_generation", action }),
  fn: (name, description, parameters = { type: "object", properties: {}, additionalProperties: false }) => ({ type: "function", name, description, parameters, strict: true }),
};

/** `text` param for structured output. */
export const jsonSchema = (name, schema) => ({ format: { type: "json_schema", name, strict: true, schema } });

/* ---------------------------------------------------------------------------------------------- client */

export function createGrok({
  apiKey, baseUrl = "https://api.x.ai", fetch: fetchImpl, timeoutMs = 300_000, safetyIdentifier, onUsage,
  maxRetries = 3, retryBaseMs = 1000, retryMaxMs = 30_000, sleep,
} = {}) {
  const { request, json, baseUrl: base } = createRequester({ apiKey, baseUrl, fetch: fetchImpl, timeoutMs, maxRetries, retryBaseMs, retryMaxMs, sleep });

  const prepare = (body) => {
    const b = { ...body };
    if (safetyIdentifier && !b.safety_identifier) b.safety_identifier = safetyIdentifier;
    return b;
  };
  const report = (usage, body, response) => { try { onUsage?.(usage, { body, response }); } catch { /* metering must never break a call */ } };

  function finish(raw, body) {
    if (raw?.status === "failed" || (raw?.error && !raw?.output?.length)) throw errorFromEvent(raw.error || raw);
    const out = normalizeResponse(raw, { expectJson: wantsJson(body) });
    report(out.usage, body, out);
    return out;
  }

  async function respond(body, { signal } = {}) {
    const b = prepare(body);
    delete b.stream;
    return finish(await json("POST", "/v1/responses", b, { signal }), b);
  }

  /** Run one event stream (SSE or WS) to its terminal event, returning the raw final response. */
  function streamCollector({ onEvent, onText }) {
    let text = "";
    const items = [];
    let final = null;
    let error = null;
    const feed = (ev) => {
      const type = ev?.type || "";
      try { onEvent?.(ev); } catch { /* observer errors must not kill the stream */ }
      if (type === "response.output_text.delta") { const d = ev.delta ?? ""; text += d; if (d) onText?.(d); }
      else if (type === "response.output_item.done" && ev.item) items.push(ev.item);
      else if (type === "error" || type === "response.error") error = errorFromEvent(ev);
      else if (TERMINAL.has(type)) final = ev.response || null;
      return !!(final || error);
    };
    // A stream that dies without response.completed still gave us deltas and finished items: salvage them.
    const result = () => {
      if (error) throw error;
      if (final) return final;
      if (!items.length && !text) return null;
      const output = items.length ? items : [{ type: "message", role: "assistant", status: "incomplete", content: [{ type: "output_text", text, annotations: [] }] }];
      return { id: undefined, status: "incomplete", output, usage: {} };
    };
    return { feed, result };
  }

  async function stream(body, { onEvent, onText, signal } = {}) {
    const b = { ...prepare(body), stream: true };
    const res = await request("POST", "/v1/responses", b, { signal });
    const col = streamCollector({ onEvent, onText });
    for await (const ev of parseSSE(res.body)) {
      if (!ev.data || ev.data === "[DONE]") continue;
      let j;
      try { j = JSON.parse(ev.data); } catch { continue; }
      if (!j.type && ev.event && ev.event !== "message") j.type = ev.event;
      if (col.feed(j)) break;
    }
    const raw = col.result();
    if (!raw) throw new GrokError("stream ended without a response", { code: "stream_ended" });
    return finish(raw, b);
  }

  /* -------------------------------------------------------------------------------------- websocket */

  function wsUrl() {
    const u = new URL(base);
    u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
    u.pathname = `${u.pathname.replace(/\/+$/, "")}/v1/responses`;
    return u.toString();
  }

  async function connect({ onEvent } = {}) {
    let sock = null;
    let lastResponseId = null;
    let closed = false;
    const queue = [];
    let busy = false;

    async function socket() {
      if (sock?.open) return sock;
      sock = await openSocket(wsUrl(), { headers: { authorization: `Bearer ${apiKey}` }, timeoutMs: Math.min(timeoutMs, 30_000) });
      return sock;
    }

    function runTurn(body, { signal, onText, attempt = 0 }) {
      return new Promise((resolve, reject) => {
        let ws;
        const col = streamCollector({ onEvent, onText });
        let settled = false;
        const cleanup = () => { settled = true; ws?.off("message", onMessage); ws?.off("close", onClose); ws?.off("error", onError); signal?.removeEventListener("abort", onAbort); };
        const settle = (fn) => (v) => { if (settled) return; cleanup(); fn(v); };
        const done = settle(resolve), fail = settle(reject);
        // A socket that hits the 25-minute limit (or just drops) gets one transparent reconnect per turn;
        // xAI's error event tells us which case we are in. The error event and the close that follows
        // it must count as one failure, hence the settled guard.
        const retry = (why) => {
          if (settled) return;
          cleanup();
          try { sock?.close(); } catch { /* already gone */ }
          sock = null;
          if (attempt < 1 && !closed) runTurn(body, { signal, onText, attempt: attempt + 1 }).then(resolve, reject);
          else reject(why instanceof Error ? why : new GrokError(`WebSocket turn failed: ${why}`, { code: "ws_closed", retryable: true }));
        };
        const onMessage = (data) => {
          let ev;
          try { ev = JSON.parse(String(data)); } catch { return; }
          if ((ev.type === "error" || ev.type === "response.error") && (ev.error?.code || ev.code) === "websocket_connection_limit_reached") { retry(errorFromEvent(ev)); return; }
          if (!col.feed(ev)) return;
          try {
            const raw = col.result();
            if (!raw) throw new GrokError("WebSocket turn ended without a response", { code: "stream_ended" });
            done(finish(raw, body));
          } catch (e) { fail(e); }
        };
        const onClose = (info) => retry(info?.reason || "socket closed");
        const onError = (e) => retry(e);
        const onAbort = () => fail(new GrokAbortError());
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener("abort", onAbort, { once: true });
        socket().then((s) => {
          ws = s;
          ws.on("message", onMessage);
          ws.on("close", onClose);
          ws.on("error", onError);
          const msg = { type: "response.create", ...prepare(body) };
          delete msg.stream;
          delete msg.background;
          ws.send(JSON.stringify(msg));
        }, (e) => fail(new GrokError(`could not open WebSocket: ${e.message}`, { code: "ws_connect", retryable: true, status: e.status, cause: e })));
      });
    }

    async function pump() {
      if (busy) return;
      busy = true;
      while (queue.length) {
        const job = queue.shift();
        try {
          const r = await runTurn(job.body, job.opts);
          if (r.id) lastResponseId = r.id;
          job.resolve(r);
        } catch (e) { job.reject(e); }
      }
      busy = false;
    }

    const turn = (body, opts = {}) => new Promise((resolve, reject) => {
      if (closed) { reject(new GrokError("connection closed", { code: "ws_closed" })); return; }
      queue.push({ body, opts, resolve, reject });
      pump();
    });

    await socket();
    return {
      turn,
      warm: (body, opts) => turn({ ...body, generate: false }, opts),
      close() { closed = true; for (const j of queue.splice(0)) j.reject(new GrokError("connection closed", { code: "ws_closed" })); sock?.close(); sock = null; },
      get lastResponseId() { return lastResponseId; },
      get open() { return !closed && !!sock?.open; },
      get pending() { return queue.length + (busy ? 1 : 0); },
    };
  }

  /* --------------------------------------------------------------------------------------- compact */

  async function compact({ model, input }, { signal } = {}) {
    const body = prepare({ model, input });
    const raw = await json("POST", "/v1/responses/compact", body, { signal });
    const compaction = (raw.output || []).find((i) => i?.type === "compaction") || null;
    if (!compaction) throw new GrokError("compact: no compaction item in response", { code: "bad_response", data: raw });
    const usage = summarizeUsage(raw.usage);
    report(usage, body, raw);
    return { id: raw.id, compaction, droppedMessages: raw.usage?.dropped_message_count ?? 0, usage, raw };
  }

  /* -------------------------------------------------------------------------------------- runTools */

  async function runTools(body, handlers = {}, { maxRounds = 8, signal, onRound } = {}) {
    let res = await respond(body, { signal });
    let rounds = 1;
    let totalUsage = res.usage;
    const calls = [];
    while (res.functionCalls.length && rounds < maxRounds) {
      const outputs = [];
      for (const fc of res.functionCalls) {
        const output = await runHandler(handlers, fc);
        calls.push({ round: rounds, name: fc.name, args: fc.args, output });
        outputs.push({ type: "function_call_output", call_id: fc.callId, output });
      }
      onRound?.({ round: rounds, response: res, outputs });
      // `instructions` cannot ride along with previous_response_id; tool_choice must not be pinned or the loop never ends.
      const next = { ...body, previous_response_id: res.id, input: outputs };
      delete next.instructions;
      delete next.tool_choice;
      res = await respond(next, { signal });
      rounds++;
      totalUsage = addUsage(totalUsage, res.usage);
    }
    return { ...res, rounds, totalUsage, calls, exhausted: res.functionCalls.length > 0 };
  }

  async function runHandler(handlers, fc) {
    const h = handlers[fc.name];
    if (typeof h !== "function") return JSON.stringify({ error: new GrokToolError(`no handler for tool "${fc.name}"`).message });
    try {
      const r = await h(fc.args, fc);
      return typeof r === "string" ? r : JSON.stringify(r ?? null);
    } catch (e) {
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  return {
    respond, stream, connect, compact, runTools, tools, jsonSchema,
    get: (id, opts) => json("GET", `/v1/responses/${encodeURIComponent(id)}`, undefined, opts),
    delete: (id, opts) => json("DELETE", `/v1/responses/${encodeURIComponent(id)}`, undefined, opts),
    request, baseUrl: base,
  };
}
