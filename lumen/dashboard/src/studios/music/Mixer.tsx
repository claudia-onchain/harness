// Mixer: per-channel gain fader, pan, mute/solo and live meters.
import { useEffect, useRef } from "react";
import { Knob } from "../../components/ui";
import { agentProps } from "../../takeover/registry";
import { CHANNELS, music, type ChannelId, type Channel } from "./store";
import { meterLevels } from "./engine";

export function setChannel(c: ChannelId, patch: Partial<Channel>) {
  music.set((s) => ({ channels: { ...s.channels, [c]: { ...s.channels[c], ...patch } } }));
}

function Meter({ c }: { c: ChannelId }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const db = meterLevels()[c];
      const pct = Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
      if (ref.current) {
        ref.current.style.height = `${pct}%`;
        ref.current.classList.toggle("hot", db > -3);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [c]);
  return <div className="meter"><div ref={ref} className="meter-fill" /></div>;
}

export function Mixer() {
  const s = { channels: music.use((st) => st.channels) };
  return (
    <div className="mixer" {...agentProps("music.mixer", "Mixer", "panel")}>
      {CHANNELS.map((c) => {
        const ch = s.channels[c];
        return (
          <div className="strip" key={c}>
            <div className="strip-n">{c}</div>
            <Knob label="pan" value={ch.pan} min={-1} max={1} step={0.01} size={36} format={(v) => (Math.abs(v) < 0.02 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} onChange={(v) => setChannel(c, { pan: v })} agent={`mixer.${c}.pan`} def={0} />
            <div className="fader-wrap">
              <span className="fader-box"><input type="range" className="fader" min={-48} max={6} step={0.5} value={ch.gain} onChange={(e) => setChannel(c, { gain: Number(e.target.value) })} {...agentProps(`mixer.${c}.gain`, `${c} gain`, "slider")} /></span>
              <Meter c={c} />
            </div>
            <div className="mono tiny">{ch.gain > 0 ? "+" : ""}{ch.gain.toFixed(1)} dB</div>
            <div className="row" style={{ gap: 4 }}>
              <button className={`btn sm ms ${ch.mute ? "on mute" : ""}`} onClick={() => setChannel(c, { mute: !ch.mute })} {...agentProps(`mixer.${c}.mute`, `${c} mute`)}>M</button>
              <button className={`btn sm ms ${ch.solo ? "on solo" : ""}`} onClick={() => setChannel(c, { solo: !ch.solo })} {...agentProps(`mixer.${c}.solo`, `${c} solo`)}>S</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
