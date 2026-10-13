// Media library: every generated job + upload, with previews. Drag items into the studios.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, upload, errText } from "../lib/api";
import { toast } from "../lib/toast";
import { ago } from "../lib/format";
import { agent, useAgent } from "../state/agent";
import { useApp } from "../state/app";
import { Empty, PageHeader, pickFiles } from "../components/ui";
import { Icon } from "../components/icons";
import { openImage } from "../studios/photo/store";
import { addMedia, kindOf } from "../studios/video/store";
import { loadAudioUrl } from "../studios/audio/AudioStudio";
import type { MediaJob } from "../lib/types";

type Entry = { id: string; url: string; mime: string; name: string; kind: "image" | "video" | "audio"; job?: MediaJob; local?: boolean };

export default function Library() {
  const a = useAgent();
  const { mode } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState("all");
  const [local, setLocal] = useState<Entry[]>([]);
  useEffect(() => { if (mode === "online") api<MediaJob[]>("/api/media").then((l) => agent.setMedia(l)).catch(() => {}); }, [mode]);

  const entries = useMemo(() => {
    const out: Entry[] = [...local];
    for (const j of Object.values(a.media)) j.outputs.forEach((o, i) => {
      const k = kindOf(o.mime, o.url);
      if (k) out.push({ id: `${j.id}-${i}`, url: o.url, mime: o.mime, name: j.prompt.slice(0, 60) || j.id, kind: k, job: j });
    });
    return out.filter((e) => filter === "all" || e.kind === filter).sort((x, y) => Number(new Date(y.job?.createdAt ?? Date.now())) - Number(new Date(x.job?.createdAt ?? Date.now())));
  }, [a.media, local, filter]);
  const pending = Object.values(a.media).filter((j) => j.status !== "done" && j.status !== "failed");

  async function add() {
    const files = await pickFiles("image/*,video/*,audio/*");
    for (const f of files) {
      const k = kindOf(f.type, f.name);
      if (!k) continue;
      let url = URL.createObjectURL(f);
      if (mode === "online") { try { url = (await upload(f, f.name)).url; } catch (e) { toast(errText(e), "warn"); } }
      setLocal((l) => [...l, { id: `u${Date.now()}${f.name}`, url, mime: f.type, name: f.name, kind: k, local: true }]);
    }
  }
  async function openIn(e: Entry) {
    try {
      if (e.kind === "image") { await openImage(e.url, e.name); nav("/studio/photo"); }
      else if (e.kind === "audio") { nav("/studio/audio"); setTimeout(() => loadAudioUrl(e.url, e.name).catch((er) => toast(errText(er), "bad")), 300); }
      else { await addMedia(e.url, e.name, "video"); nav("/studio/video"); }
    } catch (er) { toast(errText(er), "bad"); }
  }
  return (
    <div className="page">
      <PageHeader title="Media library" sub="Everything Lumen generated, plus your uploads. Drag a tile onto a studio (timeline, sampler lane, photo canvas)."><button className="btn" onClick={add}><Icon name="upload" /> Add files</button></PageHeader>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {["all", "image", "video", "audio"].map((f) => <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}
        {pending.length > 0 && <span className="badge accent"><span className="spinner" style={{ width: 10, height: 10 }} /> {pending.length} job(s) running</span>}
      </div>
      {entries.length === 0 ? <Empty icon="library" title="No media yet">Generate in the Image studio, ask the agent (<code>lumen gen image "…"</code>), or add files.</Empty> : (
        <div className="media-grid">
          {entries.map((e) => (
            <div key={e.id} className="media-tile" draggable onDragStart={(ev) => { ev.dataTransfer.setData("text/lumen-media-url", JSON.stringify({ url: e.url, name: e.name, kind: e.kind })); ev.dataTransfer.setData("text/uri-list", e.url); }} data-agent-id={`library.${e.id}`} data-agent-label={e.name}>
              <div className="thumb">
                {e.kind === "image" ? <img src={e.url} alt="" loading="lazy" /> : e.kind === "video" ? <video src={e.url} muted preload="metadata" /> : <Icon name="audio" size={28} />}
              </div>
              <div className="over"><span className="badge">{e.kind}</span></div>
              <div className="cap"><span className="grow" title={e.name}>{e.name}</span><span className="tiny dim">{e.job ? ago(e.job.createdAt) : "upload"}</span></div>
              <div className="tile-actions"><button className="btn sm" onClick={() => openIn(e)}>Open in {e.kind === "image" ? "Photo" : e.kind === "audio" ? "Audio" : "Video"}</button><a className="btn sm icon" href={e.url} download title="Download"><Icon name="download" size={13} /></a></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
