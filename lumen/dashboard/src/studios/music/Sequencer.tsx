// 16-step drum sequencer + sampler lane (drop an audio file onto the lane).
import { agentProps } from "../../takeover/registry";
import { DRUMS, STEPS, music, playhead, type DrumId } from "./store";
import { audition } from "./engine";

export function Sequencer() {
  const s = music.use();
  const step = playhead.use((p) => p.step);
  const cur = step >= 0 ? step % STEPS : -1;
  const toggle = (d: DrumId, i: number) => {
    const row = [...s.drums[d]];
    row[i] = !row[i];
    music.set({ drums: { ...s.drums, [d]: row } });
    if (row[i] && !s.playing) audition(d);
  };
  const toggleSampler = (i: number) => {
    const steps = [...s.sampler.steps];
    steps[i] = !steps[i];
    music.set({ sampler: { ...s.sampler, steps } });
  };
  const onDropSample = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    const url = f ? URL.createObjectURL(f) : e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!url || (f && !f.type.startsWith("audio/"))) return;
    music.set({ sampler: { ...s.sampler, url, name: f?.name ?? url.split("/").pop() ?? "sample" } });
  };
  return (
    <div className="seq" {...agentProps("music.sequencer", "Drum sequencer", "panel")}>
      {DRUMS.map((d) => (
        <div className="seq-row" key={d}>
          <button className="seq-name" onClick={() => audition(d)} title="Audition">{d}</button>
          <div className="seq-steps">
            {s.drums[d].map((on, i) => (
              <button key={i} className={`step ${on ? "on" : ""} ${i % 4 === 0 ? "beat" : ""} ${cur === i ? "cur" : ""}`} onClick={() => toggle(d, i)} {...agentProps(`music.step.${d}.${i}`, `${d} step ${i + 1}`, "button")} aria-pressed={on} />
            ))}
          </div>
        </div>
      ))}
      <div className="seq-row sampler" onDragOver={(e) => e.preventDefault()} onDrop={onDropSample} {...agentProps("music.sampler", "Sampler lane (drop audio)", "track")}>
        <span className="seq-name" title={s.sampler.name ?? "Drop an audio file"}>{s.sampler.name ? s.sampler.name.slice(0, 10) : "sampler"}</span>
        <div className="seq-steps">
          {s.sampler.steps.map((on, i) => (
            <button key={i} className={`step smp ${on ? "on" : ""} ${i % 4 === 0 ? "beat" : ""} ${cur === i ? "cur" : ""}`} onClick={() => toggleSampler(i)} disabled={!s.sampler.url} {...agentProps(`music.step.sampler.${i}`, `sampler step ${i + 1}`, "button")} />
          ))}
        </div>
      </div>
      {!s.sampler.url && <div className="tiny dim" style={{ paddingLeft: 74 }}>Drop a WAV/MP3 on the sampler lane (or drag one from the Media library).</div>}
    </div>
  );
}
