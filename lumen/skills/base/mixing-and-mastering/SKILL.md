---
name: mixing-and-mastering
description: "Mixes and masters tracks made in the Lumen Music and Audio studios: gain staging on the mixer, EQ by frequency range, compression settings, panning, effects sends, then mastering to -14 LUFS integrated and -1 dBTP true peak for streaming (-16 LUFS for podcasts), measured with ffmpeg loudnorm. Use when someone says \"mix this\", \"master my track\", \"it sounds muddy\", \"too quiet on Spotify\", \"what LUFS should I export at\", \"my track clips\", \"balance the levels\" or before publishing any audio."
license: MIT
metadata:
  title: "Mixing and mastering"
  category: "create"
  level: "intermediate"
  tags: "mixing, mastering, gain staging, eq, compression, panning, lufs, true peak, loudness, mixer, export"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Mixing and mastering

Mixing is making every part audible in its own space; mastering is making the whole file translate to every
speaker at the loudness the platform expects. The one idea that matters: fix balance with faders and EQ cuts before
reaching for loudness. A balanced mix at -18 dBFS average masters easily; a loud, crowded mix only gets worse.

## When to use

- "Mix this", "balance the levels", "it sounds muddy / harsh / thin"
- "Master it for Spotify / YouTube / a podcast", "what LUFS?"
- The master meter hits red or the export clips
- Before any audio leaves Lumen (track, jingle, voiceover, podcast)

## Steps

1. **Gain stage first.** All mixer faders to -10 dB, then `music.play {}` and bring up the kick (or the voice) until
   it peaks around -10 dBFS. Build every other channel around it. The master should peak near -6 dBFS with
   headroom left: `dashboard { "op": "command", "name": "mixer.set", "args": { "channel": "kick", "gain": -8 } }`.
2. **Balance with faders and mutes.** Solo is for finding problems, not for judging levels. Mute a part: if you do
   not miss it, cut it. Check levels at low monitoring volume, where balance mistakes are obvious.
3. **EQ by cutting.** High-pass everything except kick and bass (80-150 Hz for most parts, 200+ Hz for hats and
   pads). Cut mud at 250-500 Hz and harshness at 2.5-4 kHz before boosting anything. Use the table below.
4. **Pan for space.** Kick, snare, bass and lead vocal centre. Hats, perc, doubled parts and pad width 20-60% left
   or right, mirrored. Everything below roughly 150 Hz stays mono.
5. **Compress with intent.** Set it with `fx.set { "effect": "compressor", ... }`. Drums: 4:1, attack 10-30 ms so
   transients pass, release 50-150 ms, 3-6 dB gain reduction. Vocals: 3:1, 3-6 dB. Bus or master glue: 2:1, slow
   attack, 1-2 dB. More than that and the track stops breathing.
6. **Effects as space, not decoration.** One reverb for the room (wet 0.1-0.25), longer only on pads and FX. Delay
   tempo-synced (1/8 dotted, 1/4). High-pass reverb returns at 200-300 Hz so they do not muddy the low end.
7. **Export and measure loudness.** Export WAV, then measure with ffmpeg (read-only analysis via `bash`):
   ```sh
   ffmpeg -hide_banner -i mix.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=summary -f null -
   ```
   Read "Input Integrated" (LUFS) and "Input True Peak" (dBTP).
8. **Master to the target.** In the Audio studio, `audio.load { "url": "<export url>" }`, then `audio.normalize`
   and gain to reach the target. For a precise two-pass loudnorm render, run ffmpeg with the measured values
   (writing a file needs approval):
   ```sh
   ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1:LRA=11:measured_I=<I>:measured_TP=<TP>:measured_LRA=<LRA>:measured_thresh=<thr>:linear=true -ar 48000 master.wav
   ```
9. **Translate.** Listen on headphones, a phone speaker and in mono. If the bass vanishes on the phone, add
   harmonics (light distortion or a higher octave), do not boost the sub.

## EQ map

| Range | Hz | Character | Typical move |
|---|---|---|---|
| Sub | 20-60 | felt, not heard | kick and bass only; high-pass the rest |
| Bass | 60-250 | weight, punch | pick kick or bass to own 50-80 Hz |
| Low mids | 250-500 | mud, boxiness | cut 2-4 dB on pads, guitars, vocals |
| Mids | 500-2k | body, honk | narrow cuts for nasal tones |
| Presence | 2-5k | clarity, harshness | small boost for vocals, cut harsh synths |
| Brilliance | 5-10k | sibilance, bite | de-ess vocals at 5-8 kHz |
| Air | 10-16k | sparkle | gentle shelf on vocal or master |

## Loudness targets

| Destination | Integrated | True peak |
|---|---|---|
| Spotify, YouTube, Tidal, Amazon | -14 LUFS | -1 dBTP (-2 if mastering louder than -10) |
| Apple Music | -16 LUFS normalised; -14 master is fine | -1 dBTP |
| Podcasts (stereo) | -16 LUFS | -1 dBTP |
| Podcasts (mono) | -19 LUFS | -1 dBTP |
| Short-form social video | -14 LUFS | -1 dBTP |

## Check before you finish

- [ ] No channel or master clips; mix peaks near -6 dBFS before mastering
- [ ] Everything except kick and bass is high-passed; sub content is mono
- [ ] Measured integrated loudness within 1 LU of the target and true peak at or below -1 dBTP
- [ ] Checked on headphones, phone speaker and in mono
- [ ] Final file named with target, for example `track_master_-14LUFS.wav`, in `/library`

## Pitfalls

- **Mastering to be loud.** Platforms turn loud files down; you keep the distortion and lose the dynamics.
- **Boosting instead of cutting.** Five boosted mids make a mix harsh and loud; cuts make room.
- **Judging in solo.** A thin hat or a dull pad can be perfect in context. Decide with everything playing.
- **Peak normalising and calling it mastered.** Normalize sets peak, not loudness; measure LUFS.
- **Measuring a 2 s sting for integrated LUFS.** Short files read unreliably; judge stings by short-term loudness and peak.
- **Reverb on bass and kick.** Smears the groove. Keep the low end dry.

## Related

- `music-studio-basics` — building the loop being mixed
- `podcast-editing` — dialogue-specific processing and -16 LUFS delivery
- `voiceover-and-tts` — levelling generated voice against music
- `sonic-branding` — mastering short stings per destination
