---
name: character-consistency
description: "Keep the same character, mascot or product looking identical across many images and video clips. Use when someone says \"make her look the same in every post\", \"the face keeps changing\", \"build a mascot\", \"same product in new scenes\", or plans a series, comic, carousel or short with a recurring subject. Covers the locked identity block, a reference sheet, refs on generate_image / generate_video, image-to-video first frames, a 7-point drift check and fixing drift with edits instead of re-rolls."
license: MIT
metadata:
  title: "Character consistency"
  category: "create"
  level: "intermediate"
  tags: "character, mascot, reference sheet, identity block, refs, drift, series, image to video"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Character consistency

Consistency comes from two things kept fixed: the exact same identity text, pasted verbatim, and the same small set of
approved reference images passed as `refs` on every call. Everything else (pose, setting, light) may change. Score each
output against the sheet and fix drift with a targeted edit rather than gambling on re-rolls.

## When to use

- A recurring mascot, original character or brand avatar across posts, comics or shorts.
- The same product shown in new scenes (lifestyle, mockups, ads).
- A carousel or storyboard where one subject appears in every frame.
- "The face / outfit / logo keeps changing between images."

## Steps

1. **Write the identity block once.** 40-80 words, physical and fixed, no mood words. Give it a version tag and keep
   it in a file (or `memory_save`) so nobody retypes it from memory:
   ```text
   [MIRA ID v1] Mira, an adult woman in her early thirties, warm olive skin, short copper curls cut above the ears,
   round tortoiseshell glasses, a small gold hoop in the left ear only, freckles across the nose, wearing a mustard
   corduroy overshirt over a white tee.
   ```
   For a product: dimensions, materials, colours with HEX, logo position, label text in quotes.
2. **Generate a reference sheet.** Four to six neutral shots on a plain background, same light: front, three-quarter
   left, three-quarter right, profile, full body, one expression. Use a reference-strong model:
   ```json
   generate_image { "prompt": "[MIRA ID v1] Character reference sheet, front view, neutral expression, plain light-grey studio backdrop, even softbox light, 50mm, full head and shoulders. No text.", "model": "google/gemini-nano-banana-2.1", "aspect": "1:1" }
   ```
   Pick the best front render, then feed it back as a ref for the other angles so the sheet converges.
3. **Approve and freeze the refs.** Keep 2-4 approved images (front + three-quarter + full body). Note their paths in
   ~/.lumen/media/ or /library. Every later call passes the same refs, in the same order.
4. **Prompt scenes as identity + delta.** Identity block first, verbatim, then only what changes:
   ```sh
   lumen gen image "[MIRA ID v1] ... sitting at a café counter, laughing, holding a paper cup with both hands, morning window light, 50mm f/2.8. No text." --model google/gemini-nano-banana-2.1 --aspect 4:5
   ```
   With the tool, add `"refs": ["<front.png>", "<three-quarter.png>"]`. Use 50-85mm lenses; wide lenses distort faces.
5. **Run the 7-point drift check on every output.** Score 1 per match: face shape, hair (cut + colour), eyes/glasses,
   skin tone and marks, signature accessory (left ear hoop), wardrobe, proportions/age. Publish 7/7; 6/7 gets an edit;
   5/7 or less gets regenerated with stronger refs.
6. **Fix drift with an edit, not a re-roll.** Pass the drifted image as the first ref plus the front ref, and name only
   the change: "Keep everything identical. Change only the earring: one small gold hoop in the left ear, none in the
   right." See `upscaling-and-inpainting` for patch-and-blend in the Photo studio.
7. **Carry it into video with first frames.** Generate the opening still with the refs, approve it at 7/7, then use it
   as the image-to-video ref so the clip starts on-model:
   ```json
   generate_video { "prompt": "[MIRA ID v1] She looks up from the cup and smiles at the lens, slow push-in, morning light.", "model": "kwaivgi/kling-v3.0-pro", "aspect": "9:16", "durationSec": 5, "refs": ["<approved-first-frame.png>"] }
   ```
   Keep clips short (4-6 s); identity drifts most in long takes and fast turns.
8. **Keep a continuity log.** One line per asset: ID version, refs used, model, score, file. When the design changes,
   bump to `v2` and regenerate the sheet; never mix versions in one series.

## Continuity rules for a series

- Same wardrobe within a scene; change outfits only at scene breaks, and add the new outfit to the block.
- Keep screen direction: if she exits right, she enters the next shot from the left.
- One light story per scene (window light stays window light across all its frames).
- Props that matter (the mug, the glasses) are named in every prompt where they appear.

## Check before you finish

- [ ] Identity block versioned and pasted verbatim (diff it against the saved file).
- [ ] The same 2-4 approved refs passed in the same order on every call.
- [ ] Every published image scored 7/7 on the drift check.
- [ ] Video clips start from an approved first frame and stay ≤ 6 s per generation.
- [ ] Continuity log updated with model, refs and score per asset.
- [ ] The character is original: no real person's likeness, no copyrighted character.

## Pitfalls

- **Paraphrasing the block.** "Copper curls" vs "ginger curly hair" is enough to drift. Copy, do not retype.
- **Too many refs.** Five mismatched refs average into a stranger. Two to four approved ones beat ten.
- **Mood words in identity.** "Cute", "edgy", "young-looking" change the face. Keep the block physical; for adult
  characters state the adult age explicitly.
- **Switching models mid-series.** Each model renders the same text differently; finish a series on one model.
- **Group shots.** Faces merge when two characters share a frame; generate them separately and composite in the
  Photo studio with layers.
- **Lookalikes.** A "consistent character" modelled on a real person is impersonation. Keep it fictional.

## Related

- `image-prompting-fundamentals` — the five-block formula the identity block slots into
- `upscaling-and-inpainting` — targeted fixes for a drifted detail
- `storyboarding-shorts` — continuity across a shot list
- `comics` — panels with a recurring cast
- `pfp-sets` — consistent avatar collections
