// Music studio state (survives route changes; read live by the Tone engine on every tick).
import { createStore, uid } from "../../lib/store";

export const DRUMS = ["kick", "snare", "hat", "clap", "perc"] as const;
export type DrumId = (typeof DRUMS)[number];
export const CHANNELS = ["drums", "synth", "sampler"] as const;
export type ChannelId = (typeof CHANNELS)[number];
export const FX = ["distortion", "chorus", "delay", "reverb", "compressor"] as const;
export type FxId = (typeof FX)[number];
export const STEPS = 16;
export const ROLL_STEPS = 32;
export const ROLL_LOW = 48; // C3
export const ROLL_HIGH = 72; // C5

export type Note = { id: string; pitch: number; at: number; dur: number; vel?: number };
export type SynthParams = { osc: "sawtooth" | "square" | "triangle" | "sine"; attack: number; decay: number; sustain: number; release: number; cutoff: number; resonance: number; lfoRate: number; lfoDepth: number; unison: number; detune: number };
export type Channel = { gain: number; pan: number; mute: boolean; solo: boolean; fx: Record<FxId, number>; insert?: string | null };

export type MusicState = {
  bpm: number;
  swing: number;
  playing: boolean;
  drums: Record<DrumId, boolean[]>;
  notes: Note[];
  synth: SynthParams;
  channels: Record<ChannelId, Channel>;
  sampler: { name: string | null; url: string | null; steps: boolean[]; pitch: number };
  preset: string;
};

const empty = () => Array(STEPS).fill(false) as boolean[];
const fx0 = (): Record<FxId, number> => ({ distortion: 0, chorus: 0, delay: 0, reverb: 0.15, compressor: 0.3 });

export const DEFAULT_SYNTH: SynthParams = { osc: "sawtooth", attack: 0.01, decay: 0.25, sustain: 0.5, release: 0.6, cutoff: 1800, resonance: 2, lfoRate: 0.5, lfoDepth: 0, unison: 3, detune: 18 };

/** Playhead position (16th-note step, -1 when stopped). Kept out of `music` so the 8 updates/s at 120 BPM only
 *  re-render the few components that draw it and never touch the Tone engine's `apply`. */
export const playhead = createStore<{ step: number }>({ step: -1 });

export const music = createStore<MusicState>({
  bpm: 120,
  swing: 0,
  playing: false,
  drums: { kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false], hat: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false], clap: empty(), perc: empty() },
  notes: [
    { id: "n1", pitch: 57, at: 0, dur: 6 }, { id: "n2", pitch: 60, at: 0, dur: 6 }, { id: "n3", pitch: 64, at: 0, dur: 6 },
    { id: "n4", pitch: 53, at: 8, dur: 6 }, { id: "n5", pitch: 57, at: 8, dur: 6 }, { id: "n6", pitch: 60, at: 8, dur: 6 },
    { id: "n7", pitch: 55, at: 16, dur: 6 }, { id: "n8", pitch: 59, at: 16, dur: 6 }, { id: "n9", pitch: 62, at: 16, dur: 6 },
    { id: "n10", pitch: 52, at: 24, dur: 6 }, { id: "n11", pitch: 55, at: 24, dur: 6 }, { id: "n12", pitch: 60, at: 24, dur: 6 },
  ],
  synth: { ...DEFAULT_SYNTH },
  channels: {
    drums: { gain: -4, pan: 0, mute: false, solo: false, fx: { ...fx0(), reverb: 0.06 } },
    synth: { gain: -10, pan: 0, mute: false, solo: false, fx: { ...fx0(), delay: 0.18, reverb: 0.3, chorus: 0.2 } },
    sampler: { gain: -6, pan: 0, mute: false, solo: false, fx: fx0() },
  },
  sampler: { name: null, url: null, steps: empty(), pitch: 0 },
  preset: "Init",
});

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const midiName = (m: number) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export function parsePitch(p: unknown): number {
  if (typeof p === "number") return Math.round(p);
  const m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(String(p).trim());
  if (!m) throw new Error(`bad pitch ${p} (use MIDI number or e.g. "C4")`);
  let n = NOTE_NAMES.indexOf(m[1].toUpperCase());
  if (m[2] === "#") n++;
  if (m[2] === "b") n--;
  return (Number(m[3]) + 1) * 12 + n;
}

/** Accepts "x...x...", [0,4,8,12] or [true,false,...]. */
export function parseSteps(steps: unknown, len = STEPS): boolean[] {
  const out = Array(len).fill(false) as boolean[];
  if (typeof steps === "string") {
    const s = steps.replace(/[\s|]/g, "");
    for (let i = 0; i < Math.min(len, s.length); i++) out[i] = /[xX1o*]/.test(s[i]);
  } else if (Array.isArray(steps)) {
    if (steps.every((v) => typeof v === "boolean")) steps.slice(0, len).forEach((v, i) => (out[i] = v as boolean));
    else for (const v of steps) { const i = Number(v); if (i >= 0 && i < len) out[i] = true; }
  }
  return out;
}
export const stepsString = (s: boolean[]) => s.map((v) => (v ? "x" : ".")).join("");

export function addNote(pitch: number, at: number, dur: number): Note {
  const n: Note = { id: uid("n"), pitch, at: Math.max(0, Math.min(ROLL_STEPS - 1, Math.round(at))), dur: Math.max(1, Math.round(dur)) };
  music.set((s) => ({ notes: [...s.notes, n] }));
  return n;
}

export const PRESETS: Record<string, { synth: Partial<SynthParams>; fx?: Partial<Record<FxId, number>> }> = {
  "Init": { synth: DEFAULT_SYNTH },
  "Warm Pad": { synth: { osc: "sawtooth", attack: 0.6, decay: 0.8, sustain: 0.8, release: 2.2, cutoff: 1200, resonance: 1, lfoRate: 0.2, lfoDepth: 0.35, unison: 5, detune: 24 }, fx: { reverb: 0.55, chorus: 0.4, delay: 0.1 } },
  "Pluck": { synth: { osc: "triangle", attack: 0.002, decay: 0.18, sustain: 0.05, release: 0.25, cutoff: 3400, resonance: 4, lfoDepth: 0, unison: 1, detune: 0 }, fx: { delay: 0.3, reverb: 0.2 } },
  "Acid Bass": { synth: { osc: "square", attack: 0.003, decay: 0.2, sustain: 0.2, release: 0.1, cutoff: 700, resonance: 12, lfoRate: 2, lfoDepth: 0.4, unison: 1, detune: 0 }, fx: { distortion: 0.3, reverb: 0.05 } },
  "Supersaw Lead": { synth: { osc: "sawtooth", attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.4, cutoff: 5200, resonance: 2, lfoDepth: 0, unison: 7, detune: 35 }, fx: { delay: 0.25, reverb: 0.3, chorus: 0.2 } },
  "Glass Keys": { synth: { osc: "sine", attack: 0.005, decay: 0.9, sustain: 0.2, release: 1.2, cutoff: 6000, resonance: 1, lfoRate: 5, lfoDepth: 0.08, unison: 2, detune: 7 }, fx: { reverb: 0.4, chorus: 0.3 } },
};

export function applyPreset(name: string) {
  const p = PRESETS[name];
  if (!p) throw new Error(`unknown preset ${name}. Try: ${Object.keys(PRESETS).join(", ")}`);
  music.set((s) => ({
    preset: name,
    synth: { ...s.synth, ...p.synth },
    channels: { ...s.channels, synth: { ...s.channels.synth, fx: { ...s.channels.synth.fx, ...(p.fx ?? {}) } } },
  }));
}

export function summary(s = music.get()) {
  const drums = DRUMS.map((d) => `${d} ${stepsString(s.drums[d])}`).join("; ");
  const mix = CHANNELS.map((c) => `${c} ${s.channels[c].gain}dB${s.channels[c].mute ? " muted" : ""}${s.channels[c].solo ? " solo" : ""}`).join(", ");
  return `Music studio: ${s.bpm} BPM, swing ${Math.round(s.swing * 100)}%, ${s.playing ? "playing" : "stopped"}. Drums: ${drums}. Piano roll: ${s.notes.length} notes over ${ROLL_STEPS} steps (synth preset ${s.preset}, ${s.synth.osc}, cutoff ${Math.round(s.synth.cutoff)} Hz). Sampler: ${s.sampler.name ?? "empty"}. Mixer: ${mix}.`;
}
