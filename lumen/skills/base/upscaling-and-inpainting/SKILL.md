---
name: upscaling-and-inpainting
description: "Enlarge images cleanly and fix or replace one region without regenerating the whole thing. Use when someone says \"make this bigger / higher res\", \"it's blurry\", \"fix the hands\", \"remove that object\", \"change only the shirt\", \"extend the background\" or \"outpaint to 16:9\". Covers reference-based edits with generate_image refs, patch-and-blend in the Photo studio (layers + eraser), outpainting by canvas extension, sensible upscale factors, ffmpeg lanczos for small enlargements, and quality checks."
license: MIT
metadata:
  title: "Upscaling and inpainting"
  category: "create"
  level: "intermediate"
  tags: "upscale, inpainting, outpainting, edit, retouch, refs, photo studio, patch"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Upscaling and inpainting

Most 2026 image models are edit models: pass the original as a ref, say exactly what changes and what must stay, and
you get a targeted fix. When the model touches more than you asked, generate just the patch and blend it in the Photo
studio with a layer and the eraser. Enlarge last, by the smallest factor that reaches the target size.

## When to use

- A render is 1024px but the destination wants 1920px or a 4K banner.
- One detail is wrong (hands, an earring, a typo on a sign, a stray object).
- Changing one element (outfit colour, background, product label) while keeping the rest.
- Extending a square image to 16:9 or 3:1 (outpainting) for a banner or thumbnail.

## Steps

1. **Decide: edit, patch, extend or enlarge.**
   | Problem | Method |
   |---|---|
   | One element wrong, rest fine | Ref edit (step 2) |
   | Edit model keeps changing other areas | Patch-and-blend (step 3) |
   | Need more canvas | Outpaint (step 4) |
   | Right image, too few pixels | Upscale (step 5) |
2. **Ref edit with a preserve list.** Original first in `refs`, instruction says what to change and what to keep:
   ```json
   generate_image { "prompt": "Edit image 1. Change only the mug colour to matte cobalt blue (#1f4fd1). Keep everything else identical: framing, light, steam, background, table texture.", "model": "openai/gpt-image-2.5-sunburst", "aspect": "4:5", "refs": ["/api/files/media/cup-v3.png"] }
   ```
   For text fixes, quote the exact string: `Replace the sign text with "OPEN LATE"`. For hands, give them a job:
   "her right hand holds the cup handle, five fingers, relaxed".
3. **Patch-and-blend when edits leak.** Generate the corrected version (step 2), then in /studio/photo stack the
   original on top of the corrected image as two layers. Use the eraser on the top layer only over the area to fix,
   with a soft edge, so the fix shows through and everything else stays pixel-identical. Export PNG.
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "snapshot" }
   ```
   The agent can set up layers and pick the eraser via targets in the snapshot; let the user do fine erasing by hand
   if precision matters, and `highlight` the area to work on.
4. **Outpaint by extending the canvas.** Place the original on a larger canvas (e.g. 1080x1080 centred on 1920x1080),
   export with the empty area, then pass it as a ref: "Extend image 1 to fill the empty left and right areas with
   matching wooden table and window light; keep the centre unchanged." Blend the seam with patch-and-blend.
5. **Upscale by the smallest needed factor.**
   - Best: re-render the approved image as a ref on a model that outputs larger sizes, with "same image, higher
     detail, identical composition".
   - Fine for ≤ 1.5x on photos: ffmpeg lanczos (shell needs approval):
     ```sh
     ffmpeg -i in.png -vf "scale=1920:-1:flags=lanczos" out.png
     ```
   - Never chain 2x upscales repeatedly; detail turns waxy and invented textures appear.
6. **Sharpen once, at the end.** A light sharpen in Photo studio after resizing; check at 100% for halos.
7. **Compare before/after at 100% and at phone size.** Flip the patch layer on and off; check edges, skin texture,
   repeated patterns and text.

## Edit instruction template

```text
Edit image 1. Change only [ELEMENT] to [NEW STATE, with HEX or quoted text].
Keep identical: [composition, subject identity, light direction, background, colours, text elsewhere].
Match the original grain and sharpness.
```

## Check before you finish

- [ ] Only the intended region changed (toggle layers or compare side by side).
- [ ] Faces, logos and text outside the fix are pixel-identical or visually unchanged.
- [ ] Seams are invisible at 100% zoom; no halo from sharpening.
- [ ] Final pixel size meets the destination exactly; upscale factor kept small.
- [ ] Edits that change meaning (removing people, altering events in a real photo) were not made, or are disclosed.
- [ ] Media spend for re-renders stayed within budget (jobs above `media.approveAboveUsd` need approval).

## Pitfalls

- **Vague edits.** "Fix it" re-imagines the whole image. Name the element, the new state and the preserve list.
- **Editing the edit of the edit.** Each pass softens and shifts colour. Always go back to the original as ref.
- **Upscaling garbage.** Enlarging a drifted face makes a bigger drifted face. Fix first, enlarge last.
- **Outpainting with a different light.** Say the light direction and time of day in the extend prompt.
- **Deceptive edits of real photos.** Removing or adding people/objects in news-like or documentary photos misleads;
  do not do it, and never edit someone else's photo to put words or acts on them.
- **Losing transparency.** Exporting JPEG flattens alpha; use PNG for stickers and cutouts.

## Related

- `photo-studio-editing` — layers, eraser and export
- `character-consistency` — fix drift on a recurring character
- `banners-and-collages` — where outpainting is used most
- `image-prompting-fundamentals` — writing the instruction clearly
- `product-mockups` — label and colour swaps on products
