---
name: choosing-models-and-providers
description: "Pick and switch LLM providers and models in Lumen: Anthropic, OpenAI, xAI Grok, OpenRouter, Gemini or local Ollama / LM Studio. Use when someone asks \"which model should I use\", \"switch to grok\", \"use a cheaper model\", \"run locally\", \"set up openrouter\", \"change thinking level\", or a model errors, is slow or costs too much. Covers /model, Ctrl+P cycling, roles, fallback, thinking levels and price trade-offs."
license: MIT
metadata:
  title: "Choosing models and providers"
  category: "lumen"
  level: "beginner"
  tags: "lumen, models, providers, anthropic, openai, xai, openrouter, gemini, ollama, thinking"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Choosing models and providers

Lumen talks to any configured LLM provider and lets you switch mid-session. The rule of thumb: use the strongest
model for planning, code and anything touching money, and a fast cheap model for bulk lookups, summaries and
sub-agents. Price differences are 40x between tiers, so the choice matters more than prompt tweaks.

## When to use

- "Which model should I use for this?" or "use something cheaper / faster"
- "Switch to Grok / GPT / Gemini" or "run offline on Ollama"
- A provider returns 401, 429 or times out and you need a fallback
- Setting up OpenRouter to reach many models with one key
- Tuning thinking depth for a hard problem or a quick answer

## Steps

1. **See what is configured.** `lumen keys` lists providers and masked keys; `lumen keys test openai` checks one.
   Add a provider with `lumen keys set <provider>` (anthropic, openai, xai, openrouter, gemini).
2. **Pick by job, not by habit.**

   | Job | Good choice | Why |
   |---|---|---|
   | Default agent work, code, money decisions | `claude-opus-5-5` (default) | strongest tool use, 1M context |
   | Balanced daily use | `claude-sonnet-5-5`, `gpt-6.1-sol`, `grok-4.7` | half the price, still strong |
   | Bulk lookups, sub-agents, summaries | `claude-haiku-5-5`, `gpt-6-luna`, `grok-4.3` | cheapest; Grok 4.3 has 1M context |
   | Many vendors, one key and one bill | OpenRouter ids like `anthropic/claude-opus-5.5`, `google/gemini-3.8-flash` | dotted ids, usage cost reported per turn |
   | Offline or private data | Ollama / LM Studio local models | no key, nothing leaves the machine |

   Anthropic list prices per 1M tokens (in/out): Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50,
   Fable 5.1 $10/$50.
3. **Switch in the TUI.** `/model` or Ctrl+L opens the picker; Ctrl+P cycles through your cycle list. In the
   dashboard use the model menu in Chat or Settings. The choice persists to `model` in `~/.lumen/config.json`.
4. **Set the cycle list and roles.** In `~/.lumen/config.json`, `cycle: ["anthropic:claude-opus-5-5",
   "xai:grok-4.7", "openrouter:google/gemini-3.8-flash"]` controls Ctrl+P. `roles.fast` and `roles.vision`
   choose the models used for quick internal jobs and image understanding.
5. **Add a fallback.** Set `fallback: { "provider": "openrouter", "id": "anthropic/claude-sonnet-5.5" }` so a
   failing main model is retried once on another provider instead of ending the turn.
6. **Tune thinking.** `/thinking` or Shift+Tab cycles off, low, medium, high, xhigh (Ctrl+T shows or hides the
   reasoning stream). Use high or xhigh for audits, debugging and multi-step plans; off or low for lookups.
   Anthropic thinking is adaptive (effort-based); more effort means more output tokens billed.
7. **Go local when needed.** Start Ollama (`ollama serve`, pull a tool-capable model) or LM Studio's server, then
   pick it in `/model`. Check that the model supports tools; models without tool calling can chat but cannot run
   Lumen's chain, file or media tools.
8. **Verify cost after a switch.** Run a typical turn and check `/session` for tokens and USD.

## Check before you finish

- [ ] `lumen keys test <provider>` passes for the chosen provider
- [ ] The footer shows the intended model id
- [ ] Ctrl+P cycles only through models you have keys for
- [ ] A fallback is set if the work is long-running or unattended
- [ ] Thinking level matches the task (not xhigh for price lookups)
- [ ] `/session` cost looks sane after one turn

## Pitfalls

- **Mixing id styles.** Direct Anthropic ids use hyphens (`claude-opus-5-5`); OpenRouter ids use a vendor prefix
  and dots (`anthropic/claude-opus-5.5`). The wrong style returns "model not found".
- **Local models without tools.** Many small local models ignore tool schemas; Lumen then answers from memory
  instead of fetching live chain data. Pick a tool-capable model.
- **Cheap model for money moves.** Use a strong model for anything that ends in `send_tx`; the human approval
  is the last line, not the only one.
- **Unpriced models.** Some catalog entries have no known price and show as "unpriced"; cost caps cannot estimate
  them, so watch `/session` manually.
- **Vision assumptions.** Screenshots from `screen_capture` need a vision-capable model in `roles.vision`.

## Related

- `cost-control-and-spend-caps` — budget the model you picked
- `multi-agent-delegation` — run cheap sub-agents under a strong lead model
- `lumen-doctor-troubleshooting` — fix provider auth and rate-limit errors
- `prompt-engineering` — get more out of whichever model you use
