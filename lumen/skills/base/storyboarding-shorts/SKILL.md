---
name: storyboarding-shorts
description: "Plan a 15-60 second vertical short before spending money on video generation: premise and payoff, hook/build/payoff timing, a shot list sized to real model durations, cheap storyboard stills, a rough animatic in the Video studio and a budget a person approves. Use when someone says \"make a short about...\", \"plan a TikTok/Reel/Short\", \"how much will this video cost\", \"turn this script into shots\", or before any multi-clip generate_video run."
license: MIT
metadata:
  title: "Storyboarding shorts"
  category: "create"
  level: "intermediate"
  tags: "storyboard, shot list, shorts, reels, tiktok, animatic, budget, beat sheet, 9:16"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Storyboarding shorts

A 20-second short is four to six separate AI generations, each with its own first frame, camera move and sound.
Planning on stills costs cents; finding a structural problem after rendering costs dollars. Board it, watch it as a
rough animatic with the voice line, get the budget approved, then generate.

## When to use

- Any short with more than one shot, or a single shot longer than 10 s.
- "How much will this video cost?"
- Turning a script, thread or idea into a list of clips.
- A series episode that needs continuity with earlier ones.

## Steps

1. **Write premise, payoff, length and platform.**
   ```text
   PREMISE  A first-time user nearly signs a scam approval, then catches it.
   PAYOFF   She revokes it and smirks: "not today."
   LENGTH   22 s   ASPECT 9:16 (1080x1920)   PLATFORMS TikTok, Reels, Shorts
   ```
   No one-line payoff, no short.
2. **Use the three-act timing.**
   | Act | 15 s | 22 s | 30-60 s | Job |
   |---|---|---|---|---|
   | Hook | 0-2 s | 0-2 s | 0-3 s | motion + curiosity in frame 1, hook text on screen |
   | Build | 2-12 s | 2-18 s | 3-50 s | 2-4 beats, each new information; escalate |
   | Payoff + loop | 12-15 s | 18-22 s | last 5 s | the reveal/line; last frame flows into the first |
   Retention rule: a new visual event every 2-4 s (cut, gesture, text change).
3. **Turn beats into shots.** One shot = one action + one camera move + one generation, 4-8 s each (most models
   cap around 10 s). Inserts (a screen, a prop) can be stills with a slow zoom in the edit at no video cost.
4. **Write the shot list.** One row per shot, generation length 0.5-1 s longer than play length:
   ```text
   shot | play_s | gen_s | framing      | camera        | action                         | audio        | model
   s1   | 2.0    | 4     | CU phone     | static        | thumb hovers over "Approve"    | tense synth  | seedance-2.5
   s2   | 4.0    | 5     | MCU face     | slow push-in  | her eyes narrow, reads closely | room tone    | kling-v3.0-pro
   s3   | 3.0    | -     | insert still | slow zoom     | "unlimited allowance" circled  | sting sfx    | still
   s4   | 5.0    | 6     | MS desk      | static        | she taps revoke, leans back    | click + whoosh | kling-v3.0-pro
   s5   | 4.0    | 5     | CU face      | handheld      | smirk: "not today."            | dialogue     | veo-3.1
   ```
5. **Board with cheap stills.** One `generate_image` per shot at 9:16 with the same character refs and the shot's
   framing; these become the first frames for image-to-video later:
   ```sh
   lumen gen image "Close-up of a phone screen in a hand, a wallet approval popup, thumb hovering over the approve button, dim bedroom light, 9:16 vertical, subject centred. No readable brand names." --model google/gemini-nano-banana-2.1 --aspect 9:16
   ```
6. **Build the animatic in the Video studio.** Drop the stills on the video track at their play lengths, add a scratch
   voice line (`voiceover-and-tts`) and hook text, watch it at full speed:
   ```json
   dashboard { "op": "navigate", "route": "/studio/video" }
   dashboard { "op": "command", "name": "video.addClip", "args": { "src": "/api/files/media/s1.png", "track": "video", "at": 0 } }
   dashboard { "op": "command", "name": "video.addClip", "args": { "src": "/api/files/media/s2.png", "track": "video", "at": 2 } }
   ```
   If it does not work as stills plus voice, it will not work as video. Fix the board now.
7. **Price it and get approval.** Sum generation seconds per model at their per-second rates, add 50% for re-rolls,
   and show the total. Media jobs estimated above `media.approveAboveUsd` wait in /approvals; a person approves, never the agent.
8. **Hand off.** Each row becomes one `generate_video` call with its still in `refs` (`video-prompting`), then cut in
   `video-studio-editing`.

## Continuity rules

- Same wardrobe, hair and props across the short; list them on the board header.
- Keep screen direction: exits right enter from the left in the next shot.
- One light story per scene; note it per row.
- Design the loop: the last frame should match the first frame's framing or motion.

## Check before you finish

- [ ] Premise and one-line payoff written; hook lands in the first 2 s.
- [ ] Every shot is one action + one move, 4-8 s generated, with play length noted.
- [ ] A visual change at least every 4 s.
- [ ] Animatic watched at full speed with voice and hook text.
- [ ] Budget totalled with a 50% re-roll buffer and approved by a person.
- [ ] Characters original, AI label planned for publishing.

## Pitfalls

- **Generating before boarding.** The most expensive way to find out the story does not land.
- **Shots longer than the model can hold.** Split at an action instead of asking for 15 s.
- **Slow hooks.** Logos, intros and "hey guys" in the first 2 s lose most viewers.
- **No buffer.** Model warm-up frames eat the start; always generate long and trim.
- **Continuity by memory.** Write wardrobe and props on the board; prompts drift otherwise.

## Related

- `video-prompting` — turning each row into a clip
- `video-studio-editing` — assembling the cut
- `captions-and-hooks` — hook lines and on-screen text
- `character-consistency` — same face across shots
- `voiceover-and-tts` — the scratch and final voice line
