---
name: lyric-writing
description: "Writes original song lyrics that fit a beat: concept and title first, song structure (verse, pre-chorus, chorus, bridge), hooks, syllable counts per bar at a given BPM, rhyme schemes, prosody (stressed syllables on strong beats), and handing lyrics to generate_music or a TTS or human vocal over a Lumen Music studio beat, without copying existing songs. Use when someone asks \"write lyrics\", \"write a song about\", \"write a hook\", \"rap verse\", \"chorus for my beat\", \"jingle lyrics\" or \"make my lyrics flow better\"."
license: MIT
metadata:
  title: "Lyric writing"
  category: "create"
  level: "beginner"
  tags: "lyrics, songwriting, hook, chorus, verse, rap, rhyme scheme, prosody, syllables, jingle, generate_music"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Lyric writing

Lyrics are written to be sung over a rhythm, so they live or die on fit: the right number of syllables per bar and
the stressed syllables landing on the strong beats. The one idea that matters: write the hook first and make it the
title. Everything else in the song exists to make that line hit harder when it comes back.

## When to use

- "Write lyrics / a song about X", "write a chorus for this beat"
- "Write me a 16-bar verse", "make this flow better"
- Jingle or anthem lyrics for a brand, community or meme
- Vocals for a `generate_music` track or a TTS-sung hook

## Steps

1. **Pin the brief.** Topic, point of view (I / you / we), emotion, genre, BPM and length. Ask once if missing via
   `ask_user`; otherwise pick sensible defaults and say so. Get the beat's tempo from the Music studio if it exists.
2. **Find the hook and title.** Write 10 one-line hook candidates, 3-8 words each, concrete and singable (open
   vowels on long notes: "high", "go", "away"). Pick one; it is the title and the chorus anchor.
3. **Choose a structure.** Pop: V1 - PC - C - V2 - PC - C - Bridge - C. Rap: intro - hook - 16-bar verse - hook -
   16-bar verse - hook. Jingle: hook, one supporting line, hook. Short-form video: hook in the first 3 seconds.
4. **Count syllables to the beat.** At 90 BPM a bar is 2.7 s; a relaxed sung line is 6-10 syllables per bar, a rap
   line 10-16. Match line lengths between verses so verse 2 fits the same melody as verse 1. Mark stresses
   (CAPS) and check they fall on beats 1 and 3: "i KEEP my KEYS at HOME tonight".
5. **Rhyme with a scheme, not a dictionary.** Verses AABB or ABAB; choruses can repeat the hook as the rhyme.
   Prefer slant and multisyllable rhymes ("open / focus", "pressure / measure") over obvious perfect ones (fire /
   desire). Internal rhymes push rap flow.
6. **Make verses specific.** Show with images and details (a time, a place, an object), save abstract statements
   for the chorus. Verse 2 must move the story forward, not restate verse 1. The bridge changes perspective or
   reveals something.
7. **Sing it to the beat.** Read it aloud over `music.play {}` or a click. Rewrite any line you have to rush or
   stretch. Cut filler words ("just", "really", "oh yeah") that only pad syllables.
8. **Hand off to a voice.** Option A: `generate_music { "prompt": "<genre, mood, BPM, vocal style>. Lyrics: <lyrics
   with [Verse]/[Chorus] tags>", "durationSec": 60 }` if the model supports lyrics. Option B: instrumental from the
   Music studio plus a human or TTS vocal (`voiceover-and-tts`) aligned in the Video or Audio studio.

## Lyric sheet format

```
Title: Keys At Home        Genre: lo-fi pop   BPM: 88   Key: A minor
[Verse 1]  (8 bars, ~8 syllables/bar)
[Pre-Chorus]  (4 bars, rising)
[Chorus]  (8 bars, hook on bar 1 and bar 5)
[Verse 2] / [Bridge] / [Final Chorus +1 line]
```

## Rhyme and structure quick reference

| Section | Bars | Job |
|---|---|---|
| Verse | 8-16 | story, detail, setup |
| Pre-chorus | 2-4 | tension, lift into hook |
| Chorus | 8 | title, repetition, emotion |
| Bridge | 4-8 | new angle, new chords |
| Rap verse | 16 | flow, punchlines every 4 bars |

## Check before you finish

- [ ] The title is the hook and appears in every chorus
- [ ] Syllable counts match between parallel lines and verses; stresses land on strong beats
- [ ] Every verse has at least one concrete image; verse 2 advances the story
- [ ] Read or sung over the actual tempo without rushing any line
- [ ] Original: no lines, hooks or distinctive phrases lifted from existing songs

## Pitfalls

- **Writing a poem, then forcing it on a beat.** Count to the tempo while writing, not after.
- **Copying lyrics or melodies.** Never reproduce existing song lyrics; even a few distinctive lines can infringe.
  Do not prompt models with "in the style of <living artist>" for commercial work.
- **Cliche rhymes.** fire/desire, heart/apart, night/light. Use them once at most, ideally never.
- **Long words on fast notes.** Multisyllable words need room. Put them on held notes or reword.
- **Making claims in brand lyrics.** "Guaranteed gains" in a jingle is a financial promise. Keep it to vibe and value.

## Related

- `music-studio-basics` — building the beat the lyrics ride on
- `voiceover-and-tts` — rendering a spoken or sung vocal
- `sonic-branding` — jingle lyrics tied to a motif
- `captions-and-hooks` — hook writing for short-form video
