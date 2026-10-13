---
name: comics
description: "Makes comic strips, four-panel gags, carousel comics and vertical webtoon episodes with Lumen: a panel script (setup, development, turn, payoff), a character sheet and style anchor so faces and outfits stay consistent, text-free panel generation with generate_image, lettering and balloons in the Photo studio, and exports at 1080x1350 strips or 800 px webtoon slices. Use when someone asks \"make a comic\", \"four-panel comic\", \"comic strip about\", \"webtoon episode\", \"manga-style panels\", \"carousel comic\" or \"tell this story in panels\"."
license: MIT
metadata:
  title: "Comics"
  category: "create"
  level: "intermediate"
  tags: "comics, comic strip, four panel, webtoon, manga, panels, lettering, speech balloons, character sheet, carousel"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Comics

A comic is timing on paper: the reader controls the pace, and the gutter between panels does half the storytelling.
Image models can draw a panel; they cannot keep a character consistent or letter dialogue reliably on their own. The
one idea that matters: generate panels with no text, then letter them yourself. It keeps faces clean, spelling
correct and dialogue editable after the art is done.

## When to use

- "Make a comic / comic strip / four-panel gag about X"
- "Turn this thread or story into a carousel comic"
- "Webtoon episode", "manga-style panels"
- A mascot or agent needs recurring story content

## Steps

1. **Write the script before any art.** Four-panel structure: 1 setup (who, where), 2 development (the situation
   escalates), 3 turn (the surprise), 4 payoff (reaction or punchline). Per panel write: shot (wide, medium, close),
   action, expression, dialogue (under 15 words per balloon, at most 2 balloons). Read it as text; if it is not
   funny or clear as a script, art will not fix it.
2. **Build the character sheet.** For each recurring character: front and three-quarter views, 3 expressions, outfit
   and colours written as a fixed prompt block. Generate it once (see `character-consistency`) and pick a style
   anchor panel: line weight, shading, palette.
3. **Generate panels without text.** One call per panel, same style block, character refs where supported:
   ```
   generate_image { "prompt": "comic panel, medium shot, <character block> looking shocked at a laptop, office at
   night, clean ink lines, flat colours, empty space at top for a speech balloon, no text, no letters", "refs": ["<sheet url>"], "aspect": "1:1" }
   ```
   Ask for empty space where balloons will go. Regenerate a panel rather than accepting a wrong face.
4. **Assemble the layout.** In the Photo studio (`/studio/photo`) on a 1080 x 1350 canvas: 2 x 2 grid for a
   four-panel strip, 20-30 px gutters, consistent borders. For carousels, one panel per 1080 x 1350 slide. For
   webtoons, an 800 px wide column, panels stacked with bigger gaps for pauses, sliced into 800 x 1280 images.
5. **Letter it.** `photo.addText` for dialogue in a comic font (licensed), at least 30 px on a 1080 px strip and
   never under 22 px at final size. Balloons as shapes with tails pointing at the speaker's mouth. Place balloons in
   reading order (left to right, top to bottom), never over faces. Sound effects can be larger and stylised.
6. **Read it at phone size.** Shrink the strip to the width it will appear in the feed. Can you read every balloon?
   Does the punchline land in panel 4 and not get spoiled by panel 3? Fix and re-export with `photo.export`.
7. **Publish with context.** Title, alt text describing each panel for accessibility, and an AI-assisted label.

## Formats

| Format | Canvas | Panels | Notes |
|---|---|---|---|
| Four-panel strip | 1080 x 1350 | 2 x 2 | one image, feed friendly |
| Carousel comic | 1080 x 1350 per slide | 1 per slide, 4-10 slides | swipe is the gutter |
| Webtoon episode | 800 px wide column | 20-60 panels | slice to 800 x 1280 |
| Single gag | 1080 x 1080 | 1 | caption below, not inside |

## Check before you finish

- [ ] Script works as text alone; the turn is in panel 3 and the payoff in panel 4
- [ ] Characters match the sheet in every panel (face, hair, outfit, colours)
- [ ] All lettering is typed, spelled correctly, at least 22 px at final size, in reading order
- [ ] No balloon covers a face or key action; tails point at the right speaker
- [ ] Exported at the right canvas, with alt text and an AI-assisted label

## Pitfalls

- **Generated speech bubbles.** Models write gibberish text. Always "no text", then letter.
- **Too many words.** Over 25 words in a panel means it should be two panels.
- **Drifting characters.** Without a sheet and refs, the hero changes hair colour by panel 3.
- **Spoiling the joke.** If the art in panel 3 shows the punchline, readers see it before reading. Hide the reveal.
- **Using real people or known characters.** Parody of public figures and trademarked characters carries risk;
  original casts are safer.

## Related

- `character-consistency` — sheets and refs for a stable cast
- `storyboarding-shorts` — the same panel thinking for video
- `photo-studio-editing` — layout, balloons and lettering tools
- `carousels` — publishing comics as swipeable posts
- `memes` — single-panel humour formats
