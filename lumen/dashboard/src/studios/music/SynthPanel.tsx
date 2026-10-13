// Synth panel (oscillator, ADSR, filter, LFO, unison) and the per-channel effects rack.
import { Knob } from "../../components/ui";
import { agentProps } from "../../takeover/registry";
import { pluginRegistry } from "../../plugins/host";
import { FX, PRESETS, applyPreset, music, type ChannelId, type FxId, type SynthParams } from "./store";

const OSC: SynthParams["osc"][] = ["sawtooth", "square", "triangle", "sine"];
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`);
const pctf = (v: number) => `${Math.round(v * 100)}%`;

export function setSynth(patch: Partial<SynthParams>) {
  music.set((s) => ({ synth: { ...s.synth, ...patch } }));
}

export function SynthPanel() {
  const p = music.use((s) => s.synth);
  const preset = music.use((s) => s.preset);
  return (
    <div className="synth" {...agentProps("music.synth", "Synth panel", "panel")}>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <div className="osc-pick">
          {OSC.map((o) => (
            <button key={o} className={`chip ${p.osc === o ? "on" : ""}`} onClick={() => setSynth({ osc: o })} {...agentProps(`synth.osc.${o}`, `Oscillator ${o}`, "button")}>
              <svg width="22" height="12" viewBox="0 0 22 12"><path d={o === "sine" ? "M1 6 Q6 -2 11 6 T21 6" : o === "square" ? "M1 10 V2 H11 V10 H21 V2" : o === "triangle" ? "M1 10 L6 2 L11 10 L16 2 L21 10" : "M1 10 L11 2 V10 L21 2 V10"} fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
          ))}
        </div>
        <div className="grow" />
        <select className="select" style={{ width: 150, height: 28 }} value={preset} onChange={(e) => applyPreset(e.target.value)} {...agentProps("synth.preset", "Synth preset", "input")}>
          {Object.keys(PRESETS).map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <div className="knobs">
        <Knob label="Attack" value={p.attack} min={0.001} max={2} step={0.001} format={sec} onChange={(v) => setSynth({ attack: v })} agent="synth.attack" def={0.01} />
        <Knob label="Decay" value={p.decay} min={0.01} max={2} step={0.01} format={sec} onChange={(v) => setSynth({ decay: v })} agent="synth.decay" def={0.25} />
        <Knob label="Sustain" value={p.sustain} min={0} max={1} format={pctf} onChange={(v) => setSynth({ sustain: v })} agent="synth.sustain" def={0.5} />
        <Knob label="Release" value={p.release} min={0.01} max={4} format={sec} onChange={(v) => setSynth({ release: v })} agent="synth.release" def={0.6} />
        <Knob label="Cutoff" value={p.cutoff} min={60} max={12000} step={10} format={hz} onChange={(v) => setSynth({ cutoff: v })} agent="synth.cutoff" def={1800} />
        <Knob label="Reso" value={p.resonance} min={0.1} max={18} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => setSynth({ resonance: v })} agent="synth.resonance" def={2} />
        <Knob label="LFO rate" value={p.lfoRate} min={0.05} max={12} step={0.05} format={(v) => `${v.toFixed(2)}Hz`} onChange={(v) => setSynth({ lfoRate: v })} agent="synth.lfoRate" def={0.5} />
        <Knob label="LFO depth" value={p.lfoDepth} min={0} max={1} format={pctf} onChange={(v) => setSynth({ lfoDepth: v })} agent="synth.lfoDepth" def={0} />
        <Knob label="Unison" value={p.unison} min={1} max={8} step={1} format={(v) => `${v}v`} onChange={(v) => setSynth({ unison: v })} agent="synth.unison" def={3} />
        <Knob label="Detune" value={p.detune} min={0} max={60} step={1} format={(v) => `${v}c`} onChange={(v) => setSynth({ detune: v })} agent="synth.detune" def={18} />
      </div>
    </div>
  );
}

export function setFx(channel: ChannelId, effect: FxId, value: number) {
  music.set((s) => ({ channels: { ...s.channels, [channel]: { ...s.channels[channel], fx: { ...s.channels[channel].fx, [effect]: Math.max(0, Math.min(1, value)) } } } }));
}

export function FxRack({ channel }: { channel: ChannelId }) {
  const s = { channels: music.use((st) => st.channels) };
  const plug = pluginRegistry.use();
  const fx = s.channels[channel].fx;
  return (
    <div className="fx" {...agentProps(`fx.${channel}`, `${channel} effects`, "panel")}>
      <div className="knobs small">
        {FX.map((f) => <Knob key={f} label={f === "compressor" ? "comp" : f} value={fx[f]} min={0} max={1} format={pctf} onChange={(v) => setFx(channel, f, v)} agent={`fx.${channel}.${f}`} def={0} size={40} />)}
      </div>
      {plug.effects.length > 0 && (
        <select className="select" style={{ height: 28, marginTop: 8 }} value={s.channels[channel].insert ?? ""} onChange={(e) => music.set((st) => ({ channels: { ...st.channels, [channel]: { ...st.channels[channel], insert: e.target.value || null } } }))}>
          <option value="">No plugin insert</option>
          {plug.effects.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.pluginId})</option>)}
        </select>
      )}
    </div>
  );
}
