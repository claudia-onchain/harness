import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpHome } from "./helpers.js";
import { openStore, uid, ticksToUsd, usdToTicks, dayOf, TICKS_PER_USD } from "../src/core/store.js";

test("uid: prefixed, short, unique, no confusable chars", () => {
  const a = uid("rt"), b = uid("rt");
  assert.match(a, /^rt_[a-z2-9]{8}$/);
  assert.notEqual(a, b);
  assert.ok(!/[0ol1]/.test(a.slice(3)));
});

test("ticks: 1e10 per USD, integers stay exact well past $1000", () => {
  assert.equal(TICKS_PER_USD, 1e10);
  assert.equal(ticksToUsd(usdToTicks(0.4)), 0.4);
  assert.ok(usdToTicks(1000) < Number.MAX_SAFE_INTEGER);
  assert.equal(Number.isSafeInteger(usdToTicks(1000)), true);
});

test("store: schema, WAL on disk, migrations idempotent", (t) => {
  const home = tmpHome(t);
  const path = join(home, "pulse.db");
  const s = openStore(path);
  assert.equal(s.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.deepEqual(Object.keys(s.stats()), ["routines", "runs", "responses", "alerts", "posts_seen", "costs", "approvals"]);
  s.close();
  const again = openStore(path); // re-open runs migrations again without error
  assert.equal(again.stats().routines, 0);
  again.close();
});

test("routines: insert/get/list/update/enable/disable/touch/due/remove", () => {
  const s = openStore(":memory:");
  assert.throws(() => s.routines.insert({ kind: "watch", name: "x" }), /every_min or at_utc/);
  const rt = s.routines.insert({ kind: "watch", name: "SOL", config: { handles: ["a"], symbols: ["SOL"] }, everyMin: 15, chatId: -1001, capUsdRun: 0.4 });
  assert.match(rt.id, /^rt_/);
  assert.equal(rt.enabled, true);
  assert.equal(rt.chat_id, "-1001", "chat ids are stored as text");
  assert.deepEqual(rt.config.handles, ["a"]);
  assert.equal(rt.next_run_at, null);
  const br = s.routines.insert({ kind: "brief", name: "morning", config: { topics: ["AI"] }, atUtc: "07:30", nextRunAt: "2999-01-01T07:30:00.000Z" });
  assert.equal(s.routines.list().length, 2);
  assert.equal(s.routines.list({ kind: "brief" })[0].id, br.id);
  assert.deepEqual(s.routines.due().map((r) => r.id), [rt.id], "null next_run_at is due; far future is not");
  s.routines.disable(rt.id);
  assert.equal(s.routines.get(rt.id).enabled, false);
  assert.equal(s.routines.due().length, 0);
  assert.equal(s.routines.list({ enabledOnly: true }).length, 1);
  s.routines.enable(rt.id);
  s.routines.touch(rt.id, { nextRunAt: new Date("2999-01-01T00:00:00Z"), lastRunAt: "2020-01-01T00:00:00.000Z" });
  const r2 = s.routines.get(rt.id);
  assert.equal(r2.next_run_at, "2999-01-01T00:00:00.000Z");
  assert.equal(r2.last_run_at, "2020-01-01T00:00:00.000Z");
  assert.equal(s.routines.due("2999-01-01T00:00:01.000Z").length, 1);
  const r3 = s.routines.update(rt.id, { config: { keywords: ["sol"] }, everyMin: 30, name: "SOL2" });
  assert.deepEqual(r3.config, { handles: ["a"], symbols: ["SOL"], keywords: ["sol"] }, "config patch merges");
  assert.equal(r3.every_min, 30);
  assert.equal(r3.name, "SOL2");
  assert.equal(s.routines.update("nope", { name: "x" }), null);
  assert.equal(s.routines.remove(rt.id), true);
  assert.equal(s.routines.get(rt.id), null);
  s.close();
});

test("runs + responses: start/finish/addTicks/list/byRun/abortStale", () => {
  const s = openStore(":memory:");
  const rt = s.routines.insert({ kind: "watch", name: "x", everyMin: 5 });
  const run = s.runs.start({ routineId: rt.id });
  assert.equal(run.status, "running");
  assert.equal(s.runs.addTicks(run.id, 1_500_000), 1_500_000);
  assert.equal(s.runs.addTicks(run.id, 500_000), 2_000_000);
  const rs = s.responses.append({ runId: run.id, model: "grok-4.3", request: { input: "hi" }, response: { json: { posts: [] }, usage: { costTicks: 1_500_000 } }, costTicks: 1_500_000 });
  assert.match(rs.id, /^rs_/);
  assert.deepEqual(rs.request, { input: "hi" });
  assert.equal(s.responses.byRun(run.id).length, 1);
  assert.equal(s.responses.get(rs.id).model, "grok-4.3");
  const fin = s.runs.finish(run.id, { status: "ok", postsFetched: 12, toolCalls: [{ tool: "x_search" }] });
  assert.equal(fin.status, "ok");
  assert.equal(fin.posts_fetched, 12);
  assert.deepEqual(fin.tool_calls, [{ tool: "x_search" }]);
  assert.equal(fin.cost_ticks, 2_000_000, "finish without costTicks keeps the metered total");
  assert.ok(fin.ended_at >= fin.started_at);
  s.runs.start({ routineId: rt.id });
  assert.equal(s.runs.list({ routineId: rt.id }).length, 2);
  assert.equal(s.runs.abortStale(), 1);
  assert.equal(s.runs.list().filter((r) => r.status === "aborted").length, 1);
  s.close();
});

test("alerts: insert/get/list/markSent with parsed posts", () => {
  const s = openStore(":memory:");
  assert.throws(() => s.alerts.insert({ routineId: "r" }), /headline/);
  const a = s.alerts.insert({ routineId: "rt_1", runId: "run_1", severity: "high", headline: "SOL breaks out", summary: "s", sentiment: 0.7, velocity: 0.9, posts: [{ url: "https://x.com/a/status/1", why: "first" }] });
  assert.match(a.id, /^al_/);
  assert.equal(a.sent_at, null);
  assert.deepEqual(a.posts, [{ url: "https://x.com/a/status/1", why: "first" }]);
  s.alerts.insert({ routineId: "rt_2", headline: "other" });
  assert.equal(s.alerts.list().length, 2);
  assert.equal(s.alerts.list({ routineId: "rt_1" }).length, 1);
  assert.equal(s.alerts.list({ limit: 1 }).length, 1);
  const sent = s.alerts.markSent(a.id, { chatId: 42, mediaUrl: "https://img/1.png" });
  assert.ok(sent.sent_at);
  assert.equal(sent.chat_id, "42");
  assert.equal(sent.media_url, "https://img/1.png");
  assert.equal(s.alerts.list({ since: "2999-01-01" }).length, 0);
  s.close();
});

test("posts_seen: has/addMany dedupes across routines/filterNew/prune", () => {
  const s = openStore(":memory:");
  const fresh = s.postsSeen.addMany(["https://x.com/a/1", "https://x.com/a/2", "https://x.com/a/1", "", null], "rt_1");
  assert.deepEqual(fresh, ["https://x.com/a/1", "https://x.com/a/2"]);
  assert.equal(s.postsSeen.has("https://x.com/a/1"), true);
  assert.equal(s.postsSeen.has("https://x.com/a/9"), false);
  assert.deepEqual(s.postsSeen.addMany(["https://x.com/a/2", "https://x.com/a/3"], "rt_2"), ["https://x.com/a/3"]);
  assert.deepEqual(s.postsSeen.filterNew(["https://x.com/a/3", "https://x.com/a/4"]), ["https://x.com/a/4"]);
  assert.equal(s.postsSeen.count(), 3);
  assert.equal(s.postsSeen.prune(0), 3, "prune(0) deletes everything older than now");
  s.close();
});

test("costs: addTicks upserts, today per routine or global, byDay rollups", () => {
  const s = openStore(":memory:");
  const today = dayOf();
  const yday = dayOf(new Date(Date.now() - 86_400_000));
  s.costs.addTicks(today, "rt_1", 1_000_000_000); // $0.10
  s.costs.addTicks(today, "rt_1", 500_000_000);   // +$0.05
  s.costs.addTicks(today, "rt_2", 2_000_000_000); // $0.20
  s.costs.addTicks(yday, "rt_1", 10_000_000_000); // $1.00 yesterday
  assert.equal(s.costs.today("rt_1").usd, 0.15);
  assert.equal(s.costs.today().usd, 0.35);
  assert.equal(s.costs.today("rt_3").ticks, 0);
  const days = s.costs.byDay(2);
  assert.equal(days.length, 2);
  assert.equal(days[0].day, today);
  assert.equal(days[0].usd, 0.35);
  assert.equal(days[0].byRoutine[0].routine_id, "rt_2", "biggest spender first");
  assert.equal(days[1].usd, 1);
  assert.equal(s.costs.byDay(1).length, 1);
  assert.deepEqual(s.costs.byRoutine(today).map((r) => r.routine_id), ["rt_2", "rt_1"]);
  s.close();
});

test("approvals: create/listPending/decide once/expire", () => {
  const s = openStore(":memory:");
  const a = s.approvals.create({ kind: "post", payload: { text: "gm" }, expiresAt: new Date(Date.now() - 1000) });
  const b = s.approvals.create({ kind: "spend", payload: { usd: 1 } });
  assert.equal(a.status, "pending");
  assert.deepEqual(a.payload, { text: "gm" });
  assert.equal(s.approvals.listPending().length, 2);
  assert.deepEqual(s.approvals.expire(), [a.id]);
  assert.equal(s.approvals.get(a.id).status, "expired");
  assert.equal(s.approvals.decide(b.id, "approved", "tj").decided_by, "tj");
  assert.equal(s.approvals.decide(b.id, "denied", "tj"), null, "already decided");
  assert.equal(s.approvals.listPending().length, 0);
  s.close();
});
