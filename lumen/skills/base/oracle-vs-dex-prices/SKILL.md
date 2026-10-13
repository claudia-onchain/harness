---
name: oracle-vs-dex-prices
description: "Reconciles prices from oracles (Chainlink push feeds, Pyth pull feeds), DEX pools (spot from reserves or sqrtPriceX96, TWAPs), executable aggregator quotes (0x, Jupiter) and data APIs (DefiLlama, CoinGecko, Alchemy), explaining every gap: oracle deviation lag, thin pools, quote-asset depegs, bridged variants, LST exchange rates and manipulation. Use when someone asks \"why are these prices different\", \"which price is right\", \"is this pool being manipulated\", \"is the oracle lagging\", \"what's the real price\", or before using any single price for a liquidation, valuation or trade."
license: MIT
metadata:
  title: "Oracle vs DEX prices"
  category: "crypto-core"
  level: "advanced"
  tags: "oracle, dex, price, chainlink, pyth, twap, uniswap, jupiter, defillama, manipulation, depeg, deviation"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Oracle vs DEX prices

There is no single "real" price on-chain. An oracle tells you a robust consensus price as of its last update; a
DEX pool tells you the marginal price someone could trade at right now in that pool; an aggregator quote tells you
what your size would actually get. Disagreements are information. Gather at least three, normalize them, and
explain the gap before trusting any one.

## When to use

- "Why does Chainlink say 3,400 and the pool say 3,350?", "which price is right?".
- A long-tail token shows wildly different prices across sites.
- Valuing a portfolio, setting a limit, or checking a protocol's liquidation risk.
- Suspected manipulation: a pool price spiked in one block.

## Steps

1. **Collect sources with timestamps.**

   ```
   get_price { "symbol": "ETH", "chain": "arbitrum" }                    // Chainlink first: usd + source + updatedAt
   get_price      { "chain": "arbitrum", "symbol": "ETH" }                      // returns source + updatedAt
   swap_quote     { "chain": "arbitrum", "sellToken": "WETH", "buyToken": "USDC", "sellAmountUsd": 10000 }
   web_fetch      https://coins.llama.fi/prices/current/arbitrum:<token>       // read confidence
   ```

   Solana: Jupiter `https://api.jup.ag/price/v3?ids=<mint>`, a Jupiter `swap_quote`, and Pyth Hermes
   `https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>` (`price`, `conf`, `expo`, `publish_time`).

2. **Read pool spot directly when it matters.**
   - Uniswap V2-style: `getReserves()` `0x0902f1ac` → `price = reserve1/reserve0 × 10^(dec0 − dec1)`.
   - Uniswap V3-style: `slot0()` `0x3850c7bd` → `price = (sqrtPriceX96 / 2^96)^2 × 10^(dec0 − dec1)`
     (V4: `getSlot0(poolId)` on the StateView lens, same math).
   - TWAP: V3 `observe(uint32[])` `0x883bdbfd` with `[1800, 0]` → average tick over 30 min, `price = 1.0001^tick`.

3. **Normalize before comparing.** Same quote asset (USD vs USDC vs USDT: check the stable's own price), same base
   asset (WETH vs ETH, native USDC vs bridged USDC.e), decimals applied, mid vs executable price, and timestamps
   within the same minute.

4. **Measure deviation from the median** and classify.

   | Asset class | Normal | Investigate | Red |
   |---|---|---|---|
   | Majors (ETH, BTC, SOL) | < 0.5% | 0.5–2% | > 2% |
   | Stablecoins vs 1.00 | < 0.3% | 0.3–1% | > 1% |
   | Mid caps | < 1.5% | 1.5–5% | > 5% |
   | Long tail | < 3% | 3–10% | > 10% |

5. **Explain the gap.** Usual causes, in order of frequency:
   - Oracle within its deviation band: a 0.4% gap on a 0.5%-deviation feed is by design, not lag.
   - Stale source: check `updatedAt`, `publish_time`, DefiLlama `timestamp`, and `confidence` < 0.9.
   - Thin pool: small TVL means one trade moves spot; the executable quote at size will be worse.
   - Quote-asset depeg: the pool is priced in a stable that is off peg.
   - Wrong variant: bridged token, rebasing vs wrapped (stETH vs wstETH), LST exchange-rate feed vs market price.
   - Manipulation: single-block spike, spot far from TWAP, large swap then reverse in the same block (flash loan).
   - L2 sequencer down: oracle frozen while CEX prices move.

6. **Choose by use case.**

   | Use | Best source |
   |---|---|
   | Liquidations, collateral value | oracle with staleness checks (never pool spot) |
   | "What will I get?" | aggregator quote at your size |
   | Portfolio value | oracle for majors, aggregator/API with confidence for long tail |
   | Manipulation check | spot vs TWAP vs oracle |
   | Peg monitoring | market price (DEX/aggregator), not issuer exchange rate |

7. **Report.** Table of source · price · age · deviation from median, then one paragraph: which price to use for
   this purpose and why, and what would change the answer.

## Check before you finish

- [ ] At least three sources, each with a timestamp, with at least one executable quote.
- [ ] Quote assets, variants and decimals are normalized.
- [ ] Deviations are computed against the median and classified for the asset class.
- [ ] The cause of any gap above "normal" is named or explicitly unknown.
- [ ] The recommended price matches the use case.

## Pitfalls

- **Pool spot for collateral.** That is the classic flash-loan exploit; contracts must use oracles or TWAPs.
- **Treating aggregator APIs as oracles.** CoinGecko and DefiLlama are off-chain and can be minutes stale.
- **Comparing USD to USDT prices** during a stable wobble and calling it a token move.
- **TWAP windows too short.** A 1-minute TWAP on a thin pool is still manipulable; use 30 minutes or more.
- **Pyth confidence ignored.** A wide `conf` relative to price means the oracle itself is unsure; treat as amber.

## Related

- `chainlink-price-feeds` — reading and validating Chainlink correctly.
- `swaps-and-slippage` — executable prices and price impact.
- `stablecoin-risk` — when the quote asset is the problem.
- `mev-and-sandwich-awareness` — manipulation that targets your trades.
- `portfolio-and-pnl` — choosing prices for valuation.
