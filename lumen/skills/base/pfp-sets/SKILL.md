---
name: pfp-sets
description: "Designs profile pictures and matching avatar sets with Lumen: circle-safe composition that still reads at 32 px, a 2048 px square master, platform exports (X, YouTube, Discord, Telegram, Farcaster), allowed seasonal or event variants, and community pfp sets with traits from one character, generated with generate_image and finished in the Photo studio. Use when someone asks \"make a pfp\", \"profile picture for my agent / project / coin\", \"matching avatars across platforms\", \"pfp collection with traits\", \"holiday version of our pfp\" or \"my avatar is unreadable when small\"."
license: MIT
metadata:
  title: "PFP sets"
  category: "create"
  level: "beginner"
  tags: "pfp, avatar, profile picture, circle crop, traits, community, character, x, discord, telegram, farcaster"
  version: "1.0.0"
  updated: "2026-10-13"
---

# PFP sets

A profile picture is mostly seen as a 32-48 px circle in a reply thread. The one idea that matters: design for the
small circle and make one strong silhouette with high contrast against a flat background. If the avatar is
recognisable as a blurred 32 px dot, it works everywhere; if it needs detail to read, it fails where it is seen most.

## When to use

- "Make a pfp / avatar" for an agent, project, coin, creator or bot
- "Make our avatars match across X, Discord, Telegram and YouTube"
- "Holiday / event / launch version of the pfp"
- A community wants a pfp set with traits from a shared character

## Steps

1. **Pick the face.** Head and shoulders or a single mark, centred, filling about 60-70% of the circle. One
   dominant colour for the background (from the brand palette), one contrasting colour for the subject.
2. **Generate candidates on a square canvas.**
   ```
   generate_image { "prompt": "<character> head and shoulders portrait, centred, facing slightly left, bold flat
   colours, thick clean outlines, plain solid #5B5BF7 background, high contrast, no text", "aspect": "1:1" }
   ```
   Generate 6-10, shortlist 3. Use `character-consistency` refs if the character already exists.
3. **Run the small-circle test.** Preview each candidate cropped to a circle at 400, 96, 48 and 32 px on light
   and dark UI. Kill anything where the face merges with the background, the subject is off-centre, or important
   parts sit in the corners the circle cuts.
4. **Finish the master in the Photo studio.** Clean edges, fix eyes and hands, strengthen contrast, keep a safe
   margin of about 10% inside the circle. Upscale to a 2048 x 2048 master (see `upscaling-and-inpainting`) and
   export PNG with `photo.export`.
5. **Export per platform.** X 400 x 400 (upload under 2 MB), YouTube 800 x 800, Discord at least 128 px (upload
   512 or larger), Telegram 512 px or larger, Farcaster and most others 400-1000 px square. Keep one master,
   resize down only.
6. **Define what can vary.** Lock: face shape, palette, line style, pose. Allow: background colour, one accessory
   (hat, glasses), seasonal props. Name variants (`pfp_main`, `pfp_halloween_2026`) and record when each runs.
7. **Community sets with traits.** Same base character and pose; vary 4-6 trait layers (background, outfit,
   headwear, eyewear, expression, accessory) with 4-10 options each. Generate traits as consistent layers or
   finish in Photo studio layers so combinations line up. Check every combination still passes the 32 px test.
8. **If minting is involved.** Research and art only here; any mint or deploy goes through `send_tx` with a
   simulated preview and explicit human approval, and never on unverified contracts.

## Platform export sheet

| Platform | Export | Shown as |
|---|---|---|
| X | 400 x 400, under 2 MB | circle |
| YouTube | 800 x 800 | circle |
| Discord | 512 x 512 | circle |
| Telegram | 512 x 512 or larger | circle |
| Farcaster, Bluesky | 1000 x 1000 | circle |
| Master | 2048 x 2048 PNG | archive |

## Check before you finish

- [ ] Recognisable as a 32 px circle on light and dark backgrounds
- [ ] Nothing important cut by the circle crop; about 10% safe margin
- [ ] 2048 px master saved; every platform export resized from it, not from each other
- [ ] Locked versus variable elements written down; variants named
- [ ] Original character or one you have rights to; no real person's likeness without consent

## Pitfalls

- **Full-body shots.** At 48 px they are a smudge. Face large, body cropped.
- **Busy backgrounds.** Scenery behind the subject kills contrast. Flat colour or a simple gradient.
- **Text in the avatar.** Unreadable at small sizes and generated letters are often wrong. Leave text out.
- **Copying a famous collection's style.** Close derivatives of well-known pfp collections invite takedowns and
  look like scams. Make the character your own.
- **Changing the pfp too often.** Recognition builds over months. Variants should be obviously the same character.

## Related

- `character-consistency` — keeping one face across every variant
- `brand-kit` — palette and style rules the avatar follows
- `sticker-and-emoji-packs` — reactions from the same character
- `image-prompting-fundamentals` — prompts for clean, high-contrast portraits
- `nft-research` — due diligence before minting or buying a collection
