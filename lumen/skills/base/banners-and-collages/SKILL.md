---
name: banners-and-collages
description: "Make profile banners, headers and multi-image collages at the exact sizes each platform crops to. Use when someone asks for \"an X header\", \"Twitter banner\", \"YouTube channel art\", \"LinkedIn background\", \"Discord/Twitch banner\", \"a collage of these photos\" or \"a mood board\". Covers 1500x500, 2560x1440 with the 1546x423 safe area, 1584x396 and more, generating wide art by outpainting, avatar overlap zones, grid collages with Photo studio layers, and export checks."
license: MIT
metadata:
  title: "Banners and collages"
  category: "create"
  level: "beginner"
  tags: "banner, header, x header, youtube channel art, linkedin banner, collage, mood board, layout"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Banners and collages

Banners are wide, get cropped differently on desktop and mobile, and have an avatar sitting on top of them. Design
for the safe area, not the full canvas: one focal element plus a short line of text, centred in the zone every device
shows. Collages are the opposite problem: many images, one grid, consistent gutters and grade.

## When to use

- New or refreshed X, YouTube, LinkedIn, Twitch or Discord profile art.
- A project or token community needs a header that matches its brand.
- Combining 3-9 photos into one post, a recap, or a mood board.
- A banner looks fine on desktop but the text is cut on mobile.

## Steps

1. **Pick the spec and mark the safe area.**
   | Banner | Canvas | Safe area / overlap |
   |---|---|---|
   | X header | 1500x500 (3:1) | avatar covers the lower-left (~x 0-400, y 300-500); mobile trims top/bottom ~60 px; keep text in the centre-right |
   | YouTube channel | 2560x1440, ≤ 6 MB | text and logo inside the centred 1546x423; TV shows all of it |
   | LinkedIn personal | 1584x396 (4:1) | photo covers lower-left; keep text right of centre |
   | LinkedIn company | 1128x191 | logo overlaps lower-left |
   | Twitch profile | 1200x480 | centre |
   | Discord server | 960x540 | centre; profile banner 680x240 |
2. **Generate wide art the safe way.** Models output 16:9 at most for many endpoints. Generate 16:9, then crop to
   3:1 or 4:1, or outpaint sideways (`upscaling-and-inpainting`). Prompt for a horizontal composition with empty
   centre-right space:
   ```sh
   lumen gen image "Wide panoramic header art: abstract flowing aurora ribbons in deep navy and electric cyan over a dark gradient, the left third darker and calm for an avatar, clean empty band across the centre-right for a title, soft glow, minimal, high resolution. No text." --model black-forest-labs/flux-3-image --aspect 16:9
   ```
3. **Crop to the exact canvas in the Photo studio.** A 16:9 render at 1920x1080 crops to 1920x640 (3:1), then resize
   to 1500x500:
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "command", "name": "photo.crop", "args": { "x": 0, "y": 220, "w": 1920, "h": 640 } }
   ```
   If the source is too small for the target (e.g. 2560 wide), upscale first.
4. **Add one line of text and a mark.** Name or tagline, 60-90 px on 1500x500, inside the safe area. Optional handle or
   URL smaller. Logo as an image layer. No more than two type sizes.
5. **Check overlaps.** Put a temporary circle shape layer where the avatar sits and a box for the mobile trim; nothing
   important underneath. Delete the guide layers before export.
6. **Export.** PNG for flat graphics and type, JPEG ~90 for photographic banners; check the platform size limit.

## Collages

7. **Choose a grid that fits the destination.**
   | Layout | Canvas | Cells (12 px gutters inside and around) |
   |---|---|---|
   | 2x2 feed | 1080x1350 | four 522x657 |
   | 3x3 recap | 1080x1080 | nine 344x344 |
   | 1 hero + 3 | 1080x1350 | hero 1056x800, three 344x514 below |
   | Story strip | 1080x1920 | three 1056x624 stacked |
8. **Build it with layers.** One image layer per cell, crop each to its cell size, align with the move tool, same
   gutter everywhere. Background shape layer in a neutral or brand colour shows through the gutters.
9. **Unify the grade.** Apply the same preset at the same amount to every cell (`color-grading`), or the collage
   looks like five different days. Lead image top-left or largest.
10. **Export once at full size**; add a small label layer if the images are AI-generated.

## Check before you finish

- [ ] Canvas matches the platform spec exactly.
- [ ] Text and logo inside the safe area; nothing under the avatar or mobile trim.
- [ ] Source resolution was enough (no visible softening at 100%).
- [ ] Collage gutters equal, cells aligned, one consistent grade.
- [ ] File under the platform's size limit; PNG used for type-heavy art.
- [ ] Photos of other people in a collage are yours to use or have permission.

## Pitfalls

- **Designing to the full canvas.** On YouTube, a 2560x1440 design with text at the edges disappears on desktop.
- **Busy art behind text.** Wide banners show at small heights on phones; a calm band behind text matters.
- **Stretching.** Never resize non-proportionally; crop or outpaint instead.
- **Tiny type.** A banner is seen at roughly a third of its pixel width on phones; under 40 px text vanishes.
- **Impersonation.** Do not copy another project's or person's banner style, logo or name; it misleads followers.

## Related

- `photo-studio-editing` — crop, layers and export
- `upscaling-and-inpainting` — outpaint 16:9 to 3:1 and enlarge
- `brand-kit` — colours, fonts and logo rules
- `color-grading` — one look across collage cells
- `carousels` — when the images should be swiped instead of tiled
