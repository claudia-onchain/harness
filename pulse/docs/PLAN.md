# Pulse — a Grok-native harness for things that move

Pulse is a self-hosted "Grok Bot": watchlists → routines → briefs and alerts, with receipts. It lives at
`Agents/ai` locally and will be published as `pulse/` in `github.com/claudia-onchain/harness` next to Lumen.
Everything here is grounded in `docs/RESEARCH.md` (verified against docs.x.ai, October 2026).

## Why Grok, specifically

| Lever (unique to Grok) | How Pulse uses it |
| --- | --- |
| `x_search` hosted tool: live X posts, handle allow/deny (≤20), UTC `from_date`/`to_date` (exclusive), billed **per post fetched** ($5/1k) | The sensor. Pulse always passes a date window and handle lists, and caps `max_turns`, so cost is bounded per run. |
| Responses API: stateful `previous_response_id`, **WebSocket mode** (`wss://api.x.ai/v1/responses`, 25-min sockets), **`/v1/responses/compact`** | One long-lived agent loop per routine; compaction keeps a routine's memory inside context for days. |
| `usage.cost_in_usd_ticks` on every response (1 tick = 1e-10 USD) | Hard per-run and per-day USD caps enforced from what xAI actually charged, never from a price table. |
| `web_search`, `code_interpreter`, `file_search`, `mcp` on the same call | Cross-checks (web), quant (Python sandbox), your docs (collections), your tools (MCP). |
| Grok Imagine: image $0.04, video $0.08/s (1–15 s, lip-synced audio), `-lite` $0.02/s | Every alert ships with a rendered visual; severe ones can ship a 6-second video brief. |
| Realtime voice `wss://api.x.ai/v1/realtime` ($0.08/min) with `x_search` inside the session | Phase 2: call Pulse, or let it call you. |
| Grok Build: open-source coding agent with headless CLI + ACP | Phase 3: a `build` routine type that runs it as a subprocess. |

Grok Bot (xAI's hosted teammates) has no public API. Pulse is the self-hosted version with receipts.

## Model policy

- `grok-4.3` (1M ctx, $1.25/$0.20/$2.50, `reasoning_effort: none|low`) for scanning and scoring: cheap and fast.
- `grok-4.7` (`reasoning: {effort: low}`) only for the final "alert or not" judgement and for briefs.
- Never `grok-4.7` with `xhigh` inside a routine. Users can override per routine (`model`, `effort`).
- Image: `grok-imagine-image-2.0` (`quality: low`, `1k`). Video: `grok-imagine-video-1.5-lite` by default, `-1.5` when `--hd`.
- Every request sets `safety_identifier` (hash of the Telegram chat / routine id) and `prompt_cache_key` (routine id).

## What ships (v0.1)

```
pulse init                               # ~/.pulse, keys, defaults; tests the Grok key live
pulse keys set xai|telegram <value>
pulse watch add "$SOL" --handles a,b --keywords "solana,sol" --every 15m --cap 0.40 --chat <id>
pulse watch list | rm <id> | pause <id>
pulse brief add morning --topics "AI agents, SOL, BTC" --at 07:30 --chat <id>
pulse run [--once <routineId>]           # scheduler + Telegram bot + HTTP, foreground
pulse ask "what is crypto twitter saying about $HYPE today?"   # one-off, budget-capped
pulse why <alertId>                      # the posts, scores and reasoning behind an alert (replay log)
pulse cost [--today|--routine <id>]      # exact spend from cost ticks
pulse serve                              # HTTP only (health, alerts, routines, webhook trigger)
pulse doctor
```

Telegram: `/watch`, `/brief`, `/why <id>`, `/cost`, `/pause`, `/resume`, free text = `ask`. Every alert message has
a visual (Imagine), the headline, sentiment and velocity, the top cited posts (x.com links) and an id for `/why`.

## Architecture

```
src/grok/        responses.js  HTTP + SSE streaming + WebSocket mode + compact; function-call loop; citations
                 imagine.js    images/generations, images/edits, videos/generations + polling, videos/extensions
                 realtime.js   (phase 2) realtime session + ephemeral client secrets
                 cost.js       ticks → USD, usage summaries, server_side_tool_usage_details
                 errors.js     typed errors (rate limit, budget, auth, tool)
src/core/        config.js     ~/.pulse (PULSE_HOME), keys.json 0600, env overrides
                 store.js      node:sqlite: routines, runs, responses, alerts, posts_seen, costs, approvals
                 budget.js     per-run / per-routine-day / global-day caps, enforced from ticks; estimate guard
                 routines.js   scheduler (every N min / daily at HH:MM, UTC), one in-flight run per routine
                 approvals.js  queue for anything that posts publicly or exceeds a cap; Telegram inline buttons
                 log.js        structured JSONL log + replay helpers
                 untrusted.js  wrap post text / web text as data (never instructions)
src/sensors/     x.js          x_search call builder (window, handles, max_turns), citation filtering, dedupe vs posts_seen
                 web.js        web_search builder
                 prices.js     DefiLlama / CoinGecko keyless prices + 24h change (no key needed)
src/routines/    watch.js      scan (4.3) → judge (4.7, structured output) → alert → card → channel
                 brief.js      morning/evening brief over topics: x + web + prices → Markdown + one image
                 ask.js        one-off question with x_search + web_search, capped
                 persona.js    (phase 2) Herald: draft → render → approval → post to X
src/cards/       prompt.js     Imagine prompt builder in a fixed house style; caption formatter; unicode sparkline
                 video.js      6-second video brief (headline voiced), opt-in
src/channels/    telegram.js   long polling, commands, sendPhoto/sendVideo/sendMessage, inline approvals
                 http.js       /health /alerts /routines POST /run/:id (token)
                 x.js          (phase 2) X posting, pay-per-use, approval-gated
src/cli/         index.js, commands/*.js, out.js (colours, tables)
bin/pulse.js
test/            mock-grok.js (HTTP + WS mock of api.x.ai with canned posts, citations, cost ticks, image/video jobs)
                 *.test.js (node:test, offline)
```

Zero runtime dependencies: Node ≥ 22.13 gives `fetch`, global `WebSocket`, `node:sqlite`, `node:test`.

## Data model (SQLite, `~/.pulse/pulse.db`)

- `routines(id, kind, name, config_json, enabled, every_min, at_utc, chat_id, cap_usd_run, cap_usd_day, created_at, last_run_at, next_run_at)`
- `runs(id, routine_id, started_at, ended_at, status, cost_ticks, posts_fetched, tool_calls_json, error)`
- `responses(id, run_id, model, request_json, response_json, cost_ticks, created_at)` — the replay log
- `alerts(id, run_id, routine_id, severity, headline, summary, sentiment, velocity, posts_json, media_url, sent_at, chat_id)`
- `posts_seen(url PRIMARY KEY, routine_id, first_seen_at)` — dedupe; a post triggers at most one alert per routine
- `costs(day, routine_id, ticks)` — rollups for `pulse cost` and the daily cap
- `approvals(id, kind, payload_json, status, created_at, decided_at)`

## The watch routine, end to end

1. **Window.** `from_date` = last run (or now − `every`), `to_date` = tomorrow (exclusive). Handles from the routine.
2. **Scan** (`grok-4.3`, effort `none`, `max_turns: 2`, `x_search` with the window): structured output
   `{posts:[{url, handle, text_snippet, stance, strength}], themes:[…], velocity_hint}`. Keep only posts whose URL
   appears in `url_citation` annotations (the cookbook's anti-hallucination rule). Drop URLs already in `posts_seen`.
3. **Prices.** DefiLlama/CoinGecko for the routine's symbols: price, 24 h change, sparkline points.
4. **Judge** (`grok-4.7`, effort `low`, no tools): given the new posts + prices + the routine's recent alerts, return
   `{alert: bool, severity: "low|medium|high", headline, summary, sentiment: -1..1, velocity: 0..1, posts:[{url, why}]}`.
   Rules in the prompt: don't alert on the same story twice; "high" needs multiple independent handles or a price move.
5. **Budget** is checked after every response using `cost_in_usd_ticks`; a run that crosses its cap stops and logs
   `budget_exceeded` (the alert is still sent if the judgement already completed).
6. **Card.** Imagine image (house style prompt + headline), caption with numbers and the top 3 x.com links. Severity
   high + `video: true` → 6 s `-lite` video with the headline spoken.
7. **Send** to the routine's Telegram chat; store the alert; `pulse why <id>` replays steps 2–4 from `responses`.

## Build order and owners

1. **Builder A — `src/grok/*` + `test/mock-grok.js` + tests.** HTTP, SSE, WebSocket, compact, function-call loop,
   structured output helper, citation extraction, imagine (image + video + polling), cost helpers, typed errors.
2. **Builder B — `src/core/*`, `src/channels/telegram.js`, `src/cli/*`, `bin/pulse.js` + tests.** Config/keys,
   SQLite store, scheduler, budget, approvals, log, Telegram long-polling with a handler interface, CLI skeleton
   (`init`, `keys`, `watch`, `brief`, `run`, `cost`, `why`, `doctor`, `serve`).
3. **Lead — `src/sensors/*`, `src/routines/*`, `src/cards/*`, integration, README, validation** against the mock
   and then live with a real key.

Conventions: ESM, 2-space, comments say why, no dependencies, every module testable offline against the mock,
`npm test` / `npm run check` green before anything is called done. Author: Claudia (claudia-onchain). MIT.

## Later

- Phase 2: voice (`realtime.js`, Twilio μ-law passthrough), Herald persona routine with X posting + approvals.
- Phase 3: `build` routine type running Grok Build headless (`grok -p … --output-format streaming-json`).
- Collections (`file_search`) for a user's own research docs; MCP tools from Lumen's server.
