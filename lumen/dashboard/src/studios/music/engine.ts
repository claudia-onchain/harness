// Tone.js engine for the Music studio. One "rig" builder works in both the live context and Tone.Offline,
// so WAV export renders exactly what you hear.
import * as Tone from "tone";
import { encodeWav } from "../../lib/wav";
import { pluginRegistry } from "../../plugins/host";
import { CHANNELS, DRUMS, ROLL_STEPS, STEPS, music, playhead, type ChannelId, type MusicState } from "./store";

// Short ramps for every live parameter change: jumping an AudioParam while audio flows makes a click (zipper noise).
const RAMP = 0.03;

type Strip = { input: Tone.Gain; dist: Tone.Distortion; chorus: Tone.Chorus; delay: Tone.FeedbackDelay; reverb: Tone.Freeverb; comp: Tone.Compressor; ch: Tone.Channel; meter: Tone.Meter; insert?: Tone.ToneAudioNode | null; insertId?: string | null };

function makeStrip(): Strip {
  const input = new Tone.Gain(1);
  const dist = new Tone.Distortion(0.4);
  const chorus = new Tone.Chorus(1.5, 3.5, 0.6).start();
  const delay = new Tone.FeedbackDelay("8n.", 0.35);
  const reverb = new Tone.Freeverb({ roomSize: 0.82, dampening: 3200 });
  const comp = new Tone.Compressor(0, 4);
  const ch = new Tone.Channel(0, 0);
  const meter = new Tone.Meter({ smoothing: 0.75 });
  input.chain(dist, chorus, delay, reverb, comp, ch);
  ch.toDestination();
  ch.connect(meter);
  return { input, dist, chorus, delay, reverb, comp, ch, meter };
}

export function createRig() {
  const strips = Object.fromEntries(CHANNELS.map((c) => [c, makeStrip()])) as Record<ChannelId, Strip>;
  const d = strips.drums.input;
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.045, octaves: 6, envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 } }).connect(d);
  const snareNoise = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.17, sustain: 0 }, volume: -8 }).connect(d);
  const snareBody = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -10 }).connect(d);
  const hat = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.06, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: 5200, octaves: 1.5, volume: -22 }).connect(d);
  const clapFilter = new Tone.Filter(1300, "bandpass").connect(d);
  const clap = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.002, decay: 0.14, sustain: 0 }, volume: -4 }).connect(clapFilter);
  const perc = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 3, envelope: { attack: 0.001, decay: 0.09, sustain: 0 }, volume: -10 }).connect(d);

  // Cutoff lives on filter.frequency (ramped); the LFO modulates filter.detune in cents so changing the cutoff
  // never restarts or re-scales the LFO.
  const filter = new Tone.Filter(1800, "lowpass", -24).connect(strips.synth.input);
  const lfo = new Tone.LFO(0.5, 0, 0).start();
  lfo.connect(filter.detune);
  const poly = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 16 } as any).connect(filter);
  poly.set({ oscillator: { type: "fatsawtooth", count: 3, spread: 18 } as any, envelope: { attack: 0.01, decay: 0.25, sustain: 0.5, release: 0.6 } });
  let player: Tone.Player | null = null;
  let playerUrl: string | null = null;
  let prev: Partial<MusicState> = {};

  function apply(s: MusicState) {
    const t = Tone.getTransport();
    if (prev.bpm !== s.bpm) t.bpm.value = s.bpm;
    if (prev.swing !== s.swing) { t.swing = s.swing; t.swingSubdivision = "16n"; }
    if (prev.synth !== s.synth) {
      const p = s.synth, q = prev.synth;
      // Only rebuild the oscillators when the waveform/unison changes: PolySynth.set({ oscillator }) recreates every
      // voice's source, which clicks and drops notes if done on each knob tick.
      if (!q || q.osc !== p.osc || q.unison !== p.unison || q.detune !== p.detune) poly.set({ oscillator: (p.unison > 1 ? { type: `fat${p.osc}`, count: p.unison, spread: p.detune } : { type: p.osc }) as any });
      if (!q || q.attack !== p.attack || q.decay !== p.decay || q.sustain !== p.sustain || q.release !== p.release) poly.set({ envelope: { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release } });
      if (!q || q.cutoff !== p.cutoff) filter.frequency.rampTo(p.cutoff, RAMP);
      if (!q || q.resonance !== p.resonance) filter.Q.rampTo(p.resonance, RAMP);
      if (!q || q.lfoRate !== p.lfoRate) lfo.frequency.rampTo(p.lfoRate, RAMP);
      if (!q || q.lfoDepth !== p.lfoDepth) { const cents = p.lfoDepth * 2400; lfo.min = -cents; lfo.max = cents; }
    }
    if (prev.channels !== s.channels) {
      const anySolo = CHANNELS.some((c) => s.channels[c].solo);
      const prevSolo = prev.channels ? CHANNELS.some((c) => prev.channels![c].solo) : !anySolo;
      for (const c of CHANNELS) {
        const cs = s.channels[c], ps = prev.channels?.[c];
        const st = strips[c];
        if (!ps || ps.gain !== cs.gain) st.ch.volume.rampTo(cs.gain, RAMP);
        if (!ps || ps.pan !== cs.pan) st.ch.pan.rampTo(cs.pan, RAMP);
        if (!ps || ps.mute !== cs.mute || ps.solo !== cs.solo || prevSolo !== anySolo) st.ch.mute = cs.mute || (anySolo && !cs.solo);
        if (!ps || ps.fx !== cs.fx) {
          st.dist.wet.rampTo(cs.fx.distortion, RAMP);
          st.chorus.wet.rampTo(cs.fx.chorus, RAMP);
          st.delay.wet.rampTo(cs.fx.delay, RAMP);
          st.reverb.wet.rampTo(cs.fx.reverb, RAMP);
          // Compressor.threshold is a raw dB param in [-100, 0]: Tone's rampTo would try to pass through +1e-7 and throw.
          st.comp.threshold.value = -cs.fx.compressor * 36;
        }
        setInsert(c, cs.insert ?? null);
      }
    }
    if (s.sampler.url !== playerUrl) {
      player?.dispose();
      player = s.sampler.url ? new Tone.Player(s.sampler.url).connect(strips.sampler.input) : null;
      playerUrl = s.sampler.url;
    }
    if (player && prev.sampler?.pitch !== s.sampler.pitch) player.playbackRate = Math.pow(2, s.sampler.pitch / 12);
    prev = s;
  }

  function setInsert(c: ChannelId, id: string | null) {
    const st = strips[c];
    if (st.insertId === id) return;
    st.input.disconnect();
    st.insert?.dispose();
    st.insert = null;
    st.insertId = id;
    const def = id ? pluginRegistry.get().effects.find((e) => e.id === id) : null;
    if (def) {
      try {
        st.insert = def.create(Tone) as Tone.ToneAudioNode;
        st.input.chain(st.insert, st.dist);
        return;
      } catch { st.insert = null; }
    }
    st.input.connect(st.dist);
  }

  function tick(i: number, time: number) {
    const s = music.get();
    const st = i % STEPS;
    const sixteenth = 60 / s.bpm / 4;
    if (s.drums.kick[st]) kick.triggerAttackRelease("C1", "8n", time);
    if (s.drums.snare[st]) { snareNoise.triggerAttackRelease("16n", time); snareBody.triggerAttackRelease("G2", "16n", time); }
    if (s.drums.hat[st]) hat.triggerAttackRelease(260, "32n", time, 0.6);
    if (s.drums.clap[st]) { clap.triggerAttackRelease("16n", time); clap.triggerAttackRelease("16n", time + 0.012); }
    if (s.drums.perc[st]) perc.triggerAttackRelease("E4", "32n", time);
    if (player?.loaded && s.sampler.steps[st]) player.start(time);
    const rs = i % ROLL_STEPS;
    for (const n of s.notes) if (n.at === rs) poly.triggerAttackRelease(Tone.Frequency(n.pitch, "midi").toFrequency(), n.dur * sixteenth * 0.98, time, n.vel ?? 0.8);
  }

  function preview(pitch = 60) {
    poly.triggerAttackRelease(Tone.Frequency(pitch, "midi").toFrequency(), 0.25, Tone.now());
  }

  function dispose() {
    for (const n of [kick, snareNoise, snareBody, hat, clapFilter, clap, perc, filter, lfo, poly]) n.dispose();
    player?.dispose();
    for (const c of CHANNELS) { const s = strips[c]; for (const n of [s.input, s.dist, s.chorus, s.delay, s.reverb, s.comp, s.ch, s.meter]) n.dispose(); s.insert?.dispose(); }
  }

  return { apply, tick, preview, dispose, strips, poly, kick, snareNoise, hat, clap, perc };
}

// ── live engine ──

let rig: ReturnType<typeof createRig> | null = null;
let repeatId: number | null = null;
let counter = 0;
let visualTimer: ReturnType<typeof setInterval> | undefined;
let unsub: (() => void) | null = null;

function ensureRig() {
  if (!rig) {
    // Events are scheduled from the main thread; a longer lookahead rides out React renders and knob drags
    // (default is 0.1 s) at the cost of ~100 ms more latency on audition clicks.
    Tone.getContext().lookAhead = 0.2;
    rig = createRig();
    rig.apply(music.get());
    unsub = music.subscribe(() => rig?.apply(music.get()));
  }
  return rig;
}

/** Build the audio graph ahead of the first Play/audition: creating it takes several hundred ms on the main thread. */
export function warm() {
  try { ensureRig(); } catch { /* no AudioContext (e.g. jsdom) */ }
}

export async function play() {
  try { await Promise.race([Tone.start(), new Promise((r) => setTimeout(r, 400))]); } catch { /* no gesture yet */ }
  const r = ensureRig();
  const t = Tone.getTransport();
  if (repeatId === null) {
    counter = 0;
    repeatId = t.scheduleRepeat((time) => {
      const i = counter++;
      r.tick(i, time);
      Tone.getDraw().schedule(() => playhead.set({ step: i % ROLL_STEPS }), time);
    }, "16n");
  }
  t.start("+0.05");
  music.set({ playing: true });
  // Without a user gesture (agent / demo) the AudioContext stays suspended: keep the playhead moving visually.
  clearInterval(visualTimer);
  if (Tone.getContext().state !== "running") {
    let i = 0;
    visualTimer = setInterval(() => playhead.set({ step: i++ % ROLL_STEPS }), (60 / music.get().bpm / 4) * 1000);
  }
}

export function stop() {
  const t = Tone.getTransport();
  t.stop();
  if (repeatId !== null) { t.clear(repeatId); repeatId = null; }
  clearInterval(visualTimer);
  music.set({ playing: false });
  playhead.set({ step: -1 });
}

export async function audition(kind: (typeof DRUMS)[number] | "note", pitch?: number) {
  try { await Tone.start(); } catch { /* */ }
  const r = ensureRig();
  const now = Tone.now();
  if (kind === "kick") r.kick.triggerAttackRelease("C1", "8n", now);
  else if (kind === "snare") r.snareNoise.triggerAttackRelease("16n", now);
  else if (kind === "hat") r.hat.triggerAttackRelease(260, "32n", now, 0.6);
  else if (kind === "clap") r.clap.triggerAttackRelease("16n", now);
  else if (kind === "perc") r.perc.triggerAttackRelease("E4", "32n", now);
  else r.preview(pitch ?? 60);
}

export function meterLevels(): Record<ChannelId, number> {
  const out = { drums: -Infinity, synth: -Infinity, sampler: -Infinity } as Record<ChannelId, number>;
  if (!rig) return out;
  for (const c of CHANNELS) {
    const v = rig.strips[c].meter.getValue();
    out[c] = typeof v === "number" ? v : Math.max(...(v as number[]));
  }
  return out;
}

/** Render `loops` passes of the 2-bar pattern offline and return a WAV blob. */
export async function exportWav(loops = 2): Promise<Blob> {
  const s = music.get();
  const sixteenth = 60 / s.bpm / 4;
  const dur = ROLL_STEPS * sixteenth * loops + 2.5;
  const buf = await Tone.Offline(({ transport }) => {
    const r = createRig();
    r.apply(s);
    transport.bpm.value = s.bpm;
    transport.swing = s.swing;
    transport.swingSubdivision = "16n";
    let i = 0;
    transport.scheduleRepeat((time) => { if (i < ROLL_STEPS * loops) r.tick(i++, time); }, "16n");
    transport.start(0);
  }, dur, 2, 44100);
  const ab = buf.get();
  if (!ab) throw new Error("render failed");
  return encodeWav(ab);
}

export function disposeEngine() {
  stop();
  unsub?.();
  rig?.dispose();
  rig = null;
}
