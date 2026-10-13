// Image studio: prompt → POST /api/media/generate (kind image), model + aspect pickers, live job gallery,
// send results to the Photo studio or the Video bin.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Btn, Empty, Panel } from "../../components/ui";
import { Icon } from "../../components/icons";
import { agentProps, useAgentCommands } from "../../takeover/registry";
import { api, errText } from "../../lib/api";
import { toast } from "../../lib/toast";
import { ago } from "../../lib/format";
import { agent, useAgent } from "../../state/agent";
import { useApp } from "../../state/app";
import type { MediaJob } from "../../lib/types";
import { openImage } from "../photo/store";
import { addMedia } from "../video/store";

export const IMAGE_MODELS = [
  { id: "", label: "Auto (best configured)" },
  { id: "openai/gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst" },
  { id: "black-forest-labs/flux-3-image", label: "FLUX 3" },
  { id: "google/gemini-nano-banana-2.1", label: "Nano Banana 2.1" },
  { id: "bytedance-seed/seedream-5-0-pro", label: "Seedream 5 Pro" },
  { id: "x-ai/grok-imagine-image-2.0", label: "Grok Imagine 2.0" },
  { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image" },
];
const ASPECTS = ["1:1", "16:9", "9:16", "4:5", "3:2", "21:9"];
const STYLES = ["cinematic lighting", "studio product shot", "35mm film grain", "isometric 3D", "flat vector", "watercolor", "neon cyberpunk"];

export default function ImageStudio() {
  const a = useAgent();
  const { mode } = useApp();
  const nav = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<MediaJob | null>(null);

  useEffect(() => {
    if (mode !== "online") return;
    api<MediaJob[]>("/api/media").then((l) => agent.setMedia(l)).catch(() => {});
  }, [mode]);

  const jobs = useMemo(() => Object.values(a.media).filter((j) => j.kind === "image").sort((x, y) => Number(new Date(y.createdAt)) - Number(new Date(x.createdAt))), [a.media]);

  async function generate(p = prompt, m = model, asp = aspect) {
    if (!p.trim()) throw new Error("prompt is empty");
    setBusy(true);
    try {
      const job = await api<MediaJob>("/api/media/generate", { method: "POST", body: { kind: "image", prompt: p.trim(), ...(m ? { model: m } : {}), aspect: asp } });
      agent.upsertMedia(job);
      toast(job.status === "awaiting_approval" ? "Waiting for your approval (cost above the media cap)" : "Generating…", job.status === "awaiting_approval" ? "warn" : "info");
      return { jobId: job.id, status: job.status };
    } catch (e) { toast(errText(e), "bad"); throw e; } finally { setBusy(false); }
  }

  async function toPhoto(url: string) { await openImage(url, "Generated"); nav("/studio/photo"); }
  async function toVideo(url: string) { await addMedia(url, `image-${Date.now()}.png`, "image"); toast("Added to the Video bin", "ok", { label: "Open", run: () => nav("/studio/video") }); }

  useAgentCommands([
    { name: "image.generate", description: "Generate an image from a prompt. model optional (OpenRouter id); aspect like 16:9.", params: { type: "object", properties: { prompt: { type: "string" }, model: { type: "string" }, aspect: { type: "string" } }, required: ["prompt"] }, panel: "image.prompt",
      run: async ({ prompt: p, model: m, aspect: asp }) => { setPrompt(String(p)); if (m) setModel(String(m)); if (asp) setAspect(String(asp)); return generate(String(p), m ?? model, asp ?? aspect); } },
    { name: "image.toPhoto", description: "Open a generated image (job id or url) in the Photo studio.", params: { type: "object", properties: { jobId: { type: "string" }, url: { type: "string" } } }, panel: "image.gallery",
      run: async ({ jobId, url }) => { const u = url ?? a.media[jobId]?.outputs[0]?.url; if (!u) throw new Error("no image"); await toPhoto(u); return { ok: true }; } },
  ], () => `Image studio: prompt "${prompt.slice(0, 80)}", model ${model || "auto"}, aspect ${aspect}. ${jobs.length} image job(s): ${jobs.slice(0, 5).map((j) => `${j.id} ${j.status}`).join(", ")}.`);

  return (
    <div className="page image-studio">
      <div className="img-hero panel" {...agentProps("image.prompt", "Image prompt", "panel")}>
        <textarea className="textarea img-prompt" rows={3} placeholder="Describe the image: subject, setting, lighting, lens, mood, style…" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate().catch(() => {}); }} {...agentProps("image.promptInput", "Prompt", "input")} />
        <div className="row wrap">
          {STYLES.map((s) => <button key={s} className="chip" onClick={() => setPrompt((p) => (p.trim() ? `${p.trim()}, ${s}` : s))}>+ {s}</button>)}
        </div>
        <div className="row wrap">
          <select className="select" style={{ width: 230 }} value={model} onChange={(e) => setModel(e.target.value)} {...agentProps("image.model", "Model", "input")}>
            {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <div className="tabs">
            {ASPECTS.map((x) => <button key={x} className={`tab ${aspect === x ? "on" : ""}`} onClick={() => setAspect(x)} {...agentProps(`image.aspect.${x}`, `Aspect ${x}`, "tab")}>{x}</button>)}
          </div>
          <div className="grow" />
          <Btn kind="primary" icon="wand" onClick={() => generate().catch(() => {})} disabled={busy || !prompt.trim() || mode !== "online"} agent="image.generateBtn" label="Generate">{busy ? "Sending…" : "Generate"}</Btn>
        </div>
        {mode !== "online" && <span className="tiny dim">Connect the Lumen server with an OpenRouter, OpenAI, xAI or fal key to generate images.</span>}
      </div>

      <Panel title={`Gallery · ${jobs.length}`} agentId="image.gallery" agentLabel="Gallery" className="gallery-panel">
        {jobs.length === 0 ? (
          <Empty icon="image" title="No images yet">Generated images appear here live, with their prompt, model and cost.</Empty>
        ) : (
          <div className="media-grid">
            {jobs.map((j) => {
              const out = j.outputs[0];
              return (
                <div key={j.id} className="media-tile" draggable={Boolean(out)} onDragStart={(e) => out && e.dataTransfer.setData("text/lumen-media-url", JSON.stringify({ url: out.url, name: `${j.id}.png`, kind: "image" }))} {...agentProps(`image.job.${j.id}`, `Image ${j.prompt.slice(0, 30)}`)}>
                  <div className="thumb" onClick={() => out && setView(j)}>
                    {out ? <img src={out.url} alt={j.prompt} loading="lazy" /> : j.status === "failed" ? <Icon name="x" size={22} /> : <span className="spinner" />}
                  </div>
                  <div className="over">{j.status !== "done" && <span className={`badge ${j.status === "failed" ? "bad" : j.status === "awaiting_approval" ? "warn" : "accent"}`}>{j.status.replace("_", " ")}</span>}</div>
                  <div className="cap"><span className="grow">{j.prompt}</span></div>
                  {out && (
                    <div className="tile-actions">
                      <button className="btn sm" onClick={() => toPhoto(out.url)}>Edit in Photo</button>
                      <button className="btn sm icon" title="Send to Video" onClick={() => toVideo(out.url)}><Icon name="film" size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {view && view.outputs[0] && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={view.outputs[0].url} alt={view.prompt} onClick={(e) => e.stopPropagation()} />
          <div className="lb-meta" onClick={(e) => e.stopPropagation()}>
            <p>{view.prompt}</p>
            <div className="row wrap small muted"><span>{view.provider} · {view.model}</span><span>{ago(view.createdAt)}</span>{view.costUsd != null && <span>${view.costUsd.toFixed(3)}</span>}</div>
            <div className="row"><button className="btn primary sm" onClick={() => toPhoto(view.outputs[0].url)}>Edit in Photo</button><button className="btn sm" onClick={() => toVideo(view.outputs[0].url)}>Send to Video</button><a className="btn sm" href={view.outputs[0].url} download>Download</a></div>
          </div>
        </div>
      )}
    </div>
  );
}
