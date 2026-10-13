---
name: testnet-faucets-and-dev-flow
description: "Gets testnet funds and sets up a safe local-to-testnet-to-mainnet dev loop for EVM and Solana: faucets for Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, Avalanche Fuji, BNB testnet, Monad testnet and Solana devnet, plus Anvil mainnet forks and solana-test-validator. Use when someone asks \"where do I get Sepolia ETH\", \"faucet for Base Sepolia\", \"airdrop devnet SOL\", \"fork mainnet locally\", or \"how should I test before mainnet\"."
license: MIT
metadata:
  title: "Testnet Faucets and Dev Flow"
  category: "crypto-core"
  level: "beginner"
  tags: "testnet, faucet, sepolia, devnet, anvil, fork, foundry, solana-test-validator, dev workflow"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Testnet Faucets and Dev Flow

Most contract and bot bugs are cheap on a fork, annoying on a testnet, and expensive on mainnet. This skill sets up
the three-stage loop: local fork first (instant, free, real state), public testnet second (real infrastructure,
other users), mainnet last with small amounts. The key idea: a local mainnet fork beats any faucet, because it gives
you unlimited funds against real contracts.

## When to use

- "Where do I get Sepolia / Base Sepolia / Fuji / devnet tokens?"
- "Fork mainnet locally", "impersonate a whale to test my contract".
- Setting up a new project's dev loop before writing deploy scripts.
- A faucet is empty or rate-limited and you need an alternative.

## Steps

1. **Start on a local fork.** EVM: `anvil --fork-url $ETH_RPC --fork-block-number <n>` (pin the block for
   reproducible tests). Fund and impersonate:
   ```bash
   cast rpc anvil_setBalance <addr> 0x56BC75E2D63100000 --rpc-url http://127.0.0.1:8545   # 100 ETH
   cast rpc anvil_impersonateAccount <whale> --rpc-url http://127.0.0.1:8545
   cast send <token> "transfer(address,uint256)" <me> 1000000000 --from <whale> --unlocked --rpc-url http://127.0.0.1:8545
   ```
   Hardhat: `forking: { url, blockNumber }` in `hardhat.config` and `hardhat_impersonateAccount`.
2. **Solana local validator.** `solana-test-validator --reset` gives a local cluster with unlimited airdrops;
   clone mainnet programs and accounts with `--url mainnet-beta --clone <account> --clone-upgradeable-program
   <program_id>`. Then `solana config set --url localhost` and `solana airdrop 100`.
3. **Pick the testnet that matches mainnet.** Deploying to Base? Use `base-sepolia`. Lumen knows `sepolia`,
   `base-sepolia`, `arbitrum-sepolia`, `op-sepolia`, `polygon-amoy`, `avalanche-fuji`, `bnb-testnet`,
   `monad-testnet`, `solana-devnet` (`lumen chains`). Check health: `chain_status { "chain": "base-sepolia" }`.
4. **Use a dedicated dev key.** Generate one that never touches mainnet funds: `cast wallet new` and
   `cast wallet import dev --interactive`, or `solana-keygen new -o ~/.config/solana/dev.json`. Never paste a
   mainnet key into a faucet site or a `.env` committed to git.
5. **Fund from a faucet.** See the table. Many require a small mainnet balance or a GitHub/X login as anti-bot. If
   one is dry, bridge Sepolia ETH to an L2 testnet through the official bridge, or ask a teammate.
6. **Verify funds and run a smoke test.** `lumen balance <addr> --chain base-sepolia`; deploy a trivial contract
   (`smart-contract-deploy`), call it, read it back, and verify on the explorer.
7. **Promote to mainnet small.** Same script, mainnet RPC, minimal value, `simulate_tx` first, human approval for
   `send_tx`. Keep caps tight in `~/.lumen/config.json` (`wallet.maxUsdPerTx`).

## Faucets

| Network | Faucets (check current availability) |
|---|---|
| Sepolia | Alchemy faucet, Google Cloud Web3 faucet, Chainlink faucets.chain.link, QuickNode faucet, PoW faucet |
| Base Sepolia | Coinbase Developer Platform faucet, Superchain faucet (console.optimism.io), Alchemy |
| OP Sepolia | Superchain faucet, Alchemy |
| Arbitrum Sepolia | Alchemy, QuickNode, or bridge Sepolia ETH via the Arbitrum bridge |
| Polygon Amoy | faucet.polygon.technology, Alchemy |
| Avalanche Fuji | core.app testnet faucet (Core wallet), Chainlink faucets |
| BNB testnet | BNB Chain testnet faucet (bnbchain.org) |
| Monad testnet | testnet.monad.xyz faucet |
| Solana devnet | `solana airdrop 2 --url devnet` (rate-limited), faucet.solana.com |

Testnet LINK and test USDC: faucets.chain.link and Circle's faucet (faucet.circle.com) for USDC on many testnets.

## Check before you finish

- [ ] The test ran on a pinned-block fork before touching a public testnet.
- [ ] The dev key is separate from any mainnet key and not committed anywhere.
- [ ] Testnet matches the target mainnet's stack (OP Stack testnet for OP Stack mainnet, etc.).
- [ ] Balance was confirmed with `lumen balance` before deploying.
- [ ] Mainnet promotion uses the same script, tight caps, simulation and human approval.

## Pitfalls

- **Faucet phishing.** Fake faucets ask you to "connect and sign"; a faucet never needs a signature beyond login.
- **Testnet tokens have no value.** Anyone selling testnet ETH is a scam, and buying it invites one.
- **Fork drift.** Unpinned forks change state between runs; pin `--fork-block-number`.
- **Deprecated testnets.** Goerli, Mumbai and Holesky-era guides are stale; use the networks listed above.
- **Testnet behavior differs.** Gas prices, oracle feeds and liquidity on testnets are not realistic; test economics
  on a fork.

## Related

- `smart-contract-deploy` — the deploy script you promote through this loop
- `solana-programs-and-spl` — Solana devnet program and token workflows
- `wallet-and-key-security` — keeping dev and prod keys apart
- `rpc-providers-and-rate-limits` — fork RPCs and archive access
