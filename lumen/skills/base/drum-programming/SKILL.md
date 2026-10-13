---
name: drum-programming
description: "Programs drum grooves in the Lumen Music studio 16-step sequencer (kick, snare, hat, clap, perc) with genre patterns written as x/. step strings for house, techno, boom bap, lo-fi, trap, dubstep, drum and bass and reggaeton, plus swing, fills, variation and custom samples, set by the agent with music.setPattern. Use when someone asks \"program a beat\", \"make a drum pattern\", \"four on the floor\", \"trap hi-hats\", \"dembow rhythm\", \"my drums sound robotic\", \"add a fill\" or \"what's a boom bap pattern\"."
license: MIT
metadata:
  title: "Drum programming"
  category: "create"
  level: "beginner"
  tags: "drums, beat, sequencer, 16-step, groove, swing, kick, snare, hi-hat, clap, house, trap, boom bap, drum and bass"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Drum programming

The sequencer has five lanes of 16 steps; each step is a 16th note, so steps 1, 5, 9 and 13 are the four beats
and step 9 is beat 3 (the half-time snare spot). Patterns are strings: `x` hits, `.` rests. The one idea that
matters: the kick and snare are the skeleton, hats are the feel. Lock the skeleton to the genre, then make the
hats and perc breathe with swing and gaps.

## When to use

- "Program a beat", "make a drum pattern for 124 BPM house"
- "Trap hats", "dembow", "boom bap", "two-step drum and bass"
- "My drums sound robotic / stiff / busy"
- Adding a fill, a drop or variation to a loop that is getting stale

## Steps

1. **Set the tempo first.** `dashboard { "op": "command", "name": "music.setTempo", "args": { "bpm": 90 } }`.
   Half-time genres (trap, dubstep) are programmed at full tempo with the snare on step 9.
2. **Kick.** `music.setPattern { "track": "kick", "steps": "x......x..x....." }`. Leave room around the snare.
3. **Snare or clap on the backbeat.** Steps 5 and 13 for most genres, step 9 only for half-time. Layer clap on the
   same steps for width, or put the clap one step late on the second hit for a looser feel.
4. **Hats set the energy.** 8ths (`x.x.x.x.x.x.x.x.`) relaxed, 16ths (`xxxxxxxxxxxxxxxx`) driving, offbeats
   (`..x...x...x...x.`) for house lift. Pull the hat channel 6-10 dB under the kick: `mixer.set { "channel": "hat", "gain": -9 }`.
5. **Perc fills the gaps.** Shakers, rims and toms on steps the kick and snare leave empty. Off-grid repeating
   cycles (every 3 steps: `x..x..x..x..x...`) add motion over a 4/4 skeleton.
6. **Add swing.** 0.15-0.3 for house and garage shuffle, 0.25-0.4 for boom bap and lo-fi, 0 for trap, techno and
   dembow. Swing moves the even 16ths, so it affects hats most. Listen for 8 bars before deciding.
7. **Make variation.** Keep a main pattern, then a fill version for every 4th or 8th bar: drop the kick on the last
   beat, add snare hits on steps 14-16 (`....x.......xxxx`), or open the hat on step 15. Mute the kick for 1 bar
   before a drop.
8. **Swap in your own sounds.** Generate a one-shot with `generate_sfx { "prompt": "tight punchy 808 kick, short
   decay, dry, one shot", "durationSec": 1 }` (or `lumen gen sfx "..."`) and drag it onto a sampler pad. Trim
   silence at the start in the Audio studio so it lands on the grid.

## Genre grids

```
House 120-128        Techno 125-140        Boom bap 85-95
kick x...x...x...x...  kick x...x...x...x...  kick  x......x..x.....
clap ....x.......x...  clap ....x.......x...  snare ....x.......x...
hat  ..x...x...x...x.  hat  ..x...x...x...x.  hat   x.x.x.x.x.x.x.x.
perc ...x.....x....x.  perc x..x..x..x..x...  perc  .......x.......x

Lo-fi 70-90 (swing .3) Trap 130-150 (half)   Dubstep 140 (half)
kick  x.....x...x.....  kick x......x..x.....  kick  x.........x.....
snare ....x.......x...  clap ........x.......  snare ........x.......
hat   x.x.x.x.x.x.x.x.  hat  xxxxxxxxx.x.xxxx  hat   x.x.x.x.x.x.x.x.
perc  ..........x.....  perc ..............x.  perc  ......x.......x.

Drum and bass 170-176 Reggaeton 90-100
kick  x.........x.....  kick  x...x...x...x...
snare ....x.......x...  snare ...x..x....x..x.
hat   x.x.x.x.x.x.x.x.  hat   x.x.x.x.x.x.x.x.
```

The grid is 16ths, so true 32nd-note trap rolls need the piano roll (short notes on a hat sample) or a rendered
roll loaded into the sampler.

## Check before you finish

- [ ] Kick and snare follow the genre skeleton; nothing lands on top of the snare except a layer
- [ ] Hats sit 6-10 dB under the kick on the meters and do not mask the snare
- [ ] Swing value chosen on purpose (zero for genres that are played straight)
- [ ] At least one variation or fill exists for longer pieces
- [ ] Loop plays 8 bars without fatigue; exported or saved with the rest of the project

## Pitfalls

- **Kick on every step the bass plays plus every hat step.** Busy low end kills punch. Fewer kicks, longer gaps.
- **Snare on beat 3 at full-time tempos.** That is half-time; at 90 BPM it sounds wrong unless you meant it.
- **Swing on trap hats.** Trap is straight; swing makes rolls sound sloppy rather than bouncy.
- **All lanes at equal level.** Real drummers play quieter hats and ghost notes; use the mixer and perc lane.
- **Generated one-shots with silence in front.** They land late and flam. Trim to the transient.

## Related

- `music-studio-basics` — tempo, piano roll and export around the drums
- `mixing-and-mastering` — kick and bass balance, compression and loudness
- `sound-design-sfx` — making custom one-shots and layers
- `synth-sound-design` — basses that lock with the kick
