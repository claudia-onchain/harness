# Research notes (verified 2026-10-13 unless marked UNVERIFIED)

## omp / pi UX to emulate (do not copy code)

- **Rendering.** The renderer is differential: components render to string[] lines, only lines that changed are
  rewritten, and each frame is wrapped in synchronized output (`\x1b[?2026h` … `\x1b[?2026l`) to avoid flicker.
  Scrollback stays in the main buffer and style is reset at the end of every line.
- **Keys.** Enter while busy sends a steering message (queued until the tools finish). Alt+Enter queues a
  follow-up. Esc aborts. Shift+Tab cycles the thinking level. Ctrl+P cycles models. Ctrl+L opens the model
  picker. Ctrl+O expands or collapses tool output. Ctrl+T shows or hides thinking. `@` opens a fuzzy file picker.
  `!cmd` runs a shell command and sends its output; `!!cmd` runs it without sending.
- **Slash commands.** /model /thinking /new /resume /session(tokens+cost) /compact /copy /export /skill:name
  /hotkeys /reload /settings.
- **Footer.** It shows cwd · model · context % · tokens · cost. The border colour shows the thinking level. The
  startup header lists what was loaded (persona, skills, plugins, keys).
- **Tool cards.** A tool card has a pending, success or error tint and can be collapsed. Edits show a diff
  preview.
- **Skills.** The format is the Agent Skills spec: a `SKILL.md` with frontmatter `name` (a-z0-9-, ≤64 chars),
  `description` (≤1024 chars: what it does and when to use it), and optionally `license` and `metadata`. Only the
  name and description go into the system prompt; the body loads on demand. Discovery covers `~/.agents/skills`,
  `.agents/skills`, `~/.claude/skills` and `.claude/skills`.

## LLM APIs

- **Anthropic**
  - Request: `POST https://api.anthropic.com/v1/messages` with headers `x-api-key` and
    `anthropic-version: 2023-06-01`.
  - Models: `claude-opus-5-5` (default, $4/$20), `claude-sonnet-5-5` ($2/$10), `claude-haiku-5-5`
    ($0.10/$0.50), `claude-fable-5-1` ($10/$50). All have a 1M context and 128k max output. Thinking is adaptive
    and uses `effort`; manual `budget_tokens` is not accepted.
  - SSE order: message_start → content_block_start/delta/stop → message_delta (stop_reason, usage) →
    message_stop. Also ping and error. Deltas: text_delta, input_json_delta, thinking_delta, signature_delta.
    Ignore unknown events.
  - Use `cache_control: {type:"ephemeral"}` on the system prompt and the last tool.
- **OpenAI**
  - Models: `gpt-6-astra` (top), `gpt-6.1-sol` (balanced), `gpt-6-luna` (cheap). Images:
    `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`. TTS: `gpt-4o-mini-tts`.
  - Responses API: `POST /v1/responses`.
    - Tools are `{type:"function",name,description,parameters,strict}`.
    - A call comes back as an item `{type:"function_call",call_id,name,arguments}`. Send the result back as
      `{type:"function_call_output",call_id,output}`.
    - Stream events: response.output_text.delta, response.output_item.added,
      response.function_call_arguments.delta/done, response.output_item.done, response.completed, error.
  - Chat Completions also works and is the simplest shared path.
- **xAI**
  - Base `https://api.x.ai/v1` with a Bearer key; it is OpenAI-compatible (chat/completions and responses).
  - Models: `grok-4.7` (default, 500k), `grok-4.3` (1M, cheap), `grok-build-0.1`.
  - Images: `POST /v1/images/generations {model:"grok-imagine-image-2.0",prompt}` → `data[0].url`.
  - Video: `POST /v1/videos/generations {model:"grok-imagine-video-1.5",prompt,image?,duration}`, then poll
    `GET /v1/videos/{request_id}` until status "done" and read `video.url`.
- **OpenRouter**
  - Request: `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI format) with a Bearer key. Optional
    headers `HTTP-Referer` and `X-OpenRouter-Title` (`X-Title` is also accepted).
  - SSE may contain `:` comment lines; ignore them. Usage, including `cost`, arrives in the final chunk.
  - Model IDs use dots, e.g. `anthropic/claude-opus-5.5`, `openai/gpt-6-astra`, `x-ai/grok-4.7`,
    `google/gemini-3.8-flash`. The model list is `GET /api/v1/models`.
- **Gemini** has an OpenAI-compatible endpoint at `https://generativelanguage.googleapis.com/v1beta/openai`.
  Ollama runs at `http://127.0.0.1:11434/v1` and LM Studio at `:1234/v1` (both OpenAI-compatible).

## Media

### OpenRouter (one key for everything)

- **Image, dedicated route.**
  - Request: `POST /api/v1/images {model, prompt, n, resolution:"1K|2K|4K", aspect_ratio, input_references, seed}`.
  - Response: `{data:[{b64_json, media_type}], usage:{cost}}`.
  - Models: `GET /api/v1/images/models`, e.g. `openai/gpt-image-2.5-sunburst`, `black-forest-labs/flux-3-image`,
    `bytedance-seed/seedream-5-0-pro`, `x-ai/grok-imagine-image-2.0`, `google/gemini-nano-banana-2.1`.
- **Image, chat route.**
  - Request: chat completions with `modalities:["image","text"]`.
  - Response: the image is at `choices[0].message.images[].image_url.url` as a data URL.
  - Models: `google/gemini-3.1-flash-image`, `google/gemini-3-pro-image`.
- **Video (async).**
  - Submit: `POST /api/v1/videos {model, prompt, duration, resolution, aspect_ratio, frame_images, generate_audio}`.
    Returns 202 `{id, polling_url}`.
  - Poll: `GET /api/v1/videos/{id}` until status is `completed` (or `failed`).
  - Download: `GET /api/v1/videos/{id}/content?index=0` with the auth header.
  - Models: `google/veo-3.1`, `google/veo-3.1-fast`, `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.5`,
    `minimax/hailuo-3`, `x-ai/grok-imagine-video-1.5`.
- **TTS.**
  - Request: `POST /api/v1/audio/speech {model, input, voice, response_format:"mp3"}`. Returns raw audio bytes.
  - Models: `openai/gpt-4o-mini-tts-2025-12-15`, `elevenlabs/eleven-v3`, `google/gemini-3.8-flash-tts`,
    `hexgrad/kokoro-82m`.
- **Music.** Models `google/lyria-3-pro-preview` and `google/lyria-3-clip-preview` via chat with
  `modalities:["text","audio"]`; the audio comes back base64 in `message.audio.data`. The exact request is
  UNVERIFIED, so handle failures gracefully.

### Direct providers

- **OpenAI images:** `POST /v1/images/generations {model, prompt, size, quality, background, output_format}` →
  `data[].b64_json`.
- **OpenAI TTS:** `POST /v1/audio/speech {model:"gpt-4o-mini-tts", input, voice:"marin", response_format:"mp3"}`.
- **fal:**
  - Submit: `POST https://queue.fal.run/{model_id}` with header `Authorization: Key $FAL_KEY`. Returns
    `{request_id, status_url, response_url}`.
  - Poll the status URL until COMPLETED, then GET the response URL.
- **ElevenLabs:**
  - TTS: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128` with header
    `xi-api-key` and body `{text, model_id}`.
  - Music: `POST /v1/music {prompt, music_length_ms}`.
- **`@useclaudia/media` (npm, 0.3.0)** is an optional extra backend.
  - Usage: `createMedia({keys:{get(name)}, dataDir})`, then `.generate({kind,prompt,model?,aspect?,durationSec?}, {approve:true})`,
    `.wait(id)`, `.models({kind})`, `.estimate(req)`.
  - Key names: google, openai, fal, elevenlabs, heygen, runway, byteplus.
  - Kinds: image, video, speech, music, sfx, avatar.

## Chains

- **Alchemy**
  - RPC: `https://{slug}.g.alchemy.com/v2/{KEY}`. The slugs are in `src/chains/registry.js`.
  - `alchemy_getTokenBalances [addr,"erc20"]` → `{tokenBalances:[{contractAddress, tokenBalance(hex)}]}`.
  - `alchemy_getTokenMetadata [contract]` → `{name, symbol, decimals, logo}`.
  - `alchemy_getAssetTransfers [{fromBlock:"0x0", toBlock:"latest", fromAddress|toAddress, category:["external","erc20","erc721","erc1155"], withMetadata:true, maxCount:"0x14", order:"desc"}]`.
  - NFTs: `GET https://{slug}.g.alchemy.com/nft/v3/{KEY}/getNFTsForOwner?owner=&withMetadata=true&pageSize=50&excludeFilters[]=SPAM`.
  - Prices: `GET https://api.g.alchemy.com/prices/v1/{KEY}/tokens/by-symbol?symbols=ETH&symbols=BTC` →
    `{data:[{symbol, prices:[{currency:"usd", value}]}]}`.
- **Chainlink**
  - `latestRoundData()` selector `0xfeaf968c` returns (uint80 roundId, int256 answer, uint256 startedAt,
    uint256 updatedAt, uint80 answeredInRound). `decimals()` is `0x313ce567` and `description()` is
    `0x7284e416`.
  - Feed directory: `https://reference-data-directory.vercel.app/feeds-{chain.chainlink}.json`. Entries are
    `{name, path, proxyAddress, secondaryProxyAddress, decimals, heartbeat, feedCategory}`.
  - Duplicate SVR variants exist, so prefer the entry with `path === "eth-usd"` and treat
    `secondaryProxyAddress` as the standard proxy when present (Base). Verified addresses are in
    `CHAINLINK_FEEDS`.
  - CCIP: `ccipSend(destChainSelector, {receiver, data, tokenAmounts, feeToken, extraArgs})` with the fee from
    `getFee()`. The Ethereum selector is 5009297550715157269. Docs: https://docs.chain.link/ccip/directory/mainnet
- **Etherscan V2:** `https://api.etherscan.io/v2/api?chainid={id}&module=account&action=balance&address=&tag=latest&apikey=`
  (one key covers 60+ chains; some L2s are paid only). Also `module=contract&action=getabi|getsourcecode` and
  `module=account&action=txlist`.
- **DefiLlama (free):** `GET https://coins.llama.fi/prices/current/coingecko:ethereum,base:0xTOKEN` →
  `{coins:{key:{price,symbol,decimals,timestamp,confidence}}}`. Also `api.llama.fi/protocols`, `/v2/chains` and
  `yields.llama.fi/pools`.
- **CoinGecko:** `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`.
  The optional header is `x-cg-demo-api-key`.
- **Jupiter (Solana)**
  - Price: `GET https://api.jup.ag/price/v3?ids=<mints>` → `{mint:{usdPrice, priceChange24h}}`. Works keyless at
    0.5 RPS; with a key, send header `x-api-key`.
  - Swap: `GET https://api.jup.ag/swap/v2/order?inputMint&outputMint&amount&taker` → `{transaction(b64), requestId, outAmount}`,
    then `POST /swap/v2/execute {signedTransaction, requestId}`.
  - Token search: `/tokens/v2/search?query=`.
- **0x:** `GET https://api.0x.org/swap/allowance-holder/price?chainId&sellToken&buyToken&sellAmount` with headers
  `0x-api-key` and `0x-version: v2` (use `/quote` for a firm quote).
- **LI.FI (bridges and swaps, keyless works):** `GET https://li.quest/v1/quote?fromChain&toChain&fromToken&toToken&fromAmount&fromAddress&slippage=0.005`.
- **Helius (Solana RPC):** `https://mainnet.helius-rpc.com/?api-key=KEY`.
- **Other RPC providers:** Infura `https://{net}.infura.io/v3/KEY` and Ankr `https://rpc.ankr.com/{chain}/KEY`
  (both UNVERIFIED shapes).
- **Robinhood Chain and Solana coin data:** use `@useclaudia/sdk` `ClaudiaClient` (public reads, no key):
  `insights.token(key)`, `insights.trending({chain})` and `search(q)`, where `toTokenKey()` produces keys like
  "sol:<mint>" or "hood:0x…".

## macOS screen ("show me")

- `native/macos/overlay.js` is a tested JXA script: a borderless, transparent, click-through window at
  screen-saver level that draws a box and a label, then closes after N seconds. Run it with
  `osascript -l JavaScript overlay.js X Y W H SECONDS [LABEL]` (top-left coordinates).
  - It needs extending: multiple markers in one window covering the full screen, arrows and circles, a fade-in,
    and a pulse.
- `native/macos/winlist.js` is a tested JXA script using CGWindowListCopyWindowInfo. It returns
  `[{app,title,layer,pid,id,X,Y,Width,Height}]`. Bounds need no permission; titles need Screen Recording.
- Open things with `open -a "App"`, `open URL` or `open -b bundle.id`. Bring an app to the front with
  `osascript -e 'tell application "X" to activate'`.
- Take a screenshot with `screencapture -x -R x,y,w,h out.png` or `-l <windowId>` (needs Screen Recording); it
  can feed vision models.
- Accessibility (System Events UI scripting: menus, buttons) needs the Accessibility permission. Detect when it is
  missing and explain how to grant it.
- On Linux and Windows, report unsupported and degrade gracefully.

## npm update check

- `GET https://registry.npmjs.org/<pkg>/latest` returns the package.json; read `version` (scoped names work
  unencoded).
- Cache `{checkedAt, results}` in `~/.lumen/update.json` and check at most every 24 h, with a 1.5 s timeout, in
  the background. Skip when `CI` or `LUMEN_NO_UPDATE_CHECK` is set.
- Packages to check: `@useclaudia/sdk`, `@useclaudia/media`, `@useclaudia/social` (all currently 0.3.0), plus
  `lumen-agent` itself (a 404 means unpublished, so skip it quietly).
- Install with `npm install <pkg>@latest` inside the Lumen install directory.

## Browser libraries for the dashboard (latest on npm today)

- `tone` 15.1.22
- `wavesurfer.js` 8.0.2
- `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/util` 0.12.2, `@ffmpeg/core` 0.12.10 (single-thread core; serve it locally
  rather than from a CDN)
- `mediabunny` 1.61.4
- `konva` 10.8.0 with `react-konva` 19.3.0
- `fabric` 7.4.0
- `@dnd-kit/core` 6.3.1
