// Photo studio document model + undo/redo. Layers are plain data; Konva renders them.
import { createStore, uid } from "../../lib/store";
import { ADJUST0, type Adjust } from "./filters";

export type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "soft-light" | "hard-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity";
export const BLENDS: Blend[] = ["source-over", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "hard-light", "color-dodge", "color-burn", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];

export type Stroke = { points: number[]; color: string; size: number; erase: boolean };
type Base = { id: string; name: string; visible: boolean; opacity: number; blend: Blend; x: number; y: number; rotation: number; scaleX: number; scaleY: number; strokes: Stroke[] };
export type ImageLayer = Base & { type: "image"; src: string; width: number; height: number };
export type TextLayer = Base & { type: "text"; text: string; fontSize: number; fill: string; fontFamily: string; fontStyle: string; stroke?: string };
export type ShapeLayer = Base & { type: "shape"; shape: "rect" | "ellipse"; width: number; height: number; fill: string; cornerRadius: number };
export type BrushLayer = Base & { type: "brush" };
export type Layer = ImageLayer | TextLayer | ShapeLayer | BrushLayer;
export type Tool = "move" | "crop" | "brush" | "eraser" | "text" | "shape";

export type Doc = { w: number; h: number; bg: string; layers: Layer[]; adjust: Adjust; preset: string };
export type PhotoState = Doc & { selected: string | null; tool: Tool; brushColor: string; brushSize: number; shapeKind: "rect" | "ellipse"; crop: { x: number; y: number; w: number; h: number } | null; past: Doc[]; future: Doc[]; zoom: number };

export const photo = createStore<PhotoState>({
  w: 1280, h: 800, bg: "#0b0d14", layers: [], adjust: { ...ADJUST0 }, preset: "none",
  selected: null, tool: "move", brushColor: "#22d3ee", brushSize: 18, shapeKind: "rect", crop: null, past: [], future: [], zoom: 1,
});

const docOf = (s: PhotoState): Doc => ({ w: s.w, h: s.h, bg: s.bg, layers: s.layers, adjust: s.adjust, preset: s.preset });

/** Snapshot the current document for undo, then apply a change. */
export function commit(patch: Partial<PhotoState> | ((s: PhotoState) => Partial<PhotoState>)) {
  photo.set((s) => {
    const p = typeof patch === "function" ? patch(s) : patch;
    return { ...p, past: [...s.past.slice(-60), docOf(s)], future: [] };
  });
}
export function undo() {
  photo.set((s) => (s.past.length ? { ...s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [docOf(s), ...s.future] } : {}));
}
export function redo() {
  photo.set((s) => (s.future.length ? { ...s.future[0], future: s.future.slice(1), past: [...s.past, docOf(s)] } : {}));
}

const base = (name: string): Base => ({ id: uid("L"), name, visible: true, opacity: 1, blend: "source-over", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, strokes: [] });

export function updateLayer(id: string, patch: Partial<Layer>, record = true) {
  const f = (s: PhotoState) => ({ layers: s.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) });
  record ? commit(f) : photo.set(f);
}
export function addLayer(l: Layer) {
  commit((s) => ({ layers: [...s.layers, l], selected: l.id }));
  return l;
}
export function removeLayer(id: string) {
  commit((s) => ({ layers: s.layers.filter((l) => l.id !== id), selected: s.selected === id ? null : s.selected }));
}
export function moveLayer(from: number, to: number) {
  commit((s) => {
    const ls = [...s.layers];
    const [x] = ls.splice(from, 1);
    ls.splice(Math.max(0, Math.min(ls.length, to)), 0, x);
    return { layers: ls };
  });
}

export const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => res(img);
  img.onerror = () => rej(new Error("could not load image"));
  img.src = src;
});

/** Add an image as a new layer. The first image also sets the document size (max 2400 px). */
export async function openImage(src: string, name = "Image") {
  const img = await loadImage(src);
  const s = photo.get();
  const first = s.layers.length === 0;
  let w = img.naturalWidth, h = img.naturalHeight;
  const max = 2400;
  if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const docW = first ? w : s.w, docH = first ? h : s.h;
  const fit = first ? 1 : Math.min(1, docW / w, docH / h);
  const layer: ImageLayer = { ...base(name), type: "image", src, width: w, height: h, scaleX: fit, scaleY: fit, x: (docW - w * fit) / 2, y: (docH - h * fit) / 2 };
  commit((st) => ({ ...(first ? { w: docW, h: docH } : {}), layers: [...st.layers, layer], selected: layer.id, tool: st.tool }));
  return layer;
}

export function addText(text: string, x?: number, y?: number, fontSize = 72, fill = "#ffffff") {
  const s = photo.get();
  return addLayer({ ...base(`Text: ${text.slice(0, 16)}`), type: "text", text, fontSize, fill, fontFamily: "Space Grotesk Variable, Inter Variable, sans-serif", fontStyle: "bold", x: x ?? s.w * 0.08, y: y ?? s.h * 0.1 });
}
export function addShape(shape: "rect" | "ellipse", x: number, y: number, width: number, height: number, fill = "rgba(124,92,255,0.55)") {
  return addLayer({ ...base(shape === "rect" ? "Rectangle" : "Ellipse"), type: "shape", shape, x, y, width, height, fill, cornerRadius: shape === "rect" ? 12 : 0 });
}
export function addBrushLayer() {
  return addLayer({ ...base("Paint"), type: "brush" });
}

export function applyCrop(c: { x: number; y: number; w: number; h: number }) {
  const s = photo.get();
  const x = Math.max(0, Math.round(c.x)), y = Math.max(0, Math.round(c.y));
  const w = Math.max(8, Math.min(s.w - x, Math.round(c.w))), h = Math.max(8, Math.min(s.h - y, Math.round(c.h)));
  commit((st) => ({ w, h, crop: null, layers: st.layers.map((l) => ({ ...l, x: l.x - x, y: l.y - y, strokes: l.strokes.map((k) => ({ ...k, points: k.points.map((p, i) => (i % 2 ? p - y : p - x)) })) })) }));
  return { w, h };
}

export function summary() {
  const s = photo.get();
  const ls = s.layers.map((l, i) => `${i + 1}. ${l.name} (${l.type}${l.visible ? "" : ", hidden"}, ${Math.round(l.opacity * 100)}%${l.blend !== "source-over" ? `, ${l.blend}` : ""})`).join("; ");
  const adj = Object.entries(s.adjust).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ");
  return `Photo studio: ${s.w}x${s.h}, ${s.layers.length} layer(s)${ls ? `: ${ls}` : ""}. Tool ${s.tool}. Look preset ${s.preset}. Adjustments: ${adj || "none"}.`;
}
