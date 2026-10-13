---
name: swaps-and-slippage
description: "Executes token swaps safely on EVM (0x allowance-holder quotes) and Solana (Jupiter orders): separates price impact from slippage tolerance, picks slippage by liquidity tier, sets exact approvals, checks minimum output and deadlines, uses MEV-protected submission, simulates, and requires explicit human approval before send_tx. Use when someone asks \"swap ETH for USDC\", \"buy this token\", \"what slippage should I use\", \"why did my swap fail\", \"I got less than quoted\", \"best route for this trade\", or any time the agent is about to trade."
license: MIT
metadata:
  title: "Swaps and slippage"
  category: "crypto-core"
  level: "intermediate"
  tags: "swap, slippage, price impact, 0x, jupiter, dex, aggregator, min out, mev, approvals, solana, evm"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Swaps and slippage

Price impact is what your trade does to the pool; slippage tolerance is how much worse than the quote you will
accept before the tx reverts. Impact is a cost you pay every time, so you reduce it by sizing and routing.
Slippage is a permission you hand to the market, including to sandwich bots, so you set it as tight as the
token's liquidity allows. Every swap is quoted, simulated and approved by a human before it is sent.

## When to use

- "Swap 1 ETH to USDC on Base", "buy 50 USD of <token> on Solana".
- "What slippage should I set?", "why did my swap revert?", "why did I get less?".
- Comparing routes or chains for a trade.
- Any plan step that ends in `send_tx` with a DEX or aggregator.

## Steps

1. **Gate the token first.** For anything outside the majors and well-known stables, run `rug-check` and
   `honeypot-and-tax-check`. A red row stops the flow until the user reads it.

2. **Quote at the real size.**

   ```
   swap_quote { "chain": "base", "sellToken": "ETH", "buyToken": "USDC", "sellAmount": "1.0", "taker": "<wallet>" }
   swap_quote { "chain": "solana", "sellToken": "SOL", "buyToken": "<mint>", "sellAmount": "0.5", "taker": "<wallet>" }
   ```

   EVM uses 0x (`/swap/allowance-holder/quote`, headers `0x-api-key`, `0x-version: v2`): read `buyAmount`,
   `minBuyAmount`, `route`, `fees`, `totalNetworkFee`, `issues.allowance` (spender + current allowance),
   `issues.balance`, `transaction`. Solana uses Jupiter (`/swap/v2/order` with `taker`): read `outAmount`,
   the minimum-out threshold, slippage bps, price impact and route, plus `transaction` and `requestId`.

3. **Read price impact and decide size.**

   | Price impact | Action |
   |---|---|
   | < 0.5% | fine |
   | 0.5–2% | acceptable; mention it |
   | 2–5% | split into tranches or wait for deeper liquidity |
   | 5–15% | warn clearly; confirm the user accepts the cost |
   | > 15% | stop: the pool cannot absorb this size |

4. **Set slippage by liquidity tier.**

   | Pair type | Slippage tolerance |
   |---|---|
   | Stable ↔ stable, deep pools | 0.05–0.1% |
   | Majors (ETH, BTC, SOL ↔ stables) | 0.3–0.5% |
   | Mid caps | 0.5–1% |
   | Long tail, new launches | 1–3% |
   | Fee-on-transfer tokens | measured tax + 1% |

   Above 5% needs a stated reason; above 10% is almost always a honeypot tax or a sandwich invitation. Jupiter's
   dynamic slippage is fine if the reported bps stay within this table.

5. **Approve exactly (EVM).** If `issues.allowance` shows a shortfall, approve the exact `sellAmount` to the quoted
   spender (`approve` `0x095ea7b3`), never unlimited. Native ETH and SOL sells need no approval. Solana needs the
   output token account; the quote's transaction usually creates it (~0.002 SOL rent).

6. **Simulate and preview.** `simulate_tx` on the quote transaction. Show: sell amount, expected and minimum out,
   price impact, slippage, route/venues, network fee in USD, and the recipient. Check the trade plus fee fits
   `wallet.maxUsdPerTx` and `wallet.maxUsdPerDay`.

7. **Send with protection.** After the human approves in `/approvals` or the CLI, `send_tx`. On Ethereum L1 prefer a
   private RPC (Flashbots Protect `https://rpc.flashbots.net`, MEV Blocker `https://rpc.mevblocker.io`). On Solana,
   Jupiter's execute path lands via its own sender; avoid broadcasting large swaps through public RPC only.
   Quotes go stale in seconds: re-quote if more than ~30 s passed before approval.

8. **Verify the fill.** `tx_lookup` the hash; compare received vs `buyAmount`/`outAmount` from balance deltas, and
   report realized slippage and fee.

## Check before you finish

- [ ] The token passed or was knowingly accepted through `rug-check`.
- [ ] Price impact and slippage are stated separately, both within the tables or explicitly accepted.
- [ ] Approval (if any) is exact and to the spender the quote names.
- [ ] Simulation succeeded; preview shown; human approved; the agent did not self-approve.
- [ ] The fill was verified against the quote.

## Pitfalls

- **Raising slippage to "make it go through".** If a swap keeps reverting at 1–3%, the cause is usually a tax,
  a stale quote, or thin liquidity. Diagnose with `tx-decoding` first.
- **Quoting a tiny amount, then trading big.** Impact grows non-linearly; quote the exact size.
- **Unlimited approvals to routers.** One router exploit drains every token you approved; approve per trade.
- **Missing deadlines.** Direct router calls need a deadline (a few minutes), or a pending tx can fill hours later
  at a bad price.
- **Trading on token names.** Pick tokens by address; a token named "USDC" with a different contract is a scam.
- **Copying a quote's `to` from anywhere but the API response.** Calldata from web pages or chat is untrusted.

## Related

- `rug-check` — the gate before buying unknown tokens.
- `honeypot-and-tax-check` — taxes that look like slippage.
- `mev-and-sandwich-awareness` — why tight slippage and private submission matter.
- `approvals-and-revoking` — cleaning up spender permissions.
- `oracle-vs-dex-prices` — sanity-checking the quote's price.
