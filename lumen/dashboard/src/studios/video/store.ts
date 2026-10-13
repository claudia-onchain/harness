// Video studio model: media bin, tracks, clips (seconds), playhead. Shared with Photo/Image/Library ("send to Video").
import { createStore, uid } from "../../lib/store";

export type MediaKind = "video" | "image" | "audio";
export type BinItem = { id: string; name: string; kind: MediaKind; url: string; duration: number; width?: number; height?: number };
export type TrackKind = "video" | "image" | "text" | "caption" | "audio";
export type Track = { id: string; kind: TrackKind; name: string; muted: boolean; hidden: boolean };
export type Clip = {
  id: string; trackId: string; mediaId?: string; start: number; in: number; dur: number;
  text?: string; fadeIn: number; fadeOut: number; volume: number;
  style?: { size: number; color: string; y: number; bg: boolean };
};
export type Aspect = "9:16" | "16:9" | "1:1" | "4:5";
export const ASPECTS: Record<Aspect, [number, number]> = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };

export type VideoState = { bin: BinItem[]; tracks: Track[]; clips: Clip[]; playhead: number; playing: boolean; zoom: number; snap: boolean; selected: string | null; aspect: Aspect; exporting: number | null };

export const video = createStore<VideoState>({
  bin: [],
  tracks: [
    { id: "T1", kind: "text", name: "Text", muted: false, hidden: false },
    { id: "C1", kind: "caption", name: "Captions", muted: false, hidden: false },
    { id: "V2", kind: "image", name: "Overlay", muted: false, hidden: false },
    { id: "V1", kind: "video", name: "Video", muted: false, hidden: false },
    { id: "A1", kind: "audio", name: "Audio", muted: false, hidden: false },
  ],
  clips: [],
  playhead: 0,
  playing: false,
  zoom: 60,
  snap: true,
  selected: null,
  aspect: "16:9",
  exporting: null,
});

export const projectDuration = (s = video.get()) => Math.max(5, ...s.clips.map((c) => c.start + c.dur));
export const trackFor = (kind: MediaKind): string => (kind === "audio" ? "A1" : kind === "image" ? "V2" : "V1");

function probe(url: string, kind: MediaKind): Promise<{ duration: number; width?: number; height?: number }> {
  return new Promise((res) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => res({ duration: 4, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => res({ duration: 4 });
      img.src = url;
      return;
    }
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    el.preload = "metadata";
    el.onloadedmetadata = () => res({ duration: Number.isFinite(el.duration) ? el.duration : 5, width: (el as HTMLVideoElement).videoWidth, height: (el as HTMLVideoElement).videoHeight });
    el.onerror = () => res({ duration: 5 });
    el.src = url;
  });
}

export const kindOf = (mime: string, name = ""): MediaKind | null =>
  mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name) ? "video" : mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name) ? "image" : mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name) ? "audio" : null;

export async function addMedia(url: string, name: string, kind: MediaKind): Promise<BinItem> {
  const existing = video.get().bin.find((b) => b.url === url);
  if (existing) return existing;
  const meta = await probe(url, kind);
  const item: BinItem = { id: uid("m"), name, kind, url, ...meta };
  video.set((s) => ({ bin: [...s.bin, item] }));
  return item;
}

/** Snap a time to clip edges / playhead / whole seconds when snapping is on. */
export function snapTime(t: number, ignoreId?: string, s = video.get()) {
  if (!s.snap) return Math.max(0, t);
  const th = 8 / s.zoom;
  const pts = [0, s.playhead, ...s.clips.filter((c) => c.id !== ignoreId).flatMap((c) => [c.start, c.start + c.dur])];
  let best = t, bd = th;
  for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  if (best === t) { const r = Math.round(t * 2) / 2; if (Math.abs(r - t) < th) best = r; }
  return Math.max(0, best);
}

export function addClip(mediaId: string, trackId?: string, at?: number): Clip {
  const s = video.get();
  const m = s.bin.find((b) => b.id === mediaId);
  if (!m) throw new Error(`media ${mediaId} not in bin`);
  const tid = trackId && s.tracks.some((t) => t.id === trackId) ? trackId : trackFor(m.kind);
  const end = Math.max(0, ...s.clips.filter((c) => c.trackId === tid).map((c) => c.start + c.dur));
  const clip: Clip = { id: uid("c"), trackId: tid, mediaId, start: at ?? end, in: 0, dur: m.kind === "image" ? 4 : m.duration, fadeIn: 0, fadeOut: 0, volume: 1 };
  video.set((st) => ({ clips: [...st.clips, clip], selected: clip.id }));
  return clip;
}

export function addTextClip(text: string, start: number, end: number, caption = false): Clip {
  const clip: Clip = { id: uid("c"), trackId: caption ? "C1" : "T1", start, in: 0, dur: Math.max(0.2, end - start), text, fadeIn: caption ? 0 : 0.25, fadeOut: caption ? 0 : 0.25, volume: 1, style: { size: caption ? 54 : 96, color: "#ffffff", y: caption ? 0.8 : 0.42, bg: caption } };
  video.set((st) => ({ clips: [...st.clips, clip], selected: clip.id }));
  return clip;
}

export function updateClip(id: string, patch: Partial<Clip>) {
  video.set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

export function trimClip(id: string, start?: number, end?: number) {
  const c = video.get().clips.find((x) => x.id === id);
  if (!c) throw new Error(`clip ${id} not found`);
  const m = c.mediaId ? video.get().bin.find((b) => b.id === c.mediaId) : null;
  const maxLen = m && m.kind !== "image" ? m.duration : Infinity;
  let ns = start ?? c.start;
  let ne = end ?? c.start + c.dur;
  // trimming the head also advances the source in-point
  let nin = c.in + (ns - c.start);
  if (nin < 0) { ns -= nin; nin = 0; }
  if (ne - ns > maxLen - nin) ne = ns + (maxLen - nin);
  if (ne - ns < 0.1) throw new Error("clip would be shorter than 0.1 s");
  updateClip(id, { start: ns, dur: ne - ns, in: nin });
  return { clipId: id, start: ns, end: ne };
}

export function splitClip(id: string | undefined, at: number) {
  const s = video.get();
  const c = id ? s.clips.find((x) => x.id === id) : s.clips.find((x) => x.id === s.selected && at > x.start && at < x.start + x.dur) ?? s.clips.find((x) => at > x.start + 0.05 && at < x.start + x.dur - 0.05);
  if (!c || at <= c.start + 0.05 || at >= c.start + c.dur - 0.05) throw new Error("no clip under the split point");
  const left = at - c.start;
  const right: Clip = { ...c, id: uid("c"), start: at, in: c.in + left, dur: c.dur - left, fadeIn: 0 };
  video.set((st) => ({ clips: [...st.clips.map((x) => (x.id === c.id ? { ...x, dur: left, fadeOut: 0 } : x)), right], selected: right.id }));
  return { left: c.id, right: right.id };
}

export function removeClip(id: string) {
  video.set((s) => ({ clips: s.clips.filter((c) => c.id !== id), selected: s.selected === id ? null : s.selected }));
}

export function summary() {
  const s = video.get();
  const per = s.tracks.map((t) => {
    const cs = s.clips.filter((c) => c.trackId === t.id).sort((a, b) => a.start - b.start);
    return `${t.name}: ${cs.length ? cs.map((c) => `${c.id}[${c.start.toFixed(1)}–${(c.start + c.dur).toFixed(1)}s ${c.text ? `"${c.text.slice(0, 24)}"` : s.bin.find((b) => b.id === c.mediaId)?.name ?? ""}]`).join(", ") : "empty"}`;
  });
  return `Video studio: ${s.aspect}, ${projectDuration(s).toFixed(1)}s, playhead ${s.playhead.toFixed(1)}s, ${s.bin.length} item(s) in bin (${s.bin.map((b) => `${b.id}:${b.name}`).join(", ") || "none"}). ${per.join(" | ")}.`;
}
