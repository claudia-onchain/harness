---
name: solana-programs-and-spl
description: "Works with Solana programs and SPL tokens: solana and spl-token CLI, Token vs Token-2022 and risky extensions (permanent delegate, transfer hooks, transfer fees, freeze), mint and freeze authorities, associated token accounts, rent, Anchor build/test/deploy, upgrade authority and verified builds. Use when someone asks \"create an SPL token\", \"revoke mint authority\", \"is this Solana token safe\", \"deploy an Anchor program\", \"what is Token-2022\", or \"who can upgrade this program\"."
license: MIT
metadata:
  title: "Solana Programs and SPL"
  category: "crypto-core"
  level: "intermediate"
  tags: "solana, spl, token-2022, anchor, mint authority, freeze authority, rent, program upgrade, devnet"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Solana Programs and SPL

On Solana, code (programs) and state (accounts) are separate, and every token balance lives in its own token
account. Who holds the mint authority, freeze authority and program upgrade authority decides who can change the
rules later. The key idea: for any token or program, read those authorities first; they are the Solana equivalent of
"who owns the contract".

## When to use

- "Create / mint an SPL token", "revoke mint or freeze authority".
- "Is this Solana token safe?", inspecting a mint's authorities and Token-2022 extensions.
- "Deploy an Anchor program to devnet / mainnet", "who can upgrade this program?"
- Closing empty token accounts to reclaim rent, or debugging "account not found" errors.

## Steps

1. **Configure the CLI.** `solana config set --url devnet` (or `mainnet-beta`, or a Helius URL
   `https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY`), `solana config get`, `solana address`,
   `solana balance`. Dev keys: `solana-keygen new -o ~/.config/solana/dev.json`. Devnet funds: `solana airdrop 2`.
2. **Inspect a mint.** `spl-token display <mint>` shows supply, decimals, mint authority, freeze authority and, for
   Token-2022, extensions. In Lumen: `token_info { "address": "<mint>", "chain": "solana" }` and
   `claudia_coin` for holder and market context. Owner program tells you which standard:
   Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` or Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`.
3. **Judge the authorities and extensions.** Use the table below. For a token you hold, a live mint authority means
   unlimited dilution; a live freeze authority means your account can be frozen.
4. **Create a token (devnet first).**
   ```bash
   spl-token create-token --decimals 6                 # add --program-id <Token-2022 id> for extensions
   spl-token create-account <mint>                     # your associated token account (ATA)
   spl-token mint <mint> 1000000
   spl-token authorize <mint> mint --disable           # fixed supply, irreversible
   spl-token authorize <mint> freeze --disable
   ```
   Metadata: Metaplex Token Metadata for classic tokens, or the Token-2022 metadata extension.
5. **Build and test an Anchor program.** `anchor init myprog`, `anchor build`, `anchor test` (spins up a local
   validator), `anchor keys sync` so `declare_id!` matches the keypair. Deploy: `anchor deploy --provider.cluster
   devnet`. Publish the IDL: `anchor idl init <program_id> -f target/idl/myprog.json`.
6. **Mainnet deploy with approval.** Program deploy costs rent for the program data account (roughly 2x the binary
   size in bytes at current rent rates; check `solana rent <bytes>`). Use a funded deploy key, set a priority fee
   (`--with-compute-unit-price`), and route the transaction through human approval. Afterwards:
   `solana program show <program_id>` to confirm upgrade authority.
7. **Lock down upgrades.** Move upgrade authority to a Squads multisig
   (`solana program set-upgrade-authority <program_id> --new-upgrade-authority <vault>`) or make it immutable with
   `--final`. Publish a verified build: `solana-verify build` and `solana-verify verify-from-repo`.
8. **Reclaim rent.** Each token account holds ~0.00204 SOL rent (165 bytes). `spl-token accounts`, then
   `spl-token close --address <account>` for empty ones; burn dust first with `spl-token burn`.

## Authority and extension risk

| Item | Safe-ish | Red flag |
|---|---|---|
| Mint authority | disabled (null) | held by an individual key |
| Freeze authority | disabled | live on a token sold to the public |
| Permanent delegate (2022) | absent | present: issuer can move or burn any holder's tokens |
| Transfer hook (2022) | absent or audited program | unknown program can block sells |
| Transfer fee (2022) | absent or small, fixed | high or with a live fee authority that can raise it |
| Default account state frozen | absent | present: new holders start frozen |
| Program upgrade authority | Squads multisig or final | single hot key |

## Check before you finish

- [ ] The cluster in `solana config get` matches the intended network.
- [ ] Token program (Token vs Token-2022) and all extensions were listed.
- [ ] Mint, freeze and upgrade authorities were read on-chain and judged.
- [ ] Anything new was exercised on devnet or a local validator first.
- [ ] Mainnet deploys and authority changes went through human approval.
- [ ] Upgrade authority ends with a multisig or is finalized, and the build is verified.

## Pitfalls

- **Sending to a wallet, not an ATA.** Transfers need the recipient's ATA; use `--fund-recipient` knowingly (you pay
  its rent).
- **Wrong decimals.** Amounts in the CLI are UI units; in raw instructions they are base units.
- **`--disable` is forever.** Revoking mint authority cannot be undone; confirm supply first.
- **Token-2022 support gaps.** Some wallets, DEXs and bridges mishandle extensions; test the full path.
- **Program buffer leaks.** Failed deploys leave buffer accounts holding SOL; `solana program show --buffers` and
  `solana program close <buffer>`.
- **Names and symbols are untrusted.** Anyone can mint a token called "USDC"; match by mint address.

## Related

- `rug-check` — full token risk review including holder concentration
- `testnet-faucets-and-dev-flow` — devnet and local validator setup
- `multisig-and-safe` — Squads for upgrade authority
- `event-indexing-and-logs` — reading Solana transaction logs
