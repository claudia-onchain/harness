---
name: carousels
description: "Plan and produce swipeable carousels for Instagram (1080x1350), LinkedIn document posts and X multi-image posts. Use when someone asks for \"a carousel\", \"slides for Instagram\", \"turn this thread into slides\", \"LinkedIn PDF post\", \"explain this in 7 slides\", or wants an educational or recap post. Covers the hook/value/CTA slide arc, slide counts, a reusable template in the Photo studio, generating consistent visuals, safe margins, export order and per-platform limits."
license: MIT
metadata:
  title: "Carousels"
  category: "create"
  level: "intermediate"
  tags: "carousel, instagram, linkedin, slides, 1080x1350, educational content, template, swipe"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Carousels

A carousel is a tiny slide deck people swipe with their thumb. Slide 1 sells the swipe, every middle slide pays out
one idea, the last slide tells them what to do. Build one template (margins, type sizes, colours, slide number), then
only the words and one visual change per slide.

## When to use

- Explaining a concept step by step ("how to revoke approvals in 5 steps").
- Turning a thread, blog post or video into a swipeable post.
- Recaps: a week's updates, a launch, an event in photos.
- LinkedIn document posts and Instagram educational posts.

## Steps

1. **Outline on one line per slide.** 5-10 slides is the sweet spot; Instagram allows up to 20, X shows up to 4
   images, LinkedIn document posts are PDFs.
   ```text
   1 HOOK     "5 signs a token is a honeypot"         (promise + number)
   2 CONTEXT  why it matters in one sentence
   3-7 VALUE  one sign per slide: headline + 1-2 lines + visual
   8 RECAP    the five in a checklist
   9 CTA      "save this before your next swap" + handle
   ```
2. **Fix the template.**
   | Spec | Instagram / LinkedIn |
   |---|---|
   | Canvas | 1080x1350 (4:5); 1080x1080 also works on both |
   | Margins | 80 px all round; keep text out of the bottom 120 px (dots/UI) |
   | Headline | 64-88 px, max 8 words, 2 lines |
   | Body | 36-44 px, max ~30 words per slide |
   | Slide number | 24-28 px, same corner every slide ("3/9") |
   | Palette | background + text + one accent (`brand-kit`) |
3. **Write the hook slide last.** It promises a specific outcome or number and creates a gap: "Most people miss #4".
   Big type, one visual, a swipe cue (arrow or "→") on the right edge.
4. **Generate consistent visuals.** Same style phrase and aspect on every slide, refs if a character or product
   recurs (`character-consistency`):
   ```json
   generate_image { "prompt": "Flat vector illustration, navy background, cyan and white accents, a padlock half-open with a warning triangle, generous empty space at the top for a headline, clean minimal style. No text.", "model": "openai/gpt-image-2.5-sunburst", "aspect": "4:5" }
   ```
   Keep the style phrase identical across the set; only the object changes.
5. **Assemble in the Photo studio.** Build slide 1 with background, image, headline, body and number layers. Export,
   then reuse the same layer layout for slide 2 by swapping text and image.
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "command", "name": "photo.addText", "args": { "text": "2. Sell tax over 10%", "x": 80, "y": 120, "size": 76 } }
   dashboard { "op": "command", "name": "photo.export", "args": { "format": "png" } }
   ```
   Name exports in order (`01-hook.png`, `02-context.png`...) so upload order is right.
6. **Make slides flow.** End a slide mid-thought or with "→" to pull the swipe; let an image or shape cross the edge
   into the next slide for a seamless panorama feel (split one 2160x1350 image into two 1080x1350 halves).
7. **LinkedIn: export a PDF.** Combine the PNGs into a PDF (shell needs approval), e.g.
   `img2pdf 0*.png -o carousel.pdf` if installed, then upload as a document with a title.
8. **Write the caption.** First line repeats the hook in different words; add the key takeaway and a soft CTA
   ("Which one have you seen?"). See `captions-and-hooks`.

## Check before you finish

- [ ] Hook slide states a specific promise and works as a standalone image.
- [ ] One idea per slide, ≤ 30 words of body text, readable on a phone.
- [ ] Same margins, fonts, colours and slide-number position on every slide.
- [ ] Files numbered and exported at 1080x1350 (or 1080x1080) in upload order.
- [ ] Facts on slides verified; crypto content says it is not financial advice.
- [ ] AI-generated visuals disclosed where the platform requires it.

## Pitfalls

- **Walls of text.** If a slide needs a paragraph, split it into two slides.
- **Weak slide 1.** A title like "Token safety tips" gets scrolled past; give a number and a stake.
- **Mixed aspect ratios.** Instagram crops every slide to the first slide's ratio; keep all slides identical.
- **Inconsistent visuals.** Different styles per slide look like stock collage; lock one style phrase.
- **Burying the CTA.** No last slide means no saves or follows; always close with one clear action.

## Related

- `captions-and-hooks` — hook lines and post captions
- `photo-studio-editing` — text layers and export
- `brand-kit` — the template's colours and fonts
- `character-consistency` — a recurring character across slides
- `social-posting-basics` — timing and cross-posting
