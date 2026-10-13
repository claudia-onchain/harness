import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { tempHome } from "./helpers.js";

const home = tempHome();
const { KeyStore } = await import("../src/core/keys.js");
const { Approvals } = await import("../src/core/approvals.js");
const { MediaService } = await import("../src/media/index.js");

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d5a1a90000000049454e44ae426082", "hex");
const orig = globalThis.fetch;
afterEach(() => { globalThis.fetch = orig; });

test("media: OpenRouter image job stores the file and reports cost", async () => {
  const keys = new KeyStore({ file: join(home, "mk.json"), env: { OPENROUTER_API_KEY: "sk-or-test-0000000000000" } });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([String(url), JSON.parse(init.body)]);
    return Response.json({ data: [{ b64_json: PNG.toString("base64"), media_type: "image/png" }], usage: { cost: 0.03 } });
  };
  const m = new MediaService({ keys, approvals: new Approvals(), getConfig: () => ({ media: { approveAboveUsd: 0.5 }, approvalMode: "always-ask" }) });
  const { job, done } = m.generate({ kind: "image", prompt: "a neon fox", model: "openrouter:black-forest-labs/flux-3-image", aspect: "16:9" });
  assert.ok(["queued", "running"].includes(job.status));
  const fin = await done;
  assert.equal(fin.status, "done", fin.error);
  assert.equal(fin.costUsd, 0.03);
  assert.equal(calls[0][0], "https://openrouter.ai/api/v1/images");
  assert.equal(calls[0][1].aspect_ratio, "16:9");
  const out = fin.outputs[0];
  assert.equal(out.mime, "image/png");
  assert.ok(existsSync(out.path) && readFileSync(out.path).equals(PNG));
  assert.match(out.url, /^\/api\/files\/media\/\d{4}-\d\d-\d\d\/mj_.+\.png$/);
});

test("media: spend above the limit waits for approval; no UI means failed with a reason", async () => {
  const keys = new KeyStore({ file: join(home, "mk2.json"), env: { OPENROUTER_API_KEY: "sk-or-test-0000000000000" } });
  let hit = 0;
  globalThis.fetch = async () => { hit++; return Response.json({}); };
  const m = new MediaService({ keys, approvals: new Approvals(), getConfig: () => ({ media: { approveAboveUsd: 0.5 }, approvalMode: "always-ask" }) });
  const statuses = [];
  m.jobs.on("job", (j) => statuses.push(j.status));
  const fin = await m.generate({ kind: "video", prompt: "drone shot", durationSec: 8 }).done;
  assert.equal(fin.status, "failed");
  assert.match(fin.error, /above your/);
  assert.ok(statuses.includes("awaiting_approval"));
  assert.equal(hit, 0, "nothing was requested from the provider");
});

test("media: no key gives a helpful error", () => {
  const keys = new KeyStore({ file: join(home, "mk3.json"), env: {} });
  const m = new MediaService({ keys, approvals: new Approvals(), getConfig: () => ({ media: {} }) });
  assert.throws(() => m.generate({ kind: "music", prompt: "lofi" }), /No key can make music/);
});
