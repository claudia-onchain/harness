// Video studio: media bin, live preview compositor, multi-track timeline, inspector, export (ffmpeg.wasm → MP4,
// MediaRecorder → WebM fallback). Every control is agent-drivable.
import { useEffect, useRef, useState } from "react";
import { Btn, Panel, pickFiles } from "../../components/ui";
import { Icon } from "../../components/icons";
import { agentProps, useAgentCommands } from "../../takeover/registry";
import { download, fmtTime } from "../../lib/format";
import { toast } from "../../lib/toast";
import { upload, errText } from "../../lib/api";
import { isDemo } from "../../state/app";
import { Compositor } from "./compositor";
import { exportVideo } from "./exporter";
import { Timeline } from "./Timeline";
import { ASPECTS, addClip, addMedia, addTextClip, kindOf, projectDuration, removeClip, splitClip, summary, trimClip, updateClip, video, type Aspect, type MediaKind } from "./store";

function Preview() {
  const s = video.use();
  const canvas = useRef<HTMLCanvasElement>(null);
  const comp = useRef(new Compositor());
  const [W, H] = ASPECTS[s.aspect];
  const pw = Math.round(W / 2), ph = Math.round(H / 2);

  useEffect(() => () => comp.current.dispose(), []);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const st = video.get();
      let t = st.playhead;
      if (st.playing) {
        t += (now - last) / 1000;
        if (t >= projectDuration(st)) { t = 0; video.set({ playing: false, playhead: 0 }); }
        else video.set({ playhead: t });
      }
      last = now;
      comp.current.sync(st, t, st.playing);
      const ctx = canvas.current?.getContext("2d");
      if (ctx) comp.current.draw(ctx, pw, ph, t, st);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pw, ph]);

  return (
    <div className="v-preview" {...agentProps("video.preview", "Preview", "canvas")}>
      <canvas ref={canvas} width={pw} height={ph} style={{ aspectRatio: `${W} / ${H}` }} />
      {!s.clips.length && <div className="v-empty"><Icon name="film" size={28} /><span>Drag media onto the timeline</span></div>}
    </div>
  );
}

function MediaBin({ onFiles }: { onFiles: (f: File[]) => void }) {
  const s = video.use();
  return (
    <div className="bin" {...agentProps("video.bin", "Media bin", "list")}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); else { const ext = e.dataTransfer.getData("text/lumen-media-url"); if (ext) { const j = JSON.parse(ext); addMedia(j.url, j.name, j.kind); } } }}>
      {s.bin.length === 0 && <div className="tiny dim" style={{ padding: 10 }}>Drop video, images or audio here, or pick from the Media library.</div>}
      {s.bin.map((b) => (
        <div key={b.id} className="bin-i" draggable onDragStart={(e) => { e.dataTransfer.setData("text/lumen-media", b.id); e.dataTransfer.effectAllowed = "copy"; }}
          onDoubleClick={() => addClip(b.id)} title="Drag to a track, or double-click to append" {...agentProps(`video.media.${b.id}`, `Media ${b.name}`, "button")}>
          <div className="bt">{b.kind === "image" ? <img src={b.url} alt="" draggable={false} /> : b.kind === "video" ? <video src={b.url} muted preload="metadata" /> : <Icon name="audio" size={20} />}</div>
          <div className="bn"><span>{b.name}</span><span className="dim mono">{b.kind === "image" ? "img" : fmtTime(b.duration).replace(/\.\d$/, "")}</span></div>
        </div>
      ))}
    </div>
  );
}

function Inspector() {
  const s = video.use();
  const c = s.clips.find((x) => x.id === s.selected);
  if (!c) return <div className="tiny dim">Select a clip to edit timing, fades, volume or text.</div>;
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <div className="col" {...agentProps("video.inspector", "Clip inspector", "panel")}>
      {c.text !== undefined && <textarea className="textarea" rows={2} value={c.text} onChange={(e) => updateClip(c.id, { text: e.target.value })} {...agentProps("video.clipText", "Clip text", "input")} />}
      <div className="insp-grid">
        <label className="field">Start<input className="input mono" type="number" step={0.1} value={c.start.toFixed(2)} onChange={(e) => updateClip(c.id, { start: num(e.target.value) })} /></label>
        <label className="field">Length<input className="input mono" type="number" step={0.1} value={c.dur.toFixed(2)} onChange={(e) => trimClip(c.id, c.start, c.start + Math.max(0.1, num(e.target.value)))} /></label>
        <label className="field">Fade in<input className="input mono" type="number" step={0.1} value={c.fadeIn} onChange={(e) => updateClip(c.id, { fadeIn: num(e.target.value) })} /></label>
        <label className="field">Fade out<input className="input mono" type="number" step={0.1} value={c.fadeOut} onChange={(e) => updateClip(c.id, { fadeOut: num(e.target.value) })} /></label>
      </div>
      {c.mediaId && <label className="slider-row"><span className="sl-l">Volume</span><input type="range" min={0} max={1} step={0.01} value={c.volume} onChange={(e) => updateClip(c.id, { volume: Number(e.target.value) })} /><span className="sl-v mono">{Math.round(c.volume * 100)}</span></label>}
      {c.style && <label className="slider-row"><span className="sl-l">Text size</span><input type="range" min={24} max={180} value={c.style.size} onChange={(e) => updateClip(c.id, { style: { ...c.style!, size: Number(e.target.value) } })} /><span className="sl-v mono">{c.style.size}</span></label>}
      <div className="row">
        <Btn size="sm" icon="scissors" onClick={() => { try { splitClip(c.id, s.playhead); } catch (e) { toast(errText(e), "warn"); } }}>Split at playhead</Btn>
        <div className="grow" />
        <Btn size="sm" kind="danger" icon="trash" onClick={() => removeClip(c.id)}>Delete</Btn>
      </div>
    </div>
  );
}

export default function VideoStudio() {
  const s = video.use();
  const [progress, setProgress] = useState<{ p: number; label: string } | null>(null);

  async function onFiles(files: File[]) {
    for (const f of files) { const k = kindOf(f.type, f.name); if (k) await addMedia(URL.createObjectURL(f), f.name, k); }
  }

  async function doExport(prefer: "auto" | "webm" = "auto") {
    video.set({ playing: false });
    setProgress({ p: 0, label: "Preparing…" });
    try {
      const r = await exportVideo((p, label) => setProgress({ p, label }), prefer);
      download(r.blob, r.name);
      let url: string | undefined;
      if (!isDemo()) url = (await upload(r.blob, r.name).catch(() => null))?.url;
      toast(`Exported ${r.name} via ${r.via}`, "ok");
      return { exportUrl: url ?? null, name: r.name, via: r.via, bytes: r.blob.size };
    } catch (e) { toast(`Export failed: ${errText(e)}`, "bad"); throw e; }
    finally { setProgress(null); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, textarea, select")) return;
      const st = video.get();
      if (e.key === " ") { e.preventDefault(); video.set({ playing: !st.playing }); }
      if (e.key.toLowerCase() === "s" && !e.metaKey) { try { splitClip(st.selected ?? undefined, st.playhead); } catch { /* */ } }
      if ((e.key === "Delete" || e.key === "Backspace") && st.selected) removeClip(st.selected);
    };
    addEventListener("keydown", onKey);
    return () => { removeEventListener("keydown", onKey); video.set({ playing: false }); };
  }, []);

  useAgentCommands([
    { name: "video.import", description: "Add a media URL to the bin. kind: video|image|audio.", params: { type: "object", properties: { url: { type: "string" }, kind: { type: "string" }, name: { type: "string" } }, required: ["url"] }, panel: "video.bin",
      run: async ({ url, kind, name }) => { const k = (kind as MediaKind) ?? kindOf("", String(url)) ?? "video"; const m = await addMedia(String(url), name ?? String(url).split("/").pop() ?? "media", k); return { mediaId: m.id }; } },
    { name: "video.addClip", description: "Place media on the timeline. src: a bin media id or a URL; track: V1|V2|A1 (optional); at: seconds (default end of track).", params: { type: "object", properties: { src: { type: "string" }, track: { type: "string" }, at: { type: "number" } }, required: ["src"] }, panel: "video.timeline",
      run: async ({ src, track, at }) => {
        let m = video.get().bin.find((b) => b.id === src || b.url === src);
        if (!m) m = await addMedia(String(src), String(src).split("/").pop() ?? "media", kindOf("", String(src)) ?? "video");
        const c = addClip(m.id, track, at);
        return { clipId: c.id, start: c.start, dur: c.dur };
      } },
    { name: "video.trim", description: "Set a clip's start/end on the timeline (seconds). Trimming the head advances the source in-point.", params: { type: "object", properties: { clipId: { type: "string" }, start: { type: "number" }, end: { type: "number" } }, required: ["clipId"] }, panel: "video.timeline", run: ({ clipId, start, end }) => trimClip(clipId, start, end) },
    { name: "video.split", description: "Split a clip at a time (defaults: selected clip, playhead).", params: { type: "object", properties: { clipId: { type: "string" }, at: { type: "number" } } }, panel: "video.timeline", run: ({ clipId, at }) => splitClip(clipId, at ?? video.get().playhead) },
    { name: "video.addText", description: "Add a title/text overlay from start to end seconds.", params: { type: "object", properties: { text: { type: "string" }, start: { type: "number" }, end: { type: "number" } }, required: ["text"] }, panel: "video.timeline", run: ({ text, start, end }) => { const st = start ?? video.get().playhead; return { clipId: addTextClip(String(text), st, end ?? st + 3).id }; } },
    { name: "video.addCaption", description: "Add a caption on the captions track from start to end seconds.", params: { type: "object", properties: { text: { type: "string" }, start: { type: "number" }, end: { type: "number" } }, required: ["text", "start", "end"] }, panel: "video.timeline", run: ({ text, start, end }) => ({ clipId: addTextClip(String(text), Number(start), Number(end), true).id }) },
    { name: "video.fade", description: "Set fade in/out seconds on a clip.", params: { type: "object", properties: { clipId: { type: "string" }, in: { type: "number" }, out: { type: "number" } }, required: ["clipId"] }, panel: "video.timeline", run: ({ clipId, in: fi, out }) => { updateClip(clipId, { ...(fi !== undefined ? { fadeIn: Number(fi) } : {}), ...(out !== undefined ? { fadeOut: Number(out) } : {}) }); return { ok: true }; } },
    { name: "video.remove", description: "Delete a clip.", params: { type: "object", properties: { clipId: { type: "string" } }, required: ["clipId"] }, panel: "video.timeline", run: ({ clipId }) => { removeClip(clipId); return { ok: true }; } },
    { name: "video.seek", description: "Move the playhead to t seconds.", params: { type: "object", properties: { t: { type: "number" } }, required: ["t"] }, panel: "video.preview", run: ({ t }) => { video.set({ playhead: Math.max(0, Number(t)) }); return { playhead: video.get().playhead }; } },
    { name: "video.play", description: "Play the preview.", params: { type: "object", properties: {} }, panel: "video.preview", run: () => { video.set({ playing: true }); return { ok: true }; } },
    { name: "video.stop", description: "Pause the preview.", params: { type: "object", properties: {} }, panel: "video.preview", run: () => { video.set({ playing: false }); return { ok: true }; } },
    { name: "video.aspect", description: "Set the canvas aspect: 9:16|16:9|1:1|4:5.", params: { type: "object", properties: { aspect: { type: "string" } }, required: ["aspect"] }, panel: "video.preview", run: ({ aspect }) => { if (!(aspect in ASPECTS)) throw new Error("bad aspect"); video.set({ aspect }); return { aspect }; } },
    { name: "video.export", description: "Export the timeline: MP4 via ffmpeg.wasm, WebM fallback. Downloads and saves to uploads; returns {exportUrl}.", params: { type: "object", properties: { format: { type: "string", enum: ["mp4", "webm"] } } }, panel: "video.exportBar", run: ({ format }) => doExport(format === "webm" ? "webm" : "auto") },
  ], summary);

  return (
    <div className="page full studio video-studio">
      <div className="studio-bar panel">
        <Btn kind="primary" icon={s.playing ? "pause" : "play"} onClick={() => video.set({ playing: !s.playing })} agent={s.playing ? "video.pause" : "video.play"} label={s.playing ? "Pause" : "Play"}>{s.playing ? "Pause" : "Play"}</Btn>
        <span className="mono small">{fmtTime(s.playhead)} <span className="dim">/ {fmtTime(projectDuration(s))}</span></span>
        <Btn size="sm" icon="scissors" onClick={() => { try { splitClip(s.selected ?? undefined, s.playhead); } catch (e) { toast(errText(e), "warn"); } }} agent="video.splitBtn" label="Split at playhead" title="Split (S)">Split</Btn>
        <Btn size="sm" icon="text" onClick={() => addTextClip("Your title", s.playhead, s.playhead + 3)} agent="video.addTextBtn" label="Add text" className="hide-sm">Text</Btn>
        <Btn size="sm" icon="chat" onClick={() => addTextClip("Caption", s.playhead, s.playhead + 2, true)} agent="video.addCaptionBtn" label="Add caption">Caption</Btn>
        <button className={`btn sm ${s.snap ? "on" : ""}`} onClick={() => video.set({ snap: !s.snap })} {...agentProps("video.snap", "Snapping", "button")}><Icon name="magnet" size={14} /><span className="hide-sm">Snap</span></button>
        <div className="row hide-sm">
          <Icon name="zoomOut" size={14} />
          <input type="range" min={10} max={200} value={s.zoom} onChange={(e) => video.set({ zoom: Number(e.target.value) })} style={{ width: 90 }} {...agentProps("video.zoom", "Timeline zoom", "slider")} />
          <Icon name="zoomIn" size={14} />
        </div>
        <div className="grow" />
        <select className="select" style={{ width: 84, height: 30 }} value={s.aspect} onChange={(e) => video.set({ aspect: e.target.value as Aspect })} {...agentProps("video.aspectSelect", "Aspect ratio", "input")}>
          {Object.keys(ASPECTS).map((a) => <option key={a}>{a}</option>)}
        </select>
        <div className="row" {...agentProps("video.exportBar", "Export", "panel")}>
          <Btn size="sm" kind="primary" icon="download" onClick={() => doExport().catch(() => {})} disabled={!!progress || !s.clips.length} agent="video.exportBtn" label="Export video">Export</Btn>
        </div>
      </div>
      {progress && (
        <div className="progress"><div style={{ width: `${Math.round(progress.p * 100)}%` }} /><span>{progress.label}</span></div>
      )}
      <div className="video-grid">
        <Panel title="Media" className="area-bin" actions={<Btn size="sm" kind="ghost" icon="plus" onClick={async () => onFiles(await pickFiles("video/*,image/*,audio/*"))} agent="video.importBtn" label="Import media" />} bodyClass="panel-b bin-body">
          <MediaBin onFiles={onFiles} />
        </Panel>
        <div className="area-preview"><Preview /></div>
        <Panel title="Inspector" className="area-insp"><Inspector /></Panel>
      </div>
      <Timeline />
    </div>
  );
}
