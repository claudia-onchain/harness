// End-to-end against the mock: a watch run scans, judges, (maybe) renders and delivers; everything is metered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startMockGrok } from "./mock-grok.js";
import { tmpHome } from "./helpers.js";
import { createGrok } from "../src/grok/responses.js";
import { createImagine } from "../src/grok/imagine.js";
import { openStore } from "../src/core/store.js";
import { createBudget, BudgetError } from "../src/core/budget.js";
import { metered, deliver, routineCommand, whyHtml, costHtml } from "../src/wire.js";
import { runWatch } from "../src/routines/watch.js";
import { runBrief } from "../src/routines/brief.js";
import { scanWindow, canonicalX } from "../src/sensors/x.js";

const silentLog = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLog; } };
// The fixture posts are dated 2026-10-13; a watch scans from its last run's day, so pin that day to keep them in the window.
const FIXTURE_DAY = "2026-10-13T00:00:00Z";
const config = { model: { scan: "grok-4.3", judge: "grok-4.7", image: "grok-imagine-image-2.0", video: "grok-imagine-video-1.5-lite" }, caps: { runUsd: 0.5, dayUsd: 5 }, telegram: { chatId: "1" } };

function harness(mock, { caps = config.caps } = {}) {
  const store = openStore(":memory:");
  const budget = createBudget({ store, caps });
  const grok = createGrok({ apiKey: "test", baseUrl: mock.url });
  const imagine = createImagine({ apiKey: "test", baseUrl: mock.url, imagePollMs: 1, videoPollMs: 1 });
  const sent = [];
  const rt = { store, budget, grok, imagine, config, log: silentLog, keys: { has: () => true, get: () => "test" }, telegram: null, print: (s) => sent.push({ console: s }) };
  return { rt, store, budget, sent };
}

test("watch run: scan → judge → deliver, every response metered and replayable", async (t) => {
  tmpHome(t);
  const mock = await startMockGrok({ port: 0 });
  t.after(() => mock.close());
  const { rt, store, sent } = harness(mock);
  const routine = store.routines.insert({ kind: "watch", name: "Solana", config: { symbols: ["SOL"], keywords: ["solana"], handles: ["solana"] }, everyMin: 15, chatId: "1", capUsdRun: 0.5 });
  const run = store.runs.start({ routineId: routine.id });
  const m = metered(rt, { routineId: routine.id, runId: run.id, runCapUsd: 0.5 });
  const ctx = { run, store, budget: rt.budget, log: silentLog, config, grok: m.grok, imagine: m.imagine, send: (c, media, cap) => deliver(rt, c, media, cap) };
  const result = await runWatch({ ...routine, last_run_at: FIXTURE_DAY }, ctx);
  const rows = store.responses.byRun(run.id);
  assert.ok(rows.length >= 1, "scan response stored for replay");
  assert.ok(rows.every((r) => r.cost_ticks > 0), "cost ticks recorded");
  assert.ok(store.costs.today(routine.id).usd > 0, "budget charged");
  const xBodies = mock.calls.map((c) => c.body).filter((b) => b?.tools?.some((x) => x.type === "x_search"));
  assert.ok(xBodies.length >= 1, "x_search tool sent");
  assert.ok(xBodies[0].tools[0].from_date && xBodies[0].tools[0].to_date, "date window always set");
  assert.equal(xBodies[0].max_turns, 2);
  if (result.alert) {
    assert.ok(rows.length >= 3, "scan + judge + image");
    assert.ok(sent.length === 1 && /pulse why/.test(sent[0].console), "delivered with a why-id");
    assert.ok(whyHtml(rt, result.alert.id).includes(result.alert.headline));
    assert.ok(result.alert.posts.every((p) => canonicalX(p.url)), "only x.com posts cited");
  } else {
    assert.ok(["nothing new", "judge: no alert"].includes(result.reason));
  }
  // Nothing hallucinated: every post the scan kept was cited by the mock.
  assert.ok(result.posts <= 8);
  assert.ok(costHtml(rt).includes("Spend"));
});

test("watch run stops at the run cap but keeps what it has", async (t) => {
  tmpHome(t);
  const mock = await startMockGrok({ port: 0, costTicks: 4_000_000_000 }); // $0.40 per response
  t.after(() => mock.close());
  const { rt, store } = harness(mock);
  const routine = store.routines.insert({ kind: "watch", name: "SOL", config: { symbols: ["SOL"] }, everyMin: 15, chatId: "1" });
  const run = store.runs.start({ routineId: routine.id });
  const m = metered(rt, { routineId: routine.id, runId: run.id, runCapUsd: 0.5 });
  const ctx = { run, store, budget: rt.budget, log: silentLog, config, grok: m.grok, imagine: m.imagine, send: async () => {} };
  await assert.rejects(() => runWatch({ ...routine, last_run_at: FIXTURE_DAY }, ctx), (e) => e instanceof BudgetError && e.scope === "run");
  assert.ok(store.responses.byRun(run.id).length >= 1, "the response that crossed the cap is still stored");
  assert.ok(store.costs.today(routine.id).usd >= 0.4);
});

test("brief run composes with x_search + web_search and delivers text", async (t) => {
  tmpHome(t);
  const mock = await startMockGrok({ port: 0 });
  t.after(() => mock.close());
  const { rt, store, sent } = harness(mock);
  const routine = store.routines.insert({ kind: "brief", name: "Morning", config: { topics: ["AI agents", "SOL"], symbols: ["SOL"] }, atUtc: "07:30", chatId: "1" });
  const run = store.runs.start({ routineId: routine.id });
  const m = metered(rt, { routineId: routine.id, runId: run.id });
  const ctx = { run, store, budget: rt.budget, log: silentLog, config, grok: m.grok, imagine: m.imagine, send: (c, media, cap) => deliver(rt, c, media, cap) };
  const r = await runBrief(routine, ctx);
  assert.ok(r.chars > 0);
  const body = mock.calls.map((c) => c.body).find((b) => b?.tools?.some((x) => x.type === "web_search"));
  assert.ok(body, "web_search requested");
  assert.ok(sent.length >= 1);
  assert.equal(store.alerts.list({ routineId: routine.id }).length, 1);
});

test("routine commands from Telegram mirror the CLI", (t) => {
  tmpHome(t);
  const store = openStore(":memory:");
  const rt = { store, config, log: silentLog };
  assert.match(routineCommand(rt, "watch", ["add", "Sol", "--symbols", "SOL,HYPE", "--every", "30m", "--cap", "0.2"], "42"), /watching/);
  const r = store.routines.list({ kind: "watch" })[0];
  assert.deepEqual(r.config.symbols, ["SOL", "HYPE"]);
  assert.equal(r.every_min, 30);
  assert.equal(r.chat_id, "42");
  assert.equal(r.cap_usd_run, 0.2);
  assert.match(routineCommand(rt, "watch", ["pause", r.id]), /⏸/);
  assert.equal(store.routines.get(r.id).enabled, false);
  assert.match(routineCommand(rt, "brief", ["add", "AM", "--topics", "a, b", "--at", "7:30"]), /daily at 07:30/);
  assert.match(routineCommand(rt, "watch", ["add", "nothing"]), /at least one/);
  assert.match(routineCommand(rt, "watch", ["rm", "nope"]), /no watch routine/);
});

test("scan window: from last run (or 6 h back) to tomorrow, exclusive", () => {
  const now = Date.parse("2026-10-14T10:00:00Z");
  assert.deepEqual(scanWindow({ now, lastRunAt: Date.parse("2026-10-13T23:50:00Z") }), { fromDate: "2026-10-13", toDate: "2026-10-15" });
  assert.deepEqual(scanWindow({ now, lastRunAt: null }), { fromDate: "2026-10-14", toDate: "2026-10-15" });
});
