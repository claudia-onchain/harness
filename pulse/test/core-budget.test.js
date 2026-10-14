import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, usdToTicks } from "../src/core/store.js";
import { createBudget, BudgetError, ticksOf } from "../src/core/budget.js";

const setup = () => {
  const store = openStore(":memory:");
  const rt = store.routines.insert({ kind: "watch", name: "x", everyMin: 5, capUsdRun: 0.1, capUsdDay: 0.5 });
  const run = store.runs.start({ routineId: rt.id });
  const budget = createBudget({ store, caps: { runUsd: 0.4, dayUsd: 1 } });
  return { store, rt, run, budget };
};

test("ticksOf accepts every usage shape the Grok client might return", () => {
  assert.equal(ticksOf({ costTicks: 5 }), 5);
  assert.equal(ticksOf({ cost_in_usd_ticks: 7 }), 7);
  assert.equal(ticksOf({ costUsd: 0.5 }), 5e9);
  assert.equal(ticksOf(9), 9);
  assert.equal(ticksOf(null), 0);
  assert.equal(ticksOf({ costTicks: -3 }), 0);
});

test("meter records the spend, then throws on the run cap with scope/spent/cap", () => {
  const { store, rt, run, budget } = setup();
  const r1 = budget.meter(rt.id, run.id, { costTicks: usdToTicks(0.04) });
  assert.equal(r1.usd, 0.04);
  assert.ok(Math.abs(r1.remainingRunUsd - 0.06) < 1e-9);
  assert.ok(Math.abs(r1.remainingDayUsd - 0.46) < 1e-9);
  let err;
  try { budget.meter(rt.id, run.id, { costTicks: usdToTicks(0.07) }); } catch (e) { err = e; }
  assert.ok(err instanceof BudgetError);
  assert.equal(err.name, "BudgetError");
  assert.equal(err.scope, "run");
  assert.ok(Math.abs(err.spentUsd - 0.11) < 1e-9);
  assert.equal(err.capUsd, 0.1);
  assert.equal(err.runId, run.id);
  assert.equal(store.runs.get(run.id).cost_ticks, usdToTicks(0.11), "the spend that crossed the cap is still recorded");
  assert.equal(store.costs.today(rt.id).usd, 0.11);
});

test("check and meter enforce the routine-day cap, then the global-day cap", () => {
  const { store, rt, budget } = setup();
  assert.ok(budget.check(rt.id));
  const run = store.runs.start({ routineId: rt.id });
  // spend 0.5 across runs with a generous per-call run cap override
  budget.meter(rt.id, run.id, { costTicks: usdToTicks(0.3) }, { runCapUsd: 10 });
  assert.throws(() => budget.meter(rt.id, run.id, { costTicks: usdToTicks(0.2) }, { runCapUsd: 10 }), (e) => e.scope === "day" && e.capUsd === 0.5);
  assert.throws(() => budget.check(rt.id), (e) => e instanceof BudgetError && e.scope === "day");
  // another routine with no own cap falls back to the global day cap (1.0): 0.5 already spent globally
  const other = store.routines.insert({ kind: "watch", name: "y", everyMin: 5 });
  const r = budget.remaining(other.id);
  assert.ok(Math.abs(r.dayUsd - 0.5) < 1e-9);
  assert.ok(Math.abs(r.globalDayUsd - 0.5) < 1e-9);
  assert.equal(budget.canSpend(other.id, 0.4), true);
  assert.equal(budget.canSpend(other.id, 0.6), false);
  const run2 = store.runs.start({ routineId: other.id });
  assert.throws(() => budget.meter(other.id, run2.id, { costTicks: usdToTicks(0.5) }, { runCapUsd: 10 }), (e) => e.scope === "day" && e.capUsd === 1);
  assert.throws(() => budget.check(other.id), (e) => e.scope === "day" && e.capUsd === 1);
  assert.throws(() => budget.check(null), /budget exceeded \(day\)/, "global check without a routine");
});

test("forRun binds routine and run; remaining reports the run cap", () => {
  const { rt, run, budget } = setup();
  const b = budget.forRun(rt.id, run.id);
  b.meter({ costTicks: usdToTicks(0.02) });
  const r = b.remaining();
  assert.equal(r.runCapUsd, 0.1);
  assert.ok(Math.abs(r.runUsd - 0.08) < 1e-9);
  assert.equal(b.canSpend(0.05), true);
  assert.equal(b.canSpend(0.09), false);
  assert.deepEqual(budget.caps, { runUsd: 0.4, dayUsd: 1 });
});

test("routine with no caps uses the configured defaults; the exact cap value trips", () => {
  const store = openStore(":memory:");
  const rt = store.routines.insert({ kind: "brief", name: "m", atUtc: "07:00" });
  const run = store.runs.start({ routineId: rt.id });
  const budget = createBudget({ store, caps: { runUsd: 0.4, dayUsd: 5 } });
  budget.meter(rt.id, run.id, { costTicks: usdToTicks(0.39) });
  assert.throws(() => budget.meter(rt.id, run.id, { costTicks: usdToTicks(0.01) }), (e) => e.scope === "run" && e.capUsd === 0.4);
});
