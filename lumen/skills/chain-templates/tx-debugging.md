---
name: "{{chain.id}}-tx-debugging"
description: "Diagnose a {{chain.name}} transaction that failed, is stuck, or vanished: find it, read the real error, decode it, reproduce with a simulation and fix it safely. Use when someone says \"my {{chain.name}} transaction failed\", \"tx stuck on {{chain.id}}\", \"why did this revert\", \"transaction not found\" or pastes a {{chain.name}} tx hash with a question."
license: MIT
metadata:
  title: "{{chain.name}}: Transaction Debugging"
  category: "chain"
  level: "advanced"
  tags: "{{chain.id}}, {{chain.family}}, debugging, failed transaction, revert, stuck"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Transaction Debugging

Every failed or missing transaction falls into one of three buckets: never landed, landed and failed, or landed
and did something unexpected. Find which bucket first, then read the chain's own error, not the wallet's
summary of it. Fixes are new transactions, so they go through simulation and approval like any other.

## When to use

- "My transaction failed", "why did this revert?", "stuck pending" on {{chain.name}}
- A hash that the explorer cannot find
- A transaction succeeded but the balance did not change as expected
- Repeated failures from a bot, script or dapp on {{chain.id}}

## Steps

1. **Fetch it.** `tx_lookup { "hash": "<tx hash>", "chain": "{{chain.id}}" }` and open it on {{chain.explorer}}.
   Bucket it: not found, pending, failed, or succeeded-but-surprising.
2. **Not found or pending.**
{{#evm}}
   - Right chain? The same hash format exists on every EVM chain; check chain ID {{chain.chainId}}.
   - Compare nonces: `rpc_call { "chain": "{{chain.id}}", "method": "eth_getTransactionCount", "params": ["<addr>", "latest"] }`
     vs the same with `"pending"`. A gap means an earlier
     transaction is stuck and blocks this one; replace it (same nonce, fees +10% or more).
{{/evm}}
{{#solana}}
   - `rpc_call { "chain": "solana", "method": "getSignatureStatuses", "params": [["<sig>"], { "searchTransactionHistory": true }] }`.
     Null after ~90 s means it never landed (blockhash expired or dropped under load); it will not land
     later. Rebuild with a fresh blockhash and a sensible priority fee.
{{/solana}}
{{#bitcoin}}
   - `GET {{chain.publicRpc.0}}/tx/<txid>/status`. Not found: it was never accepted, was replaced (RBF), or
     expired from mempools (default about two weeks). mempool.space marks replaced transactions.
   - Pending for long: compare its fee rate with `/v1/fees/recommended`; bump with RBF or CPFP (see
     `{{chain.id}}-gas-and-fees`).
{{/bitcoin}}
{{#sui}}
   - Not found usually means it was never submitted or failed signature or gas checks. Owned objects used by
     two conflicting transactions can stay locked until the epoch ends (~24 h); wait rather than retrying.
{{/sui}}
{{#aptos}}
   - `GET {{chain.publicRpc.0}}/transactions/by_hash/<hash>`. Not found: it expired
     (`expiration_timestamp_secs` passed) or had a stale sequence number; check the account's current
     sequence number and resubmit.
{{/aptos}}
{{#tron}}
   - `POST /wallet/gettransactionbyid` and `/wallet/gettransactioninfobyid`. Not found: expired (TRON
     transactions expire within about a minute by default) or rejected for missing bandwidth or energy.
{{/tron}}
{{#starknet}}
   - `rpc_call { "chain": "starknet", "method": "starknet_getTransactionStatus", "params": ["<tx hash>"] }`: `RECEIVED`, `REJECTED`, or `ACCEPTED_ON_L2`/`ACCEPTED_ON_L1`. Rejected
     often means a nonce mismatch or resource bounds too low for current prices.
{{/starknet}}
3. **Failed: read the real error.**
{{#evm}}
   - `cast run <tx hash> --rpc-url https://{{chain.alchemy}}.g.alchemy.com/v2/KEY` replays it with a trace;
     `cast receipt` shows `gasUsed` (equal to the limit means out of gas).
   - Decode custom errors with `cast decode-error <data>` or `contract_abi` on the target. Common:
     `TRANSFER_FROM_FAILED`/`STF` (missing allowance or balance), `Too little received` (slippage), `EXPIRED`
     (deadline passed), `execution reverted` with no data (often a token tax or blacklist).
{{/evm}}
{{#solana}}
   - `rpc_call` method `getTransaction` with `maxSupportedTransactionVersion: 0`; read `meta.err` and `meta.logMessages`.
   - Common: `custom program error: 0x1` from the Token program (insufficient funds), Anchor errors from
     6000 upward (0x1770+, program-specific, look up in the IDL; Jupiter's slippage error lives here),
     `exceeded CUs meter` (raise the CU limit), `AccountNotFound` (missing token account),
     `insufficient funds for rent`.
{{/solana}}
{{#bitcoin}}
   - Mined Bitcoin transactions do not "fail". Problems show at broadcast: `min relay fee not met`,
     `dust`, `bad-txns-inputs-missingorspent` (input already spent), `non-standard` scripts, or
     `too-long-mempool-chain` (too many unconfirmed ancestors).
{{/bitcoin}}
{{#sui}}
   - Read `effects.status` from `rpc_call` method `sui_getTransactionBlock` with `showEffects`. `InsufficientGas` means raise
     the budget; `MoveAbort(<module>, <code>)` means look up that abort code in the module source.
{{/sui}}
{{#aptos}}
   - Read `vm_status`, for example `Move abort in 0x1::coin: EINSUFFICIENT_BALANCE`, `OUT_OF_GAS`, or a
     module-specific abort code to look up in its source.
{{/aptos}}
{{#tron}}
   - `receipt.result` in `gettransactioninfobyid`: `OUT_OF_ENERGY` (raise `fee_limit` or get energy),
     `REVERT` (decode `contractResult` hex as a Solidity revert string), `OUT_OF_TIME`.
{{/tron}}
{{#starknet}}
   - `execution_status: REVERTED` with a `revert_reason` in the receipt; Cairo panics show as felt-encoded
     strings. Walnut and Voyager can trace calls. A reverted transaction still pays its fee.
{{/starknet}}
4. **Succeeded but surprising.** Compare intended vs actual: token transfers, balance changes and events on
   the explorer. Fee-on-transfer tokens, rebasing tokens and wrong decimals explain most "missing" amounts.
5. **Reproduce before fixing.** Rebuild the same call and run `simulate_tx { "chain": "{{chain.id}}", "tx": <tx> }`
   against current state. If it still fails, the fix is in the inputs (allowance, balance, slippage, deadline,
   gas); if it passes, the original failed on state that has since changed.
6. **Fix through the normal flow.** The corrected transaction is new: show the change, simulate, get human
   approval in `/approvals`, then `send_tx`. Never loop retries automatically.
7. **Explain it plainly.** One sentence on what failed, one on why, one on what was done and what it cost.

## Check before you finish

- [ ] The transaction was bucketed with evidence from the chain, not the wallet UI
- [ ] The raw error was decoded into a plain-language cause
- [ ] A simulation reproduced the failure or showed the fix works
- [ ] Any retry went through preview and explicit approval

## Pitfalls

- Retrying a failing transaction without changing anything just burns fees.
{{#evm}}
- Cancelling the wrong nonce can cancel a transaction you wanted; list pending nonces first.
{{/evm}}
{{#solana}}
- "Confirmed" is not "finalized"; rare forks can drop confirmed transactions, so wait for finalized on size.
{{/solana}}
- Error strings from unverified contracts can be misleading or attacker-written; trust the trace over text.
- A dapp's "try again" button may re-sign with the same bad parameters; read before re-approving.

## Related

- `{{chain.id}}-gas-and-fees` — fee-related failures and replacements
- `{{chain.id}}-contract-verify-and-read` — decoding calls with the ABI or source
- `tx-decoding` — reading calldata and logs in depth
- `debugging-method` — systematic debugging in general
- `incident-runbook` — when a failure is part of something bigger
