---
name: automation-and-cron
description: "Schedules recurring jobs with crontab, macOS launchd plists and systemd timers, including unattended `lumen -p` runs, with locking, logging, env handling and dead-man alerts. Use when someone asks \"run this every morning\", \"set up a cron job\", \"schedule a report\", \"why didn't my cron run\", \"launchd plist\", \"systemd timer\" or wants a script or agent prompt to run on a schedule."
license: MIT
metadata:
  title: "Automation and cron"
  category: "build"
  level: "intermediate"
  tags: "cron, crontab, launchd, systemd, timers, scheduling, automation, lumen -p, logging, flock"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Automation and cron

A scheduled job is a script that runs with no one watching, a minimal environment and no terminal. Most
"cron didn't work" bugs are PATH, working directory or missing env vars, and most silent failures are jobs
that died weeks ago with nobody noticing. Write the job as a standalone script first, make it idempotent, log
everything, and alert on absence of success, not just on errors. Scheduled jobs are read-only or reporting
jobs: nothing unattended can move money, because Lumen's approvals need a human "yes".

## When to use

- "Run this every day at 8am" / "every 15 minutes" / "on the first of the month".
- A morning portfolio or gas report via `lumen -p` written to a file or sent somewhere.
- "My cron job never runs" or "it works in my shell but not in cron".
- Picking between crontab, launchd (macOS) and systemd timers (Linux).
- Watchers and alerts that poll an API or chain on a schedule.

## Steps

1. **Write a wrapper script with absolute paths.** Never put logic in the crontab line.
   ```sh
   #!/usr/bin/env bash
   set -euo pipefail
   export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
   export LUMEN_NO_UPDATE_CHECK=1          # no update nag in unattended runs
   cd "$HOME/reports"
   exec 9>/tmp/morning-report.lock; flock -n 9 || { echo "already running"; exit 0; }
   out="$HOME/reports/$(date +%F)-morning.md"
   lumen -p "Summarize ETH, SOL and BTC prices and Base gas. Read-only, no transactions." > "$out"
   curl -fsS -m 10 --retry 3 "https://hc-ping.com/<check-uuid>" > /dev/null   # dead-man ping on success
   ```
   `chmod +x ~/bin/morning-report.sh` and run it once by hand from `env -i HOME="$HOME" bash -l -c ~/bin/morning-report.sh`
   to mimic cron's empty environment. macOS has no `flock` by default: `brew install flock` or use `mkdir` as a lock.
2. **Pick the scheduler.** Linux server: systemd timer (catches up after downtime, logs to journald). macOS:
   launchd (cron works but skips runs while asleep). Anything simple and portable: crontab.
3. **crontab.** `crontab -e`, then:
   ```text
   SHELL=/bin/bash
   MAILTO=""
   0 8 * * 1-5  $HOME/bin/morning-report.sh >> $HOME/logs/morning.log 2>&1
   */15 * * * * $HOME/bin/gas-watch.sh >> $HOME/logs/gas.log 2>&1
   ```
   Check syntax at crontab.guru. `%` must be escaped as `\%` inside crontab lines. List with `crontab -l`.
4. **launchd (macOS).** Save `~/Library/LaunchAgents/com.me.morning-report.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0"><dict>
     <key>Label</key><string>com.me.morning-report</string>
     <key>ProgramArguments</key><array><string>/Users/me/bin/morning-report.sh</string></array>
     <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
     <key>StandardOutPath</key><string>/Users/me/logs/morning.log</string>
     <key>StandardErrorPath</key><string>/Users/me/logs/morning.err</string>
   </dict></plist>
   ```
   Load: `plutil -lint <file>` then `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.me.morning-report.plist`.
   Test now: `launchctl kickstart -k gui/$(id -u)/com.me.morning-report`. Unload: `launchctl bootout gui/$(id -u)/com.me.morning-report`.
   launchd runs a missed calendar job once on wake.
5. **systemd timer (Linux).** `~/.config/systemd/user/morning.service`:
   ```ini
   [Service]
   Type=oneshot
   ExecStart=%h/bin/morning-report.sh
   ```
   and `morning.timer`:
   ```ini
   [Timer]
   OnCalendar=Mon..Fri 08:00
   Persistent=true
   RandomizedDelaySec=120
   [Install]
   WantedBy=timers.target
   ```
   `systemd-analyze calendar "Mon..Fri 08:00"`, then `systemctl --user daemon-reload && systemctl --user enable --now morning.timer`.
   Inspect with `systemctl --user list-timers` and `journalctl --user -u morning.service -n 50`. For jobs that run
   while logged out: `loginctl enable-linger $USER`.
6. **Make it idempotent.** Re-running the same slot must not double-post or double-count: name outputs by date,
   keep a state file of the last processed block or id, and skip if it already exists.
7. **Alert on silence.** Ping a dead-man service (healthchecks.io, Cronitor) only after success; it alerts you
   when the ping stops. Rotate logs (`logrotate`, or `newsyslog` on macOS) so they do not fill the disk.
8. **Keep money out of it.** A scheduled prompt may read prices, balances and quotes. It must never be phrased
   to send, swap or approve; `send_tx` waits in `/approvals` for a human and cron cannot answer. If a job finds
   something actionable, have it notify you and act interactively.

## Check before you finish

- [ ] The script runs cleanly under `env -i` with absolute paths and an explicit PATH.
- [ ] Schedule verified (`crontab -l`, `launchctl print gui/$(id -u)/<label>`, or `systemctl --user list-timers`).
- [ ] stdout and stderr go to a log file; one manual run produced the expected output.
- [ ] A lock prevents overlapping runs; re-running a slot is harmless.
- [ ] A dead-man ping or equivalent alerts when the job stops succeeding.
- [ ] Keys come from `~/.lumen/keys.json` or env vars, never inlined in the crontab or plist.

## Pitfalls

- **Cron's PATH is `/usr/bin:/bin`.** `lumen`, `node` and Homebrew tools are not found. Set PATH in the script.
- **Timezones.** cron uses the system zone; servers are often UTC. Set `CRON_TZ=` (cronie) or schedule in UTC on purpose.
- **macOS privacy prompts.** cron and launchd jobs touching `~/Documents` or `~/Desktop` fail silently without
  Full Disk Access for `/usr/sbin/cron` or the binary. Keep job files outside protected folders.
- **Sleeping laptops.** cron skips runs while asleep; launchd and `Persistent=true` timers catch up once.
- **Rate limits.** `*/1` polling burns API quotas. Poll at the slowest interval that still answers the question.
- **Untrusted output.** A job that fetches web pages or token metadata feeds untrusted text into any prompt it
  builds. Keep it labelled as data, and never let it trigger writes.

## Related

- `onchain-alerts-and-watchers` — what to poll for and how to alert on chain events.
- `incident-runbook` — what to do when a scheduled job misfires.
- `cost-control-and-spend-caps` — cap model and media spend for unattended `lumen -p` runs.
- `write-a-cli` — turn the job into a proper script with flags and exit codes.
- `safety-and-approvals` — why unattended jobs cannot move money.
