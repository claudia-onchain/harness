---
name: memes
description: "Make memes that read instantly and travel: classic top/bottom text, two-panel reaction, labelled-object, caption-over-image and video memes. Use when someone asks \"make a meme about...\", \"turn this into a meme\", \"funny post for the community\", \"reaction image\", or needs shareable humour for a project or launch. Covers format choice, writing the joke (setup/turn in under 12 words), generating original base images instead of copyrighted templates, Photo studio text layers, video memes in the Video studio, and where the line is on likeness and mockery."
license: MIT
metadata:
  title: "Memes"
  category: "create"
  level: "beginner"
  tags: "memes, humour, reaction image, caption, community, shareable, photo studio, video meme"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Memes

A meme is a joke with a format the audience already knows how to read. The format does half the work, so keep the
words short, specific and true to the community's in-jokes. Build on original base images (generated or your own)
rather than ripping copyrighted stills, and never punch at a real private person.

## When to use

- "Make a meme about gas fees / Mondays / our launch / this bug."
- A community, token or product account needs light posts between announcements.
- Turning a screenshot, chart or clip into a reaction post.
- A short looping video joke for X, Telegram or Reels.

## Steps

1. **Find the observation.** The best memes name a shared, specific pain or pleasure: "approving a token and then
   reading the contract". Write it as setup + turn. Under 12 words total if possible.
2. **Pick the format that fits the joke's shape.**
   | Joke shape | Format | Canvas |
   |---|---|---|
   | Expectation vs reality | two-panel stacked | 1080x1350 |
   | Choosing between two things | labelled split / two buttons | 1080x1080 |
   | Escalation (3-4 steps) | vertical stack of panels, rising intensity | 1080x1350 |
   | One relatable reaction | caption bar on top + reaction image | 1080x1080 or 1080x1350 |
   | Labelling a scene | object labels on people/things | 1080x1080 |
   | Timing joke | 3-8 s video with caption bar | 1080x1920 or 1080x1080 |
3. **Make an original base image.** Describe the reaction or scene, not the copyrighted template:
   ```sh
   lumen gen image "Photo of an exhausted adult office worker slumped at a desk at 3am, face lit by three glowing monitors full of red candlestick charts, cold coffee, dramatic blue monitor light, candid documentary style, 35mm. No text." --model black-forest-labs/flux-3-image --aspect 1:1
   ```
   For a recurring mascot, pass its refs (`character-consistency`).
4. **Set the text in the Photo studio.** Classic look: bold condensed sans or Impact-style, white with a black
   outline, uppercase, top and/or bottom. Modern look: black text on a white caption bar above the image (sentence
   case, 48-64 px on 1080 wide).
   ```json
   dashboard { "op": "navigate", "route": "/studio/photo" }
   dashboard { "op": "command", "name": "photo.addText", "args": { "text": "me checking the chart \"one last time\"", "x": 40, "y": 40, "size": 56 } }
   ```
   Add a white shape layer behind for the caption-bar style.
5. **Read it cold.** Show it to yourself after 10 seconds away: is the joke clear without context? If you need to
   explain it in the post copy, rewrite the text.
6. **Video memes.** Put a 3-8 s clip (generated or your own) on the Video studio timeline, add the caption as a text
   or captions clip across the full duration, end on the punchline frame, export MP4.
   ```json
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "when the airdrop checker says 0", "start": 0, "end": 6 } }
   dashboard { "op": "command", "name": "video.export", "args": {} }
   ```
7. **Export and post with a short line.** PNG for text-heavy images. Post copy adds context or a tag, never repeats
   the meme's text. Add an AI label where the image is photoreal (`ai-disclosure-and-provenance`).

## Writing rules

- Specific beats generic: "approving unlimited USDC to a site called 'claim-rewardz'" over "being careless".
- Self-deprecating or shared-pain jokes travel; jokes at the audience's expense do not.
- One joke per image. Remove every word that is not the setup or the turn.
- Lowercase, casual phrasing reads as native on X and Telegram; uppercase reads as classic image macro.

## Check before you finish

- [ ] The joke is clear in under 3 seconds with no post copy.
- [ ] Base image is original or properly licensed; no ripped film/TV stills or watermarked templates.
- [ ] Text readable at phone size, within the canvas margins (≥ 40 px from edges).
- [ ] No real private person, no real person's likeness made to say or do things.
- [ ] Photoreal AI images carry a disclosure where required.
- [ ] Crypto memes make no price promises ("this goes 100x") and are not dressed as advice.

## Pitfalls

- **Explaining the joke.** Long captions kill it. Cut to the turn.
- **Copyrighted templates for brand accounts.** A personal shitpost is one thing; a project or company account using
  film stills invites takedowns. Generate your own base.
- **Punching down.** Mocking individuals, groups or victims of scams turns the community against you.
- **Deepfake reactions.** A real public figure's face on a fake reaction can mislead and breaks most platform rules.
- **Dated formats.** If you have to look up what the format means, the audience may not know it either.

## Related

- `captions-and-hooks` — short punchy copy and captions
- `photo-studio-editing` — text layers and export
- `sticker-and-emoji-packs` — turn a recurring reaction into stickers
- `social-posting-basics` — when and where to post
- `ai-disclosure-and-provenance` — labelling photoreal AI images
