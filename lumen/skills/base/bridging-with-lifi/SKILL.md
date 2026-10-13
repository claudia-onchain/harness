---
name: bridging-with-lifi
description: "Moves assets between chains with LI.FI routes (EVM to EVM, plus Solana and other supported non-EVM chains): quote with bridge_quote, compare cheapest vs fastest, check the route's bridge type and risk, set exact approvals to the quoted approvalAddress, simulate, get human approval, then track with the LI.FI status API until DONE or REFUNDED. Use when someone asks \"bridge my ETH to Base\", \"move USDC from Arbitrum to Solana\", \"cheapest way to get funds onto Monad\", \"my bridge is stuck\", \"where are my bridged funds\", or before any cross-chain transfer."
license: MIT
metadata:
  title: "Bridging with LI.FI"
  category: "crypto-core"
  level: "intermediate"
  tags: "bridge, lifi, cross-chain, route, quote, status, approvals, solana, l2, canonical bridge"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Bridging with LI.FI

LI.FI aggregates bridges and DEXs into one quote: a route, the exact calldata, and the address to approve. The
important judgment is not which route is cheapest but which bridge you are trusting with the funds while they are
in flight, and whether you will have gas to use them on arrival. Quote, inspect, simulate, approve, send, track.

## When to use

- "Bridge 0.5 ETH from Ethereum to Base", "get USDC onto Solana", "move funds to <chain>".
- "Which bridge is cheapest / fastest right now?".
- "My bridge has been pending for an hour", "where are my funds?".
- Funding an agent wallet on a new chain (see `chain-selection-guide` first if the chain is not decided).

## Steps

1. **Pin the inputs.** Source chain, destination chain, token addresses on both sides (native = the zero
   address or the LI.FI native token id), amount in base units (respect decimals), sender, and recipient. A
   destination on a different chain family (Solana, Bitcoin, Sui) needs a recipient address of that family.

2. **Quote.**

   ```
   bridge_quote { "fromChain": "arbitrum", "toChain": "base", "fromToken": "USDC", "toToken": "USDC",
                  "amount": "250", "fromAddress": "<wallet>", "slippage": 0.005, "order": "CHEAPEST" }
   ```

   Raw API (keyless works): `GET https://li.quest/v1/quote?fromChain=42161&toChain=8453&fromToken=<addr>&toToken=<addr>&fromAmount=<units>&fromAddress=<wallet>&slippage=0.005`.
   Read `tool` (bridge used), `estimate.toAmount` and `toAmountMin`, `estimate.executionDuration` (seconds),
   `estimate.feeCosts` and `gasCosts`, `estimate.approvalAddress`, and `transactionRequest` (`to`, `data`,
   `value`, `gasLimit`). Re-quote with `order: "FASTEST"` and compare.

3. **Judge the bridge, not just the price.**

   | Type | Examples | Speed | Main risk |
   |---|---|---|---|
   | Canonical rollup bridge | OP Stack, Arbitrum native | deposits minutes, withdrawals ~7 days | slow exits |
   | Intent / solver | Across, Relay, Mayan | seconds–minutes | solver/relayer liveness, contract risk |
   | Liquidity / messaging | Stargate, CCIP, Wormhole-based | minutes | messaging layer and pool risk |
   | Wrapped asset at destination | many routes | varies | you receive an IOU, not the native token |

   Prefer routes that deliver the canonical/native token on the destination. Exclude bridges you do not trust with
   `denyBridges=` (or allow-list with `allowBridges=`). Note when `toAmount` is in a bridged variant.

4. **Approve exactly.** For ERC-20 sources, check `allowance(owner, approvalAddress)` (`0xdd62ed3e`); if short,
   approve the exact `fromAmount` to `estimate.approvalAddress`, never unlimited. Confirm `transactionRequest.to`
   is the LI.FI contract the quote names, not an address from a web page.

5. **Simulate and get approval.** `simulate_tx` with `transactionRequest`, show the human: send amount, min
   received, destination address on the destination chain, bridge, ETA, total fees in USD. Then `send_tx`; the
   approval in `/approvals` or the CLI prompt is the human's, never the agent's. Check `wallet.maxUsdPerTx`.

6. **Gas on arrival.** If the recipient has no native gas on the destination, receiving USDC on Base with 0 ETH
   strands it. Bridge a little native too, or pick a route that delivers some native gas. Solana recipients need
   ~0.002 SOL for a token account rent plus fees.

7. **Track to completion.** `GET https://li.quest/v1/status?txHash=<srcTx>&fromChain=<id>&toChain=<id>&bridge=<tool>`
   → `status` `PENDING | DONE | FAILED | NOT_FOUND`, `substatus` (`COMPLETED`, `PARTIAL` = received a different
   token, `REFUNDED`), and `receiving.txHash`. Confirm arrival with `get_balance` on the destination.

## Check before you finish

- [ ] Token addresses and recipient are correct for both chains (and both chain families).
- [ ] Bridge type, ETA and whether the output is native or wrapped are stated.
- [ ] Approval is exact and goes to the quoted `approvalAddress`.
- [ ] Simulation succeeded and the human approved the send.
- [ ] Destination gas is covered, and status was tracked to DONE (or the refund path explained).

## Pitfalls

- **Stale quotes.** Quotes expire in about a minute and pool rates move. Re-quote right before sending.
- **PARTIAL is not failure.** Funds arrived as a different token (often a bridged stable or native); swap it.
- **Withdrawing via canonical bridge by accident.** OP/Arbitrum native withdrawals take ~7 days and need a prove
  and finalize step. Make that clear before the user picks the cheapest route.
- **Bridging to an exchange deposit address.** Some CEXs do not credit contract-originated deposits or need a memo.
- **Fake bridge sites and "support".** Stuck-bridge victims get DMs offering help; never share keys or sign
  "recovery" transactions. Status comes from the LI.FI API and explorers only.

## Related

- `chainlink-ccip-basics` — CCIP as a bridge and messaging layer.
- `approvals-and-revoking` — cleaning up bridge approvals afterwards.
- `gas-strategy` — fees on both sides of the route.
- `chain-selection-guide` — deciding where funds should live.
- `swaps-and-slippage` — routes that swap as well as bridge.
