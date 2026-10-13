---
name: sticker-and-emoji-packs
description: "Makes sticker packs and custom emoji for Telegram, Discord and WhatsApp with Lumen: an expression list, one consistent style from a character sheet and style anchor, transparent-background generation with generate_image, cleanup and outlines in the Photo studio, legibility checks at 100 px, and exports to each platform's size and file limits (Telegram 512 px, Discord 128 px emoji and 320 px stickers, WhatsApp 512 px WEBP). Use when someone asks \"make a sticker pack\", \"custom emoji for my Discord\", \"Telegram stickers\", \"reaction stickers for our community\" or \"emoji set for my coin / mascot\"."
license: MIT
metadata:
  title: "Sticker and emoji packs"
  category: "create"
  level: "intermediate"
  tags: "stickers, emoji, telegram, discord, whatsapp, mascot, expressions, transparent png, webp, community, reactions"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Sticker and emoji packs

Stickers are a community's vocabulary: the reactions people reach for many times a day. They are seen at roughly
100 px, often on dark mode, next to someone else's art. The one idea that matters: design for 100 px first. Bold
shapes, one big expression, a thick outline, and at most two words of text. Anything subtler vanishes.

## When to use

- "Make a sticker pack / emoji set" for a Telegram group, Discord server or WhatsApp
- A mascot, agent or coin community needs reaction stickers
- An existing pack looks inconsistent (different styles, line weights, sizes)
- Turning a character sheet into daily-use reactions

## Steps

1. **Write the expression list.** 12-30 items people actually use: yes, no, lol, love, wow, sad, angry, thinking,
   gm, gn, thanks, wen, ship it, facepalm, celebrating, sleeping, plus 3-5 in-jokes specific to the community.
   Write each as a pose plus an expression, not just a word.
2. **Lock the character and style.** Use the existing character sheet or make one (see `character-consistency`).
   Pick one approved sticker as the style anchor: line weight, colour palette, shading level and outline.
3. **Generate on a flat background.** One sticker per call, with the anchor as a reference where the model supports
   refs:
   ```
   generate_image { "prompt": "<character> sticker, laughing with eyes closed, die-cut sticker style, thick white
   outline, bold flat colours, centred, plain solid green background, no text", "model": "google/gemini-nano-banana-2.1", "refs": ["<anchor url>"] }
   ```
   A solid flat background is easier to remove than "transparent" from models that cannot output alpha.
4. **Clean up in the Photo studio.** Remove the background (eraser or a background-removal tool), check edges at
   200% zoom, add a uniform 6-10 px white outline if missing, and add short text with `photo.addText` in a bold,
   licensed font, never generated lettering. Export PNG with transparency (`photo.export`).
5. **Check at real size.** Preview every sticker at 100 px and 128 px on light and dark backgrounds, side by side.
   Redo any where the expression or text is not readable. Make line weights and character scale consistent.
6. **Export per platform.** Use the table below. Batch resize with ffmpeg or ImageMagick via `bash` (writing files
   needs approval), for example `ffmpeg -i in.png -vf "scale=512:512:force_original_aspect_ratio=decrease" out.png`.
7. **Upload and name.** Telegram: the official @Stickers bot (one emoji per sticker, pack link name). Discord:
   Server Settings, Emoji or Stickers (names 2-32 chars, letters, numbers, underscores). WhatsApp: a sticker-maker
   app. Announce the pack and note it is AI-assisted.

## Platform specs (check the platform before upload; limits change)

| Platform | Type | Size | Format and limit |
|---|---|---|---|
| Telegram | static sticker | one side exactly 512 px, other at most 512 | PNG or WEBP, transparent |
| Telegram | video sticker | 512 px side | WEBM VP9, at most 3 s, at most 256 KB, no audio |
| Telegram | custom emoji | 100 x 100 | PNG, WEBP or WEBM |
| Discord | emoji | 128 x 128 | PNG or GIF, at most 256 KiB |
| Discord | server sticker | 320 x 320 | PNG, APNG or Lottie, at most 512 KiB |
| WhatsApp | sticker | 512 x 512 | WEBP, at most 100 KB static, 3-30 per pack, 96 px tray icon |

## Check before you finish

- [ ] Every expression reads at 100 px on light and dark backgrounds
- [ ] One style: same line weight, outline, palette and character scale across the pack
- [ ] Clean transparent edges with no leftover background halo
- [ ] Text spelled correctly, in a licensed font, two words or fewer
- [ ] Each export meets the platform's size and file limit; names valid

## Pitfalls

- **Fine detail.** Hair strands, small props and thin lines disappear. Exaggerate the face and pose.
- **Inconsistent generations.** Without an anchor reference, the pack drifts in style by sticker five.
- **Halo edges.** Background colour fringes show on dark mode. Check edges zoomed in.
- **Using someone else's character or brand.** Stickers of real people, celebrities or trademarked mascots invite
  takedowns. Original characters only, or ones you have rights to.
- **Over-sized files.** Discord and WhatsApp reject files over the limit silently or with vague errors. Check sizes.

## Related

- `character-consistency` — keeping the mascot on-model
- `photo-studio-editing` — cleanup, outlines and text
- `memes` — community humour that becomes stickers
- `pfp-sets` — avatars from the same character
- `brand-kit` — palette and style rules
