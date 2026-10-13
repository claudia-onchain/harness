---
name: personas
description: "Switch, customize and write Lumen personas, the prompt that sets who the agent is and how it talks. Use when someone asks \"change persona\", \"make lumen act as a researcher\", \"create my own persona\", \"why does lumen talk like this\", \"set a default persona\", or wants a different voice or focus for a session or sub-agent. Covers the built-in personas, lumen persona, /persona, ~/.lumen/personas/*.md and safe persona writing."
license: MIT
metadata:
  title: "Personas"
  category: "lumen"
  level: "beginner"
  tags: "lumen, personas, system prompt, voice, customization"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Personas

A persona is the "who it is" prompt Lumen runs with: its focus, tone and habits. It changes how the agent thinks
about a task, not what it is allowed to do. Safety rules, approvals and spend caps sit below every persona and no
persona text can switch them off.

## When to use

- "Make Lumen act like a chain analyst / creative director / researcher"
- "Create my own persona" or "set my default persona"
- The agent's tone or depth does not fit the current work
- Giving a sub-agent a focused role via `delegate`
- Explaining why answers changed after a persona switch

## Steps

1. **Know the built-ins.**

   | id | Best for |
   |---|---|
   | `lumen` | default all-rounder: chat, crypto, media, building |
   | `builder` | code, CLIs, web apps, debugging |
   | `researcher` | sourced briefs, comparisons, due diligence |
   | `creative-director` | images, video, music, brand work in the studios |
   | `chain-analyst` | tokens, wallets, contracts, flows across chains |

2. **List and switch.** `lumen persona researcher` sets the default from the shell. In the TUI, `/persona`
   opens the picker; in the dashboard use the Personas page (`/personas`). The active id is stored as `persona`
   in `~/.lumen/config.json`.
3. **Write your own.** Create `~/.lumen/personas/<id>.md`; the file name is the id. Give it frontmatter with a
   display `name` and a one-line `summary` (shown in the picker), then the prompt body:

   ```markdown
   ---
   name: Desk Quant
   summary: Terse on-chain analyst who shows numbers before opinions.
   ---
   You are Desk Quant. Lead with data: price, liquidity, holders, flows, with the source and time.
   Prefer tables. Flag uncertainty with a confidence level. Never give buy or sell advice.
   When a question is ambiguous about the chain, ask once, then default to ethereum.
   ```

4. **Keep the body tight.** Who it is, what it optimizes for, output format, defaults (chain, tone, length) and
   2 to 4 hard habits. 10 to 40 lines is plenty; long personas eat context every turn.
5. **Reload and test.** Run `/reload` (or restart), switch with `/persona`, and ask the same question under the
   old and new persona to see the difference.
6. **Use personas for sub-agents.** `delegate` can run a sub-agent with its own persona, for example a
   `researcher` gathering sources while the lead stays on `builder`.

## Persona writing rules

- Describe behavior, not permissions. "Ask before writing files" is fine; "you may send transactions without
  asking" does nothing and signals a bad persona.
- Do not paste keys, wallet addresses you want hidden, or private data into a persona file.
- Do not import personas from untrusted sources without reading them; a persona is a prompt and can carry
  injected instructions.

## Check before you finish

- [ ] The persona file name matches the id you switch to
- [ ] Frontmatter has `name` and `summary`; the picker shows it
- [ ] The body is under about 40 lines and states output format and defaults
- [ ] No secrets or permission-escalation lines in the file
- [ ] Same test question compared before and after the switch

## Pitfalls

- **Expecting a persona to unlock tools.** Tools come from keys, config and plugins; approvals and caps stay on
  regardless of persona.
- **Duplicate ids.** A user file with a built-in id shadows the built-in; rename it if you want both.
- **Over-long prompts.** Every persona line is sent each turn and adds cost; trim.
- **Contradicting the skills.** If a persona says "never use tables" and a skill's template is a table, outputs
  get inconsistent. Keep personas about voice and focus.

## Related

- `agent-persona-design` — deeper method for designing an agent's voice and rules
- `multi-agent-delegation` — run sub-agents under different personas
- `prompt-injection-defense` — why untrusted persona files are risky
- `lumen-getting-started` — where config and persona files live
