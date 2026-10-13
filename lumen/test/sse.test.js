import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSSE } from "../src/llm/sse.js";
import { AnthropicClient } from "../src/llm/anthropic.js";
import { OpenAIChatClient } from "../src/llm/openai-chat.js";
import { OpenAIResponsesClient } from "../src/llm/openai-responses.js";
import { streamOf, sse, chunked, collect } from "./helpers.js";

test("parseSSE handles comments, CRLF, multi-line data and split chunks", async () => {
  const raw = ": keep-alive\r\nevent: a\r\ndata: one\r\ndata: two\r\n\r\ndata: {\"x\":1}\n\n:comment\n\ndata: tail";
  const evs = await collect(parseSSE(streamOf(chunked(raw, 3))));
  assert.deepEqual(evs.map((e) => [e.event, e.data]), [["a", "one\ntwo"], ["message", '{"x":1}'], ["message", "tail"]]);
});

test("Anthropic stream: text, thinking, tool_use accumulation, usage", async () => {
  const body = sse([
    { data: { type: "message_start", message: { model: "claude-opus-5-5", usage: { input_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 10, output_tokens: 1 } } } },
    { data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
    { data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me check." } } },
    { data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig123" } } },
    { data: { type: "content_block_stop", index: 0 } },
    { data: { type: "ping" } },
    { data: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
    { data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello " } } },
    { data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "world" } } },
    { data: { type: "content_block_stop", index: 1 } },
    { data: { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "get_price", input: {} } } },
    { data: { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"symbol":' } } },
    { data: { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"ETH"}' } } },
    { data: { type: "content_block_stop", index: 2 } },
    { data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } } },
    { data: { type: "message_stop" } },
    { data: { type: "some_future_event" } },
  ]);
  const c = new AnthropicClient({ apiKey: "x", model: "claude-opus-5-5" });
  const evs = await collect(c.read(streamOf(chunked(body, 11))));
  assert.equal(evs.filter((e) => e.type === "text").map((e) => e.text).join(""), "Hello world");
  assert.equal(evs.filter((e) => e.type === "thinking").map((e) => e.text).join(""), "Let me check.");
  const calls = evs.find((e) => e.type === "tool_calls").calls;
  assert.deepEqual(calls, [{ id: "toolu_1", name: "get_price", args: { symbol: "ETH" } }]);
  const usage = evs.find((e) => e.type === "usage").usage;
  assert.deepEqual(usage, { input: 160, output: 42, cacheRead: 50, cacheWrite: 10 });
  const done = evs.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.stop, "tool_use");
  assert.equal(done.raw.find((b) => b.type === "thinking").signature, "sig123");
});

test("Anthropic stream: error event and refusal", async () => {
  const c = new AnthropicClient({ apiKey: "x", model: "claude-opus-5-5" });
  const err = await collect(c.read(streamOf([sse([{ data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }])])));
  assert.deepEqual(err.at(-1), { type: "error", status: 529, message: "Overloaded" });
  const ref = await collect(c.read(streamOf([sse([{ data: { type: "message_start", message: { usage: {} } } }, { data: { type: "message_delta", delta: { stop_reason: "refusal" } } }])])));
  assert.equal(ref.at(-1).status, 422);
});

test("Anthropic request body: adaptive thinking, effort, cache_control, fallbacks", () => {
  const c = new AnthropicClient({ apiKey: "x", model: "claude-opus-5-5", thinking: "high" });
  const b = c.body([{ role: "system", content: "sys" }, { role: "user", content: [{ type: "text", text: "hi" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] }], [{ name: "t", description: "d", parameters: { type: "object", properties: {} } }]);
  assert.deepEqual(b.thinking, { type: "adaptive", display: "summarized" });
  assert.deepEqual(b.output_config, { effort: "high" });
  assert.equal(b.system[0].cache_control.type, "ephemeral");
  assert.equal(b.tools.at(-1).cache_control.type, "ephemeral");
  assert.equal(b.fallbacks, "default");
  assert.equal(b.messages[0].content[1].type, "image");
  assert.equal(b.temperature, undefined);
});

test("OpenAI-compatible stream: text, reasoning, tool call accumulation across chunks, usage + cost", async () => {
  const body = sse([
    { data: { model: "x-ai/grok-4.7", choices: [{ index: 0, delta: { role: "assistant", reasoning: "hmm" } }] } },
    { data: { choices: [{ index: 0, delta: { content: "Hi" } }] } },
    { data: { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "get_bal", arguments: "" } }] } }] } },
    { data: { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"addr' } }] } }] } },
    { data: { choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: "call_b", function: { name: "gas", arguments: "{}" } }] } }] } },
    { data: { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'ess":"0x1"}' } }] } }] } },
    { data: { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] } },
    { data: { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7, cost: 0.0012, prompt_tokens_details: { cached_tokens: 4 } } } },
    { data: "[DONE]" },
  ]).replace("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\"", ": OPENROUTER PROCESSING\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"content\"");
  const c = new OpenAIChatClient({ provider: "openrouter", apiKey: "x", model: "x-ai/grok-4.7", baseUrl: "http://x", usage: "openrouter" });
  const evs = await collect(c.read(streamOf(chunked(body, 5))));
  assert.equal(evs.filter((e) => e.type === "text").map((e) => e.text).join(""), "Hi");
  assert.equal(evs.find((e) => e.type === "thinking").text, "hmm");
  assert.deepEqual(evs.find((e) => e.type === "tool_calls").calls, [{ id: "call_a", name: "get_bal", args: { address: "0x1" } }, { id: "call_b", name: "gas", args: {} }]);
  assert.deepEqual(evs.find((e) => e.type === "usage").usage, { input: 12, output: 7, cacheRead: 4, cacheWrite: 0, costUsd: 0.0012 });
  assert.equal(evs.at(-1).stop, "tool_calls");
});

test("OpenAI-compatible stream: bad tool JSON is reported, not thrown; in-stream error", async () => {
  const c = new OpenAIChatClient({ apiKey: "x", model: "m", baseUrl: "http://x" });
  const evs = await collect(c.read(streamOf([sse([{ data: { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "f", arguments: "{bad" } }] } }] } }])])));
  assert.match(evs.find((e) => e.type === "tool_calls").calls[0].argsError, /JSON/);
  const err = await collect(c.read(streamOf([sse([{ data: { error: { code: 429, message: "slow down" } } }])])));
  assert.deepEqual(err.at(-1), { type: "error", status: 429, message: "slow down" });
});

test("OpenAI Responses stream: text + function call", async () => {
  const body = sse([
    { data: { type: "response.output_text.delta", delta: "Yo" } },
    { data: { type: "response.output_item.added", output_index: 1, item: { type: "function_call", id: "fc_1", call_id: "call_9", name: "gas", arguments: "" } } },
    { data: { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: '{"chain":"base"}' } },
    { data: { type: "response.output_item.done", output_index: 1, item: { type: "function_call", id: "fc_1", call_id: "call_9", name: "gas", arguments: '{"chain":"base"}' } } },
    { data: { type: "response.completed", response: { model: "gpt-6.1-sol", status: "completed", usage: { input_tokens: 5, output_tokens: 3 } } } },
  ]);
  const c = new OpenAIResponsesClient({ apiKey: "x", model: "gpt-6.1-sol" });
  const evs = await collect(c.read(streamOf([body])));
  assert.equal(evs.find((e) => e.type === "text").text, "Yo");
  assert.deepEqual(evs.find((e) => e.type === "tool_calls").calls, [{ id: "call_9", name: "gas", args: { chain: "base" } }]);
});
