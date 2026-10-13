import { test, after } from "node:test";
import assert from "node:assert/strict";
import { tempHome } from "./helpers.js";

tempHome();
const { createRuntime } = await import("../src/agent/runtime.js");
const { startServer } = await import("../src/server/index.js");
const rt = await createRuntime({ flags: { model: "mock:echo" }, detect: false });
const port = 47000 + Math.floor(Math.random() * 900);
const srv = await startServer(rt, { port, token: "test-token-123456" });
after(() => srv.close());
const base = `http://127.0.0.1:${port}`;

test("health is public", async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("api needs the session cookie (401 without, 200 with)", async () => {
  const r1 = await fetch(`${base}/api/state`);
  assert.equal(r1.status, 401);
  assert.equal((await r1.json()).error.code, "unauthorized");
  const login = await fetch(`${base}/?t=test-token-123456`, { redirect: "manual" });
  assert.equal(login.status, 302);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /lumen_session=test-token-123456; Path=\/; HttpOnly; SameSite=Strict/);
  const r2 = await fetch(`${base}/api/state`, { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(r2.status, 200);
  const st = await r2.json();
  assert.equal(st.model.provider, "mock");
  assert.ok(Array.isArray(st.providers) && typeof st.chains === "number" && st.skills.base >= 0);
  const r3 = await fetch(`${base}/api/personas`, { headers: { "x-lumen-token": "test-token-123456" } });
  assert.equal(r3.status, 200);
  const wrong = await fetch(`${base}/api/state`, { headers: { cookie: "lumen_session=nope" } });
  assert.equal(wrong.status, 401);
});

test("host and origin guards", async () => {
  const { request } = await import("node:http");
  const status = (opts, body) => new Promise((res) => { const q = request({ host: "127.0.0.1", port, ...opts }, (r) => { r.resume(); res(r.statusCode); }); q.end(body); });
  assert.equal(await status({ path: "/api/state", headers: { host: "evil.example", "x-lumen-token": "test-token-123456" } }), 403);
  assert.equal(await status({ path: "/api/persona", method: "PUT", headers: { origin: "http://evil.example", "x-lumen-token": "test-token-123456" } }, "{}"), 403);
});

test("websocket requires auth", async () => {
  const { default: WebSocket } = await import("ws");
  const code = await new Promise((res) => { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); ws.on("unexpected-response", (q, r) => res(r.statusCode)); ws.on("open", () => { ws.close(); res(101); }); });
  assert.equal(code, 401);
  const ready = await new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: "lumen_session=test-token-123456" } });
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", client: "dashboard", version: "t" })));
    ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.type === "ready") { ws.close(); res(m); } });
    ws.on("error", rej);
  });
  assert.ok(ready.sessionId);
});
