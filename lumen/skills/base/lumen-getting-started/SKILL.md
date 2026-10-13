---
name: lumen-getting-started
description: "First-run guide for Lumen, the bring-your-own-keys terminal agent with a local creative dashboard. Use when someone asks \"how do I start lumen\", \"set up lumen\", \"add my API key\", \"what can lumen do\", \"first steps\", or opens Lumen with no LLM key configured. Covers install, the first LLM key, health checks, the chat TUI, one-shot mode, the dashboard and where files live."
license: MIT
metadata:
  title: "Getting started with Lumen"
  category: "lumen"
  level: "beginner"
  tags: "lumen, onboarding, setup, keys, tui, dashboard, first run"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Getting started with Lumen

Lumen is a terminal agent that runs on your own keys: chat in a flicker-free TUI, call multi-chain crypto tools,
generate media, point at things on your screen and drive a local creative dashboard. Nothing works until one LLM
key is set, and every extra key (Alchemy, Etherscan, OpenRouter...) unlocks more tools. Start with one LLM key,
run `lumen doctor`, then add keys only for the features you actually use.

## When to use

- "How do I set up / start Lumen?" or a fresh install with no keys
- "What can Lumen do?" or "which keys do I need?"
- The boot screen says no LLM provider is configured
- Someone wants a quick tour of the TUI keys and slash commands
- Handing Lumen to a new teammate

## Steps

1. **Check Node and install.** Lumen needs Node 22 or newer (`node -v`). From a checkout run
   `npm install && npm run build` (the build also builds the dashboard), then start it with `node bin/lumen.js`
   or the `lumen` bin once linked.
2. **Add one LLM key.** Any of Anthropic, OpenAI, xAI (Grok), OpenRouter or Gemini works; a local Ollama
   (`127.0.0.1:11434`) or LM Studio (`:1234`) works with no key. Run `lumen keys set anthropic` and paste the key,
   then `lumen keys test anthropic`. Keys go to `~/.lumen/keys.json` (mode 0600); env vars such as
   `ANTHROPIC_API_KEY` override the file. Lumen only ever prints keys masked to the last 4 characters.
3. **Run the health check.** `lumen doctor` reports providers, keys (masked), chains, skill counts and available
   updates. Fix anything red before going further.
4. **Open the chat.** `lumen` plays the boot animation, lists what loaded (persona, skills, plugins, keys) and
   opens the TUI. Try "price of ETH on base". For a single answer without the TUI use
   `lumen -p "what is the gas price on arbitrum?"`.
5. **Learn the five keys that matter.** Esc aborts the turn, Ctrl+P cycles models, Ctrl+L opens the model picker,
   `@` attaches a file, `!git status` runs a shell command and sends the output. `/hotkeys` lists the rest;
   `/session` shows tokens and cost so far.
6. **Unlock features with more keys (optional).**

   | Want | Add |
   |---|---|
   | Fast RPC, balances, NFTs, transfers on EVM | `ALCHEMY_API_KEY` |
   | ABIs and verified source on 60+ chains | `ETHERSCAN_API_KEY` (one Etherscan V2 key) |
   | Images, video, speech, music with one key | `OPENROUTER_API_KEY` |
   | Solana RPC | `HELIUS_API_KEY` |
   | Swap quotes | `ZEROX_API_KEY` (EVM), `JUPITER_API_KEY` (Solana, optional) |

   Prices and Chainlink feeds work without any data key, through public RPCs and DefiLlama.
7. **Open the dashboard.** `lumen dashboard` opens `http://127.0.0.1:4747/?t=<token>` in your browser. Chat,
   Approvals, studios (Image, Photo, Video, Music, Audio), Chains, Wallet, Skills, Keys and Settings live there.
   Messages typed in the CLI show up live in the dashboard and the reverse.
8. **Try one thing from each area.** `lumen price ETH --chain base`, `lumen balance <address> --chain base`,
   `lumen gen image "a neon fox, 16:9" --aspect 16:9`, `lumen skills rug` and, on macOS, `lumen show "Safari"`.

## Where things live

| Path | What |
|---|---|
| `~/.lumen/keys.json` | provider keys (optional passphrase encryption) |
| `~/.lumen/config.json` | model, persona, approval mode, caps (`wallet.*`, `media.*`) |
| `~/.lumen/sessions/`, `~/.lumen/media/`, `~/.lumen/memory/` | chats, generated files, saved memories |
| `~/.lumen/personas/`, `~/.lumen/plugins/`, `~/.lumen/skills/` | your own personas, plugins and skills |

## Check before you finish

- [ ] `node -v` is 22 or newer
- [ ] `lumen keys test <provider>` passes for at least one LLM provider
- [ ] `lumen doctor` shows no errors
- [ ] One chat turn and one `lumen -p` answer worked
- [ ] `lumen dashboard` opened and shows the same session
- [ ] The person knows Esc aborts and `/session` shows spend

## Pitfalls

- **Pasting keys into chat.** Never paste a key into a prompt; use `lumen keys set` or the dashboard Keys page.
- **Env var shadowing.** A stale `OPENAI_API_KEY` in the shell profile overrides `keys.json`; `lumen doctor`
  shows which source won.
- **Opening the dashboard by URL.** `127.0.0.1:4747` without the token answers 401; always start it with
  `lumen dashboard`.
- **Expecting money moves out of the box.** Chain tools are read-only until a wallet key and spend caps are set,
  and every transaction still needs your explicit yes.
- **Adding every key on day one.** Each key is one more secret to protect; add them as features are needed.

## Related

- `choosing-models-and-providers` — pick the model and provider that fit the job and budget
- `lumen-doctor-troubleshooting` — fix whatever `lumen doctor` flags
- `safety-and-approvals` — what Lumen will and will not do with money
- `cost-control-and-spend-caps` — set caps before heavy use
- `wallet-and-key-security` — protect the keys you add
