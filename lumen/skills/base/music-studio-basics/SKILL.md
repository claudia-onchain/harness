---
name: music-studio-basics
description: "Builds a finished loop or short track in the Lumen dashboard Music studio: set tempo and swing, program the 16-step drums, write chords and a bassline in the piano roll, shape the synth, add effects, balance the mixer and export WAV, either by hand or by the agent driving it with dashboard UiCommands. Use when someone says \"make a beat\", \"make me a loop\", \"open the music studio\", \"write a chord progression\", \"what BPM for house\", \"help me make a song in Lumen\", or wants a quick instrumental bed for a video."
license: MIT
metadata:
  title: "Music studio basics"
  category: "create"
  level: "beginner"
  tags: "music studio, tone.js, bpm, swing, sequencer, piano roll, chords, roman numerals, loop, export wav, dashboard"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Music studio basics

The Music studio (`/studio/music`) is a loop workstation built on Tone.js: a transport with BPM and swing, a
16-step drum sequencer (kick, snare, hat, clap, perc), a piano roll on a poly synth, a synth panel, five effects,
a mixer with meters, a drag-drop sampler and WAV export. The one idea that matters: get a 4-bar loop that feels
good on repeat before adding anything. Groove first (tempo, drums, bass), then harmony, then sound design, then mix.

## When to use

- "Make a beat", "make me a loop", "give me a lo-fi bed for this video"
- "What BPM is drum and bass?", "what chords should I use?"
- Someone wants the agent to drive the Music studio while they watch
- A short original instrumental is needed instead of a generated `generate_music` track

## Steps

1. **Open the studio and read what it exposes.** Run `lumen dashboard`, then have the agent call
   `dashboard { "op": "navigate", "route": "/studio/music" }` and `dashboard { "op": "snapshot" }`. The snapshot
   lists the live UiCommands with their JSON schemas and every `data-agent-id` target. Use the exact param names it
   returns; the examples below show the usual shape.
2. **Pick tempo and swing from the genre.** Use the table below, then:
   `dashboard { "op": "command", "name": "music.setTempo", "args": { "bpm": 124 } }`. Swing is a transport
   knob (0 = straight, roughly 0.15-0.3 shuffles 16ths without sounding drunk). Set it on the swing target.
3. **Program drums as 16-step grids.** One step = one 16th note; steps 1, 5, 9, 13 are the beats.
   `dashboard { "op": "command", "name": "music.setPattern", "args": { "track": "kick", "steps": "x...x...x...x..." } }`
   Do kick, then snare/clap, then hat, then perc. See `drum-programming` for genre grids.
4. **Write chords in the piano roll.** Choose a progression (table below), voice it in the C3-C5 range, one chord
   per bar. Positions use bars:beats:sixteenths, durations use Tone notation (`1m` bar, `2n` half, `4n` quarter):
   ```
   music.addNote { "pitch": "A3", "at": "0:0:0", "dur": "1m" }   // Am: A3 C4 E4
   music.addNote { "pitch": "C4", "at": "0:0:0", "dur": "1m" }
   music.addNote { "pitch": "E4", "at": "0:0:0", "dur": "1m" }
   music.addNote { "pitch": "F3", "at": "1:0:0", "dur": "1m" }   // F: F3 A3 C4, and so on
   ```
5. **Add a bassline.** Root notes an octave or two below the chord (A1-A2), rhythm locked to the kick. Start with
   the root on every kick, then add one passing note into each chord change.
6. **Shape the sound and add space.** `synth.set { "param": "filter.cutoff", "value": 2400 }`, then effects with
   `fx.set` (reverb wet 0.15-0.3 on pads, delay 1/8 dotted on leads). Details in `synth-sound-design`.
7. **Balance and audition.** `music.play {}`, watch the mixer meters, pull every channel down until the loudest
   peaks sit near -6 dBFS: `mixer.set { "channel": "hat", "gain": -10 }`. `music.stop {}` when done.
8. **Export.** Click the Export WAV target from the snapshot (`dashboard { "op": "click", "target": "<export id>" }`).
   Files land in the media library; arrange longer pieces on the Video studio audio track or polish in Audio.

## Genre tempo table

| Genre | BPM | Swing | Feel |
|---|---|---|---|
| Lo-fi hip-hop | 70-90 | 0.25-0.4 | lazy 16ths, dusty keys |
| Boom bap | 85-95 | 0.2-0.35 | kick/snare backbone |
| Reggaeton / dembow | 90-100 | 0 | 3+3+2 snare |
| Afrobeats | 98-112 | 0.1-0.2 | syncopated perc |
| Pop | 100-125 | 0-0.1 | straight, hook-led |
| House | 120-128 | 0.1-0.25 | four on the floor |
| Techno | 125-140 | 0 | driving, minimal |
| Trap (half-time) | 130-150 | 0 | hat rolls, 808 |
| Dubstep (half-time) | 140 | 0 | snare on beat 3 |
| Drum and bass | 170-176 | 0-0.1 | two-step breaks |

## Chord progressions

| Roman | Example key | Use |
|---|---|---|
| I-V-vi-IV | C: C G Am F | pop, anthemic |
| vi-IV-I-V | A minor feel: Am F C G | emotional pop, EDM |
| i-VI-III-VII | A minor: Am F C G | epic, trance |
| i-VII-VI-V | A minor: Am G F E | Andalusian, tension |
| ii-V-I | C: Dm7 G7 Cmaj7 | jazz, lo-fi |
| IVmaj7-iii7-vi7 | C: Fmaj7 Em7 Am7 | lo-fi, neo-soul |
| i-VI-VII | C minor: Cm Ab Bb | trap, drill, dark |

## Check before you finish

- [ ] Tempo and swing match the genre and the loop plays cleanly on repeat (no gap or double hit at the seam)
- [ ] Kick and bass do not clash: bass roots follow the kick rhythm, nothing else below 100 Hz
- [ ] Chords sit in one key; the bassline uses chord roots or scale tones
- [ ] Master meter peaks stay below 0 dBFS (aim near -6 dBFS before mastering)
- [ ] WAV exported and visible in `/library`

## Pitfalls

- **Guessing param names.** UiCommand schemas can change; always read them from `snapshot` first.
- **Starting with sound design.** A great pad on a weak groove is still a weak loop. Drums and bass first.
- **Muddy voicings.** Full triads below C3 turn to mud. Keep chords above C3 and let the bass own the low end.
- **Everything at full volume.** Mixer faders at 0 dB clip the master once five tracks play. Start at -10 dB.
- **Too many parts.** Three to five elements in a loop is plenty; arrangement comes from muting, not adding.
- **Taking over without warning.** Tell the user the agent is about to drive; Esc or "Take back" stops it.

## Related

- `drum-programming` — genre drum grids and groove
- `synth-sound-design` — oscillator, ADSR, filter and LFO recipes
- `mixing-and-mastering` — gain staging, EQ and loudness targets
- `dashboard-takeover` — how the agent drives the dashboard safely
