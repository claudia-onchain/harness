import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockGrok } from "./mock-grok.js";
import { createImagine, mediaRef, fetchToFile } from "../src/grok/imagine.js";
import { GrokAuthError, GrokInvalidRequestError, GrokError, GrokTimeoutError } from "../src/grok/errors.js";

let mock, imagine, usages, dir;
before(async () => {
  mock = await startMockGrok();
  usages = [];
  imagine = createImagine({ apiKey: "test-key", baseUrl: mock.url, imagePollMs: 2, videoPollMs: 2, onUsage: (u, ctx) => usages.push({ u, ctx }) });
  dir = await mkdtemp(join(tmpdir(), "pulse-imagine-"));
});
after(async () => { await mock.close(); await rm(dir, { recursive: true, force: true }); });

test("image: sync generation sends the documented body and returns URLs + usage", async () => {
  const r = await imagine.image({ prompt: "A neon $SOL ticker over Manhattan at dusk" });
  assert.equal(r.urls.length, 1);
  assert.match(r.urls[0], /\/media\/img_.*\.png$/);
  assert.deepEqual(r.b64, []);
  assert.equal(r.usage.costTicks, 12345678);
  assert.equal(r.model, "grok-imagine-image-2.0");
  const sent = mock.calls.at(-1);
  assert.equal(sent.path, "/v1/images/generations");
  assert.deepEqual(sent.body, { model: "grok-imagine-image-2.0", prompt: "A neon $SOL ticker over Manhattan at dusk", n: 1, aspect_ratio: "16:9", resolution: "1k", quality: "low", response_format: "url" });
  assert.equal(usages.at(-1).u.costTicks, 12345678);
  assert.equal(usages.at(-1).ctx.body.prompt, sent.body.prompt);
  const b64 = await imagine.image({ prompt: "x", responseFormat: "b64_json", n: 2, model: "grok-imagine-image", aspectRatio: "1:1" });
  assert.equal(b64.b64.length, 2);
  assert.deepEqual(b64.urls, []);
  assert.equal(mock.calls.at(-1).body.quality, undefined, "quality only exists on image-2.0");
  await assert.rejects(imagine.image({}), GrokInvalidRequestError);
  await assert.rejects(imagine.image({ prompt: "x", aspectRatio: "7:3" }), /aspect_ratio/);
});

test("image: deferred generation polls GET /v1/images/{id} until done", async () => {
  const before = mock.calls.length;
  const r = await imagine.image({ prompt: "deferred", deferred: true });
  assert.equal(r.urls.length, 1);
  assert.match(r.requestId, /^img_req_/);
  const calls = mock.calls.slice(before);
  assert.equal(calls[0].body.deferred, true);
  assert.deepEqual(calls.slice(1).map((c) => c.method + " " + c.path), [`GET /v1/images/${r.requestId}`, `GET /v1/images/${r.requestId}`]);
  assert.equal(r.usage.costTicks, 12345678);
});

test("edit: single and multi image sources, data URIs and file ids", async () => {
  const r = await imagine.edit({ prompt: "add a rocket", images: ["https://cdn.example/a.png"], aspectRatio: "16:9" });
  assert.equal(r.urls.length, 1);
  assert.deepEqual(mock.calls.at(-1).body, { model: "grok-imagine-image-2.0", prompt: "add a rocket", n: 1, response_format: "url", image: { type: "image_url", url: "https://cdn.example/a.png" }, aspect_ratio: "16:9" });
  await imagine.edit({ prompt: "merge", images: ["data:image/png;base64,AAAA", { fileId: "file_123" }] });
  assert.deepEqual(mock.calls.at(-1).body.images, [{ type: "image_url", url: "data:image/png;base64,AAAA" }, { type: "image_file", file_id: "file_123" }]);
  assert.equal(mock.calls.at(-1).path, "/v1/images/edits");
  await assert.rejects(imagine.edit({ prompt: "x", images: [] }), /source image/);
  await assert.rejects(imagine.edit({ prompt: "x", images: Array(6).fill("https://a/b.png") }), /at most 5/);
  assert.deepEqual(mediaRef("file_abc"), { type: "image_file", file_id: "file_abc" });
  assert.deepEqual(mediaRef({ b64: "QUJD", mime: "image/jpeg" }), { type: "image_url", url: "data:image/jpeg;base64,QUJD" });
});

test("video: generation polls (pending twice) then resolves url/duration/model with usage", async () => {
  const before = mock.calls.length;
  const r = await imagine.video({ prompt: "Headline: SOL ETF approved", duration: 6, image: "https://cdn.example/card.png" });
  assert.match(r.url, /\/media\/vid_req_.*\.mp4$/);
  assert.equal(r.duration, 6);
  assert.equal(r.model, "grok-imagine-video-1.5-lite");
  assert.equal(r.usage.costTicks, 6 * 12345678);
  const calls = mock.calls.slice(before);
  assert.equal(calls[0].path, "/v1/videos/generations");
  assert.deepEqual(calls[0].body, { model: "grok-imagine-video-1.5-lite", prompt: "Headline: SOL ETF approved", duration: 6, aspect_ratio: "16:9", resolution: "720p", generate_audio: true, image: { type: "image_url", url: "https://cdn.example/card.png" } });
  assert.equal(calls.filter((c) => c.method === "GET").length, 3, "two pending polls then done");
  assert.equal(usages.at(-1).u.costTicks, 6 * 12345678);
  await assert.rejects(imagine.video({ prompt: "x", duration: 20 }), /duration/);
});

test("video: failed jobs and poll timeouts become typed errors; extend hits /v1/videos/extensions", async () => {
  await assert.rejects(imagine.video({ prompt: "fail_me please" }), (e) => e instanceof GrokError && e.code === "invalid_argument" && /moderation/.test(e.message));
  const impatient = createImagine({ apiKey: "k", baseUrl: mock.url, videoPollMs: 1, videoPollTimeoutMs: 0 });
  await assert.rejects(impatient.video({ prompt: "slow" }), GrokTimeoutError);
  const r = await imagine.extend({ video: "https://cdn.example/clip.mp4", prompt: "keep going", duration: 4 });
  assert.match(r.url, /\.mp4$/);
  const sent = mock.calls.find((c) => c.path === "/v1/videos/extensions");
  assert.deepEqual(sent.body, { model: "grok-imagine-video", prompt: "keep going", duration: 4, video: { url: "https://cdn.example/clip.mp4" } });
  await assert.rejects(imagine.extend({ video: "https://a/b.mp4", duration: 1 }), /2\.\.10/);
});

test("401 without a key → GrokAuthError", async () => {
  const anon = createImagine({ apiKey: "x", baseUrl: mock.url, fetch: (url, init) => fetch(url, { ...init, headers: { "content-type": "application/json" } }) });
  await assert.rejects(anon.image({ prompt: "x" }), GrokAuthError);
});

test("fetchToFile downloads a temporary media URL to disk", async () => {
  const r = await imagine.image({ prompt: "to disk" });
  const out = join(dir, "nested", "card.png");
  const f = await fetchToFile(r.urls[0], out);
  assert.equal(f.path, out);
  assert.equal(f.bytes, 70);
  assert.equal(f.contentType, "image/png");
  const bytes = await readFile(out);
  assert.equal(bytes.length, 70);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  await assert.rejects(imagine.fetchToFile(`${mock.url}/v1/nope`, join(dir, "x")), (e) => e.code === "download_failed" && e.status === 401);
});
