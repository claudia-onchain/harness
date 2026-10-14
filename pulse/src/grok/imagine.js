// Grok Imagine: image generation/editing and video generation/extension with polling. Costs are
// taken from `usage.cost_in_usd_ticks` on the final job object and pushed through `onUsage`, the
// same channel the text client uses, so a routine's receipt covers its visuals too.
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequester, STATUS } from "./http.js";
import { summarizeUsage } from "./cost.js";
import { GrokError, GrokAbortError, GrokTimeoutError, GrokInvalidRequestError } from "./errors.js";

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));
const IMAGE_ASPECTS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2", "19.5:9", "9:19.5", "20:9", "9:20", "21:9", "5:2", "auto"]);
const VIDEO_ASPECTS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "5:2"]);

/** A media reference (URL, data: URI, {fileId}, {url}) → the JSON shape Imagine endpoints accept. */
export function mediaRef(ref) {
  if (!ref) return undefined;
  if (typeof ref === "string") return /^data:/.test(ref) || /^https?:\/\//.test(ref) ? { type: "image_url", url: ref } : { type: "image_file", file_id: ref };
  if (ref.fileId || ref.file_id) return { type: "image_file", file_id: ref.fileId || ref.file_id };
  if (ref.url) return { type: "image_url", url: ref.url };
  if (ref.b64 || ref.base64) return { type: "image_url", url: `data:${ref.mime || "image/png"};base64,${ref.b64 || ref.base64}` };
  throw new GrokInvalidRequestError("unrecognised media reference");
}

export function createImagine({
  apiKey, baseUrl = "https://api.x.ai", fetch: fetchImpl, onUsage, timeoutMs = 120_000,
  imagePollMs = 1000, imagePollTimeoutMs = 120_000, videoPollMs = 2000, videoPollTimeoutMs = 600_000, sleep = sleepDefault,
  maxRetries, retryBaseMs, retryMaxMs,
} = {}) {
  const { json } = createRequester({ apiKey, baseUrl, fetch: fetchImpl, timeoutMs, maxRetries, retryBaseMs, retryMaxMs, sleep });
  const report = (usage, body, response) => { try { onUsage?.(usage, { body, response }); } catch { /* never let metering break a job */ } };

  /** GET `path` until status leaves "pending"; a failed job becomes a typed error carrying xAI's code. */
  async function poll(path, { everyMs, timeoutMs: limit, signal, label }) {
    const started = Date.now();
    for (;;) {
      if (signal?.aborted) throw new GrokAbortError();
      const j = await json("GET", path, undefined, { signal });
      const status = j.status || (j.data ? "done" : "pending");
      if (status === "done" || status === "completed" || status === "succeeded") return j;
      if (status === "failed" || status === "error") {
        const e = j.error || {};
        throw new GrokError(`${label} failed: ${e.message || "unknown error"}`, { code: e.code || "generation_failed", data: j });
      }
      if (Date.now() - started > limit) throw new GrokTimeoutError(`${label} still ${status} after ${Math.round(limit / 1000)} s`, { data: { path } });
      await sleep(everyMs);
    }
  }

  function imageResult(j, body) {
    const data = Array.isArray(j.data) ? j.data : [];
    const usage = summarizeUsage(j.usage);
    report(usage, body, j);
    return {
      urls: data.map((d) => d.url).filter(Boolean),
      b64: data.map((d) => d.b64_json).filter(Boolean),
      data, usage, model: j.model || body.model, raw: j,
    };
  }

  async function image({
    prompt, aspectRatio = "16:9", resolution = "1k", quality = "low", model = "grok-imagine-image-2.0",
    n = 1, responseFormat = "url", deferred = false, signal, storage,
  } = {}) {
    if (!prompt) throw new GrokInvalidRequestError("image: prompt is required");
    if (!IMAGE_ASPECTS.has(aspectRatio)) throw new GrokInvalidRequestError(`image: unsupported aspect_ratio "${aspectRatio}"`);
    if (n < 1 || n > 10) throw new GrokInvalidRequestError("image: n must be 1..10");
    const body = { model, prompt, n, aspect_ratio: aspectRatio, resolution, response_format: responseFormat };
    if (/image-2\.0/.test(model)) body.quality = quality; // `quality` only exists on 2.0
    if (deferred) body.deferred = true;
    if (storage) body.storage_options = storage;
    const first = await json("POST", "/v1/images/generations", body, { signal });
    if (!deferred && first[STATUS] !== 202 && !first.request_id) return imageResult(first, body);
    const id = first.request_id || first.id;
    if (!id) throw new GrokError("deferred image job returned no request_id", { code: "bad_response", data: first });
    const done = await poll(`/v1/images/${encodeURIComponent(id)}`, { everyMs: imagePollMs, timeoutMs: imagePollTimeoutMs, signal, label: "image generation" });
    return { ...imageResult(done, body), requestId: id };
  }

  async function edit({ prompt, images, image: single, aspectRatio, model = "grok-imagine-image-2.0", n = 1, quality, responseFormat = "url", signal } = {}) {
    if (!prompt) throw new GrokInvalidRequestError("edit: prompt is required");
    const refs = (images || (single ? [single] : [])).map(mediaRef);
    if (!refs.length) throw new GrokInvalidRequestError("edit: at least one source image is required");
    if (refs.length > 5) throw new GrokInvalidRequestError("edit: at most 5 source images");
    const body = { model, prompt, n, response_format: responseFormat };
    // Single-image edits use `image`; the multi-image form takes the list (docs show one, RESEARCH 4.1 mentions up to 5).
    if (refs.length === 1) body.image = refs[0];
    else body.images = refs;
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (quality) body.quality = quality;
    return imageResult(await json("POST", "/v1/images/edits", body, { signal }), body);
  }

  function videoResult(j, body, id) {
    const usage = summarizeUsage(j.usage);
    report(usage, body, j);
    const v = j.video || {};
    return { url: v.url, duration: v.duration ?? body.duration, model: j.model || body.model, requestId: id, moderated: v.respect_moderation, usage, raw: j };
  }

  async function video({
    prompt, duration = 6, aspectRatio = "16:9", resolution = "720p", audio = true, image, model = "grok-imagine-video-1.5-lite",
    referenceImages, lastFrame, keyframes, signal, storage,
  } = {}) {
    if (!prompt && !image) throw new GrokInvalidRequestError("video: prompt (or image) is required");
    if (!(duration >= 1 && duration <= 15)) throw new GrokInvalidRequestError("video: duration must be 1..15 seconds");
    if (!VIDEO_ASPECTS.has(aspectRatio)) throw new GrokInvalidRequestError(`video: unsupported aspect_ratio "${aspectRatio}"`);
    const body = { model, prompt, duration, aspect_ratio: aspectRatio, resolution, generate_audio: !!audio };
    if (image) body.image = mediaRef(image);
    if (referenceImages?.length) body.reference_images = referenceImages.map(mediaRef);
    if (lastFrame) body.last_frame = mediaRef(lastFrame);
    if (keyframes?.length) body.keyframes = keyframes.map((k) => ({ image: mediaRef(k.image), timestamp_s: k.timestampS ?? k.timestamp_s }));
    if (storage) body.storage_options = storage;
    const first = await json("POST", "/v1/videos/generations", body, { signal });
    return awaitVideo(first, body, signal);
  }

  async function awaitVideo(first, body, signal) {
    const id = first.request_id || first.id;
    if (!id) throw new GrokError("video job returned no request_id", { code: "bad_response", data: first });
    const done = await poll(`/v1/videos/${encodeURIComponent(id)}`, { everyMs: videoPollMs, timeoutMs: videoPollTimeoutMs, signal, label: "video generation" });
    return videoResult(done, body, id);
  }

  /** Extend an existing clip; `duration` is the added length (2–10 s). Only the 1.0 model supports this. */
  async function extend({ video: source, prompt, duration = 6, model = "grok-imagine-video", signal } = {}) {
    if (!source) throw new GrokInvalidRequestError("extend: video is required");
    if (!(duration >= 2 && duration <= 10)) throw new GrokInvalidRequestError("extend: duration must be 2..10 seconds");
    const ref = mediaRef(source);
    const body = { model, prompt, duration, video: ref.type === "image_file" ? { file_id: ref.file_id } : { url: ref.url } };
    const first = await json("POST", "/v1/videos/extensions", body, { signal });
    return awaitVideo(first, body, signal);
  }

  return { image, edit, video, extend, fetchToFile: (url, path, opts) => fetchToFile(url, path, { fetch: fetchImpl, ...opts }) };
}

/** Download a temporary Imagine URL to disk (the URLs expire; the file is what gets sent to Telegram). */
export async function fetchToFile(url, path, { fetch: fetchImpl, signal } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const res = await doFetch(url, { signal });
  if (!res.ok) throw new GrokError(`download failed: ${res.status} ${url}`, { status: res.status, code: "download_failed" });
  await mkdir(dirname(path), { recursive: true });
  let bytes = 0;
  const counter = async function* (src) { for await (const c of src) { bytes += c.length; yield c; } };
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(path));
  return { path, bytes, contentType: res.headers.get("content-type") || "" };
}
