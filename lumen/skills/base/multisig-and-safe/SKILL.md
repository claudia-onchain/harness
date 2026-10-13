---
name: multisig-and-safe
description: "Sets up, inspects and operates Safe (Gnosis Safe) multisigs across EVM chains: owners and threshold design, modules and guards, verifying Safe transaction hashes before signing, spotting delegatecall and owner-change traps, and Solana equivalents (Squads). Use when someone asks \"set up a multisig\", \"who controls this Safe\", \"is it safe to sign this Safe tx\", \"verify the safeTxHash\", \"add a signer\", or audits a protocol's admin multisig."
license: MIT
metadata:
  title: "Multisig and Safe"
  category: "crypto-core"
  level: "advanced"
  tags: "safe, gnosis safe, multisig, threshold, signers, modules, guards, squads, treasury, delegatecall"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Multisig and Safe

A multisig turns one key into a quorum, but only if every signer actually verifies what they sign. The largest
exchange hack on record (Bybit, February 2025, about $1.5B) came from signers approving a malicious Safe transaction
that a compromised UI displayed as routine. The rule: compute and compare the Safe transaction hash independently of
the UI, on a separate device, before every signature.

## When to use

- "Set up a multisig for our treasury", choosing threshold and signers.
- "Who controls this Safe / protocol?", auditing admin keys before depositing.
- "Is it safe to sign this?", verifying a pending Safe transaction.
- Adding or removing signers, enabling modules, or migrating a Safe to another chain.

## Steps

1. **Design the quorum.** Use the table below. Signers should be hardware wallets, held by different people, on
   different devices, with no two keys from one seed. Write down the recovery plan before funding.
2. **Inspect an existing Safe on-chain.** With `read_contract` on the Safe address:
   `getOwners()`, `getThreshold()`, `nonce()`, `VERSION()`, and
   `getModulesPaginated(address start, uint256 pageSize)` with start = sentinel `0x...0001`. Read the guard and
   fallback handler from their storage slots with `cast storage <safe> <slot> --rpc-url $RPC`. Any enabled module can
   move funds without signatures; know exactly what each one is.
3. **Check signers are real.** For each owner: `get_balance` and `address_activity` (is it an active EOA or another
   Safe?). A 3-of-5 where three owners are one person's hot wallets is a 1-of-1.
4. **Pull pending transactions.** The Safe Transaction Service (`https://api.safe.global/tx-service/<network>/api/v1/
   safes/<address>/multisig-transactions/`; newer deployments require an API key) lists queued txs with `to`,
   `value`, `data`, `operation`, `safeTxGas`, `nonce`.
5. **Decode before signing.** `tx-decoding` on `data`; `contract_abi` for `to`. Red flags: `operation = 1`
   (DELEGATECALL) to anything but a known MultiSend; calls to `addOwnerWithThreshold`, `swapOwner`,
   `changeThreshold`, `enableModule`, `setGuard`, `setFallbackHandler`; `approve` or `transfer` to an unknown
   address; a nonce that skips ahead.
6. **Compute the hash independently.** Use pcaversaccio's `safe-tx-hashes-util` (`safe_hashes.sh --network
   ethereum --address <safe> --nonce <n>`) or compute the EIP-712 domain + message hash yourself, and compare to what
   the hardware wallet shows. Mismatch means stop and alert every signer out of band.
7. **Simulate the execution.** `simulate_tx` with the Safe as sender (or a Tenderly fork) to see balance and
   storage changes. Lumen never signs Safe transactions on its own; signatures and execution go through the human
   via `send_tx` approval.
8. **Deploy and replicate carefully.** New Safes: deploy through the official Safe app or `safe-cli`. Same address
   on another chain needs the same factory, singleton, salt nonce and initializer; check that the address on the
   new chain is not already deployed by someone else before sending funds there.

## Threshold design

| Use | Suggested | Why |
|---|---|---|
| Personal cold storage | 2-of-3 | one lost key is recoverable |
| Small team treasury | 3-of-5 | tolerates two unavailable signers |
| Protocol admin | 4-of-7+ plus 48h+ timelock | collusion resistance and a public warning window |
| Hot operations | 2-of-3 with spending-limit module | daily ops without exposing treasury |

## Solana: Squads

Squads v4 multisigs hold program upgrade authority and treasury. Inspect members and threshold in the Squads app,
and verify that a program's upgrade authority (`solana program show <program_id>`) is the Squads vault PDA, not an
individual key.

## Check before you finish

- [ ] Owners, threshold, nonce, version, modules, guard and fallback handler were read on-chain and listed.
- [ ] Each pending tx was decoded; `operation` and any owner/module changes were called out.
- [ ] The safeTxHash was computed independently and matched the hardware wallet display.
- [ ] Execution was simulated and the balance/storage diff shown.
- [ ] No signer is a hot wallet shared with daily trading.

## Pitfalls

- **Blind signing.** If the hardware wallet only shows a hash you did not compute, you are trusting the UI.
- **Modules bypass signatures.** An enabled module with a bug or a malicious owner can drain everything.
- **Address poisoning.** Owners copy-pasted from history can be lookalikes; compare full addresses.
- **Cross-chain address assumption.** Funds sent to "your" Safe address on a chain where it is not deployed may be
  claimable by whoever deploys there first with different owners.
- **Threshold creep.** Removing signers without lowering threshold can brick the Safe; simulate owner changes.

## Related

- `wallet-and-key-security` — hardware keys and signer hygiene
- `tx-decoding` — decoding Safe calldata and MultiSend batches
- `defi-yield-due-diligence` — judging protocol admin multisigs
- `smart-contract-deploy` — handing ownership to a Safe after deploy
