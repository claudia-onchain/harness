---
name: sonic-branding
description: "Builds a sonic identity for a project, creator, coin community or agent: a sonic brief, a hummable 3-5 note motif written in the Music studio piano roll, a 1-3 s sonic logo, intro and outro stings, a notification sound and a loopable bed, using generate_music and generate_sfx for textures, with rights checks, per-destination loudness and an asset kit. Use when someone asks for \"a jingle\", \"sonic logo\", \"audio signature\", \"intro sting\", \"podcast intro music\", \"stream alert sound\" or \"a sound for my brand\"."
license: MIT
metadata:
  title: "Sonic branding"
  category: "create"
  level: "intermediate"
  tags: "sonic branding, sonic logo, jingle, motif, intro sting, notification sound, audio identity, music studio, loudness, licensing"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Sonic branding

People recognise a sound before they read a logo, often with the phone in a pocket. A sonic identity is one short
motif that is yours, cut into a few versions, used the same way every time. The one idea that matters: the motif
is a melody, not a sound. If someone can hum it after hearing it twice, any instrument can carry it; if they cannot,
no amount of production will save it.

## When to use

- "Make a jingle / sonic logo / audio signature for my project"
- A podcast, stream or video series needs an intro and outro that are not stock
- An app or bot needs a notification or success sound that matches the brand
- An existing jingle came from a tool whose terms do not cover the use

## Steps

1. **Write a sonic brief.** Three adjectives (for example "confident, warm, quick"), what it must not sound like
   (casino, horror, a competitor), where it plays (video intro, app alert, live stream, podcast), and the visual
   brand colours and type for cross-reference. Save it with `memory_save`.
2. **Design the motif in the piano roll.** 3-5 notes, within one octave, under 2 seconds, ending on a stable note
   (the root or fifth) for "done" or on the 2nd/4th for "more to come". Open `/studio/music`, set
   `music.setTempo { "bpm": 110 }`, and write it:
   ```
   music.addNote { "pitch": "C5", "at": "0:0:0", "dur": "8n" }
   music.addNote { "pitch": "E5", "at": "0:0:2", "dur": "8n" }
   music.addNote { "pitch": "G5", "at": "0:1:0", "dur": "8n" }
   music.addNote { "pitch": "C6", "at": "0:1:2", "dur": "4n" }
   ```
   Write 4-6 candidates, play each with `music.play {}`, and test the hum test on a person.
3. **Pick a signature timbre.** Choose one sound that will carry the motif everywhere: pluck, mallet, glassy pad,
   synth brass. Set it with `synth.set` (see `synth-sound-design`) and keep the recipe.
4. **Generate texture, not the identity.** Use `generate_music { "prompt": "bright confident 3 second sonic logo,
   marimba and soft synth, ending on a resolved chord, no vocals", "durationSec": 5 }` and
   `generate_sfx` for shimmer, whooshes and impacts to layer around your motif. Rebuild anything you like in the
   studio so the core is human-authored.
5. **Cut the kit from one motif.** Sonic logo 1-3 s; intro sting 3-6 s; outro 5-10 s; notification 0.3-0.8 s (first
   two notes only); loopable bed 30-60 s that hints at the motif. Export each as WAV.
6. **Check rights and originality.** Compare against famous logos and the platforms' own sounds; avoid anything
   within a few notes of a known jingle. Read the generation model's terms for commercial use. If you want legal
   protection, record that the core motif was written by a person (dates, project file, exports).
7. **Master per destination.** Beds and long stings: -14 LUFS for video, -16 LUFS for podcasts, true peak -1 dBTP.
   Short stings: match peak to the content around them and check by ear. Notification sounds peak around -6 dBFS.
8. **Write the placement map.** Which asset plays where, how often, and what never gets it (for example no sting on
   serious announcements). Store the kit in `/library` with a naming scheme.

## Asset kit

| Asset | Length | Use | Naming |
|---|---|---|---|
| Sonic logo | 1-3 s | end of videos, ads | `brand_logo_2s_main.wav` |
| Intro sting | 3-6 s | podcast and video opens | `brand_intro_5s.wav` |
| Outro | 5-10 s | sign-offs, CTAs | `brand_outro_8s.wav` |
| Notification | 0.3-0.8 s | app or bot alerts | `brand_notify_05s.wav` |
| Bed | 30-60 s loop | under talk and streams | `brand_bed_45s_loop.wav` |

## Check before you finish

- [ ] Motif is 3-5 notes, under 2 s, and a test listener can hum it back
- [ ] One signature timbre carries every asset; the kit sounds like one family
- [ ] Every asset exported as WAV, faded cleanly, true peak at or below -1 dBTP
- [ ] Notification checked on a phone speaker at normal volume without startling
- [ ] Rights checked: no near-copy of a known jingle, model terms allow the use, human authorship documented

## Pitfalls

- **A sound instead of a melody.** A great whoosh is not recognisable. Motif first, production second.
- **Too long.** Sonic logos over 3 s get skipped. Shorter is more memorable.
- **Generated identity you cannot own.** Fully generated audio may not be protectable; write the core yourself.
- **Different versions per platform.** Inconsistency kills recognition. One motif, one timbre, many lengths.
- **Overuse.** A sting on every clip becomes noise. Use it at fixed moments only.

## Related

- `music-studio-basics` — writing and exporting the motif
- `synth-sound-design` — choosing the signature timbre
- `brand-kit` — the visual side the sound must match
- `sound-design-sfx` — layers, whooshes and notification sounds
- `mixing-and-mastering` — loudness per destination
