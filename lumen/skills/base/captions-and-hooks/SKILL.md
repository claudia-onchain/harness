---
name: captions-and-hooks
description: "Write the opening hook, the on-screen captions and the post caption that make a short or post work. Use when someone asks \"write a hook\", \"caption this video\", \"add subtitles\", \"what should the post say\", \"the first 2 seconds are boring\", or needs copy for X, TikTok, Instagram, YouTube, LinkedIn or Telegram. Covers the visual + text + spoken hook trio, 12 hook patterns, caption styles and sizes for 1080x1920, safe zones, timing rules, the Video studio captions track (video.addCaption), per-platform caption lengths, hashtags, CTAs and banned claims."
license: MIT
metadata:
  title: "Captions and hooks"
  category: "create"
  level: "beginner"
  tags: "hooks, captions, subtitles, copywriting, safe zone, hashtags, cta, shorts, post copy"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Captions and hooks

The first 1-2 seconds decide whether anyone sees the rest. A hook works when three things agree: what moves in the
frame, the words on screen, and the first spoken line. Captions then carry the video for the majority who watch on
mute, and the post caption gives one reason to comment, save or follow.

## When to use

- Scripting the opening of any short or video.
- Adding on-screen captions/subtitles in the Video studio.
- Writing post copy for one or more platforms.
- A video has a slow open or low retention in the first 3 seconds.

## Steps

1. **Write the hook trio.** Visual (something already in motion), on-screen text (≤ 7 words), spoken line (≤ 12
   words). They should say the same thing three ways, not three things.
   ```text
   VISUAL  thumb hovering over a wallet "Approve" button
   TEXT    I almost signed this
   SPOKEN  "This one popup nearly emptied my wallet."
   ```
2. **Pick a hook pattern.**
   | Pattern | Example |
   |---|---|
   | Mistake | "Stop doing this before every swap" |
   | Number | "3 checks that take 30 seconds" |
   | Contrarian | "Gas isn't why your swap failed" |
   | Curiosity gap | "Nobody reads line 4 of this contract" |
   | Result first | "I revoked 14 approvals. Here's why." |
   | Question | "Would you sign this?" |
   | POV | "POV: the airdrop link was a drainer" |
   | Before/after | "My wallet, before and after one setting" |
   | Story start | "At 2am I got a DM that said..." |
   | Challenge | "Spot the scam in 5 seconds" |
   | Myth | "'Verified' doesn't mean safe" |
   | How-to | "How to check any token in one minute" |
3. **Choose a caption style and size (1080x1920).**
   | Style | Use | Spec |
   |---|---|---|
   | Word-by-word highlight | talking to camera | bold sans 64-76 px, 1-3 words on screen, active word in accent colour, dark outline |
   | Line captions | voice-over | bold sans 56-64 px, ≤ 32 characters per line, 1-2 lines |
   | Hook title | first 2 s only | condensed bold 100-140 px, one accent word |
   | Boxed | busy backgrounds | 56-60 px on a 70-85% dark box |
4. **Place inside the safe zone.** On 1080x1920 keep all text between y ≈ 250 and y ≈ 1500 and x ≈ 60 to 960 (right
   rail icons and the bottom caption/UI block cover the rest). Spoken captions sit around y 1150-1400; the hook title
   in the upper-middle around y 350-700. For 16:9 YouTube, keep captions in the lower third above the progress bar.
5. **Time them.** Each caption 0.8-2.5 s on screen; break on natural phrases; never split a name or number across
   two captions; captions appear on the first frame of the word, not before.
6. **Add them in the Video studio.** One command per caption, or type them on the captions track:
   ```json
   dashboard { "op": "navigate", "route": "/studio/video" }
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "this popup", "start": 0.4, "end": 1.1 } }
   dashboard { "op": "command", "name": "video.addCaption", "args": { "text": "nearly emptied my wallet", "start": 1.1, "end": 2.4 } }
   ```
   If you have a transcript with word timings, the agent can batch these from it.
7. **Write the post caption per platform.**
   | Platform | Visible before "more" | Shape |
   |---|---|---|
   | X | 280 chars (longer for Premium) | hook line + one fact + soft question; 0-2 hashtags |
   | TikTok | ~100-150 chars | hook rephrased + 3-5 relevant hashtags |
   | Instagram | ~125 chars | hook line, value, CTA ("save this"); 3-5 hashtags |
   | YouTube Shorts | title ≤ 100, keep ~40-60 | title = the promise; description adds context |
   | LinkedIn | ~210 chars | first line hook, short lines, one question |
   | Telegram | no hard limit | hook + link, one emoji max for structure |
8. **End with one soft CTA.** A question people can answer in one word ("Which check do you skip?") beats "like and
   follow". Add required labels: AI-generated, #ad for paid posts, "not financial advice" on crypto topics.

## Check before you finish

- [ ] Visual, text and spoken hook agree and land within 2 s.
- [ ] Captions readable on mute, inside the safe zone, synced to speech.
- [ ] No caption longer than 2 lines or 32 characters per line.
- [ ] Post caption fits the platform's visible length and has one CTA.
- [ ] Labels present: AI disclosure, #ad if paid, "not financial advice" for crypto.
- [ ] No banned claims: guaranteed returns, price targets as promises, fake urgency, impersonation.

## Pitfalls

- **Hook and video disagree.** A bait hook the video never pays off kills watch time and trust.
- **Captions under the UI.** Bottom-placed subtitles get covered by the caption bar and buttons on every app.
- **Walls of caption text.** More than 3-4 words at once on vertical video is unreadable at swipe speed.
- **Auto-captions unchecked.** Names, tickers and numbers get misheard; proofread every line.
- **Hashtag stuffing.** 20 hashtags reads as spam; 3-5 specific ones work better.
- **Money promises.** "Easy 10x" in a hook is misleading and breaks platform rules for financial content.

## Related

- `storyboarding-shorts` — where the hook is planned
- `video-studio-editing` — the captions track and export
- `social-posting-basics` — when and where to post
- `ai-disclosure-and-provenance` — labels that go in the caption
- `thumbnails` — the cover that sets up the hook
