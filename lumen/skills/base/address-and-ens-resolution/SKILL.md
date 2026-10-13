---
name: address-and-ens-resolution
description: "Validates and resolves addresses and names across chains: EIP-55 checksums, ENS forward and reverse lookups with forward verification, Basenames and L2 primary names, Solana SNS (.sol), plus format checks for Bitcoin, Sui, Aptos, TRON and Starknet. Use when someone asks \"who is vitalik.eth\", \"resolve this ENS\", \"what's the .sol for this wallet\", \"is this address valid\", \"is this the right address\", or before any send, approval or watchlist add that takes a name or pasted address."
license: MIT
metadata:
  title: "Address and ENS resolution"
  category: "crypto-core"
  level: "beginner"
  tags: "ens, sns, basenames, address, checksum, eip-55, reverse resolution, address poisoning, validation"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Address and ENS resolution

A name is a pointer that its owner can change, and an address is a string that a scammer can imitate. Resolve
names at the moment you use them, verify reverse records forward, and compare full addresses, never the first and
last four characters.

## When to use

- "Resolve vitalik.eth", "what's the address for toly.sol", "who owns this address?".
- A user pastes an address to send to, approve, or add to a watchlist.
- A tx history shows a near-identical address (possible address poisoning).
- An address came from a web page, DM, token metadata or a file the user did not write.

## Steps

1. **Detect the format before calling anything.**

   | Chain family | Shape | Validation |
   |---|---|---|
   | EVM | `0x` + 40 hex | EIP-55 mixed-case checksum; all-lower/all-upper is valid but unchecked |
   | Solana | base58, 32 bytes (32–44 chars) | decodes to 32 bytes; on-curve = wallet, off-curve = PDA |
   | Bitcoin | `bc1q…` (segwit), `bc1p…` (taproot), `1…`, `3…` | bech32/bech32m or base58check checksum |
   | Sui / Aptos | `0x` + up to 64 hex | left-pad to 64 hex before comparing |
   | TRON | base58 starting `T`, 34 chars | base58check; hex form starts `41` |
   | Starknet | `0x` felt, up to 64 hex | pad before comparing; account must be deployed |

   A valid checksum proves only that it was not mistyped. It says nothing about who controls it.

2. **Resolve names with the tool.**

   ```
   resolve_address { "name": "vitalik.eth" }
   resolve_address { "name": "toly.sol", "chain": "solana" }
   resolve_address { "address": "0x…", "chain": "ethereum" }   // reverse
   ```

   ENS resolution always happens on Ethereum L1 (resolver contract, possibly CCIP-Read/offchain for subnames such
   as `*.base.eth` Basenames or `*.cb.id`). The `addr` record can differ per chain (ENSIP-11 coin types), so ask
   for the chain the user will actually send on.

3. **Forward-verify every reverse record.** A reverse record (primary name) is set by the address owner and can
   claim anything. Accept `0xabc… → alice.eth` only if `alice.eth → 0xabc…` resolves back to the same address.
   If it does not round-trip, show the address, not the name.

4. **Check what the address is.** `chain_status` is not enough; use:
   - EVM: `read_contract` or `eth_getCode` via the tool. Empty code = EOA; code starting `0xef0100` = EIP-7702
     delegated EOA (it runs someone's code); otherwise a contract (check `contract_abi` for Safe, proxy, token).
   - Solana: account owner program (System = wallet, Token/Token-2022 = token account, executable = program).
     Sending SPL tokens to a token account address instead of the wallet is a common loss.
   - Check activity: `address_activity { "chain": "<id>", "address": "<addr>", "limit": 20 }`. A brand-new address
     for a "known" person is a warning.

5. **Defend against poisoning.** Look for addresses in recent history that share the first 4–6 and last 4–6 chars
   with the intended one but differ in the middle, especially zero-value or dust transfers from them. Never copy a
   recipient from tx history. Compare the full string, character by character, or diff it in a shell.

6. **Record what you resolved.** In the answer, show name → full address → chain → timestamp of resolution, and
   whether it round-tripped. Use `memory_save` for addresses the user confirms as their own contacts.

## Example output

```
alice.eth  →  <full 0x address, checksummed>   (resolved 2026-10-13 14:02 UTC)
chain: base (ENSIP-11 addr record)   reverse: alice.eth, round-trips   type: EOA   first tx: <date>
warning: none   |   if no round-trip: "primary name not verified, showing address only"
```

## Check before you finish

- [ ] The address format matches the target chain and the checksum (where it exists) passes.
- [ ] Names were resolved for the chain the funds will move on, not just Ethereum.
- [ ] Any reverse record shown was forward-verified.
- [ ] Account type (EOA, contract, 7702-delegated, PDA, token account) is stated.
- [ ] The full address is shown at least once; no truncated-only addresses before a send.

## Pitfalls

- **Expired or transferred names.** ENS names expire and get re-registered; `.sol` domains can be sold. Resolve
  fresh every time, never from memory.
- **Homoglyph names.** `vitalik.eth` vs `vitaIik.eth` (capital I) or Unicode look-alikes. ENS normalizes with
  ENSIP-15; show the normalized form and warn on mixed scripts.
- **Same address, different chain.** An EVM EOA is the same on every EVM chain, but a contract wallet (Safe,
  smart account) may exist only on the chain where it was deployed. Sending to it elsewhere can strand funds.
- **Exchange deposit addresses.** Many need a memo/tag (TRON, XRP-style) or only accept one network. Ask before
  sending to a CEX.
- **Treating names as identity.** `binance-support.eth` is just a string anyone could register.

## Related

- `wallet-and-key-security` — address poisoning and signing hygiene.
- `whale-and-smart-money-tracking` — labeling addresses you watch.
- `tx-decoding` — confirm what an address actually did.
- `contract-verification-and-abi` — when the address turns out to be a contract.
