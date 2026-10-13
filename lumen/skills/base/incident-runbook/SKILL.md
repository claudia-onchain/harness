---
name: incident-runbook
description: "Handles a live incident end to end: declare and set severity, stop the bleeding (rollback, kill switch, pause jobs, revoke approvals, rotate leaked keys), communicate on a fixed cadence, diagnose from logs and recent changes, recover and verify, then write a blameless postmortem with action items. Covers app outages, leaked API keys, compromised wallets and an AI agent doing the wrong thing. Use when someone says \"production is down\", \"I leaked my key\", \"my wallet was drained\", \"the bot is misbehaving\", \"incident\", \"rollback now\" or \"write a postmortem\"."
license: MIT
metadata:
  title: "Incident runbook"
  category: "build"
  level: "intermediate"
  tags: "incident response, outage, rollback, postmortem, key rotation, compromised wallet, kill switch, on-call"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Incident runbook

In an incident, the order is: stop the damage, tell people, then understand. Mitigation beats diagnosis; a
rollback you understand later is better than a fix you debug live. Keep a timestamped log from the first
minute, change one thing at a time, and do not make money-moving decisions in a panic: every transaction still
goes through a simulated preview and an explicit human approval.

## When to use

- The app, API or bot is down, erroring or returning wrong data.
- An API key, seed phrase or private key was committed, pasted or exposed.
- A wallet shows transfers or approvals you did not make.
- An agent or automation is doing something wrong (looping, spending, posting, writing files).
- After it is over: "write the postmortem".

## Steps

1. **Declare and set severity.** Say "incident" out loud (or in the channel), name one person in charge, and
   start a log: `HH:MM UTC — what happened / what we did`.

   | Sev | Meaning | Response |
   |---|---|---|
   | 1 | Funds or keys at risk, data leak, full outage | Everything stops; act now |
   | 2 | Major feature broken, many users affected | Fix within hours |
   | 3 | Degraded, workaround exists | Next working session |

2. **Stop the bleeding.** Pick the fastest safe lever:
   - **Bad deploy:** roll back first (`vercel rollback`, previous Replit deployment, `docker run` of the last
     good tag, or `git revert <sha>` and redeploy). Disable the feature flag if there is one.
   - **Runaway job:** `crontab -e` and comment it out, `launchctl bootout gui/$(id -u)/<label>`, or
     `systemctl --user stop <name>.timer`.
   - **Agent misbehaving:** press Esc in the TUI or "Take back" on the dashboard, reject everything pending in
     `/approvals`, and lower `wallet.maxUsdPerDay` / `media.approveAboveUsd` in `~/.lumen/config.json`.
   - **Leaked API key:** revoke it at the provider's console first, then `lumen keys set <provider>` with a new
     one (or `lumen keys rm <provider>`), and `lumen keys test <provider>`. Check the provider's usage page for abuse.
3. **Compromised wallet (Sev 1).** Assume the key is gone. From a clean device, create a new wallet; move
   remaining assets there, highest value first, each transfer simulated (`simulate_tx`) and approved by you;
   revoke token approvals from the old address (see `approvals-and-revoking`); check every chain the key was
   used on (`address_activity`, `get_balance` per chain). Never send gas to a drained wallet that a sweeper bot
   watches; the gas is stolen in the same block. Do not trust anyone in DMs offering recovery: that is the
   second scam.
4. **Communicate on a cadence.** Short status every 30-60 minutes for Sev 1-2, even if nothing changed: what
   is affected, what you are doing, next update time. Never speculate about cause publicly.
5. **Diagnose with evidence.** What changed last (deploys, config, dependency updates, provider status
   pages)? Read logs around the start time (`vercel logs`, `docker logs --since 30m <container>`,
   `journalctl --user -u <name> --since "-1h"`). For agents: `/export` the session and read the tool calls
   that preceded the action; look for untrusted content that steered it. Form one hypothesis, test it, record it.
6. **Fix and verify.** Apply the smallest fix, then confirm the user-facing symptom is gone (health check,
   the failing request, the dashboard), not just that the error stopped logging. Watch for 30 minutes before
   closing.
7. **Clean up.** Re-enable what you disabled in a controlled way, rotate anything that might have been exposed
   during debugging, remove temporary debug logging and access.
8. **Postmortem within 48 hours.** Blameless, written, short:
   ```markdown
   # Incident <date>: <title>
   Severity · Duration · Impact (users, funds, data)
   ## Timeline (UTC)       first signal → detection → mitigation → resolution
   ## Root cause           the mechanism, plus why it was not caught
   ## What went well / poorly
   ## Action items         - [ ] owner, due date — prevent / detect / mitigate faster
   ```
   Each action item is concrete (a test, an alert, a cap, a checklist step) with an owner and a date.

## Check before you finish

- [ ] Damage stopped: rollback done, jobs paused, keys revoked, or funds moved to a fresh wallet.
- [ ] A timestamped log exists from detection to resolution.
- [ ] The user-facing symptom is verified fixed, and monitored for 30+ minutes.
- [ ] Every possibly exposed secret is rotated and old approvals revoked.
- [ ] Stakeholders got a final "resolved" update.
- [ ] A postmortem with owned, dated action items is written.

## Pitfalls

- **Debugging before mitigating.** Users and funds bleed while you read stack traces. Roll back first.
- **Deleting the evidence.** Do not wipe logs, sessions or containers before copying them; you need them for the root cause.
- **Rotating in the wrong order.** Revoke the old key first, then issue the new one, then update every place that used it.
- **Many changes at once.** If three fixes go out together you will not know which worked. One at a time.
- **Panic transactions.** Rushed transfers to mistyped or poisoned addresses make it worse. Copy the destination
  from your own new wallet, simulate, verify the first and last characters, then approve.
- **Blame.** People hide mistakes in blameful cultures and the next incident lasts longer.

## Related

- `wallet-and-key-security` — preventing the next key compromise.
- `approvals-and-revoking` — revoking token approvals from a compromised address.
- `deployment-replit-vercel-docker` — rollback commands per platform.
- `debugging-method` — structured diagnosis once the bleeding stops.
- `safety-and-approvals` — Lumen's caps and approval queue during an incident.
