---
name: "{{chain.id}}-price-feeds"
description: "Get trustworthy prices on {{chain.name}}: oracle feeds, aggregator and DEX prices, staleness checks and cross-checking two sources. Use when someone asks \"price of {{chain.native.symbol}}\", \"what oracle does {{chain.name}} use\", \"is this price stale\", \"read a price feed on {{chain.id}}\" or needs a price for a contract or report."
license: MIT
metadata:
  title: "{{chain.name}}: Price Feeds"
  category: "chain"
  level: "intermediate"
  tags: "{{chain.id}}, {{chain.family}}, price feeds, oracle, chainlink, pricing"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Price Feeds

A price is a claim with a source and a timestamp. On {{chain.name}} the best source depends on what you need:
an oracle feed for anything a contract or a big decision relies on, an aggregator for long-tail tokens, a DEX
pool only as a last resort. Always say where a number came from and how old it is.

## When to use

- "What's the price of {{chain.native.symbol}}?" or "price this {{chain.id}} token"
- Choosing an oracle for a contract or a liquidation-sensitive position on {{chain.name}}
- Two tools disagree on a price, or a price looks stale
- Valuing a portfolio or a report that needs defensible numbers

## Steps

1. **Quick price.** `lumen price {{chain.native.symbol}} --chain {{chain.id}}` or
   `get_price { "symbol": "{{chain.native.symbol}}", "chain": "{{chain.id}}" }`; for a token pass
   `"token": "<address>"`. Note the `source` and `updatedAt` fields in the answer.
{{#evm}}
{{#chainlink}}
2. **Use Chainlink where a feed exists.** `get_price` already tries Chainlink first;
   `chainlink_feeds { "chain": "{{chain.id}}" }` lists the feeds Lumen knows here. The full directory is
   `https://reference-data-directory.vercel.app/feeds-{{chain.chainlink}}.json`; entries carry `name`, `path`,
   `proxyAddress`, `decimals` and `heartbeat`. Prefer the standard entry (for example `path: "eth-usd"`) over
   SVR duplicates, and use `secondaryProxyAddress` as the standard proxy when it is present.
3. **Read it yourself when needed.** `latestRoundData()` is selector `0xfeaf968c` and returns
   `(roundId, answer, startedAt, updatedAt, answeredInRound)`:
   `cast call <proxy> "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url https://{{chain.alchemy}}.g.alchemy.com/v2/KEY`
   or `read_contract { "address": "<proxy>", "chain": "{{chain.id}}", "function": "latestRoundData()" }`.
   Scale `answer` by `decimals()` (`0x313ce567`, usually 8 for USD pairs).
4. **Check staleness and sanity.** Reject the value if `answer <= 0` or if `now - updatedAt` exceeds the
   feed's `heartbeat` plus a small margin (for example 3600 s heartbeat, reject after ~3700 s). The heartbeat
   is a maximum: a feed also updates whenever price moves past its deviation threshold.
{{#llama}}
   Tokens without a feed fall back to DefiLlama (`{{chain.llama}}:<token>`, confidence ≥ 0.9) and CoinGecko.
{{/llama}}
{{#l2}}
   On an L2, also check the Chainlink L2 sequencer uptime feed if one exists for {{chain.name}}: during and
   just after sequencer downtime, prices can be stale even if they look fresh.
{{/l2}}
{{/chainlink}}
{{^chainlink}}
2. **No Chainlink directory for {{chain.name}}.** Lumen has no Chainlink feed list here, so use, in order:
{{#llama}}
   - DefiLlama: `https://coins.llama.fi/prices/current/{{chain.llama}}:<token>` (check `confidence`, ≥ 0.9).
{{/llama}}
   - Alchemy prices: `GET https://api.g.alchemy.com/prices/v1/KEY/tokens/by-symbol?symbols={{chain.native.symbol}}`.
   - CoinGecko `simple/price` for listed assets.
{{#claudia}}
   - `claudia_coin { "chain": "{{chain.id}}", "token": "<token>" }` for {{chain.name}} coin market data.
{{/claudia}}
   - Pull oracles that may be deployed here (Pyth, RedStone, API3): confirm the contract from the oracle's own
     docs, never from a token page. Pyth prices come from Hermes
     (`https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feed id>`) with a confidence interval.
3. **DEX price as last resort.** Read the main pool's reserves or a TWAP over at least 30 minutes; a spot
   pool price can be moved by one trade or a flash loan.
4. **Cross-check against a reference.** For majors compare with Chainlink on Ethereum, for example
   `get_price { "symbol": "ETH", "chain": "ethereum" }`.
{{/chainlink}}
{{/evm}}
{{#solana}}
2. **Jupiter for spot.** `https://api.jup.ag/price/v3?ids=<mint1>,<mint2>` returns `usdPrice` and
   `priceChange24h` per mint (keyless at about 0.5 requests/s; `JUPITER_API_KEY` raises it).
3. **Oracles for anything a program relies on.** Pyth (Hermes API or on-chain price accounts) publishes a price
   plus a confidence interval and publish time; reject if the interval is wide (above ~1% for majors) or the
   publish time is old. Chainlink feeds for Solana are listed at
   `https://reference-data-directory.vercel.app/feeds-{{chain.chainlink}}.json`; they are read through the
   Chainlink store program, not an EVM `latestRoundData` call. Switchboard is the third common option.
4. **Cross-check.** DefiLlama `solana:<mint>` or CoinGecko against Jupiter; a gap above ~2% on a liquid token
   means one source is stale or the pool is being pushed. `claudia_coin { "chain": "solana", "token": "sol:<mint>" }`
   adds market context for Solana coins.
{{/solana}}
{{#bitcoin}}
2. **Reference sources for BTC.** CoinGecko (`bitcoin`), DefiLlama (`coingecko:bitcoin`) and mempool.space
   `GET {{chain.publicRpc.0}}/v1/prices` (USD, EUR and more, updated every few minutes).
3. **Oracle-grade BTC/USD.** Bitcoin has no on-chain oracle; contracts use BTC/USD feeds on other chains:
   `get_price { "symbol": "BTC", "chain": "ethereum" }`, or Pyth BTC/USD. Check `updatedAt` against
   the feed heartbeat before trusting it.
4. **Runes and BRC-20.** Prices are last trades on marketplaces and are thin; quote them as "last trade" with
   the venue and time, never as a market price.
{{/bitcoin}}
{{#sui}}
2. **Oracles on Sui.** Pyth and Supra publish on-chain price objects with timestamps; check the age and, for
   Pyth, the confidence interval before using them.
3. **Aggregators.** DefiLlama `sui:<coin type>` (for example `sui:0x2::sui::SUI`), CoinGecko, or the quote
   from a Sui aggregator for long-tail coins.
4. **Cross-check.** Two sources within ~2% on liquid coins; otherwise flag the price as uncertain.
{{/sui}}
{{#aptos}}
2. **Oracles on Aptos.** Pyth, Switchboard and Supra publish on Aptos; read them through their view functions
   and check the timestamp and confidence.
3. **Aggregators.** DefiLlama `aptos:<coin type or FA address>`, CoinGecko, or a quote from Panora or another
   Aptos aggregator for long-tail assets.
4. **Cross-check.** Two sources within ~2% on liquid assets; otherwise flag the price as uncertain.
{{/aptos}}
{{#tron}}
2. **Oracles on TRON.** WINkLink is the main on-chain oracle (Chainlink-style aggregator contracts); read
   with TronGrid `triggerconstantcontract` and check the update time.
3. **Aggregators.** DefiLlama `tron:<token>`, CoinGecko, or the SunSwap pool price for long-tail TRC-20s.
4. **Cross-check.** USDT on TRON should sit within a few tenths of a percent of $1; anything else is a
   depeg signal or a fake token.
{{/tron}}
{{#starknet}}
2. **Oracles on Starknet.** Pragma is the native oracle (median feeds keyed by pair ids such as `ETH/USD`);
   Chainlink also lists Starknet feeds at
   `https://reference-data-directory.vercel.app/feeds-{{chain.chainlink}}.json`. Read either with
   `starknet_call` and check the timestamp; Cairo feeds do not use the EVM `0xfeaf968c` selector.
3. **Aggregators.** DefiLlama `starknet:<token>`, CoinGecko, or an AVNU quote for long-tail tokens.
4. **Cross-check.** Two sources within ~2% on liquid tokens; otherwise flag the price as uncertain.
{{/starknet}}
5. **Report it properly.** Price, source, timestamp and, when sources disagree, both numbers and the gap.
   Save repeated lookups with `memory_save` only if the user wants a watchlist.

## Check before you finish

- [ ] Every price states its source and age
- [ ] Oracle values passed a staleness check (timestamp vs heartbeat or publish time)
- [ ] At least two independent sources agree for anything used in a decision
- [ ] DEX spot prices were not used for anything a contract or liquidation depends on

## Pitfalls

- Spot pool prices are manipulable within one block; use TWAPs or oracles for anything that matters.
{{#evm}}
- Wrong decimals: Chainlink USD feeds are usually 8 decimals, ETH-denominated feeds 18.
{{/evm}}
- Wrapped and bridged versions of one asset (and depegged stablecoins) can trade at different prices.
- A price is not a forecast or advice; report it, do not recommend trades from it.

## Related

- `{{chain.id}}-swaps` — executable prices include slippage and fees
- `{{chain.id}}-alerts` — watch a price over time
- `chainlink-price-feeds` — Chainlink details across chains
- `oracle-vs-dex-prices` — when each source is right
- `stablecoin-risk` — depegs and fake stables
