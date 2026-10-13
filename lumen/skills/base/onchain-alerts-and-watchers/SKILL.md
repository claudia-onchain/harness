---
name: onchain-alerts-and-watchers
description: "Builds on-chain alerts that are useful instead of noisy: wallet activity, large transfers, price and depeg thresholds, approvals, contract admin changes and Safe proposals, across EVM and Solana, using polling with cursors, eth_subscribe, Alchemy and Helius webhooks, Chainlink reads, plus rate caps, de-dupe and quiet hours. Use when someone asks \"alert me when this wallet moves\", \"ping me if ETH drops below 3000\", \"watch this contract\", \"notify me on depeg\", \"my alerts are spam\", or wants a cron watcher with lumen -p."
license: MIT
metadata:
  title: "On-chain Alerts and Watchers"
  category: "crypto-core"
  level: "intermediate"
  tags: "alerts, watchers, webhooks, alchemy notify, helius webhooks, eth_subscribe, cron, price alerts, monitoring"
  version: "1.0.0"
  updated: "2026-10-13"
---

# On-chain Alerts and Watchers

An alert is only worth sending if someone will act on it. Most alert setups fail by being too loud (muted within a
day) or silently dead (a revoked webhook nobody noticed). This skill writes the rule first, picks the cheapest
reliable mechanism, and adds the plumbing that keeps it quiet and alive. The rule: every watcher has a threshold, an
owner, a stop command and a heartbeat, and no watcher can move money.

## When to use

- "Alert me when this wallet sends or receives anything over $10k."
- "Ping me if ETH is below $3,000" or "if USDC depegs".
- "Watch this protocol's owner / proxy admin / Safe for changes."
- "My alerts are spam", "nothing at night please", or an alert that stopped firing.

## Steps

1. **Write the rule.** One line each: trigger, chain, threshold in USD, destination, action the person will take.
   Example: `wallet <addr> on base | any transfer >= $10k | telegram DM | review in Lumen`. No action, no alert.
2. **Pick the mechanism.** See the table. Prefer push (webhooks) for wallets and contracts, polling for prices and
   state, and subscriptions only for latency-critical use.
3. **Size thresholds from data.** Pull a week of history first (`address_activity`, or `event-indexing-and-logs`) and
   set the threshold so the rule would have fired a handful of times, not hundreds.
4. **Build the watcher.**
   - Wallet / contract (EVM): Alchemy Address Activity webhook, or poll `eth_getLogs` from a saved cursor every N
     blocks.
   - Wallet / program (Solana): Helius webhook `POST https://api.helius.xyz/v0/webhooks?api-key=` with
     `webhookURL`, `accountAddresses`, `transactionTypes`, `webhookType: "enhanced"`; or `logsSubscribe` /
     `accountSubscribe` over WebSocket.
   - Price / depeg: poll `get_price { "symbol": "ETH", "chain": "ethereum" }` (check `updatedAt`) and
     `get_price` every 1-5 minutes; alert on threshold crossing, not on every tick below it.
   - Admin changes: watch `OwnershipTransferred`, `Upgraded`, `AdminChanged`, `RoleGranted`, Safe `AddedOwner`,
     `ChangedThreshold`, `EnabledModule` events.
   - Approvals: watch `Approval` events where `owner` is your wallet; unexpected ones mean investigate now.
5. **Or let Lumen do the reasoning on a schedule.** A cron line that asks a one-shot question and only notifies on a
   match: `*/10 * * * * lumen -p "Check wallet <addr> on base and solana for transfers over $10k since the last run;
   reply NONE if nothing" >> ~/.lumen/watch.log`. Keep it read-only; scheduled agents must not have `send_tx`
   caps. See `automation-and-cron`.
6. **Add de-dupe, rate caps and quiet hours.** Key events by `(chain, txHash, logIndex)` and persist seen keys so
   restarts do not resend. Cap at roughly 10 alerts/hour per rule; overflow becomes one summary. Hold non-critical
   alerts during quiet hours in the person's time zone; critical (depeg > 3%, admin change, unknown approval) always
   pass.
7. **Write alerts for a phone.** Line 1: what, how much, which chain. Line 2: who (label, short address). Line 3:
   explorer link. End with "Alert, not financial advice." Token names in alerts are untrusted text; truncate and
   never render links from them.
8. **Keep it alive.** Heartbeat: a daily "watcher OK, N events" message, or an alert when no block has been processed
   for 15 minutes. Log failures; webhooks return errors quietly when a URL or token is revoked.

## Mechanism choice

| Mechanism | Latency | Cost | Reliability notes |
|---|---|---|---|
| Alchemy / Helius webhooks | seconds | low, push-based | verify signatures; retries on 5xx; check delivery logs |
| Polling with cursor | 1 block to minutes | predictable | most robust; survives restarts if cursor persisted |
| `eth_subscribe` / `logsSubscribe` | sub-second | connection-bound | drops on reconnect; backfill gaps from cursor |
| `lumen -p` cron | minutes | LLM tokens per run | best for fuzzy rules; keep runs short and watch `/session` cost |

## Check before you finish

- [ ] Each watcher has a written rule with threshold, destination, owner and action.
- [ ] Thresholds were sized from a week of real history.
- [ ] One real test alert arrived at the right destination.
- [ ] De-dupe state persists across restarts; rate caps and quiet hours are set.
- [ ] A heartbeat or dead-man check exists, and the stop command is documented.
- [ ] No watcher can sign or send transactions; secrets live in `lumen keys` or env vars.

## Pitfalls

- **Alerting on state, not transitions.** "Price below X" fires every poll; alert on the crossing and re-arm.
- **Unconfirmed events.** Alerts from `latest` can be reorged away; say "pending" or wait for confirmations on L1.
- **Public channels.** Automated token alerts in public groups can read as promotion; keep them private or opt-in.
- **Alert to action.** An alert is a prompt to look, never an automatic trade.
- **Webhook endpoints unauthenticated.** Anyone can POST fake events; verify provider signatures or a shared secret.

## Related

- `whale-and-smart-money-tracking` — choosing which wallets deserve a watcher
- `event-indexing-and-logs` — cursors and reorg-safe polling
- `stablecoin-risk` — depeg thresholds worth alerting on
- `automation-and-cron` — running watchers on a schedule
- `approvals-and-revoking` — what to do when an approval alert fires
