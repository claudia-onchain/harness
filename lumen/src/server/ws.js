// WebSocket hub: forwards runtime events to every dashboard, handles chat/stop/approval and the takeover channel.
import { WebSocketServer } from "ws";
import { id as newId } from "../core/util.js";
import { apiState } from "./routes.js";
import { VERSION } from "../version.js";

const UI_TIMEOUT_MS = 15_000;
const FORWARD_SKIP = new Set(["usage"]); // high-frequency internals the contract doesn't define

export function createHub(rt) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  const clients = new Set();
  const pending = new Map(); // ui op id -> { resolve, timer, ws }
  const connectWaiters = [];

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg) => { for (const c of clients) send(c, msg); };

  const onEvent = (ev) => {
    if (FORWARD_SKIP.has(ev.type)) return;
    if (ev.type === "delta") return broadcast({ type: "delta", sessionId: ev.sessionId, id: ev.id, text: ev.text });
    broadcast(ev);
  };
  rt.on("event", onEvent);

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.ui = null;
    ws.detachApprovals = rt.approvals.attach();
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("message", (data) => {
      let m;
      try { m = JSON.parse(String(data)); } catch { return send(ws, { type: "error", message: "Invalid JSON frame" }); }
      handle(ws, m).catch((e) => send(ws, { type: "error", sessionId: m.sessionId, message: e.message }));
    });
    ws.on("close", () => {
      clients.delete(ws);
      ws.detachApprovals?.();
      for (const [id, p] of pending) if (p.ws === ws) { clearTimeout(p.timer); pending.delete(id); p.resolve({ ok: false, error: "dashboard_closed" }); }
    });
  });

  async function handle(ws, m) {
    switch (m.type) {
      case "hello": {
        ws.client = m.client || "dashboard";
        const s = rt.session();
        send(ws, { type: "ready", sessionId: s.id, state: apiState(rt) });
        for (const a of rt.approvals.list()) send(ws, { type: "approval_request", ...a });
        if ((rt.updates || []).some((u) => u.outdated)) send(ws, { type: "notice", level: "warn", text: `Updates available: ${rt.updates.filter((u) => u.outdated).map((u) => `${u.name} ${u.current} → ${u.latest}`).join(", ")}. Run \`lumen update\`.` });
        return;
      }
      case "chat": {
        const text = String(m.text || "");
        const extra = (m.attachments || []).length ? `\n\n(attachments: ${m.attachments.join(", ")})` : "";
        rt.send(text + extra, { source: "dashboard", images: m.images || [], sessionId: m.sessionId || rt.activeId }).catch((e) => send(ws, { type: "error", message: e.message }));
        return;
      }
      case "stop":
        rt.abort(m.sessionId || rt.activeId);
        for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.resolve({ ok: false, error: "user_took_over" }); }
        return;
      case "approval": rt.approvals.resolve(m.id, { approve: !!m.approve, answer: m.answer ?? null }); return;
      case "ui_hello":
        ws.ui = { route: m.route, targets: m.targets || [], commands: m.commands || [], at: Date.now() };
        while (connectWaiters.length) connectWaiters.shift()(ws);
        return;
      case "ui_result": {
        const p = pending.get(m.id);
        if (p) { clearTimeout(p.timer); pending.delete(m.id); p.resolve({ ok: !!m.ok, result: m.result, error: m.error }); }
        return;
      }
      case "ping": send(ws, { type: "pong", t: Date.now() }); return;
      default: send(ws, { type: "error", message: `Unknown frame type ${m.type}` });
    }
  }

  /** The dashboard that most recently said ui_hello. */
  const uiClient = () => [...clients].filter((c) => c.ui && c.readyState === 1).sort((a, b) => b.ui.at - a.ui.at)[0] || null;

  function waitForUi(ms = 12_000) {
    const c = uiClient();
    if (c) return Promise.resolve(c);
    return new Promise((resolve) => {
      const t = setTimeout(() => { const i = connectWaiters.indexOf(done); if (i >= 0) connectWaiters.splice(i, 1); resolve(null); }, ms);
      const done = (ws) => { clearTimeout(t); resolve(ws); };
      connectWaiters.push(done);
    });
  }

  /** Send a takeover op and wait for ui_result. */
  async function uiOp(op, args = {}, { signal } = {}) {
    const ws = await waitForUi(op === "snapshot" ? 12_000 : 6_000);
    if (!ws) return { ok: false, error: "No dashboard is connected. Use the dashboard tool with action open first." };
    const id = newId("ui_");
    rt.emit("event", { type: "agent_status", state: "driving", detail: op });
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve(op === "snapshot" && ws.ui ? { ok: true, result: { ...ws.ui, summary: "(dashboard did not answer; last known state)" } } : { ok: false, error: "timeout" }); }, UI_TIMEOUT_MS);
      pending.set(id, { resolve, timer, ws });
      signal?.addEventListener?.("abort", () => { if (pending.has(id)) { clearTimeout(timer); pending.delete(id); resolve({ ok: false, error: "stopped" }); } }, { once: true });
      send(ws, { type: "ui", id, op, ...args });
    });
    return result;
  }

  const heartbeat = setInterval(() => { for (const c of clients) { if (!c.isAlive) { c.terminate(); continue; } c.isAlive = false; try { c.ping(); } catch { /* closed */ } } }, 30_000);
  heartbeat.unref();

  return {
    wss, broadcast, uiOp, waitForUi, clientCount: () => clients.size, version: VERSION,
    close() { clearInterval(heartbeat); rt.off("event", onEvent); for (const c of clients) c.terminate(); wss.close(); },
  };
}
