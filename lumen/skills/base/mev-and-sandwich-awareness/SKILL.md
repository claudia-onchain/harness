---
name: mev-and-sandwich-awareness
description: "Explains and defends against MEV: sandwich attacks, frontrunning, backrunning and JIT liquidity on Ethereum, L2s and Solana; sets slippage sanely, routes through private RPCs (Flashbots Protect, MEV Blocker) or Jito bundles, and diagnoses whether a past swap was sandwiched. Use when someone asks \"was I sandwiched\", \"why did I get a worse price\", \"how do I avoid MEV\", \"what slippage should I set\", \"private RPC\", or before a large swap."
license: MIT
metadata:
  title: "MEV and Sandwich Awareness"
  category: "crypto-core"
  level: "intermediate"
  tags: "mev, sandwich, frontrun, slippage, flashbots, mev blocker, jito, private mempool, swaps"
  version: "1.0.0"
  updated: "2026-10-13"
---

# MEV and Sandwich Awareness

Your slippage tolerance is a price you publish to every searcher watching the mempool. A sandwich bot buys before
you, lets your swap push the price, and sells right after, pocketing up to your full tolerance. The key idea: keep
the gap between your quote and your minimum-out small, and keep public-mempool exposure to zero for any swap that
matters.

## When to use

- "Was I sandwiched?", "why did I receive less than quoted?"
- "What slippage should I use?", "how do I swap without getting frontrun?"
- Planning a large swap, a thin-liquidity memecoin buy, or a liquidation-sensitive transaction.
- Choosing an RPC or wallet setting for MEV protection.

## Steps

1. **Know the venue's MEV model.** Ethereum L1 has a public mempool and builders: sandwiches are common. Most
   L2s (Base, OP, Arbitrum) use a centralized sequencer with no public mempool, so classic sandwiches are rarer but
   backruns and latency games exist (Arbitrum also auctions priority via Timeboost). Solana has no global mempool,
   but validators and Jito bundles enable sandwiches; memecoin buys with high slippage are prime targets. BNB Chain
   has an active MEV market too.
2. **Quote first, set slippage from the quote.** `swap_quote { "sell": "USDC", "buy": "ETH", "amount": "25000",
   "chain": "ethereum" }`. Compare quoted price impact to slippage tolerance. Use the table below; never accept a
   UI default of 5-50% on a liquid pair.
3. **Split size against depth.** If price impact exceeds 1%, split the order over time or venues, or use an
   intent/RFQ route (0x, CoW Swap, UniswapX) where solvers fill off-mempool.
4. **Send privately on Ethereum.** Point the wallet's RPC at Flashbots Protect `https://rpc.flashbots.net` or MEV
   Blocker `https://rpc.mevblocker.io`. Transactions skip the public mempool; failed ones are not included, so you
   do not pay gas for reverts. Lumen's `send_tx` uses the configured RPC; confirm which one in `lumen doctor`.
5. **On Solana, tip and bound.** Use tight slippage (0.5-1% on majors, dynamic on memecoins), set a priority fee,
   and prefer routes that send via Jito bundles or protected RPCs. Jupiter's `/swap/v2/order` returns a ready
   transaction with `outAmount`; pass an explicit `slippageBps` so the minimum-out stays close to it.
6. **Simulate and approve.** `simulate_tx` shows expected output; compare to minimum out. The human approves in
   `/approvals` only after seeing quote, min-out, slippage and route.
7. **Diagnose a past swap.** `tx_lookup { "hash": "<txhash>", "chain": "ethereum" }`, then read the block: look for a
   tx immediately before yours and one immediately after that swap the same pool in opposite directions from the
   same address or contract. Received amount close to your min-out is the fingerprint. Explorers such as EigenPhi or
   libMEV label sandwiches; on Solana, inspect the slot's surrounding txs on Solscan.

## Slippage starting points

| Pair type | Liquidity | Suggested max slippage |
|---|---|---|
| Stable/stable | deep | 0.05-0.1% |
| Major/stable (ETH, SOL, BTC) | deep | 0.3-0.5% |
| Mid-cap | $1M-$20M pool | 0.5-1.5% |
| Long-tail / memecoin | < $1M | 2-5%, smaller size, private send |
| Fee-on-transfer token | any | tax + 1%; verify with `honeypot-and-tax-check` |

## Check before you finish

- [ ] Price impact and slippage tolerance are stated separately, and tolerance is not far above impact.
- [ ] The send path is named: private RPC, Jito/protected route, RFQ, or sequencer chain.
- [ ] Large orders were split or routed through an RFQ when impact exceeded 1%.
- [ ] `simulate_tx` min-out was shown to the human before approval.
- [ ] For a diagnosis, the front and back transactions are cited by hash and position in block.

## Pitfalls

- **"Auto" slippage on a thin pool** can mean double digits; read the number.
- **Approvals leak intent.** An approval tx in the public mempool can tip off bots before the swap; bundle or send
  both privately.
- **Private RPC is not a guarantee.** It removes public-mempool exposure but a malicious or compromised RPC can
  still leak; use reputable ones.
- **Deadline too long.** A stale signed swap can be held and executed later at a worse moment; keep deadlines to
  minutes.
- **Blaming MEV for normal impact.** If no bracket transactions exist, the loss was price impact or a fee token.

## Related

- `swaps-and-slippage` — quoting and routing in depth
- `gas-strategy` — priority fees and inclusion
- `honeypot-and-tax-check` — taxes that look like MEV losses
- `tx-decoding` — reading the bracket transactions
- `rpc-providers-and-rate-limits` — choosing and configuring private RPCs
