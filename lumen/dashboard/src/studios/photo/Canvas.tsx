// Konva canvas for the Photo studio: layer groups with blend/opacity, filters, brush/eraser strokes,
// text/shape tools, crop overlay and a transformer for the move tool.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Konva from "konva";
import { Ellipse, Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { makePixelFilter } from "./filters";
import { addBrushLayer, addShape, addText, loadImage, photo, updateLayer, type Layer, type Stroke } from "./store";

let stageNode: Konva.Stage | null = null;
let view = { scale: 1, ox: 0, oy: 0 };

/** Export the document at full resolution. */
export async function exportDoc(format: "png" | "jpeg" = "png", quality = 0.92): Promise<Blob> {
  const st = stageNode;
  if (!st) throw new Error("photo canvas is not mounted");
  const s = photo.get();
  const tr = st.findOne("Transformer");
  const overlay = st.findOne(".crop-overlay");
  tr?.hide(); overlay?.hide();
  const url = st.toDataURL({ x: view.ox, y: view.oy, width: s.w * view.scale, height: s.h * view.scale, pixelRatio: 1 / view.scale, mimeType: `image/${format}`, quality });
  tr?.show(); overlay?.show();
  return (await fetch(url)).blob();
}

function useImg(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { let on = true; loadImage(src).then((i) => on && setImg(i)).catch(() => {}); return () => { on = false; }; }, [src]);
  return img;
}

function ImageNode({ l, filterKey }: { l: Extract<Layer, { type: "image" }>; filterKey: string }) {
  const img = useImg(l.src);
  const ref = useRef<Konva.Image>(null);
  const s = photo.get();
  useEffect(() => {
    const n = ref.current;
    if (!n || !img) return;
    const filters: unknown[] = [makePixelFilter(s.adjust, s.preset)];
    if (s.adjust.blur > 0) { filters.unshift(Konva.Filters.Blur); n.blurRadius(s.adjust.blur); }
    n.filters(filters as any);
    n.cache({ pixelRatio: 1 });
    n.getLayer()?.batchDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, filterKey, l.width, l.height]);
  return img ? <KImage ref={ref} image={img} width={l.width} height={l.height} /> : null;
}

function StrokeLine({ k }: { k: Stroke }) {
  return <Line points={k.points} stroke={k.color} strokeWidth={k.size} tension={0.4} lineCap="round" lineJoin="round" globalCompositeOperation={k.erase ? "destination-out" : "source-over"} listening={false} />;
}

function LayerNode({ l, live, filterKey, draggable, onSelect }: { l: Layer; live: Stroke | null; filterKey: string; draggable: boolean; onSelect: () => void }) {
  const ref = useRef<Konva.Group>(null);
  const hasErase = l.strokes.some((k) => k.erase) || Boolean(live?.erase);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    if (hasErase && !live) { g.clearCache(); g.cache(); } else g.clearCache();
    g.getLayer()?.batchDraw();
  }, [hasErase, l, live, filterKey]);
  return (
    <Group ref={ref} id={l.id} name="doc-layer" x={l.x} y={l.y} rotation={l.rotation} scaleX={l.scaleX} scaleY={l.scaleY} opacity={l.opacity} visible={l.visible}
      globalCompositeOperation={l.blend} draggable={draggable}
      onMouseDown={onSelect} onTap={onSelect}
      onDragEnd={(e) => updateLayer(l.id, { x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => { const n = e.target; updateLayer(l.id, { x: n.x(), y: n.y(), rotation: n.rotation(), scaleX: n.scaleX(), scaleY: n.scaleY() }); }}>
      {l.type === "image" && <ImageNode l={l} filterKey={filterKey} />}
      {l.type === "text" && <Text text={l.text} fontSize={l.fontSize} fill={l.fill} fontFamily={l.fontFamily} fontStyle={l.fontStyle} stroke={l.stroke} strokeWidth={l.stroke ? 2 : 0} shadowColor="rgba(0,0,0,0.45)" shadowBlur={12} />}
      {l.type === "shape" && l.shape === "rect" && <Rect width={l.width} height={l.height} fill={l.fill} cornerRadius={l.cornerRadius} />}
      {l.type === "shape" && l.shape === "ellipse" && <Ellipse x={l.width / 2} y={l.height / 2} radiusX={l.width / 2} radiusY={l.height / 2} fill={l.fill} />}
      {l.type === "brush" && <Rect width={1} height={1} fill="transparent" listening={false} />}
      {l.strokes.map((k, i) => <StrokeLine key={i} k={k} />)}
      {live && <StrokeLine k={live} />}
    </Group>
  );
}

export function PhotoCanvas() {
  const s = photo.use();
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const tr = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [live, setLive] = useState<{ layerId: string; stroke: Stroke } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { stageNode = stage.current; return () => { stageNode = null; }; }, []);

  const pad = 28;
  const scale = Math.max(0.05, Math.min((size.w - pad * 2) / s.w, (size.h - pad * 2) / s.h)) * s.zoom;
  const ox = Math.round((size.w - s.w * scale) / 2);
  const oy = Math.round((size.h - s.h * scale) / 2);
  view = { scale, ox, oy };
  const filterKey = JSON.stringify([s.adjust, s.preset]);

  useEffect(() => {
    const t = tr.current;
    if (!t) return;
    const node = s.tool === "move" && s.selected ? stage.current?.findOne(`#${s.selected}`) : null;
    t.nodes(node ? [node] : []);
    t.getLayer()?.batchDraw();
  }, [s.selected, s.tool, s.layers]);

  const docPoint = () => {
    const p = stage.current!.getPointerPosition()!;
    return { x: (p.x - ox) / scale, y: (p.y - oy) / scale };
  };

  function down(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const st = photo.get();
    const p = docPoint();
    if (st.tool === "brush" || st.tool === "eraser") {
      let target = st.layers.find((l) => l.id === st.selected);
      if (st.tool === "brush" && (!target || target.type !== "brush")) target = addBrushLayer();
      if (!target) return;
      const g = stage.current!.findOne(`#${target.id}`) as Konva.Group | undefined;
      const lp = g?.getRelativePointerPosition() ?? p;
      setLive({ layerId: target.id, stroke: { points: [lp.x, lp.y, lp.x + 0.1, lp.y], color: st.brushColor, size: st.brushSize / (target.scaleX || 1), erase: st.tool === "eraser" } });
    } else if (st.tool === "text") {
      addText("Double-click layer to edit", p.x, p.y, Math.round(st.w / 18));
      photo.set({ tool: "move" });
    } else if (st.tool === "crop" || st.tool === "shape") {
      setDrag({ x0: p.x, y0: p.y, x: p.x, y: p.y });
    } else if (st.tool === "move" && e.target === e.target.getStage()) {
      photo.set({ selected: null });
    }
  }
  function move() {
    if (live) {
      const g = stage.current!.findOne(`#${live.layerId}`) as Konva.Group | undefined;
      const lp = g?.getRelativePointerPosition();
      if (lp) setLive({ ...live, stroke: { ...live.stroke, points: [...live.stroke.points, lp.x, lp.y] } });
    } else if (drag) {
      const p = docPoint();
      setDrag({ ...drag, x: p.x, y: p.y });
      if (photo.get().tool === "crop") photo.set({ crop: rectOf({ ...drag, x: p.x, y: p.y }) });
    }
  }
  function up() {
    if (live) {
      const l = photo.get().layers.find((x) => x.id === live.layerId);
      if (l) updateLayer(l.id, { strokes: [...l.strokes, live.stroke] });
      setLive(null);
    } else if (drag) {
      const r = rectOf(drag);
      if (photo.get().tool === "shape" && r.w > 4 && r.h > 4) { addShape(photo.get().shapeKind, r.x, r.y, r.w, r.h); photo.set({ tool: "move" }); }
      setDrag(null);
    }
  }

  const crop = s.crop;
  return (
    <div className={`photo-canvas tool-${s.tool}`} ref={wrap} data-agent-id="photo.canvas" data-agent-label="Photo canvas" data-agent-role="canvas">
      <Stage ref={stage} width={size.w} height={size.h} onMouseDown={down} onTouchStart={down} onMouseMove={move} onTouchMove={move} onMouseUp={up} onTouchEnd={up}>
        <KLayer>
          <Group x={ox} y={oy} scaleX={scale} scaleY={scale} clipX={0} clipY={0} clipWidth={s.w} clipHeight={s.h}>
            <Rect width={s.w} height={s.h} fill={s.bg} listening={false} />
            {s.layers.map((l) => (
              <LayerNode key={l.id} l={l} live={live?.layerId === l.id ? live.stroke : null} filterKey={filterKey} draggable={s.tool === "move" && s.selected === l.id}
                onSelect={() => { if (photo.get().tool === "move") photo.set({ selected: l.id }); }} />
            ))}
          </Group>
          <Group x={ox} y={oy} scaleX={scale} scaleY={scale} name="crop-overlay" listening={false}>
            {crop && (
              <>
                <Rect x={0} y={0} width={s.w} height={crop.y} fill="rgba(0,0,0,0.55)" />
                <Rect x={0} y={crop.y + crop.h} width={s.w} height={s.h - crop.y - crop.h} fill="rgba(0,0,0,0.55)" />
                <Rect x={0} y={crop.y} width={crop.x} height={crop.h} fill="rgba(0,0,0,0.55)" />
                <Rect x={crop.x + crop.w} y={crop.y} width={s.w - crop.x - crop.w} height={crop.h} fill="rgba(0,0,0,0.55)" />
                <Rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} stroke="#22d3ee" strokeWidth={2 / scale} dash={[8 / scale, 6 / scale]} />
              </>
            )}
            {drag && s.tool === "shape" && <Rect {...(() => { const r = rectOf(drag); return { x: r.x, y: r.y, width: r.w, height: r.h }; })()} stroke="#7c5cff" strokeWidth={2 / scale} dash={[6 / scale, 4 / scale]} />}
          </Group>
          <Rect x={ox} y={oy} width={s.w * scale} height={s.h * scale} stroke="#262b3e" strokeWidth={1} listening={false} />
          <Transformer ref={tr} rotateEnabled keepRatio={false} anchorSize={9} anchorCornerRadius={3} borderStroke="#7c5cff" anchorStroke="#7c5cff" anchorFill="#0e1016" />
        </KLayer>
      </Stage>
    </div>
  );
}

function rectOf(d: { x0: number; y0: number; x: number; y: number }) {
  return { x: Math.min(d.x0, d.x), y: Math.min(d.y0, d.y), w: Math.abs(d.x - d.x0), h: Math.abs(d.y - d.y0) };
}
