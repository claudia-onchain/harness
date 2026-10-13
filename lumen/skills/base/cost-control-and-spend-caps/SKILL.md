---
name: cost-control-and-spend-caps
description: "Keep Lumen's spending predictable: LLM token cost, media generation cost and on-chain transaction value, with spend caps in ~/.lumen/config.json. Use when someone asks \"how much is this costing\", \"set a budget\", \"limit spending\", \"cap transactions\", \"why is my bill high\", \"make it cheaper\", or before long sessions, batch media jobs or enabling a wallet. Covers /session, wallet.maxUsdPerTx, wallet.maxUsdPerDay, media.approveAboveUsd, model and thinking choices and /compact."
license: MIT
metadata:
  title: "Cost control and spend caps"
  category: "lumen"
  level: "beginner"
  tags: "lumen, cost, budget, spend caps, limits, tokens, media cost, transactions"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Cost control and spend caps

Lumen spends money in three ways: LLM tokens, media generation and on-chain value moved by `send_tx`. Each has
its own lever. Set caps before you need them; a cap set after a runaway loop is a lesson, not a control. Caps
are hard limits enforced by Lumen, not suggestions to the model.

## When to use

- "How much has this session cost?" or "why is my bill so high?"
- Before long agent runs, batch image or video jobs, or unattended work
- Before adding a wallet key and enabling `send_tx`
- "Make Lumen cheaper" without losing quality where it matters
- Setting budgets for a team or a demo machine

## Steps

1. **Measure first.** `/session` in the TUI shows tokens and USD for the current session; every turn also ends
   with usage (input, output, cost). In the dashboard the same numbers show per turn in Chat and per session in
   Sessions. Media jobs carry `costUsd` when the provider reports it.
2. **Set the caps.** In `~/.lumen/config.json` (or with `/settings` in the TUI):

   ```json
   { "wallet": { "maxUsdPerTx": 25, "maxUsdPerDay": 100 }, "media": { "approveAboveUsd": 0.5 } }
   ```

   `wallet.maxUsdPerTx` caps the USD value of one transaction, `wallet.maxUsdPerDay` caps total transaction value per
   day, and `media.approveAboveUsd` sends any media job estimated above that cost to the approval queue. Start low; raise deliberately.
3. **Pick the model tier per task.** Opus 5.5 is $4 in / $20 out per 1M tokens, Sonnet 5.5 $2 / $10, Haiku 5.5
   $0.10 / $0.50. Use the cheap tier for lookups, bulk summaries and sub-agents; keep the strong tier for
   planning, code and money decisions.
4. **Lower thinking for simple work.** `/thinking` or Shift+Tab to low or off for price checks and formatting;
   high or xhigh only for audits and hard bugs. Reasoning is billed as output.
5. **Keep context small.** `/compact` summarizes the conversation so later turns send fewer tokens. Start `/new`
   sessions for unrelated tasks instead of one endless thread. Attach only the files needed (`@file`), not whole
   folders.
6. **Budget media before batching.** Estimate one job, multiply, compare with your media budget (each job above `media.approveAboveUsd` needs a yes). Prefer 4 to 5
   second video drafts at lower resolution, then render the final once.
7. **Use free data where it is good enough.** Prices fall back to Chainlink, DefiLlama and public RPCs with no
   key; paid data keys mostly buy speed and rate limits.
8. **Review weekly.** Compare provider dashboards (Anthropic, OpenAI, OpenRouter) against what `/session`
   reported; a gap usually means another app shares the key.

## Cost levers at a glance

| Spend | Lever | Where |
|---|---|---|
| LLM tokens | model tier, thinking level, `/compact`, `/new` | `/model`, `/thinking`, TUI |
| Media | model choice, duration, resolution, approval threshold | `lumen gen`, `media.approveAboveUsd` |
| On-chain value | per-tx and per-day caps, human approval | `wallet.maxUsdPerTx`, `wallet.maxUsdPerDay` |
| Gas | chain choice, timing, simulation first | `gas`, `simulate_tx` |

## Check before you finish

- [ ] `wallet.maxUsdPerTx`, `wallet.maxUsdPerDay` and `media.approveAboveUsd` are set to numbers the user chose
- [ ] `lumen doctor` or Settings shows the caps as loaded
- [ ] The default model and thinking level fit routine work
- [ ] Long threads were compacted or split
- [ ] The user knows `/session` shows running cost

## Pitfalls

- **Unpriced models.** Local or uncatalogued models show "unpriced"; caps cannot estimate them, so track the
  provider bill directly.
- **Caps are not approvals.** A transaction under the cap still needs an explicit human yes; caps only bound the
  worst case.
- **Sub-agent fan-out.** Ten delegated sub-agents on a strong model multiply cost by ten; give them the fast
  model.
- **Retry loops.** A failing tool retried by the model burns tokens; abort with Esc and fix the cause.
- **Shared keys.** Using the same provider key in several apps makes Lumen's numbers look wrong; use a dedicated
  key per app.

## Related

- `choosing-models-and-providers` — match model tier to the job
- `safety-and-approvals` — caps plus human approval for transactions
- `media-generation-openrouter` — media models and their cost drivers
- `gas-strategy` — keep on-chain fees down
- `multi-agent-delegation` — cheap sub-agents under a strong lead
