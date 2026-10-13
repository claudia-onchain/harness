---
name: tax-ready-ledgers
description: "Produces tax-ready crypto records across EVM chains, Solana and Bitcoin: complete transaction export, event classification (trade, swap, self-transfer, bridge, LP, staking reward, airdrop, gas), historical USD pricing at block time, per-wallet cost basis lots (FIFO, HIFO, average, UK pooling) and CSVs importable by Koinly, CoinTracker or an accountant. Use when someone asks \"prepare my crypto taxes\", \"export my transactions\", \"cost basis for this wallet\", \"how do I record bridges and airdrops\", or \"make a CSV for my accountant\". Records only, never tax advice."
license: MIT
metadata:
  title: "Tax-Ready Ledgers"
  category: "crypto-core"
  level: "advanced"
  tags: "tax, ledger, cost basis, fifo, hifo, csv, koinly, cointracker, accounting, records, 1099-da"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Tax-Ready Ledgers

Tax software is only as good as the transactions fed into it, and multi-chain activity (bridges, LPs, airdrops,
failed transactions, spam) is exactly where it mis-classifies. This skill builds a complete, classified, priced
ledger per wallet that a person or accountant can audit row by row. The idea that matters most: every row must link
to an on-chain transaction, and every classification must be explainable; this skill keeps records, a qualified
professional decides what is taxable.

## When to use

- "Prepare my crypto taxes for 2026", "export every transaction from these wallets".
- "What is my cost basis?", "which lots did I sell?"
- "How should bridges / LP deposits / airdrops / staking rewards be recorded?"
- Cleaning up a tax-software import full of "missing cost basis" warnings.

## Steps

1. **Inventory wallets and the period.** Every address on every chain, plus CEX accounts (their CSV exports join the
   same ledger). Note the person's country: it decides lot method and what counts as a disposal.
2. **Export complete history.** EVM: `address_activity { "address": "<addr>", "chain": "<id>" }` across every chain in
   `lumen chains` that shows activity (Alchemy `alchemy_getAssetTransfers` with all categories, paginated), plus
   Etherscan V2 `module=account&action=txlist` and `txlistinternal` for gas and failed txs. Solana: Helius
   `GET https://api.helius.xyz/v0/addresses/<addr>/transactions` (paginate with `before`). Bitcoin: per-address UTXO
   history from mempool.space API. Pull from before the period starts so opening lots are known.
3. **Classify every row.** Use the table. Ambiguous rows go to `tx-decoding`; never guess silently. Mark spam
   airdrops (unsolicited tokens with no sale path) as `spam` and exclude them with a note.
4. **Price at block time.** DefiLlama historical: `GET https://coins.llama.fi/prices/historical/<unix_ts>/
   <llama_chain>:<token>` or CoinGecko history. Record source and timestamp per row; flag rows priced with low
   confidence.
5. **Match self-transfers.** Pair outgoing and incoming legs across your own wallets and chains (bridge in/out via
   LI.FI, CCTP, native bridges) by amount, asset and time. Matched pairs move basis and holding period; unmatched
   outflows are disposals until explained.
6. **Build lots per wallet.** Apply the method the jurisdiction allows (examples below). In the US, cost basis is
   tracked wallet-by-wallet from 2025 onward. Gas on acquisitions is commonly added to basis and gas on disposals
   reduces proceeds; gas on failed txs and approvals is recorded separately.
7. **Export.** One CSV with: `timestamp_utc, chain, wallet, tx_hash, type, sent_asset, sent_qty, received_asset,
   received_qty, fee_asset, fee_qty, usd_value, price_source, note`. Map columns to the target tool's template
   (Koinly, CoinTracker and others publish theirs). Write it with `write_file`; keep a reconciliation sheet showing
   ledger end balances vs on-chain balances.

## Classification

| Event | Typical treatment to record |
|---|---|
| Buy with fiat | acquisition, basis = cost + fees |
| Sell for fiat or stable | disposal |
| Token-to-token swap | disposal of sent asset + acquisition of received |
| Transfer between own wallets | non-taxable move; basis carries over |
| Bridge (same asset, own address) | usually a self-transfer; record both legs and fees |
| Wrap/unwrap (ETH/WETH) | often a non-event; some jurisdictions disagree |
| LP deposit/withdraw | varies; record as swap into LP token unless advised otherwise |
| Staking / validator rewards | income at receipt value in many countries |
| Airdrop / points conversion | often income at receipt; spam excluded with note |
| NFT mint / sale | acquisition / disposal; mint gas into basis |
| Failed tx | gas cost only |

Examples (checked 2026-10, confirm locally): the US treats digital assets as property, requires per-wallet basis
from 2025, and brokers issue Form 1099-DA (gross proceeds for 2025, basis for assets acquired from 2026). The UK uses
same-day, 30-day, then Section 104 pooling. Germany exempts private disposals held over one year.

## Check before you finish

- [ ] Every wallet on every active chain plus CEX exports is in scope, with opening lots before the period.
- [ ] Every row links to a tx hash or CEX record and has a classification and a price source.
- [ ] Self-transfers and bridges are paired; unpaired outflows are listed for review.
- [ ] Ledger end balances reconcile to on-chain balances per wallet and chain.
- [ ] Spam and excluded rows are listed with reasons, not silently dropped.
- [ ] The output says it is a record for a qualified professional, not tax advice; it is stored privately.

## Pitfalls

- **Missing chains.** One forgotten L2 creates "missing cost basis" for everything bridged back from it.
- **Internal transactions.** ETH received from contracts (refunds, withdrawals) is not in `txlist`; fetch internals.
- **Swap = income confusion.** Received tokens in a swap are an acquisition, not income.
- **Rebasing tokens.** stETH-style balance growth may be income; snapshot balances periodically.
- **Privacy.** A full ledger maps a person's wealth; never paste it into public tools or chats.

## Related

- `portfolio-and-pnl` — the same ledger used for performance, not tax
- `tx-decoding` — classifying ambiguous transactions
- `bridging-with-lifi` — identifying bridge legs
- `spreadsheet-work` — reviewing and pivoting the exported CSV
- `airdrop-hygiene` — telling real airdrops from spam
