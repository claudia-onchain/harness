---
name: gas-strategy
description: "Picks fees that land on time without overpaying, per chain: EIP-1559 baseFee and priority fee math, eth_feeHistory percentiles, rollup L1 data fees (OP Stack, Arbitrum, zk), blob fees, Solana compute-unit price and limit, Bitcoin sat/vB with RBF and CPFP, TRON energy and bandwidth, Sui, Aptos and Starknet fee models, plus unsticking pending transactions. Use when someone asks \"how much gas should I pay\", \"why is gas so high\", \"my tx is stuck\", \"speed up my transaction\", \"priority fee for Solana\", \"when is gas cheapest\", or before any send_tx batch."
license: MIT
metadata:
  title: "Gas strategy"
  category: "crypto-core"
  level: "intermediate"
  tags: "gas, eip-1559, base fee, priority fee, l2 fees, blobs, solana priority fee, compute units, bitcoin fees, rbf, tron energy"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Gas strategy

Fees have two parts almost everywhere: a protocol price you cannot negotiate (base fee, L1 data fee, Solana base
fee) and a tip that buys priority. Pay the base with headroom, set the tip from recent percentiles, and cap the
total. Overpaying the tip rarely helps on quiet chains; underpaying the base fee makes a tx hang.

## When to use

- "How much gas should I set?", "why is this so expensive?", "is now a good time?".
- A tx is pending, stuck, or dropped.
- Planning a batch of sends, a deploy, or a time-sensitive swap or mint.
- Explaining the fee line in a simulation preview before approval.

## Steps

1. **Read the live state.** `gas { "chain": "ethereum" }` and `chain_status { "chain": "<id>" }`, or
   `lumen chains`. Under the hood (EVM): `eth_feeHistory(20, "latest", [10, 50, 90])` gives recent base fees and
   priority-fee percentiles; `eth_maxPriorityFeePerGas` is a node's single guess.

2. **EVM / EIP-1559 math.** Base fee moves at most ±12.5% per block depending on fullness.

   ```
   maxPriorityFeePerGas = p50 of recent rewards (p90 if urgent)
   maxFeePerGas         = 2 × nextBaseFee + maxPriorityFeePerGas     (survives ~6 full blocks)
   you pay              = min(maxFee, baseFee + priority) × gasUsed  (unused headroom is refunded)
   gasLimit             = eth_estimateGas × 1.2  (1.3 for complex DeFi; never hardcode 21000 for contracts)
   ```

3. **Rollups add an L1 component.** It often dominates on quiet L2s.
   - OP Stack (base, optimism, zora, mode, ink, unichain, worldchain, soneium...): L1 data fee from
     `GasPriceOracle` at `0x420000000000000000000000000000000000000F` (`getL1Fee(bytes)`), scales with calldata
     size and L1 blob base fee.
   - Arbitrum: L1 cost is folded into `gasUsed`; estimate with `eth_estimateGas` (not a fixed limit).
     `ArbGasInfo` precompile at `0x000000000000000000000000000000000000006C` reports components.
   - zkSync, Linea, Scroll, Starknet: estimate from the RPC; pubdata cost varies with state changes.
   Smaller calldata (packed args, fewer approvals) is the main lever.

4. **Solana.** Base fee 5,000 lamports per signature. Priority fee = `computeUnitPrice` (micro-lamports per CU) ×
   `computeUnitLimit`. Set both with ComputeBudget instructions; simulate first and set the limit to used CU ×
   1.1–1.2 (default 200k per instruction, max 1.4M per tx). Price from `getRecentPrioritizationFees` (for the
   writable accounts you touch) or Helius `getPriorityFeeEstimate` (levels Low/Medium/High/VeryHigh). Hot accounts
   (popular pools, new launches) need far higher prices than global medians suggest.

5. **Bitcoin.** Fee rate in sat/vB from `https://mempool.space/api/v1/fees/recommended` → `fastestFee`,
   `halfHourFee`, `hourFee`, `economyFee`, `minimumFee`. Always signal RBF. Stuck: RBF with a higher rate (must
   also pay the absolute fee increase), or CPFP from your change output.

6. **Other families.**
   - TRON: fees are energy (smart contracts) and bandwidth. A USDT transfer burns TRX for energy unless you have
     staked or rented energy; sending to a never-used address costs roughly double. Check before sending.
   - Sui: `gasPrice` ≥ reference gas price; set a gas budget from a dry run. Aptos: `gas_unit_price` × `max_gas_amount`,
     simulate first. Starknet: v3 txs pay in STRK with L1 gas and L2 gas resource bounds from `estimateFee`.

7. **Unstick and schedule.** EVM: replace with the same nonce and both fees ≥ 10% higher (many nodes require it),
   or send a 0-value self-transfer at that nonce to cancel. Non-urgent L1 work: Ethereum base fee is usually lowest
   on weekends and 00:00–08:00 UTC; check `eth_feeHistory` over the last few hours instead of guessing. Every
   replacement or cancel is a new `send_tx`, so it goes through simulation and human approval again.

## Quick reference

| Urgency | EVM priority | Solana CU price | Bitcoin |
|---|---|---|---|
| Can wait hours | p10 | Low / median | economyFee |
| Normal | p50 | Medium | halfHourFee |
| Time-critical | p90 + 2× base | High / VeryHigh on hot accounts | fastestFee |

## Check before you finish

- [ ] Fee estimate includes every component (base + tip, L1 data fee, Solana priority, TRON energy).
- [ ] Gas/CU limit comes from a simulation or estimate with 10–30% headroom.
- [ ] The total fee in USD is shown next to the value being moved.
- [ ] `wallet.maxUsdPerTx` covers value + fee, or the user was told it does not.
- [ ] Replacements reuse the nonce and raise both fee fields.

## Pitfalls

- **Legacy `gasPrice` on 1559 chains.** Works but overpays; use type-2 fields.
- **Huge Solana priority on a cold account.** Wasted; priority only matters where you compete for writes.
- **Hardcoded gas limits.** Proxies, cold storage reads and L2 L1-fee folding break them. Estimate every time.
- **Fee bigger than the trade.** A 20 USD swap on L1 at busy times can cost more than its value; suggest an L2.
- **Approving a raised fee under pressure.** "Speed it up" prompts from websites are a phishing vector; only replace
  a tx you decoded.

## Related

- `tx-decoding` — confirm what is stuck before replacing it.
- `chain-selection-guide` — moving activity to a cheaper chain.
- `mev-and-sandwich-awareness` — when a higher tip is not the right fix.
- `rpc-providers-and-rate-limits` — fee estimates are only as good as the node.
- `cost-control-and-spend-caps` — Lumen limits that include fees.
