// The agent connection: one WebSocket (/ws) for chat, agent activity and the takeover channel.
// Reconnects with exponential backoff. Exposed as an external store (useSyncExternalStore).
import { useSyncExternalStore } from "react";
import { emitBus } from "../lib/api";
import { uid } from "../lib/store";
import type { AgentState, Approval, MediaJob, UiOp } from "../lib/types";

export type ToolItem = { kind: "tool"; id: string; name: string; label?: string; args?: unknown; state: "running" | "ok" | "error"; summary?: string; result?: unknown; startedAt: number; endedAt?: number };
export type Item =
  | { kind: "user"; id: string; text: string; images?: string[]; source?: string }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean }
  | { kind: "thinking"; id: string; text: string; streaming?: boolean }
  | ToolItem
  | { kind: "approval"; id: string; approval: Approval; answered?: string }
  | { kind: "error"; id: string; text: string }
  | { kind: "notice"; id: string; text: string; level?: "info" | "warn" }
  | { kind: "turn"; id: string; usage?: { input: number; output: number; costUsd: number }; model?: string };

export type Activity = { id: string; ts: number; name: string; label: string; state: "running" | "ok" | "error"; summary?: string };

type Session = { items: Item[]; busy: boolean };
export type AgentStore = {
  conn: "idle" | "connecting" | "open" | "closed";
  sessionId: string;
  sessions: Record<string, Session>;
  status: { state: AgentState; detail?: string };
  activity: Activity[];
  approvals: Approval[];
  media: Record<string, MediaJob>;
  spend: { input: number; output: number; costUsd: number };
  retryIn?: number;
};

let state: AgentStore = {
  conn: "idle",
  sessionId: "default",
  sessions: {},
  status: { state: "idle" },
  activity: [],
  approvals: [],
  media: {},
  spend: { input: 0, output: 0, costUsd: 0 },
};
const subs = new Set<() => void>();
const emit = () => { state = { ...state }; subs.forEach((f) => f()); };

const sess = (id: string): Session => state.sessions[id] ?? { items: [], busy: false };
function setItems(id: string, f: (items: Item[]) => Item[], patch: Partial<Session> = {}) {
  const s = sess(id);
  state.sessions = { ...state.sessions, [id]: { ...s, ...patch, items: f(s.items) } };
}
const closeStreams = (items: Item[]) => items.map((x) => ((x.kind === "assistant" || x.kind === "thinking") && x.streaming ? { ...x, streaming: false } : x));

let ws: WebSocket | null = null;
let retry = 0;
let wanted = false;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let uiHandler: ((op: UiOp) => void) | null = null;
const openHandlers = new Set<() => void>();

export function connect() {
  wanted = true;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  state.conn = "connecting";
  emit();
  let sock: WebSocket;
  try {
    sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    state.conn = "open";
    state.retryIn = undefined;
    emit();
    send({ type: "hello", client: "dashboard", version: "0.1.0" });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: "ping" }), 25000);
    openHandlers.forEach((f) => f());
  };
  sock.onmessage = (e) => {
    try { onMsg(JSON.parse(String(e.data))); } catch { /* ignore malformed frames */ }
  };
  let opened = false;
  sock.addEventListener("open", () => { opened = true; });
  sock.onclose = (e) => {
    if (ws === sock) ws = null;
    clearInterval(pingTimer);
    state.conn = "closed";
    if (!opened) { emit(); scheduleReconnect(); return; }
    for (const id of Object.keys(state.sessions)) state.sessions[id] = { ...state.sessions[id], busy: false };
    if (state.status.state !== "idle") state.status = { state: "idle" };
    emit();
    if (e.code === 4401 || e.code === 4403) { emitBus("unauthorized"); return; }
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (!wanted) return;
  const delay = Math.min(30000, 600 * 2 ** Math.min(retry++, 6)) + Math.random() * 400;
  state.retryIn = Math.round(delay / 1000);
  emit();
  setTimeout(() => { if (wanted) connect(); }, delay);
}

export function disconnect() {
  wanted = false;
  try { ws?.close(); } catch { /* */ }
  ws = null;
}

export function send(m: unknown): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(m));
    return true;
  }
  return false;
}

function pushActivity(a: Activity) {
  state.activity = [a, ...state.activity.filter((x) => x.id !== a.id)].slice(0, 60);
}

function onMsg(m: any) {
  const sid: string = m.sessionId || state.sessionId;
  switch (m.type) {
    case "ready":
      if (m.sessionId) state.sessionId = m.sessionId;
      if (m.state) emitBus("state", m.state);
      break;
    case "user":
      // The dashboard already shows its own messages optimistically; echo only other sources.
      if (m.source !== "dashboard") setItems(sid, (items) => [...items, { kind: "user", id: m.id || uid(), text: m.text, source: m.source }], { busy: true });
      break;
    case "thinking":
      setItems(sid, (items) => {
        const last = items[items.length - 1];
        if (last?.kind === "thinking" && last.streaming) return [...items.slice(0, -1), { ...last, text: last.text + (m.delta ?? "") }];
        return [...closeStreams(items), { kind: "thinking", id: uid(), text: m.delta ?? "", streaming: true }];
      }, { busy: true });
      break;
    case "delta":
      setItems(sid, (items) => {
        const last = items[items.length - 1];
        if (last?.kind === "assistant" && last.streaming) return [...items.slice(0, -1), { ...last, text: last.text + (m.text ?? "") }];
        return [...closeStreams(items), { kind: "assistant", id: m.id || uid(), text: m.text ?? "", streaming: true }];
      }, { busy: true });
      break;
    case "tool_start": {
      const t: ToolItem = { kind: "tool", id: m.callId || uid(), name: m.name, label: m.label, args: m.args, state: "running", startedAt: Date.now() };
      setItems(sid, (items) => [...closeStreams(items), t], { busy: true });
      pushActivity({ id: t.id, ts: Date.now(), name: t.name, label: m.label || m.name, state: "running" });
      emitBus("tool", { name: m.name, state: "running" });
      break;
    }
    case "tool_end":
      setItems(sid, (items) => items.map((x) => (x.kind === "tool" && x.id === m.callId ? { ...x, state: m.ok ? "ok" : "error", summary: m.summary, result: m.result, endedAt: Date.now() } : x)));
      {
        const prev = state.activity.find((a) => a.id === m.callId);
        pushActivity({ id: m.callId || uid(), ts: Date.now(), name: prev?.name ?? "tool", label: prev?.label ?? "tool", state: m.ok ? "ok" : "error", summary: m.summary });
        emitBus("tool", { name: prev?.name, state: m.ok ? "ok" : "error" });
      }
      break;
    case "turn_done":
      setItems(sid, (items) => [...closeStreams(items).map((x) => (x.kind === "tool" && x.state === "running" ? { ...x, state: "ok" as const } : x)), { kind: "turn", id: uid(), usage: m.usage, model: m.model }], { busy: false });
      if (m.usage) state.spend = { input: state.spend.input + (m.usage.input || 0), output: state.spend.output + (m.usage.output || 0), costUsd: state.spend.costUsd + (m.usage.costUsd || 0) };
      break;
    case "error":
      setItems(sid, (items) => [...closeStreams(items), { kind: "error", id: uid(), text: m.message }], { busy: false });
      break;
    case "approval_request": {
      const a = m as Approval;
      state.approvals = [...state.approvals.filter((x) => x.id !== a.id), a];
      setItems(sid, (items) => [...closeStreams(items), { kind: "approval", id: a.id, approval: a }]);
      emitBus("approval", a);
      break;
    }
    case "media_job":
      state.media = { ...state.media, [m.id]: m as MediaJob };
      emitBus("media", m);
      break;
    case "notice":
      setItems(sid, (items) => [...items, { kind: "notice", id: uid(), text: m.text, level: m.level }]);
      emitBus("notice", m);
      break;
    case "agent_status":
      state.status = { state: m.state, detail: m.detail };
      break;
    case "ui":
      uiHandler?.(m as UiOp);
      return;
    case "pong":
      return;
    default:
      return;
  }
  emit();
}

export const agent = {
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  get: () => state,
  connected: () => ws?.readyState === WebSocket.OPEN,
  onUi(f: (op: UiOp) => void) { uiHandler = f; },
  onOpen(f: () => void) { openHandlers.add(f); return () => { openHandlers.delete(f); }; },
  /** Send a chat message. Images are data URLs or upload URLs. */
  chat(text: string, images: string[] = []) {
    const sid = state.sessionId;
    setItems(sid, (items) => [...items, { kind: "user", id: uid(), text, ...(images.length ? { images } : {}), source: "dashboard" }], { busy: true });
    emit();
    if (!send({ type: "chat", sessionId: sid, text, ...(images.length ? { images } : {}) })) {
      setItems(sid, (items) => [...items, { kind: "error", id: uid(), text: "Not connected to Lumen. Start it with `lumen dashboard` — reconnecting…" }], { busy: false });
      emit();
      connect();
    }
  },
  stop() {
    send({ type: "stop", sessionId: state.sessionId });
    setItems(state.sessionId, (items) => closeStreams(items), { busy: false });
    emit();
  },
  answer(id: string, approve: boolean, answer?: string) {
    send({ type: "approval", id, approve, ...(answer ? { answer } : {}) });
    state.approvals = state.approvals.filter((a) => a.id !== id);
    for (const sid of Object.keys(state.sessions)) {
      setItems(sid, (items) => items.map((x) => (x.kind === "approval" && x.id === id ? { ...x, answered: answer || (approve ? "Approved" : "Rejected") } : x)));
    }
    emit();
  },
  setApprovals(list: Approval[]) { state.approvals = list; emit(); },
  markApprovalAnswered(id: string, label: string) {
    state.approvals = state.approvals.filter((a) => a.id !== id);
    for (const sid of Object.keys(state.sessions)) setItems(sid, (items) => items.map((x) => (x.kind === "approval" && x.id === id ? { ...x, answered: label } : x)));
    emit();
  },
  /** Load a saved session timeline (from GET /api/sessions/:id) and make it current. */
  loadSession(id: string, items: Item[]) {
    state.sessionId = id;
    setItems(id, () => items, { busy: false });
    emit();
  },
  newSession() {
    state.sessionId = uid("s");
    emit();
  },
  setMedia(list: MediaJob[]) {
    const media: Record<string, MediaJob> = {};
    for (const j of list) media[j.id] = j;
    state.media = { ...media, ...Object.fromEntries(Object.entries(state.media).filter(([k]) => !media[k])) };
    emit();
  },
  upsertMedia(job: MediaJob) { state.media = { ...state.media, [job.id]: job }; emit(); },
  /** Local-only status changes (demo takeover drives the orb without a server). */
  setStatus(s: AgentState, detail?: string) { state.status = { state: s, detail }; emit(); },
  localActivity(name: string, label: string, st: Activity["state"] = "ok", summary?: string) {
    pushActivity({ id: uid("a"), ts: Date.now(), name, label, state: st, summary });
    emit();
  },
  localNotice(text: string) {
    setItems(state.sessionId, (items) => [...items, { kind: "notice", id: uid(), text }]);
    emit();
  },
};

export function useAgent() {
  return useSyncExternalStore(agent.subscribe, agent.get, agent.get);
}
