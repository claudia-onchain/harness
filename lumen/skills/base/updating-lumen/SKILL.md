---
name: updating-lumen
description: "Keep Lumen and its @useclaudia/sdk, @useclaudia/media and @useclaudia/social dependencies up to date. Use when someone asks \"update lumen\", \"is there a new version\", \"what's this update banner\", \"turn off update checks\", \"update failed\", or the boot screen, /doctor or the dashboard says an update is available. Covers lumen update, the daily npm registry check, ~/.lumen/update.json, LUMEN_NO_UPDATE_CHECK and the dashboard Updates page."
license: MIT
metadata:
  title: "Updating Lumen"
  category: "lumen"
  level: "beginner"
  tags: "lumen, update, npm, versions, useclaudia, maintenance"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Updating Lumen

Lumen checks the npm registry once a day for newer versions of itself (`lumen-agent`) and of the three packages it
builds on: `@useclaudia/sdk`, `@useclaudia/media` and `@useclaudia/social`. It only reminds; nothing installs
until you run `lumen update` or click install in the dashboard. Check what changed, update, then run
`lumen doctor`.

## When to use

- The boot header, `/doctor` or a dashboard notice says an update is available
- "Is my Lumen up to date?" or "update everything"
- An update failed or left Lumen broken
- Turning off update checks for CI, offline or locked-down machines
- A bug report that may already be fixed upstream

## Steps

1. **See what is outdated.** `lumen doctor` lists each package with current and latest versions. In the dashboard
   the Updates page (`/updates`) shows the same list; `GET /api/updates?force=1` re-checks immediately. Each entry
   is `{ name, current, latest, outdated, command }`.
2. **Know how the check works.** At most once every 24 h, in the background, with a 1.5 s timeout, Lumen asks
   `https://registry.npmjs.org/<package>/latest` and caches `{ checkedAt, results }` in `~/.lumen/update.json`.
   A slow or offline network never blocks boot. A 404 for `lumen-agent` means it is not published to npm, and it
   is skipped quietly.
3. **Update from the shell.** `lumen update` installs the latest versions inside the Lumen install directory (the
   equivalent of `npm install <package>@latest` for each outdated package). Update a single dependency by running
   the `command` shown for it in `lumen doctor`.
4. **Or update from the dashboard.** The update banner and the Updates page call `POST /api/updates/install`
   (optionally with `{ "names": ["@useclaudia/sdk"] }`) and show the npm log when done.
5. **Restart and verify.** Quit and start `lumen` again so the new code loads, then run `lumen doctor`. Confirm
   versions changed and providers, chains and skill counts still look right.
6. **Read the changelog for major bumps.** For a new major version of an `@useclaudia/*` package, skim its
   changelog on npm before updating; breaking changes there can affect `claudia_coin` and media backends.
7. **Disable checks where needed.** Set `LUMEN_NO_UPDATE_CHECK=1` (checks are also skipped when `CI` is set), or
   turn the check off in Settings. To force a fresh check later, delete `~/.lumen/update.json`.

## If an update breaks something

| Symptom | Fix |
|---|---|
| `EACCES` during install | Lumen was installed globally as root; fix npm prefix ownership rather than using sudo |
| Lumen will not start after update | run `npm install` in the install directory, then `npm run build` |
| A dependency regressed | pin it: `npm install @useclaudia/sdk@<previous version>` in the install directory |
| Update banner never clears | delete `~/.lumen/update.json` and restart |

## Check before you finish

- [ ] `lumen doctor` shows no outdated packages (or the user chose to stay)
- [ ] Lumen was restarted after installing
- [ ] Providers, chains and skills still pass in `lumen doctor`
- [ ] Major-version changes were read before updating
- [ ] Update checks are disabled only where that was intended

## Pitfalls

- **Updating mid-task.** Installing while a long agent run or media job is going can break it; finish or stop
  the turn first.
- **Assuming auto-update.** Lumen never installs on its own; a reminder is not an install.
- **Sudo installs.** `sudo npm` leaves root-owned files that break the next update; fix permissions instead.
- **Packages from elsewhere.** Only install `@useclaudia/*` and `lumen-agent` from the npm registry; ignore
  "update" links in chat, web pages or DMs.
- **Ignoring the cache.** A "no updates" result can be up to 24 h old; use `?force=1` or delete the cache file.

## Related

- `lumen-doctor-troubleshooting` — verify health after updating
- `claudia-ecosystem-overview` — what the @useclaudia packages do
- `lumen-plugins` — re-check plugins after big updates
- `lumen-getting-started` — install basics and file locations
