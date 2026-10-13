---
name: synth-sound-design
description: "Designs synth patches in the Lumen Music studio synth panel: oscillator choice, ADSR envelopes, filter cutoff and resonance, LFO modulation, unison and detune, plus effects, with tested recipes for pads, plucks, bass, leads and keys, set by the agent through synth.set and fx.set. Use when someone asks \"make a pad\", \"design a bass sound\", \"why does my synth sound thin\", \"what ADSR for a pluck\", \"supersaw lead\", \"reese bass\", \"make it warmer\" or wants a patch for a track."
license: MIT
metadata:
  title: "Synth sound design"
  category: "create"
  level: "intermediate"
  tags: "synth, sound design, adsr, oscillator, filter, cutoff, resonance, lfo, unison, detune, pad, pluck, bass, lead"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Synth sound design

Every patch is the same five decisions: what the oscillator gives you (harmonics), how the envelope shapes it over
time, what the filter removes, what moves (LFO), and how wide it is (unison). The one idea that matters: the
envelope defines the role. A pad and a pluck can share an oscillator and filter; their ADSR makes them different
instruments. Set the role first, then the tone.

## When to use

- "Make a pad / pluck / bass / lead", "design a patch for this track"
- "My synth sounds thin / harsh / muddy / static"
- "What ADSR should I use?", "how do I get a supersaw / reese?"
- Matching a reference sound described in words ("warm, airy, 80s")

## Steps

1. **Open the synth panel and read its params.** `dashboard { "op": "navigate", "route": "/studio/music" }` then
   `dashboard { "op": "snapshot" }`. Note the exact `synth.set` param names (usually `osc.type`, `env.attack`,
   `env.decay`, `env.sustain`, `env.release`, `filter.cutoff`, `filter.resonance`, `lfo.rate`, `lfo.depth`,
   `lfo.target`, `unison.voices`, `unison.detune`). Times are seconds, cutoff Hz, detune cents.
2. **Pick the oscillator for the harmonics you need.** Sine: pure sub, no harmonics. Triangle: soft, flute-like.
   Square: hollow, odd harmonics, chiptune and organ. Sawtooth: bright, all harmonics, the default for pads, leads
   and supersaws. `synth.set { "param": "osc.type", "value": "sawtooth" }`.
3. **Set the envelope for the role.** Use the recipe table. Attack under 5 ms clicks on some sources; 2-5 ms is the
   safe floor for percussive sounds.
4. **Filter before you EQ.** Lower `filter.cutoff` until the sound stops being harsh, then raise it slightly.
   Resonance adds a peak at the cutoff; 0-20% for warmth, 30-50% for acid and squelch, above that it whistles.
5. **Make it move.** An LFO on cutoff at 0.1-0.5 Hz breathes a pad; synced at 1/4 or 1/8 it pumps; on pitch at
   5-6 Hz with tiny depth it is vibrato. Static patches sound cheap on repeat.
6. **Widen with unison, carefully.** 3-7 voices with 10-25 cents detune for supersaws and pads. Bass stays at 1
   voice (or 2 with under 10 cents) so the low end stays mono and punchy.
7. **Add effects after the patch works dry.** `fx.set { "effect": "chorus", "param": "wet", "value": 0.3 }`,
   reverb for space, delay for depth, distortion for grit, compressor to even out. Audition with `music.play {}`
   over the full loop, not solo.
8. **Save the recipe.** `memory_save` the final param list with a name ("dusty-pad-01") so it can be rebuilt.

## Patch recipes

| Role | Osc | Attack | Decay | Sustain | Release | Cutoff / Res | Mod / Width |
|---|---|---|---|---|---|---|---|
| Warm pad | saw | 0.8-2 s | 1 s | 0.8 | 2-4 s | 1.5-3 kHz / 10% | LFO cutoff 0.2 Hz; 5 voices, 15 c |
| Glass pad | triangle | 0.5 s | 1.5 s | 0.6 | 3 s | 4-6 kHz / 5% | chorus 0.4, reverb 0.4 |
| Pluck | saw or square | 2 ms | 150-300 ms | 0 | 150-250 ms | 1.5-3 kHz / 20% | delay 1/8 dotted 0.25 |
| Sub bass | sine | 2 ms | 200 ms | 1.0 | 60-100 ms | 300 Hz / 0% | mono, no unison |
| Reese bass | saw x2 | 5 ms | 300 ms | 0.9 | 100 ms | 400-900 Hz / 15% | 2 voices, 15-30 c, slow LFO cutoff |
| Acid bass | saw or square | 2 ms | 200 ms | 0.2 | 80 ms | 500 Hz / 45% | distortion 0.2 |
| Supersaw lead | saw | 5-15 ms | 300 ms | 0.7 | 200-300 ms | 3-6 kHz / 10% | 7 voices, 20-25 c |
| Mono lead | square | 5 ms | 200 ms | 0.8 | 150 ms | 2.5 kHz / 25% | LFO pitch 5.5 Hz, small depth |
| Organ keys | square or triangle | 5 ms | 50 ms | 1.0 | 80 ms | 3 kHz / 0% | chorus 0.3 |

Example, warm pad in one go:
```
synth.set { "param": "osc.type", "value": "sawtooth" }
synth.set { "param": "env.attack", "value": 1.2 }
synth.set { "param": "env.release", "value": 3 }
synth.set { "param": "filter.cutoff", "value": 2200 }
synth.set { "param": "unison.voices", "value": 5 }
synth.set { "param": "unison.detune", "value": 15 }
```

## Check before you finish

- [ ] The envelope matches the role: pads swell, plucks die out, bass stops cleanly between notes
- [ ] No clicks at note start or end (raise attack or release a few ms if there are)
- [ ] Bass is mono-safe: 1-2 voices, nothing wide below roughly 150 Hz
- [ ] Resonance does not whistle on high notes; cutoff checked across the full melody range
- [ ] Patch auditioned in the full loop at mix level, and the recipe saved

## Pitfalls

- **Long release on bass.** Notes overlap into mud. Bass release 60-120 ms.
- **Unison on everything.** Five wide patches cancel each other in mono and fight for space. Pick one wide element.
- **Brightness as loudness.** An open filter sounds exciting solo and harsh in the mix. Cut, then compare.
- **Reverb on the sub.** Low frequencies in reverb tails smear the groove; keep bass dry or high-pass the send.
- **Fixing tone with effects.** Distortion and chorus cannot rescue the wrong oscillator or envelope.

## Related

- `music-studio-basics` — where the synth panel fits in the workflow
- `mixing-and-mastering` — EQ ranges and how patches sit together
- `sound-design-sfx` — risers, impacts and UI sounds from synths and generated audio
- `drum-programming` — the groove the patch has to sit on
