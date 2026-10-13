---
name: photo-studio-editing
description: "Edit images in the Lumen dashboard Photo studio by hand or by letting the agent drive it. Use when someone says \"crop this to 1080x1350\", \"add a title to this image\", \"make it pop\", \"apply a filter\", \"remove that\", \"export as JPEG\", or wants a generated image finished for posting. Covers layers (image/text/shape/brush), tools (move, crop, brush, eraser, text, shape), adjustments, filter presets, undo/redo, PNG/JPEG export, send to Video, and the dashboard UiCommands photo.crop, photo.filter, photo.addText, photo.export."
license: MIT
metadata:
  title: "Photo studio editing"
  category: "create"
  level: "beginner"
  tags: "photo studio, dashboard, layers, crop, filters, adjustments, text overlay, export, takeover"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Photo studio editing

The Photo studio (/studio/photo) is a layer editor: an image layer at the bottom, text, shape and brush layers on top,
non-destructive adjustments, filter presets, undo/redo and PNG/JPEG export. Generate in the Image studio, finish here.
The agent can drive every step through the `dashboard` tool while the user watches the ghost cursor, and the user can
press Esc or "Take back" at any time.

## When to use

- A generated or uploaded image needs exact pixels (1280x720, 1080x1350, 1500x500).
- Adding a title, label, logo or AI disclosure on top of an image.
- Quick grade: brightness, contrast, saturation, hue, sharpen, vignette, or a preset.
- Cleaning a small area with the brush/eraser, or compositing two images with layers.
- Preparing a still to send into the Video studio as a clip.

## Steps

1. **Open the image.** From /library or /studio/image, "Open in Photo", or drag a file onto the canvas (it is saved to
   ~/.lumen/uploads/). As the agent:
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "snapshot" }
   ```
   The snapshot returns live targets, the registered commands with their JSON-schema params, and a summary of layers.
   Treat it as the source of truth for parameter names and preset names.
2. **Crop to the destination first.** Crop before text so nothing lands outside the frame. Pick the target from the
   table below, then:
   ```json
   dashboard { "op": "command", "name": "photo.crop", "args": { "x": 0, "y": 140, "w": 1080, "h": 1350 } }
   ```
   Keep the subject's eyes near a third line; leave the text side quiet.
3. **Adjust globally, gently.** Order: exposure (brightness) → contrast → saturation → hue → sharpen → vignette.
   Typical ranges that stay natural: brightness ±10%, contrast +5 to +15%, saturation -10 to +15%, sharpen light,
   vignette 10-25%. Blur is for backgrounds on a separate layer, not the whole image.
   ```json
   dashboard { "op": "command", "name": "photo.filter", "args": { "name": "contrast", "amount": 0.12 } }
   dashboard { "op": "command", "name": "photo.filter", "args": { "name": "vignette", "amount": 0.2 } }
   ```
4. **Or apply one filter preset, then trim it back.** Presets are a starting point; lower the amount until skin and
   whites look right. Use one preset per series so posts match (see `color-grading`).
5. **Add text as its own layer.** Short, big, high contrast. Use the text tool or:
   ```json
   dashboard { "op": "command", "name": "photo.addText", "args": { "text": "3 RULES", "x": 64, "y": 80, "size": 140 } }
   ```
   Add a shape layer (dark rectangle at 60-80% opacity) behind text on busy backgrounds. Keep 4.5:1 contrast.
6. **Retouch locally.** Brush for small paint-overs on a new layer, eraser to blend a pasted patch into the base,
   move tool to nudge. Keep retouching on separate layers so undo and toggling stay easy.
7. **Export.** PNG for text-heavy graphics, transparency and anything you will edit again; JPEG (quality ~85-90) for
   photos you post. Check the file size limit of the destination (YouTube thumbnails: keep under 2 MB).
   ```json
   dashboard { "op": "command", "name": "photo.export", "args": { "format": "jpeg" } }
   ```
   The result includes the export URL; files land in ~/.lumen/media/ and show in /library.
8. **Send to Video if it is a cover or insert.** Use "Send to Video" to put the still on the Video studio's media bin
   (see `video-studio-editing`).

## Target sizes

| Destination | Pixels | Notes |
|---|---|---|
| YouTube thumbnail | 1280x720 | avoid the bottom-right duration badge |
| X header | 1500x500 | avatar overlaps lower-left |
| X / LinkedIn in-feed | 1600x900 or 1080x1350 | |
| IG feed / carousel | 1080x1350 | 4:5 |
| Story / Reels / TikTok cover | 1080x1920 | keep text between y 250 and 1500 |
| Square | 1080x1080 | stickers, avatars |

## Driving it well as the agent

- Announce the plan in chat in one line before taking over ("Cropping to 4:5, +12% contrast, title top-left").
- One command per visible change, then `snapshot` to confirm the layer summary changed as expected.
- If a result returns `user_took_over`, stop immediately, do not retry, and ask what they want next.
- Use `highlight` on the export button rather than exporting when the user only asked to preview.

## Check before you finish

- [ ] Canvas is the exact destination size (check the snapshot summary or export dimensions).
- [ ] Subject and text sit inside the platform's safe area.
- [ ] Text is on its own layer, readable at phone size, contrast ≥ 4.5:1.
- [ ] Adjustments look natural: skin not orange, whites not blue, no crushed blacks.
- [ ] Exported in the right format and under the destination's file limit.
- [ ] AI-generated content keeps a disclosure where it will be posted (`ai-disclosure-and-provenance`).

## Pitfalls

- **Text before crop.** Titles end up clipped. Crop first, always.
- **Stacking presets.** Two presets compound into crunchy, oversaturated output; use one plus small adjustments.
- **Upscaling by cropping tight.** Cropping a 1024px render to a quarter and enlarging looks soft; upscale first
  (`upscaling-and-inpainting`).
- **JPEG for graphics.** Flat colours and small type get artifacts; export PNG.
- **Export strips provenance.** Re-saving drops embedded C2PA metadata; keep the original render and label the post.
- **Guessing params.** Command names are stable, params can change; read them from `snapshot` before calling.

## Related

- `color-grading` — consistent looks across a series
- `thumbnails` — crop, type and checks for 1280x720 covers
- `upscaling-and-inpainting` — fix and enlarge before finishing
- `dashboard-takeover` — how the ghost-cursor takeover works and how users stop it
- `video-studio-editing` — where exported stills go next
