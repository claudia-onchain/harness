import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockGrok } from "./mock-grok.js";
import { createGrok, tools, jsonSchema, normalizeResponse, citationKind } from "../src/grok/responses.js";
import { GrokAuthError, GrokRateLimitError, GrokInvalidRequestError, GrokError, retryAfterMs, parseErrorBody } from "../src/grok/errors.js";

let mock, grok, usages;
before(async () => {
  mock = await startMockGrok();
  usages = [];
  grok = createGrok({ apiKey: "test-key", baseUrl: mock.url, safetyIdentifier: "chat-42", onUsage: (u, ctx) => usages.push({ u, ctx }), sleep: async () => {} });
});
after(() => mock.close());

test("respond: normalised shape, x_search citations with kind detection, usage metering", async () => {
  const body = {
    model: "grok-4.3", input: "What is crypto Twitter saying about $SOL?",
    tools: [tools.xSearch({ fromDate: "2026-10-13", toDate: "2026-10-14" }), tools.webSearch()],
    max_turns: 2,
  };
  const r = await grok.respond(body);
  assert.match(r.id, /^resp_/);
  assert.equal(r.status, "completed");
  assert.equal(r.model, "grok-4.3");
  assert.ok(r.text.includes("@Cobie"));
  assert.equal(r.functionCalls.length, 0);
  assert.equal(r.citations.length, 9);
  const x = r.citations.filter((c) => c.kind === "x");
  const web = r.citations.filter((c) => c.kind === "web");
  assert.equal(x.length, 8);
  assert.equal(web.length, 1);
  assert.equal(web[0].url, "https://www.coingecko.com/en/coins/solana");
  for (const c of r.citations) assert.equal(r.text.slice(c.start, c.end), c.url, "start/end index spans the URL");
  assert.equal(r.usage.costTicks, 12345678);
  assert.equal(r.usage.costUsd, 0.0012345678);
  assert.equal(r.usage.tools.xSearchCalls, 1);
  assert.equal(r.usage.tools.xPostsFetched, 8);
  assert.equal(r.usage.tools.webSearchCalls, 1);
  assert.equal(r.raw.object, "response");
  // Metering hook saw the same usage, and safety_identifier was injected into the wire body.
  const last = usages.at(-1);
  assert.equal(last.u.costTicks, 12345678);
  assert.equal(last.ctx.body.safety_identifier, "chat-42");
  assert.equal(mock.calls.at(-1).body.safety_identifier, "chat-42");
  assert.equal(mock.calls.at(-1).body.tools[0].type, "x_search");
  assert.equal(mock.calls.at(-1).headers.authorization, "Bearer test-key");
});

test("respond: handle/date filters on x_search narrow the cited posts", async () => {
  const r = await grok.respond({ model: "grok-4.3", input: "sol", tools: [tools.xSearch({ allowedHandles: ["@solana", "WuBlockchain"] })] });
  assert.deepEqual(r.citations.map((c) => c.url.split("/")[3]).sort(), ["WuBlockchain", "solana"]);
  assert.equal(r.usage.tools.xPostsFetched, 2);
});

test("citationKind recognises x.com / twitter.com status URLs only", () => {
  assert.equal(citationKind("https://x.com/xai/status/1234567890"), "x");
  assert.equal(citationKind("https://twitter.com/xai/status/1234567890?s=20"), "x");
  assert.equal(citationKind("https://www.x.com/xai/status/1"), "x");
  assert.equal(citationKind("https://x.com/xai"), "web");
  assert.equal(citationKind("https://docs.x.ai/developers"), "web");
  assert.equal(citationKind("https://example.com/x.com/a/status/1"), "web");
});

test("structured output: json is parsed, invalid JSON is a typed error", async () => {
  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      alert: { type: "boolean" }, severity: { type: "string", enum: ["low", "medium", "high"] }, headline: { type: "string" },
      sentiment: { type: "number", minimum: -1, maximum: 1 }, velocity: { type: "number", minimum: 0, maximum: 1 },
      posts: { type: "array", items: { type: "object", additionalProperties: false, properties: { url: { type: "string" }, why: { type: "string" } }, required: ["url", "why"] } },
    },
    required: ["alert", "severity", "headline", "sentiment", "velocity", "posts"],
  };
  const body = { model: "grok-4.7", reasoning: { effort: "low" }, input: "judge", text: jsonSchema("judgement", schema), tools: [tools.xSearch()] };
  assert.deepEqual(body.text, { format: { type: "json_schema", name: "judgement", strict: true, schema } });
  const r = await grok.respond(body);
  assert.equal(typeof r.json, "object");
  assert.equal(r.json.alert, true);
  assert.equal(r.json.severity, "low");
  assert.ok(r.json.sentiment >= -1 && r.json.sentiment <= 1);
  assert.ok(r.json.posts.length >= 1);
  for (const p of r.json.posts) assert.ok(r.citations.some((c) => c.url === p.url), `${p.url} is cited`);
  assert.equal(JSON.parse(r.text).headline, r.json.headline);
  assert.throws(() => normalizeResponse({ output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }, { expectJson: true }), (e) => e instanceof GrokError && e.code === "invalid_json");
  assert.equal(normalizeResponse({ output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }).json, undefined);
});

test("stream: deltas arrive in order, unknown events are tolerated, final shape matches respond", async () => {
  const chunks = [], names = [];
  const r = await grok.stream({ model: "grok-4.3", input: "stream me please" }, { onText: (d) => chunks.push(d), onEvent: (e) => names.push(e.type) });
  assert.ok(chunks.length >= 2);
  assert.equal(chunks.join(""), r.text);
  assert.ok(names.includes("response.created"));
  assert.ok(names.includes("mock.unknown_event"));
  assert.equal(names.at(-1), "response.completed");
  assert.equal(r.status, "completed");
  assert.equal(r.usage.costTicks, 12345678);
  assert.equal(mock.calls.at(-1).body.stream, true);
  const fetched = await grok.get(r.id);
  assert.equal(fetched.id, r.id);
  assert.deepEqual(await grok.delete(r.id).then((d) => d.deleted), true);
});

test("stream: a function call item comes back whole", async () => {
  const r = await grok.stream({ model: "grok-4.3", input: "call_tool {\"q\":\"hype\"}", tools: [tools.fn("price", "price lookup")] });
  assert.equal(r.functionCalls.length, 1);
  assert.equal(r.functionCalls[0].name, "price");
  assert.deepEqual(r.functionCalls[0].args, { q: "hype" });
  assert.match(r.functionCalls[0].callId, /^call_/);
});

test("compact: returns the compaction item to prepend next turn", async () => {
  const c = await grok.compact({ model: "grok-4.3", input: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] });
  assert.match(c.id, /^cmp_/);
  assert.equal(c.compaction.type, "compaction");
  assert.ok(c.compaction.encrypted_content.length > 0);
  assert.equal(c.droppedMessages, 2);
  assert.equal(c.usage.costTicks, 12345678);
  assert.equal(mock.calls.at(-1).path, "/v1/responses/compact");
  assert.equal(mock.calls.at(-1).body.safety_identifier, "chat-42");
});

test("runTools: executes handlers, chains with previous_response_id, totals usage", async () => {
  const seen = [];
  const r = await grok.runTools(
    { model: "grok-4.3", instructions: "be brief", input: "please call_tool {\"symbol\":\"SOL\"}", tools: [tools.fn("price", "price lookup", { type: "object", properties: { symbol: { type: "string" } } })], tool_choice: "auto" },
    { price: async (args) => { seen.push(args); return { symbol: args.symbol, usd: 173.2 }; } },
  );
  assert.deepEqual(seen, [{ symbol: "SOL" }]);
  assert.equal(r.rounds, 2);
  assert.equal(r.exhausted, false);
  assert.equal(r.functionCalls.length, 0);
  assert.ok(r.text.includes('{"symbol":"SOL","usd":173.2}'));
  assert.equal(r.totalUsage.costTicks, 2 * 12345678);
  assert.equal(r.usage.costTicks, 12345678);
  assert.equal(r.calls.length, 1);
  const follow = mock.calls.at(-1).body;
  assert.equal(follow.input[0].type, "function_call_output");
  assert.equal(follow.input[0].output, '{"symbol":"SOL","usd":173.2}');
  assert.match(follow.previous_response_id, /^resp_/);
  assert.equal(follow.instructions, undefined, "instructions cannot ride with previous_response_id");
  assert.equal(follow.tool_choice, undefined);
});

test("runTools: handler errors become tool output, missing handlers too, maxRounds stops the loop", async () => {
  const body = { model: "grok-4.3", input: "call_tool_forever", tools: [tools.fn("boom", "always throws")] };
  const r = await grok.runTools(body, { boom: async () => { throw new Error("kaboom"); } }, { maxRounds: 3 });
  assert.equal(r.rounds, 3);
  assert.equal(r.exhausted, true);
  assert.equal(r.calls.length, 2);
  assert.deepEqual(JSON.parse(r.calls[0].output), { error: "kaboom" });
  const r2 = await grok.runTools({ model: "grok-4.3", input: "call_tool", tools: [tools.fn("nope", "unhandled")] }, {});
  assert.match(JSON.parse(r2.calls[0].output).error, /no handler for tool "nope"/);
});

test("tool builders produce the documented wire shapes and validate input", () => {
  assert.deepEqual(tools.xSearch({ allowedHandles: ["@SpaceX", "xai", "xai"], fromDate: "2026-09-01", toDate: new Date("2026-10-01T12:00:00Z"), images: true, video: true }), {
    type: "x_search", allowed_x_handles: ["SpaceX", "xai"], from_date: "2026-09-01", to_date: "2026-10-01", enable_image_understanding: true, enable_video_understanding: true,
  });
  assert.deepEqual(tools.xSearch({ excludedHandles: "spambot1, @spambot2" }), { type: "x_search", excluded_x_handles: ["spambot1", "spambot2"] });
  assert.deepEqual(tools.xSearch(), { type: "x_search" });
  assert.throws(() => tools.xSearch({ allowedHandles: ["a"], excludedHandles: ["b"] }), GrokInvalidRequestError);
  assert.throws(() => tools.xSearch({ allowedHandles: Array.from({ length: 21 }, (_, i) => `h${i}`) }), /at most 20/);
  assert.throws(() => tools.xSearch({ fromDate: "10/13/2026" }), /YYYY-MM-DD/);
  assert.throws(() => tools.xSearch({ fromDate: "2026-10-14", toDate: "2026-10-14" }), /exclusive/);
  assert.deepEqual(tools.webSearch({ allowedDomains: ["https://grokipedia.com/x", "coingecko.com"], images: true }), { type: "web_search", filters: { allowed_domains: ["grokipedia.com", "coingecko.com"] }, enable_image_understanding: true });
  assert.throws(() => tools.webSearch({ allowedDomains: ["a", "b", "c", "d", "e", "f"] }), /at most 5/);
  assert.throws(() => tools.webSearch({ allowedDomains: ["a"], excludedDomains: ["b"] }), /mutually exclusive/);
  assert.deepEqual(tools.codeInterpreter(), { type: "code_interpreter" });
  assert.deepEqual(tools.fileSearch({ collectionIds: "col_1", maxResults: 5 }), { type: "file_search", vector_store_ids: ["col_1"], max_num_results: 5 });
  assert.throws(() => tools.fileSearch({}), GrokInvalidRequestError);
  assert.deepEqual(tools.mcp({ serverUrl: "https://mcp.deepwiki.com/mcp", headers: { "X-Custom": "v" } }), { type: "mcp", server_url: "https://mcp.deepwiki.com/mcp", server_label: "mcp_deepwiki_com", headers: { "X-Custom": "v" } });
  assert.deepEqual(tools.imageGeneration(), { type: "image_generation", action: "auto" });
  assert.deepEqual(tools.fn("f", "d"), { type: "function", name: "f", description: "d", parameters: { type: "object", properties: {}, additionalProperties: false }, strict: true });
  assert.deepEqual(jsonSchema("n", { type: "object" }), { format: { type: "json_schema", name: "n", strict: true, schema: { type: "object" } } });
});

test("retries: 429 is retried once honouring Retry-After, 5xx uses backoff", async () => {
  const sleeps = [];
  const g = createGrok({ apiKey: "k", baseUrl: mock.url, sleep: async (ms) => sleeps.push(ms), retryBaseMs: 250 });
  const before = mock.calls.length;
  const r = await g.respond({ model: "grok-4.3", input: "rate_limit_me now" });
  assert.equal(r.status, "completed");
  assert.deepEqual(sleeps, [1000], "Retry-After: 1 → 1000 ms");
  assert.equal(mock.calls.length - before, 2);
  sleeps.length = 0;
  const r2 = await g.respond({ model: "grok-4.3", input: "server_error_me now" });
  assert.equal(r2.status, "completed");
  assert.deepEqual(sleeps, [250]);
});

test("retries: give up after maxRetries with the rate-limit error; 4xx are never retried", async () => {
  let n = 0;
  const always429 = async () => { n++; return new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "slow down" } }), { status: 429, headers: { "retry-after": "2" } }); };
  const g = createGrok({ apiKey: "k", baseUrl: "http://unused", fetch: always429, sleep: async () => {}, maxRetries: 2 });
  await assert.rejects(g.respond({ model: "grok-4.3", input: "x" }), (e) => e instanceof GrokRateLimitError && e.retryable && e.retryAfterMs === 2000 && e.status === 429);
  assert.equal(n, 3);
  let m = 0;
  const bad = async () => { m++; return new Response(JSON.stringify({ code: "invalid_request", error: "input is required" }), { status: 400 }); };
  const g2 = createGrok({ apiKey: "k", baseUrl: "http://unused", fetch: bad, sleep: async () => { throw new Error("must not sleep"); } });
  await assert.rejects(g2.respond({ model: "grok-4.3" }), (e) => e instanceof GrokInvalidRequestError && !e.retryable && /input is required/.test(e.message));
  assert.equal(m, 1);
});

test("401 → GrokAuthError; unknown previous_response_id → typed invalid request", async () => {
  const anon = createGrok({ apiKey: "x", baseUrl: mock.url, fetch: (url, init) => fetch(url, { ...init, headers: { "content-type": "application/json" } }) });
  await assert.rejects(anon.respond({ model: "grok-4.3", input: "hi" }), (e) => e instanceof GrokAuthError && e.status === 401 && e.code === "auth" && !e.retryable);
  await assert.rejects(grok.respond({ model: "grok-4.3", input: "hi", previous_response_id: "resp_missing" }), (e) => e instanceof GrokInvalidRequestError && e.code === "previous_response_not_found" && e.status === 404);
  assert.throws(() => createGrok({ baseUrl: mock.url }), GrokInvalidRequestError);
});

test("abort signal and timeout surface as typed errors", async () => {
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(grok.respond({ model: "grok-4.3", input: "x" }, { signal: ctl.signal }), (e) => e.code === "aborted");
  const slow = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const g = createGrok({ apiKey: "k", baseUrl: "http://unused", fetch: slow, timeoutMs: 5, maxRetries: 0 });
  await assert.rejects(g.respond({ model: "grok-4.3", input: "x" }), (e) => e.code === "timeout" && e.retryable);
});

test("error helpers parse both xAI error shapes and Retry-After forms", () => {
  assert.deepEqual(parseErrorBody('{"error":{"message":"bad","code":"invalid"}}'), { message: "bad", code: "invalid" });
  assert.deepEqual(parseErrorBody('{"code":"nope","error":"bad key"}'), { message: "bad key", code: "nope" });
  assert.equal(parseErrorBody("plain text").message, "plain text");
  assert.equal(retryAfterMs("3"), 3000);
  assert.equal(retryAfterMs(undefined), undefined);
  assert.equal(retryAfterMs("garbage"), undefined);
  const future = retryAfterMs(new Date(Date.now() + 5000).toUTCString());
  assert.ok(future > 3000 && future <= 5000);
});
