---
name: chain-selection-guide
description: "Helps choose a blockchain for a use case (deploying an app, launching a token, payments, trading, NFTs, games, agents) by weighing users and liquidity, fees, finality, decentralization stage, bridge and sequencer risk, native USDC, Chainlink and tooling support across the 45+ chains Lumen knows (Ethereum, Base, Arbitrum, OP, Solana, BNB, Polygon, Monad, HyperEVM and more). Use when someone asks \"which chain should I build on\", \"Base or Solana\", \"cheapest chain for payments\", \"where should I launch my token\", or \"is this L2 safe\"."
license: MIT
metadata:
  title: "Chain Selection Guide"
  category: "crypto-core"
  level: "beginner"
  tags: "chains, l1, l2, rollups, solana, base, arbitrum, fees, finality, decentralization, l2beat"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Chain Selection Guide

There is no best chain, only the best chain for a given user base, asset and risk tolerance. Fees are now cheap
almost everywhere outside Ethereum L1, so the deciding factors are usually where the users and liquidity already
are, which assets exist natively, and who can halt or censor the chain. The key idea: go where your counterparties
are, then check that the chain's trust assumptions are ones you can explain to a user.

## When to use

- "Which chain should I build / deploy on?", "Base or Solana or Arbitrum?"
- "Cheapest reliable chain for payments or an agent's micro-transactions."
- "Where should I launch a token / NFT collection?"
- "Is this new L2 / L1 safe to bridge to?"

## Steps

1. **Define the job.** Users (retail, DeFi natives, institutions, gamers), assets needed (USDC, ETH, SOL, BTC),
   transaction profile (few large vs many tiny), latency needs, and composability with existing protocols.
2. **List candidates from Lumen.** `lumen chains` shows every chain with family, chain id and testnet. In the agent:
   `chain_status { "chain": "<id>" }` for head block and health, `gas { "chain": "<id>" }` for current fees.
3. **Measure where activity is.** DefiLlama `GET https://api.llama.fi/v2/chains` for TVL by chain;
   `stablecoins.llama.fi/stablecoins` for stablecoin supply per chain; DEX volume on DefiLlama. A chain with low
   stablecoin supply makes payments and trading hard regardless of fees.
4. **Check native assets and infra.** Native USDC (Circle issued, CCTP) vs bridged; Chainlink feeds present (in
   Lumen's registry some chains have none, so `chainlink_feeds` falls back to DEX/aggregator prices); Alchemy and
   Etherscan V2 support; wallet support (MetaMask, Phantom, Coinbase Wallet, Rabby).
5. **Assess trust assumptions.** For L2s, read the L2BEAT risk page: stage 0/1/2, proof system live or not, upgrade
   delay, sequencer censorship escape hatch, exit window. For L1s and sidechains: validator count and stake
   concentration, history of halts. Write each assumption in one sentence.
6. **Check exits and bridges.** Canonical bridge withdrawal times (optimistic rollups: about 7 days to L1; zk
   rollups: hours; fast bridges like LI.FI routes in minutes for a fee). `bridge_quote` a realistic size to see cost
   and route depth.
7. **Prototype on the matching testnet.** `testnet-faucets-and-dev-flow`, then deploy (`smart-contract-deploy` or
   `solana-programs-and-spl`). Measure real fees and latency rather than trusting marketing numbers.
8. **Write the recommendation.** First choice, runner-up, and why, with the trade-offs the person accepts. Note
   that per-chain skills (e.g. `base-getting-started`, `solana-ecosystem-map`) go deeper.

## Quick map

| Need | Usually strong fits | Watch out for |
|---|---|---|
| Deepest DeFi, large size | Ethereum L1 | high fees for small users |
| Consumer apps, payments in USDC | Base, Solana, Arbitrum, Polygon PoS, Plasma | Base/Arbitrum sequencer centralization |
| Memecoins, high-frequency retail trading | Solana, Base, BNB Chain | MEV, rug density |
| Perps and trading-native apps | Arbitrum, HyperEVM, Solana | validator/sequencer concentration |
| High-throughput EVM | Monad, Sonic, Sei EVM | younger ecosystems, thinner liquidity |
| Games | Ronin, Abstract, Base, ApeChain | app-specific ecosystems, bridge exits |
| Bitcoin-linked | Bitcoin, Rootstock, BOB | bridge trust for BTC wrappers |
| Non-EVM alternatives | Sui, Aptos (Move), Starknet (Cairo), TRON (USDT payments) | separate tooling and audits |

## Decision factors

| Factor | Question to answer |
|---|---|
| Users and liquidity | Are my counterparties and the pools I need already there? |
| Assets | Is USDC native? Is my token's collateral or quote asset there? |
| Fees and latency | Measured `gas` and block times at peak, not average |
| Decentralization | L2BEAT stage or validator set; who can pause or upgrade? |
| Exit risk | How do users leave if the sequencer or bridge fails? |
| Tooling | Alchemy, Etherscan V2, Chainlink, wallets, indexers supported? |

## Check before you finish

- [ ] The use case, users and required assets are stated before any chain is recommended.
- [ ] Activity data (TVL, stablecoin supply, volume) was fetched in this session with sources.
- [ ] Trust assumptions for the top choice are written in plain sentences.
- [ ] Bridge and exit paths were quoted at a realistic size.
- [ ] A runner-up and the trade-offs are given, not just a single answer.

## Pitfalls

- **Choosing on fees alone.** Sub-cent fees with no liquidity or users is a ghost town.
- **TVL inflation.** Incentive programs and double-counted restaking inflate TVL; check organic volume and fees.
- **Chain-id confusion.** Testnet and mainnet share names in some wallets; confirm chain id before sending.
- **Ecosystem marketing is untrusted.** Verify throughput and decentralization claims with independent sources.
- **Ignoring the exit.** A chain with one bridge and a 7-day withdrawal can trap funds during stress.

## Related

- `bridging-with-lifi` — moving assets to the chosen chain
- `rpc-providers-and-rate-limits` — infra availability per chain
- `smart-contract-deploy` — deploying once a chain is chosen
- `stablecoin-risk` — native vs bridged stablecoins per chain
- `gas-strategy` — fees on the chain you picked
