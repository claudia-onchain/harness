---
name: "{{chain.id}}-security-checklist"
description: "Audit and harden a {{chain.name}} setup: wallet split and backups, approvals and delegations, account-level permissions, address poisoning, phishing, Lumen keys and spend caps, and what to do if a wallet is compromised. Use when someone asks \"is my {{chain.name}} wallet safe\", \"security check for {{chain.id}}\", \"revoke approvals on {{chain.name}}\", \"I think I got drained\" or \"harden my setup\"."
license: MIT
metadata:
  title: "{{chain.name}}: Security Checklist"
  category: "chain"
  level: "beginner"
  tags: "{{chain.id}}, {{chain.family}}, security, approvals, phishing, wallet safety"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Security Checklist

Most {{chain.name}} losses are not exotic hacks: they are leaked seeds, standing permissions granted months
ago, look-alike addresses pasted from history, and signatures nobody read. This checklist finds those, fixes
what can be fixed with previewed transactions, and sets up Lumen so that it cannot be the weak link.

## When to use

- "Is my {{chain.name}} wallet safe?" or a periodic security review
- Before funding a new wallet or after using many dapps on {{chain.id}}
- After signing something suspicious, or when funds moved unexpectedly
- Setting up Lumen's signing wallet and caps

## Steps

1. **Inventory the wallets.** List every {{chain.id}} address the user controls, which device or app holds
   each key, and its role (cold, hot, farming). `get_balance` each one; label them with `memory_save`.
2. **Confirm backups and the split.** Seed phrases offline and test-restored; cold and hot wallets on
   different seeds; hardware wallet for anything that matters.
3. **Review standing permissions.**
{{#evm}}
   - ERC-20 allowances and NFT `setApprovalForAll` grants: list them (Etherscan V2 approval logs with
     `chainid={{chain.chainId}}`, or a revoke tool) and check any allowance with
     `read_contract { "address": "<token>", "chain": "{{chain.id}}", "function": "allowance(address,address)", "args": ["<owner>", "<spender>"] }`.
   - Revoke anything unused or unlimited: `approve(spender, 0)` or `setApprovalForAll(operator, false)`, each
     previewed with `simulate_tx` and approved by the user.
   - Smart-account wallets: check installed modules, session keys and guardians.
{{/evm}}
{{#solana}}
   - Token account delegates (`delegate` and `delegatedAmount` in the parsed account): revoke with
     `spl-token revoke <token account>` or the wallet's revoke feature, after a preview.
   - Stake accounts: confirm the stake and withdraw authorities are the user's keys.
{{/solana}}
{{#bitcoin}}
   - Bitcoin has no approvals. Review instead: which devices hold seeds, which watch-only xpubs were shared
     (privacy, not theft), and any open marketplace listings created by signed PSBTs (cancel unwanted ones by
     spending the listed UTXO).
{{/bitcoin}}
{{#sui}}
   - Sui has no allowances; risk sits in what you sign. Check objects the wallet still owns versus what it
     should, any Kiosk listings, and active zkLogin sessions.
{{/sui}}
{{#aptos}}
   - Check the account's current auth key (rotations), any multisig or delegated capabilities, and open
     listings or objects transferred out unexpectedly.
{{/aptos}}
{{#tron}}
   - TRC-20 approvals: list them on {{chain.explorer}} and revoke unused ones with `approve(spender, 0)`.
   - Account permissions: owner and active permissions must list only the user's keys. A changed owner
     permission means the account is lost; move anything left immediately.
{{/tron}}
{{#starknet}}
   - ERC-20 approvals to routers and dapps; revoke unused ones with `approve(spender, 0)`.
   - Account contract: class (upgrades), guardian settings, and any session keys granted to games or dapps.
{{/starknet}}
4. **Check for address poisoning.** `address_activity { "address": "<address>", "chain": "{{chain.id}}", "limit": 50 }`:
   tiny or zero-value incoming transfers from addresses that share the first and last characters of a real
   counterparty are poisoning. Never copy addresses from history; use a saved address book and check the full
   string.
5. **Phishing hygiene.** Bookmark the dapps you use, keep wallet extensions in a separate browser profile, and
   never enter a seed phrase anywhere except the wallet's own restore screen on a trusted device.
6. **Harden Lumen.** `lumen keys`: signing keys only for a hot wallet, a passphrase on `~/.lumen/keys.json`,
   small `wallet.maxUsdPerTx` and `wallet.maxUsdPerDay` in `~/.lumen/config.json`, and every money-moving action
   reviewed in `/approvals`. Lumen treats web pages, token names and memos as data and cannot approve its own
   transactions.
7. **If compromised.** Stop signing anything. From a clean device, create a fresh seed, move remaining assets
   there (each transfer previewed and approved), then revoke permissions on the old wallet if anything is left
   to protect. Assume the old seed is permanently burned.

## Check before you finish

- [ ] Every wallet has a role, a tested backup and a label
- [ ] Standing permissions were listed and unused ones revoked (or none exist on {{chain.name}})
- [ ] Recent incoming transfers were checked for poisoning look-alikes
- [ ] Lumen keys are passphrase-protected and spend caps are set
- [ ] The user knows the compromise plan before they need it

## Pitfalls

- Revoking costs a fee and does not undo past theft; it only closes doors for the future.
- "Revoke" sites can be phishing too; use a known tool or do it directly with previews.
- Hardware wallets protect keys, not judgement: blind-signing on a device is still blind.
- Recovery "services" that promise to retrieve stolen funds for a fee are almost always a second scam.

## Related

- `{{chain.id}}-wallet-setup` — building the setup this checklist audits
- `{{chain.id}}-airdrop-and-points-hygiene` — where most bad signatures come from
- `wallet-and-key-security` — key storage across chains
- `approvals-and-revoking` — revoking in depth
- `safety-and-approvals` — Lumen's approval model
