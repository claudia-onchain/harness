#!/usr/bin/env node
// Dependency-free stand-in for api.x.ai: Responses (JSON, SSE, WebSocket), compaction, Imagine images
// and videos with deferred jobs, canned X posts with real-looking citations, exact cost ticks on every
// reply. Deterministic on purpose so tests can assert on it; `node test/mock-grok.js` runs it for demos.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { acceptUpgrade } from "../src/grok/ws.js";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_POSTS = JSON.parse(readFileSync(join(here, "fixtures", "posts.json"), "utf8"));
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const WEB_CITATION = { url: "https://www.coingecko.com/en/coins/solana", title: "Solana price today" };

export function startMockGrok({ port = 0, host = "127.0.0.1", posts = DEFAULT_POSTS, costTicks = 12345678, log = false } = {}) {
  const state = { posts: [...posts], costTicks, calls: [], responses: new Map(), jobs: new Map(), seq: 0, rateLimited: new Set(), serverErrored: new Set(), wsLimitFired: false };
  const nextId = (p) => `${p}_${String(++state.seq).padStart(6, "0")}`;

  const usage = (extra = {}) => ({
    input_tokens: 120, output_tokens: 48, total_tokens: 168,
    input_tokens_details: { cached_tokens: 32 }, output_tokens_details: { reasoning_tokens: 8 },
    cost_in_usd_ticks: state.costTicks, cost_in_nano_usd: Math.round(state.costTicks / 10),
    num_sources_used: 0, num_server_side_tools_used: 0,
    server_side_tool_usage_details: { web_search_calls: 0, x_search_calls: 0, x_posts_fetched: 0, x_users_fetched: 0, code_interpreter_calls: 0, file_search_calls: 0, mcp_calls: 0, document_search_calls: 0, image_generation_calls: 0 },
    ...extra,
  });

  /* ------------------------------------------------------------------------------ response building */

  function inputText(input) {
    if (typeof input === "string") return input;
    const parts = [];
    for (const item of Array.isArray(input) ? input : []) {
      if (typeof item === "string") parts.push(item);
      else if (typeof item?.content === "string") parts.push(item.content);
      else if (Array.isArray(item?.content)) for (const c of item.content) if (c?.text) parts.push(c.text);
      else if (item?.type === "function_call_output") parts.push(`[tool:${item.call_id}] ${item.output}`);
    }
    return parts.join("\n");
  }
  const toolOutputs = (input) => (Array.isArray(input) ? input.filter((i) => i?.type === "function_call_output") : []);

  /** Fill a JSON schema with plausible values; url/handle/text keys draw from the canned posts. */
  function fill(schema, { key = "", posts = state.posts, idx = 0, defs = {} } = {}) {
    if (!schema || typeof schema !== "object") return null;
    if (schema.$ref) return fill(defs[schema.$ref.replace(/^#\/(\$defs|definitions)\//, "")], { key, posts, idx, defs });
    if ("const" in schema) return schema.const;
    if (schema.enum?.length) return schema.enum[idx % schema.enum.length];
    const alt = schema.anyOf || schema.oneOf || schema.allOf;
    if (alt?.length) return fill(alt[0], { key, posts, idx, defs: { ...defs, ...(schema.$defs || {}) } });
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type || (schema.properties ? "object" : "string");
    const post = posts[idx % Math.max(1, posts.length)];
    const k = key.toLowerCase();
    switch (type) {
      case "object": {
        const out = {};
        const d = { ...defs, ...(schema.$defs || schema.definitions || {}) };
        for (const [name, sub] of Object.entries(schema.properties || {})) out[name] = fill(sub, { key: name, posts, idx, defs: d });
        return out;
      }
      case "array": {
        const n = Math.max(schema.minItems || 0, Math.min(schema.maxItems ?? 3, /post|cit|source/.test(k) ? Math.min(3, posts.length) : 2));
        return Array.from({ length: n }, (_, i) => fill(schema.items, { key: key.replace(/s$/, ""), posts, idx: i, defs }));
      }
      case "string":
        if (schema.format === "date") return "2026-10-13";
        if (schema.format === "date-time") return "2026-10-13T12:00:00Z";
        if (schema.format === "uri" || /url|link/.test(k)) return post?.url || "https://x.com/mock/status/1";
        if (/handle|author|user/.test(k)) return post?.handle || "mock";
        if (/text|snippet|quote|why|reason/.test(k)) return post?.text || "mock text";
        if (/headline|title/.test(k)) return "$SOL ETF approval and Alpenglow drive a risk-on day";
        if (/summary|body/.test(k)) return "Spot SOL ETFs with staking were approved while Hyperliquid's HIP-5 went live; crypto Twitter is leaning bullish on both.";
        if (/severity|level/.test(k)) return "medium";
        if (/stance|sentiment|side/.test(k)) return "bullish";
        if (/theme|topic|tag/.test(k)) return "ETF approval";
        return `${key || "value"}`;
      case "integer": return clamp(/count|n$|len/.test(k) ? 3 : 1, schema);
      case "number": return clamp(/sentiment/.test(k) ? 0.62 : /velocity|score|strength|confidence/.test(k) ? 0.8 : 1.5, schema);
      case "boolean": return true;
      case "null": return null;
      default: return null;
    }
  }
  const clamp = (v, s) => Math.min(s.maximum ?? Infinity, Math.max(s.minimum ?? -Infinity, v));

  /** Place url_citation annotations wherever a post URL (or the web URL) appears in `text`. */
  function cite(text, posts, web) {
    const ann = [];
    const push = (url, title) => { const i = text.indexOf(url); if (i >= 0) ann.push({ type: "url_citation", url, title, start_index: i, end_index: i + url.length }); };
    posts.forEach((p, n) => push(p.url, String(n + 1)));
    if (web) push(WEB_CITATION.url, WEB_CITATION.title);
    return ann;
  }

  function build(body) {
    const id = nextId("resp");
    const text = inputText(body.input);
    const toolsIn = Array.isArray(body.tools) ? body.tools : [];
    const fns = toolsIn.filter((t) => t?.type === "function");
    const hasX = toolsIn.some((t) => t?.type === "x_search");
    const hasWeb = toolsIn.some((t) => t?.type === "web_search");
    const outputs = toolOutputs(body.input);
    const u = usage();
    const output = [];
    let posts = [];
    if (hasX) {
      const x = toolsIn.find((t) => t.type === "x_search");
      const allow = x.allowed_x_handles?.map((h) => h.toLowerCase());
      const deny = x.excluded_x_handles?.map((h) => h.toLowerCase()) || [];
      posts = state.posts.filter((p) => (!allow || allow.includes(p.handle.toLowerCase())) && !deny.includes(p.handle.toLowerCase()));
      if (x.from_date) posts = posts.filter((p) => p.created_at.slice(0, 10) >= x.from_date);
      if (x.to_date) posts = posts.filter((p) => p.created_at.slice(0, 10) < x.to_date);
      u.server_side_tool_usage_details.x_search_calls = 1;
      u.server_side_tool_usage_details.x_posts_fetched = posts.length;
      u.num_sources_used += posts.length;
      u.num_server_side_tools_used += 1;
    }
    if (hasWeb) { u.server_side_tool_usage_details.web_search_calls = 1; u.num_sources_used += 1; u.num_server_side_tools_used += 1; }

    // "call_tool" asks for one function call; "call_tool_forever" keeps asking on every follow-up in the
    // chain so maxRounds can be exercised. The flag is inherited through previous_response_id.
    const forever = /call_tool_forever/.test(text) || !!state.responses.get(body.previous_response_id)?.forever;
    const wantsCall = fns.length && ((/call_tool/.test(text) && !outputs.length) || forever);
    if (wantsCall) {
      const fn = fns[0];
      const m = /call_tool(?:_forever)?\s*(\{.*\})?/s.exec(text);
      let args = {};
      try { args = m?.[1] ? JSON.parse(m[1]) : { query: text.slice(0, 60) }; } catch { args = { query: text.slice(0, 60) }; }
      output.push({ type: "function_call", id: nextId("fc"), call_id: nextId("call"), name: fn.name, arguments: JSON.stringify(args), status: "completed" });
      return { id, output, usage: u, forever };
    }

    let reply;
    const fmt = body.text?.format;
    if (fmt?.type === "json_schema") reply = JSON.stringify(fill(fmt.schema, { posts: posts.length ? posts : state.posts }));
    else if (fmt?.type === "json_object") reply = JSON.stringify({ answer: `Mock Grok heard: ${text.slice(0, 200)}`, posts: posts.map((p) => p.url) });
    else if (outputs.length) reply = `Tool results received: ${outputs.map((o) => o.output).join(" | ")}`;
    else if (hasX) {
      const lines = posts.map((p, i) => `${i + 1}. @${p.handle}: "${p.text}" ${p.url}`);
      reply = `Here is what crypto Twitter is saying about $SOL and $HYPE right now:\n\n${lines.join("\n")}${hasWeb ? `\n\nPrice context: ${WEB_CITATION.url}` : ""}`;
    } else if (hasWeb) reply = `Web says: see ${WEB_CITATION.url} for current prices.`;
    else reply = `Mock Grok heard: ${text.slice(0, 500)}`;
    if (body.previous_response_id) reply = `[continuing ${body.previous_response_id}] ${reply}`;
    const message = { type: "message", id: nextId("msg"), role: "assistant", status: "completed", content: [{ type: "output_text", text: reply, annotations: cite(reply, posts, hasWeb) }] };
    if (/grok-4\.7/.test(body.model || "")) output.push({ type: "reasoning", id: nextId("rs"), encrypted_content: Buffer.from("mock-reasoning").toString("base64"), summary: [] });
    output.push(message);
    return { id, output, usage: u };
  }

  function responseObject(body, built, status = "completed") {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: built.id, object: "response", model: body.model || "grok-4.3", status, created_at: now, completed_at: status === "completed" ? now : null,
      incomplete_details: null, error: null, output: built.output, usage: built.usage, store: body.store !== false,
      previous_response_id: body.previous_response_id ?? null, safety_identifier: body.safety_identifier ?? null, text: body.text ?? { format: { type: "text" } },
    };
  }

  /** Validation shared by HTTP, SSE and WS. Returns {status, error} or null. */
  function validate(body) {
    if (!body?.model) return { status: 400, error: { code: "invalid_request_error", message: "model is required" } };
    if (body.input == null && body.generate !== false) return { status: 400, error: { code: "invalid_request_error", message: "input is required" } };
    if (body.previous_response_id && !state.responses.has(body.previous_response_id)) return { status: 404, error: { code: "previous_response_not_found", message: `response ${body.previous_response_id} not found` } };
    const text = inputText(body.input);
    if (/rate_limit_me/.test(text) && !state.rateLimited.has(text)) { state.rateLimited.add(text); return { status: 429, headers: { "retry-after": "1" }, error: { code: "rate_limit_exceeded", message: "Too many requests, slow down" } }; }
    if (/server_error_me/.test(text) && !state.serverErrored.has(text)) { state.serverErrored.add(text); return { status: 503, error: { code: "service_unavailable", message: "upstream hiccup" } }; }
    return null;
  }

  /** The event sequence a streamed response produces, identical for SSE and WebSocket. */
  function* events(body) {
    const built = body.generate === false ? { id: nextId("resp"), output: [], usage: usage() } : build(body);
    const full = responseObject(body, built);
    state.responses.set(full.id, { ...full, request: body, forever: built.forever });
    yield { type: "response.created", response: { ...full, status: "in_progress", output: [], usage: null } };
    for (const [i, item] of full.output.entries()) {
      yield { type: "response.output_item.added", output_index: i, item: { ...item, content: item.type === "message" ? [] : undefined, status: "in_progress" } };
      if (item.type === "message") {
        const text = item.content[0].text;
        const step = Math.max(1, Math.ceil(text.length / 3));
        for (let p = 0; p < text.length; p += step) yield { type: "response.output_text.delta", output_index: i, content_index: 0, delta: text.slice(p, p + step) };
        yield { type: "response.output_text.done", output_index: i, content_index: 0, text };
      }
      yield { type: "response.output_item.done", output_index: i, item };
    }
    yield { type: "mock.unknown_event", note: "clients must tolerate events they do not know" };
    yield { type: "response.completed", response: full };
  }

  /* -------------------------------------------------------------------------------------- http */

  const send = (res, status, body, headers = {}) => {
    const data = Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { "content-type": Buffer.isBuffer(body) ? headers["content-type"] || "application/octet-stream" : "application/json", "content-length": data.length, "x-zero-data-retention": "false", ...headers });
    res.end(data);
  };
  const fail = (res, status, code, message, headers) => send(res, status, { error: { code, message, type: "api_error" } }, headers);
  const readJson = (req) => new Promise((ok, no) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { const t = Buffer.concat(chunks).toString("utf8"); try { ok(t ? JSON.parse(t) : {}); } catch (e) { no(e); } });
    req.on("error", no);
  });
  const authed = (req) => /^Bearer\s+\S+/.test(req.headers.authorization || "");

  function mediaUrl(name) { return `${state.url}/media/${name}`; }
  function imageData(body, n) {
    return Array.from({ length: n }, (_, i) => (body.response_format === "b64_json" ? { b64_json: PNG_1x1.toString("base64"), mime_type: "image/png" } : { url: mediaUrl(`${nextId("img")}_${i}.png`), mime_type: "image/png" }));
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://mock");
    const path = url.pathname;
    if (path === "/health") return send(res, 200, { ok: true, posts: state.posts.length });
    if (path.startsWith("/media/")) return send(res, 200, path.endsWith(".mp4") ? Buffer.from("MOCKMP4\0" + path) : PNG_1x1, { "content-type": path.endsWith(".mp4") ? "video/mp4" : "image/png" });
    if (!authed(req)) return fail(res, 401, "invalid_api_key", "Incorrect API key provided. Set the Authorization: Bearer header.");
    let body = {};
    if (req.method === "POST" || req.method === "PUT") { try { body = await readJson(req); } catch { return fail(res, 400, "invalid_json", "request body is not JSON"); } }
    state.calls.push({ method: req.method, path, body, headers: req.headers });
    if (log) console.error(`[mock-grok] ${req.method} ${path}`);

    if (req.method === "POST" && path === "/v1/responses") {
      const bad = validate(body);
      if (bad) return fail(res, bad.status, bad.error.code, bad.error.message, bad.headers);
      if (body.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(": mock-grok stream\n\n");
        for (const ev of events(body)) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
        return res.end();
      }
      const built = build(body);
      const full = responseObject(body, built);
      state.responses.set(full.id, { ...full, request: body, forever: built.forever });
      return send(res, 200, full);
    }
    const m = /^\/v1\/responses\/([^/]+)$/.exec(path);
    if (m && req.method === "GET") { const r = state.responses.get(m[1]); return r ? send(res, 200, strip(r)) : fail(res, 404, "not_found", "response not found"); }
    if (m && req.method === "DELETE") { const had = state.responses.delete(m[1]); return had ? send(res, 200, { id: m[1], object: "response", deleted: true }) : fail(res, 404, "not_found", "response not found"); }

    if (req.method === "POST" && path === "/v1/responses/compact") {
      if (!body.model) return fail(res, 400, "invalid_request_error", "model is required");
      const n = Array.isArray(body.input) ? body.input.length : 1;
      const id = nextId("cmp");
      const summary = `compacted ${n} items: ${inputText(body.input).slice(0, 120)}`;
      return send(res, 200, { id, object: "response.compaction", model: body.model, output: [{ type: "compaction", id, encrypted_content: Buffer.from(summary).toString("base64") }], usage: usage({ dropped_message_count: Math.max(0, n - 1), output_tokens: 20 }) });
    }

    if (req.method === "POST" && path === "/v1/images/generations") {
      if (!body.prompt) return fail(res, 400, "invalid_request_error", "prompt is required");
      const n = body.n || 1;
      if (body.deferred) {
        const id = nextId("img_req");
        state.jobs.set(id, { kind: "image", polls: 0, doneAfter: 1, result: { status: "done", data: imageData(body, n), model: body.model, usage: usage() } });
        return send(res, 202, { request_id: id, status: "pending" });
      }
      return send(res, 200, { data: imageData(body, n), model: body.model, usage: usage() });
    }
    if (req.method === "POST" && path === "/v1/images/edits") {
      if (!body.prompt) return fail(res, 400, "invalid_request_error", "prompt is required");
      if (!body.image && !body.images?.length) return fail(res, 400, "invalid_request_error", "image is required");
      return send(res, 200, { data: imageData(body, body.n || 1), model: body.model, usage: usage() });
    }
    const im = /^\/v1\/images\/([^/]+)$/.exec(path);
    if (im && req.method === "GET") return pollJob(res, im[1]);

    if (req.method === "POST" && (path === "/v1/videos/generations" || path === "/v1/videos/extensions" || path === "/v1/videos/edits")) {
      if (!body.prompt && !body.image && !body.video) return fail(res, 400, "invalid_request_error", "prompt is required");
      if (/fail_me/.test(body.prompt || "")) {
        const id = nextId("vid_req");
        state.jobs.set(id, { kind: "video", polls: 0, doneAfter: 1, result: { status: "failed", error: { code: "invalid_argument", message: "prompt rejected by moderation" } } });
        return send(res, 200, { request_id: id });
      }
      const id = nextId("vid_req");
      const duration = body.duration ?? 8;
      state.jobs.set(id, { kind: "video", polls: 0, doneAfter: 2, result: { status: "done", model: body.model, video: { url: mediaUrl(`${id}.mp4`), duration, respect_moderation: true }, usage: usage({ cost_in_usd_ticks: state.costTicks * duration }) } });
      return send(res, 200, { request_id: id });
    }
    const vm = /^\/v1\/videos\/([^/]+)$/.exec(path);
    if (vm && req.method === "GET") return pollJob(res, vm[1]);

    return fail(res, 404, "not_found", `no mock route for ${req.method} ${path}`);
  }

  function pollJob(res, id) {
    const job = state.jobs.get(id);
    if (!job) return fail(res, 404, "not_found", "unknown job");
    job.polls++;
    if (job.polls <= job.doneAfter) return send(res, 200, { status: "pending", request_id: id });
    return send(res, 200, { ...job.result, request_id: id });
  }
  const strip = ({ request, forever, ...r }) => r;

  /* --------------------------------------------------------------------------------------- ws */

  function onUpgrade(req, socket, head) {
    const path = new URL(req.url, "http://mock").pathname;
    if (path !== "/v1/responses") { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
    if (!authed(req)) { socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n" + JSON.stringify({ error: { code: "invalid_api_key", message: "missing bearer token" } })); return; }
    const ws = acceptUpgrade(req, socket, head);
    if (!ws) return;
    state.calls.push({ method: "WS", path, body: null, headers: req.headers });
    const emit = (ev) => { try { ws.send(JSON.stringify(ev)); } catch { /* peer went away */ } };
    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { emit({ type: "error", error: { code: "invalid_json", message: "message is not JSON" } }); return; }
      if (msg.type !== "response.create") { emit({ type: "error", error: { code: "invalid_request_error", message: `unknown message type ${msg.type}` } }); return; }
      const { type, ...body } = msg;
      state.calls.push({ method: "WS", path, body, headers: req.headers });
      // One simulated 25-minute cutoff per server lifetime: the client must reconnect and resend.
      if (/ws_limit_me/.test(inputText(body.input)) && !state.wsLimitFired) {
        state.wsLimitFired = true;
        emit({ type: "error", error: { code: "websocket_connection_limit_reached", message: "connection exceeded its maximum lifetime" } });
        ws.close(1000, "limit");
        return;
      }
      const bad = validate(body);
      if (bad) { emit({ type: "error", error: bad.error }); return; }
      for (const ev of events(body)) emit(ev);
    });
  }

  /* ------------------------------------------------------------------------------------ server */

  const server = http.createServer((req, res) => { handle(req, res).catch((e) => fail(res, 500, "internal_error", e.message)); });
  server.on("upgrade", onUpgrade);
  const sockets = new Set();
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });

  return new Promise((ok, no) => {
    server.once("error", no);
    server.listen(port, host, () => {
      const a = server.address();
      state.url = `http://${host}:${a.port}`;
      ok({
        url: state.url,
        wsUrl: `ws://${host}:${a.port}/v1/responses`,
        port: a.port,
        calls: state.calls,
        state,
        setPosts(p) { state.posts = [...p]; },
        setCostTicks(n) { state.costTicks = Number(n); },
        close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || process.argv[2] || 0);
  startMockGrok({ port, log: true }).then((m) => {
    console.log(m.url);
    console.error(`[mock-grok] listening on ${m.url} (ws: ${m.wsUrl}); any Bearer token works`);
  }, (e) => { console.error(e); process.exit(1); });
}
