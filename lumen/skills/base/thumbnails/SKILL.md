---
name: thumbnails
description: "Design thumbnails and covers that get clicked: YouTube 1280x720, Shorts/Reels/TikTok 1080x1920 covers with the profile-grid crop, and feed stills. Use when someone asks \"make a thumbnail\", \"cover for this video\", \"why is my CTR low\", \"text got cut off on the grid\", or wants a recognisable series look. Covers the one-face-one-idea rule, prompting a cover still with space for text, adding type in the Photo studio, safe zones, the 168px legibility test and A/B variants."
license: MIT
metadata:
  title: "Thumbnails"
  category: "create"
  level: "intermediate"
  tags: "thumbnail, youtube, cover, reels cover, ctr, typography, safe zone, a/b test"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Thumbnails

A thumbnail is read in under a second at the size of a postage stamp. One subject, one emotion or object of
curiosity, at most four words, and a layout that survives every crop the apps apply. Generate the still with empty
space for text, set the words yourself in the Photo studio, then test it small.

## When to use

- Any YouTube long-form upload (custom 1280x720 thumbnail).
- Reels/TikTok/Shorts covers, especially series that live on a profile grid.
- Feed stills for X, LinkedIn, Threads or Telegram announcing a video.
- CTR is low, covers look cluttered, or text gets cut off.

## Steps

1. **Write the click idea in five words.** The thumbnail and title must not repeat each other: the title states the
   topic, the thumbnail shows the tension ("before/after", "the one mistake", a surprised face next to the object).
2. **Pick the canvas and its no-go zones.**
   | Where | Canvas | Keep clear | Text zone |
   |---|---|---|---|
   | YouTube long-form | 1280x720 (16:9), ≤ 2 MB JPG/PNG | bottom-right ~200x80 (duration badge) | left or right 45% |
   | Reels cover | 1080x1920 | grid shows centre 1080x1440 (3:4) | centred 1080x1350, y 300-1500 |
   | TikTok cover | 1080x1920 | right 120 px rail, bottom ~400 px | centre, y 250-1450 |
   | Shorts | a frame chosen in the app | | design a strong frame in the edit |
   | X/LinkedIn still | 1600x900 or 1080x1350 | | centre third |
3. **Generate the still with room for type.** Subject big (face 35-50% of frame height on 16:9), eyes to lens, one
   quiet side for text, strong subject/background separation. No text from the model:
   ```sh
   lumen gen image "Tight close-up of a surprised adult man holding a cracked hardware wallet up to the lens, his face on the right third, eyes to camera, raised eyebrows. Left 45 percent is a softly blurred dark-teal studio wall with calm empty space. Hard key light from camera right, rim light, 50mm f/2, punchy contrast. No text, no letters, no logos." --model black-forest-labs/flux-3-image --aspect 16:9
   ```
   Or a frame from your edit: pick the most expressive frame, not the first.
4. **Crop and grade in the Photo studio.**
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "command", "name": "photo.crop", "args": { "x": 0, "y": 0, "w": 1280, "h": 720 } }
   dashboard { "op": "command", "name": "photo.filter", "args": { "name": "contrast", "amount": 0.15 } }
   ```
   Push contrast and saturation slightly more than for a feed photo; thumbnails sit next to bright competitors.
5. **Set 1-4 words.** Heavy condensed sans, uppercase, 110-150 px tall on 1280x720 (150-190 px on 1080x1920),
   two lines max, one accent colour word. Add a dark gradient or shape layer behind text for ≥ 4.5:1 contrast.
   ```json
   dashboard { "op": "command", "name": "photo.addText", "args": { "text": "DON'T DO THIS", "x": 60, "y": 220, "size": 132 } }
   ```
6. **Run the small test.** Export, then look at it at 168x94 (YouTube's smallest) and at 320x180. If the words are
   not readable, cut words; do not shrink the font. Squint test: subject and text still separate?
7. **Export.** JPEG quality ~90 for YouTube (stay under 2 MB); PNG if it has fine type and the size allows.
   `dashboard { "op": "command", "name": "photo.export", "args": { "format": "jpeg" } }`
8. **Make an A/B pair.** Change one variable (expression, text, or colour), keep the rest. YouTube Studio's
   Test & Compare runs up to three thumbnails on one video; let it finish before deciding.

## Formulas that work

| Formula | Layout |
|---|---|
| Face + object | reaction face right third, the object large on the left, 2-3 words above the object |
| Before / after | split frame, arrow or divider, "BEFORE"/"AFTER" not needed if obvious |
| The number | huge numeral ("3", "$0") + face, no other text |
| Circle the thing | screenshot or scene with one red circle/arrow on the detail |
| Series template | fixed label position, colour and font; only still + title change |

## Check before you finish

- [ ] Exact canvas size; nothing important in the no-go zones from step 2.
- [ ] One subject, at most four words, readable at 168x94.
- [ ] Text is set by you (not model-rendered), contrast ≥ 4.5:1.
- [ ] Thumbnail adds information the title does not repeat.
- [ ] Vertical covers keep face and title inside the centred 1080x1350 band.
- [ ] Realistic AI imagery will be disclosed on upload (`ai-disclosure-and-provenance`).

## Pitfalls

- **Clickbait that the video does not deliver.** Viewers bounce and the platform learns it; show what is really in it.
- **Model-rendered words.** Garbled letters and untestable variants. Always add text as a layer.
- **Bottom-right text on YouTube.** The duration badge covers it.
- **Too much.** Three faces, five words and a logo read as noise at 168px.
- **Real people and logos.** No celebrity faces or third-party brand marks implying endorsement.
- **Price promises on crypto topics.** "100x", "guaranteed" in thumbnails is misleading and breaks platform ad rules.

## Related

- `photo-studio-editing` — crop, text and export mechanics
- `image-prompting-fundamentals` — the cover-still prompt
- `color-grading` — punchy but consistent series looks
- `captions-and-hooks` — the hook the thumbnail sets up
- `brand-kit` — fonts and colours for a series template
