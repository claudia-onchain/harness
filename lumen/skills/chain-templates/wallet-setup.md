---
name: "{{chain.id}}-wallet-setup"
description: "Create, connect and back up a {{chain.name}} wallet, add it to Lumen as watch-only or as a capped signing wallet. Use when someone asks \"set up a {{chain.name}} wallet\", \"add {{chain.name}} to my wallet\", \"connect my {{chain.id}} address to Lumen\" or \"which wallet should I use on {{chain.name}}\"."
license: MIT
metadata:
  title: "{{chain.name}}: Wallet Setup"
  category: "chain"
  level: "beginner"
  tags: "{{chain.id}}, {{chain.family}}, wallet, setup, keys, backup"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: Wallet Setup

A good {{chain.name}} setup is two wallets: a cold one for savings that never touches Lumen, and a small hot
wallet that Lumen may sign for under spend caps. Watch-only is the default; Lumen needs no key to read
balances. Even with a key, every money-moving action is previewed and needs your explicit approval.

## When to use

- "Set up a {{chain.name}} wallet" or "which wallet works on {{chain.id}}?"
- Adding {{chain.name}} to an existing wallet app
- Connecting an address to Lumen for tracking, or a hot wallet for capped signing
- Restoring a wallet or checking a backup actually works

## Steps

1. **Pick the split.** Savings go on a hardware wallet. The Lumen hot wallet holds only what you are willing to
   lose in a bad day (set that number now; it becomes `wallet.maxUsdPerDay`).
2. **Create the wallet.**
{{#evm}}
   - Apps: Rabby, MetaMask, Frame or a hardware wallet (Ledger, Trezor) through one of them. Any EVM address
     works on {{chain.name}}; there is nothing chain-specific to create.
   - Dev key for testing only: `cast wallet new` (Foundry). Never reuse a dev key for real funds.
{{/evm}}
{{#solana}}
   - Apps: Phantom, Solflare or Backpack; Ledger is supported through them.
   - CLI: `solana-keygen new --outfile ~/.config/solana/lumen-hot.json`. That JSON file IS the private key;
     treat it like a seed phrase.
{{/solana}}
{{#bitcoin}}
   - Apps: Sparrow or Electrum on desktop, a hardware wallet (Coldcard, Trezor, Ledger, BitBox) for savings.
     Use native SegWit (BIP84, `bc1q…`) or Taproot (BIP86, `bc1p…`) accounts.
   - For Ordinals or Runes use an ordinals-aware wallet (Xverse, Unisat) so inscribed sats are not spent as fees.
{{/bitcoin}}
{{#sui}}
   - Apps: Slush (formerly Sui Wallet), Suiet, Nightly, or Ledger through them. zkLogin wallets sign in with a
     web account but still need a recovery plan.
   - CLI: `sui client new-address ed25519`, then `sui client switch --env mainnet`.
{{/sui}}
{{#aptos}}
   - Apps: Petra, Nightly or Pontem; keyless (Google sign-in) accounts are convenient but tie recovery to that
     login. Ledger works through Petra.
   - CLI: `aptos init --network mainnet --profile lumen-hot` creates a profile and account key.
{{/aptos}}
{{#tron}}
   - Apps: TronLink (extension or mobile) or a Ledger through TronLink.
   - A new address is inactive until it receives TRX or a token; activation costs the sender about 1 TRX.
{{/tron}}
{{#starknet}}
   - Apps: Ready (formerly Argent X) or Braavos. Every account is a contract, so the first outgoing
     transaction also deploys it and needs STRK for the fee.
   - CLI: `sncast account create --name lumen-hot` then `sncast account deploy --name lumen-hot` (Starknet
     Foundry), or `starkli account oz init` and `starkli account deploy`.
{{/starknet}}
3. **Back it up offline.** Write the seed phrase on paper or metal, never in a screenshot, cloud note or chat.
   Restore it once on a second device (or the same app after a reset) and confirm the same first address
   appears. A backup you never tested is a guess.
{{#evm}}
4. **Add the network.** Name {{chain.name}}, chain ID {{chain.chainId}}, currency {{chain.native.symbol}}, RPC
   `{{chain.publicRpc.0}}` (or your Alchemy URL `https://{{chain.alchemy}}.g.alchemy.com/v2/KEY`), explorer
   {{chain.explorer}}. Cross-check the chain ID with `chain_status { "chain": "{{chain.id}}" }`; a wrong
   ID or a phishing RPC from a random site is the common failure.
{{/evm}}
{{#solana}}
4. **Pick an RPC.** Wallet apps ship their own; for the CLI run
   `solana config set --url https://mainnet.helius-rpc.com/?api-key=KEY` (or `{{chain.publicRpc.0}}` for light use).
{{/solana}}
{{#bitcoin}}
4. **Pick a backend.** Sparrow and Electrum connect to public servers by default; for privacy point them at
   your own node or a server you trust. Lumen itself uses {{chain.publicRpc.0}}.
{{/bitcoin}}
{{#other}}
{{^bitcoin}}
4. **Pick an RPC.** Wallet apps ship their own; CLI tools default to {{chain.publicRpc.0}}. Use an Alchemy
   endpoint (`{{chain.alchemy}}`) if you script against it often.
{{/bitcoin}}
{{/other}}
5. **Track it in Lumen (watch-only).** `lumen balance <address> --chain {{chain.id}}` or
   `get_balance { "address": "<address>", "chain": "{{chain.id}}" }`. Save a label with
   `memory_save { "text": "{{chain.id}} hot wallet: <address>" }` so future sessions know which is which.
6. **Optional: let Lumen sign, with caps.** Add the hot wallet key with `lumen keys set <provider>` using the
   wallet entry that `lumen keys` lists (stored in `~/.lumen/keys.json`, mode 0600, optional passphrase).
   Then set `wallet.maxUsdPerTx` and `wallet.maxUsdPerDay` in `~/.lumen/config.json`. Lumen can still only send
   after `simulate_tx` shows a preview and you approve it in `/approvals`; it can never approve itself.
7. **Test with dust.** Send a tiny amount of {{chain.native.symbol}} from the hot wallet to itself or to your
   cold wallet with `send_native { "chain": "{{chain.id}}", "to": "<address>", "amount": "<small>" }`: it shows a
   `simulate_tx` preview, waits for your approval, then broadcasts. Confirm on {{chain.explorer}}.
{{#other}}
{{^bitcoin}}
   If `send_native`/`simulate_tx` do not support {{chain.name}} in your Lumen build, stay watch-only and sign in
   the wallet app, which shows its own preview.
{{/bitcoin}}
{{#bitcoin}}
   Keep the test output above ~1,000 sats (smaller outputs hit dust limits). If `send_native`/`simulate_tx` do
   not support Bitcoin in your Lumen build, stay watch-only and sign in Sparrow or Electrum, which show
   inputs, outputs and fee before broadcast.
{{/bitcoin}}
{{/other}}

## Check before you finish

- [ ] Seed phrase backed up offline and a test restore produced the same address
- [ ] Cold and hot wallets are different seeds, not two accounts of one seed
- [ ] The address is labelled in Lumen memory and `get_balance` reads it
- [ ] If a signing key was added: `wallet.maxUsdPerTx` and `wallet.maxUsdPerDay` are set and small
- [ ] A dust transaction confirmed on {{chain.explorer}}

## Pitfalls

{{#evm}}
- Adding a network from an unknown website can install a malicious RPC that lies about balances; type the
  values yourself or use chain ID {{chain.chainId}} from a trusted list.
{{/evm}}
{{#solana}}
- Keypair JSON files in a repo or cloud folder are leaked keys; keep them out of git and synced folders.
{{/solana}}
{{#bitcoin}}
- Restoring with the wrong derivation path (BIP44/49/84/86) shows an empty wallet; the coins are not gone.
- Sharing an xpub reveals every past and future address of that account.
{{/bitcoin}}
{{#sui}}
- zkLogin and keyless-style accounts depend on the web login; losing it without a backup can lock funds.
{{/sui}}
{{#aptos}}
- Aptos lets you rotate an account's auth key; if you rotate, the old seed no longer controls the account.
{{/aptos}}
{{#tron}}
- Drained TRON wallets often get their owner permission changed to the attacker's key (the "multisig scam");
  check account permissions on {{chain.explorer}} before receiving into an old or bought wallet.
{{/tron}}
{{#starknet}}
- An address shown before the account is deployed can receive funds, but cannot send until deployment.
{{/starknet}}
- Seed phrases typed into websites, chats or "support" DMs are the number one loss; nobody legitimate asks.
- A hot wallet that grows beyond its cap is a cold-storage problem; sweep the excess regularly.

## Related

- `{{chain.id}}-security-checklist` — the full hygiene list
- `{{chain.id}}-getting-started` — keys and chain status first
- `wallet-and-key-security` — key storage across all chains
- `safety-and-approvals` — how Lumen previews and approvals work
- `multisig-and-safe` — shared or high-value custody
