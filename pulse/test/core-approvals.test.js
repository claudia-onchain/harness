import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/core/store.js";
import { createApprovals } from "../src/core/approvals.js";
import { tick } from "./helpers.js";

test("request resolves on decide; onRequest sees the persisted row", async () => {
  const store = openStore(":memory:");
  const posted = [];
  const ap = createApprovals({ store, onRequest: (a) => posted.push(a) });
  const p = ap.request({ kind: "post", payload: { text: "gm" } });
  await tick();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].id, p.id);
  assert.deepEqual(posted[0].payload, { text: "gm" });
  assert.equal(ap.listPending().length, 1);
  assert.deepEqual(ap.waiting, [p.id]);
  const row = ap.decide(p.id, "approve", "tj");
  assert.equal(row.status, "approved");
  const res = await p;
  assert.equal(res.approved, true);
  assert.equal(res.status, "approved");
  assert.equal(res.by, "tj");
  assert.equal(ap.listPending().length, 0);
  assert.equal(ap.decide(p.id, "deny", "x"), null, "a second decision is ignored");
  assert.throws(() => ap.decide(p.id, "maybe"), /bad decision/);
  store.close();
});

test("deny and expiry resolve without rejecting", async () => {
  const store = openStore(":memory:");
  const ap = createApprovals({ store, ttlMs: 20 });
  const d = ap.request({ kind: "spend", payload: { usd: 1 } });
  ap.decide(d.id, "deny", "tj");
  assert.equal((await d).approved, false);
  const e = ap.request({ kind: "spend" });
  const res = await e;
  assert.equal(res.status, "expired");
  assert.equal(store.approvals.get(e.id).status, "expired");
  store.close();
});

test("sweep expires rows left over by a previous process and settles waiting promises", async () => {
  const store = openStore(":memory:");
  store.approvals.create({ kind: "post", expiresAt: new Date(Date.now() - 1000) });
  let t = Date.now();
  const ap = createApprovals({ store, now: () => new Date(t), ttlMs: 60_000 });
  const p = ap.request({ kind: "post" });
  t += 61_000;
  const ids = ap.sweep();
  assert.equal(ids.length, 2);
  assert.equal((await p).status, "expired");
  assert.equal(ap.listPending().length, 0);
  ap.start(1000); ap.stop();
  store.close();
});

test("onRequest failures are logged, not thrown", async () => {
  const store = openStore(":memory:");
  const warned = [];
  const ap = createApprovals({ store, onRequest: () => { throw new Error("tg down"); }, log: { warn: (m, e) => warned.push([m, e.message]) } });
  const p = ap.request({ kind: "post" });
  await tick();
  assert.deepEqual(warned, [["approval.notify.fail", "tg down"]]);
  ap.decide(p.id, "approve");
  assert.equal((await p).approved, true);
  assert.throws(() => ap.request({}), /kind/);
  store.close();
});
