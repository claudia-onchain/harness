---
name: stablecoin-risk
description: "Assesses stablecoin risk across chains: backing model, issuer freeze and blacklist powers, native vs bridged versions, peg health from oracles and DEX pools, supply trends and redemption paths. Use when someone asks \"is USDe safe\", \"which USDC is this\", \"is this stable depegging\", \"USDC.e vs native USDC\", \"what backs this stablecoin\", or before parking funds in or earning yield on a stablecoin. Research, never financial advice."
license: MIT
metadata:
  title: "Stablecoin Risk"
  category: "crypto-core"
  level: "intermediate"
  tags: "stablecoins, usdc, usdt, dai, usde, depeg, blacklist, bridged tokens, cctp, peg"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Stablecoin Risk

"Stable" describes the goal, not the guarantee. Each stablecoin carries a different mix of issuer, collateral,
smart-contract, bridge and censorship risk, and the same ticker can mean different tokens on different chains. The
idea that matters most: identify the exact contract first, then ask what happens to it when the backing is stressed.

## When to use

- "Is USDe / USDS / PYUSD / FDUSD safe?", "what backs this stablecoin?"
- "Which USDC is this?", "USDC.e vs USDC on Arbitrum", a stable that shows the wrong price.
- A peg wobble or depeg headline; deciding whether to hold, swap or wait.
- Before earning yield on a stable, or choosing which stable to settle payments in.

## Steps

1. **Pin the exact token.** `token_info { "address": "<token>", "chain": "arbitrum" }` for name, symbol,
   decimals, supply. Compare with the issuer's published address list. Bridged versions (USDC.e, axlUSDC, Wormhole
   USDC) are IOUs on a bridge, not issuer liabilities; native USDC moves cross-chain through Circle's CCTP.
2. **Classify the backing model.** Use the table below. Name the model in your answer; risk follows from it.
3. **Read issuer powers on-chain.** `contract_abi`, then `read_contract` for `paused()`, `owner()`,
   blacklist checks (`isBlacklisted(address)` on USDC, `getBlackListStatus(address)` / `isBlackListed` on USDT),
   `masterMinter()`, and the proxy admin via `cast admin <token> --rpc-url $RPC`. Fiat stables can freeze any
   address; that is a feature for the issuer and a risk for you.
4. **Check the peg from two sides.** Oracle: `get_price { "symbol": "USDC", "chain": "ethereum" }` and check
   `updatedAt` vs the heartbeat. Market: `swap_quote` selling your actual size into the main pool, and
   `get_price` from DefiLlama (`coins.llama.fi`). An oracle at 1.000 while DEX quotes are 0.985 means the market is
   ahead of the oracle.
5. **Look at supply and concentration.** `web_fetch https://stablecoins.llama.fi/stablecoins?includePrices=true`
   for circulating supply per chain; `stablecoins.llama.fi/stablecoincharts/all` for trends. Rapid supply
   contraction often precedes or accompanies stress. Check pool balance skew: a Curve/Uniswap pool that is 80%+ one
   stable means people are dumping it.
6. **Confirm redemption.** Who can redeem 1:1 and how fast: KYC'd institutions only (most fiat stables), anyone via
   a PSM (DAI/USDS), or only via the market. Retail holders usually exit via DEX liquidity, so liquidity depth is
   the real redemption guarantee.
7. **Write the verdict.** Model, issuer powers, peg readings with sources and timestamps, liquidity at size,
   worst-case scenario, and which chain versions are acceptable.

## Backing models

| Model | Examples | Main risks |
|---|---|---|
| Fiat / T-bill reserves | USDC, USDT, PYUSD, FDUSD, RLUSD | issuer, banking, freeze, attestation quality |
| Crypto-overcollateralized | DAI/USDS, LUSD, BOLD, GHO, crvUSD | collateral crash, liquidation cascades, governance |
| Synthetic / delta-neutral | USDe | negative funding, exchange custody, basis unwind |
| Yield-bearing wrappers | sUSDe, sUSDS, sDAI, USDY | underlying + wrapper contract, cooldowns |
| Algorithmic / reflexive | UST (collapsed 2022) | death spiral; treat as uninvestable |
| Bridged representations | USDC.e, axlUSDC | bridge hack makes them worthless while native holds |

History to cite: UST went to near zero in May 2022; USDC traded near $0.88 during the March 2023 SVB weekend and
recovered; DAI followed because of USDC collateral. Contagion runs through collateral.

## Thresholds

- Deviation under 0.3%: normal noise. 0.3-1% sustained over 1 hour: watch and check news and pool skew.
- Over 1% for over 1 hour, or over 3% at any time: alert the user; do not add exposure.
- Oracle `updatedAt` older than its heartbeat: treat the feed as stale.

## Check before you finish

- [ ] The exact contract address and chain are cited, and native vs bridged is stated.
- [ ] Backing model is named and its main failure mode explained.
- [ ] Freeze, pause, mint and upgrade powers were read on-chain.
- [ ] Peg was checked from both an oracle and a real quote at the user's size, with timestamps.
- [ ] Redemption path for this user (not institutions) is described.
- [ ] No swap is proposed without `simulate_tx` and human approval.

## Pitfalls

- **Ticker matching.** Scam tokens named "USDC" exist on every chain; always match by address.
- **Hardcoded oracles.** Many lending markets price stables at exactly $1.00, so a depeg turns into bad debt.
- **Yield = safety confusion.** A higher yield on a stable usually means more risk, not a better issuer.
- **Decimals.** USDC and USDT use 6 decimals on most EVM chains (USDT on BNB Chain uses 18); verify per chain.
- **Headlines as truth.** Social posts during a depeg are noisy and sometimes adversarial; trust on-chain data.

## Related

- `defi-yield-due-diligence` — yields paid on top of a stable
- `chainlink-price-feeds` — reading and sanity-checking the peg oracle
- `oracle-vs-dex-prices` — when the oracle and the market disagree
- `bridging-with-lifi` — moving native stables between chains
- `onchain-alerts-and-watchers` — automated depeg alerts
