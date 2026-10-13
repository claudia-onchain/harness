---
name: video-studio-editing
description: "Cut and export videos in the Lumen dashboard Video studio, by hand or with the agent driving the timeline. Use when someone says \"edit these clips together\", \"trim the start\", \"split at 4 seconds\", \"add captions\", \"add music under it\", \"fade out\", \"export an MP4 for TikTok\". Covers the media bin, multi-track timeline (video/image/audio/text/captions), trim handles, split at playhead, snapping, zoom, fades, MP4/WebM export via ffmpeg.wasm, pacing rules for shorts, and the UiCommands video.addClip, video.trim, video.split, video.addCaption, video.export."
license: MIT
metadata:
  title: "Video studio editing"
  category: "create"
  level: "intermediate"
  tags: "video studio, timeline, trim, split, captions, fades, export, mp4, dashboard, takeover"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Video studio editing

The Video studio (/studio/video) is a browser timeline: a media bin, stacked tracks for video, image, audio, text and
captions, trim handles, split at playhead, snapping, zoom, fades, and MP4/WebM export rendered locally with
ffmpeg.wasm. Generated clips and Photo studio stills drop straight in. The agent can build the whole cut through the
`dashboard` tool; the user watches the ghost cursor and can press Esc or "Take back" at any point.

## When to use

- Assembling generated takes into a short, ad, recap or meme video.
- Trimming model warm-up frames, splitting a long clip, reordering beats.
- Adding music, voice-over, sound effects, captions or a title card.
- Exporting a platform-ready vertical or horizontal MP4.

## Steps

1. **Open the studio and read its state.**
   ```json
   dashboard { "op": "navigate", "route": "/studio/video" }
   dashboard { "op": "snapshot" }
   ```
   The snapshot lists tracks, clips (with ids), the registered commands and their param schemas. Use the returned
   ids; never guess them.
2. **Set the project format first.** 9:16 at 1080x1920 for TikTok/Reels/Shorts, 16:9 at 1920x1080 for YouTube/X,
   1:1 at 1080x1080 for feed. Use 30 fps unless the source is 24 or 60.
3. **Load the media bin.** Drag files from /library, use "Send to Video" from the Photo studio, or add by URL. Clips
   from `generate_video` live under `/api/files/media/...`.
   ```json
   dashboard { "op": "command", "name": "video.addClip", "args": { "src": "/api/files/media/s1.mp4", "track": "video", "at": 0 } }
   dashboard { "op": "command", "name": "video.addClip", "args": { "src": "/api/files/media/s2.mp4", "track": "video", "at": 3.5 } }
   ```
   The result returns a `clipId` for each clip.
4. **Trim every generated clip.** Cut the first 0.3-0.8 s and the last 0.3-0.5 s (model warm-up/wind-down). Drag the
   trim handles or:
   ```json
   dashboard { "op": "command", "name": "video.trim", "args": { "clipId": "c1", "start": 0.5, "end": 3.5 } }
   ```
   Snapping keeps clips butted together; zoom the timeline in for frame-accurate cuts.
5. **Split and reorder.** Move the playhead to the cut point and split, then delete or move the pieces:
   ```json
   dashboard { "op": "command", "name": "video.split", "args": { "clipId": "c2", "at": 4.2 } }
   ```
   Cut on action (mid-gesture) so cuts feel invisible; cut on the beat when music drives the edit.
6. **Layer audio.** Voice on one audio track, music on another, SFX on a third. Music sits about 12-18 dB under
   voice (duck it under speech); fade music in over 0.5 s and out over 1-2 s. Keep generated clip audio only where
   it adds something.
7. **Add text and captions.** Hook text in the first 2 s on the text track; spoken words on the captions track,
   1-3 words or one short line at a time, inside the safe zone (y 250-1500 on 1080x1920, clear of the right 120 px):
   ```json
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "check the contract first", "start": 1.2, "end": 2.6 } }
   ```
   See `captions-and-hooks` for style and timing.
8. **Fades and the loop.** Short fade-ins on titles (0.2-0.3 s); avoid fading the very first frame of a short (it
   reads as a black frame in the feed). For loops, end on a frame that matches the opening.
9. **Export.** MP4 (H.264 + AAC) for every social platform; WebM only for the web. Export renders in the browser, so
   keep the tab open and expect roughly real-time or slower for 1080p.
   ```json
   dashboard { "op": "command", "name": "video.export", "args": {} }
   ```
   The result returns an `exportUrl`; the file appears in /library and ~/.lumen/media/.

## Pacing for shorts

| Rule | Target |
|---|---|
| Hook | something moves or changes in the first 0.5 s |
| Cut rhythm | a visual change every 2-4 s |
| Length | as short as the payoff allows; 15-35 s for most shorts |
| Ending | payoff, then cut; no outro card on vertical video |

## Check before you finish

- [ ] Project size and aspect match the destination (1080x1920, 1920x1080 or 1080x1080).
- [ ] Every generated clip trimmed at both ends; no black or frozen frames between clips.
- [ ] Voice clearly above music; no clipping on loud moments.
- [ ] Captions and hook text inside the safe zone and in sync with speech.
- [ ] Exported MP4 plays end to end in /library at full length.
- [ ] AI-generated footage will be labelled on upload.

## Pitfalls

- **Guessing clip ids.** Ids change as you split; call `snapshot` after structural edits.
- **Retrying after a takeover.** If a command returns `user_took_over`, stop and ask; do not resume on your own.
- **Untrimmed AI clips.** The warm-up morph at the start of each clip is the most obvious tell of a lazy edit.
- **Music louder than voice.** Viewers on phone speakers lose the words; duck the music.
- **Closing the tab during export.** ffmpeg.wasm runs in the page; leaving cancels the render.
- **Licensed music.** Only use music you generated, own or have a licence for; platforms mute or block the rest.

## Related

- `storyboarding-shorts` — the plan this edit follows
- `captions-and-hooks` — captions track content and placement
- `color-grading` — matching clips from different models
- `motion-graphics` — titles, lower thirds and animated text
- `dashboard-takeover` — how the agent drives the dashboard
