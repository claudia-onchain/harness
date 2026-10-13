---
name: "{{chain.id}}-whale-watch"
description: "Track large holders and big movements on {{chain.name}}: find the wallets that matter, label them, read their recent activity, scan for large transfers of a token, and interpret flows without treating them as trade signals. Use when someone asks \"what are whales doing on {{chain.name}}\", \"track this {{chain.id}} wallet\", \"who is buying this token\", \"large transfers of {{chain.native.symbol}}\" or \"smart money on {{chain.name}}\"."
license: MIT
metadata:
  title: "{{chain.name}}: Whale Watch"
  category: "chain"
  level: "intermediate"
  tags: "{{chain.id}}, {{chain.family}}, whales, smart money, wallet tracking, flows"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Whale Watch

Big wallets are worth watching, but most large movements are boring: exchange rebalancing, bridge transfers,
treasury operations. The skill is labelling wallets correctly before reading meaning into their flows. Report
what moved and what it plausibly means; never present it as a signal to trade.

## When to use

- "What are whales doing with this token on {{chain.name}}?"
- Following a specific {{chain.id}} wallet, fund, deployer or treasury
- Explaining a sudden price move by looking for large transfers
- Building a watchlist for `{{chain.id}}-alerts`

## Steps

1. **Pick the wallets.** From the token's top holders (see `{{chain.id}}-token-research`), known treasury or
   fund addresses the user provides, or wallets that appeared in a large trade. Remove pools, bridges,
   burn addresses and exchange hot wallets from the "whale" list, but keep them as labels.
2. **Label before you interpret.** Explorer tags on {{chain.explorer}} and project docs{{#evm}}, plus
   `resolve_address` for ENS names{{/evm}}. Save labels with
   `memory_save { "text": "{{chain.id}} label: <address> = <who>" }` so later sessions reuse them.
3. **Read recent activity.** `address_activity { "address": "<address>", "chain": "{{chain.id}}", "limit": 50 }`.
{{#evm}}
   Backed by `alchemy_getAssetTransfers` with categories `external`, `erc20`, `erc721`, `erc1155`, newest
   first; Etherscan V2 `action=txlist&chainid={{chain.chainId}}` is the fallback.
{{/evm}}
{{#solana}}
   Backed by `getSignaturesForAddress` (paginate with `before`, up to 1000 per page) plus parsed
   transactions; Helius enhanced transactions label swaps and transfers directly.
{{/solana}}
{{#bitcoin}}
   Backed by `GET {{chain.publicRpc.0}}/address/<addr>/txs` (newest first, paginate with `/txs/chain/<last txid>`).
   Remember change outputs: a whale "moving" coins is often just a wallet spending to its own new address.
{{/bitcoin}}
{{#sui}}
   Backed by `suix_queryTransactionBlocks` filtered by `FromAddress` or `ToAddress`, newest first.
{{/sui}}
{{#aptos}}
   Backed by the Indexer GraphQL `account_transactions` and `fungible_asset_activities` for the address.
{{/aptos}}
{{#tron}}
   Backed by TronGrid `/v1/accounts/<addr>/transactions` and `/v1/accounts/<addr>/transactions/trc20` (USDT
   flows dominate TRON whale activity).
{{/tron}}
{{#starknet}}
   Backed by `starknet_getEvents` on token contracts with the address in the Transfer keys, via `rpc_call`, or
   Voyager's activity view.
{{/starknet}}
{{^bitcoin}}
4. **Scan a token for large transfers.** Pull recent transfers of the token
   (`address_activity` on the token{{#evm}}, or Transfer logs as in `{{chain.id}}-indexing-and-events`{{/evm}})
   and keep those above a threshold such as 0.5% of supply or a USD floor priced with `get_price`.
{{/bitcoin}}
{{#bitcoin}}
4. **Scan for large BTC movements.** `GET {{chain.publicRpc.0}}/mempool/recent` for unconfirmed transactions
   and `/block/<hash>/txs` for mined ones; keep outputs above a threshold such as 100 BTC, priced with
   `get_price`. Most will be exchange or custodian consolidation.
{{/bitcoin}}
{{#claudia}}
   `claudia_coin { "chain": "{{chain.id}}", "token": "<token>" }` adds holder and flow context for
   {{chain.name}} coins.
{{/claudia}}
5. **Classify each flow.** To an exchange (possible selling, or just custody), from an exchange (withdrawal),
   to a bridge (leaving {{chain.name}}), DEX swap (direction and size vs pool depth), LP add or remove, or
   wallet-to-wallet (often the same owner). Say which classification is certain and which is a guess.
6. **Summarise.** Table: time, wallet label, action, amount, USD, counterparty label, link. Then two or three
   plain observations. No "buy" or "sell" conclusions.
7. **Hand off to alerts.** If the user wants ongoing tracking, pass the labelled list to `{{chain.id}}-alerts`.

## Check before you finish

- [ ] Pools, bridges, burns and exchange wallets were labelled, not counted as whales
- [ ] Every flow links to {{chain.explorer}} and states its USD size and source
- [ ] Interpretations are marked as certain or speculative
- [ ] No trading advice was given

## Pitfalls

- Copy-trading a "smart money" wallet ignores its hedges elsewhere; you see one leg of the position.
- Exchange deposits are not proof of selling; exchanges also move funds between their own wallets.
- Labels from random dashboards are often wrong; prefer explorer tags and the project's own disclosures.
- Tracking a private individual and publishing it can cause real harm; keep reports about wallets, not people.

## Related

- `{{chain.id}}-alerts` — turn the watchlist into notifications
- `{{chain.id}}-token-research` — the token behind the flows
- `whale-and-smart-money-tracking` — methods across chains
- `onchain-alerts-and-watchers` — automated watchers
