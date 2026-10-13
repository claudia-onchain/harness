// Media backends. Each: { id, kinds, available(keys), estimate(req), run(req, ctx) -> [{ bytes, mime }] | [{ url }] }
// ctx: { keys, signal, onProgress }. Unverified request shapes are marked and fail with a clear message.
import { fetchJson, fetchT, sleep } from "../core/util.js";

const OR = "https://openrouter.ai/api/v1";
const b64 = (s) => Buffer.from(String(s).replace(/^data:[^;]+;base64,/, ""), "base64");
const mimeOfDataUrl = (s) => /^data:([^;]+);/.exec(s)?.[1];
const ASPECT_SIZE = { "1:1": "1024x1024", "16:9": "1536x1024", "3:2": "1536x1024", "9:16": "1024x1536", "2:3": "1024x1536", "4:5": "1024x1536" };

async function download(url, headers = {}, signal) {
  const r = await fetchT(url, { headers, signal }, 180000);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || undefined };
}

async function poll(fn, { signal, everyMs = 4000, maxMs = 10 * 60_000, onProgress } = {}) {
  const until = Date.now() + maxMs;
  for (let i = 0; Date.now() < until; i++) {
    if (signal?.aborted) throw new Error("aborted");
    const r = await fn(i);
    if (r) return r;
    onProgress?.(i);
    await sleep(Math.min(15000, everyMs * 1.15 ** i));
  }
  throw new Error("timed out waiting for the provider");
}

export const BACKENDS = [
  {
    id: "openrouter", kinds: ["image", "video", "speech", "music"], available: (k) => k.has("openrouter"),
    defaults: { image: "google/gemini-3.1-flash-image", video: "google/veo-3.1-fast", speech: "openai/gpt-4o-mini-tts-2025-12-15", music: "google/lyria-3-clip-preview" },
    estimate: (r) => ({ image: 0.04, video: 0.15 * (r.durationSec || 6), speech: 0.01, music: 0.08 }[r.kind]),
    async run(r, { keys, signal, onProgress }) {
      const h = { authorization: `Bearer ${keys.get("openrouter")}`, "X-Title": "Lumen", "HTTP-Referer": "https://github.com/lumen-agent" };
      if (r.kind === "image") {
        // Chat route models (gemini *-image) return data URLs; others use the dedicated /images route.
        if (/gemini.*image/i.test(r.model)) {
          const content = [{ type: "text", text: `${r.prompt}${r.aspect ? `\nAspect ratio: ${r.aspect}` : ""}` }, ...(r.refs || []).map((u) => ({ type: "image_url", image_url: { url: u } }))];
          const j = await fetchJson(`${OR}/chat/completions`, { method: "POST", headers: h, body: { model: r.model, modalities: ["image", "text"], messages: [{ role: "user", content }], ...(r.aspect ? { image_config: { aspect_ratio: r.aspect } } : {}) }, signal }, 180000);
          const imgs = j.choices?.[0]?.message?.images || [];
          if (!imgs.length) throw new Error(`No image returned${j.choices?.[0]?.message?.content ? `: ${String(j.choices[0].message.content).slice(0, 200)}` : ""}`);
          return { outputs: imgs.map((x) => ({ bytes: b64(x.image_url?.url || x.url), mime: mimeOfDataUrl(x.image_url?.url || x.url) })), costUsd: j.usage?.cost };
        }
        const j = await fetchJson(`${OR}/images`, { method: "POST", headers: h, body: { model: r.model, prompt: r.prompt, n: 1, resolution: "1K", ...(r.aspect ? { aspect_ratio: r.aspect } : {}), ...(r.refs?.length ? { input_references: r.refs } : {}) }, signal }, 180000);
        return { outputs: (j.data || []).map((d) => ({ bytes: b64(d.b64_json), mime: d.media_type })), costUsd: j.usage?.cost };
      }
      if (r.kind === "video") {
        const sub = await fetchJson(`${OR}/videos`, { method: "POST", headers: h, body: { model: r.model, prompt: r.prompt, duration: r.durationSec || 6, ...(r.aspect ? { aspect_ratio: r.aspect } : {}), ...(r.refs?.length ? { frame_images: r.refs } : {}), generate_audio: true }, signal }, 60000);
        const id = sub.id;
        const done = await poll(async () => {
          const s = await fetchJson(sub.polling_url || `${OR}/videos/${id}`, { headers: h, signal }, 30000);
          if (s.status === "failed") throw new Error(s.error?.message || s.error || "video generation failed");
          return s.status === "completed" ? s : null;
        }, { signal, onProgress });
        const file = await download(`${OR}/videos/${id}/content?index=0`, h, signal);
        return { outputs: [file], costUsd: done.usage?.cost };
      }
      if (r.kind === "speech") {
        const res = await fetchT(`${OR}/audio/speech`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ model: r.model, input: r.prompt, voice: r.voice || "alloy", response_format: "mp3" }), signal }, 120000);
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
        return { outputs: [{ bytes: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" }] };
      }
      // music (request shape UNVERIFIED): chat with audio modality, base64 in message.audio.data
      const j = await fetchJson(`${OR}/chat/completions`, { method: "POST", headers: h, body: { model: r.model, modalities: ["text", "audio"], audio: { format: "mp3" }, messages: [{ role: "user", content: r.prompt }] }, signal }, 300000);
      const data = j.choices?.[0]?.message?.audio?.data;
      if (!data) throw new Error("OpenRouter returned no audio for this music request (the music route is unverified; try ElevenLabs).");
      return { outputs: [{ bytes: b64(data), mime: undefined }], costUsd: j.usage?.cost };
    },
  },
  {
    id: "openai", kinds: ["image", "speech"], available: (k) => k.has("openai"),
    defaults: { image: "gpt-image-2.5-sunburst", speech: "gpt-4o-mini-tts" },
    estimate: (r) => ({ image: 0.08, speech: 0.01 }[r.kind]),
    async run(r, { keys, signal }) {
      const h = { authorization: `Bearer ${keys.get("openai")}` };
      if (r.kind === "image") {
        const j = await fetchJson("https://api.openai.com/v1/images/generations", { method: "POST", headers: h, body: { model: r.model, prompt: r.prompt, size: ASPECT_SIZE[r.aspect] || "1024x1024", output_format: "png" }, signal }, 240000);
        return { outputs: (j.data || []).map((d) => (d.b64_json ? { bytes: b64(d.b64_json), mime: "image/png" } : { url: d.url })) };
      }
      const res = await fetchT("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ model: r.model, input: r.prompt, voice: r.voice || "marin", response_format: "mp3" }), signal }, 120000);
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
      return { outputs: [{ bytes: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" }] };
    },
  },
  {
    id: "xai", kinds: ["image", "video"], available: (k) => k.has("xai"),
    defaults: { image: "grok-imagine-image-2.0", video: "grok-imagine-video-1.5" },
    estimate: (r) => ({ image: 0.07, video: 0.1 * (r.durationSec || 6) }[r.kind]),
    async run(r, { keys, signal, onProgress }) {
      const h = { authorization: `Bearer ${keys.get("xai")}` };
      if (r.kind === "image") {
        const j = await fetchJson("https://api.x.ai/v1/images/generations", { method: "POST", headers: h, body: { model: r.model, prompt: r.prompt }, signal }, 180000);
        return { outputs: (j.data || []).map((d) => (d.b64_json ? { bytes: b64(d.b64_json) } : { url: d.url })) };
      }
      const sub = await fetchJson("https://api.x.ai/v1/videos/generations", { method: "POST", headers: h, body: { model: r.model, prompt: r.prompt, duration: r.durationSec || 6, ...(r.refs?.[0] ? { image: r.refs[0] } : {}) }, signal }, 60000);
      const id = sub.request_id || sub.id;
      const done = await poll(async () => {
        const s = await fetchJson(`https://api.x.ai/v1/videos/${id}`, { headers: h, signal }, 30000);
        if (s.status === "failed" || s.status === "error") throw new Error(s.error || "video failed");
        return s.status === "done" || s.video?.url ? s : null;
      }, { signal, onProgress });
      return { outputs: [{ url: done.video?.url }] };
    },
  },
  {
    id: "fal", kinds: ["image", "video"], available: (k) => k.has("fal"),
    defaults: { image: "fal-ai/flux/dev", video: "fal-ai/kling-video/v2.1/standard/text-to-video" }, // model ids UNVERIFIED for 2026
    estimate: (r) => ({ image: 0.03, video: 0.3 }[r.kind]),
    async run(r, { keys, signal, onProgress }) {
      const h = { authorization: `Key ${keys.get("fal")}` };
      const sub = await fetchJson(`https://queue.fal.run/${r.model}`, { method: "POST", headers: h, body: { prompt: r.prompt, ...(r.aspect ? { aspect_ratio: r.aspect } : {}), ...(r.durationSec ? { duration: String(r.durationSec) } : {}), ...(r.refs?.[0] ? { image_url: r.refs[0] } : {}) }, signal }, 60000);
      await poll(async () => {
        const s = await fetchJson(sub.status_url, { headers: h, signal }, 30000);
        if (s.status === "FAILED" || s.status === "ERROR") throw new Error(s.error || "fal job failed");
        return s.status === "COMPLETED" ? s : null;
      }, { signal, onProgress, everyMs: 2500 });
      const res = await fetchJson(sub.response_url, { headers: h, signal }, 60000);
      const files = [...(res.images || []), ...(res.video ? [res.video] : []), ...(res.audio ? [res.audio] : [])];
      if (!files.length) throw new Error("fal returned no files");
      return { outputs: files.map((f) => ({ url: f.url, mime: f.content_type })) };
    },
  },
  {
    id: "elevenlabs", kinds: ["speech", "music", "sfx"], available: (k) => k.has("elevenlabs"),
    defaults: { speech: "eleven_multilingual_v2", music: "music_v1", sfx: "eleven_text_to_sound_v2" },
    estimate: (r) => ({ speech: 0.02, music: 0.1, sfx: 0.02 }[r.kind]),
    async run(r, { keys, signal }) {
      const h = { "xi-api-key": keys.get("elevenlabs"), "content-type": "application/json" };
      const call = async (url, body) => {
        const res = await fetchT(url, { method: "POST", headers: h, body: JSON.stringify(body), signal }, 300000);
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
        return { bytes: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
      };
      if (r.kind === "speech") return { outputs: [await call(`https://api.elevenlabs.io/v1/text-to-speech/${r.voice || "21m00Tcm4TlvDq8ikWAM"}?output_format=mp3_44100_128`, { text: r.prompt, model_id: r.model })] };
      if (r.kind === "music") return { outputs: [await call("https://api.elevenlabs.io/v1/music", { prompt: r.prompt, music_length_ms: Math.round((r.durationSec || 30) * 1000) })] };
      return { outputs: [await call("https://api.elevenlabs.io/v1/sound-generation", { text: r.prompt, ...(r.durationSec ? { duration_seconds: r.durationSec } : {}) })] };
    },
  },
  {
    id: "claudia-media", kinds: ["image", "video", "speech", "music", "sfx"],
    available: (k) => ["gemini", "openai", "fal", "elevenlabs", "heygen", "runway", "byteplus"].some((f) => k.has(f)),
    defaults: {},
    estimate: () => null,
    async run(r, { keys, signal, onProgress, dataDir }) {
      let mod;
      try { mod = await import("@useclaudia/media"); } catch (e) { throw new Error(`@useclaudia/media is not installed: ${e.message}`); }
      const map = { google: "gemini", openai: "openai", fal: "fal", elevenlabs: "elevenlabs", heygen: "heygen", runway: "runway", byteplus: "byteplus" };
      const media = mod.createMedia({ keys: { get: (name) => keys.get(map[name] || name) || undefined }, dataDir });
      const job = await media.generate({ kind: r.kind, prompt: r.prompt, ...(r.kind === "speech" ? { text: r.prompt } : {}), ...(r.model ? { model: r.model } : {}), ...(r.aspect ? { aspect: r.aspect } : {}), ...(r.durationSec ? { durationSec: r.durationSec } : {}), ...(r.voice ? { voice: r.voice } : {}), ...(r.refs?.length ? { refs: r.refs } : {}) }, { approve: true });
      if (!job?.id) throw new Error("@useclaudia/media returned no job");
      let done = job;
      for (let i = 0; i < 60 && !["succeeded", "failed", "blocked", "expired", "canceled"].includes(done.status); i++) {
        if (signal?.aborted) { await media.cancel(job.id).catch(() => {}); throw new Error("aborted"); }
        done = await media.wait(job.id, { timeoutMs: 10000 });
        onProgress?.(i);
      }
      if (done.status !== "succeeded") throw new Error(done.error?.message || `job ${done.status}`);
      const { readFileSync } = await import("node:fs");
      return { outputs: done.outputs.map((o) => ({ bytes: readFileSync(o.path), mime: o.mime })), costUsd: done.provenance?.costUsd, model: done.model, provider: `claudia-media/${done.provider}` };
    },
  },
];

export const BACKEND_BY_ID = new Map(BACKENDS.map((b) => [b.id, b]));
export const KIND_ORDER = {
  image: ["openrouter", "openai", "xai", "fal", "claudia-media"],
  video: ["openrouter", "xai", "fal", "claudia-media"],
  speech: ["openrouter", "openai", "elevenlabs", "claudia-media"],
  music: ["elevenlabs", "openrouter", "claudia-media"],
  sfx: ["elevenlabs", "claudia-media"],
};

export { download };
