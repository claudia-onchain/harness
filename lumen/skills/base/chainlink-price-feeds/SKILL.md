---
name: chainlink-price-feeds
description: "Reads Chainlink Data Feeds correctly on any supported chain: find the proxy in the reference data directory, call latestRoundData (0xfeaf968c), scale by decimals, and reject bad answers with staleness (updatedAt vs heartbeat), answer > 0, and L2 sequencer-uptime checks; covers deviation thresholds, SVR and secondary proxies, LST exchange-rate and Proof of Reserve feeds, and Solana feeds. Use when someone asks \"what's the Chainlink price of ETH\", \"read this price feed\", \"is this oracle stale\", \"what's the heartbeat\", \"integrate Chainlink in my contract\", or when an on-chain reference price is needed."
license: MIT
metadata:
  title: "Chainlink price feeds"
  category: "crypto-core"
  level: "intermediate"
  tags: "chainlink, oracle, price feed, latestRoundData, heartbeat, staleness, sequencer uptime, decimals, data feeds"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Chainlink price feeds

A Chainlink feed is a proxy contract that returns the latest aggregated answer plus the time it was last updated.
The answer is only as good as its freshness: feeds update when price moves past a deviation threshold or when the
heartbeat expires, so an answer older than the heartbeat (plus margin) means the feed is stuck or the chain is.
Always return the price together with its age.

## When to use

- "What's ETH/USD on Chainlink?", "read the BTC feed on Arbitrum", `lumen price ETH --chain base`.
- "Is this oracle stale?", "what's the heartbeat / deviation?".
- Writing or reviewing a contract that consumes a feed.
- Cross-checking a DEX or API price against an on-chain reference (`oracle-vs-dex-prices`).

## Steps

1. **Find the right proxy.** `chainlink_feeds { "chain": "base", "pair": "ETH/USD" }` does this for you. Manually:
   `https://reference-data-directory.vercel.app/feeds-<network>.json` (network id from the chain registry, e.g.
   `mainnet`, `ethereum-mainnet-base-1`). Entries carry `name`, `path`, `proxyAddress`, `secondaryProxyAddress`,
   `decimals`, `heartbeat` (seconds), `feedCategory`. Prefer the entry with the plain path (`eth-usd`); SVR
   variants are duplicates. Where `secondaryProxyAddress` exists (Base), treat it as the standard proxy.
   Known: Ethereum ETH/USD `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`.

2. **Read it.**

   ```
   latestRoundData()  0xfeaf968c → (uint80 roundId, int256 answer, uint256 startedAt,
                                     uint256 updatedAt, uint80 answeredInRound)
   decimals()         0x313ce567    description()  0x7284e416
   ```

   ```sh
   cast call <proxy> "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url $RPC
   ```

   `price = answer / 10^decimals`. USD pairs are usually 8 decimals, ETH-denominated pairs 18. Read `decimals()`
   once rather than assuming.

3. **Validate before use.**

   | Check | Rule | On failure |
   |---|---|---|
   | Positive | `answer > 0` | reject |
   | Fresh | `now - updatedAt <= heartbeat × 1.1` (margin for block time) | stale: fall back or halt |
   | Complete | `updatedAt != 0` | reject (round not finished) |
   | Plausible | within your sanity band vs a second source | flag, see `oracle-vs-dex-prices` |
   | L2 sequencer | sequencer uptime feed `answer == 0` and `now - startedAt > 3600` | halt: sequencer down or just restarted |

   `answeredInRound` is deprecated as a staleness signal; use `updatedAt`.

4. **Know the trigger parameters.** Each feed updates on deviation (e.g. 0.5% on Ethereum ETH/USD) or heartbeat
   (e.g. 3600s there; stablecoin feeds often 86400s, many L2 feeds differ). Read both from the directory per
   chain; never hardcode one chain's heartbeat for another. A quiet stablecoin feed that is 20 hours old can be
   perfectly healthy.

5. **Pick the right feed type.**
   - Market price feeds (`ETH/USD`).
   - Exchange-rate feeds for LSTs/LRTs (`wstETH/stETH` style): a contract rate, not a market price. A depeg will
     not show there; pair with a market feed.
   - Proof of Reserve feeds: reserves reported for wrapped or backed assets. Check their heartbeat too.
   - Data Streams: pull-based low-latency reports verified on-chain, for perps and fast markets.
   - Solana: Chainlink feeds are accounts read through the Chainlink store program; `chainlink_feeds` with
     `"chain": "solana"` handles it. Many Solana apps use Pyth (pull oracle) instead; compare publish time too.

6. **Report.** Price, pair, chain, proxy address, `updatedAt` as UTC plus age in seconds, heartbeat, and pass/fail
   on each check. Example: `ETH/USD 3,412.55 · ethereum · updated 41s ago (heartbeat 3600s, deviation 0.5%) · checks ok`.

## Solidity consumer pattern

```solidity
(, int256 answer, uint256 startedAt, uint256 updatedAt, ) = feed.latestRoundData();
require(answer > 0, "bad answer");
require(block.timestamp - updatedAt <= HEARTBEAT + GRACE, "stale");
// on L2: check sequencerUptimeFeed answer == 0 and block.timestamp - startedAt > GRACE_PERIOD
uint256 price = uint256(answer) * 1e18 / 10 ** feed.decimals();
```

## Check before you finish

- [ ] The proxy came from the directory or the verified registry, not from a web page.
- [ ] Decimals were read, and the price is scaled correctly.
- [ ] Age (`now - updatedAt`) is shown and compared to that feed's heartbeat.
- [ ] On L2s, the sequencer uptime feed was checked (for contract integrations).
- [ ] The feed type (market vs exchange rate vs PoR) matches the question.

## Pitfalls

- **Reading the aggregator instead of the proxy.** Aggregators get replaced; proxies stay. Always use the proxy.
- **Assuming 18 decimals.** USD feeds are 8; scaling wrong is off by 10^10.
- **Hardcoding a single global heartbeat.** Staleness rules must be per feed.
- **Using an exchange-rate feed as a market price.** It hides depegs that liquidations care about.
- **Deprecated feeds.** The directory marks feeds being sunset; a deprecated proxy may stop updating.

## Related

- `oracle-vs-dex-prices` — reconciling oracle, DEX and API prices.
- `chainlink-ccip-basics` — the other Chainlink service you will meet.
- `stablecoin-risk` — peg monitoring with feeds.
- `defi-yield-due-diligence` — which oracle a protocol trusts.
- `solidity-audit-checklist` — oracle checks in code review.
