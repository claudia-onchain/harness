import { test } from "node:test";
import assert from "node:assert/strict";
import { ticksToUsd, ticksToUsdString, usdToTicks, usdToTicksBig, summarizeUsage, addUsage, fmtUsd, fmtTicks, sumTicks, TICKS_PER_USD } from "../src/grok/cost.js";

test("ticks ↔ USD is exact for the documented example and round-trips", () => {
  assert.equal(ticksToUsd(12345678), 0.0012345678);
  assert.equal(usdToTicks(0.0012345678), 12345678);
  assert.equal(ticksToUsdString(12345678), "0.0012345678");
  assert.equal(ticksToUsd(TICKS_PER_USD), 1);
  assert.equal(usdToTicks(1), 10_000_000_000);
  assert.equal(usdToTicks("0.40"), 4_000_000_000);
  assert.equal(ticksToUsd(0), 0);
  assert.equal(ticksToUsd(undefined), 0);
  assert.equal(ticksToUsd("987654321"), 0.0987654321);
  for (const t of [1, 7, 12345678, 999_999_999, 10_000_000_001, 123_456_789_012]) assert.equal(usdToTicks(ticksToUsd(t)), t, `round trip ${t}`);
});

test("large values stay exact through BigInt (beyond 2^53 ticks)", () => {
  const big = 123456789012345678n; // $12,345,678.9012345678: 18 significant digits, beyond a double
  assert.equal(ticksToUsdString(big), "12345678.9012345678");
  assert.equal(usdToTicksBig("12345678.9012345678"), big);
  assert.equal(usdToTicksBig(ticksToUsdString(big)), big);
  assert.equal(ticksToUsd(big), 12345678.9012345678);
  assert.equal(ticksToUsdString(-12345678n), "-0.0012345678");
  assert.equal(ticksToUsd(-12345678), -0.0012345678);
  assert.equal(usdToTicksBig(-0.5), -5_000_000_000n);
  assert.equal(sumTicks(12345678, 12345678n, "4"), 24691360);
  assert.throws(() => usdToTicksBig("abc"), TypeError);
});

test("summarizeUsage flattens xAI usage incl. server-side tool counters", () => {
  const u = summarizeUsage({
    input_tokens: 1200, output_tokens: 300, total_tokens: 1500,
    input_tokens_details: { cached_tokens: 800 }, output_tokens_details: { reasoning_tokens: 120 },
    cost_in_usd_ticks: 12345678, num_sources_used: 44, num_server_side_tools_used: 2,
    server_side_tool_usage_details: { web_search_calls: 1, x_search_calls: 2, x_posts_fetched: 44, x_users_fetched: 3, code_interpreter_calls: 0, file_search_calls: 0, mcp_calls: 0, document_search_calls: 0, image_generation_calls: 0, future_tool_calls: 5 },
  });
  assert.equal(u.inputTokens, 1200);
  assert.equal(u.outputTokens, 300);
  assert.equal(u.cachedTokens, 800);
  assert.equal(u.reasoningTokens, 120);
  assert.equal(u.costTicks, 12345678);
  assert.equal(u.costUsd, 0.0012345678);
  assert.equal(u.sourcesUsed, 44);
  assert.equal(u.tools.xSearchCalls, 2);
  assert.equal(u.tools.xPostsFetched, 44);
  assert.equal(u.tools.xUsersFetched, 3);
  assert.equal(u.tools.webSearchCalls, 1);
  assert.equal(u.tools.codeInterpreterCalls, 0);
  assert.equal(u.tools.futureToolCalls, 5);
  const empty = summarizeUsage(undefined);
  assert.equal(empty.costTicks, 0);
  assert.equal(empty.tools.xPostsFetched, 0);
  // Chat-completions shaped usage and nano-USD fallback are accepted too.
  const chat = summarizeUsage({ prompt_tokens: 10, completion_tokens: 5, cost_in_nano_usd: 1234567 });
  assert.equal(chat.inputTokens, 10);
  assert.equal(chat.costTicks, 12345670);
});

test("addUsage totals tokens, ticks and tool counters", () => {
  const a = summarizeUsage({ input_tokens: 1, output_tokens: 2, cost_in_usd_ticks: 5, server_side_tool_usage_details: { x_posts_fetched: 3 } });
  const b = summarizeUsage({ input_tokens: 10, output_tokens: 20, cost_in_usd_ticks: 7, server_side_tool_usage_details: { x_posts_fetched: 4, web_search_calls: 1 } });
  const t = addUsage(a, b);
  assert.equal(t.inputTokens, 11);
  assert.equal(t.outputTokens, 22);
  assert.equal(t.costTicks, 12);
  assert.equal(t.costUsd, 0.0000000012);
  assert.equal(t.tools.xPostsFetched, 7);
  assert.equal(t.tools.webSearchCalls, 1);
});

test("fmtUsd keeps sub-cent calls visible", () => {
  assert.equal(fmtUsd(0), "$0.00");
  assert.equal(fmtUsd(12.345), "$12.35");
  assert.equal(fmtUsd(0.04), "$0.0400");
  assert.equal(fmtUsd(0.0012345678), "$0.001235");
  assert.equal(fmtUsd(-0.5), "-$0.5000");
  assert.equal(fmtTicks(12345678), "$0.001235");
  assert.equal(fmtTicks(400_000_000), "$0.0400");
});
