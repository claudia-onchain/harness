# xAI / Grok developer platform — research snapshot (2026-10-14)

Purpose: ground-truth for designing the Grok agent harness in `harness/pulse`. Every fact below was read from a fetched page on the date above; the URL sits next to the fact. Where a page could not be fetched or two sources disagreed, it is listed in the final "Open questions" section rather than guessed.

Branding note: docs.x.ai now calls the company "SpaceXSI" / "SpaceXAI" (SpaceX acquired xAI, deal closed 2026-02-02; "SpaceXAI" brand went live 2026-07-06; Musk announced a further rename to "SpaceXSI" in early October 2026). The API host, key env var (`XAI_API_KEY`), console (console.x.ai), docs (docs.x.ai) and model names are unchanged. Sources: https://www.theregister.com/offbeat/2026/10/05/musk-follows-trumps-lead-swaps-ai-for-si-in-spacex-rebrand/5301090 , https://en.wikipedia.org/wiki/SpaceXAI . The TypeScript SDK's client class is literally `SpaceXAI` (https://github.com/xai-org/xai-sdk-ts).

Base URLs: global `https://api.x.ai/v1`; US-only `https://us.api.x.ai/v1` (grok-4.7 and grok-4.6 only, 1.1x token price, no image/video/voice) — https://docs.x.ai/developers/advanced-api-usage/regions . Management plane: `https://management-api.x.ai` — https://docs.x.ai/developers/rest-api-reference/management .

---

## 1. Chat / reasoning models

### 1.1 Model table (text models)

Prices are USD per 1M tokens, "<200k" = prompt under 200k tokens; once a prompt reaches 200k tokens the higher rate applies to all tokens in that request. Source for prices/context: https://docs.x.ai/developers/pricing and https://docs.x.ai/developers/models . Rate limits (Tier 0) from each model page; tier scaling in 1.3.

| Model ID | What it is for | Context | Max output | Input <200k / ≥200k | Cached input <200k / ≥200k | Output <200k / ≥200k | Reasoning effort | Vision in | Batch | Tier-0 RPS / TPM | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `grok-4.7` | "frontier model for coding, agentic tasks, and knowledge work"; "the most capable model we've built", recommended for code and chat; default model of Grok Build | 500k | "No text output limit" (Responses `max_output_tokens` defaults to 128,000) | $2.00 / $4.00 | $0.50 / $1.00 | $6.00 / $12.00 | low, medium, high (default), xhigh; cannot be disabled | yes (text+image in, text out) | No | 150 / 50M | https://docs.x.ai/developers/models/grok-4.7 , https://docs.x.ai/developers/grok-4-7 |
| `grok-4.6` | same positioning, previous frontier (Aug 2026) | 500k | no text output limit | $2.00 / $4.00 | $0.50 / $1.00 | $6.00 / $12.00 | low, medium, high (default), xhigh | yes | No | 150 / 50M | https://docs.x.ai/developers/models/grok-4.6 |
| `grok-4.5` | "intelligent coding model for agentic software, engineering, and workflow tasks" (aliases `grok-4.5-latest`, `grok-build-latest`) | 500k | n/s | $2.00 / $4.00 | $0.30 / $0.60 | $6.00 / $12.00 | low, medium, high (default); xhigh treated as high | yes | No | 150 / 50M | https://docs.x.ai/developers/models/grok-4.5 |
| `grok-4.3` | "Fast, reliable model with strong tool calling and instruction following" (alias `grok-4.3-latest`) | 1M | n/s | $1.25 / $2.50 | $0.20 / $0.40 | $2.50 / $5.00 | none, low (default), medium, high, xhigh | yes | Yes (20% off) | 37 / 10M | https://docs.x.ai/developers/models/grok-4.3 |
| `grok-4.20-0309-reasoning` / `grok-4.20-0309-non-reasoning` | Feb-2026 generation, reasoning / non-reasoning variants | 1M | n/s | $1.25 / $2.50 | $0.20 / $0.40 | $2.50 / $5.00 | fixed per variant | yes | Yes (20% off) | 37 / 10M | https://docs.x.ai/developers/models , https://docs.x.ai/developers/rate-limits |
| `grok-4.20-multi-agent-0309` | "Multiple agents work in parallel on deep research tasks" (beta); `reasoning_effort` selects 4 or 16 collaborating agents, not depth | 1M | n/s | $1.25 / $2.50 | $0.20 / $0.40 | $2.50 / $5.00 | maps to agent count | yes | Yes (20% off) | 9 / 2.5M | https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309 , https://docs.x.ai/developers/model-capabilities/text/reasoning |
| `grok-build-0.1` | "fastest coding model", public beta since 2026-05-29; "same model that powers Grok Build"; 100+ tok/s; positioned also as "fast, low-cost option for general agentic work and tool calling"; aliases `grok-code-fast-1`, `grok-code-fast`, `grok-code-fast-1-0825` | 256k | n/s | $1.00 / $2.00 | $0.20 / $0.40 | $2.00 / $4.00 | supported (levels n/s) | yes | No | 37 / 10M | https://docs.x.ai/developers/models/grok-build-0.1 , https://x.ai/news/grok-build-0-1 |
| `Grok 4.7 Fast` | same weights on faster infra; **not on the public API** (Cursor and Grok Build only); 2x token rates (<200k: $4 / $1 / $12; ≥200k: $6 / $1.50 / $18) | — | — | — | — | — | — | — | — | — | https://docs.x.ai/developers/pricing |

Knowledge cutoff: only stated for grok-4.7 — "May 2026" (https://docs.x.ai/developers/models , https://docs.x.ai/developers/grok-4-7). Not stated for any other model.

Aliases: `<model>` = latest stable, `<model>-latest` = latest, `<model>-<date>` = pinned (https://docs.x.ai/developers/models).

Image input (all vision models): JPG/JPEG or PNG, max 20 MiB per image, no stated limit on count, any image/text order (https://docs.x.ai/developers/models , https://docs.x.ai/developers/model-capabilities/images/understanding).

Priority processing: `service_tier: "priority"` on Chat Completions and Responses = 2x all token rates, billed only when the response echoes `"service_tier":"priority"`; cache discount applied before the multiplier (https://docs.x.ai/developers/pricing , https://docs.x.ai/developers/advanced-api-usage/priority-processing). The Responses reference also lists a `"fast"` value for `service_tier` but the priority page documents only `default`/`priority` (https://docs.x.ai/developers/rest-api-reference/inference/responses).

Regional pricing: US endpoint 1.1x (grok-4.7: $2.20 / $0.55 / $6.60 under 200k) (https://docs.x.ai/developers/pricing).

### 1.2 Reasoning controls

- Parameter: `reasoning_effort` (Chat Completions) or `reasoning: {"effort": ...}` (Responses). `reasoning_effort` on Responses is a non-standard alias used only when `reasoning` is unset. Values `low|medium|high|xhigh`; default `high` on 4.5/4.6/4.7; `xhigh` on grok-4.6 and later (treated as `high` on 4.5). "Reasoning cannot be disabled" on 4.5/4.6/4.7. grok-4.3 additionally accepts `none` and defaults to `low`. Source: https://docs.x.ai/developers/model-capabilities/text/reasoning , https://docs.x.ai/developers/models/grok-4.3 .
- `presence_penalty`, `frequency_penalty`, `stop` return an error with reasoning models (same page).
- Reasoning tokens are billed as output and reported in `usage.output_tokens_details.reasoning_tokens` (Responses) / `usage.completion_tokens_details.reasoning_tokens` (Chat).
- grok-4.7 exposes reasoning **summaries** streamable as reasoning delta events; Responses always returns `reasoning.encrypted_content` items for grok-4.7 even without `include`. Pass the reasoning items back unchanged in the next `input` to keep chain-of-thought across turns (needed when `store:false` / ZDR). Chat Completions does not support encrypted reasoning. Source: https://docs.x.ai/developers/model-capabilities/text/reasoning , https://docs.x.ai/developers/grok-4-7 .
- `logprobs` / `top_logprobs` are silently ignored on grok-4.20 and newer (https://docs.x.ai/developers/models).

### 1.3 Rate limits and tiers

Tier is cumulative API spend since 2026-01-01: Tier 0 $0, Tier 1 $50, Tier 2 $250, Tier 3 $1,000, Tier 4 $5,000, Enterprise on request; tiers unlock automatically and never downgrade. Limits are per-model RPS and TPM; RPS = RPM/48 (min 2). TPM counts prompt (text+image+audio), completion, reasoning and cached tokens. 429 on breach; recommend exponential backoff. Source: https://docs.x.ai/developers/rate-limits .

| Model group | RPS T0→T4 | TPM T0→T4 |
|---|---|---|
| grok-4.7, grok-4.6, grok-4.5 | 150, 172, 208, 312, 500 | 50M, 53M, 60M, 74M, 100M |
| grok-4.3, grok-4.20-0309-*, grok-build-0.1 | 37, 50, 75, 125, 208 | 10M, 15M, 25M, 45M, 85M |
| grok-4.20-multi-agent-0309 | 9, 12, 18, 31, 56 | 2.5M, 3.7M, 6.2M, 11M, 21M |
| grok-imagine-image* (3 models) | 6, 12, 25, 50, 100 RPS | — |
| grok-imagine-video* (3 models) | 10, 20, 39, 79, 158 RPS | — |
| grok-voice-think-fast-2.0 | concurrent sessions 10, 20, 50, 100, 200 | — |
| TTS | 50, 50, 100, 250, 500 RPS; 100–500 concurrent | — |
| STT | 10, 10, 20, 30, 40 RPS; 100–500 concurrent | — |

Batch requests do not count toward per-minute limits (https://docs.x.ai/developers/advanced-api-usage/batch-api).

### 1.4 Cost accounting hook

Every response (chat, responses, image, video, streaming) carries `usage.cost_in_usd_ticks` (1 tick = 1e-10 USD; 10,000,000,000 ticks per dollar) and `usage.cost_in_nano_usd` — exact request cost. Source: https://docs.x.ai/developers/release-notes (April 2026), https://docs.x.ai/developers/rest-api-reference/inference/chat-completions . The harness should read this instead of recomputing prices.

---

## 2. API shapes

### 2.1 `/v1/responses` (primary; stateful)

Reference: https://docs.x.ai/developers/rest-api-reference/inference/responses . Docs recommend Responses over Chat Completions for new integrations (https://docs.x.ai/developers/rest-api-reference/inference/chat-completions).

Request parameters (verified list):
- `model`, `input` (string or array of items) — required.
- `instructions` (system/developer prompt; cannot be combined with `previous_response_id`).
- `previous_response_id` — continue a stored conversation without resending context. `store` (bool) — whether to persist input/output for later `GET` / chaining. Stateful mode is unavailable under Zero Data Retention (https://docs.x.ai/developers/faq/security).
- `stream` (SSE). `include` (e.g. `["reasoning.encrypted_content"]`, `["verbose_streaming"]` in xAI SDK).
- `tools` (max 350; function + server-side tools), `tool_choice` (`auto|required|none|{type:function,...}`), `parallel_tool_calls` (default true), `max_turns` (cap on server-side tool turns within one request).
- `reasoning: {effort}`, `reasoning_effort` alias; `reasoning.summary` accepted for compatibility (always `detailed`).
- `text: {format: {...}}` structured output; `max_output_tokens` (visible tokens, default 128,000).
- `temperature` (0–2), `top_p`, `top_k`, `min_p`; `logprobs`/`top_logprobs` (ignored on ≥4.20).
- `service_tier` (`default|priority|fast`), `user`, `safety_identifier` (opaque end-user ID for abuse attribution; https://docs.x.ai/developers/release-notes Sept 2026), `prompt_cache_key` (sticky routing; maps to `x-grok-conv-id`).
- `search_parameters` (legacy Live Search: `mode off|on|auto`, `from_date`, `to_date`, `max_search_results`, `sources`, `return_citations`).
- Not supported: `background`, `metadata`, `truncation`, `frequency_penalty`, `presence_penalty`. `context_management` parsed but not executed.

Response object: `id`, `object:"response"`, `model`, `created_at`, `completed_at`, `status` (`completed|in_progress|incomplete`), `incomplete_details`, `error`, `output[]` (items: `message`, `reasoning`, `function_call`, `custom_tool_call`, `image_generation_call`, ...), echoed settings, and `usage` with `input_tokens`, `output_tokens`, `total_tokens`, `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens`, `cost_in_usd_ticks`, `cost_in_nano_usd`, `num_sources_used`, `num_server_side_tools_used`, `server_side_tool_usage_details`.

Other endpoints: `GET /v1/responses/{id}`, `DELETE /v1/responses/{id}`, `POST /v1/responses/compact`. The TS SDK also exposes `responses.inputItems.list()` (https://github.com/xai-org/xai-sdk-ts). No "conversations" object/endpoint is documented on docs.x.ai (see Open questions).

Minimal request / response (from the reference page, condensed):

```json
POST https://api.x.ai/v1/responses
{
  "model": "grok-4.7",
  "instructions": "Answer in one sentence.",
  "input": "Name a prime number greater than 50.",
  "max_output_tokens": 200,
  "temperature": 0.2,
  "store": true
}
```
```json
{
  "id": "<response-id>", "object": "response", "model": "grok-4.7", "status": "completed",
  "created_at": 1754475266,
  "output": [{"type":"message","role":"assistant","status":"completed",
              "content":[{"type":"output_text","text":"53","annotations":[]}]}],
  "usage": {"input_tokens":32,"output_tokens":9,"total_tokens":41,
            "input_tokens_details":{"cached_tokens":8},
            "output_tokens_details":{"reasoning_tokens":0}},
  "store": true
}
```

Function-calling round trip (https://docs.x.ai/developers/tools/function-calling): model emits `output[]` items `{"type":"function_call","name":...,"arguments":"<json string>","call_id":...}`; you reply with `input: [{"type":"function_call_output","call_id":"...","output":"..."}]` plus `previous_response_id`. With streaming "the function call is returned in whole in a single chunk". Tool arguments always conform to the schema (`strict` implicitly true) (https://docs.x.ai/developers/model-capabilities/text/structured-outputs).

### 2.2 `/v1/chat/completions` (stateless, OpenAI-compatible)

Reference: https://docs.x.ai/developers/rest-api-reference/inference/chat-completions .
- Params: `model`, `messages`, `stream` (+`stream_options.include_usage`), `deferred`, `max_completion_tokens` (default 128,000; `max_tokens` deprecated), `n`, `seed`, `temperature`, `top_p`, `tools` (**functions only**, max 350), `tool_choice`, `parallel_tool_calls`, `response_format`, `reasoning_effort`, `search_parameters` (Live Search: `mode`, `sources` default web+X, `from_date`, `to_date`, `max_search_results`, `return_citations`), `web_search_options` (OpenAI compat), `user`, `safety_identifier`, `prompt_cache_key`, `service_tier`.
- Server-side agent tools (`x_search`, `web_search`, `code_interpreter`, `mcp`, `file_search`) are **not** configurable here; only `search_parameters` live search. Chat responses still report `usage.server_side_tool_usage_details` counters and a top-level `citations[]`, `output_files[]`.
- Response: `choices[].message.{role,content,reasoning_content,refusal,tool_calls}`, `finish_reason`, `usage.prompt_tokens_details.{text_tokens,audio_tokens,image_tokens,cached_tokens}`, `usage.completion_tokens_details.reasoning_tokens`, `cost_in_usd_ticks`, `num_sources_used`, `system_fingerprint`.
- Deferred: `"deferred": true` → `{request_id}`; poll `GET /v1/chat/deferred-completion/{request_id}` (202 empty = not ready, 200 = result; result retrievable exactly once, discarded after 24h; shares chat rate limit) (https://docs.x.ai/developers/advanced-api-usage/deferred-chat-completions). Webhook event `chat.completion.completed|failed` exists (https://docs.x.ai/developers/rest-api-reference/management/webhooks).

### 2.3 Streaming

SSE on both endpoints (`data: [DONE]` terminator on chat). Responses streaming uses the OpenAI-style event family; documented events seen: `response.completed` / `response.incomplete` (terminal, carries total `usage`), `response.image_generation_call.{in_progress,generating,completed}`, `response.output_item.done`, reasoning delta events (grok-4.7). The xAI SDK exposes server-side tool calls mid-stream via `include=["verbose_streaming"]` → `chunk.tool_calls`. Sources: https://docs.x.ai/developers/tools/x-search , https://docs.x.ai/developers/tools/image-generation , https://docs.x.ai/developers/tools/advanced-usage . The cookbook TS apps consume `server_tool_call` and `citation` events (https://github.com/xai-org/xai-cookbook/tree/main/examples/topics-to-morning-briefing).

### 2.4 WebSocket mode for Responses (persistent agent loop)

`wss://api.x.ai/v1/responses`, Bearer header on upgrade. Each turn = `response.create` message whose body equals the Responses create body minus `stream`/`background`; events stream back identically to SSE. Continue with `previous_response_id` and only the new input items. `generate:false` = warm-up (prepares state, returns a chainable response ID). One in-flight turn per socket (second is queued); open multiple sockets for parallelism. Connection lasts max 25 minutes then `websocket_connection_limit_reached`. Works with `store:false` and ZDR because the last response's state is cached in memory; evicted on a 4xx/5xx turn or if too old (`previous_response_not_found`). Source: https://docs.x.ai/developers/advanced-api-usage/websocket-mode .

### 2.5 Structured outputs

- Chat: `response_format: {"type":"json_schema","json_schema":{"name":..,"schema":{...},"strict":true}}` (also `json_object`, `text`).
- Responses: `text: {"format": {"type":"json_schema","name":..,"schema":{...},"strict":true}}`.
- Supported: string/number/integer/boolean/null/enum/const/array/object/anyOf/oneOf/allOf(single)/$ref+$defs (non-circular); enforced formats date, time, date-time, email, uuid, ipv4, ipv6, uri; guaranteed limits minLength/maxLength ≤2048, min/maxItems ≤256, min/maxProperties ≤64; numeric bounds **not** enforced (clamp client-side — the cookbook sentiment tracker does this); `additionalProperties` defaults false; regex subset (no lookarounds, backrefs, `\b`); 400 on empty enum/anyOf, boolean schemas, `items` array (use `prefixItems`). "Structured outputs with tools is available only for supported Grok 4 family models." Source: https://docs.x.ai/developers/model-capabilities/text/structured-outputs .

### 2.6 Prompt caching

Automatic, prefix-based on the leading messages; cached tokens billed at the cached rate (grok-4.7: $0.50 vs $2.00). Maximize hits by pinning a conversation to one server: `prompt_cache_key` body field (Responses & Chat; "maps to `x-grok-conv-id`") or the `x-grok-conv-id` HTTP header. Grok 4.7 guide: without it you "often pay full input price on a cache-cold server". Cache hits are not guaranteed across regional endpoints. Sources: https://docs.x.ai/developers/advanced-api-usage/prompt-caching , https://docs.x.ai/developers/grok-4-7 , https://docs.x.ai/developers/advanced-api-usage/regions .

### 2.7 Context compaction (memory for long loops)

`POST /v1/responses/compact {model, input}` → `{id:"cmp_...", object:"response.compaction", output:[{type:"compaction", id, encrypted_content}], usage:{dropped_message_count,...}}`. Put the compaction item first in the next `input`, then new turns; do not edit it; re-compaction allowed; conversation must already fit in context. xAI SDK: `chat.compact()` / `use_encrypted_content=True` to preserve reasoning. Source: https://docs.x.ai/developers/advanced-api-usage/context-compaction .

### 2.8 Batch API

Flow: `POST /v1/batches` → `POST /v1/batches/{id}/requests` (or create with `input_file_id` from a JSONL upload via `POST /v1/files`) → `GET /v1/batches/{id}` until `num_pending==0` → `GET /v1/batches/{id}/results` (paginated). Also `:cancel`, `GET /v1/batches`, `GET /v1/batches/{id}/requests`. JSONL line: `{"custom_id","method":"POST","url","body"}`; URLs allowed: `/v1/chat/completions`, `/v1/responses`, `/v1/images/generations`, `/v1/images/edits`, `/v1/videos/generations`, `/v1/videos/edits`, `/v1/videos/extensions`. Limits: 2 batch creations/s/team, 1,000 add-request calls per 30 s, 25 MB per request, JSONL ≤200 MB / 50,000 requests, >100k requests may be throttled; image/video result URLs expire after 1 h; best-effort ≤24 h. Server-side tools run inside batch; client function calls come back as `tool_calls` for a new batch. Discount 20% only on grok-4.3 and the three grok-4.20 models; 4.5/4.6/4.7 and grok-build-0.1 have **no batch support**. Sources: https://docs.x.ai/developers/advanced-api-usage/batch-api , https://docs.x.ai/developers/pricing , model pages.

### 2.9 Webhooks (management API)

`https://management-api.x.ai/auth/teams/{teamId}/webhook-endpoints` CRUD + `rotate-secret` + `test`; ≤50 endpoints/team. Events: `video.generation|edit|extension.completed|failed`, `image.generation|edit.completed|failed`, `chat.completion.completed|failed`, `batch.progress`. Payload `{id,type,timestamp,data}`; Standard Webhooks HMAC-SHA256 headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; secret `whsec_...` shown once. Source: https://docs.x.ai/developers/rest-api-reference/management/webhooks .

### 2.10 Data retention

Default: requests/responses stored encrypted 30 days for abuse audit; "never trains on your API inputs or outputs without your explicit permission". ZDR is team-wide (console, "where available"); under ZDR these are unavailable: per-key request logging, stateful Responses (`store`, `previous_response_id`), Files API, Collections, Batch, deferred completions, stored image/video outputs, voice conversation history. Header `x-zero-data-retention: true|false` on every response. SOC 2 Type 2. Source: https://docs.x.ai/developers/faq/security .

---

## 3. Server-side ("agentic") tools

Overview: https://docs.x.ai/developers/tools/overview . Marketing name "Agent Tools API" (introduced with Grok 4.1 Fast, 2025-11-19: https://x.ai/news/grok-4-1-fast). Tools execute on xAI servers inside one `/v1/responses` call; the model loops autonomously ("agentic loop") until it answers; `max_turns` caps server-side tool turns per request; a client-side `function_call` ends the request (fresh `max_turns` on the follow-up). Server-side and client-side tools **can be mixed in one `tools` array** per https://docs.x.ai/developers/tools/advanced-usage (note: the Vercel AI SDK provider says it cannot mix them — https://ai-sdk.dev/providers/ai-sdk-providers/xai ; treat as an SDK limitation). Only on Responses API (and the gRPC xAI SDK `chat.create` with `tools=[web_search(), x_search(), ...]`); not on Chat Completions.

### 3.1 Tool pricing (https://docs.x.ai/developers/pricing#tools-pricing)

| Tool (Responses type name) | Price | Notes |
|---|---|---|
| `web_search` | $5 / 1k calls | image search billed at same rate |
| `x_search` | $5 / 1k **posts fetched**; $10 / 1k **profiles fetched** | billed per item returned incl. parent/quoted/thread posts; not de-duplicated |
| `code_interpreter` (alias `code_execution`) | $5 / 1k calls | Python sandbox, no network |
| `image_generation` | Imagine per-image rates | |
| `attachment_search` (File Attachments) | $5 / 1k calls | |
| `file_search` (alias `collections_search`) | $2.50 / 1k calls | |
| `view_image` (Image Understanding) | token-based only | enabled via `enable_image_understanding` |
| `view_x_video` (X Video Understanding) | token-based only | enabled via `enable_video_understanding` on x_search |
| `mcp` (Remote MCP) | token-based only; MCP server sets its own cost | |
| Files storage | $0.025 / GiB / day, $0.20 / GiB download | Collections $0.10 / GiB / day |

`code_interpreter` and `file_search` are not supported on the gRPC API (Python xai-sdk) per the pricing page footnote. Guideline-violation requests caught before generation on Responses cost $0.05.

Usage reporting per request (https://docs.x.ai/developers/tools/x-search):
```json
"usage": { "...": "...",
  "num_sources_used": 44, "num_server_side_tools_used": 2,
  "server_side_tool_usage_details": {
    "web_search_calls": 0, "x_search_calls": 2, "x_posts_fetched": 44, "x_users_fetched": 3,
    "code_interpreter_calls": 0, "file_search_calls": 0, "mcp_calls": 0,
    "document_search_calls": 0, "image_generation_calls": 0 } }
```

### 3.2 `x_search` — live X/Twitter (UNIQUE to Grok)

Source: https://docs.x.ai/developers/tools/x-search (pricing "as of September 21, 2026").

Parameters:
| Param | Type | Notes |
|---|---|---|
| `allowed_x_handles` | string[] | no `@`; max 20 (10 in Vercel AI SDK); mutually exclusive with excluded |
| `excluded_x_handles` | string[] | max 20 |
| `from_date` | `YYYY-MM-DD` | applied from 00:00 UTC |
| `to_date` | `YYYY-MM-DD` | **exclusive**; one day = `to_date` = next day; other formats ignored |
| `enable_image_understanding` | bool | default false; model can view images in posts (billed as image tokens) |
| `enable_video_understanding` | bool | default false; analyze videos in posts (X Search only) |

Handle/date filters apply to keyword and semantic searches but **not** to thread fetches. Sub-functions the model may call (appear as `custom_tool_call` output items): `x_keyword_search` (advanced operators, sorted Top/Latest), `x_semantic_search`, `x_user_search` (billed per profile), `x_thread_fetch` (post + parents + replies). The query string passes X search operators through (`since:`, `OR`, etc. — cookbook notes).

Exact request (from the docs page):
```bash
curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
  "model": "grok-4.7",
  "input": [{"role": "user", "content": "What did SpaceX post about Starship in September 2026?"}],
  "tools": [{"type": "x_search", "allowed_x_handles": ["SpaceX"], "from_date": "2026-09-01", "to_date": "2026-10-01"}],
  "max_turns": 2
}'
```

Trading-sentiment shape (combining verified pieces: x_search + structured output + low effort, as the cookbook does — https://github.com/xai-org/xai-cookbook/tree/main/examples/x-sentiment-tracker):
```json
{
  "model": "grok-4.7",
  "reasoning": {"effort": "low"},
  "input": [{"role":"user","content":"Score crypto-Twitter sentiment on $SOL for 2026-10-13. Use only posts returned by x_search."}],
  "tools": [{"type":"x_search","from_date":"2026-10-13","to_date":"2026-10-14","excluded_x_handles":["spambot1"]}],
  "max_turns": 2,
  "text": {"format": {"type":"json_schema","name":"sentiment","strict":true,
           "schema": {"type":"object","additionalProperties":false,
                      "properties":{"score":{"type":"number"},"posts":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"url":{"type":"string"},"score":{"type":"number"}},"required":["url","score"]}}},
                      "required":["score","posts"]}}}
}
```
Citations come back as `output_text.annotations[]` of `{"type":"url_citation","url":"https://x.com/xai/status/1234567890","start_index":208,"end_index":235,"title":"1"}` (X and web share the `url_citation` type; distinguish by `x.com/.../status/` URL). The gRPC SDK exposes `inline_citations[]` with explicit `x_citation` / `web_citation`. `response.citations` lists every URL encountered incl. uncited. Source: https://docs.x.ai/developers/tools/citations . Cookbook practice: keep only posts present in citations to prevent hallucinated posts.

Measured cost reference: sentiment tracker = 10 daily searches, ≤100 posts, ~1.5 min, ~$0.80/run; morning briefing ~$0.45 for 3 topics (https://github.com/xai-org/xai-cookbook/tree/main/examples/x-sentiment-tracker , .../topics-to-morning-briefing).

### 3.3 `web_search`

Params: `allowed_domains` / `excluded_domains` (max 5 each, mutually exclusive; shown nested under `filters` in the OpenAI-SDK example), `enable_image_understanding` (adds `view_image`), `enable_image_search` (images embedded as Markdown `![alt](url)`). Source: https://docs.x.ai/developers/tools/web-search .
```json
{"model":"grok-4.7","input":[{"role":"user","content":"What is SpaceXSI?"}],
 "tools":[{"type":"web_search","filters":{"allowed_domains":["grokipedia.com"]},"enable_image_understanding":true,"enable_image_search":true}]}
```

### 3.4 `code_interpreter` / `code_execution`

`{"type":"code_interpreter"}`; Python with NumPy/Pandas/Matplotlib/SciPy; no network; limited FS; ephemeral per request; qualitative time/memory limits only. Chat/Responses may return `output_files[]` when `code_execution_files_output` is included. Source: https://docs.x.ai/developers/tools/code-execution , https://docs.x.ai/developers/rest-api-reference/inference/chat-completions .

### 3.5 `file_search` / Collections (RAG)

Tool: `{"type":"file_search","vector_store_ids":["<collection_id>"],"max_num_results":10}` (https://docs.x.ai/developers/tools/collections-search). Collections are managed on the **management API**: `POST/GET/PUT/DELETE https://management-api.x.ai/v1/collections[/{id}]`, `POST .../collections/{id}/documents` (multipart `name,data,content_type,fields`) or upload to `POST https://api.x.ai/v1/files` (purpose `assistants`) then `POST .../collections/{id}/documents/{file_id}`; direct search `POST https://api.x.ai/v1/documents/search {"query","source":{"collection_ids":[...]},"retrieval_mode":{"type":"hybrid|keyword|semantic"}}`. Max file 100 MB; UTF-8 text, PDF, DOCX, HTML, CSV, code; metadata `field_definitions` with `required|unique|inject_into_chunk`; poll document status `DOCUMENT_STATUS_PROCESSED` via SDK. Sources: https://docs.x.ai/developers/files/collections , https://docs.x.ai/developers/files/collections/api . Files API: `POST/GET/DELETE /v1/files`, `/v1/files/{id}/content`, max 512 MB, `expires_after` 3600–2,592,000 s, public URLs 1 h–30 d (https://docs.x.ai/developers/files/managing-files , release notes June 2026).

### 3.6 Remote MCP

```json
{"type":"mcp","server_url":"https://mcp.deepwiki.com/mcp","server_label":"deepwiki",
 "server_description":"optional","allowed_tools":["optional"],"authorization":"optional token","headers":{"X-Custom":"v"}}
```
Streaming HTTP and SSE transports only; `require_approval` and `connector_id` not supported. Source: https://docs.x.ai/developers/tools/remote-mcp .

### 3.7 `image_generation` inside a chat

`{"type":"image_generation","action":"auto|generate|edit"}`; output item `{"type":"image_generation_call","id":"ig_...|ie_...","status":"completed","prompt":"<rewritten prompt>","result":"<base64, no data: prefix>"}`; no size params (state aspect ratio in prompt); multi-turn edits via `previous_response_id`. Source: https://docs.x.ai/developers/tools/image-generation .

### 3.8 Tool search / progressive disclosure

The TS SDK ships a `toolSearch` built-in and the cookbook has `progressive-tool-disclosure` (203 tools, model loads only relevant ones) — https://github.com/xai-org/xai-sdk-ts , https://github.com/xai-org/xai-cookbook . The docs page `/developers/tools/tool-search` returned 404 (see Open questions).

### 3.9 Voice-session tools

The realtime voice API accepts the same server tools in `session.update.tools`: `web_search`, `x_search`, `file_search`, `mcp`, `function` (https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech).

---

## 4. Grok Imagine (images and video)

### 4.1 Image models and prices (https://docs.x.ai/developers/pricing , https://docs.x.ai/developers/models)

| Model | Price | Notes |
|---|---|---|
| `grok-imagine-image-2.0` | $0.04 / image (billed at served quality) | current; `quality` low/medium/auto; `resolution` 1k/2k; batch supported; 6 RPS T0 |
| `grok-imagine-image` (1.0) | $0.02 / image | unaffected by retirement |
| `grok-imagine-image-quality` | $0.05 / image | **retired 2026-11-02** → served by image-2.0 at `quality:low` (release notes) |

Endpoints (https://docs.x.ai/developers/model-capabilities/images/generation):
```json
POST https://api.x.ai/v1/images/generations
{"model":"grok-imagine-image-2.0","prompt":"...","n":1,"aspect_ratio":"16:9","resolution":"1k","quality":"auto","response_format":"url","deferred":false}
```
- `n` 1–10; `aspect_ratio` one of `1:1,16:9,9:16,4:3,3:4,3:2,2:3,2:1,1:2,19.5:9,9:19.5,20:9,9:20,21:9,5:2,auto`; no pixel `size` param; `resolution` `1k` (default) or `2k`; `quality` only on 2.0 (`auto` default = low for generation, medium for editing).
- Sync response: `{"data":[{"url":"..."}]}` (or `b64_json`), temporary URLs; `deferred:true` → 202 `{request_id, status:"pending"}`, poll `GET /v1/images/{request_id}` → `{status:"done", data:[{url, mime_type}], usage}` or `{status:"failed", error:{code,message}}`; kept 24 h; URL output only. Webhooks `image.generation.*`.
- Editing: `POST /v1/images/edits` JSON (OpenAI SDK `images.edit()` unsupported because xAI requires `application/json`): `{"model":"grok-imagine-image-2.0","prompt":"...","image":{"type":"image_url","url":"https://..."}}`; sources may be public URL, `data:image/jpeg;base64,...`, or Files API `file_id`; up to **5 source images** (multi-image editing; output aspect defaults to first image, override via `aspect_ratio`). Sources: https://docs.x.ai/developers/model-capabilities/images/editing , https://docs.x.ai/developers/model-capabilities/images/multi-image-editing , release notes Aug 2026.
- Save to Files: `storage_options` (+`storage_options.public_url`) on Imagine requests; inputs via `image_file_id`, `video_file_id`, `reference_image_file_ids` (release notes June 2026).

### 4.2 Video models and prices

| Model | Price | Capabilities |
|---|---|---|
| `grok-imagine-video-1.5` | $0.080 / s | text-to-video, image-to-video (native 1080p), reference-to-video (≤720p, optional preset voices), lip-synced audio; batch supported; aliases `grok-imagine-video-1.5-preview`, `grok-imagine-video-1.5-2026-05-30`; 10 RPS T0 |
| `grok-imagine-video-1.5-lite` | $0.020 / s | 1080p via upscale from 720p; cheapest |
| `grok-imagine-video` (1.0) | $0.050 / s | ≤720p; required model for **editing** and **extension** |

Sources: https://docs.x.ai/developers/pricing , https://docs.x.ai/developers/models/grok-imagine-video-1.5 , https://docs.x.ai/developers/model-capabilities/video/generation , release notes July 2026.

Generation + polling (https://docs.x.ai/developers/model-capabilities/video/generation):
```json
POST https://api.x.ai/v1/videos/generations
{"model":"grok-imagine-video-1.5","prompt":"A rocket lifting off at dawn, cinematic","duration":8,"aspect_ratio":"16:9","resolution":"1080p","generate_audio":true}
→ {"request_id":"..."}

GET https://api.x.ai/v1/videos/{request_id}
→ {"status":"pending"}
→ {"status":"done","model":"grok-imagine-video-1.5","video":{"url":"https://...","duration":8,"respect_moderation":true}}
→ {"status":"failed","error":{"code":"invalid_argument|permission_denied|failed_precondition|service_unavailable|internal_error","message":"..."}}
```
- `duration` 1–15 s (default 8); `resolution` 480p (default) / 720p / 1080p; aspect `1:1,16:9(default),9:16,4:3,3:4,3:2,2:3,21:9,5:2` (ignored for image-to-video); image-to-video via `image` (URL/base64/file_id); other modes `reference_images`, `reference_audios`, `last_frame`, `keyframes` (≤4 `{image,timestamp_s}`); `generate_audio:false` for silent. SDK polling defaults 1 s (Python) / 5 s (AI SDK), timeout 10 min. URLs temporary. Webhooks `video.generation.*`.
- Edit: `/v1/videos/edits` with `model:"grok-imagine-video"`, `video:{url|file_id|data-uri}`, `prompt`; source ≤8.7 s .mp4 (H.264/H.265/AV1); output same length/aspect, ≤720p (https://docs.x.ai/developers/model-capabilities/video/editing).
- Extend: `POST /v1/videos/extensions {"model":"grok-imagine-video","prompt":"...","duration":10,"video":{"url":"..."}}`; source 2–15 s, extension 2–10 s (default 6), `duration` = extended portion only (https://docs.x.ai/developers/model-capabilities/video/extension).

### 4.3 Image / video understanding in chat

- Image input to chat/responses: `content: [{"type":"input_image","image_url":"data:image/jpeg;base64,...|https://...","detail":"high"},{"type":"input_text","text":"..."}]` on grok-4.7 etc.; JPG/PNG ≤20 MiB (https://docs.x.ai/developers/model-capabilities/images/understanding). Docs warn that server-side storing of history with images may cause failures.
- Direct video *file* input to chat is not documented. Video understanding exists only as the `view_x_video` server tool on X posts via `x_search.enable_video_understanding` (https://docs.x.ai/developers/tools/x-search , https://docs.x.ai/developers/pricing).

---

## 5. Voice

Hub: https://docs.x.ai/developers/model-capabilities/audio/voice . Launch post (2025-12-17): "compatible with the OpenAI Realtime API specification", official LiveKit plugin, #1 Big Bench Audio, <1 s time-to-first-audio — https://x.ai/news/grok-voice-agent-api . Pricing (https://docs.x.ai/developers/pricing):

| Mode | Model | Price |
|---|---|---|
| Speech-to-speech (realtime) | `grok-voice-think-fast-2.0` (alias `grok-voice-latest` since 2026-08-05) | $0.08 / min ($4.80 / hr) + $0.004 per text input |
| Speech-to-text | `grok-voice-transcribe-2.0` (1.0 EOL 2026-10-02, auto-routed) | $0.10 / hr REST, $0.20 / hr streaming |
| Text-to-speech | (voices `eve` default, `ara`, `rex`, `leo`, `sal`...; `GET /v1/tts/voices`) | $15 / 1M characters |
| Custom voices | clone from ≤120 s clip; 30/team; console free; API `POST /v1/custom-voices` **Enterprise-gated** | n/s |

Realtime WebSocket (https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech):
- `wss://api.x.ai/v1/realtime?model=grok-voice-latest`, `Authorization: Bearer` on server; browsers use ephemeral token as subprotocol `xai-client-secret.<token>` minted by `POST /v1/realtime/client_secrets {"expires_after":{"seconds":300}}` (https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens).
- Session config:
```json
{"type":"session.update","session":{
  "voice":"eve","instructions":"You are a trading-desk assistant.",
  "reasoning":{"effort":"high"},
  "turn_detection":{"type":"server_vad","idle_timeout_ms":null},
  "tools":[{"type":"x_search","allowed_x_handles":["SpaceX"]},{"type":"web_search"},
           {"type":"function","name":"get_price","parameters":{"type":"object","properties":{"symbol":{"type":"string"}}}}],
  "audio":{"input":{"format":{"type":"audio/pcm","rate":24000},"transport":"binary","transcription":{"language_hint":"en","keyterms":["Solana"]}},
           "output":{"format":{"type":"audio/pcmu","rate":8000},"speed":1.0}},
  "resumption":{"enabled":false},
  "replace":{"SOL":"sol"}}}
```
- `reasoning.effort` `"high"` (default) or `"none"`; audio formats `audio/pcm` (8k–48k, default 24k), `audio/pcmu`, `audio/pcma` (8k, telephony), `audio/opus` (24k); input/output may differ.
- Client events: `session.update`, `conversation.item.create`, `response.create`, `input_audio_buffer.append|commit|clear`. Server events: `conversation.created`, `session.updated`, `conversation.item.created`, `conversation.item.input_audio_transcription.updated`, `response.created`, `response.output_audio.delta` (base64 `delta`), `response.function_call_arguments.done`, `response.done`, `error`.
- Function flow: on `response.function_call_arguments.done` run the function → `conversation.item.create` with `function_call_output` → `response.create` (send all outputs before one `response.create` for parallel calls). `force_message` is an xAI extension. Session-resumption history expires after 30 min idle.
- TTS: `POST /v1/tts {text (≤60k chars), voice_id, language (20 codes or auto), output_format:{codec mp3|wav|pcm|mulaw|alaw, sample_rate, bit_rate}, speed 0.7–1.5, with_timestamps, replace}`; `wss://api.x.ai/v1/tts` streaming with `text.delta/text.done` → `audio.delta/audio.done`; 50 concurrent WS sessions/team; speech tags `[pause]`, `[laugh]`, `<whisper>`… (https://docs.x.ai/developers/model-capabilities/audio/text-to-speech).
- STT: `POST /v1/stt` multipart (`file` ≤500 MB or `url`, `diarize`, `keyterm`×100, `vad_threshold`, `multichannel` ≤8) → `{text, language, duration, words[{text,start,end,speaker}]}`; `wss://api.x.ai/v1/stt?encoding=pcm&sample_rate=16000&interim_results=true&smart_turn=0.5` → `transcript.partial|done`; 38+ languages (https://docs.x.ai/developers/model-capabilities/audio/speech-to-text).
- Integrations: LiveKit plugin (https://livekit.com/blog/xai-livekit-partnership-grok-voice-agent-api , docs.livekit.io/agents/integrations/xai/), Pipecat (`docs.pipecat.ai/server/services/s2s/grok`), Voximplant; Twilio only via cookbook `voice-agent-phone` (Twilio Media Streams μ-law 8k passthrough → `wss://api.x.ai/v1/realtime`; "not production-ready") — https://github.com/xai-org/xai-cookbook/tree/main/examples/voice-agent-phone . No native SIP/phone-number product documented on docs.x.ai (third parties claim one; unverified — see Open questions).
- "All audio data is processed in real time and never stored or used for training" (voice hub page).

---

## 6. SDKs and tooling

| Item | Status / facts | Source |
|---|---|---|
| Python `xai-sdk` | official, gRPC, Python ≥3.10; `Client`/`AsyncClient`; `chat.create/sample/stream/defer/parse/compact`; `tools=[web_search(), x_search(), code_execution(), collections_search(), mcp()]`; `image`, `video.generate/extend`; OpenTelemetry; default timeout 1620 s; retries on UNAVAILABLE. `code_interpreter`/`file_search` not on gRPC per pricing page. | https://github.com/xai-org/xai-sdk-python , https://docs.x.ai/developers/quickstart |
| TypeScript `@xai-official/sdk` | official but **"Experimental"** (announced ~2026-10-02); Node ≥22.13 ESM; zero deps; `responses.create/get/delete/compact`, `inputItems.list`, built-ins from `@xai-official/sdk/tools`: `webSearch, xSearch, codeExecution, collectionsSearch, imageGeneration, mcp, toolSearch`, plus local `shell` tool; `images`, `videos.generate/edit/extend/wait`, `voice.speak/list/transcribe`, `voice.clientSecrets.create`, `files`, `batches`, `tokenizer`, `models`, `account.apiKey()`; blocks browser/Worker use by default; client class `SpaceXAI`; Apache-2.0. No full realtime client. | https://github.com/xai-org/xai-sdk-ts |
| OpenAI SDK compat | `base_url=https://api.x.ai/v1`; both `responses.create` and `chat.completions.create`; `images.edit()` unsupported (JSON only) | https://docs.x.ai/developers/quickstart , https://docs.x.ai/developers/model-capabilities/images/editing |
| Anthropic `/v1/messages` compat | **not offered** (third-party report; not on docs.x.ai) | https://github.com/DailybotHQ/deepworkplan-website/pull/82 |
| Vercel AI SDK `@ai-sdk/xai` | `xai(model)` uses Responses by default since AI SDK 7; tools `xai.tools.webSearch/xSearch/codeExecution/viewImage/viewXVideo/imageGeneration/mcpServer/fileSearch`; providerOptions `reasoningEffort, previousResponseId, store, serviceTier, include, maxTurns, parallelToolCalls, promptCacheKey, safetyIdentifier`; image/video/speech/transcription/realtime(experimental `grok-voice-latest`) models; xSearch handle cap 10; "cannot mix server-side and client-side tools in the same request" | https://ai-sdk.dev/providers/ai-sdk-providers/xai , https://docs.x.ai/developers/community |
| LangChain | Python `langchain-xai` `ChatXAI` (examples still `grok-4`; no server-tool docs); JS `@langchain/xai` documents legacy `live_search` only | https://docs.langchain.com/oss/python/integrations/providers/xai , https://www.npmjs.com/package/@langchain/xai |
| LiteLLM | `xai/grok-4.7` | https://docs.litellm.ai/docs/providers/xai |
| Gateways | OpenRouter, Vercel AI Gateway, Cloudflare, Microsoft Foundry, OCI | https://docs.x.ai/developers/grok-4-7 , https://x.ai/news/grok-build-0-1 |
| Grok Build (coding agent) | TUI + headless CLI + Agent Client Protocol; install `curl -fsSL https://x.ai/cli/install.sh \| bash`; headless `grok -p "..." --output-format plain\|json\|streaming-json`, `--always-approve`, `-s/-r/-c` sessions in `~/.grok/sessions`, `grok agent stdio` (ACP JSON-RPC: initialize→authenticate→session/new→session/prompt, text via `session/update`); auth `grok login` or `XAI_API_KEY`; custom models in `~/.grok/config.toml`; skills/plugins/hooks/MCP via `grok inspect`; default model grok-4.7, Grok 4.7 Fast via Cursor/Build plans only; open-sourced Apache-2.0 (Rust) mid-July 2026, external PRs not accepted; free tier exists (limits unpublished), bundled with SuperGrok plans (third-party: $30 / $100 / ~$300) — pricing not on docs.x.ai | https://docs.x.ai/build/overview , https://docs.x.ai/build/cli/headless-scripting , https://simonwillison.net/2026/Jul/15/grok-build/ , https://appwrite.io/blog/post/grok-build-open-source |
| Grok Bot (hosted "AI teammates") | persistent cloud computer (browser/FS/terminal), desktop+mobile apps, routines (schedule ≥5 min apart, ≤50/bot, event triggers from Cursor integrations), skills, group chats, @bot on X; billed via SuperGrok/Cursor plans, usage resets weekly; **no public API** — only a per-routine webhook trigger (bearer POST, no callback) per a developer write-up | https://docs.x.ai/grok-bot/overview , https://docs.x.ai/grok-bot/skills-routines-and-automations , https://dev.to/danmercede/how-i-have-claude-code-control-grok-bot-there-is-no-api-14oh |
| Scheduled / async primitives in the API | none native beyond Batch (≤24 h), deferred chat (24 h), webhooks; no cron/"Tasks" API on docs.x.ai | https://docs.x.ai/developers/advanced-api-usage/batch-api |
| Usage / billing endpoints | `https://management-api.x.ai/v1/billing/teams/{team_id}/usage` (POST, aggregated by fields/time; group by `description` for per-model), `/prepaid/balance`, `/postpaid/invoice/preview`, `/postpaid/spending-limits`, `/invoices`, `/prepaid/top-up`; needs management key | https://docs.x.ai/developers/rest-api-reference/management/billing |

---

## 7. Distribution: X, Telegram, Grok-specific

### 7.1 X API (posting/replying from a bot)

- Model: pay-per-use credits, "no subscriptions"; dedup — same resource twice in 24 h charged once; legacy Basic/Pro closed to new signups (third-party; https://postproxy.dev/blog/x-api-pricing-2026/). Official: https://docs.x.com/x-api/getting-started/about-x-api .
- Official price list (https://docs.x.com/x-api/getting-started/pricing): **create post $0.015**; **post with URL $0.200**; **"create a post when summoned" $0.010**; DM/user interaction create $0.015; delete $0.010; reads: posts $0.005 each, users/DM events/followers $0.010, likes/mutes/blocks $0.001; owned reads $0.001; webhook (Activity API) post creation $0.005, follows/DMs $0.010. Cap: **3M post reads per monthly cycle**, above → Enterprise. Credits: $20 for saving a card, first auto-recharge matched up to $50, and X API spend earns **xAI API credits** (10% at $200–499/cycle, 15% at $500–999, 20% at ≥$1,000).
- Reply restriction (since ~2026-02-23, third-party reporting; no primary page found): replies via `POST /2/tweets` are only allowed when the target post's author mentioned or quoted the app's account ("summoned") — https://fireply.ai/blog/x-api-reply-restriction-2026 , https://piunikaweb.com/2026/02/24/x-api-blocks-automated-spam-replies/ . Consistent with the official "create a post when summoned" price line. Third parties also state AI reply bots need "prior written and explicit approval from X" (https://vorplabs.com/agent-tools/x-api) — the Automation Rules page itself returned 403 to us.
- Developer Policy (official, https://docs.x.com/developer-terms/policy): explicit consent before automated replies/DMs; respect opt-outs; no bulk/spammy actions; no identical content across accounts; bot accounts must "clearly indicate what the account is and who is responsible for it"; no paid engagement; keep X content current and remove within 24 h of removal requests; redistribution limited to IDs (≤1.5M post IDs / 30 days); ≤3 apps per use case.
- Write rate limits per 15 min / 24 h are not on the fetched pages (Open questions).

### 7.2 Grok-specific integrations with X

- `@bot` (Grok Bot) tagging on X: tag `@bot` in a post/reply → forwarded to your own Grok Bot; `@bot` only posts a short confirmation; results stay in the app; not available for accounts in AU, UK, EU, IS, LI, NO; fails if the post also tags `@grok` or contains video/GIF; uses weekly Grok Bot usage. Optional "X for Grok Bot" plugin lets the Bot search posts, read timelines, mentions, trends, bookmarks. Source: https://docs.x.ai/grok-bot/tag-on-x .
- `@grok` mention bot is X's own consumer feature; no developer API documented.
- X Spaces: nothing on docs.x.ai (Open questions).
- Official Telegram bot `@GrokAI` exists for Telegram Premium users; no official Discord bot (third-party, 2026-09-30: https://ntorres.dev/blog/grok-bot-guide).

### 7.3 xAI policy points for bots

- `safety_identifier` lets xAI attribute violations to your end user rather than your whole key (https://docs.x.ai/developers/release-notes Sept 2026).
- AUP (x.ai page returned 403; wiki mirror https://www.platform-policy-wiki.com/platforms/xAI_Acceptable_Use_Policy/ , effective 2025-01-02): "Don't mislead people as to the nature and source of Outputs, including images"; "You should be transparent and disclose your use of AI assistance"; "Don't circumvent safeguards". Enterprise terms bar training models on outputs and presenting outputs as human-made (https://x.ai/legal/terms-of-service-enterprise).
- X Terms (2026-01-15) prohibit jailbreak/prompt-injection circumvention (https://pureai.com/articles/2025/12/22/x-new-terms-ai-prompts.aspx).

---

## 8. What people are building with Grok (2026)

1. **xAI cookbook — X Sentiment Tracker** (TS, merged 2026-10-05): daily `xSearch` over 10 days, grok-4.3 (reasoning none) filters noise, grok-4.7 scores −1..1 via structured output, keeps only cited posts; ~$0.80/run. https://github.com/xai-org/xai-cookbook/tree/main/examples/x-sentiment-tracker , https://github.com/xai-org/xai-cookbook/pull/65
2. **xAI cookbook — Topics to Morning Briefing**: x_search + web_search per topic with `from_date/to_date`, `max_turns`, memory file to skip covered stories, TTS podcast, hard cost cap from `cost_in_usd_ticks`; cron-able. https://github.com/xai-org/xai-cookbook/tree/main/examples/topics-to-morning-briefing
3. **xAI cookbook — X Post to Fact-Check / Company to Call Brief / Refund Agent with Human Approval / Database over MCP / Progressive Tool Disclosure / Phone Voice Agent (Twilio) / WebRTC Voice Agent / Product Photo to Video Ad / Video Dubbing** — 30 examples total. https://github.com/xai-org/xai-cookbook
4. **"Grok Bot Trading Floor: 8-agent crypto desk"** (X article by @ridark_eth) — multiple Grok Bots as a trading desk; page paywalled (HTTP 402) so unverified. https://x.com/ridark_eth/article/2091924787341766859
5. **cupitebet/Grok-Trading** — design doc for a Grok X-sentiment engine (−1..+1 per asset) that deliberately separates retrieval from scoring to detect hallucination. https://github.com/cupitebet/Grok-Trading
6. **sshkeda/grokoquantomachine** — chat app where Grok fetches prices, searches X/news for sentiment, runs backtrader backtests and charts signals. https://github.com/sshkeda/grokoquantomachine
7. **snikkam06/grok-trading-backend** — autonomous equities bot on Alpaca using Grok 4.1 fast reasoning, code-enforced risk management, Supabase memory. https://github.com/snikkam06/grok-trading-backend
8. **DevvGwardo/grok-imagine-video** — OpenClaw skill wrapping Imagine video gen/edit for Discord/Telegram/WhatsApp bots. https://github.com/DevvGwardo/grok-imagine-video
9. **wynandw87/claude-code-grok-mcp** — MCP server exposing Responses+x_search+web_search+code_interpreter+images+video+TTS+STT to Claude Code. https://github.com/wynandw87/claude-code-grok-mcp
10. **Grokathon SF (2026-08-08) winners**: Nova (binary→C decompilation with Grok), Signal (audience graph from followers' bios/posts to A/B test launches — uses X data), ThinkVoice (Grok Voice + brain-sensing). https://x.com/SpaceXAI/status/2088015995810238827 , https://www.basenor.com/blogs/news/xai-grokathon-2026-4-standout-moments-that-reveal-groks-range
11. **LiveKit + Grok voice agents** (official plugin, Python; Node planned). https://livekit.com/blog/xai-livekit-partnership-grok-voice-agent-api

---

## Unique to Grok (vs. OpenAI/Anthropic/Google) — design levers for the harness

1. **Live X firehose as a first-class server tool**: `x_search` with handle allow/deny lists, UTC date windows, keyword+semantic+user+thread sub-searches, optional image/video understanding of posts, priced per post ($5/1k) not per call; citations as `x.com/.../status/` URLs. Nothing comparable exists elsewhere. Benchmarked internally ("X Browse") at 56.3 vs GPT-5 24.2 (https://x.ai/news/grok-4-1-fast).
2. **Exact per-request cost in `usage.cost_in_usd_ticks`** across text/image/video/streaming — enables hard per-run budget caps (cookbook does this).
3. **Stateful Responses + WebSocket mode + `/responses/compact`** = long agent loops with server-held state, sendable only deltas, 25-min sockets, ZDR-compatible.
4. **Multi-agent model** (`grok-4.20-multi-agent-0309`) where `reasoning_effort` picks 4 or 16 parallel agents.
5. **One realtime voice socket that can call `x_search`/`web_search`/`mcp`/functions**, OpenAI-Realtime-compatible, $0.08/min, G.711 passthrough for telephony.
6. **Imagine video API** with image-to-video, reference-to-video with preset voices, keyframes, edit and extend, native 1080p at $0.08/s; batchable.
7. **X API spend earns xAI API credits (10–20%)** and X has a "summoned reply" price tier — the only sanctioned path for a reply bot.
8. **Grok Build headless + ACP** gives a scriptable coding agent runtime; **Grok Bot** gives hosted agents but with no API (webhook trigger only).
9. Caveats unique to Grok: reasoning cannot be turned off on 4.5+ (use grok-4.3 `effort:none` for cheap classification); no batch on flagship models; `x_search` billed per fetched post incl. thread parents so `max_turns` + date/handle filters are the cost controls; flagship has 500k not 1M context.

---

## Open questions / things I could not verify

1. `/developers/tools/tool-search` (404) — the hosted `toolSearch` tool exists in the TS SDK and cookbook, but its request format and pricing are undocumented on docs.x.ai.
2. Max output tokens per model: docs say "No text output limit" for 4.6/4.7 and `max_output_tokens` default 128,000; no hard cap number found for other models.
3. Knowledge cutoffs for grok-4.6, 4.5, 4.3, build-0.1, multi-agent — not published.
4. Streaming event names for `x_search` / `web_search` progress (e.g. `response.output_item.added` with `custom_tool_call`) are not enumerated on docs.x.ai; only the terminal event's `usage` is documented. Verify against a live stream.
5. Whether Chat Completions `search_parameters` (legacy Live Search) is deprecated vs `x_search` — still documented in the chat reference, not in the tools section.
6. Exact Responses `reasoning` output item schema / summary event names for grok-4.7 — only described, not shown.
7. Image-token pricing for vision input (how image tokens are counted) — not on fetched pages.
8. Imagine image `quality` tiers' separate prices (page says "billed at the quality served", table shows only $0.04 for 2.0).
9. Video 1.5 reference-to-video "preset voices" list and `reference_audios` format — not documented on fetched pages.
10. Realtime voice: full event schema and `modalities`, telephony/SIP product (third parties mention an xAI phone number / SIP with Twilio/Telnyx/Plivo — https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents — not on docs.x.ai).
11. Custom voice API is Enterprise-gated; consent/verification rules not stated.
12. Grok Build pricing/free-tier limits and 1.0 release notes — only third-party numbers (SuperGrok $30/$100/$300); docs.x.ai has no pricing page for Build. Open-source repo URL (`xai-org/grok-build`) not fetched directly.
13. Grok Bot: no official API; webhook-trigger request format comes from one developer blog (https://dev.to/danmercede/how-i-have-claude-code-control-grok-bot-there-is-no-api-14oh); community limits (50 bots, 50 routines) unconfirmed except "50 routines per Bot" which is official.
14. X API: official Automation Rules page (help.x.com) returned 403; the Feb-2026 reply restriction and "AI reply bots need written approval" come from third parties; per-15-min write rate limits not captured.
15. x.ai Acceptable Use Policy page returned 403; relied on a policy-wiki mirror dated 2025-12-11.
16. `service_tier: "fast"` appears in the Responses reference but is undocumented elsewhere (possibly Grok 4.7 Fast plumbing, not public).
17. The @ridark_eth "8-agent crypto desk" article is paywalled (402) — listed as an example but unread.
18. LangChain `langchain-xai` support for `x_search`/Responses tools — not found in docs; verify in source before relying on it.
19. "Conversations" API object: not present on docs.x.ai; continuity is `previous_response_id` + `store`, encrypted reasoning items, or compaction.
20. SpaceXSI rename timing: announced, not completed; docs already use the name. Expect SDK/class renames.
