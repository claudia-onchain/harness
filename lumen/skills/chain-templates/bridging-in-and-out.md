---
name: "{{chain.id}}-bridging-in-and-out"
description: "Move assets onto and off {{chain.name}}: canonical vs third-party bridges, LI.FI quotes, destination gas, delays, previews with approval, and tracking a transfer in flight. Use when someone asks \"bridge to {{chain.name}}\", \"move funds off {{chain.id}}\", \"how long does a {{chain.name}} withdrawal take\", \"my bridge is stuck\" or \"cheapest way onto {{chain.name}}\"."
license: MIT
metadata:
  title: "{{chain.name}}: Bridging In and Out"
  category: "chain"
  level: "intermediate"
  tags: "{{chain.id}}, {{chain.family}}, bridging, cross-chain, lifi, withdrawals"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Bridging In and Out

Bridges are where cross-chain money gets lost: wrong address formats, wrapped look-alikes, fake bridge sites
and stuck transfers. Pick the route deliberately (canonical for safety, third-party for speed), test with a
small amount, and track it to arrival. Every bridge transaction is previewed and needs explicit human approval.

## When to use

- "Bridge USDC to {{chain.name}}", "get {{chain.native.symbol}} onto {{chain.id}}", "move my funds off {{chain.name}}"
- Choosing between the canonical bridge and a faster third-party route
- A bridge transfer has not arrived, or arrived as the wrong token
- Sending from or to an exchange that lists several networks

## Steps

1. **Pin the transfer.** Source chain, destination chain, asset, amount, and the destination address.
{{#evm}}
   {{chain.name}} uses ordinary EVM addresses (same as Ethereum), but confirm the user controls that address
   on {{chain.name}}; smart-contract wallets and exchange deposit addresses are often chain-specific.
{{/evm}}
{{#solana}}
   Solana addresses are base58, not `0x`. A bridge from an EVM chain needs the Solana address typed
   explicitly; never assume "same address".
{{/solana}}
{{#bitcoin}}
   Bitcoin addresses (`bc1…`) differ from every other chain's format; the destination address on the other
   chain must be entered separately and checked character by character at the start and end.
{{/bitcoin}}
{{#other}}
{{^bitcoin}}
   {{chain.name}} addresses differ from EVM addresses; enter the destination explicitly and verify it.
{{/bitcoin}}
{{/other}}
2. **Know the route options.**
{{#evm}}
{{#l2}}
   - Canonical bridge from Ethereum: deposits land in minutes and inherit the rollup's security.
{{#op-stack}}
   - Canonical withdrawals back to Ethereum take about 7 days (OP Stack fault-proof window) and need a prove
     step and a finalize step on L1.
{{/op-stack}}
{{#optimistic}}
   - Canonical withdrawals back to Ethereum wait out a ~7-day challenge period, then need a claim on L1.
{{/optimistic}}
{{#zk}}
   - Canonical withdrawals finalize after the validity proof is posted and any execution delay passes,
     typically hours rather than days; some need a manual claim on L1.
{{/zk}}
{{^op-stack}}{{^optimistic}}{{^zk}}
   - Canonical withdrawals back to Ethereum follow {{chain.name}}'s own finality rules (often days on
     optimistic designs); read the official bridge docs before relying on them.
{{/zk}}{{/optimistic}}{{/op-stack}}
{{/l2}}
{{^l2}}
   - The chain's own bridge (where one exists) is the reference route; check its docs for delays.
{{/l2}}
   - Third-party routes (LI.FI aggregates Across, Relay, Stargate, CCTP and others) are fast both ways and
     cost a fee; they add the bridge's own smart-contract and operator risk.
{{/evm}}
{{#solana}}
   - Native USDC via Circle CCTP (burn and mint, no wrapped token), Wormhole (Portal), deBridge and Mayan
     for speed; LI.FI aggregates several of them.
   - Wrapped assets arriving via Wormhole carry a "(Wormhole)" lineage; they are not the same as native ones.
{{/solana}}
{{#bitcoin}}
   - BTC itself cannot leave Bitcoin; routes lock it and issue a representation: custodial (WBTC, cbBTC),
     threshold-signed (tBTC), federated or PowPeg sidechains (Liquid, Rootstock), or native cross-chain
     swaps (THORChain, Garden) that hand you a different asset on the other chain.
   - Exchanges are often the cheapest on and off ramp for BTC; check the deposit network carefully.
{{/bitcoin}}
{{#sui}}
   - Sui Bridge (native, Ethereum to Sui for ETH and selected tokens), Wormhole, Circle CCTP for native USDC,
     and LI.FI routes where available.
{{/sui}}
{{#aptos}}
   - Circle CCTP for native USDC, LayerZero OFT tokens, Wormhole; check whether a token on Aptos is native or
     a bridged representation before moving it.
{{/aptos}}
{{#tron}}
   - Most USDT moves on and off TRON through exchanges, which support TRC-20 deposits and withdrawals directly.
     Bridges exist but are thinner; check liquidity and audits before using one.
{{/tron}}
{{#starknet}}
   - StarkGate is the canonical bridge with Ethereum: deposits take minutes; withdrawals wait for the proof to
     reach L1 (hours) and then need a claim on Ethereum. LayerSwap, Orbiter and Rhino are fast alternatives.
{{/starknet}}
3. **Quote.** `bridge_quote { "fromChain": "<source>", "toChain": "{{chain.id}}", "fromToken": "<token>", "toToken": "<token>", "fromAmount": "<raw units>", "fromAddress": "<sender>", "toAddress": "<receiver>" }`
   (LI.FI, `slippage` default 0.005). Swap `fromChain`/`toChain` to bridge out. Compare: amount received,
   total fees, estimated time, bridge used and the exact token delivered.
{{#other}}
   LI.FI does not route every pair for {{chain.name}}; an empty result means use one of the routes above
   directly, from its official site (type the URL yourself).
{{/other}}
4. **Plan destination gas.** Arriving on {{chain.name}} with zero {{chain.native.symbol}} means you cannot move
   anything. Many routes offer a small gas top-up; take it, or bridge a little native token first.
5. **Test small.** Send a small amount first and wait for it to land before sending size, especially on a new
   route or a new address.
6. **Preview, approve, send.** Approvals for the bridge contract (exact amount) and the bridge transaction
   itself each go through `simulate_tx`, then a human approves in `/approvals`, then `send_tx`. Show the
   received token, minimum amount and ETA in the approval summary.
7. **Track it.** LI.FI routes: `web_fetch https://li.quest/v1/status?txHash=<source tx hash>`. Then confirm
   arrival with `get_balance { "address": "<receiver>", "chain": "{{chain.id}}" }` or on {{chain.explorer}}.
   Pending for longer than the quoted ETA: check the bridge's status page before doing anything else.

## Check before you finish

- [ ] Destination address format and ownership verified on {{chain.name}}
- [ ] Route, fee, ETA and the exact delivered token were shown before approval
- [ ] Destination gas ({{chain.native.symbol}}) is covered
- [ ] A small test transfer arrived before the main one
- [ ] Arrival confirmed on {{chain.explorer}}, not just "submitted"

## Pitfalls

- Never re-send because a transfer looks stuck; duplicate sends are common and refunds are slow.
- Fake bridge and "claim" sites run ads; open bridges from bookmarked or officially linked URLs only.
- Bridged look-alikes (USDC vs USDC.e or Wormhole versions) can have less liquidity and different risk.
{{#evm}}
{{#l2}}
- Withdrawals through the canonical bridge are not finished until the L1 claim is done; set a reminder.
{{/l2}}
{{/evm}}
- Exchange deposits on the wrong network may be lost or need a paid recovery; match the network exactly.

## Related

- `{{chain.id}}-gas-and-fees` — destination gas and fee budgeting
- `{{chain.id}}-tx-debugging` — when a bridge transaction fails
- `{{chain.id}}-swaps` — swapping after arrival
- `bridging-with-lifi` — LI.FI quotes and status in depth
- `chainlink-ccip-basics` — CCIP as a cross-chain option
