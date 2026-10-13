import { createStore, uid } from "./store";

export type Toast = { id: string; level: "info" | "ok" | "warn" | "bad"; text: string; action?: { label: string; run: () => void } };
export const toasts = createStore<{ list: Toast[] }>({ list: [] });

export function toast(text: string, level: Toast["level"] = "info", action?: Toast["action"], ms = 4200) {
  const t: Toast = { id: uid("t"), level, text, action };
  toasts.set((s) => ({ list: [...s.list.slice(-4), t] }));
  setTimeout(() => dismiss(t.id), ms);
  return t.id;
}
export const dismiss = (id: string) => toasts.set((s) => ({ list: s.list.filter((t) => t.id !== id) }));
