---
name: honeypot-and-tax-check
description: "Tests whether a token can actually be sold and what it really costs: simulates a small buy then sell, measures effective buy/sell tax from balance deltas, and reads the code paths behind honeypots (blacklists, max-tx, cooldowns, owner-set fees, trading switches; Solana freeze authority and Token-2022 transfer fees, hooks, permanent delegates; Sui deny lists). Use when someone asks \"is this a honeypot\", \"can I sell this\", \"what's the tax on this token\", \"why did my sell fail\", \"why did I get less than quoted\", or before the first buy of any new token."
license: MIT
metadata:
  title: "Honeypot and tax check"
  category: "crypto-core"
  level: "advanced"
  tags: "honeypot, tax, fee on transfer, simulation, blacklist, token-2022, transfer hook, freeze authority, sell test"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Honeypot and tax check

A honeypot is a token you can buy but not sell, or can sell only at a punishing tax. The only real test is to
simulate the round trip: buy a small amount, then sell it from the resulting state, and measure what actually
arrives. Third-party scanners are a useful second opinion, but they read the same code a scammer can change one
block later.

## When to use

- "Is this a honeypot?", "can I sell this?", "what's the buy/sell tax?".
- A sell reverted, or a swap delivered far less than the quote.
- As row 8–9 of `rug-check`, and before the first buy of any token younger than a week.

## Steps

1. **Simulate the buy.** Get a firm route, then simulate without sending:

   ```
   swap_quote  { "chain": "base", "sellToken": "ETH", "buyToken": "<token>", "sellAmountUsd": 20, "taker": "<wallet>" }
   simulate_tx { "chain": "base", "tx": "<quote.transaction>", "from": "<wallet>" }
   ```

   Record `expectedOut` (quote `buyAmount`, or router `getAmountsOut` selector `0xd06ca61f`) and `actualOut`
   (token balance delta in the simulation).

2. **Simulate the sell from the post-buy state.** The sell must run on top of the buy, or a "can't sell" rule that
   triggers on holders will not fire. Options, best first:
   - `simulate_tx` with a bundle / state overrides if the provider supports it (`eth_simulateV1`, Alchemy bundle
     simulation).
   - A local fork: `anvil --fork-url <rpc>`, run buy then sell with `cast send`, read balances with `cast call`.
   - Solana: simulate the Jupiter sell order (`swap_quote` on solana with input = the token) via
     `simulateTransaction` after the buy; check `err` and `logs`.

3. **Compute effective taxes.**

   ```
   buyTax  = 1 - actualOut / expectedOut           (minus quoted slippage and pool fee)
   sellTax = 1 - nativeReceived / quotedNativeOut
   ```

   | Effective tax | Read as |
   |---|---|
   | 0% (± pool fee) | normal token |
   | 0–5% | fee-on-transfer, disclose it |
   | 5–10% | expensive; check who receives it |
   | ≥ 10%, or sell ≫ buy | treat as red |
   | sell reverts / output ~0 | honeypot: STOP |

4. **Read the code paths that change the answer later.** EVM (`contract_abi` source): owner-settable fees with
   no cap (`setFee`, `setTaxes`), `blacklist`/`isBot` mappings, `tradingEnabled` switches, `maxTxAmount`,
   `maxWallet`, cooldowns, `_transfer` branches on `to == pair`, external calls to an unverified contract.
   A cap like `require(fee <= 10)` is amber; no cap is red even if today's fee is 0.

5. **Non-EVM equivalents.**
   - Solana: freeze authority set (they can freeze your account), Token-2022 `TransferFeeConfig` (basis points and
     max fee; the authority can raise it after an epoch), `TransferHook` (a program that can reject transfers),
     `PermanentDelegate` (can move or burn your balance), `DefaultAccountState = Frozen`, `NonTransferable`.
   - Sui: regulated coins with a `DenyCapV2` can add your address to the deny list.
   - Aptos fungible assets: dispatchable hooks and freeze refs held by the issuer.
   - TRON TRC-20: same patterns as EVM; also check the energy cost of a sell (huge = loop trap).

6. **Second opinion, labelled as such.** `web_fetch` a scanner and quote it with its timestamp:
   `https://api.honeypot.is/v2/IsHoneypot?address=<token>&chainID=<id>`,
   `https://api.gopluslabs.io/api/v1/token_security/<chainId>?contract_addresses=<token>`,
   Solana: `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=<mint>`.
   Disagreement with your own simulation: trust the simulation, report both.

## Check before you finish

- [ ] Buy and sell were both simulated, the sell on post-buy state.
- [ ] Effective buy and sell tax are numbers, with the formula inputs shown.
- [ ] Owner-adjustable fees, blacklists and trading switches are listed even if inactive today.
- [ ] Solana: freeze authority and every Token-2022 extension are reported.
- [ ] Scanner results are labelled third-party and timestamped.

## Pitfalls

- **Simulating from a whitelisted address.** Deployers, routers and the owner often skip fees. Simulate from a
  fresh or the user's own address.
- **Tiny test sizes.** Some contracts only block sells above a threshold or after N blocks. Test the size the user
  plans to trade, and re-test later.
- **Time bombs.** Fees that jump after a block number or timestamp. Read the source for `block.number` /
  `block.timestamp` conditions.
- **Blaming slippage.** "Slippage too low" errors on sells are often a hidden tax; raising slippage to 49% to force
  it through hands the difference to the contract or a sandwich bot.
- **Treating a scanner pass as proof.** Scanners miss proxy upgrades and novel traps; your simulation is the test.

## Related

- `rug-check` — where this check sits in the scorecard.
- `swaps-and-slippage` — fee-on-transfer tokens and slippage settings.
- `contract-verification-and-abi` — reading the transfer logic.
- `tx-decoding` — diagnosing a sell that already failed.
- `solana-programs-and-spl` — Token-2022 extensions in depth.
