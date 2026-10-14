import { test } from "node:test";
import assert from "node:assert/strict";
import { getPrices, sample, sparkline, fmtPrice, fmtChange } from "../src/sensors/prices.js";
import { alertCaption, imagePrompt, videoLine } from "../src/cards/prompt.js";

const fakeFetch = (routes) => async (url) => {
  for (const [re, body] of routes) if (re.test(String(url))) return { ok: true, json: async () => body };
  return { ok: false, status: 404, json: async () => ({}) };
};

test("getPrices: DefiLlama price + CoinGecko sparkline, unknown symbol resolved by search", async () => {
  const f = fakeFetch([
    [/coins\.llama\.fi\/prices\/current/, { coins: { "coingecko:solana": { price: 150.5, timestamp: 1700000000 }, "coingecko:foo-coin": { price: 0.01234, timestamp: 1700000000 } } }],
    [/coingecko\.com\/api\/v3\/search\?query=FOO/, { coins: [{ id: "foo-coin", symbol: "foo" }] }],
    [/coins\/solana\/market_chart/, { prices: Array.from({ length: 100 }, (_, i) => [i, 100 + i]) }],
    [/coins\/foo-coin\/market_chart/, { prices: [[0, 0.01], [1, 0.012]] }],
  ]);
  const p = await getPrices(["$sol", "FOO", "nope"], { fetch: f });
  assert.equal(p.SOL.price, 150.5);
  assert.equal(p.SOL.points.length, 24);
  assert.ok(p.SOL.change24h > 90);
  assert.equal(p.FOO.price, 0.01234);
  assert.equal(p.NOPE, undefined);
});

test("sample + sparkline + formatters", () => {
  assert.deepEqual(sample([1, 2, 3, 4, 5], 3), [1, 3, 5]);
  assert.equal(sparkline([1, 2, 3, 4, 5, 6, 7, 8]), "▁▂▃▄▅▆▇█");
  assert.equal(sparkline([2, 2]), "▄▄");
  assert.equal(fmtPrice(1234.5), "$1,235");
  assert.equal(fmtPrice(0.012345), "$0.0123");
  assert.equal(fmtChange(-3.21), "▼ 3.2%");
});

test("alert caption is HTML-safe, cites posts and stays under Telegram's photo caption limit", () => {
  const alert = { id: "al_1", severity: "high", headline: "SOL <breaks> $160 as ETF chatter spikes", summary: "Multiple large accounts & news outlets.", sentiment: 0.6, velocity: 0.8, posts: Array.from({ length: 10 }, (_, i) => ({ url: `https://x.com/user${i}/status/${i}`, why: "big account ".repeat(20) })) };
  const cap = alertCaption(alert, { SOL: { symbol: "SOL", price: 161.2, change24h: 7.4, points: [1, 2, 3] } });
  assert.ok(cap.includes("&lt;breaks&gt;"));
  assert.ok(cap.includes("@user0"));
  assert.ok(!cap.includes("@user3"), "only the top 3 posts");
  assert.ok(cap.length <= 1024);
  assert.ok(imagePrompt({ headline: "x", severity: "high", symbols: ["$SOL"] }).includes("no text"));
  assert.ok(videoLine(alert).length <= 180);
});
