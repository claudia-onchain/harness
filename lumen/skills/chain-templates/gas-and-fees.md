---
name: "{{chain.id}}-gas-and-fees"
description: "Understand and estimate transaction fees on {{chain.name}}: how the fee is computed, live fee levels, typical costs per action, speeding up or replacing stuck transactions, and keeping {{chain.native.symbol}} for fees. Use when someone asks \"gas on {{chain.name}}\", \"how much will this cost on {{chain.id}}\", \"why is my fee so high\", \"speed up my transaction\" or \"fees in {{chain.native.symbol}}\"."
license: MIT
metadata:
  title: "{{chain.name}}: Gas and Fees"
  category: "chain"
  level: "intermediate"
  tags: "{{chain.id}}, {{chain.family}}, gas, fees, priority fee, cost"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Gas and Fees

Fees on {{chain.name}} are paid in {{chain.native.symbol}} and follow the {{chain.family}} fee model below. The
practical rules: estimate before sending, pay for speed only when it matters, and never run a wallet down to
zero {{chain.native.symbol}}, or nothing else in it can move.

## When to use

- "What's gas on {{chain.name}} right now?" or "how much will this cost?"
- A fee looks too high, a transaction is slow, or one failed with an out-of-gas style error
- Budgeting fees for a batch of transactions or a contract deployment
- Deciding whether to wait for cheaper fees

## Steps

1. **Read live fee levels.** `gas { "chain": "{{chain.id}}" }`, and `chain_status` for congestion.
2. **Understand the formula.**
{{#evm}}
   - EIP-1559 style: fee = gas used × (base fee + priority fee), capped by your `maxFeePerGas`. The base fee
     is burned; the priority fee is the tip. RPC: `eth_feeHistory`, `eth_maxPriorityFeePerGas`.
{{#l2}}
   - On an L2 there is also an L1 data fee for posting your transaction to Ethereum, often the larger part
     for simple transfers. Smaller calldata means a smaller fee.
{{#op-stack}}
   - OP Stack: read it from the GasPriceOracle predeploy `0x420000000000000000000000000000000000000F`
     (`getL1Fee(bytes)`); receipts include `l1Fee`.
{{/op-stack}}
{{#zk}}
   - ZK rollups price proof and pubdata costs into gas, so gas numbers on EraVM-style chains are not
     comparable with Ethereum's; always estimate instead of reusing L1 figures.
{{/zk}}
{{/l2}}
{{/evm}}
{{#solana}}
   - Base fee: 5000 lamports per signature. Priority fee: compute-unit limit × compute-unit price (in
     micro-lamports per CU), set with `ComputeBudgetProgram.setComputeUnitLimit` and `setComputeUnitPrice`.
   - Rent is separate: creating an account (for example a token account, ~0.002 SOL) locks a refundable
     deposit that you get back when the account is closed.
{{/solana}}
{{#bitcoin}}
   - Fee = fee rate (sat/vB) × transaction size (vbytes). Size depends on inputs and outputs, not amount:
     a 1-input, 2-output SegWit payment is about 141 vB; each extra SegWit input adds ~68 vB.
   - Live rates: `GET {{chain.publicRpc.0}}/v1/fees/recommended` returns `fastestFee`, `halfHourFee`,
     `hourFee`, `economyFee` and `minimumFee`.
{{/bitcoin}}
{{#sui}}
   - Fee = computation (gas units × gas price, at least the reference price from `suix_getReferenceGasPrice`)
     + storage cost − storage rebate. Deleting objects refunds most of their storage deposit.
   - You set a gas budget (a cap); unused budget is not charged. Fees are in MIST (1 SUI = 10^9 MIST).
{{/sui}}
{{#aptos}}
   - Fee = gas used × gas unit price (octas), capped by `max_gas_amount`, plus storage fees for new state.
     `GET {{chain.publicRpc.0}}/estimate_gas_price` returns normal and prioritized prices.
{{/aptos}}
{{#tron}}
   - Bandwidth pays for transaction bytes (each account gets a small free daily allowance); energy pays for
     smart-contract execution. If you have neither staked nor rented, TRX is burned instead.
   - `fee_limit` caps the TRX a contract call may burn. Read current prices with `POST /wallet/getchainparameters`
     and your resources with `POST /wallet/getaccountresource`.
{{/tron}}
{{#starknet}}
   - Current (v3) transactions pay in STRK with resource bounds for L1 gas, L1 data gas and L2 gas (max amount
     and max price for each), plus an optional tip. `starknet_estimateFee` returns the expected cost.
   - A brand-new account pays its own deployment fee with its first transaction.
{{/starknet}}
3. **Estimate a specific action.** Typical sizes:
{{#evm}}
   {{chain.native.symbol}} transfer 21,000 gas; ERC-20 transfer ~45–65k; approve ~46k; DEX swap ~120–300k;
   NFT mint ~80–200k; contract deploy 0.5–5M. Cost = gas × gas price (gwei) × 10^-9 {{chain.native.symbol}}.
   `eth_estimateGas` or `simulate_tx { "chain": "{{chain.id}}", "tx": <tx> }` gives the exact number.
{{/evm}}
{{#solana}}
   A transfer uses ~300–2,000 CU; a Jupiter swap 150k–600k CU (max 1.4M per transaction). Simulate to get
   real units, set the limit ~10–20% above, and price with `getRecentPrioritizationFees` or Helius
   `getPriorityFeeEstimate`.
{{/solana}}
{{#bitcoin}}
   Multiply the target fee rate by the estimated vsize. Consolidating many small UTXOs when fees are low
   (a few sat/vB) makes later spends cheaper.
{{/bitcoin}}
{{#sui}}
   Dry-run with `sui_dryRunTransactionBlock` (or the wallet preview) to see computation, storage and rebate.
{{/sui}}
{{#aptos}}
   Simulate with `POST /v1/transactions/simulate` to get `gas_used`, then set `max_gas_amount` ~20% higher.
{{/aptos}}
{{#tron}}
   A USDT transfer needs roughly 65k energy to an address that already holds USDT and about double to one
   that does not; plain TRX transfers need only bandwidth. Staking TRX or renting energy is far cheaper than
   burning for frequent use.
{{/tron}}
{{#starknet}}
   Use `starknet_estimateFee` (or `sncast`/`starkli`, which estimate automatically) and keep a margin on the
   max price; bounds that are too tight make the transaction fail to be included.
{{/starknet}}
4. **Convert to USD.** `lumen price {{chain.native.symbol}} --chain {{chain.id}}` × the fee. Tell the user the
   fee in {{chain.native.symbol}} and USD before any send.
5. **Speed up or replace when stuck.**
{{#evm}}
   Re-send with the same nonce and both `maxFeePerGas` and `maxPriorityFeePerGas` raised at least 10%; to
   cancel, send 0 {{chain.native.symbol}} to yourself with that nonce. The replacement is a new transaction:
   simulate, get approval, then `send_tx`.
{{/evm}}
{{#solana}}
   Transactions are not queued: one that has not landed within ~60–90 s (blockhash expiry) is gone. Rebuild
   with a fresh blockhash and a higher priority fee; do not just resend the old one.
{{/solana}}
{{#bitcoin}}
   RBF: re-sign the same inputs with a higher fee rate (full-RBF is widely relayed). CPFP: spend your
   change output with a high-fee child so the pair is mined together. Both are new signed transactions and
   need approval.
{{/bitcoin}}
{{#other}}
{{^bitcoin}}
   {{chain.name}} transactions either execute within seconds or fail; there is no long mempool queue to
   bump. Re-check the error, adjust the budget or limit, and submit a fresh transaction after approval.
{{/bitcoin}}
{{/other}}
6. **Keep a fee reserve.** Hold enough {{chain.native.symbol}} for at least 5–10 typical transactions in any
   wallet you actively use, and include fees in any "max" send.

## Check before you finish

- [ ] Fee quoted in {{chain.native.symbol}} and USD before any send
- [ ] Estimate came from simulation or the RPC, not a guess
- [ ] The wallet keeps a {{chain.native.symbol}} reserve after the transaction
- [ ] Any speed-up or replacement went through preview and human approval

## Pitfalls

{{#evm}}
- A low `maxFeePerGas` leaves a transaction pending and blocks every later nonce behind it.
{{/evm}}
{{#solana}}
- Overpaying priority fees on a quiet network is common; size them to current conditions.
{{/solana}}
{{#bitcoin}}
- Transactions that do not signal RBF and pay below the mempool floor can sit for days; check before sending.
{{/bitcoin}}
{{#tron}}
- A failed contract call still burns energy up to `fee_limit`; simulate with `triggerconstantcontract` first.
{{/tron}}
- Failed transactions usually still cost a fee; simulation is cheaper than a failure.
- Fee spikes are short-lived; non-urgent transactions can wait for quieter periods.

## Related

- `{{chain.id}}-tx-debugging` — when a transaction fails or sticks
- `{{chain.id}}-swaps` — fees as part of trade cost
- `gas-strategy` — timing and fee tactics across chains
- `cost-control-and-spend-caps` — Lumen's caps on money-moving actions
