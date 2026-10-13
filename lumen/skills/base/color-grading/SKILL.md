---
name: color-grading
description: "Give images and video a consistent, intentional look: correct first, then grade. Use when someone asks \"make it look cinematic\", \"match these clips\", \"warmer / moodier / cleaner\", \"same look for the whole series\", \"why do my AI clips look different from each other\", or wants a preset for a brand. Covers correction vs grade, Photo studio adjustments and filter presets via photo.filter, grade words in generate_image / generate_video prompts, matching clips from different models, ffmpeg eq/curves/LUT recipes, skin-tone and contrast checks."
license: MIT
metadata:
  title: "Color grading"
  category: "create"
  level: "intermediate"
  tags: "color grading, color correction, look, lut, presets, adjustments, cinematic, consistency"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Color grading

Grading has two passes: correction makes the image neutral and consistent (exposure, white balance, contrast), then
the grade adds a look (warm highlights, cool shadows, muted greens). Correct every shot to the same baseline before
applying one look to all of them. Skin tones are the reference: if faces look wrong, the grade is wrong.

## When to use

- A series of posts, a carousel or a collage needs one look.
- Clips from different models (or AI plus phone footage) do not match in an edit.
- "Make it cinematic / warmer / film-like / cleaner."
- Defining a brand look that every future asset follows.

## Steps

1. **Pick the look in words and references.** One sentence: "warm, low-contrast morning light, creamy highlights,
   teal-leaning shadows, muted greens." Choose 2-3 reference frames; note mood, contrast level and colour split.
2. **Bake the look into generation when you can.** Put grade words in block 5 of the prompt, identical across the set:
   ```text
   ... soft window light, warm highlights and cool teal shadows, low contrast, lifted blacks, muted greens, fine film grain.
   ```
   For video, the same sentence goes in every `generate_video` prompt in the short. This reduces how far each output
   must be pushed later.
3. **Correct each image in the Photo studio.** In order: brightness (exposure), contrast, saturation, then hue only if
   there is a colour cast. Aim for neutral whites/greys and a full but not clipped tonal range.
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "snapshot" }
   dashboard { "op": "command", "name": "photo.filter", "args": { "name": "brightness", "amount": 0.06 } }
   dashboard { "op": "command", "name": "photo.filter", "args": { "name": "contrast", "amount": 0.1 } }
   ```
   Read adjustment and preset names from the snapshot's command schema.
4. **Apply one preset as the look, at reduced strength.** Presets at 100% are usually too strong; start around 40-70%
   and judge on skin and whites. Use the same preset and amount on every asset in the series; write them down.
5. **Finish with vignette and sharpen sparingly.** Vignette 10-25% to pull the eye in; light sharpen only after
   resizing. Blur belongs on background layers, not the whole frame.
6. **Match video clips.** The Video studio is for cutting; for grading clips, either (a) regenerate the outlier with
   the shared grade sentence, or (b) grade with ffmpeg via the `bash` tool (needs user approval):
   ```sh
   # gentle warm, low-contrast look
   ffmpeg -i in.mp4 -vf "eq=contrast=0.95:brightness=0.02:saturation=0.9,colorbalance=rs=0.04:bs=-0.03:rh=0.03:bh=-0.02" -c:a copy out.mp4
   # apply a .cube LUT you own
   ffmpeg -i in.mp4 -vf "lut3d=film-look.cube" -c:a copy out.mp4
   ```
   Then bring the graded files back into the Video studio media bin.
7. **Compare side by side.** Put a still from every shot next to each other (a Photo studio collage works). Check
   skin hue, black level and white balance match; fix the odd one out, not all of them.

## Looks cheat sheet

| Look | Contrast | Saturation | Colour split | Extras |
|---|---|---|---|---|
| Clean commercial | medium | natural | neutral | crisp whites, light sharpen |
| Warm film | low, lifted blacks | -10% | warm highlights, cool shadows | grain |
| Moody night | high | -15% | teal shadows, amber practicals | vignette 20% |
| Pastel lifestyle | low | -5%, bright | pink/peach highlights | high-key exposure |
| Bold social | medium-high | +10-15% | saturated primaries | thumbnail-friendly |
| Noir | high | 0 (monochrome) | none | grain, deep blacks |

## Check before you finish

- [ ] Each asset corrected to a neutral baseline before the look was applied.
- [ ] One preset and amount (or one ffmpeg chain) used across the whole set, and recorded.
- [ ] Skin tones look natural on every asset; no orange or grey faces.
- [ ] No clipped highlights or crushed blacks where detail matters.
- [ ] Side-by-side comparison shows consistent black level and white balance.
- [ ] Shell commands for ffmpeg were approved by the user before running.

## Pitfalls

- **Grading before correcting.** A look on top of a colour cast just makes a different cast.
- **Stacking presets.** Effects compound into crunchy, oversaturated output.
- **Judging on one screen at night.** Night-shift modes warm everything; check with it off, and on a phone.
- **Over-saturating thumbnails until skin glows.** Push contrast more than saturation.
- **Grading changes meaning.** Darkening a real scene to look sinister or altering colours in documentary images can
  mislead; keep news-like images honest.

## Related

- `photo-studio-editing` — the adjustment and preset controls
- `video-studio-editing` — where graded clips are assembled
- `brand-kit` — record the look as part of the brand
- `image-prompting-fundamentals` — grade words in prompts
- `banners-and-collages` — one look across many images
