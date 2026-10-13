---
name: dashboard-takeover
description: "Drive the Lumen web dashboard with a visible ghost cursor: navigate, click, type, drag, scroll, highlight and run studio commands in the Image, Photo, Video, Music and Audio studios. Use when someone says \"do it in the dashboard\", \"edit this video for me\", \"make a beat in the music studio\", \"show me how in the editor\", \"take over\", or asks the agent to operate the studios. Covers the dashboard tool ops, data-agent-id targets, UiCommands, snapshot-first workflow and handing control back."
license: MIT
metadata:
  title: "Dashboard takeover"
  category: "lumen"
  level: "intermediate"
  tags: "lumen, dashboard, takeover, ghost cursor, studios, ui automation, uicommands"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Dashboard takeover

The `dashboard` tool lets the agent operate the Lumen web dashboard while the user watches: a ghost cursor glides
along a curved path, clicks ripple and text types character by character. The rule that keeps it reliable:
snapshot first, then act only on targets and commands the snapshot just listed. Prefer one `command` over a
chain of clicks whenever a studio exposes one.

## When to use

- "Put these clips on the timeline and export", "trim the intro", "add captions"
- "Make a 120 BPM beat with a four-on-the-floor kick"
- "Apply a film filter and crop to 1:1 in the photo editor"
- "Show me how to do this in the dashboard" (use `highlight` to teach)
- Not for other desktop apps: use the screen tools there

## Steps

1. **Make sure a dashboard is connected.** The user must have it open (`lumen dashboard`). If the tool reports
   no client, ask them to run that command.
2. **Start the takeover.** `dashboard { "op": "takeover_start", "note": "Building your beat" }` shows the
   "Lumen is driving" banner and a glowing frame. User input is dimmed, not blocked.
3. **Go to the right place.** `dashboard { "op": "navigate", "route": "/studio/music" }`. Routes: /chat,
   /approvals, /sessions, /studio/image, /studio/photo, /studio/video, /studio/music, /studio/audio, /library,
   /chains, /wallet, /prices, /skills, /plugins, /personas, /keys, /updates, /settings.
4. **Snapshot.** `dashboard { "op": "snapshot" }` returns `{ route, targets, commands, summary }`. Targets are
   elements with a `data-agent-id` (with label and role: button, input, slider, tab, canvas, track, knob, list,
   panel). `summary` describes studio state: tracks, clips, layers, tempo.
5. **Prefer commands.** Run app-level commands the snapshot lists:

   ```json
   { "op": "command", "name": "music.setTempo", "args": { "bpm": 120 } }
   { "op": "command", "name": "music.setPattern", "args": { "track": "kick", "steps": [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0] } }
   { "op": "command", "name": "music.play", "args": {} }
   ```

   Known commands: nav.go, image.generate, photo.filter, photo.crop, photo.addText, photo.export, video.addClip,
   video.trim, video.split, video.addCaption, video.export, music.setTempo, music.setPattern, music.addNote,
   music.play, music.stop, synth.set, mixer.set, fx.set, audio.load, audio.cut, audio.fade, audio.normalize,
   audio.export. Always check `params` in the snapshot before calling; commands differ per route.
6. **Fall back to pointer ops.** `click { "target": "<data-agent-id>" }`, `type { "target", "text" }`,
   `drag { "target", "to" }`, `scroll { "target", "value" }`, `move { "target" }`. Use `highlight
   { "target", "note" }` to teach without changing anything.
7. **Verify with another snapshot.** After each meaningful change, snapshot again and compare `summary` to what
   you intended (clip count, tempo, layer list). Commands return results such as `{ clipId }` or
   `{ exportUrl }`; keep them for later steps.
8. **End cleanly.** `dashboard { "op": "takeover_end" }` hides the banner. Tell the user what changed and where
   the output is (Library, export URL).

## Timing and control

- Each op waits up to 15 s for the dashboard to answer. Long jobs (exports, generations) return quickly with a
  job or URL; poll with snapshots instead of retrying the command.
- The user can press Esc or click "Take back" at any time. Pending ops then fail with `user_took_over` and the
  turn stops. Do not restart the takeover unless the user asks again.

## Check before you finish

- [ ] `takeover_start` and `takeover_end` bracket the work
- [ ] Every target and command came from a snapshot on the current route
- [ ] Final snapshot `summary` matches the requested result
- [ ] Exports or generated files are reported with their location
- [ ] Any money or key change went through Approvals, never through clicks

## Pitfalls

- **Clicking stale ids.** Targets change after navigation; snapshot after every `navigate`.
- **Retrying on timeout.** A 15 s timeout can mean the op is still running; snapshot before repeating, or you get
  duplicate clips and notes.
- **Fighting the user.** After `user_took_over`, stop. Resuming silently breaks trust.
- **Driving Approvals or Keys.** Never click Approve on the Approvals page or edit the Keys page; the agent can
  never self-approve and must not handle secrets through the UI.
- **Pixel-hunting on canvases.** Use commands (`photo.crop`, `video.trim`) rather than dragging on canvas
  elements whose geometry the snapshot does not describe.

## Related

- `video-studio-editing` — what to build in the Video studio
- `music-studio-basics` — tempo, patterns and the mixer
- `photo-studio-editing` — layers, filters and export
- `show-me-screen-markers` — point at things in other macOS apps
- `safety-and-approvals` — why approvals stay human-only
