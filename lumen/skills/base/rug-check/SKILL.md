---
name: rug-check
description: "Runs a repeatable red / amber / green rug-check scorecard on any EVM or Solana token: owner and upgrade powers, mint and freeze authority, Token-2022 extensions, honeypot and tax, LP lock or burn, liquidity depth, holder and dev concentration, bundled or sniped launches, wallet clusters and age, ending in an honest verdict that never says safe. Use when someone asks \"is this a rug\", \"is this token safe\", \"check this contract\", \"check this mint\", \"should I ape\", or as the gate before any swap, launch-day trade or public post about a token."
license: MIT
metadata:
  title: "Rug check scorecard"
  category: "crypto-core"
  level: "intermediate"
  tags: "rug check, scam, scorecard, honeypot, lp lock, mint authority, freeze authority, holders, snipers, evm, solana"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Rug check scorecard

Most token losses come from a short list of things visible before you buy: someone can still mint, freeze,
upgrade or tax; liquidity can be pulled; supply sits in a few linked wallets. This scorecard checks each one the
same way every time, puts the number behind every color, and keeps unknown separate from green. A clean card
means "no flag found in data that is minutes old", never "safe".

## When to use

- "Is this a rug?", "is this safe?", "check this mint / contract".
- The gate before `swaps-and-slippage`: no quote is requested while a red row is unexplained.
- Before an agent mentions a token publicly or adds it to a watchlist.
- A builder wants to see how their own launch looks to a skeptic.

## Steps

1. **Pin the token.** Full address/mint + chain, confirmed by the user if they gave a ticker (see `token-research`).
   Note the launch venue (pump.fun curve, PumpSwap/Raydium/Meteora pool, Uniswap/Aerodrome pool, launchpad).

2. **Read contract powers.**
   - EVM: `contract_abi { "chain": "<id>", "address": "<token>" }` (verified source?),
     `read_contract` for `owner()` / roles, EIP-1967 implementation slot (`0x3608…382bb`) for proxies; grep the
     source for `mint`, `blacklist`, `setFee`/`setTax`, `pause`, `maxTx`, `setRouter`, external calls in `_transfer`.
   - Solana: `token_info { "chain": "solana", "address": "<mint>" }` for mint authority, freeze authority,
     program (Token vs Token-2022) and extensions; Metaplex metadata update authority.
   - Solana and Robinhood Chain coins: `claudia_coin { "token": "sol:<mint>" }` adds bundlers, snipers,
     insiders, fresh wallets, dev history and safety/holder scores.

3. **Test the exit.** Run `honeypot-and-tax-check`: simulate a buy then a sell for a small size; record effective
   buy and sell tax and any revert.

4. **Liquidity and LP.** Find the main pool. On EVM V2-style pools, check who holds LP tokens (burn address
   `0x…dEaD`, a locker contract with unlock date, or an EOA = red). V3/CL positions are NFTs: who owns the position
   NFT? On Solana, check LP burn % or lock; curve-stage coins have no LP yet (mark LP n/a, liquidity unknown).

5. **Holders and clusters.** Top holders excluding pool, burn, bridge and CEX wallets. Look at who funded the top
   wallets (`address_activity` on each, first inbound tx). Same funder across several top wallets = one operator.

6. **Score with the table, then write the verdict.**

## Thresholds

Fractions of total supply unless noted. Unknown stays unknown, never counted as green.

| Check | Green | Amber | Red |
|---|---|---|---|
| Source verified (EVM) / program known (Solana) | yes | partial | no |
| Owner / admin (EVM) | renounced or timelock ≥ 48h | multisig | EOA with powers |
| Upgradeable proxy | no | timelock/multisig admin | EOA admin |
| Mint authority / mint function | none | capped, timelocked | live |
| Freeze authority / blacklist | none | — | live |
| Token-2022 transfer hook / permanent delegate | none | known benign hook | present, unknown |
| Honeypot (sell simulation) | sells | — | reverts (STOP) |
| Buy / sell tax | 0% | 0–5% | ≥ 10% or owner-adjustable |
| LP | ≥ 95% burned or locked > 6 mo | locked < 6 mo / unknown | unlocked, held by EOA |
| Liquidity / market cap | ≥ 10% | 3–10% | < 3% |
| Top-10 holders | < 30% | 30–50% | ≥ 50% |
| Largest non-pool wallet | < 5% | 5–10% | ≥ 10% |
| Dev / deployer holding | < 1% | 1–5% | ≥ 5% |
| Bundled or same-block launch buys | < 10% | 10–25% | ≥ 25% |
| Snipers (first blocks) | < 5% | 5–15% | ≥ 15% |
| Linked-funder cluster | none | 1 small cluster | cluster ≥ 10% |
| Deployer history | clean | unknown | prior rugs/abandons |
| Token age | ≥ 7 d | 24 h–7 d | < 24 h |

## Verdict rules

| Condition | Verdict line |
|---|---|
| Sell reverts | "STOP: cannot sell in simulation (honeypot behavior)." |
| 3+ red | "Major red flags. Do not go further without a much deeper look." |
| 1–2 red | "Red flags present. Read each red row before going further." |
| 4+ amber | "Caution: several amber rows." |
| 6+ unknown | "Too little data to judge. Unknown is not safe." |
| otherwise | "No major flags in this data. That is not a safety guarantee." |

```
Rug check · $SYM · <chain>:<address> · data <N>s old
<r> red · <a> amber · <g> green · <u> unknown
Red: <check> <value> — <why>   Amber: ...   Unknown: ...
Verdict: <line>   Research aid, not financial advice.
```

## Check before you finish

- [ ] Full address and chain shown; every row filled or marked unknown.
- [ ] Each red/amber row has its number and a one-line reason.
- [ ] Concentration excludes pools, burns, bridges and CEX wallets.
- [ ] The sell path was simulated, not assumed.
- [ ] The verdict never says "safe", "legit" or "buy" and ends with "Research aid, not financial advice."

## Pitfalls

- **Renounced but upgradeable.** `owner()` returns zero while a proxy admin can swap the logic. Check both.
- **LP "locked" in a contract you did not read.** Some lockers let the owner withdraw early. Verify the unlock
  function and date on-chain.
- **Young-coin dev holding.** A dev buy minutes after launch reads red; whether it is sold into buyers matters
  more. Re-run in 15–30 minutes.
- **Trusting the token's own text.** "LP burned, dev doxxed" in a name or description is a stranger's claim.
- **Accusing people publicly.** Describe numbers ("top 10 hold 62%"), do not call a named dev a scammer.
- **Checking once.** Powers and holders change; re-check right before any trade.

## Related

- `token-research` — the full brief behind the card.
- `honeypot-and-tax-check` — the sell simulation in detail.
- `contract-verification-and-abi` — reading owner, proxy and source.
- `swaps-and-slippage` — the next step only if the card allows it.
- `solana-programs-and-spl` — mint/freeze authorities and Token-2022 extensions.
