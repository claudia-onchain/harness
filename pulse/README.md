# Pulse

**A Grok-native harness for things that move.** Watchlists → routines → briefs and alerts on Telegram, powered by
Grok's live X search, with Grok Imagine visuals and an exact cost receipt on every run.

Pulse is the self-hosted version of a "Grok Bot": you give it handles, tickers and keywords; it scans X on a
schedule with `x_search`, cross-checks prices, lets `grok-4.7` decide whether anything deserves your attention,
renders a card, and sends it. Every alert can be replayed (`pulse why <id>`) down to the posts that triggered it,
and every dollar comes from xAI's own `cost_in_usd_ticks`, so caps are real.

- **Live X, bounded.** Each scan passes a UTC date window, handle allow/deny lists and `max_turns`, because
  `x_search` bills per post fetched. Only posts Grok actually cited count; nothing hallucinated gets through.
- **Two models, two jobs.** `grok-4.3` (cheap, 1M context) scans; `grok-4.7` (low effort) judges and writes briefs.
- **Receipts.** Per-run and per-day USD caps enforced from the ticks xAI returns. `pulse cost` shows the truth.
- **Visuals.** Grok Imagine image on every alert; a 6-second voiced video brief on `high` alerts if you opt in.
- **Memory.** SQLite (`node:sqlite`): routines, runs, every Grok response, alerts, posts already seen.
- **Channels.** Telegram bot (commands + free-text questions), CLI, local HTTP with a webhook trigger.
- **Zero dependencies.** Node 22.13+ only.

## Install

```sh
git clone https://github.com/claudia-onchain/harness.git && cd harness/pulse
npm link                       # `pulse` on your PATH
pulse init                     # ~/.pulse, asks for your xAI key and tests it live
pulse keys set telegram 123456:ABC…   # a bot from @BotFather
```

Keys live in `~/.pulse/keys.json` (mode 0600); `XAI_API_KEY` and `TELEGRAM_BOT_TOKEN` env vars override.

## Use

```sh
pulse watch add "Solana" --symbols SOL --keywords "solana,jupiter" --handles solana,jupiterexchange --every 15m --cap 0.40 --chat <chatId>
pulse brief add "Morning" --topics "AI agents, SOL, BTC ETF flows" --symbols BTC,SOL --at 07:30 --chat <chatId>
pulse run                      # scheduler + Telegram bot + HTTP, in the foreground
pulse ask "what is crypto twitter saying about $HYPE right now?"
pulse cost --today
pulse why al_x7k2…             # the posts, prices and judgement behind an alert
```

In Telegram: `/watch`, `/brief`, `/why <id>`, `/cost`, `/pause`, `/resume`; any other text is a question.

## How a watch run works

1. **Window**: from the last run to tomorrow (exclusive), the routine's handles.
2. **Scan** (`grok-4.3`, `x_search`, `max_turns: 2`) → structured list of posts; keep only cited URLs; drop seen ones.
3. **Prices**: DefiLlama / CoinGecko, keyless.
4. **Judge** (`grok-4.7`, no tools, structured): alert or not, severity, headline, summary, sentiment, velocity.
5. **Budget**: checked after every response; a run that crosses its cap stops but still delivers what it has.
6. **Card**: Imagine image in the house style; `high` + `--video` → a 6 s video brief.
7. **Send** + store; `pulse why` replays 2–4 from the stored responses.

Typical cost: a 15-minute watch with ≤ 20 posts per scan runs about $0.03–0.10 per scan; a 3-topic brief about
$0.30–0.50 (xAI's own cookbook numbers are in `docs/RESEARCH.md`).

## Develop

```sh
npm test            # offline, against test/mock-grok.js
npm run check       # node --check on every file
npm run mock        # run the mock api.x.ai locally; point Pulse at it with XAI_BASE_URL
```

`docs/RESEARCH.md` is the verified map of the xAI platform this was built on; `docs/PLAN.md` is the design.

## Safety

Pulse reads. It never trades, never posts publicly without an approval, and treats everything a tool returns as
data, not instructions. Alerts are information, not advice.

MIT licensed, © 2026 Claudia (claudia-onchain). Part of [claudia-onchain/harness](https://github.com/claudia-onchain/harness).
