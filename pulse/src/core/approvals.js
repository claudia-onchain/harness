// Approval queue for anything that posts publicly or exceeds a cap. `request()` persists a row and returns a
// promise that `decide()` settles; `onRequest(approval)` lets a channel (Telegram) post inline buttons.
// Pending rows survive a restart in the store (so `/why` history is complete) but their promises do not:
// after a restart they expire on the next sweep and the routine that asked simply re-asks.
export function createApprovals({ store, onRequest, ttlMs = 15 * 60_000, now = () => new Date(), log } = {}) {
  const pending = new Map(); // id -> { resolve, timer }
  let sweeper = null;

  function settle(id, status, by) {
    const row = store.approvals.decide(id, status, by);
    const p = pending.get(id);
    if (p) { clearTimeout(p.timer); pending.delete(id); p.resolve({ id, status, approved: status === "approved", by: by ?? null, approval: row }); }
    return row;
  }

  /** Ask a human. Resolves { id, status, approved, by, approval }; never rejects (expiry => status "expired"). */
  function request({ kind, payload = null, ttlMs: ttl = ttlMs } = {}) {
    if (!kind) throw new Error("approval needs a kind");
    const expiresAt = new Date(now().getTime() + ttl);
    const approval = store.approvals.create({ kind, payload, expiresAt });
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => settle(approval.id, "expired", "clock"), ttl);
      timer.unref?.();
      pending.set(approval.id, { resolve, timer });
    });
    Promise.resolve().then(() => onRequest?.(approval)).catch((e) => log?.warn?.("approval.notify.fail", e));
    promise.id = approval.id;
    return promise;
  }

  /** decision: "approve" | "deny". Returns the decided row, or null when the id is unknown or already decided. */
  function decide(id, decision, by = null) {
    const status = decision === "approve" || decision === "approved" ? "approved" : decision === "deny" || decision === "denied" ? "denied" : null;
    if (!status) throw new Error(`bad decision "${decision}" (approve | deny)`);
    return settle(id, status, by);
  }

  function listPending() { return store.approvals.listPending(); }

  /** Expire overdue rows (including ones from a previous process). Returns the expired ids. */
  function sweep() {
    const ids = store.approvals.expire(now().toISOString());
    for (const id of ids) { const p = pending.get(id); if (p) { clearTimeout(p.timer); pending.delete(id); p.resolve({ id, status: "expired", approved: false, by: "clock", approval: store.approvals.get(id) }); } }
    return ids;
  }

  function start(intervalMs = 60_000) { if (!sweeper) { sweep(); sweeper = setInterval(sweep, intervalMs); sweeper.unref?.(); } }
  function stop() { if (sweeper) { clearInterval(sweeper); sweeper = null; } }

  return { request, decide, listPending, sweep, start, stop, get waiting() { return [...pending.keys()]; } };
}
