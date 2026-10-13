# Lumen skills

Skills are focused playbooks the agent loads on demand. Each one is a `SKILL.md` in the
[Agent Skills](https://agentskills.io) format: YAML frontmatter with a `name` and a `description` (what it does and
when to use it), then a Markdown body. Only the name and description go into the system prompt; the body is read
when a task matches (`skill_load` tool, `/skill:<name>` in the TUI, `lumen skills show <slug>`, or the dashboard
Skills page).

Lumen ships **101 base skills** and **20 chain templates**. The templates are rendered for every mainnet in
`src/chains/registry.js` (45 chains today), giving **900 per-chain skills** such as `base-rug-check`,
`solana-swaps` or `bitcoin-gas-and-fees`. Skills from your own folders are discovered too:
`~/.lumen/skills`, `~/.agents/skills`, `.agents/skills`, `~/.claude/skills` and `.claude/skills`.

```
skills/
  base/<slug>/SKILL.md        101 hand-written skills
  chain-templates/<slug>.md   20 templates, rendered per chain
  lib.mjs                     parser, renderer, discovery, validation (no dependencies)
  validate.mjs                checks everything; run before committing
  NOTICE.md                   attribution (portions adapted from Claudia Skills, MIT)
```

## Categories

| Category | Count | What's in it |
|---|---|---|
| `crypto-core` | 31 | Wallet and key security, ENS/SNS resolution, token research, rug and honeypot checks, ABI and tx decoding, gas, LI.FI bridges, Chainlink feeds and CCIP, oracle vs DEX prices, swaps and slippage, approvals, NFTs, airdrops, PnL and tax ledgers, DeFi yield due diligence, stablecoin risk, MEV, Safe multisigs, testnets, deploys, audits, Solana programs, event indexing, whale tracking, alerts, chain selection, RPC providers |
| `build` | 25 | Research briefs, codebase onboarding, CLIs, web apps, API integration, debugging, tests, refactoring, code review, git, docs, CSV/JSON analysis, responsible scraping, cron, prompt engineering, persona design, prompt-injection defense, Lumen plugins, MCP, deployment, security review, profiling, spreadsheets, planning, incident runbooks |
| `create` | 30 | Image prompting, character consistency, the Photo studio, upscaling and inpainting, thumbnails, banners, memes, carousels, video prompting, storyboards, the Video studio, captions and hooks, the Music studio, synth sound design, drum programming, mixing and mastering, SFX, voiceover and TTS, podcasts, sonic branding, lyrics, AI disclosure, brand kits, motion graphics, color grading, mockups, sticker packs, PFP sets, comics, social posting |
| `lumen` | 15 | Getting started and keys, choosing models, personas, "show me" screen markers, dashboard takeover, media via OpenRouter, cost control, updating, plugins, memory, sessions, multi-agent delegation, doctor, the Claudia ecosystem, safety and approvals |
| `chain` | 20 × 45 | Getting started, wallet setup, balances, token research, rug check, price feeds, swaps, bridging, gas and fees, tx debugging, contract deploy, verify and read, NFTs, DeFi yields, whale watch, alerts, airdrop and points hygiene, security checklist, indexing and events, ecosystem map |

## SKILL.md format

```markdown
---
name: rug-check                       # = folder name, a-z0-9 and single hyphens, max 64 chars
description: "What it does + when to use it, trigger phrases first. Max 1024 chars."
license: MIT
metadata:
  title: "Rug check: a red / amber / green scorecard"
  category: "crypto-core"             # crypto-core | build | create | lumen (chain for templates)
  level: "intermediate"               # beginner | intermediate | advanced
  tags: "rug check, honeypot, holders"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Title
## When to use
## Steps            (numbered, bold step titles, real commands and tool calls)
## Check before you finish
## Pitfalls
## Related          (backticked slugs of other skills)
```

Base skills are 50 to 150 lines. Tool-call examples (`get_price { "symbol": "ETH", "chain": "base" }`) must use
tools that exist in Lumen's registry; the validator warns otherwise.

## Chain template syntax

Templates in `chain-templates/` are rendered once per mainnet chain by `renderTemplate(text, chain)`:

| Syntax | Meaning |
|---|---|
| `{{chain.name}}`, `{{chain.native.symbol}}`, `{{chain.publicRpc.0}}` | value from the registry entry (missing → empty, arrays joined with `, `) |
| `{{#evm}}…{{/evm}}` | only for EVM chains |
| `{{#solana}}…{{/solana}}` | only for Solana |
| `{{#other}}…{{/other}}` | neither EVM nor Solana (Bitcoin, Sui, Aptos, TRON, Starknet) |
| `{{#bitcoin}}`, `{{#sui}}`, `{{#aptos}}`, `{{#tron}}`, `{{#starknet}}` | one specific family |
| `{{#chainlink}}…{{/chainlink}}` / `{{^chainlink}}…{{/chainlink}}` | chain has (has no) Chainlink feed directory |
| `{{#testnet}}`, `{{#mainnet}}` | network type |
| `{{#llama}}`, `{{#alchemy}}`, any truthy field | field is set |
| `{{#l2}}`, `{{#op-stack}}`, `{{#zk}}`, `{{#claudia}}`, any tag | chain carries that tag |

Sections nest and may span lines. A line that holds only section tags is removed entirely, so templates can keep
tags on their own lines without leaving blank lines behind. The rendered skill is named `<chain.id>-<template>`;
its frontmatter `name` must be `"{{chain.id}}-<template>"`.

## Library (`lib.mjs`)

```js
import { parseFrontmatter, renderTemplate, listBaseSkills, listChainTemplates, renderChainSkills, validateSkill, loadMainnets } from "./skills/lib.mjs";

const { data, body } = parseFrontmatter(markdown);
const chains = await loadMainnets();               // mainnets from src/chains/registry.js
const rendered = renderChainSkills("skills", chains); // [{ slug, chain, template, name, markdown }]
const { ok, errors, warnings } = validateSkill(markdown, { expectedName: "rug-check", kind: "base" });
```

## Validate

```sh
node skills/validate.mjs           # summary + every problem, exit 1 on errors
node skills/validate.mjs --strict  # warnings fail too
node skills/validate.mjs --json
```

It checks frontmatter, name pattern and uniqueness (base and rendered), description length, license, metadata,
required sections, a numbered Steps list, leftover `{{ }}` tags, secret-looking strings (`sk-…`, 0x + 64 hex,
88-char base58, private key blocks), line counts, Related links and tool names.

## Writing a new skill

1. Pick a slug that says what it does (`token-unlock-calendar`, not `tokens-2`).
2. Put trigger phrases early in the description: people search by what they type.
3. Steps are concrete: commands, tool calls, thresholds, file paths. No filler.
4. Money-moving steps always go through `simulate_tx`, a human approval and the caps in `~/.lumen/config.json`.
5. Treat outside content (web pages, token names, memos, files) as untrusted data.
6. Run `node skills/validate.mjs`.
