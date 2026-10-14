import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/core/store.js";
import { computeNextRun, createScheduler } from "../src/core/routines.js";
import { BudgetError } from "../src/core/budget.js";
import { tick } from "./helpers.js";

const iso = (s) => new Date(s).toISOString();

test("computeNextRun: interval routines", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  assert.equal(computeNextRun({ every_min: 15 }, now).toISOString(), iso("2026-10-14T10:15:00Z"));
  assert.equal(computeNextRun({ every_min: 15 }, now, { jitterMs: 5000 }).toISOString(), iso("2026-10-14T10:15:05Z"));
  assert.equal(computeNextRun({ every_min: 15 }, now, { jitterMs: -5000 }).toISOString(), iso("2026-10-14T10:14:55Z"));
  assert.equal(computeNextRun({ every_min: 1 }, now, { jitterMs: -50_000 }).toISOString(), iso("2026-10-14T10:01:00Z"), "jitter never pulls below the floor");
  assert.throws(() => computeNextRun({ every_min: 0 }, now), /every_min/);
});

test("computeNextRun: daily at_utc, same day, across midnight, month and year ends", () => {
  assert.equal(computeNextRun({ at_utc: "07:30" }, new Date("2026-10-14T06:00:00Z")).toISOString(), iso("2026-10-14T07:30:00Z"));
  assert.equal(computeNextRun({ at_utc: "07:30" }, new Date("2026-10-14T07:30:00Z")).toISOString(), iso("2026-10-15T07:30:00Z"), "exactly on time means tomorrow");
  assert.equal(computeNextRun({ at_utc: "07:30" }, new Date("2026-10-14T23:59:59Z")).toISOString(), iso("2026-10-15T07:30:00Z"));
  assert.equal(computeNextRun({ at_utc: "23:59" }, new Date("2026-10-14T23:59:30Z")).toISOString(), iso("2026-10-15T23:59:00Z"));
  assert.equal(computeNextRun({ at_utc: "00:00" }, new Date("2026-10-31T12:00:00Z")).toISOString(), iso("2026-11-01T00:00:00Z"));
  assert.equal(computeNextRun({ at_utc: "7:05" }, new Date("2026-12-31T08:00:00Z")).toISOString(), iso("2027-01-01T07:05:00Z"));
  assert.equal(computeNextRun({ at_utc: "07:30" }, new Date("2026-10-14T06:00:00Z"), { jitterMs: -9000 }).toISOString(), iso("2026-10-14T07:30:00Z"), "never before the clock time");
  assert.equal(computeNextRun({ at_utc: "07:30" }, new Date("2026-10-14T06:00:00Z"), { jitterMs: 9000 }).toISOString(), iso("2026-10-14T07:30:09Z"));
  assert.throws(() => computeNextRun({ at_utc: "7h30" }), /at_utc/);
});

function fixture({ runners, now }) {
  const store = openStore(":memory:");
  const calls = [];
  const errors = [];
  const sched = createScheduler({ store, runners, onError: (e, ctx) => errors.push({ e, ctx }), now, jitterMs: 0 });
  return { store, sched, calls, errors };
}

test("tick runs due routines once, records the run and advances next_run_at", async () => {
  let t = new Date("2026-10-14T10:00:00Z");
  const seen = [];
  const { store, sched } = fixture({ now: () => t, runners: { watch: async (rt, ctx) => { seen.push({ rt: rt.id, run: ctx.run.id, hasLog: !!ctx.log, hasSignal: !!ctx.signal }); return { postsFetched: 3, costTicks: 100 }; } } });
  const rt = store.routines.insert({ kind: "watch", name: "a", everyMin: 15, nextRunAt: t.toISOString() });
  store.routines.insert({ kind: "watch", name: "later", everyMin: 15, nextRunAt: "2999-01-01T00:00:00.000Z" });
  store.routines.insert({ kind: "watch", name: "off", enabled: false, everyMin: 15 });
  const started = sched.tick();
  assert.equal(started.length, 1);
  assert.deepEqual(sched.running, [rt.id]);
  assert.equal(sched.tick().length, 0, "no double start while in flight");
  const run = await started[0];
  assert.equal(run.status, "ok");
  assert.equal(run.posts_fetched, 3);
  assert.equal(run.cost_ticks, 100);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].hasLog && seen[0].hasSignal);
  const after = store.routines.get(rt.id);
  assert.equal(after.next_run_at, "2026-10-14T10:15:00.000Z");
  assert.equal(after.last_run_at, run.started_at);
  assert.equal(sched.running.length, 0);
  assert.equal(sched.tick().length, 0, "not due again yet");
  t = new Date("2026-10-14T10:15:01Z");
  assert.equal(sched.tick().length, 1);
  await sched.wait();
  assert.equal(seen.length, 2);
  store.close();
});

test("errors and budget stops land in the run row and onError; last_run_at only moves on success", async () => {
  const t = new Date("2026-10-14T10:00:00Z");
  const { store, sched, errors } = fixture({ now: () => t, runners: {
    boom: async () => { throw new Error("kaput"); },
    broke: async () => { throw new BudgetError({ scope: "run", spentUsd: 0.5, capUsd: 0.4 }); },
  } });
  const a = store.routines.insert({ kind: "boom", name: "a", everyMin: 5 });
  const b = store.routines.insert({ kind: "broke", name: "b", everyMin: 5 });
  const c = store.routines.insert({ kind: "unknown", name: "c", everyMin: 5 });
  const runs = await Promise.all(sched.tick());
  const by = Object.fromEntries(runs.map((r) => [r.routine_id, r]));
  assert.equal(by[a.id].status, "error");
  assert.equal(by[a.id].error, "kaput");
  assert.equal(by[b.id].status, "budget_exceeded");
  assert.equal(by[c.id].status, "error");
  assert.match(by[c.id].error, /no runner registered/);
  assert.equal(errors.length, 3);
  assert.equal(store.routines.get(a.id).last_run_at, null, "failed window gets re-scanned");
  assert.equal(store.routines.get(b.id).last_run_at, by[b.id].started_at, "budget stop still counts as a completed window");
  assert.ok(store.routines.get(a.id).next_run_at > t.toISOString(), "still rescheduled after failure");
  store.close();
});

test("runNow runs a routine immediately without touching its schedule; concurrent calls share the run", async () => {
  const t = new Date("2026-10-14T10:00:00Z");
  let n = 0;
  const { store, sched } = fixture({ now: () => t, runners: { watch: async () => { n++; await tick(20); return {}; } } });
  const rt = store.routines.insert({ kind: "watch", name: "a", everyMin: 15, nextRunAt: "2999-01-01T00:00:00.000Z" });
  const p1 = sched.runNow(rt.id), p2 = sched.runNow(rt.id);
  assert.equal(sched.isRunning(rt.id), true);
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.id, r2.id);
  assert.equal(n, 1);
  assert.equal(store.routines.get(rt.id).next_run_at, "2999-01-01T00:00:00.000Z");
  await assert.rejects(sched.runNow("rt_nope"), /no routine/);
  store.close();
});

test("start/stop: aborts stale runs, ticks immediately, then on the interval", async () => {
  let t = new Date("2026-10-14T10:00:00Z");
  let n = 0;
  const { store, sched } = fixture({ now: () => t, runners: { watch: async () => { n++; return {}; } } });
  store.runs.start({ routineId: "ghost" });
  store.routines.insert({ kind: "watch", name: "a", everyMin: 1 });
  sched.start(10);
  assert.equal(sched.active, true);
  await tick(5);
  assert.equal(n, 1, "runs on start");
  assert.equal(store.runs.get(store.runs.list().find((r) => r.routine_id === "ghost").id).status, "aborted");
  t = new Date("2026-10-14T10:01:01Z");
  await tick(40);
  assert.equal(n, 2, "picked up by the interval tick");
  await sched.stop();
  assert.equal(sched.active, false);
  store.close();
});

test("jitter is applied and bounded", () => {
  const t = new Date("2026-10-14T10:00:00Z");
  const store = openStore(":memory:");
  const sched = createScheduler({ store, runners: {}, now: () => t, jitterMs: 10_000, random: () => 1 });
  const rt = store.routines.insert({ kind: "watch", name: "a", everyMin: 15 });
  const next = sched.schedule(rt);
  assert.equal(next.toISOString(), "2026-10-14T10:15:10.000Z");
  const sched2 = createScheduler({ store, runners: {}, now: () => t, jitterMs: 10_000, random: () => 0 });
  assert.equal(sched2.schedule(rt).toISOString(), "2026-10-14T10:14:50.000Z");
  store.close();
});
