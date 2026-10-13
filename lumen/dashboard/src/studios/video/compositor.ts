// Draws the timeline at time t onto a canvas: video + image clips (cover fit, fades), text overlays and captions.
// Keeps a pool of <video>/<audio> elements and syncs them to the playhead while playing.
import { video, type BinItem, type Clip, type VideoState } from "./store";

const ORDER: Record<string, number> = { V1: 0, V2: 1, T1: 2, C1: 3 };

export class Compositor {
  videos = new Map<string, HTMLVideoElement>();
  audios = new Map<string, HTMLAudioElement>();
  images = new Map<string, HTMLImageElement>();

  private el(m: BinItem): HTMLVideoElement | HTMLAudioElement | HTMLImageElement {
    if (m.kind === "image") {
      let i = this.images.get(m.id);
      if (!i) { i = new Image(); i.crossOrigin = "anonymous"; i.src = m.url; this.images.set(m.id, i); }
      return i;
    }
    const pool = m.kind === "video" ? this.videos : this.audios;
    let v = pool.get(m.id);
    if (!v) {
      v = document.createElement(m.kind === "video" ? "video" : "audio") as HTMLVideoElement;
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      (v as HTMLVideoElement).playsInline = true;
      v.src = m.url;
      pool.set(m.id, v as HTMLVideoElement);
    }
    return v;
  }

  static active(s: VideoState, t: number) {
    return s.clips.filter((c) => t >= c.start && t < c.start + c.dur && !s.tracks.find((tr) => tr.id === c.trackId)?.hidden);
  }

  static alpha(c: Clip, t: number) {
    const local = t - c.start;
    let a = 1;
    if (c.fadeIn > 0 && local < c.fadeIn) a = Math.min(a, local / c.fadeIn);
    if (c.fadeOut > 0 && c.dur - local < c.fadeOut) a = Math.min(a, (c.dur - local) / c.fadeOut);
    return Math.max(0, Math.min(1, a));
  }

  /** Sync media elements to the playhead (live preview). */
  sync(s: VideoState, t: number, playing: boolean) {
    const active = new Set<HTMLMediaElement>();
    for (const c of Compositor.active(s, t)) {
      const m = c.mediaId ? s.bin.find((b) => b.id === c.mediaId) : null;
      if (!m || m.kind === "image") continue;
      const el = this.el(m) as HTMLMediaElement;
      active.add(el);
      const want = c.in + (t - c.start);
      const muted = s.tracks.find((tr) => tr.id === c.trackId)?.muted;
      el.muted = Boolean(muted);
      el.volume = Math.max(0, Math.min(1, c.volume * Compositor.alpha(c, t)));
      if (Math.abs(el.currentTime - want) > (playing ? 0.3 : 0.04)) { try { el.currentTime = want; } catch { /* not ready */ } }
      if (playing && el.paused) el.play().catch(() => {});
      if (!playing && !el.paused) el.pause();
    }
    for (const el of [...this.videos.values(), ...this.audios.values()]) if (!active.has(el) && !el.paused) el.pause();
  }

  /** Seek every active video to t and wait (export path). */
  async seek(s: VideoState, t: number) {
    const waits: Promise<void>[] = [];
    for (const c of Compositor.active(s, t)) {
      const m = c.mediaId ? s.bin.find((b) => b.id === c.mediaId) : null;
      if (!m || m.kind !== "video") continue;
      const v = this.el(m) as HTMLVideoElement;
      const want = c.in + (t - c.start);
      if (Math.abs(v.currentTime - want) < 0.001 && v.readyState >= 2) continue;
      waits.push(new Promise((res) => {
        const done = () => { v.removeEventListener("seeked", done); res(); };
        v.addEventListener("seeked", done);
        setTimeout(done, 1500);
        v.currentTime = want;
      }));
    }
    await Promise.all(waits);
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, s: VideoState = video.get()) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const clips = Compositor.active(s, t).sort((a, b) => (ORDER[a.trackId] ?? 9) - (ORDER[b.trackId] ?? 9));
    for (const c of clips) {
      const a = Compositor.alpha(c, t);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (c.text !== undefined) { this.drawText(ctx, W, H, c); continue; }
      const m = c.mediaId ? s.bin.find((b) => b.id === c.mediaId) : null;
      if (!m || m.kind === "audio") continue;
      const el = this.el(m) as HTMLVideoElement | HTMLImageElement;
      const iw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
      const ih = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
      if (!iw || !ih || (el instanceof HTMLVideoElement && el.readyState < 2)) continue;
      // cover fit, with a gentle push-in on stills
      const zoom = m.kind === "image" ? 1 + 0.06 * ((t - c.start) / Math.max(0.1, c.dur)) : 1;
      const k = Math.max(W / iw, H / ih) * zoom;
      const dw = iw * k, dh = ih * k;
      try { ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch { /* tainted or not ready */ }
    }
    ctx.restore();
  }

  private drawText(ctx: CanvasRenderingContext2D, W: number, H: number, c: Clip) {
    const st = c.style ?? { size: 72, color: "#fff", y: 0.45, bg: false };
    const size = Math.round(st.size * (Math.min(W, H) / 1080));
    ctx.font = `700 ${size}px "Space Grotesk Variable", "Inter Variable", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = W * 0.86;
    const words = (c.text ?? "").split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    const lh = size * 1.18;
    const y0 = H * st.y - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => {
      const y = y0 + i * lh;
      if (st.bg) {
        const w = ctx.measureText(l).width + size * 0.6;
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - w / 2, y - lh / 2, w, lh, size * 0.2);
        ctx.fill();
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = size * 0.25;
      }
      ctx.fillStyle = st.color;
      ctx.fillText(l, W / 2, y);
      ctx.shadowBlur = 0;
    });
  }

  dispose() {
    for (const el of [...this.videos.values(), ...this.audios.values()]) { el.pause(); el.removeAttribute("src"); el.load(); }
    this.videos.clear(); this.audios.clear(); this.images.clear();
  }
}
