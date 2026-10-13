# Server ⇄ dashboard contract

The server (builder A, `src/server/`) and the dashboard (builder B, `dashboard/`) talk ONLY through this
contract. If you need something that isn't here, add it to this file in the same change. Keep both sides in sync.

## Base

- The default URL is `http://127.0.0.1:4747`. Override it with `LUMEN_PORT`.
- The dashboard is served from `dashboard/dist` with an SPA fallback. The dev server is Vite on 5174, which
  proxies `/api` and `/ws` to 4747.
- Auth:
  - `lumen dashboard` opens `http://127.0.0.1:4747/?t=<token>`.
  - `GET /?t=` sets the HttpOnly SameSite=Strict cookie `lumen_session` and redirects to `/`.
  - Every `/api/*` route and `/ws` needs the cookie. In dev, the header `x-lumen-token` also works.
  - A 401 means the dashboard shows "Open from the CLI: `lumen dashboard`".
- JSON everywhere. Errors use the shape `{ error: { code, message } }` with a 4xx or 5xx status.
- Keys are never returned raw, only masked: `"sk-…a1b2"`.

## REST

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok, version, uptime }` (no auth) |
| GET | `/api/state` | – | `{ version, persona: {id, name}, model: {provider, id}, providers: ProviderStatus[], chains: number, skills: {base, chain, user}, updates: UpdateInfo[], platform, screen: {supported} }` |
| GET | `/api/providers` | – | `ProviderStatus[]` = `{ id, name, kind: "llm"\|"media"\|"chain"\|"data"\|"social", configured, masked?, env, docs, fields: [{id,label,placeholder}] }` |
| PUT | `/api/keys` | `{ [fieldId]: string \| null }` | `{ ok, providers: ProviderStatus[] }` (null deletes) |
| POST | `/api/keys/test` | `{ provider }` | `{ ok, message }` |
| GET | `/api/models` | `?provider=` | `{ provider, models: [{ id, name, context?, vision?, tools?, price? }] }` |
| PUT | `/api/model` | `{ provider, id }` | `{ ok }` |
| GET | `/api/personas` | – | `[{ id, name, summary, active }]` |
| PUT | `/api/persona` | `{ id }` | `{ ok }` |
| GET | `/api/sessions` | – | `[{ id, title, updated, messages }]` |
| GET | `/api/sessions/:id` | – | `{ id, title, items: TimelineItem[] }` |
| GET | `/api/chains` | `?testnets=1` | `Chain[]` (registry entries plus `rpcSource: "alchemy"\|"public"`) |
| GET | `/api/chains/:id/status` | – | `{ id, blockNumber, gasPriceGwei?, latencyMs, rpcSource }` |
| GET | `/api/price` | `?symbol=ETH&chain=base` or `?token=0x..&chain=base` | `{ symbol, usd, source: "chainlink"\|"defillama"\|"coingecko"\|"alchemy", updatedAt }` |
| GET | `/api/balance` | `?address=&chain=` | `{ chain, address, native: {symbol, amount, usd?}, tokens: [{ address, symbol, amount, usd? }] }` |
| GET | `/api/skills` | `?chain=&q=` | `[{ slug, name, title, description, category, source: "base"\|"chain"\|"user", chain? }]` |
| GET | `/api/skills/:slug` | – | `{ slug, markdown, files: string[] }` |
| GET | `/api/media` | – | `MediaJob[]` |
| POST | `/api/media/generate` | `{ kind: "image"\|"video"\|"speech"\|"music"\|"sfx", prompt, model?, aspect?, durationSec?, voice?, refs?: string[] }` | `MediaJob` |
| GET | `/api/media/:id` | – | `MediaJob` |
| GET | `/api/files/media/*` | – | the raw file (images, video and audio from `~/.lumen/media/`), supports Range |
| POST | `/api/uploads` | raw body, header `x-filename` | `{ path, url }` (saved to `~/.lumen/uploads/`) |
| GET | `/api/plugins` | – | `[{ id, name, kind: "tool"\|"dashboard", version, enabled, entry? }]`. Dashboard plugins have `entry` (an ES module URL under `/api/plugins/:id/entry.js`) |
| PUT | `/api/plugins/:id` | `{ enabled }` | `{ ok }` |
| GET | `/api/updates` | `?force=1` | `UpdateInfo[]` = `{ name, current, latest, outdated, command }` |
| POST | `/api/updates/install` | `{ names?: string[] }` | `{ ok, log }` |
| POST | `/api/screen/show` | `{ app?, url?, markers?: Marker[], seconds? }` | `{ ok }` (macOS only) |
| GET | `/api/approvals` | – | `Approval[]` |
| POST | `/api/approvals/:id` | `{ approve: boolean }` | `{ ok }` |

Types:

- `MediaJob`: `{ id, kind, status: "queued"\|"running"\|"done"\|"failed"\|"awaiting_approval", provider, model, prompt, createdAt, outputs: [{ url, mime, path }], error?, costUsd? }`
- `Marker`: `{ x, y, w, h, label?, color?, shape?: "box"\|"arrow"\|"circle", relativeTo?: "screen"\|"window" }`
- `Approval`: `{ id, kind: "tx"\|"shell"\|"media"\|"write"\|"question", title, detail, createdAt, options? }`

## WebSocket `/ws`

Every frame is a JSON object with a `type` field. One socket carries chat, agent activity and the takeover
channel.

### Dashboard → server

| type | fields | meaning |
|---|---|---|
| `hello` | `{ client: "dashboard", version }` | sent on open |
| `chat` | `{ sessionId?, text, images?: string[] /*data urls or upload urls*/, attachments?: string[] }` | user message |
| `stop` | `{ sessionId }` | abort the current turn |
| `approval` | `{ id, approve, answer? }` | answer an approval or question |
| `ui_hello` | `{ route, targets: UiTarget[], commands: UiCommand[] }` | sent on open and after every route change: what the agent can drive right now |
| `ui_result` | `{ id, ok, result?, error? }` | the result of a `ui` op from the server |
| `ping` | – | keepalive |

`UiTarget` = `{ id, label, role: "button"|"input"|"slider"|"tab"|"canvas"|"track"|"knob"|"list"|"panel", route, value? }`.
It is discovered from every visible element with `data-agent-id`, using `data-agent-label` and `data-agent-role`.

`UiCommand` = `{ name, description, params: JSONSchema }`. These are app-level commands each studio registers,
for example:
- `nav.go {route}`
- `image.generate {prompt}`
- `photo.filter {name, amount}`
- `photo.crop {x,y,w,h}`
- `video.addClip {src, track, at}`
- `video.trim {clipId, start, end}`
- `video.export {}`
- `music.setTempo {bpm}`
- `music.setPattern {track, steps}`
- `music.addNote {pitch, at, dur}`
- `music.play {}` / `music.stop {}`
- `synth.set {param, value}`
- `audio.load {url}`
- `audio.cut {start, end}`
- `mixer.set {channel, gain}`

### Server → dashboard

| type | fields | meaning |
|---|---|---|
| `ready` | `{ sessionId, state }` | after `hello` |
| `user` | `{ sessionId, id, text, source: "cli"\|"dashboard"\|"telegram" }` | echo of any user message (the CLI's messages show up live in the dashboard) |
| `thinking` | `{ sessionId, delta }` | reasoning stream (shown collapsed) |
| `delta` | `{ sessionId, id, text }` | assistant text stream |
| `tool_start` | `{ sessionId, callId, name, args, label }` | |
| `tool_end` | `{ sessionId, callId, ok, summary, result? }` | the result is truncated to 4k |
| `turn_done` | `{ sessionId, usage: { input, output, costUsd }, model }` | |
| `error` | `{ sessionId?, message }` | |
| `approval_request` | `Approval` | |
| `media_job` | `MediaJob` | on every status change |
| `notice` | `{ level: "info"\|"warn", text }` | for example update available |
| `agent_status` | `{ state: "idle"\|"thinking"\|"tool"\|"driving", detail? }` | drives the global activity animation |
| `ui` | `{ id, op: "takeover_start"\|"takeover_end"\|"move"\|"click"\|"type"\|"drag"\|"highlight"\|"scroll"\|"command"\|"navigate"\|"snapshot", target?, to?, text?, value?, name?, args?, route?, note? }` | takeover channel (below) |

### Takeover channel

The agent tool `dashboard` (builder A) sends `ui` ops. The dashboard (builder B) runs them with visible
animation, then answers with `ui_result {id, ok, result}`. The server waits up to 15 s for each result.

- `takeover_start {note}`: show the "Lumen is driving" banner and a glowing frame. User input is dimmed but not
  blocked. If the user presses Esc or clicks "Take back", the dashboard sends `{type:"stop"}` and answers
  pending ops with `ok:false, error:"user_took_over"`.
- `navigate {route}`: the ghost cursor glides to the matching sidebar item, clicks it and routes.
- `move {target}`, `click {target}`, `type {target, text}` (types character by character, about 25 ms each),
  `drag {target, to}`, `scroll {target, value}`, `highlight {target, note}` (pulsing ring plus a callout).
  - `target` is a `data-agent-id`.
  - The cursor eases along a curved path over 350–700 ms with a trail. Clicks show a ripple.
- `command {name, args}`: the cursor moves to the panel that owns the command, then the command runs. The result
  is returned, for example `{clipId}` or `{exportUrl}`.
- `snapshot {}`: returns `{ route, targets, commands, summary }`, where `summary` is a short text description of
  the current studio state (tracks, clips, layers, tempo...).
- `takeover_end {}`: hide the banner.

### Dashboard targets and commands (as implemented)

These are additions; everything above still holds. Always call `snapshot` first and use what it returns.

- **Target ids.**
  - Sidebar items are `nav:<route>`, for example `nav:/studio/music`. `navigate` glides to one, clicks it, and
    waits until the route has rendered.
  - Studio controls use `<studio>.<thing>`, for example `music.play`, `music.tempo`,
    `music.step.<kick|snare|hat|clap|perc|sampler>.<0-15>`, `synth.cutoff`, `mixer.drums.gain`,
    `photo.preset.<name>`, `photo.tool.<tool>`, `video.track.<V1|V2|T1|C1|A1>`, `video.media.<id>`,
    `video.clip.<id>`, `chat.input` and `chat.send`.
  - Every visible `[data-agent-id]` is listed in `ui_hello.targets` and `snapshot.targets`.
- **Values.**
  - `type {target, text}` types character by character.
  - `type {target, value}` with no `text` sets a slider, select or knob directly. Knobs listen for an `agent-set`
    event.
- **`drag {target, to}`** dispatches real HTML5 drag events (dragstart, dragover, drop) with a shared
  DataTransfer, plus pointer events. For example, it can drag `video.media.<id>` onto `video.track.V1`.
- **Command auto-navigation.** If a command's studio is not mounted, the runner first navigates to its route, then
  runs the command. The route is chosen by command prefix:

  | Prefix | Route |
  |---|---|
  | `image.` | /studio/image |
  | `photo.` | /studio/photo |
  | `video.` | /studio/video |
  | `music.`, `synth.`, `mixer.`, `fx.` | /studio/music |
  | `audio.` | /studio/audio |

- **Extra commands, beyond the list above.**
  - Image: `image.toPhoto`.
  - Photo:
    - `photo.open {url}`
    - `photo.demoImage`
    - `photo.reset`
    - `photo.addText {text,x?,y?,size?,color?}`
    - `photo.addShape`
    - `photo.tool`
    - `photo.undo`, `photo.redo`
    - `photo.export {format: png|jpeg}`
    - `photo.sendToVideo`
  - Photo filters: `photo.filter {name, amount}` accepts brightness, contrast, saturation, hue, blur, sharpen,
    vignette, or a look preset (none, teal-orange, noir, vintage, warm, cool, fade, vivid, neon).
  - Video:
    - `video.import {url, kind?}`
    - `video.split {clipId?, at?}`
    - `video.addText {text,start?,end?}`
    - `video.addCaption {text,start,end}`
    - `video.fade {clipId,in?,out?}`
    - `video.remove`
    - `video.seek {t}`
    - `video.play`, `video.stop`
    - `video.aspect`
    - `video.export {format?: mp4|webm}` returns `{exportUrl, name, via}`.
  - Music:
    - `music.setSwing`
    - `music.clearNotes`
    - `music.clear`
    - `music.preset {name}`
    - `music.export` renders a WAV.
    - `music.addNote` takes `pitch` as a MIDI number or a name like "C4", `at` as a step from 0 to 31, and `dur`
      in steps.
  - Effects: `fx.set {channel?, effect, value}`. Effects are distortion, chorus, delay, reverb and compressor.
  - Audio:
    - `audio.select {start,end}`
    - `audio.trim`
    - `audio.fade {in?, out?}`
    - `audio.normalize {targetDb?}`
    - `audio.gain {db}`
    - `audio.tts {text, voice?}`
    - `audio.play`
    - `audio.export`
  - Other pages: `chat.send {text}`, `chains.select {id}`, `skills.open {slug}`, `skills.search {q}`.
- **Takeover from the user's side.**
  - While a takeover is active, Esc or "Take back" sends `{type:"stop", sessionId}`.
  - Every queued or running op is then answered `ok:false, error:"user_took_over"`.

### Server additions (builder A, as implemented)

These extend the contract above; nothing above changed.

- **Auth details.** The cookie value is the per-run token. `x-lumen-token: <token>` works on every `/api/*` route
  and on the `/ws` upgrade. Hosts `127.0.0.1|localhost` on the server port and on the Vite dev port 5174 are
  accepted. A `/ws` upgrade without auth gets `401`. `GET /?t=<stale token>` returns 401 JSON.
- **Approval** also carries `confirmText?: "send"` (mainnet money moves: the human must type it; send it back as
  `{type:"approval", id, approve:true, answer:"send"}`, anything else declines) and `sessionId?`.
- **Uploads.** `POST /api/uploads` returns `url: "/api/files/uploads/<name>"`; `GET /api/files/uploads/*` serves it
  (Range supported). Upload URLs and `/api/files/media/*` URLs can be passed back as `chat.images` /
  `media.generate.refs`; the server turns them into data URLs for the model.
- **Settings.** `GET /api/config` → `{ chain, thinking, approvalMode, maxRounds, wallet: {maxUsdPerTx, maxUsdPerDay},
  media: {approveAboveUsd, open}, persona, tools, ui, search }`. `PUT /api/config` with any of those keys →
  `{ ok, config }` (`approvalMode` ∈ always-ask|write|yolo; money moves always ask regardless).
- **Tools.** `GET /api/tools` → `[{ name, group, label, description, enabled, approval }]`.
- **State** additionally has `chain`, `thinking`, `approvalMode`, `sessionId`.
- **PUT /api/keys** accepts aliases: `wallet` (EVM wallet key), `wallet-solana`, `0x`, `google`, `grok`.
- **MediaJob** may also have `updatedAt`. `kind: "sfx"` is supported (ElevenLabs / @useclaudia/media).
- **Marker.** `shape: "arrow"` is drawn from `(x, y)` to `(x + w, y + h)`. When `app` is given and `relativeTo` is
  omitted, coordinates are relative to that app's front window.
- **TimelineItem** (`GET /api/sessions/:id` → `items`): `{ ts, type: "user", id, text, source }`,
  `{ ts, type: "assistant", id, text }`, `{ ts, type: "thinking", text }`,
  `{ ts, type: "tool", phase?: "start", callId, name, args?, ok?, summary? }` (a `start` row, then a result row),
  `{ ts, type: "error", text }`.
- **Extra server → dashboard frames** (ignore if unused): `session {sessionId, title, resumed?}`,
  `assistant_done {sessionId, id, text}` (full text of a finished assistant message), `todo {sessionId, items:[{text,
  status: pending|active|done}]}`, `model {model}`, `persona {persona}`, `chain {chain}`, `thinking_level {level}`,
  `pong {t}`. `user.source` may also be `"steer"` (a message queued while the agent was busy). `tool_start` /
  `tool_end` from a helper agent carry `helper: "<role>"`; `tool_end` also has `name`. `error` may carry `status`.
- **Takeover from the agent's side.** The `dashboard` tool accepts `action` (alias `op`) and forwards
  `{route, target, to, text, value, note, name, args}` unchanged in the `ui` frame. Without a connected dashboard it
  opens the browser and waits up to ~10 s for `ui_hello`. A `snapshot` that times out falls back to the last
  `ui_hello` payload. While ops run the server emits `agent_status {state:"driving", detail: op}`.

## Events the CLI renders

The CLI TUI uses the same internal agent events (A's `src/agent/` emits them; the server just forwards them).
A message typed in the dashboard appears in the CLI if the CLI session is attached, and vice versa.
