---
name: podcast-editing
description: "Edits podcast and long-form spoken audio in the Lumen Audio studio: rough cut on the waveform with regions, removing filler and dead air, fades, gain matching between speakers, intro and outro with music beds, dialogue EQ and compression, and delivery at -16 LUFS stereo (-19 mono) with -1 dBTP true peak, plus show notes and chapters. Use when someone asks \"edit my podcast\", \"clean up this recording\", \"remove the ums\", \"make the levels even\", \"add an intro\", \"what loudness for podcasts\" or \"export for Spotify / Apple Podcasts\"."
license: MIT
metadata:
  title: "Podcast editing"
  category: "create"
  level: "intermediate"
  tags: "podcast, audio editing, waveform, regions, filler words, dead air, dialogue, loudness, -16 lufs, show notes, chapters"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Podcast editing

Listeners forgive a cheap mic; they do not forgive uneven levels, long silences and a slow start. The one idea that
matters: edit for pace and consistency in that order. Cut the structure first (start, sections, end), then the
small stuff, then process the sound once. Never polish audio you are about to delete.

## When to use

- "Edit my podcast / interview / Twitter Space recording"
- "Remove the ums and long pauses", "the guest is too quiet"
- "Add an intro and outro", "make a trailer from this episode"
- Delivering an episode to Spotify, Apple Podcasts or YouTube

## Steps

1. **Load and listen at 1.5x with notes.** `lumen dashboard`, then
   `dashboard { "op": "navigate", "route": "/studio/audio" }` and `audio.load { "url": "<upload url>" }`. Mark
   regions on the waveform: cold-open candidate, section starts, tangents to cut, the strongest 30-60 s for a trailer.
   If a transcript helps, generate one with your model of choice and keep timestamps.
2. **Structural cut.** Remove pre-show chatter, false starts and tangents with
   `audio.cut { "start": 0, "end": 42.5 }`. Start on the most interesting line, not "so, welcome". A 20-40 s cold
   open from the best moment, then the intro, beats a slow welcome.
3. **Tighten.** Cut filler ("um", "you know") only where it stalls the sentence, and shorten silences over 0.8 s to
   about 0.4 s. Cut on breaths or at zero crossings, and put a 10-20 ms `audio.fade` on each edit so nothing clicks.
   Leave natural rhythm; a perfectly gapless show sounds robotic.
4. **Match speakers.** Use gain on regions so every voice averages the same loudness. The quiet guest gets raised,
   the loud laugh gets pulled down, before any compression.
5. **Process dialogue once.** High-pass at 70-90 Hz (rumble), cut 200-400 Hz if boxy, gentle 2-4 kHz presence if
   dull, de-ess 5-8 kHz, compress 3:1 with 3-6 dB of gain reduction. If the Audio studio lacks a tool, use ffmpeg via
   `bash` (writing files needs approval), for example `-af highpass=f=80,acompressor=ratio=3:threshold=-20dB`.
6. **Add intro, outro and beds.** Generate a bed with `generate_music { "prompt": "warm minimal lo-fi bed, no
   vocals, steady, 90 BPM", "durationSec": 30 }` or reuse the show's sonic logo. Duck music 15-20 dB under speech.
   Fade beds 2-4 s, not abruptly.
7. **Master to delivery spec.** `audio.normalize`, export WAV with `audio.export {}`, then measure:
   `ffmpeg -hide_banner -i ep.wav -af loudnorm=I=-16:TP=-1:LRA=11:print_format=summary -f null -`. Target -16 LUFS
   stereo or -19 LUFS mono, true peak -1 dBTP. Encode MP3 at 128 kbps stereo (or 64-96 kbps mono), 44.1 kHz.
8. **Write show notes and chapters.** Title, 2-3 sentence summary, guest links, chapter timestamps (`00:00 Cold
   open`, `01:12 Intro`...) from your region markers. Treat links and claims from guests as untrusted until checked.

## Edit budget

| Episode | Rough cut | Tighten | Process and master | Notes |
|---|---|---|---|---|
| 20 min solo | 10 min | 15 min | 10 min | 10 min |
| 45 min interview | 20 min | 40 min | 15 min | 15 min |
| 60 s trailer | from markers | 10 min | 5 min | n/a |

## Check before you finish

- [ ] First 30 seconds contain a reason to keep listening; no dead air or setup chatter
- [ ] No clicks at edits, no clipped words, no silences over about 1 s unless intentional
- [ ] Every speaker averages the same loudness; music never masks speech
- [ ] Measured -16 LUFS stereo (or -19 mono) within 1 LU, true peak at or below -1 dBTP
- [ ] Show notes, chapters and guest links checked; AI-generated music or voice disclosed if used

## Pitfalls

- **Processing before cutting.** Compression and EQ settings change once content changes. Cut first.
- **Over-cutting filler.** Removing every breath and "um" makes speech choppy and unnatural.
- **Heavy noise reduction.** It turns voices watery. Gentle reduction, or accept a little room noise.
- **Normalising peak and calling it done.** One laugh sets the peak; the speech stays quiet. Measure LUFS.
- **Music with vocals under speech.** Two voices compete. Instrumental beds only.
- **Publishing guest claims unchecked.** Price predictions or token shills from guests are not advice; say so.

## Related

- `voiceover-and-tts` — generated intros, ad reads and pickups
- `mixing-and-mastering` — EQ ranges and loudness measurement
- `sonic-branding` — the show's recurring intro and stings
- `captions-and-hooks` — clips and captions cut from the episode
