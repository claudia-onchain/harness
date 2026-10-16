# Lumen — build plan

Lumen is a bring-your-own-keys terminal agent with a local web dashboard. It is an original take on the
oh-my-pi (`omp`) experience: a sleek, flicker-free chat TUI with tools, skills and model cycling.
On top of that it adds:

- **Multi-chain crypto.** Every chain in `src/chains/registry.js` (40+ EVM chains plus Solana, Bitcoin, Sui,
  Aptos, TRON and Starknet) through Alchemy, public RPCs, Chainlink feeds, DefiLlama/CoinGecko prices, Etherscan
  V2, Jupiter, 0x and LI.FI.
- **Media generation.** Images, video, speech and music through OpenRouter, OpenAI, xAI and
  `@useclaudia/media` (Google, fal, ElevenLabs, ...).
- **"Show me" on screen.** On macOS it opens apps and URLs, finds window bounds and draws transparent
  click-through markers, highlight boxes, arrows and labels on top of any app.
- **A creative dashboard.** Chat, an Image/Photo editor, a Video editor (drag-and-drop timeline), a Music studio
  (synths, step sequencer, piano roll, mixer, effects), an Audio editor, Chains, Skills, Plugins, Keys and
  Settings. The agent can **take over** the dashboard: a live ghost cursor moves, clicks, drags and types while
  it works.
- **Skills.** 100 base skills plus 20 per-chain skill templates, rendered for every chain at runtime. Skills from
  the user's own skill folders are discovered too.
- **Personas.** The agent runs as a chosen persona prompt (who it is). The default is "Lumen". Users can add their
  own in `~/.lumen/personas/*.md`.
- **Update reminders.** Lumen depends on `@useclaudia/sdk`, `@useclaudia/media` and `@useclaudia/social` from npm.
  Once a day it checks the npm registry for newer versions of these and of Lumen itself. It reminds the user at
  boot, in `/doctor` and on the dashboard. `lumen update` installs them.
- **Claudia Local connector.** This appears as a "coming later" placeholder only. Do not implement it.

Users must add their own keys. At least one LLM key is required: Anthropic, OpenAI, xAI (Grok), OpenRouter or
Gemini. A local Ollama or LM Studio also works. Crypto and media features unlock as keys are added
(Alchemy, Etherscan, OpenRouter, fal, ElevenLabs, ...).

## Hard rules

- Node >= 22, ESM, plain JavaScript in the CLI and server (no TS build step). The dashboard is React 19 +
  Vite + TypeScript with its own `dashboard/package.json`.
- Keep the CLI's dependencies small. Allowed: `ws`, `viem`, `@useclaudia/sdk`, `@useclaudia/media`,
  `@useclaudia/social`. Ask the lead before adding anything else.
- Local only. The server binds to 127.0.0.1. Use Host and Origin checks plus a random session token for the
  dashboard (the URL contains `?t=<token>`, which is then set as a cookie).
- Keys live in `~/.lumen/keys.json` (mode 0600). Env vars override the file. Optional passphrase encryption uses
  scrypt + AES-256-GCM. Never print a full key; mask it to the last 4 characters.
- Money safety:
  - Chain tools are read-only by default.
  - Anything that signs or sends needs a configured wallet key, a simulated preview, per-tx and per-day caps,
    and an explicit human "yes" in the CLI or dashboard.
  - The agent can never self-approve.
- Outside content (web pages, token names, tx memos, files the user didn't write) is wrapped as untrusted data.
  It is never followed as instructions.
- No pushing to GitHub. The user pushes manually.
- Never modify `../../claudia-local`, `../../claudia-skills` or `../../claudia-NPM`. Read them for ideas only.
  Claudia-skills is MIT, so adapted skill text must keep attribution in `skills/NOTICE.md`.

## Layout and ownership

```
harness/lumen/
  package.json            [A] name "lumen-agent", bin { lumen: bin/lumen.js }
  bin/lumen.js            [A]
  src/
    chains/registry.js    [lead] shared chain data — A may add fields, never rename existing ones
    chains/*.js           [A] rpc, alchemy, chainlink, prices, evm, solana, explorers, swaps (quotes)
    core/                 [A] paths, config, keys(vault), update-check, persona, sessions, untrusted, log
    llm/                  [A] anthropic, openai (responses + chat), openai-compatible (xai, openrouter, gemini, ollama), registry, pricing
    agent/                [A] loop, tool registry, tools/*.js, sub-agents
    media/                [A] openrouter (image/video/tts/music), openai, xai, claudia-media bridge, job store
    screen/               [A] macos overlay + window list + open + screenshot (wraps native/macos/*.js JXA)
    skills/               [A] loader: discovers skills/base/*, renders skills/chain-templates/* per chain, user dirs
    plugins/              [A] plugin loader (~/.lumen/plugins/*.js: tools + slash commands)
    server/               [A] http + ws server implementing docs/CONTRACT.md, serves dashboard/dist
    tui/                  [A] renderer, input editor, theme, markdown, tool cards, footer, boot animation
  personas/*.md           [A] lumen (default), builder, researcher, creative-director, chain-analyst
  native/macos/*.js       [A] JXA overlay/window scripts (overlay.js and winlist.js are tested starting points)
  skills/                 [B] base/<slug>/SKILL.md x100, chain-templates/<slug>.md x20, NOTICE.md, README.md
  dashboard/              [B] React + Vite + TS app (own package.json) -> dashboard/dist
  docs/                   [lead] PLAN.md, CONTRACT.md, RESEARCH.md
```

A = core builder (CLI, agent, server, chains, media, screen). B = dashboard and skills builder.

## Definition of done

- `npm install && npm run build` works from a clean checkout (the build also builds the dashboard).
- `node bin/lumen.js`:
  - Plays the boot animation.
  - Runs health checks (keys, providers, chains, skill count, update check).
  - Opens the chat. With no LLM key it walks the user through adding one.
- `lumen -p "..."` gives a non-interactive answer. `lumen doctor`, `lumen keys`, `lumen chains`,
  `lumen price ETH --chain base`, `lumen balance <addr> --chain base`, `lumen gen image "..."`,
  `lumen show "Safari"`, `lumen dashboard`, `lumen skills`, `lumen update` all work.
- `npm run check` passes: `node --check` on every file, the dashboard `tsc`, and the skill validator.
- `npm test` runs offline unit tests (node:test) covering:
  - the providers' SSE parsing
  - tool loop with a mock model
  - chain registry, Chainlink ABI decode, skill rendering (counts: >= 100 base, 20 x chains)
  - update-check semver
  - server auth
