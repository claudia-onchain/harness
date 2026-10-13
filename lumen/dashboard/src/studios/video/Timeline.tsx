// Multi-track timeline: ruler + scrubbing, drag/drop clips from the bin or OS, move with snapping,
// trim handles, playhead, zoom. Track kinds accept compatible media only.
import { useRef } from "react";
import { Icon } from "../../components/icons";
import { agentProps } from "../../takeover/registry";
import { fmtTime } from "../../lib/format";
import { addClip, addMedia, kindOf, projectDuration, snapTime, updateClip, video, type Clip, type TrackKind, type MediaKind } from "./store";

const HEAD_W = 92;
const accepts = (track: TrackKind, kind: MediaKind) => (track === "video" ? kind === "video" || kind === "image" : track === "image" ? kind === "image" || kind === "video" : track === "audio" ? kind === "audio" : false);

export function Timeline() {
  const s = video.use();
  const lanes = useRef<HTMLDivElement>(null);
  const dur = projectDuration(s) + 4;
  const width = Math.max(600, dur * s.zoom);

  const timeAt = (clientX: number) => {
    const r = lanes.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + lanes.current!.scrollLeft - HEAD_W) / s.zoom);
  };

  function scrub(e: React.PointerEvent) {
    const set = (x: number) => video.set({ playhead: snapTime(timeAt(x)) });
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  function dragClip(e: React.PointerEvent, c: Clip, mode: "move" | "left" | "right") {
    e.stopPropagation();
    e.preventDefault();
    video.set({ selected: c.id });
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = { ...c };
    const m = c.mediaId ? video.get().bin.find((b) => b.id === c.mediaId) : null;
    const maxDur = m && m.kind !== "image" ? m.duration : Infinity;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / video.get().zoom;
      if (mode === "move") {
        let ns = snapTime(start.start + dt, c.id);
        const endSnap = snapTime(start.start + dt + start.dur, c.id) - start.dur;
        if (Math.abs(endSnap - (start.start + dt)) < Math.abs(ns - (start.start + dt))) ns = endSnap;
        // vertical move → another compatible track
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-track]");
        const tid = el?.dataset.track;
        const tr = video.get().tracks.find((t) => t.id === tid);
        const ok = tr && (c.text !== undefined ? (tr.kind === "text" || tr.kind === "caption") : m && accepts(tr.kind, m.kind));
        updateClip(c.id, { start: Math.max(0, ns), ...(ok && Math.abs(ev.clientY - y0) > 14 ? { trackId: tr!.id } : {}) });
      } else if (mode === "left") {
        let ns = snapTime(start.start + dt, c.id);
        ns = Math.min(ns, start.start + start.dur - 0.1);
        let nin = start.in + (ns - start.start);
        if (nin < 0) { ns -= nin; nin = 0; }
        updateClip(c.id, { start: ns, in: nin, dur: start.dur - (ns - start.start) });
      } else {
        const ne = snapTime(start.start + start.dur + dt, c.id);
        updateClip(c.id, { dur: Math.max(0.1, Math.min(maxDur - start.in, ne - start.start)) });
      }
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  async function onDrop(e: React.DragEvent, trackId: string, kind: TrackKind) {
    e.preventDefault();
    const at = snapTime(timeAt(e.clientX));
    const mediaId = e.dataTransfer.getData("text/lumen-media");
    if (mediaId) { const m = video.get().bin.find((b) => b.id === mediaId); if (m) addClip(mediaId, accepts(kind, m.kind) ? trackId : undefined, at); return; }
    const ext = e.dataTransfer.getData("text/lumen-media-url");
    if (ext) {
      const { url, name, kind: k } = JSON.parse(ext) as { url: string; name: string; kind: MediaKind };
      const m = await addMedia(url, name, k);
      addClip(m.id, accepts(kind, m.kind) ? trackId : undefined, at);
      return;
    }
    for (const f of [...e.dataTransfer.files]) {
      const k = kindOf(f.type, f.name);
      if (!k) continue;
      const m = await addMedia(URL.createObjectURL(f), f.name, k);
      addClip(m.id, accepts(kind, k) ? trackId : undefined, at);
    }
  }

  const step = s.zoom >= 80 ? 1 : s.zoom >= 30 ? 2 : s.zoom >= 15 ? 5 : 10;
  const ticks = Array.from({ length: Math.ceil(dur / step) + 1 }, (_, i) => i * step);

  return (
    <div className="timeline" ref={lanes} {...agentProps("video.timeline", "Timeline", "panel")}>
      <div className="tl-inner" style={{ width: width + HEAD_W }}>
        <div className="tl-ruler" onPointerDown={scrub} {...agentProps("video.ruler", "Timeline ruler (scrub)", "slider")}>
          <div className="tl-head-spacer" />
          {ticks.map((t) => <span key={t} className="tick" style={{ left: HEAD_W + t * s.zoom }}>{fmtTime(t).replace(/\.\d$/, "")}</span>)}
        </div>
        {s.tracks.map((tr) => (
          <div key={tr.id} className={`tl-track k-${tr.kind}`} data-track={tr.id}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, tr.id, tr.kind)}
            {...agentProps(`video.track.${tr.id}`, `${tr.name} track`, "track")}>
            <div className="tl-th">
              <span className="tn">{tr.name}</span>
              <button className={`btn ghost sm icon ${tr.hidden || tr.muted ? "on" : ""}`} title={tr.kind === "audio" ? "Mute" : "Hide"} onClick={() => video.set((st) => ({ tracks: st.tracks.map((x) => (x.id === tr.id ? (tr.kind === "audio" ? { ...x, muted: !x.muted } : { ...x, hidden: !x.hidden }) : x)) }))}>
                <Icon name={tr.kind === "audio" ? (tr.muted ? "x" : "audio") : tr.hidden ? "eyeOff" : "eye"} size={13} />
              </button>
            </div>
            <div className="tl-lane">
              {s.clips.filter((c) => c.trackId === tr.id).map((c) => {
                const m = c.mediaId ? s.bin.find((b) => b.id === c.mediaId) : null;
                return (
                  <div key={c.id} className={`clip ${s.selected === c.id ? "on" : ""}`} style={{ left: c.start * s.zoom, width: Math.max(6, c.dur * s.zoom) }}
                    onPointerDown={(e) => dragClip(e, c, "move")} {...agentProps(`video.clip.${c.id}`, `Clip ${c.text ?? m?.name ?? c.id}`, "button")}>
                    <span className="h l" onPointerDown={(e) => dragClip(e, c, "left")} />
                    {m?.kind === "image" && <img src={m.url} alt="" draggable={false} />}
                    {m?.kind === "video" && <span className="film" />}
                    {c.fadeIn > 0 && <span className="fade in" style={{ width: c.fadeIn * s.zoom }} />}
                    {c.fadeOut > 0 && <span className="fade out" style={{ width: c.fadeOut * s.zoom }} />}
                    <span className="cl">{c.text ?? m?.name ?? "clip"}</span>
                    <span className="h r" onPointerDown={(e) => dragClip(e, c, "right")} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="tl-playhead" style={{ left: HEAD_W + s.playhead * s.zoom }} onPointerDown={scrub}><span /></div>
      </div>
    </div>
  );
}
