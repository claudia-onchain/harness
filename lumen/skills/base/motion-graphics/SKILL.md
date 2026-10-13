---
name: motion-graphics
description: "Add titles, kinetic type, lower thirds, animated backgrounds and simple logo stings to videos. Use when someone asks for \"animated text\", \"a title card\", \"lower third with my name\", \"kinetic typography\", \"an intro sting\", \"animated background loop\", or \"make this explainer less static\". Covers timing and easing rules, text and captions tracks plus fades in the Video studio, generating seamless loops and logo reveals with generate_video, still-plus-zoom inserts, rendering type with ffmpeg drawtext or HTML when needed, and readability checks."
license: MIT
metadata:
  title: "Motion graphics"
  category: "create"
  level: "intermediate"
  tags: "motion graphics, kinetic type, titles, lower thirds, animated text, loops, logo sting, explainer"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Motion graphics

Motion graphics should guide the eye, not decorate. Every element enters with purpose, holds long enough to read
(about 3 words per second plus half a second), and leaves cleanly. Use the Video studio's text track and fades for
most of it, generated loops for backgrounds, and real fonts for any word that must be legible, never model-drawn text.

## When to use

- Title cards, chapter cards, lower thirds, end cards.
- Kinetic typography for a voice-over or quote video.
- An animated background loop behind text or a talking head.
- A short logo reveal or intro sting (1-3 s).
- Explainers that are mostly static screenshots and need movement.

## Steps

1. **Decide the role of each element.** Hook title (first 2 s), lower third (who/where, 3-5 s), emphasis word
   (one key word per beat), chapter card (1.5-2 s), end card (CTA, 2-4 s on horizontal only).
2. **Set the type system.** One bold display face for titles, one clean sans for supporting text, max two sizes per
   frame. On 1080x1920: titles 100-140 px, supporting 48-64 px. On 1920x1080: titles 90-120 px, lower thirds 40-56 px.
   Keep text inside the safe zone (vertical: y 250-1500, x 60-960; horizontal: 5% inset title-safe margin).
3. **Time it to read.** On-screen duration ≈ words ÷ 3 + 0.5 s. Entries 0.2-0.4 s, exits 0.15-0.3 s. Ease out on
   entry (fast then settle), ease in on exit. Nothing moves linearly unless it is a constant drift.
4. **Build titles and kinetic type in the Video studio.** Put each phrase on the text track (or captions track for
   synced words), with short fades:
   ```json
   dashboard { "op": "navigate", "route": "/studio/video" }
   dashboard { "op": "snapshot" }
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "ONE", "start": 0.0, "end": 0.5 } }
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "BAD", "start": 0.5, "end": 1.0 } }
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "APPROVAL", "start": 1.0, "end": 2.0 } }
   ```
   Cut words on the beat of the voice or music; vary size for emphasis instead of adding effects.
5. **Generate animated backgrounds as loops.** Ask for slow, abstract, seamless motion with no text and a calm area
   for type:
   ```sh
   lumen gen video "Seamless looping abstract background, slow flowing gradient waves in deep navy and cyan, soft light particles drifting upward, calm empty centre for text, locked-off camera, no text, no logos." --model bytedance/seedance-2.5 --aspect 9:16
   ```
   Trim to a clean loop point in the Video studio and lower its brightness under text.
6. **Make a logo sting from your real logo.** Pass the logo PNG as a ref for image-to-video ("the logo assembles from
   light particles, then holds still, centred, dark background, 2 seconds"), then lay the crisp original logo as an
   image clip over the final frame so the end state is pixel-perfect.
   ```json
   generate_video { "prompt": "The logo from image 1 forms from glowing particles, settles and holds still, centred on a dark background, subtle whoosh.", "model": "kwaivgi/kling-v3.0-pro", "aspect": "16:9", "durationSec": 4, "refs": ["/api/files/media/logo.png"] }
   ```
7. **Move stills instead of generating.** Screenshots and stills get a slow 5-10% zoom or pan across 3-5 s; cheap,
   and enough movement for explainers.
8. **Use code for precise type when needed.** For exact typography, render with ffmpeg drawtext (if the build has
   freetype) or an HTML page captured to frames, via `bash` with user approval:
   ```sh
   ffmpeg -i bg.mp4 -vf "drawtext=fontfile=Inter-Bold.ttf:text='CHECK THE CONTRACT':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=h*0.3:enable='between(t,0.3,2.5)'" -c:a copy out.mp4
   ```
9. **Export and review muted on a phone.** Every word readable, no element under app UI, motion not distracting.

## Lower-third template (1920x1080)

| Element | Spec |
|---|---|
| Position | left, x 96, bottom edge at y ~ 940 |
| Name | 52 px bold |
| Role / handle | 36 px regular, 70% opacity |
| Bar | 6 px accent line or 80% dark panel behind |
| Timing | in 0.3 s, hold 3-4 s, out 0.2 s |

## Check before you finish

- [ ] Every text element holds for at least words ÷ 3 + 0.5 s.
- [ ] All text set with real fonts (no model-rendered words) and inside the safe zone.
- [ ] Max two type sizes and one accent colour per frame.
- [ ] Loops are seamless; backgrounds dimmed enough for text contrast ≥ 4.5:1.
- [ ] Logo stings end on the real logo file, not a generated approximation.
- [ ] Reviewed muted at phone size before export.

## Pitfalls

- **Effects for their own sake.** Spins, bounces and glitch transitions on every word tire viewers.
- **Too fast to read.** If you have to pause to read it, it is too fast.
- **Generated logos.** Models redraw logos slightly wrong; always overlay the original.
- **Fonts without a licence.** Use fonts you own or open-licensed ones (OFL) for commercial work.
- **Busy backgrounds behind text.** Dim, blur or add a panel; contrast beats style.

## Related

- `video-studio-editing` — tracks, fades and export
- `captions-and-hooks` — synced caption timing
- `brand-kit` — fonts, colours and logo rules
- `video-prompting` — generating loops and stings
- `color-grading` — matching backgrounds to footage
