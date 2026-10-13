// Music studio: transport, drum sequencer, piano roll, synth, effects and mixer — all drivable by the agent.
import { useEffect, useState } from "react";
import { Btn, Panel, Tabs } from "../../components/ui";
import { Icon } from "../../components/icons";
import { agentProps, useAgentCommands } from "../../takeover/registry";
import { download } from "../../lib/format";
import { toast } from "../../lib/toast";
import { upload, errText } from "../../lib/api";
import { isDemo } from "../../state/app";
import { exportWav, play, stop, warm } from "./engine";
import { Sequencer } from "./Sequencer";
import { PianoRoll } from "./PianoRoll";
import { FxRack, SynthPanel, setFx, setSynth } from "./SynthPanel";
import { Mixer, setChannel } from "./Mixer";
import { CHANNELS, DRUMS, FX, PRESETS, STEPS, addNote, applyPreset, music, playhead, parsePitch, parseSteps, summary, type ChannelId, type DrumId, type FxId, type SynthParams } from "./store";

const SYNTH_ALIASES: Record<string, keyof SynthParams> = {
  "filter.cutoff": "cutoff", "filter.resonance": "resonance", "filter.q": "resonance", q: "resonance", "env.attack": "attack", "env.decay": "decay", "env.sustain": "sustain", "env.release": "release",
  "lfo.rate": "lfoRate", "lfo.depth": "lfoDepth", oscillator: "osc", "osc.type": "osc", voices: "unison", spread: "detune",
};

function setTempo(bpm: number) {
  const v = Math.max(40, Math.min(240, Math.round(Number(bpm))));
  if (!Number.isFinite(v)) throw new Error("bpm must be a number");
  music.set({ bpm: v });
  return v;
}

function TempoInput() {
  const { bpm } = music.use();
  const [draft, setDraft] = useState(String(bpm));
  useEffect(() => setDraft(String(bpm)), [bpm]);
  return (
    <label className="tempo">
      <input className="input mono" value={draft} inputMode="numeric" onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (n >= 40 && n <= 240) setTempo(n); }} onBlur={() => setDraft(String(music.get().bpm))} {...agentProps("music.tempo", "Tempo (BPM)", "input")} />
      <span>BPM</span>
    </label>
  );
}

/** Four beat LEDs: the only part of the transport that follows the playhead. */
function BeatLights() {
  const step = playhead.use((p) => p.step);
  return <div className="beat-lights" aria-hidden>{[0, 1, 2, 3].map((b) => <span key={b} className={step >= 0 && Math.floor((step % 16) / 4) === b ? "on" : ""} />)}</div>;
}

export default function MusicStudio() {
  // Slices rather than the whole store so knob drags and the playhead don't re-render the entire studio.
  const s = { playing: music.use((m) => m.playing), swing: music.use((m) => m.swing), notes: music.use((m) => m.notes), preset: music.use((m) => m.preset) };
  const [fxTab, setFxTab] = useState<ChannelId>("synth");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // Build the Tone graph while the page is idle so the first Play doesn't stall for ~0.7 s.
    const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
    const h = idle ? idle(warm, { timeout: 1500 }) : window.setTimeout(warm, 300);
    return () => { (idle ? (window as any).cancelIdleCallback : clearTimeout)(h); /* keep playing across routes only while the agent drives */ if (!document.body.classList.contains("lumen-driving")) stop(); };
  }, []);

  async function doExport() {
    setExporting(true);
    try {
      const blob = await exportWav(2);
      const name = `lumen-beat-${music.get().bpm}bpm.wav`;
      download(blob, name);
      if (!isDemo()) { const r = await upload(blob, name).catch(() => null); if (r) toast(`Saved to ${r.path}`, "ok"); }
      return { ok: true, bytes: blob.size, name };
    } catch (e) {
      toast(`Export failed: ${errText(e)}`, "bad");
      throw e;
    } finally { setExporting(false); }
  }

  useAgentCommands([
    { name: "music.setTempo", description: "Set the tempo in BPM (40–240).", params: { type: "object", properties: { bpm: { type: "number" } }, required: ["bpm"] }, panel: "music.transport", run: ({ bpm }) => ({ bpm: setTempo(bpm) }) },
    { name: "music.setSwing", description: "Set 16th-note swing 0–1.", params: { type: "object", properties: { amount: { type: "number" } }, required: ["amount"] }, panel: "music.transport", run: ({ amount }) => { music.set({ swing: Math.max(0, Math.min(1, Number(amount))) }); return { swing: music.get().swing }; } },
    { name: "music.setPattern", description: `Set a 16-step drum pattern. track: ${DRUMS.join("|")}|sampler. steps: "x...x...x...x..." or [0,4,8,12].`, params: { type: "object", properties: { track: { type: "string", enum: [...DRUMS, "sampler"] }, steps: { type: ["string", "array"] } }, required: ["track", "steps"] }, panel: "music.sequencer",
      run: ({ track, steps }) => {
        const st = parseSteps(steps, STEPS);
        if (track === "sampler") music.set((m) => ({ sampler: { ...m.sampler, steps: st } }));
        else if ((DRUMS as readonly string[]).includes(track)) music.set((m) => ({ drums: { ...m.drums, [track as DrumId]: st } }));
        else throw new Error(`unknown track ${track}`);
        return { track, steps: st.map((v) => (v ? "x" : ".")).join("") };
      } },
    { name: "music.addNote", description: "Add a piano-roll note. pitch: MIDI number or name like C4; at: step 0–31 (16ths); dur: steps.", params: { type: "object", properties: { pitch: { type: ["number", "string"] }, at: { type: "number" }, dur: { type: "number" } }, required: ["pitch", "at"] }, panel: "music.pianoroll", run: ({ pitch, at, dur }) => { const n = addNote(parsePitch(pitch), Number(at), Number(dur ?? 2)); return { noteId: n.id }; } },
    { name: "music.clearNotes", description: "Remove every piano-roll note.", params: { type: "object", properties: {} }, panel: "music.pianoroll", run: () => { music.set({ notes: [] }); return { ok: true }; } },
    { name: "music.clear", description: "Clear all drum, sampler steps (keeps notes).", params: { type: "object", properties: {} }, panel: "music.sequencer", run: () => { music.set((m) => ({ drums: Object.fromEntries(DRUMS.map((d) => [d, Array(STEPS).fill(false)])) as Record<DrumId, boolean[]>, sampler: { ...m.sampler, steps: Array(STEPS).fill(false) } })); return { ok: true }; } },
    { name: "music.play", description: "Start playback.", params: { type: "object", properties: {} }, panel: "music.transport", run: async () => { await play(); return { playing: true }; } },
    { name: "music.stop", description: "Stop playback.", params: { type: "object", properties: {} }, panel: "music.transport", run: () => { stop(); return { playing: false }; } },
    { name: "music.preset", description: `Load a synth preset: ${Object.keys(PRESETS).join(", ")}.`, params: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }, panel: "music.synth", run: ({ name }) => { applyPreset(String(name)); return { preset: name }; } },
    { name: "music.export", description: "Render 2 loops to WAV (download + save to uploads).", params: { type: "object", properties: {} }, panel: "music.transport", run: doExport },
    { name: "synth.set", description: "Set a synth parameter: osc (sawtooth|square|triangle|sine), attack, decay, sustain, release (s), cutoff (Hz), resonance, lfoRate (Hz), lfoDepth (0–1), unison (1–8), detune (cents).", params: { type: "object", properties: { param: { type: "string" }, value: { type: ["number", "string"] } }, required: ["param", "value"] }, panel: "music.synth",
      run: ({ param, value }) => {
        const key = (SYNTH_ALIASES[String(param)] ?? param) as keyof SynthParams;
        if (!(key in music.get().synth)) throw new Error(`unknown synth param ${param}`);
        setSynth({ [key]: key === "osc" ? String(value) : Number(value) } as Partial<SynthParams>);
        return { [key]: music.get().synth[key] };
      } },
    { name: "mixer.set", description: "Set a mixer channel (drums|synth|sampler): gain (dB, -48..6), pan (-1..1), mute, solo.", params: { type: "object", properties: { channel: { type: "string", enum: [...CHANNELS] }, gain: { type: "number" }, pan: { type: "number" }, mute: { type: "boolean" }, solo: { type: "boolean" } }, required: ["channel"] }, panel: "music.mixer",
      run: ({ channel, gain, pan, mute, solo }) => {
        if (!(CHANNELS as readonly string[]).includes(channel)) throw new Error(`unknown channel ${channel}`);
        const patch: Record<string, unknown> = {};
        if (gain !== undefined) patch.gain = Math.max(-48, Math.min(6, Number(gain)));
        if (pan !== undefined) patch.pan = Math.max(-1, Math.min(1, Number(pan)));
        if (mute !== undefined) patch.mute = Boolean(mute);
        if (solo !== undefined) patch.solo = Boolean(solo);
        setChannel(channel as ChannelId, patch);
        return music.get().channels[channel as ChannelId];
      } },
    { name: "fx.set", description: `Set an effect amount 0–1 on a channel. effect: ${FX.join("|")}; channel defaults to synth.`, params: { type: "object", properties: { channel: { type: "string", enum: [...CHANNELS] }, effect: { type: "string", enum: [...FX] }, value: { type: "number" } }, required: ["effect", "value"] }, panel: "music.fx",
      run: ({ channel, effect, value, amount }) => {
        const c = (channel ?? "synth") as ChannelId;
        if (!(FX as readonly string[]).includes(effect)) throw new Error(`unknown effect ${effect}`);
        setFx(c, effect as FxId, Number(value ?? amount));
        setFxTab(c);
        return { channel: c, effect, value: music.get().channels[c].fx[effect as FxId] };
      } },
  ], () => summary());

  return (
    <div className="page full studio music-studio">
      <div className="transport panel" {...agentProps("music.transport", "Transport", "panel")}>
        <div className="row">
          {s.playing ? (
            <Btn kind="primary" icon="stop" onClick={stop} agent="music.stop" label="Stop">Stop</Btn>
          ) : (
            <Btn kind="primary" icon="play" onClick={() => play()} agent="music.play" label="Play">Play</Btn>
          )}
        </div>
        <TempoInput />
        <label className="swing hide-sm">
          <span className="tiny muted">Swing</span>
          <input type="range" min={0} max={0.8} step={0.01} value={s.swing} onChange={(e) => music.set({ swing: Number(e.target.value) })} {...agentProps("music.swing", "Swing", "slider")} />
          <span className="mono tiny">{Math.round(s.swing * 100)}%</span>
        </label>
        <BeatLights />
        <div className="grow" />
        <Btn size="sm" icon="trash" onClick={() => music.set((m) => ({ drums: Object.fromEntries(DRUMS.map((d) => [d, Array(STEPS).fill(false)])) as Record<DrumId, boolean[]>, sampler: { ...m.sampler, steps: Array(STEPS).fill(false) } }))} agent="music.clearPattern" label="Clear pattern" className="hide-sm">Clear</Btn>
        <Btn size="sm" icon="download" onClick={doExport} disabled={exporting} agent="music.exportWav" label="Export WAV">{exporting ? "Rendering…" : "Export WAV"}</Btn>
      </div>

      <div className="music-grid">
        <Panel title={<div className="row"><Icon name="activity" /><h3>Drums</h3><span className="badge">16 steps</span></div>} className="area-seq" agentId="music.drums" agentLabel="Drums panel">
          <Sequencer />
        </Panel>
        <Panel title={<div className="row"><Icon name="music" /><h3>Piano roll</h3><span className="badge">{s.notes.length} notes · 2 bars</span></div>} actions={<Btn size="sm" kind="ghost" icon="trash" onClick={() => music.set({ notes: [] })}>Clear</Btn>} className="area-roll" bodyClass="panel-b roll-body">
          <PianoRoll />
        </Panel>
        <Panel title="Synth" className="area-synth" actions={<span className="badge accent">{s.preset}</span>}>
          <SynthPanel />
        </Panel>
        <Panel title="Effects" className="area-fx" agentId="music.fx" agentLabel="Effects rack" actions={<Tabs value={fxTab} onChange={setFxTab} items={CHANNELS.map((c) => ({ id: c, label: c }))} agentPrefix="fx.tab" />}>
          <FxRack channel={fxTab} />
        </Panel>
        <Panel title="Mixer" className="area-mix">
          <Mixer />
        </Panel>
      </div>
    </div>
  );
}
