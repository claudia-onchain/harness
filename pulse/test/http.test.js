import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/core/store.js";
import { createScheduler } from "../src/core/routines.js";
import { createHttp } from "../src/channels/http.js";
import { tick } from "./helpers.js";

test("http: health, alerts, routines, token-gated run", async (t) => {
  const store = openStore(":memory:");
  let ran = 0;
  const scheduler = createScheduler({ store, runners: { watch: async () => { ran++; await tick(10); return {}; } }, jitterMs: 0 });
  const rt = store.routines.insert({ kind: "watch", name: "a", everyMin: 15, nextRunAt: "2999-01-01T00:00:00.000Z" });
  store.alerts.insert({ routineId: rt.id, headline: "h1", severity: "low" });
  store.alerts.insert({ routineId: rt.id, headline: "h2", severity: "high", posts: [{ url: "u" }] });
  const http = createHttp({ store, scheduler, token: "secret", port: 0 });
  const port = await http.start();
  t.after(async () => { await http.stop(); store.close(); });
  const base = `http://127.0.0.1:${port}`;
  const get = async (p, init) => { const r = await fetch(base + p, init); return { status: r.status, body: await r.json(), type: r.headers.get("content-type") }; };

  const h = await get("/health");
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  assert.equal(h.body.routines, 1);
  assert.match(h.type, /application\/json/);

  const a = await get("/alerts?limit=1");
  assert.equal(a.body.alerts.length, 1);
  assert.equal(a.body.alerts[0].headline, "h2");
  assert.deepEqual(a.body.alerts[0].posts, [{ url: "u" }]);
  assert.equal((await get("/alerts")).body.alerts.length, 2);

  const r = await get("/routines");
  assert.equal(r.body.routines[0].id, rt.id);

  assert.equal((await get(`/run/${rt.id}`)).status, 405);
  assert.equal((await get(`/run/${rt.id}`, { method: "POST" })).status, 401);
  assert.equal((await get(`/run/${rt.id}`, { method: "POST", headers: { authorization: "Bearer nope" } })).status, 401);
  assert.equal((await get(`/run/rt_zz`, { method: "POST", headers: { authorization: "Bearer secret" } })).status, 404);
  const ok = await get(`/run/${rt.id}`, { method: "POST", headers: { authorization: "Bearer secret" } });
  assert.equal(ok.status, 202);
  assert.equal(ok.body.routineId, rt.id);
  assert.equal((await get(`/run/${rt.id}`, { method: "POST", headers: { authorization: "Bearer secret" } })).status, 409, "already running");
  await scheduler.wait();
  assert.equal(ran, 1);
  assert.equal((await get("/nope")).status, 404);
});

test("http: run is disabled without a token", async (t) => {
  const store = openStore(":memory:");
  const http = createHttp({ store, scheduler: null, port: 0 });
  const port = await http.start();
  t.after(async () => { await http.stop(); store.close(); });
  const r = await fetch(`http://127.0.0.1:${port}/run/x`, { method: "POST" });
  assert.equal(r.status, 503);
});
