// Approvals bus shared by the CLI prompt and the dashboard. Tools call request(); a human answers through
// whichever UI is attached (TUI prompt, dashboard button, `--yes` policy for non-money kinds).
// The agent itself can never resolve an approval: there is no tool that calls resolve().
import { EventEmitter } from "node:events";
import { id as newId } from "./util.js";

export class Approvals extends EventEmitter {
  constructor() {
    super();
    this.pending = new Map();
    this.uis = 0; // number of attached human interfaces
  }

  /** A UI (TUI or dashboard socket) says it can answer approvals. Returns a detach function. */
  attach() { this.uis++; return () => { this.uis = Math.max(0, this.uis - 1); }; }

  /**
   * Ask a human. kind: "tx" | "shell" | "media" | "write" | "question".
   * confirmText: when set (mainnet sends: "send"), the answer must equal it exactly.
   * Resolves to { approve, answer }. Rejects nothing: no UI / timeout -> { approve:false, reason }.
   */
  request({ kind, title, detail = "", options, confirmText, timeoutMs = 15 * 60_000, sessionId } = {}) {
    if (!this.uis) return Promise.resolve({ approve: false, reason: "no_ui", answer: null });
    const a = { id: newId("ap_"), kind, title: String(title || ""), detail: String(detail || ""), createdAt: new Date().toISOString(), ...(options?.length ? { options } : {}), ...(confirmText ? { confirmText } : {}), ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.resolve(a.id, { approve: false, reason: "timeout" }), timeoutMs);
      timer.unref?.();
      this.pending.set(a.id, { approval: a, resolve, timer });
      this.emit("request", a);
    });
  }

  /** Answer from a human UI. Returns false if unknown id. */
  resolve(id, { approve, answer = null, reason } = {}) {
    const p = this.pending.get(id);
    if (!p) return false;
    this.pending.delete(id);
    clearTimeout(p.timer);
    let ok = !!approve;
    if (ok && p.approval.confirmText && String(answer ?? "").trim().toLowerCase() !== p.approval.confirmText) { ok = false; reason = `confirmation text did not match "${p.approval.confirmText}"`; }
    p.resolve({ approve: ok, answer, ...(reason ? { reason } : {}) });
    this.emit("resolved", { id, approve: ok });
    return true;
  }

  list() { return [...this.pending.values()].map((p) => p.approval); }

  cancelAll(reason = "cancelled") { for (const id of [...this.pending.keys()]) this.resolve(id, { approve: false, reason }); }
}
