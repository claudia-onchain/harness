// Video export. Primary: render frames with the compositor + mix audio offline, encode MP4 with ffmpeg.wasm
// (core served locally from /ffmpeg/, loaded lazily). Fallback: real-time MediaRecorder capture to WebM.
import { encodeWav } from "../../lib/wav";
import { Compositor } from "./compositor";
import { ASPECTS, projectDuration, video, type VideoState } from "./store";

export type ExportResult = { blob: Blob; name: string; via: "ffmpeg" | "mediarecorder" };
type Progress = (p: number, label: string) => void;

const FPS = 30;

function exportSize(s: VideoState, maxSide: number) {
  const [w, h] = ASPECTS[s.aspect];
  const k = Math.min(1, maxSide / Math.max(w, h));
  return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2] as const;
}

/** Mix every audible audio/video clip into one stereo buffer. */
async function mixAudio(s: VideoState, dur: number): Promise<AudioBuffer | null> {
  const sources = s.clips.filter((c) => {
    const m = c.mediaId ? s.bin.find((b) => b.id === c.mediaId) : null;
    return m && (m.kind === "audio" || m.kind === "video") && !s.tracks.find((t) => t.id === c.trackId)?.muted;
  });
  if (!sources.length) return null;
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
  const cache = new Map<string, AudioBuffer | null>();
  for (const c of sources) {
    const m = s.bin.find((b) => b.id === c.mediaId)!;
    if (!cache.has(m.id)) {
      try { cache.set(m.id, await ctx.decodeAudioData(await (await fetch(m.url)).arrayBuffer())); } catch { cache.set(m.id, null); }
    }
    const buf = cache.get(m.id);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(c.fadeIn > 0 ? 0 : c.volume, c.start);
    if (c.fadeIn > 0) g.gain.linearRampToValueAtTime(c.volume, c.start + c.fadeIn);
    if (c.fadeOut > 0) { g.gain.setValueAtTime(c.volume, c.start + c.dur - c.fadeOut); g.gain.linearRampToValueAtTime(0, c.start + c.dur); }
    src.connect(g).connect(ctx.destination);
    src.start(c.start, c.in, c.dur);
  }
  return ctx.startRendering();
}

async function viaFfmpeg(s: VideoState, onProgress: Progress): Promise<ExportResult> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const ff = new FFmpeg();
  onProgress(0.02, "Loading encoder…");
  await Promise.race([
    ff.load({ coreURL: `${location.origin}/ffmpeg/ffmpeg-core.js`, wasmURL: `${location.origin}/ffmpeg/ffmpeg-core.wasm` }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("ffmpeg load timeout")), 45000)),
  ]);
  const dur = projectDuration(s);
  const [W, H] = exportSize(s, 1280);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const comp = new Compositor();
  const frames = Math.ceil(dur * FPS);
  try {
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await comp.seek(s, t);
      comp.draw(ctx, W, H, t, s);
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.9));
      await ff.writeFile(`f${String(i).padStart(5, "0")}.jpg`, new Uint8Array(await blob.arrayBuffer()));
      if (i % 5 === 0) onProgress(0.05 + (i / frames) * 0.7, `Rendering frame ${i + 1}/${frames}`);
    }
  } finally { comp.dispose(); }
  onProgress(0.78, "Mixing audio…");
  const audio = await mixAudio(s, dur);
  const args = ["-framerate", String(FPS), "-i", "f%05d.jpg"];
  if (audio) {
    await ff.writeFile("a.wav", new Uint8Array(await encodeWav(audio).arrayBuffer()));
    args.push("-i", "a.wav", "-c:a", "aac", "-b:a", "160k", "-shortest");
  }
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart", "out.mp4");
  ff.on("progress", ({ progress }) => onProgress(0.8 + Math.min(1, progress) * 0.19, "Encoding MP4…"));
  const code = await ff.exec(args);
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  const data = (await ff.readFile("out.mp4")) as Uint8Array;
  ff.terminate();
  return { blob: new Blob([data.slice().buffer], { type: "video/mp4" }), name: `lumen-video-${Date.now()}.mp4`, via: "ffmpeg" };
}

async function viaRecorder(s: VideoState, onProgress: Progress): Promise<ExportResult> {
  const dur = projectDuration(s);
  const [W, H] = exportSize(s, 1280);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const comp = new Compositor();
  const stream = canvas.captureStream(FPS);
  // audio: render the mix offline, then play it into the recording
  const mix = await mixAudio(s, dur).catch(() => null);
  let ac: AudioContext | null = null;
  if (mix) {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource();
    src.buffer = mix;
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    src.start();
  }
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      comp.sync(s, t, true);
      comp.draw(ctx, W, H, t, s);
      onProgress(Math.min(0.99, t / dur), "Recording (real time)…");
      if (t < dur) requestAnimationFrame(loop);
      else res();
    };
    loop();
  });
  rec.stop();
  await done;
  comp.dispose();
  ac?.close();
  return { blob: new Blob(chunks, { type: "video/webm" }), name: `lumen-video-${Date.now()}.webm`, via: "mediarecorder" };
}

export async function exportVideo(onProgress: Progress, prefer: "auto" | "webm" = "auto"): Promise<ExportResult> {
  const s = video.get();
  if (!s.clips.length) throw new Error("the timeline is empty");
  if (prefer === "auto") {
    try { return await viaFfmpeg(s, onProgress); } catch (e) { console.warn("ffmpeg export failed, using MediaRecorder", e); onProgress(0.01, "Falling back to WebM…"); }
  }
  return viaRecorder(s, onProgress);
}
