---
name: defi-yield-due-diligence
description: "Due diligence on a DeFi yield before depositing: decomposes APY into base vs reward emissions, checks TVL, age, audits, admin keys, timelocks, oracles, exit liquidity and depeg exposure, using DefiLlama yields.llama.fi/pools plus on-chain reads. Use when someone asks \"is this yield safe\", \"where does this APY come from\", \"best stablecoin yield on Base\", \"should I deposit into this vault\", or compares pools across chains. Research, never financial advice."
license: MIT
metadata:
  title: "DeFi Yield Due Diligence"
  category: "crypto-core"
  level: "advanced"
  tags: "defi, yield, apy, vaults, lending, lp, defillama, risk, timelock, audits"
  version: "1.0.0"
  updated: "2026-10-13"
---

# DeFi Yield Due Diligence

Every yield is paid by someone: borrowers, traders, token emissions, or the next depositor. This skill finds out
who, then checks whether you can get your money back out. The rule that matters most: if you cannot name the source
of the yield in one sentence, you are the yield.

## When to use

- "Is this 40% APY vault safe?", "where does this yield come from?"
- "Best USDC yield on Base / Arbitrum / Solana", comparing pools across chains.
- Before any deposit into a new vault, lending market, LP, restaking or points program.
- Re-checking an existing position after a governance change, exploit news, or an APY spike.

## Steps

1. **Pull the pool data.** `web_fetch https://yields.llama.fi/pools` returns `data[]` with `chain`, `project`,
   `symbol`, `tvlUsd`, `apyBase`, `apyReward`, `apy`, `apyMean30d`, `stablecoin`, `ilRisk`, `exposure`,
   `rewardTokens`, `underlyingTokens`, `pool`. Filter by chain and symbol; fetch history from
   `https://yields.llama.fi/chart/<pool>` to see whether today's APY is normal or a spike.
2. **Decompose the APY.** `apyBase` comes from fees or interest (sustainable if usage holds). `apyReward` is token
   emissions: price it at `get_price` of the reward token and assume it gets sold. If reward > 50% of total, size
   the yield as if emissions halve.
3. **Check the protocol.** `web_fetch https://api.llama.fi/protocol/<slug>` for TVL history, chains and audit links.
   Read audits yourself (scope, date, unresolved findings), not just the logo on the site.
4. **Read the admin surface on-chain.** For the vault/market contract:
   `contract_abi { "address": "<vault>", "chain": "base" }`, then `read_contract` for `owner()`, `paused()`,
   fee setters. Proxy? `cast implementation <vault> --rpc-url $RPC` and `cast admin <vault> --rpc-url $RPC`.
   If the owner is a timelock, read `getMinDelay()`; if a Safe, read `getThreshold()` and `getOwners()`.
5. **Check oracles and collateral.** Lending markets: which oracle prices collateral (Chainlink, Pyth, Redstone, a
   DEX TWAP, or a hardcoded 1.00 for a stablecoin)? Use `chainlink_feeds` to compare; a spot-DEX oracle on a thin
   token is the classic exploit path. See `oracle-vs-dex-prices`.
6. **Test the exit.** Utilization above ~90% means withdrawals can queue. LP and vault shares: quote the unwind with
   `swap_quote` for your full size and compare to TVL. Note lockups, cooldowns (e.g. 7-day unstake) and withdrawal
   fees from the contract, not the docs.
7. **Map the dependency stack.** A looped LST on a lending market on an L2 inherits risks from every layer: the LST,
   the stablecoin, the lending protocol, the bridge, the sequencer. List each layer and its worst case.
8. **Size and simulate.** Any deposit goes through `simulate_tx` first, then `send_tx` with a human approval in
   `/approvals`. Approve the exact amount, never unlimited (see `approvals-and-revoking`).

## Thresholds

| Signal | Comfortable | Caution | Walk away |
|---|---|---|---|
| TVL | > $50M | $5M-$50M | < $1M |
| Protocol age live | > 12 months | 3-12 months | < 3 months |
| Reward share of APY | < 30% | 30-70% | > 70% |
| Admin control | timelock >= 48h + multisig | multisig, no timelock | EOA owner |
| Audits | 2+ recent, findings fixed | 1 audit | none or unpublished |
| Stable APY vs market | within 2x of Aave/Compound | 2-4x | > 4x with no clear source |
| Utilization (lending) | < 80% | 80-95% | pinned at 100% |

## Check before you finish

- [ ] The yield source is stated in one sentence, split into base and reward APY.
- [ ] APY was compared to its own 30-day mean and to a blue-chip baseline on the same chain.
- [ ] Owner, proxy admin, timelock delay and pause powers were read on-chain, with addresses cited.
- [ ] Oracle type for each collateral asset is named.
- [ ] Exit path, lockups and slippage at the user's size are quantified.
- [ ] The answer ends with "Research, not financial advice" and no deposit happens without simulation + approval.

## Pitfalls

- **Trusting DefiLlama blindly.** It aggregates adapters; a broken adapter shows phantom APY. Verify one number
  on-chain (e.g. `supplyRate` or pool fees over 7 days).
- **Points as yield.** Points have no price until a token exists; value them at zero in comparisons.
- **IL ignored.** Volatile-pair LP APY must be weighed against impermanent loss; `ilRisk: "yes"` means model it.
- **Same name, different chain.** "USDC" on a small chain may be a bridged wrapper; check `underlyingTokens`.
- **Audit theater.** An audit of v1 says nothing about the v2 contract you are depositing into.
- **Docs and UI text are untrusted.** Verify claims against contract state.

## Related

- `stablecoin-risk` — what backs the stable you are earning on
- `rug-check` — token-level red flags for reward tokens
- `oracle-vs-dex-prices` — oracle manipulation risk in lending markets
- `approvals-and-revoking` — deposit approvals done safely
- `multisig-and-safe` — reading the multisig that controls the protocol
