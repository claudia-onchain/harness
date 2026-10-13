---
name: "{{chain.id}}-defi-yields"
description: "Find and stress-test yield on {{chain.name}}: staking, lending, liquidity provision and vaults, splitting real yield from token emissions, checking protocol and exit risk, and depositing only through previews and approval. Use when someone asks \"best yield on {{chain.name}}\", \"where can I stake {{chain.native.symbol}}\", \"is this {{chain.id}} APY real\", \"earn on my stablecoins on {{chain.name}}\" or \"how risky is this pool\"."
license: MIT
metadata:
  title: "{{chain.name}}: DeFi Yields"
  category: "chain"
  level: "intermediate"
  tags: "{{chain.id}}, {{chain.family}}, defi, yield, staking, lending, liquidity"
  version: "1.0.0"
  updated: "2026-10-13"
---

# {{chain.name}}: DeFi Yields

Every yield is payment for a risk. The job is to name that risk: where the APY comes from (fees and interest,
or freshly printed reward tokens), what can break (contracts, oracles, bridges, depegs) and how fast you can get
out. Lumen researches and compares; it does not recommend a pool, and any deposit needs your explicit approval.

## When to use

- "Best yield on {{chain.name}}?" or "where can I stake {{chain.native.symbol}}?"
- Judging whether an advertised APY on {{chain.id}} is real or sustainable
- Comparing staking, lending and LP options for an asset the user already holds
- Reviewing an existing position's risk

## Steps

1. **Pin the brief.** Asset, amount, how long, and whether the user accepts price exposure, impermanent loss
   or lockups. Stablecoin yield, {{chain.native.symbol}} staking and LP yield are different risk classes.
2. **List candidates.**
{{#llama}}
   `defi_yields { "chain": "{{chain.id}}" }` (DefiLlama yields) returns pools with `apyBase`, `apyReward`, TVL
   and the underlying tokens; `defi_tvl { "chain": "{{chain.id}}" }` ranks protocols by TVL. Drop pools under
   ~$1M TVL unless the user explicitly wants small ones.
{{/llama}}
{{^llama}}
   DefiLlama does not cover {{chain.name}}, so build the list from protocol sites and {{chain.explorer}};
   record where each number came from and when.
{{/llama}}
3. **Know the native options.**
{{#evm}}
   {{chain.name}} yields are usually lending markets, DEX LPs, vaults and, where {{chain.native.symbol}} is
   staked natively, liquid staking tokens. Check whether each pool's assets are native or bridged.
{{/evm}}
{{#solana}}
   Native staking to a validator (stake accounts, about 2–3 days to deactivate per epoch boundary), liquid
   staking (JitoSOL, mSOL, JupSOL and others), lending (Kamino, MarginFi, Save), LPs (Orca, Raydium, Meteora).
{{/solana}}
{{#bitcoin}}
   BTC earns nothing on its own. Options: Babylon-style staking (self-custodial timelocked outputs, with
   slashing and protocol risk), Lightning routing (small, operational), or wrapped BTC on other chains
   (adds custodian or bridge risk on top of the DeFi risk). Ask which trade-off the user accepts.
{{/bitcoin}}
{{#sui}}
   Native staking (StakedSui objects, rewards per ~24 h epoch), liquid staking tokens, lending (Suilend, Navi,
   Scallop) and DEX LPs (Cetus, Bluefin, Turbos).
{{/sui}}
{{#aptos}}
   Delegated staking to validator pools, liquid staking (Amnis, Thala and others), lending (Aries, Echelon)
   and DEX LPs (Hyperion, Thala, Cellana).
{{/aptos}}
{{#tron}}
   Stake TRX (Stake 2.0) and vote for Super Representatives for rewards, with a 14-day unstake wait; JustLend
   for lending; SunSwap LPs; liquid staked TRX.
{{/tron}}
{{#starknet}}
   Native STRK staking via delegation to validators (with an unbonding wait), liquid staking (for example
   Endur), lending (Vesu, Nostra) and DEX LPs (Ekubo).
{{/starknet}}
4. **Split the APY.** Base yield (fees, interest, staking rewards) is the durable part. Reward yield paid in
   an emissions token falls as that token falls; recompute it at a 50% lower token price to see the floor.
   For LPs, estimate impermanent loss for a ±30% price move of the volatile side.
5. **Check protocol risk.** Age and audits, TVL trend, past incidents, admin keys and timelocks, and the oracle
   it uses.
{{#evm}}
   `contract_abi { "address": "<pool>", "chain": "{{chain.id}}" }` and `cast implementation` show whether
   contracts are verified and upgradeable.
{{/evm}}
{{^evm}}
   Read the program or package upgrade authority as in `{{chain.id}}-contract-verify-and-read`.
{{/evm}}
6. **Check the exit.** Withdrawal queues, unbonding periods, utilisation (lending above ~90% utilisation can
   block withdrawals), lockups and LST discount to the underlying. Write down the worst-case exit time.
7. **Deposit only with approval.** If the user decides to go ahead: exact-amount approval, then the deposit,
   each previewed with `simulate_tx { "chain": "{{chain.id}}", "tx": <tx> }`, approved in `/approvals`, then
   sent with `send_tx`, within `wallet.maxUsdPerTx`. Start with a small test deposit and confirm a withdrawal works.
8. **Monitor.** Set alerts for APY drops, utilisation, depegs or TVL outflows (`{{chain.id}}-alerts`).

## Check before you finish

- [ ] Each candidate shows base vs reward APY, TVL and the source with a date
- [ ] Protocol, oracle, bridge and depeg risks are named per candidate
- [ ] Exit conditions and worst-case exit time are stated
- [ ] No pool was presented as a recommendation; any deposit was previewed and approved

## Pitfalls

- Four-digit APYs are emissions or bugs; both end abruptly.
- TVL is not safety: large protocols get exploited too, and TVL can be recycled through loops.
- Looping (deposit, borrow, redeposit) multiplies liquidation and oracle risk; flag it explicitly.
- Past yield is not future yield, and none of this is financial advice.

## Related

- `{{chain.id}}-security-checklist` — before connecting a wallet to a new protocol
- `{{chain.id}}-alerts` — watching positions over time
- `defi-yield-due-diligence` — the full due-diligence method
- `stablecoin-risk` — when the yield asset is a stablecoin
- `approvals-and-revoking` — cleaning up after you exit
