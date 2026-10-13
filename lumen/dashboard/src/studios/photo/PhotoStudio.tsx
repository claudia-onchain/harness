// Photo studio: Konva canvas with layers, tools, adjustments, looks, undo/redo, export and "send to Video".
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Btn, Panel, pickFiles } from "../../components/ui";
import { Icon } from "../../components/icons";
import { agentProps, useAgentCommands } from "../../takeover/registry";
import { download } from "../../lib/format";
import { toast } from "../../lib/toast";
import { upload, errText } from "../../lib/api";
import { isDemo } from "../../state/app";
import { addMedia } from "../video/store";
import { PhotoCanvas, exportDoc } from "./Canvas";
import { LayersPanel } from "./LayersPanel";
import { ADJUST0, ADJUST_RANGES, PRESETS, demoImageDataUrl, type Adjust } from "./filters";
import { addShape, addText, applyCrop, commit, openImage, photo, redo, summary, undo, type Tool } from "./store";

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: "move", icon: "move", label: "Move", key: "v" },
  { id: "crop", icon: "crop", label: "Crop", key: "c" },
  { id: "brush", icon: "brush", label: "Brush", key: "b" },
  { id: "eraser", icon: "eraser", label: "Eraser", key: "e" },
  { id: "text", icon: "text", label: "Text", key: "t" },
  { id: "shape", icon: "shape", label: "Shape", key: "u" },
];

const readUrl = (f: File) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });

function setAdjust(k: keyof Adjust, v: number, record = false) {
  const fn = (s: ReturnType<typeof photo.get>) => ({ adjust: { ...s.adjust, [k]: v } });
  record ? commit(fn) : photo.set(fn);
}

export default function PhotoStudio() {
  const s = photo.use();
  const nav = useNavigate();
  const [over, setOver] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches("input, textarea, select")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      const tool = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tool && !e.metaKey && !e.ctrlKey) photo.set({ tool: tool.id });
      if (e.key === "Enter" && photo.get().crop) applyCrop(photo.get().crop!);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  async function openFiles(files: File[]) {
    for (const f of files.filter((x) => x.type.startsWith("image/"))) await openImage(await readUrl(f), f.name);
  }

  async function doExport(format: "png" | "jpeg" = "png") {
    const blob = await exportDoc(format);
    const name = `lumen-photo-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
    download(blob, name);
    let saved: string | undefined;
    if (!isDemo()) saved = (await upload(blob, name).catch(() => null))?.url;
    return { ok: true, name, bytes: blob.size, url: saved };
  }

  async function sendToVideo() {
    try {
      const blob = await exportDoc("png");
      const url = URL.createObjectURL(blob);
      await addMedia(url, `photo-${new Date().toLocaleTimeString()}.png`, "image");
      toast("Sent to the Video studio media bin", "ok", { label: "Open", run: () => nav("/studio/video") });
    } catch (e) { toast(errText(e), "bad"); }
  }

  useAgentCommands([
    { name: "photo.open", description: "Open an image URL as a new layer.", params: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }, panel: "photo.canvas", run: async ({ url }) => { const l = await openImage(String(url), String(url).split("/").pop() || "Image"); return { layerId: l.id }; } },
    { name: "photo.demoImage", description: "Open a generated sample landscape (when no image is loaded).", params: { type: "object", properties: {} }, panel: "photo.canvas", run: async () => { if (!photo.get().layers.length) await openImage(demoImageDataUrl(), "Sample landscape"); return { ok: true }; } },
    { name: "photo.filter", description: `Apply an adjustment or look. name: ${Object.keys(ADJUST_RANGES).join("|")} (amount in that range: brightness/contrast/saturation -1..1, hue -180..180, blur 0..20, sharpen/vignette 0..1) or a look preset: ${Object.keys(PRESETS).join("|")}.`, params: { type: "object", properties: { name: { type: "string" }, amount: { type: "number" } }, required: ["name"] }, panel: "photo.adjust",
      run: ({ name, amount }) => {
        if (name in PRESETS) { commit({ preset: String(name) }); return { preset: name }; }
        if (!(name in ADJUST_RANGES)) throw new Error(`unknown filter ${name}`);
        const [min, max] = ADJUST_RANGES[name as keyof Adjust];
        const v = Math.max(min, Math.min(max, Number(amount ?? (max > 1 ? max / 4 : 0.3))));
        setAdjust(name as keyof Adjust, v, true);
        return { [name]: v };
      } },
    { name: "photo.reset", description: "Reset all adjustments and the look preset.", params: { type: "object", properties: {} }, panel: "photo.adjust", run: () => { commit({ adjust: { ...ADJUST0 }, preset: "none" }); return { ok: true }; } },
    { name: "photo.crop", description: "Crop the document to x,y,w,h in document pixels.", params: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["x", "y", "w", "h"] }, panel: "photo.canvas", run: ({ x, y, w, h }) => applyCrop({ x: Number(x), y: Number(y), w: Number(w), h: Number(h) }) },
    { name: "photo.addText", description: "Add a text layer. size in px; x,y in document pixels.", params: { type: "object", properties: { text: { type: "string" }, x: { type: "number" }, y: { type: "number" }, size: { type: "number" }, color: { type: "string" } }, required: ["text"] }, panel: "photo.canvas", run: ({ text, x, y, size, color }) => ({ layerId: addText(String(text), x, y, size ?? Math.round(photo.get().w / 16), color ?? "#ffffff").id }) },
    { name: "photo.addShape", description: "Add a rectangle or ellipse layer.", params: { type: "object", properties: { shape: { type: "string", enum: ["rect", "ellipse"] }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" }, color: { type: "string" } }, required: ["shape", "x", "y", "w", "h"] }, panel: "photo.canvas", run: ({ shape, x, y, w, h, color }) => ({ layerId: addShape(shape, x, y, w, h, color).id }) },
    { name: "photo.tool", description: "Select a tool: move|crop|brush|eraser|text|shape.", params: { type: "object", properties: { tool: { type: "string" } }, required: ["tool"] }, panel: "photo.tools", run: ({ tool }) => { photo.set({ tool }); return { tool }; } },
    { name: "photo.undo", description: "Undo.", params: { type: "object", properties: {} }, panel: "photo.tools", run: () => { undo(); return { ok: true }; } },
    { name: "photo.redo", description: "Redo.", params: { type: "object", properties: {} }, panel: "photo.tools", run: () => { redo(); return { ok: true }; } },
    { name: "photo.export", description: "Export the image (png|jpeg): downloads it and saves to uploads.", params: { type: "object", properties: { format: { type: "string", enum: ["png", "jpeg", "jpg"] } } }, panel: "photo.exportBar", run: ({ format }) => doExport(format === "jpeg" || format === "jpg" ? "jpeg" : "png") },
    { name: "photo.sendToVideo", description: "Send the current image to the Video studio media bin.", params: { type: "object", properties: {} }, panel: "photo.exportBar", run: async () => { await sendToVideo(); return { ok: true }; } },
  ], summary);

  const empty = s.layers.length === 0;
  return (
    <div className="page full studio photo-studio">
      <div className="studio-bar panel">
        <div className="toolset" {...agentProps("photo.tools", "Tools", "panel")}>
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool ${s.tool === t.id ? "on" : ""}`} title={`${t.label} (${t.key.toUpperCase()})`} onClick={() => photo.set({ tool: t.id })} {...agentProps(`photo.tool.${t.id}`, t.label, "button")}>
              <Icon name={t.icon} />
            </button>
          ))}
        </div>
        {(s.tool === "brush" || s.tool === "eraser") && (
          <div className="row hide-sm">
            <input type="color" value={s.brushColor} onChange={(e) => photo.set({ brushColor: e.target.value })} disabled={s.tool === "eraser"} />
            <input type="range" min={1} max={120} value={s.brushSize} onChange={(e) => photo.set({ brushSize: Number(e.target.value) })} style={{ width: 110 }} />
            <span className="mono tiny">{s.brushSize}px</span>
          </div>
        )}
        {s.tool === "shape" && (
          <div className="row">
            <button className={`chip ${s.shapeKind === "rect" ? "on" : ""}`} onClick={() => photo.set({ shapeKind: "rect" })}>Rect</button>
            <button className={`chip ${s.shapeKind === "ellipse" ? "on" : ""}`} onClick={() => photo.set({ shapeKind: "ellipse" })}>Ellipse</button>
          </div>
        )}
        {s.crop && (
          <div className="row">
            <span className="mono tiny">{Math.round(s.crop.w)}×{Math.round(s.crop.h)}</span>
            <Btn size="sm" kind="primary" onClick={() => applyCrop(s.crop!)} agent="photo.applyCrop">Apply crop</Btn>
            <Btn size="sm" onClick={() => photo.set({ crop: null })}>Cancel</Btn>
          </div>
        )}
        <div className="grow" />
        <Btn size="sm" icon="undo" onClick={undo} disabled={!s.past.length} title="Undo (⌘Z)" agent="photo.undo" label="Undo" />
        <Btn size="sm" icon="redo" onClick={redo} disabled={!s.future.length} title="Redo (⇧⌘Z)" agent="photo.redo" label="Redo" />
        <span className="mono tiny dim hide-sm">{s.w}×{s.h}</span>
        <div className="row" {...agentProps("photo.exportBar", "Export", "panel")}>
          <Btn size="sm" icon="upload" onClick={async () => openFiles(await pickFiles("image/*"))} agent="photo.openFile" label="Open image">Open</Btn>
          <Btn size="sm" icon="film" onClick={sendToVideo} disabled={empty} agent="photo.sendToVideo" label="Send to Video" className="hide-sm">To Video</Btn>
          <Btn size="sm" kind="primary" icon="download" onClick={() => doExport("png").catch((e) => toast(errText(e), "bad"))} disabled={empty} agent="photo.export" label="Export PNG">PNG</Btn>
          <Btn size="sm" onClick={() => doExport("jpeg").catch((e) => toast(errText(e), "bad"))} disabled={empty} className="hide-sm">JPG</Btn>
        </div>
      </div>

      <div className="photo-grid">
        <div className={`photo-stage ${over ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={async (e) => {
            e.preventDefault(); setOver(false);
            if (e.dataTransfer.files.length) return openFiles([...e.dataTransfer.files]);
            const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
            if (url && /^(https?:|\/|data:image|blob:)/.test(url)) openImage(url, url.split("/").pop() || "Image").catch((err) => toast(errText(err), "bad"));
          }}>
          <PhotoCanvas />
          {empty && (
            <div className="stage-empty">
              <Icon name="photo" size={34} />
              <b>Drop an image here</b>
              <span className="muted small">or open a file, pick one from the Media library, or start from a sample.</span>
              <div className="row">
                <button className="btn" onClick={async () => openFiles(await pickFiles("image/*"))}>Open image</button>
                <button className="btn primary" onClick={() => openImage(demoImageDataUrl(), "Sample landscape")} {...agentProps("photo.sample", "Use sample image")}>Use sample</button>
              </div>
            </div>
          )}
        </div>
        <div className="photo-side">
          <Panel title="Looks" agentId="photo.presets" agentLabel="Look presets">
            <div className="presets">
              {Object.entries(PRESETS).map(([id, p]) => (
                <button key={id} className={`preset ${s.preset === id ? "on" : ""}`} onClick={() => commit({ preset: id })} {...agentProps(`photo.preset.${id}`, `Look ${p.label}`, "button")}>
                  <span className="sw" style={{ background: p.swatch }} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Adjust" agentId="photo.adjust" agentLabel="Adjustments" actions={<button className="btn ghost sm" onClick={() => commit({ adjust: { ...ADJUST0 }, preset: "none" })}>Reset</button>}>
            <div className="col">
              {(Object.keys(ADJUST_RANGES) as (keyof Adjust)[]).map((k) => {
                const [min, max, step] = ADJUST_RANGES[k];
                return (
                  <label key={k} className="slider-row">
                    <span className="sl-l" style={{ textTransform: "capitalize" }}>{k}</span>
                    <input type="range" min={min} max={max} step={step} value={s.adjust[k]} onChange={(e) => setAdjust(k, Number(e.target.value))} onPointerUp={() => commit({})} {...agentProps(`photo.adjust.${k}`, k, "slider")} />
                    <span className="sl-v mono">{k === "hue" ? `${s.adjust[k]}°` : k === "blur" ? s.adjust[k] : Math.round(s.adjust[k] * 100)}</span>
                  </label>
                );
              })}
            </div>
          </Panel>
          <Panel title="Layers" actions={
            <div className="row" style={{ gap: 4 }}>
              <button className="btn ghost sm icon" title="Add text" onClick={() => addText("Headline")}><Icon name="text" size={14} /></button>
              <button className="btn ghost sm icon" title="Add shape" onClick={() => addShape("rect", s.w * 0.1, s.h * 0.7, s.w * 0.35, s.h * 0.14)}><Icon name="shape" size={14} /></button>
              <button className="btn ghost sm icon" title="Add image" onClick={async () => openFiles(await pickFiles("image/*"))}><Icon name="plus" size={14} /></button>
            </div>
          } bodyClass="panel-b layers-body">
            <LayersPanel />
          </Panel>
        </div>
      </div>
    </div>
  );
}
