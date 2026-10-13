---
name: rpc-providers-and-rate-limits
description: "Configures RPC and data providers for Lumen and stays inside their limits: Alchemy compute units, Helius credits, Etherscan V2, CoinGecko, Jupiter and public RPC throttles; 429 handling with exponential backoff and jitter, JSON-RPC batching, caching, archive vs full nodes, failover across publicRpc fallbacks, and private RPCs for sending. Use when someone asks \"I keep getting 429\", \"which RPC should I use\", \"rate limit exceeded\", \"set up Alchemy / Helius key\", \"archive node for old blocks\", or \"why is Lumen slow on this chain\"."
license: MIT
metadata:
  title: "RPC Providers and Rate Limits"
  category: "crypto-core"
  level: "intermediate"
  tags: "rpc, alchemy, helius, infura, quicknode, rate limits, 429, backoff, batching, archive node, etherscan"
  version: "1.0.0"
  updated: "2026-10-13"
---

# RPC Providers and Rate Limits

Every chain read in Lumen goes through an RPC or data API, and each has a budget: requests per second, monthly
compute units or credits, block-range caps, archive depth. Hitting them shows up as 429s, empty results or slow
answers. The key idea: spend requests deliberately (cache, batch, use the specialized API instead of looping raw
RPC), and when throttled, back off with jitter instead of retrying harder.

## When to use

- "I keep getting 429 / rate limit exceeded / capacity exceeded."
- "Which RPC should I use for Base / Solana / Monad?", setting up provider keys.
- "Historical balance at block N fails" (needs archive).
- Lumen feels slow on one chain, or a big backfill keeps failing.

## Steps

1. **See what Lumen is using.** `lumen doctor` reports which keys are present and which chains fall back to public
   RPCs; `lumen keys` lists providers. Add keys with `lumen keys set alchemy` / `helius` / `etherscan` /
   `coingecko` / `zerox` / `jupiter`, then `lumen keys test alchemy`. Env vars (`ALCHEMY_API_KEY`,
   `HELIUS_API_KEY`, `ETHERSCAN_API_KEY`) override `~/.lumen/keys.json`.
2. **Know the order of fallbacks.** With an Alchemy key, EVM chains use `https://<slug>.g.alchemy.com/v2/<KEY>`
   (slugs in `src/chains/registry.js`); without it, each chain's `publicRpc` list is tried in order. Solana uses
   Helius (`https://mainnet.helius-rpc.com/?api-key=`) when set, else `https://api.mainnet-beta.solana.com`.
3. **Use the specialized API, not a loop.** One `alchemy_getTokenBalances` beats 200 `balanceOf` calls; one
   `alchemy_getAssetTransfers` page beats scanning blocks; Helius DAS `getAssetsByOwner` beats per-account reads;
   DefiLlama `coins.llama.fi/prices/current/a,b,c` prices many tokens in one call.
4. **Batch and multicall.** JSON-RPC batch arrays (keep batches around 20-50 calls; huge batches get rejected or
   count fully against limits), or Multicall3 `aggregate3` for many `eth_call`s in one request.
5. **Handle 429s correctly.** Retry with exponential backoff and full jitter: `sleep = random(0, min(cap, base *
   2^attempt))`, base 250 ms, cap 10 s, max 5-6 attempts; honor `Retry-After`. Never hot-loop retries; that extends
   bans on public endpoints.
6. **Cache what does not change.** Token metadata, decimals, ABIs, contract creation blocks and finalized blocks are
   immutable: cache them on disk. Prices: cache 15-60 s. Balances: per block.
7. **Pick archive only when needed.** Calls with an old `blockTag` (balance at block N, `eth_call` in the past) need
   archive state; most public RPCs prune it. Alchemy and other paid providers serve archive on supported chains.
8. **Send through a reliable, private endpoint.** Reads can use any provider; sends should use one consistent,
   reputable endpoint (or Flashbots Protect / MEV Blocker on Ethereum) so nonce and mempool views agree.

## Limits to plan around (verify on your plan's dashboard)

| Provider | Budget model | Notes |
|---|---|---|
| Alchemy | compute units per month + per-second throughput | `eth_getLogs` and trace calls cost far more CU than `eth_blockNumber` |
| Helius (Solana) | credits per month + RPS by plan | DAS and enhanced APIs cost more credits than plain RPC |
| Solana public RPC | about 100 requests / 10 s per IP, 40 / 10 s per method | not for production; `getProgramAccounts` is restricted |
| Etherscan V2 | per-second and daily caps per key, one key for 60+ chains | some chains need a paid plan |
| CoinGecko demo | roughly 30 calls/min with monthly cap | use `x-cg-demo-api-key` |
| Jupiter | keyless around 0.5 RPS; higher with `x-api-key` | price v3 takes many mints per call |
| Public EVM RPCs | undocumented, aggressive | small getLogs ranges, no archive |

## Check before you finish

- [ ] `lumen doctor` shows the intended provider per chain, and `lumen keys test` passes.
- [ ] Hot paths use specialized APIs, batching or Multicall3 instead of per-item RPC loops.
- [ ] Retries use exponential backoff with jitter and honor `Retry-After`.
- [ ] Immutable data is cached; price and balance caches have explicit TTLs.
- [ ] Archive-dependent calls go to an archive-capable provider.
- [ ] Keys live in `lumen keys` or env vars, never in code, logs or shared configs.

## Pitfalls

- **Leaking keys in URLs.** RPC URLs embed the key; scrub them from logs, screenshots and error reports.
- **Mixing providers mid-sequence.** Different nodes can be a block apart; read nonce and send on the same endpoint.
- **Silent partial data.** Some free endpoints truncate getLogs or return stale heads; compare head block across two
  providers when results look off.
- **WebSockets as a free lunch.** Subscriptions count against limits too and drop on reconnect; backfill gaps.
- **Allowlist your key.** Restrict browser-exposed keys by domain/IP in the provider dashboard.

## Related

- `event-indexing-and-logs` — block-range caps during backfills
- `lumen-doctor-troubleshooting` — diagnosing key and provider problems
- `cost-control-and-spend-caps` — keeping paid provider usage in budget
- `mev-and-sandwich-awareness` — private RPCs for sending
- `chain-selection-guide` — infra availability as a chain choice factor
