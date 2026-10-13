---
name: sessions-and-export
description: "Manage Lumen chat sessions: start fresh, resume old work, check tokens and cost, compact long threads, copy answers and export transcripts. Use when someone asks \"resume my last session\", \"start a new chat\", \"how many tokens\", \"the context is full\", \"export this conversation\", \"copy that answer\", \"find the chat where we...\", or wants to share or archive work. Covers /new, /resume, /session, /compact, /copy, /export, lumen sessions and the dashboard Sessions page."
license: MIT
metadata:
  title: "Sessions and export"
  category: "lumen"
  level: "beginner"
  tags: "lumen, sessions, resume, export, compact, transcript, context"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Sessions and export

Every Lumen conversation is a session saved under `~/.lumen/sessions/`, shared live between the CLI and the
dashboard. One task per session keeps context focused and cost low; `/compact` rescues a long one, `/resume`
brings back old work and `/export` produces a file you can share. Read an export before sharing it: transcripts
include tool outputs, file contents and addresses.

## When to use

- "Start over" or "new topic" (use a new session)
- "Pick up where we left off yesterday"
- "How many tokens / how much has this cost?"
- The context is getting large and answers slow down
- "Export this chat" for a teammate, a bug report or an archive

## Steps

1. **Start fresh for unrelated work.** `/new` opens a clean session; the old one stays saved. Do this when the
   topic changes, not only when context is full.
2. **Find past sessions.** `lumen sessions` lists them with id, title, last update and message count. The
   dashboard Sessions page (`/sessions`) shows the same with full timelines (`GET /api/sessions`).
3. **Resume.** `/resume` in the TUI opens a picker; choose the session and continue with its full history. A
   session opened in the dashboard and the CLI stays in sync, so messages typed in one appear in the other.
4. **Watch size and cost.** `/session` shows tokens and USD for the current session; the footer shows context
   percentage. Above roughly 60 to 70 percent context, plan to compact.
5. **Compact long threads.** `/compact` replaces older turns with a summary and keeps recent turns verbatim.
   Before compacting, ask the agent to state open decisions and next steps so they survive the summary.
6. **Copy and export.** `/copy` copies the last assistant answer to the clipboard. `/export` writes the current
   session to a file and prints its path. Media and uploads stay in `~/.lumen/media/` and `~/.lumen/uploads/`;
   the export references them.
7. **Clean before sharing.** Open the export and remove private paths, wallet addresses the user wants private,
   internal URLs and any pasted secrets. Lumen masks keys in its own output, but text the user pasted is kept as
   written.

## Which tool for which need

| Need | Use |
|---|---|
| Keep working on the same task tomorrow | `/resume` |
| Unrelated new task | `/new` |
| Thread is huge but still relevant | `/compact` |
| One answer into a doc or chat | `/copy` |
| Whole conversation for someone else | `/export`, then review |
| A fact for all future sessions | `memory_save`, not a session |

## Check before you finish

- [ ] Unrelated tasks live in separate sessions
- [ ] Open decisions were restated before `/compact`
- [ ] `/session` cost was checked on long runs
- [ ] Exported file was opened and scrubbed before sharing
- [ ] The export path was given to the user

## Pitfalls

- **One endless session.** Cost per turn grows with context; split by task.
- **Compacting away decisions.** Summaries drop details; restate key numbers, addresses and choices first.
- **Sharing raw exports.** Tool outputs can contain file contents, balances and home-directory paths.
- **Expecting resume to restore state elsewhere.** Resume restores the conversation, not a running media job or
  dashboard studio state; check `media_status` and the studio after resuming.
- **Pasting secrets into chat.** Anything pasted is saved in the session file; use `lumen keys set` for keys.

## Related

- `lumen-memory` — durable facts that outlive any session
- `cost-control-and-spend-caps` — why session size drives cost
- `docs-writing` — turn an exported session into clean documentation
- `lumen-getting-started` — TUI basics and file locations
