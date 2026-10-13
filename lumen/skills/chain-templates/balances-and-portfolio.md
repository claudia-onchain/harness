---
name: "{{chain.id}}-balances-and-portfolio"
description: "Read every {{chain.name}} holding for an address (native {{chain.native.symbol}}, tokens, staked and DeFi positions), price it in USD and present a clean portfolio table. Use when someone asks \"what's in this {{chain.name}} wallet\", \"my {{chain.id}} balance\", \"portfolio value on {{chain.name}}\" or \"how much {{chain.native.symbol}} do I have\"."
license: MIT
metadata:
  title: "{{chain.name}}: Balances and Portfolio"
  category: "chain"
  level: "beginner"
  tags: "{{chain.id}}, {{chain.family}}, balance, portfolio, holdings, pnl"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Balances and Portfolio

A wallet view is only as good as its pricing and spam filtering. Read raw balances, scale them by the right
decimals, price only what has a real market, and say plainly which rows are unpriced. Everything here is
read-only and needs no wallet key.

## When to use

- "What's in this {{chain.name}} wallet?" or "how much {{chain.native.symbol}} do I have?"
- Portfolio value, allocation or concentration for one or more {{chain.id}} addresses
- Checking that a deposit, withdrawal or airdrop arrived
- Building the starting snapshot for PnL or tax work

## Steps

1. **Resolve the address.** Accept a raw address or a name.
{{#evm}}
   ENS names resolve with `resolve_address { "name": "<name>.eth", "chain": "ethereum" }`; the resulting
   address is the same on {{chain.name}}.
{{/evm}}
{{#solana}}
   `.sol` names resolve with `resolve_address { "name": "<name>.sol", "chain": "solana" }`.
{{/solana}}
{{#other}}
   `resolve_address` covers ENS and SNS only; for {{chain.name}} ask for the raw address and confirm it on
   {{chain.explorer}} before reading anything.
{{/other}}
2. **Read native and token balances.** `lumen balance <address> --chain {{chain.id}}` or
   `get_balance { "address": "<address>", "chain": "{{chain.id}}" }`. Under the hood:
{{#evm}}
   - `eth_getBalance` for {{chain.native.symbol}}, then `alchemy_getTokenBalances [addr, "erc20"]` (hex
     amounts) and `alchemy_getTokenMetadata` for symbol and decimals, at
     `https://{{chain.alchemy}}.g.alchemy.com/v2/KEY`.
   - Without Alchemy, Etherscan V2 `module=account&action=tokentx&chainid={{chain.chainId}}` (or the
     explorer's compatible API) lists tokens the address has touched; read each with `balanceOf`.
{{/evm}}
{{#solana}}
   - `getBalance` (lamports, 1 SOL = 10^9) plus `getTokenAccountsByOwner` with `jsonParsed` encoding, run
     once for the Token program and once for Token-2022, or Helius DAS `getAssetsByOwner` with
     `showFungible: true` in one call.
{{/solana}}
{{#bitcoin}}
   - `GET {{chain.publicRpc.0}}/address/<addr>`: balance = `chain_stats.funded_txo_sum - chain_stats.spent_txo_sum`
     (sats), plus `mempool_stats` for unconfirmed. `/address/<addr>/utxo` lists the coins.
   - A wallet is many addresses. For a full wallet balance use the wallet app or an xpub-aware tool; one
     address is rarely the whole picture.
{{/bitcoin}}
{{#sui}}
   - `suix_getAllBalances [owner]` returns `{coinType, totalBalance}` per coin type (`0x2::sui::SUI` is 9
     decimals); `suix_getCoinMetadata` gives decimals for the rest.
{{/sui}}
{{#aptos}}
   - Indexer GraphQL `current_fungible_asset_balances` filtered by `owner_address` covers both legacy coins
     and Fungible Assets; for one asset use the view function `0x1::coin::balance` or
     `0x1::primary_fungible_store::balance`. APT has 8 decimals (octas).
{{/aptos}}
{{#tron}}
   - TronGrid `GET {{chain.publicRpc.0}}/v1/accounts/<addr>` returns `balance` in sun (1 TRX = 10^6 sun), a
     `trc20` list and `assetV2` for TRC-10 tokens. Frozen (staked) TRX is reported separately.
{{/tron}}
{{#starknet}}
   - Balances are ERC-20 `balance_of` calls on each token contract (STRK, ETH, USDC and so on) via
     `starknet_call`. The RPC has no "all tokens" index; use Voyager ({{chain.explorer}}) or an indexer to
     discover which tokens the account holds.
{{/starknet}}
3. **Price every row.** `get_price { "token": "<token>", "chain": "{{chain.id}}" }` per token.
{{#llama}}
{{^bitcoin}}
   Batch with `https://coins.llama.fi/prices/current/{{chain.llama}}:<tokenA>,{{chain.llama}}:<tokenB>`, which
   returns price, decimals and a `confidence` score; treat confidence below 0.9 as unreliable.
{{/bitcoin}}
{{/llama}}
{{^llama}}
   DefiLlama does not index {{chain.name}} yet, so use Alchemy prices, CoinGecko or the pool price on the
   main DEX, and say which source each row used.
{{/llama}}
{{#bitcoin}}
   Only BTC needs a price (`lumen price BTC --chain bitcoin`); Runes and BRC-20 balances come from
   marketplace indexers and are often illiquid.
{{/bitcoin}}
{{#claudia}}
   `claudia_coin { "chain": "{{chain.id}}", "token": "<token>" }` adds market data for {{chain.name}} coins.
{{/claudia}}
4. **Drop spam and dust.** Unsolicited tokens the owner never bought, tokens with no
   liquidity, and anything whose name contains a URL or "claim" are spam. List them as "unpriced / ignored",
   never add their claimed value to the total, and never tell the user to interact with them.
5. **Add positions the wallet view misses.**
{{#evm}}
   LP NFTs (concentrated-liquidity positions), lending receipt tokens, vault shares and staked tokens each
   need their protocol's math; use `read_contract` on the position contract or the protocol's own UI.
{{/evm}}
{{#solana}}
   Native stake accounts (owned by the Stake program, not the wallet), LSTs (JitoSOL, mSOL, JupSOL), LP
   positions and lending deposits live in separate accounts; check the explorer's portfolio tab.
{{/solana}}
{{#bitcoin}}
   Babylon-staked BTC sits in timelocked outputs, Lightning channel balances are off-chain, and wrapped BTC
   lives on other chains; ask before assuming the list is complete.
{{/bitcoin}}
{{#sui}}
   `StakedSui` objects (native staking), LSTs, LP positions and lending obligations are separate objects;
   `suix_getOwnedObjects` with a `StructType` filter finds them.
{{/sui}}
{{#aptos}}
   Delegated stake in delegation pools, LSTs (amAPT, stAPT, thAPT) and LP positions are not plain balances;
   use the protocol view functions or the explorer's account tab.
{{/aptos}}
{{#tron}}
   Staked TRX (Stake 2.0) and the energy or bandwidth it provides, JustLend deposits and SunSwap LP tokens
   are separate; staked TRX takes 14 days to unlock after unstaking.
{{/tron}}
{{#starknet}}
   Delegated STRK, LSTs and lending or LP positions live in protocol contracts; read them with
   `starknet_call` or the protocol UI.
{{/starknet}}
6. **Present it.** One table: asset, amount, USD value, price source, share of total. Put the timestamp and
   the explorer link ({{chain.explorer}}) under it, and list unpriced rows separately.

## Check before you finish

- [ ] Every amount was divided by its own token decimals (native {{chain.native.symbol}} is {{chain.native.decimals}})
- [ ] Each priced row names its source; unpriced and spam rows are excluded from the total
- [ ] Staked or DeFi positions were checked or explicitly flagged as not included
- [ ] The total was spot-checked against {{chain.explorer}}

## Pitfalls

- Spam tokens often report absurd values in naive price lookups; a token with no pool has no price.
- Rebasing and share-based tokens change value without a transfer; re-read, do not cache balances for long.
{{#bitcoin}}
- Change outputs move coins to new addresses; a single-address balance drops to zero after a spend.
{{/bitcoin}}
{{#evm}}
- Bridged tokens with the same symbol (USDC vs USDC.e) are different assets with different risks.
{{/evm}}
{{#solana}}
- Token-2022 accounts are missed if you only query the classic Token program.
{{/solana}}
- Portfolio numbers are information, not advice; never suggest trades from a balance view alone.

## Related

- `{{chain.id}}-token-research` — dig into an unfamiliar holding
- `{{chain.id}}-price-feeds` — where each price comes from
- `{{chain.id}}-defi-yields` — understanding staked and LP positions
- `portfolio-and-pnl` — cost basis and PnL across chains
- `tax-ready-ledgers` — exporting history for taxes
