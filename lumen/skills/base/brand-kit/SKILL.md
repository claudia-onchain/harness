---
name: brand-kit
description: "Builds a compact, reusable brand kit with Lumen: positioning in one line, logo and mark variants, a colour palette with hex values and WCAG contrast checks, type pairing, image style prompts and a style anchor for generate_image, voice and tone rules, a sonic logo, and export sizes, saved so every later asset matches. Use when someone asks \"make a brand kit\", \"brand guidelines\", \"pick colours and fonts\", \"design a logo\", \"brand identity for my project / coin / agent\", \"make everything look consistent\" or \"style guide\"."
license: MIT
metadata:
  title: "Brand kit"
  category: "create"
  level: "intermediate"
  tags: "brand kit, brand identity, logo, palette, colours, typography, style guide, voice and tone, contrast, style anchor"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Brand kit

A brand kit is the short list of decisions that makes every asset look like it came from the same place: a mark,
a palette, two typefaces, an image style, a voice and a sound. The one idea that matters: fewer, stricter rules
beat a long guideline nobody reads. One page, saved where the agent will load it every time it makes something.

## When to use

- "Make a brand kit / style guide / brand identity"
- "Pick colours and fonts", "design a logo for my project, coin or agent"
- Assets across X, Telegram, YouTube and the site have drifted apart
- Before a launch, a rebrand, or a batch of thumbnails, banners and stickers

## Steps

1. **Positioning first.** One sentence: who it is for, what it does, why it is different. Three personality
   adjectives and three anti-adjectives ("playful, sharp, honest / not corporate, not casino, not cute").
   Everything below is judged against these.
2. **Logo and mark.** Explore with `generate_image { "prompt": "minimal flat vector logo mark for <idea>, single
   bold shape, 2 colours, centred on plain background, no text", "model": "black-forest-labs/flux-3-image" }`.
   Generate 8-12, shortlist 3, refine one. Wordmarks: generate the mark only and set the name in a real font in the
   Photo studio (`photo.addText`), since generated lettering is unreliable. Required variants: full lockup, mark only,
   mono black, mono white, and a square avatar version.
3. **Palette with numbers.** 1 primary, 1 accent, 2-3 neutrals (near-black, near-white, a grey). Write hex values.
   Check text contrast: 4.5:1 minimum for body text, 3:1 for large text and UI shapes (WCAG AA). Test primary on
   both neutrals; if it fails, darken it for text use and keep the bright version for fills.
4. **Type pairing.** One display face for headlines, one readable sans or serif for body, both with open licenses
   (for example from Google Fonts). Define sizes: headline, subhead, body, caption, plus a minimum on-image size.
5. **Image style and style anchor.** Write a reusable style prompt block (medium, lighting, palette, texture,
   composition, what to avoid) and pick one approved image as the style anchor reference. Example block:
   `flat vector illustration, bold outlines, primary #5B5BF7 and accent #FFB020 on off-white, soft grain, centred
   subject, generous negative space, no gradients, no text`.
6. **Voice and tone.** Five rules with do/don't examples ("say 'you', not 'users'", "no price predictions", "one
   emoji max"). Include words to avoid. Note that brand copy is never financial advice.
7. **Sound.** A sonic logo and notification sound that match the adjectives (see `sonic-branding`).
8. **Save it where it gets used.** Write the kit to a file the user owns (for example `brand/BRAND.md` plus asset
   folders) and `memory_save` the palette, fonts and style block so future image, video and social tasks load them.

## Kit sheet

| Item | Decision |
|---|---|
| One-liner | who / what / why different |
| Adjectives | 3 yes, 3 no |
| Logo | lockup, mark, mono black, mono white, avatar (SVG + 2048 px PNG) |
| Palette | primary, accent, 2-3 neutrals with hex and contrast ratios |
| Type | display + body, sizes, minimum on-image size |
| Image style | style block + anchor image + banned looks |
| Voice | 5 rules with examples, banned words |
| Sound | sonic logo, notification |

## Check before you finish

- [ ] Logo reads at 32 px and in one colour; all five variants exported
- [ ] Every text-on-colour pairing meets 4.5:1 (body) or 3:1 (large), with ratios written down
- [ ] Fonts are licensed for commercial use; files or links stored with the kit
- [ ] Style block plus anchor image produce on-brand results on three different test prompts
- [ ] Kit saved to a file and to memory; the user approved the final choices

## Pitfalls

- **Too many colours.** Six "brand colours" means no brand colour. One primary, one accent.
- **Generated text in logos.** Misspellings and warped letters. Set type yourself.
- **Resembling a famous mark.** Check the shortlist against well-known brands and tokens; trademark trouble and
  scam associations follow lookalikes.
- **Unlicensed fonts.** A font that looks free on a mockup site can be personal-use only.
- **Guidelines nobody loads.** If the kit is not in memory or a known file, the next asset ignores it.

## Related

- `image-prompting-fundamentals` — writing the style block that drives generation
- `character-consistency` — keeping a mascot on-model across assets
- `pfp-sets` — avatars that follow the kit
- `banners-and-collages` — applying the kit to headers and promos
- `sonic-branding` — the audio side of the identity
