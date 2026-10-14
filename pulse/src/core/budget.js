// Spend caps enforced from what xAI actually charged (usage.cost_in_usd_ticks), never from a price table.
// Three scopes: run (cap_usd_run or caps.runUsd), routine-day (cap_usd_day) and global-day (caps.dayUsd).
// `meter` records the spend FIRST and throws afterwards, so a run that crosses its cap still keeps its receipts.
import { ticksToUsd, usdToTicks, dayOf } from "./store.js";

export class BudgetError extends Error {
  constructor({ scope, spentUsd, capUsd, routineId = null, runId = null }) {
    super(`budget exceeded (${scope}): spent $${spentUsd.toFixed(4)} of $${capUsd.toFixed(2)}`);
    this.name = "BudgetError";
    this.code = "budget_exceeded";
    Object.assign(this, { scope, spentUsd, capUsd, routineId, runId });
  }
}

/** Pull ticks out of whatever usage shape the Grok client hands back. */
export function ticksOf(usage) {
  if (usage == null) return 0;
  if (typeof usage === "number") return usage;
  const t = usage.costTicks ?? usage.cost_in_usd_ticks ?? usage.cost_ticks ?? (usage.costUsd != null ? usdToTicks(usage.costUsd) : 0);
  return Math.max(0, Math.round(Number(t) || 0));
}

export function createBudget({ store, caps = {}, runCapUsd = null, now = () => new Date() } = {}) {
  const globalDay = Number(caps.dayUsd ?? 5);
  const defaultRun = Number(runCapUsd ?? caps.runUsd ?? 0.4);
  const routineOf = (id) => (id ? store.routines.get(id) : null);
  const dayCapFor = (rt) => (rt?.cap_usd_day != null ? Number(rt.cap_usd_day) : globalDay);
  const runCapFor = (rt, override) => Number(override ?? rt?.cap_usd_run ?? defaultRun);

  function spentToday(routineId) {
    const day = dayOf(now());
    return { day, routine: ticksToUsd(store.costs.today(routineId, day).ticks), global: ticksToUsd(store.costs.today(null, day).ticks) };
  }

  /** Throws BudgetError when today's routine or global spend already meets its cap. Returns the headroom. */
  function check(routineId) {
    const rt = routineOf(routineId);
    const s = spentToday(routineId);
    if (s.global >= globalDay) throw new BudgetError({ scope: "day", spentUsd: s.global, capUsd: globalDay, routineId });
    const rcap = dayCapFor(rt);
    if (routineId && s.routine >= rcap) throw new BudgetError({ scope: "day", spentUsd: s.routine, capUsd: rcap, routineId });
    return remaining(routineId);
  }

  function remaining(routineId, runId = null, runCap = null) {
    const rt = routineOf(routineId);
    const s = spentToday(routineId);
    const out = { dayUsd: Math.max(0, Math.min(globalDay - s.global, routineId ? dayCapFor(rt) - s.routine : Infinity)), globalDayUsd: Math.max(0, globalDay - s.global), spentDayUsd: s.routine, spentGlobalUsd: s.global };
    if (runId) {
      const cap = runCapFor(rt, runCap);
      const spent = ticksToUsd(store.runs.get(runId)?.cost_ticks || 0);
      out.runUsd = Math.max(0, cap - spent); out.spentRunUsd = spent; out.runCapUsd = cap;
    }
    return out;
  }

  /** True when an estimated extra spend would still fit every cap (the "estimate guard" before an expensive call). */
  function canSpend(routineId, estUsd, runId = null, runCap = null) {
    const r = remaining(routineId, runId, runCap);
    return estUsd <= r.dayUsd && (runId ? estUsd <= r.runUsd : true);
  }

  /**
   * Record a response's cost against the routine-day rollup and the run, then enforce. Throws BudgetError
   * ({ scope: "run" | "day", spentUsd, capUsd }) once the run, routine-day or global-day cap is reached.
   */
  function meter(routineId, runId, usage, { runCapUsd: runCap } = {}) {
    const rt = routineOf(routineId);
    const ticks = ticksOf(usage);
    const day = dayOf(now());
    store.costs.addTicks(day, routineId || "_", ticks);
    let runTicks = 0;
    if (runId) runTicks = store.runs.addTicks(runId, ticks);
    const s = spentToday(routineId);
    const cap = runCapFor(rt, runCap);
    const spentRun = ticksToUsd(runTicks);
    if (runId && spentRun >= cap) throw new BudgetError({ scope: "run", spentUsd: spentRun, capUsd: cap, routineId, runId });
    if (s.global >= globalDay) throw new BudgetError({ scope: "day", spentUsd: s.global, capUsd: globalDay, routineId, runId });
    const rcap = dayCapFor(rt);
    if (routineId && s.routine >= rcap) throw new BudgetError({ scope: "day", spentUsd: s.routine, capUsd: rcap, routineId, runId });
    return { ticks, usd: ticksToUsd(ticks), remainingRunUsd: runId ? cap - spentRun : null, remainingDayUsd: Math.min(globalDay - s.global, routineId ? rcap - s.routine : Infinity), spentRunUsd: spentRun, spentDayUsd: s.routine, spentGlobalUsd: s.global };
  }

  /** Bind routine + run once so a routine body can just call `b.meter(resp.usage)`. */
  function forRun(routineId, runId, opts = {}) {
    return {
      meter: (usage) => meter(routineId, runId, usage, opts),
      remaining: () => remaining(routineId, runId, opts.runCapUsd),
      canSpend: (estUsd) => canSpend(routineId, estUsd, runId, opts.runCapUsd),
      check: () => check(routineId),
    };
  }

  return { check, meter, remaining, canSpend, forRun, caps: { runUsd: defaultRun, dayUsd: globalDay } };
}
