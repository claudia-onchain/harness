---
name: video-prompting
description: "Write AI video prompts that move the way you meant: one action, one camera move, one light story per clip. Use when someone asks \"make a video of...\", \"animate this image\", \"generate a b-roll clip\", \"the motion looks weird\", or \"which video model should I use\". Covers the shot formula (subject, action, camera, setting, light, audio), text-to-video vs image-to-video, model picks (veo-3.1, kling-v3.0-pro, seedance-2.5, grok-imagine-video), durations, generate_video / lumen gen video calls, cost control and fixing common motion artifacts."
license: MIT
metadata:
  title: "Video prompting"
  category: "create"
  level: "intermediate"
  tags: "video prompts, generate_video, image to video, camera moves, veo, kling, seedance, b-roll"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Video prompting

A video prompt describes one shot, not a story: one subject doing one thing while the camera does one thing, in one
light. Start from an approved still whenever you can (image-to-video), because it locks composition and identity
and leaves the model only motion to invent. Video costs far more than images, so draft the frame as a still first.

## When to use

- "Make a video of...", "animate this image", "I need b-roll of...".
- Planning clips for a short or ad (after `storyboarding-shorts`).
- Motion looks wrong: morphing hands, sliding feet, the camera drifting randomly.
- Choosing a model for dialogue, motion, or cost.

## Steps

1. **Write the shot formula.** Order: subject → action → camera → setting → light → audio.
   ```text
   A barista in a denim apron pours steamed milk into a latte, forming a leaf pattern (action).
   Slow push-in from medium to close-up on the cup (camera). Small sunlit café counter, morning (setting).
   Warm window light from the left, soft steam backlit (light). Ambient café murmur and the hiss of the steam wand (audio).
   ```
2. **Pick one camera move.** Static/locked-off, slow push-in, pull-out, pan left/right, tilt up/down, orbit/arc,
   tracking alongside, crane up, handheld. Name speed ("slow", "gentle"). Two moves in 5 s looks like a glitch.
3. **Prefer image-to-video.** Generate or pick the first frame as a still (`image-prompting-fundamentals`), approve
   it, pass it in `refs`. Then the prompt describes only motion and sound:
   ```json
   generate_video { "prompt": "She looks up from the laptop and smiles at the lens, slow push-in, steam drifting from the mug, soft room tone.", "model": "kwaivgi/kling-v3.0-pro", "aspect": "9:16", "durationSec": 5, "refs": ["/api/files/media/first-frame.png"] }
   ```
4. **Choose the model.**
   | Need | Try first | Why |
   |---|---|---|
   | Native audio, dialogue, cinematic light | `google/veo-3.1` | generates synced sound and speech |
   | Strong body motion, image-to-video | `kwaivgi/kling-v3.0-pro` | physical motion, good identity hold |
   | Cheaper drafts, multi-shot ideas | `bytedance/seedance-2.5` | fast, low cost per second |
   | Stylised, fast | xAI `grok-imagine-video-1.5` | quick iterations |
   Most models give 4-10 s per generation; check the model's allowed durations before asking for more.
5. **Draft short, then commit.** First pass at the shortest duration and lowest resolution offered; extend only the
   take you like. From the shell:
   ```sh
   lumen gen video "Overhead shot of hands sliding a hardware wallet into a leather pouch, static camera, soft daylight on an oak desk, subtle cloth rustle." --model bytedance/seedance-2.5 --aspect 9:16
   ```
   Poll `media_status { "id": "<job id>" }`. Clips land in ~/.lumen/media/ and /library. Jobs above your media cap
   wait in /approvals for a person.
6. **Generate 0.5-1 s longer than you need.** Models warm up and wind down; trim both ends in the Video studio.
7. **Dialogue lines go in quotes**, one short sentence per clip, with who says it and how: `She says, calmly: "Check
   the contract first."` Keep it under ~8 words for a 5 s clip.
8. **Review at full speed and frame by frame.** Watch for morphing, extra fingers, sliding feet, text crawling on
   signs, identity drift at turns. Keep the best take; fix with a new generation, not by stacking edits.

## Fixing motion artifacts

| Symptom | Fix |
|---|---|
| Face/identity changes mid-clip | image-to-video from an approved still, shorter clip, avoid full head turns |
| Hands morph | give hands a simple job, keep them still or out of frame |
| Random camera drift | name one move, or "locked-off static camera" |
| Too much happening | cut to one action; split the rest into separate clips |
| Floaty, weightless motion | add physical cues: "heavy", "steps land firmly", "real-time speed" |
| Gibberish text on screens | "blank glowing screen"; add real text as a caption later |

## Check before you finish

- [ ] One subject, one action, one camera move, one light story per clip.
- [ ] Image-to-video used from an approved still where identity or composition matters.
- [ ] Duration within the model's allowed range and 0.5-1 s longer than the cut needs.
- [ ] Cost checked within budget (jobs above `media.approveAboveUsd` need approval); anything awaiting approval approved by a person.
- [ ] Reviewed frame by frame for artifacts before it goes into the edit.
- [ ] No real person's likeness or voice; AI video labelled when published.

## Pitfalls

- **Writing a story in one prompt.** "She wakes, makes coffee, leaves" becomes mush. One beat per clip.
- **Skipping the still.** Text-to-video re-rolls are expensive guesses; a $0.05 still saves dollars.
- **Asking for long takes.** Drift grows with length; cut on action instead.
- **Model-made text.** On-screen words come out garbled; use the captions track.
- **Copying film scenes.** Recreating a recognisable movie shot or character risks copyright and looks derivative.

## Related

- `storyboarding-shorts` — plan clips before generating
- `image-prompting-fundamentals` — the first frame
- `character-consistency` — same subject across clips
- `video-studio-editing` — trim, split and assemble the takes
- `cost-control-and-spend-caps` — media budgets and approvals
