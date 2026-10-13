---
name: product-mockups
description: "Makes product and merch mockups with Lumen: print-ready artwork at the right pixel size (300 DPI maths for tees, hoodies, posters, stickers, mugs), photoreal scene generation with generate_image, placing real artwork on blanks in the Photo studio with layers, perspective-safe composition, lifestyle versus packshot shots, and honest labelling of renders. Use when someone asks \"make a mockup\", \"put my logo on a t-shirt\", \"merch mockups\", \"product shot\", \"app screenshot in a phone\", \"show this design on a hoodie / mug / poster\" or \"store images for my merch\"."
license: MIT
metadata:
  title: "Product mockups"
  category: "create"
  level: "intermediate"
  tags: "mockups, merch, product photography, t-shirt, hoodie, poster, mug, print files, 300 dpi, photo studio, generate_image"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Product mockups

A mockup sells a product that may not exist yet, so it has two jobs: look real and show the actual design
accurately. Image models are good at the scene and bad at faithfully reproducing your exact logo or text. The one
idea that matters: generate the scene, place the real artwork yourself. Never let the model redraw the design a
customer is paying for.

## When to use

- "Put my logo / art on a t-shirt, hoodie, cap, mug, poster"
- "Make store images for my merch drop"
- "Show my app in a phone", "make a product shot for the landing page"
- Checking whether a design works on a product before ordering samples

## Steps

1. **Make the print file first.** Pixel size = inches x 300 DPI. Tee front 12 x 16 in = 3600 x 4800 px; large
   front 15 x 18 in = 4500 x 5400 px; poster 18 x 24 in = 5400 x 7200 px; 3 in sticker = 900 x 900 px. Transparent
   PNG, sRGB, no tiny details under about 1 mm (12 px at 300 DPI). Always confirm the print vendor's own template.
2. **Upscale honestly.** A 1024 px generation is a 3.4 in print at 300 DPI. Upscale with a proper upscaler (see
   `upscaling-and-inpainting`) or redraw as vector; changing the DPI tag does nothing.
3. **Generate the blank scene.** Ask for the product with a plain, flat, front-facing print area:
   ```
   generate_image { "prompt": "photoreal studio packshot of a plain heather grey crew-neck t-shirt, flat lay on
   light concrete, front facing, soft daylight, no logo, no text, no print", "model": "openai/gpt-image-2.5-sunburst", "aspect": "4:5" }
   ```
   Lifestyle shots: person wearing a plain hoodie, natural light, chest area facing camera, no text.
4. **Place the real artwork in the Photo studio.** `dashboard { "op": "navigate", "route": "/studio/photo" }`, load
   the scene, add the print file as an image layer, scale it to the real print area (a 12 in wide print on an adult
   tee covers most of the chest, not the whole shirt). If the layer panel offers opacity or blend controls, drop
   the art to 90-95% opacity (or multiply on light fabric) so folds show through.
5. **Match lighting and colour.** Use adjustments (brightness, contrast, saturation, slight blur 0.3-0.8 px on the
   art layer) so the print sits in the fabric rather than floating on top. Export with `photo.export`.
6. **Shoot a set.** Store listing: front packshot, back, detail close-up, lifestyle, colourway variants. Social:
   4:5 for feed, 9:16 for stories, 1:1 for marketplaces. Keep the same background and light across the set.
7. **Screens and devices.** For app mockups, generate a device in a scene with a blank screen, then place a real
   screenshot layer and crop to the screen bounds. Never present a generated fake UI as the real product.
8. **Label and order a sample.** Mark renders as mockups where buyers might assume photos. Order one physical
   sample before a large run; colours on fabric shift from screen.

## Print size cheat sheet

| Product | Print area | Pixels at 300 DPI |
|---|---|---|
| Tee front, standard | 12 x 16 in | 3600 x 4800 |
| Tee front, large | 15 x 18 in | 4500 x 5400 |
| Left-chest logo | 4 x 4 in | 1200 x 1200 |
| Poster | 18 x 24 in | 5400 x 7200 |
| Sticker | 3 x 3 in | 900 x 900 |

## Check before you finish

- [ ] Print file at full pixel size, transparent PNG, sRGB, checked against the vendor template
- [ ] The design in every mockup is the real artwork, not a model redraw; text spelled correctly
- [ ] Print scale is realistic for the product and size
- [ ] Lighting, folds and colour make the print sit in the material
- [ ] Set exported in the aspect ratios needed; renders labelled where they could be mistaken for photos

## Pitfalls

- **Letting the model draw the logo.** It will change letters, colours and proportions. Place it yourself.
- **Oversized prints.** Full-shirt art on a mockup that the vendor can only print at 12 in disappoints buyers.
- **Real brand blanks.** Visible third-party logos or trademarked designs on blanks cause takedowns. Plain blanks.
- **Low-resolution print files.** Fine on screen, blurry on fabric. Do the 300 DPI maths.
- **Over-perfect lifestyle shots.** Generated people with impossible hands or faces erode trust. Check every image.

## Related

- `photo-studio-editing` — layers, blend and adjustments for placing art
- `upscaling-and-inpainting` — getting artwork to print resolution
- `brand-kit` — colours and logo variants for merch
- `image-prompting-fundamentals` — scene prompts for packshots and lifestyle
- `ai-disclosure-and-provenance` — labelling renders honestly
