---
name: lumen-doctor-troubleshooting
description: "Diagnose and fix Lumen problems with lumen doctor and /doctor: missing or invalid keys, provider 401/429 errors, locked keys.json, dashboard 401 or port conflicts, RPC rate limits, macOS screen permissions, skills or plugins not loading, failed media jobs and update issues. Use when someone says \"lumen isn't working\", \"error\", \"401\", \"rate limited\", \"dashboard won't open\", \"tool failed\", \"run doctor\", or anything behaves unexpectedly."
license: MIT
metadata:
  title: "Lumen doctor and troubleshooting"
  category: "lumen"
  level: "beginner"
  tags: "lumen, doctor, troubleshooting, errors, keys, dashboard, rpc, permissions"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Lumen doctor and troubleshooting

`lumen doctor` (or `/doctor` inside the TUI) checks keys, providers, chains, skills, plugins, platform features
and updates in one pass, with keys masked. Start every fix there: most problems are a missing key, an env var
shadowing the file, a permission or a rate limit. Change one thing at a time and re-run doctor after each change.

## When to use

- Lumen fails at boot or a tool card turns red
- "401", "403", "429", "model not found", "timeout" from a provider or chain tool
- The dashboard shows "Open from the CLI" or will not load
- Screen tools return empty titles or black screenshots
- Skills, personas or plugins you added do not appear

## Steps

1. **Run doctor.** `lumen doctor` from the shell or `/doctor` in the TUI. Note every red or yellow line; fix top
   to bottom, since later checks often depend on earlier ones.
2. **Check Node and the install.** Node 22 or newer is required. If Lumen crashes on start after an update, run
   `npm install && npm run build` in the install directory.
3. **Fix keys.** `lumen keys` shows which providers are set and the source (env or file). `lumen keys test
   <provider>` makes one cheap call. An env var always beats `keys.json`, so a stale `OPENAI_API_KEY` in your
   shell profile wins over a fresh key in the file. If keys are encrypted and locked, set `LUMEN_PASSPHRASE` or
   unlock interactively.
4. **Match the error to the fix.**

   | Symptom | Likely cause | Fix |
   |---|---|---|
   | 401 / invalid key | wrong, revoked or shadowed key | `lumen keys set`, unset stale env var, re-test |
   | 429 from LLM | provider rate limit or no credit | wait, lower parallelism, add a fallback model |
   | "model not found" | wrong id style | hyphen ids direct, `vendor/model.x` on OpenRouter |
   | chain tool slow or 429 | public RPC limits | add `ALCHEMY_API_KEY` (or `HELIUS_API_KEY` on Solana) |
   | ABI lookup fails on an L2 | Etherscan V2 tier excludes that chain | verify source on the chain's explorer instead |
   | Jupiter quote throttled | keyless limit about 0.5 req/s | add `JUPITER_API_KEY` or slow down |
   | dashboard 401 | opened without the session token | run `lumen dashboard` |
   | port 4747 in use | another app or old Lumen | stop it or set `LUMEN_PORT=4848` |
   | empty window titles, black screenshots | Screen Recording not granted | grant to your terminal, restart it |
   | UI scripting fails | Accessibility not granted | System Settings > Privacy & Security > Accessibility |
   | screen tools "unsupported" | not macOS | expected; use written directions |
   | music job fails | preview model request changed | retry later or use another backend |

5. **Skills, personas, plugins.** User skills need `SKILL.md` with frontmatter `name` equal to the folder name,
   in `~/.lumen/skills/<slug>/` (or `~/.agents/skills`, `~/.claude/skills`, `.agents/skills`). Personas go in
   `~/.lumen/personas/<id>.md`. Plugins go in `~/.lumen/plugins/`; run `node --check` on them. Then `/reload`.
6. **Media and jobs.** Check `media_status` for the job error. `awaiting_approval` is not a failure: approve it in
   the CLI or dashboard Approvals page. Video export in the dashboard needs a browser with WebAssembly enabled.
7. **Updates.** If doctor shows outdated packages, run `lumen update`, restart, and re-run doctor.
8. **Still stuck: collect a clean report.** Doctor output (keys are masked), the exact error, the command or
   prompt, OS and Node version. Remove addresses or paths the user wants private before sharing.

## Check before you finish

- [ ] `lumen doctor` re-run after each fix, now clean or with understood warnings
- [ ] The source of each key (env or file) is the intended one
- [ ] The failing command or tool now succeeds once
- [ ] Permissions were granted to the right terminal app and it was restarted
- [ ] Any shared report contains no unmasked secrets

## Pitfalls

- **Pasting full keys while debugging.** Never; doctor output is already masked, share that.
- **Fixing three things at once.** You will not know which change worked or broke something else.
- **Forgetting to restart the terminal** after granting macOS permissions; the old process keeps the old rights.
- **Assuming Lumen is down** when a provider is; test the key and check the provider's status page.
- **Disabling safety to "fix" a blocked transaction.** A blocked `send_tx` usually means caps or approval are
  working; raise caps deliberately or approve, never bypass.

## Related

- `lumen-getting-started` — the setup steps doctor checks
- `choosing-models-and-providers` — fallbacks and id formats
- `rpc-providers-and-rate-limits` — RPC limits in depth
- `updating-lumen` — when the fix is a newer version
- `debugging-method` — a general method when the cause is unclear
