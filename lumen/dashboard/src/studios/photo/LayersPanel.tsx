// Layers: drag to reorder (top of list = top of stack), visibility, opacity, blend mode, delete.
import { useState } from "react";
import { Icon } from "../../components/icons";
import { agentProps } from "../../takeover/registry";
import { BLENDS, moveLayer, photo, removeLayer, updateLayer, type Blend, type Layer } from "./store";

const ICON: Record<Layer["type"], string> = { image: "image", text: "text", shape: "shape", brush: "brush" };

export function LayersPanel() {
  const s = photo.use();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const sel = s.layers.find((l) => l.id === s.selected);
  const ordered = s.layers.map((l, i) => ({ l, i })).reverse();
  return (
    <div className="layers" {...agentProps("photo.layers", "Layers", "list")}>
      {ordered.length === 0 && <div className="tiny dim" style={{ padding: 8 }}>No layers yet — open an image or add text/shapes.</div>}
      {ordered.map(({ l, i }) => (
        <div key={l.id}
          className={`layer-i ${s.selected === l.id ? "on" : ""} ${overIdx === i ? "over" : ""}`}
          draggable
          onDragStart={(e) => { setDragIdx(i); e.dataTransfer.setData("text/lumen-layer", String(i)); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
          onDragLeave={() => setOverIdx(null)}
          onDrop={(e) => { e.preventDefault(); const from = dragIdx ?? Number(e.dataTransfer.getData("text/lumen-layer")); if (Number.isFinite(from) && from !== i) moveLayer(from, i); setDragIdx(null); setOverIdx(null); }}
          onClick={() => photo.set({ selected: l.id, tool: s.tool === "crop" ? "move" : s.tool })}
          {...agentProps(`photo.layer.${i}`, `Layer ${l.name}`, "button")}>
          <span className="grip">⋮⋮</span>
          <Icon name={ICON[l.type]} size={14} />
          <span className="ln">{l.name}</span>
          <button className="btn ghost sm icon" onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }} aria-label="Toggle visibility"><Icon name={l.visible ? "eye" : "eyeOff"} size={13} /></button>
        </div>
      ))}
      {sel && (
        <div className="layer-props">
          <label className="slider-row"><span className="sl-l">Opacity</span>
            <input type="range" min={0} max={1} step={0.01} value={sel.opacity} onChange={(e) => updateLayer(sel.id, { opacity: Number(e.target.value) }, false)} onPointerUp={() => updateLayer(sel.id, { opacity: sel.opacity })} {...agentProps("photo.layer.opacity", "Layer opacity", "slider")} />
            <span className="sl-v mono">{Math.round(sel.opacity * 100)}%</span>
          </label>
          <label className="slider-row"><span className="sl-l">Blend</span>
            <select className="select" style={{ height: 28, gridColumn: "span 2" }} value={sel.blend} onChange={(e) => updateLayer(sel.id, { blend: e.target.value as Blend })} {...agentProps("photo.layer.blend", "Blend mode", "input")}>
              {BLENDS.map((b) => <option key={b} value={b}>{b === "source-over" ? "normal" : b}</option>)}
            </select>
          </label>
          {sel.type === "text" && (
            <>
              <textarea className="textarea" rows={2} value={sel.text} onChange={(e) => updateLayer(sel.id, { text: e.target.value, name: `Text: ${e.target.value.slice(0, 16)}` }, false)} {...agentProps("photo.text", "Text content", "input")} />
              <div className="row">
                <input type="color" value={sel.fill} onChange={(e) => updateLayer(sel.id, { fill: e.target.value }, false)} />
                <input className="input mono" type="number" min={8} max={400} value={sel.fontSize} onChange={(e) => updateLayer(sel.id, { fontSize: Number(e.target.value) }, false)} style={{ width: 80 }} />
                <span className="tiny dim">px</span>
              </div>
            </>
          )}
          {sel.type === "shape" && <div className="row"><span className="tiny muted">Fill</span><input type="color" value={sel.fill.startsWith("#") ? sel.fill : "#7c5cff"} onChange={(e) => updateLayer(sel.id, { fill: e.target.value }, false)} /></div>}
          <div className="row">
            <button className="btn sm" onClick={() => { const idx = s.layers.findIndex((x) => x.id === sel.id); moveLayer(idx, idx + 1); }}>Up</button>
            <button className="btn sm" onClick={() => { const idx = s.layers.findIndex((x) => x.id === sel.id); moveLayer(idx, idx - 1); }}>Down</button>
            <div className="grow" />
            <button className="btn danger sm" onClick={() => removeLayer(sel.id)}><Icon name="trash" size={13} /> Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
