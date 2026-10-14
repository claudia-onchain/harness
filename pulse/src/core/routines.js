// Scheduler: every `tick()` runs the routines whose next_run_at has passed, one in-flight run per routine.
// A routine is either periodic (every_min) or daily at a UTC clock time (at_utc "HH:MM"). Runners are plain
// async functions `runners[kind](routine, ctx)`; the scheduler owns the run row, the clock and the error path.
import { nowIso } from "./store.js";

const MIN = 60_000;

/** Pure: when should `routine` run next, given `now`? `jitterMs` is a signed offset the caller already picked. */
export function computeNextRun(routine, now = new Date(), { jitterMs = 0 } = {}) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  let next;
  if (routine.at_utc) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(routine.at_utc));
    if (!m) throw new Error(`bad at_utc "${routine.at_utc}" (want HH:MM)`);
    const d = new Date(t);
    d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() <= t) d.setUTCDate(d.getUTCDate() + 1); // already passed today -> tomorrow, across month/year ends too
    next = d.getTime();
  } else {
    const every = Number(routine.every_min);
    if (!(every > 0)) throw new Error(`bad every_min "${routine.every_min}"`);
    next = t + every * MIN;
  }
  // Jitter never pulls a daily job before its clock time or an interval below half its period.
  const floor = routine.at_utc ? next : t + Math.max(MIN, (Number(routine.every_min) * MIN) / 2);
  return new Date(Math.max(floor, next + jitterMs));
}

export function createScheduler({ store, runners = {}, log, onError, now = () => new Date(), jitterMs = 10_000, random = Math.random } = {}) {
  const inflight = new Map(); // routineId -> Promise<run>
  let timer = null;
  const jitter = () => Math.round((random() * 2 - 1) * jitterMs);
  const lg = log || { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } };

  function schedule(routine, from = now()) {
    const next = computeNextRun(routine, from, { jitterMs: jitter() });
    store.routines.touch(routine.id, { nextRunAt: next });
    return next;
  }

  /** Launch one run. Resolves to the finished run row; never rejects (errors land in the row and onError). */
  function launch(routine, { manual = false } = {}) {
    if (inflight.has(routine.id)) return inflight.get(routine.id);
    const runner = runners[routine.kind];
    const run = store.runs.start({ routineId: routine.id, startedAt: now().toISOString() });
    // Advance next_run_at immediately so a long run is not re-picked by the next tick.
    if (!manual) schedule(routine, now());
    const rlog = lg.child ? lg.child({ routine: routine.id, run: run.id }) : lg;
    const ctl = new AbortController();
    const ctx = { run, store, log: rlog, signal: ctl.signal, manual, now };
    const p = (async () => {
      let status = "ok", error = null, result = null;
      try {
        if (!runner) throw new Error(`no runner registered for kind "${routine.kind}"`);
        rlog.info("run.start", { kind: routine.kind, name: routine.name });
        result = await runner(routine, ctx);
      } catch (e) {
        status = e?.name === "BudgetError" ? "budget_exceeded" : e?.name === "AbortError" ? "aborted" : "error";
        error = e?.message || String(e);
        rlog.error("run.fail", e);
        try { onError?.(e, { routine, run }); } catch { /* observer errors are not ours */ }
      }
      const fin = store.runs.finish(run.id, { status, error, postsFetched: result?.postsFetched, toolCalls: result?.toolCalls, costTicks: result?.costTicks });
      // last_run_at only moves on success: a failed window is re-scanned next time (posts_seen dedupes).
      if (status === "ok" || status === "budget_exceeded") store.routines.touch(routine.id, { lastRunAt: run.started_at });
      rlog.info("run.end", { status, costTicks: fin?.cost_ticks ?? 0, ms: Date.parse(fin.ended_at) - Date.parse(fin.started_at) });
      inflight.delete(routine.id);
      return { ...fin, result };
    })();
    inflight.set(routine.id, p);
    p.abort = () => ctl.abort();
    return p;
  }

  function tick() {
    const due = store.routines.due(now().toISOString());
    const started = [];
    for (const rt of due) if (!inflight.has(rt.id)) started.push(launch(rt));
    return started;
  }

  async function runNow(id) {
    const rt = store.routines.get(id);
    if (!rt) throw new Error(`no routine ${id}`);
    return launch(rt, { manual: true });
  }

  function start(intervalMs = 15_000) {
    if (timer) return;
    store.runs.abortStale();
    // Routines added while the daemon was down sit with next_run_at in the past: run them now, not all at once later.
    tick();
    timer = setInterval(() => { try { tick(); } catch (e) { lg.error("tick.fail", e); } }, intervalMs);
  }

  async function stop({ wait = true } = {}) {
    if (timer) { clearInterval(timer); timer = null; }
    if (wait) await Promise.allSettled([...inflight.values()]);
  }

  return {
    tick, runNow, start, stop, schedule, computeNextRun,
    get running() { return [...inflight.keys()]; },
    isRunning: (id) => inflight.has(id),
    get active() { return !!timer; },
    /** `wait()` resolves when every in-flight run has finished (tests, graceful shutdown). */
    wait: () => Promise.allSettled([...inflight.values()]),
    runners,
  };
}

export { nowIso };
