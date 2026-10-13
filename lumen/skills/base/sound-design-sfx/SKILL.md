---
name: sound-design-sfx
description: "Creates sound effects for videos, apps, games and streams with Lumen: prompts for generate_sfx and lumen gen sfx, layering transient, body and tail, UI sounds, whooshes, risers and impacts, editing in the Audio studio (trim, fade, normalize) and loading one-shots into the Music studio sampler. Use when someone asks \"make a whoosh\", \"I need a notification sound\", \"sound effects for this video\", \"UI click sounds\", \"riser before the drop\", \"impact hit\", \"foley\" or \"game SFX\"."
license: MIT
metadata:
  title: "Sound design and SFX"
  category: "create"
  level: "intermediate"
  tags: "sound effects, sfx, foley, whoosh, riser, impact, ui sounds, notification, layering, generate_sfx, audio studio, sampler"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Sound design and SFX

A good effect is three layers in time: a transient (the click or hit that says "now"), a body (what the thing is
made of) and a tail (the space it happens in). Generated SFX usually nail one layer and smear the others, so the
one idea that matters is: generate short, specific pieces and assemble them, rather than asking one prompt for the
whole cinematic moment.

## When to use

- "Make a whoosh / riser / impact / swoosh for this cut"
- "I need a notification sound / UI clicks / an error sound for my app"
- Foley for a short video (footsteps, cloth, door, coins, keyboard)
- Game or stream alert sounds, custom one-shots for the drum sampler

## Steps

1. **List every sound with a timing and a length.** For video, scrub the timeline and write `00:03.2 whoosh 0.6 s
   left-to-right`, `00:04.0 impact 1.5 s`. For apps, list states: tap, success, error, notification, each under
   300 ms except the notification (300-800 ms).
2. **Prompt with source, action, material, space and duration.** Specific nouns beat adjectives:
   ```
   generate_sfx { "prompt": "single soft wooden click, dry, close mic, no reverb, very short", "durationSec": 0.5 }
   lumen gen sfx "deep cinematic impact, low boom with metallic debris, short room tail" --model <sfx model>
   ```
   Add "no music, no voice" when the model drifts. Generate 3-4 variants per sound; check progress with
   `media_status { "id": "<job id>" }`.
3. **Layer for weight.** Impact = sharp transient (snare crack, click) + low body (sub boom, 40-80 Hz) + tail
   (debris, reverb). Whoosh = filtered noise sweep + a tonal element for direction. Assemble on the Video studio
   audio tracks or chain edits in the Audio studio.
4. **Edit in the Audio studio.** `dashboard { "op": "navigate", "route": "/studio/audio" }`, then
   `audio.load { "url": "<media url>" }`. Trim dead air with `audio.cut { "start": 0, "end": 0.04 }`, add a 3-10 ms
   fade-in and a 10-50 ms fade-out with `audio.fade` so nothing clicks, then `audio.normalize` to about -1 dBFS peak
   and `audio.export {}`.
5. **Synthesize what generation gets wrong.** Risers and UI tones are easier in the Music studio: a saw with filter
   cutoff swept up over 2-8 bars plus noise is a riser; a sine or triangle pluck (attack 2 ms, decay 80 ms,
   sustain 0) a third or fifth apart is a clean UI chime. Export WAV and trim.
6. **Fit sounds to the mix.** SFX under dialogue sit 6-12 dB below the voice; UI sounds peak around -12 to -6
   dBFS so they do not startle. High-pass anything that is not meant to rumble at 80-120 Hz.
7. **Name and keep a set.** `ui_tap_01.wav`, `ui_error_01.wav`, `fx_impact_metal_02.wav`. Save the prompts that
   worked with `memory_save` so the set can be extended in the same style.

## Prompt cheatsheet

| Sound | Prompt core | Length |
|---|---|---|
| UI tap | soft short click, plastic, dry, close | 0.05-0.15 s |
| Success | two-note rising chime, bright, clean, short | 0.3-0.6 s |
| Error | low two-note falling buzz, muted, short | 0.2-0.4 s |
| Whoosh | fast air whoosh passing by, filtered, no tail | 0.4-1 s |
| Riser | tension riser, noise sweep up, building | 2-8 s |
| Impact | cinematic hit, low boom, short tail | 1-3 s |
| Coin | small metal coin drop on wood, single | 0.3-0.8 s |
| Glitch | digital glitch stutter, bitcrushed, short | 0.2-0.6 s |

## Check before you finish

- [ ] Every sound starts on its transient (no silence in front) and ends with a fade (no click)
- [ ] Lengths fit the slot: UI under 300 ms, notifications under 1 s, impacts under 3 s
- [ ] Peaks around -1 dBFS for raw assets; levels set against dialogue or music in context
- [ ] Each sound auditioned on a phone speaker, where most of them will be heard
- [ ] Generated assets checked against the media provider's terms for your use

## Pitfalls

- **One prompt for a whole scene.** You get mush. One sound per prompt, then layer.
- **Reverb baked into UI sounds.** Tails overlap on fast taps. Ask for "dry", add space later if needed.
- **Loud notification sounds.** Startling users trains them to mute you. Gentle, short, mid-range (1-3 kHz).
- **Sub-heavy impacts on phones.** They disappear. Layer a mid transient so the hit reads on small speakers.
- **Burning budget on variants.** Media generation counts within budget (jobs above `media.approveAboveUsd` need approval); generate 3-4, not 20.

## Related

- `video-studio-editing` — placing effects on the timeline
- `synth-sound-design` — building risers and chimes from scratch
- `mixing-and-mastering` — levels and loudness for the final mix
- `sonic-branding` — turning a sound into a recognisable signature
- `media-generation-openrouter` — models and costs for generated audio
